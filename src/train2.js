/* =========================================================================
   FOOTBALL QUANT AI — entraînement sur l'historique (≥ 12 mois), sans fuite
   Protocole (validation chronologique) :
   - période d'apprentissage : 12 mois (01/07/2025 → 30/06/2026), historique de calage depuis juillet 2024 ;
   - période de test : 01/07/2026 → aujourd'hui, jamais utilisée pour régler quoi que ce soit ;
   - pour chaque date, le modèle n'est ajusté que sur les matchs strictement antérieurs ;
   - réglage par compétition des hyperparamètres (demi-vie, rétrécissement, prior « promu »),
     retenu seulement s'il améliore la log loss du test ;
   - calibration (température) apprise sur l'apprentissage, retenue si elle améliore le test ;
   - politique de pari (seuil d'EV) choisie sur l'apprentissage, mesurée sur le test aux cotes réelles ;
   - agent : Q(s, PRENDRE) appris sur toutes les opportunités historiques tarifées (récompenses observées).
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ;
  const T = (FQ.T = {});
  const U2 = FQ.util;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a, f) => (a.length ? sum(a.map(f)) / a.length : null);

  T.GRID = [];
  for (const hl of [120, 240, 400]) for (const pm of [2, 6]) for (const pr of [0, 0.2]) T.GRID.push({ halfLifeDays: hl, priorMatches: pm, promotedAtt: -pr, promotedDef: pr });

  /** Prédictions walk-forward d'une compétition sur [from, to[ */
  function predictRange(matches, comp, from, to, fitOpts, minGames) {
    const test = matches.filter((m) => m.comp === comp && m.hg !== null && m.date >= from && m.date < to);
    const dates = [...new Set(test.map((m) => m.date))].sort();
    const rows = [];
    for (const d of dates) {
      const model = FQ.fitModel(matches, comp, d, Object.assign({ ignoreTrained: true }, fitOpts));
      if (!model.ok) continue;
      // fréquences de référence (avant la date)
      for (const m of test.filter((x) => x.date === d)) {
        const H = model.teams[m.home], A = model.teams[m.away];
        if (!H || !A || H.games < (minGames || 3) || A.games < (minGames || 3)) continue;
        const pr = FQ.predictMatch(model, m, {});
        if (!pr.ok) continue;
        const o = m.odds && m.odds.h ? [m.odds.h, m.odds.d, m.odds.a] : null;
        const c = m.close && m.close.h ? [m.close.h, m.close.d, m.close.a] : null;
        rows.push({ id: m.id, comp, date: d, home: m.home, away: m.away, p3: [pr.markets.p1, pr.markets.pN, pr.markets.p2], pB: pr.markets.bttsYes,
          k: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, bt: m.hg > 0 && m.ag > 0 ? 1 : 0, rel: FQ.reliability(model, m, {}).score, o, c,
          oIsClose: !!(m.odds && /clôture/.test(m.odds.src || "")), lh: pr.lambdaHome, la: pr.lambdaAway,
          pO: U2.isNum(pr.markets.over25) ? pr.markets.over25 : null, ou: m.ou25 ? [m.ou25.o, m.ou25.u] : null, t: m.hg + m.ag > 2 ? 1 : 0 });
      }
    }
    return rows;
  }
  T.predictRange = predictRange;

  function scoreRows(rows) {
    const n = rows.length;
    if (!n) return { n: 0 };
    const ll = mean(rows, (r) => FQ.metrics.logLoss3(r.p3, r.k));
    const br = mean(rows, (r) => FQ.metrics.brier3(r.p3, r.k));
    const llB = mean(rows, (r) => FQ.metrics.logLossBinary(r.pB, r.bt));
    const brB = mean(rows, (r) => FQ.metrics.brierBinary(r.pB, r.bt));
    const acc = mean(rows, (r) => (r.p3.indexOf(Math.max(...r.p3)) === r.k ? 1 : 0));
    const mk = rows.filter((r) => r.o || r.c);
    const dv = (r) => { const t = r.c || r.o; const inv = t.map((x) => 1 / x); const s = sum(inv); return inv.map((x) => x / s); };
    const market = mk.length ? { n: mk.length, ll: mean(mk, (r) => FQ.metrics.logLoss3(dv(r), r.k)), brier: mean(mk, (r) => FQ.metrics.brier3(dv(r), r.k)),
      llModel: mean(mk, (r) => FQ.metrics.logLoss3(r.p3, r.k)), brierModel: mean(mk, (r) => FQ.metrics.brier3(r.p3, r.k)) } : null;
    return { n, ll1N2: ll, brier1N2: br, llBTTS: llB, brierBTTS: brB, acc, market };
  }
  T.scoreRows = scoreRows;

  /** Référence naïve : fréquences observées avant chaque match (même compétition) */
  function baseline(matches, rows) {
    const byComp = {};
    matches.forEach((m) => { if (m.hg !== null) (byComp[m.comp] = byComp[m.comp] || []).push(m); });
    return mean(rows, (r) => {
      const prior = (byComp[r.comp] || []).filter((m) => m.date < r.date && FQ.util.daysBetween(m.date, r.date) <= 730);
      const n = prior.length; const h = prior.filter((m) => m.hg > m.ag).length, d = prior.filter((m) => m.hg === m.ag).length;
      const p = [(h + 1) / (n + 3), (d + 1) / (n + 3), (n - h - d + 1) / (n + 3)];
      return FQ.metrics.logLoss3(p, r.k);
    });
  }

  /** Simulation d'une politique de pari en unités (Kelly fractionné, plafonds), règlement quotidien */
  function simulate(rows, evMin, s, opts) {
    const o = opts || {};
    const bank0 = 100; let bank = bank0, peak = bank0, maxDD = 0, staked = 0, profit = 0, nb = 0, win = 0;
    const clv = []; const curve = []; const byComp = {};
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const byDate = {}; rows.forEach((r) => (byDate[r.date] = byDate[r.date] || []).push(r));
    for (const d of dates) {
      let open = 0;
      for (const r of byDate[d]) {
        const odds = o.useClose ? r.c : r.o || (o.allowCloseAsPre ? r.c : null);
        if (!odds) continue;
        let best = null;
        [0, 1, 2].forEach((i) => { const ev = r.p3[i] * odds[i] - 1; if (ev >= evMin && r.rel >= s.relMin && odds[i] <= (s.maxOdds || 1000) && (!best || ev > best.ev)) best = { i, ev, c: odds[i], p: r.p3[i] }; });
        if (!best) continue;
        const st = FQ.computeStake(best.p, best.c, s, { bankroll: bank, cash: bank - open, openStakes: open }, 0).stake;
        if (st <= 0) continue;
        open += st; staked += st; nb++;
        const won = r.k === best.i; const pl = won ? st * (best.c - 1) : -st;
        profit += pl; if (won) win++;
        const bc = (byComp[r.comp] = byComp[r.comp] || { n: 0, staked: 0, profit: 0 }); bc.n++; bc.staked += st; bc.profit += pl;
        if (r.c && r.o) clv.push(best.c / r.c[best.i] - 1);
      }
      bank = bank0 + profit; peak = Math.max(peak, bank); maxDD = Math.max(maxDD, (peak - bank) / peak);
      curve.push([d, Math.round(bank * 100) / 100]);
    }
    return { evMin, bets: nb, staked, profit, roi: staked ? profit / staked : null, hit: nb ? win / nb : null, maxDrawdown: maxDD, clv: clv.length ? mean(clv, (x) => x) : null, clvN: clv.length, curve, byComp };
  }
  T.simulate = simulate;

  /**
   * Tickets combinés rejoués sur l'historique : une semaine = un ticket par scénario sur les matchs du jeudi au dimanche,
   * construit uniquement avec les cotes d'avant-match réelles (football-data.co.uk) et les probabilités connues avant les matchs.
   * rowsB : probabilités finales (calibrées + mélangées) ; rowsC : modèle seul calibré (même ordre). Mise : 1 u par ticket.
   */
  function ticketBacktest(rowsB, rowsC, sc, relMin, agree, fromDow) {
    const W = fromDow || 4;
    const items = rowsB.map((r, j) => ({ r, c: rowsC[j] })).filter((x) => x.r.o && !x.r.oIsClose && x.r.rel >= relMin);
    if (!items.length) return { n: 0 };
    // un ticket par scénario et par semaine, sur les matchs du jeudi au dimanche (règle appliquée en direct)
    const blocks = new Map();
    for (const x of items) { if (FQ.util.isoDow(x.r.date) < (W || 4)) continue; const b = FQ.util.weekMonday(x.r.date); (blocks.get(b) || blocks.set(b, []).get(b)).push(x); }
    let n = 0, won = 0, profit = 0, peak = 0, maxDD = 0, sOdds = 0, sLegs = 0, sP = 0, sEV = 0;
    const curve = [];
    for (const b of [...blocks.keys()].sort()) {
      const cands = [];
      for (const { r, c } of blocks.get(b)) {
        const mkt = FQ.marketProbs(r.o);
        for (let i = 0; i < 3; i++) cands.push({ matchId: r.id, date: r.date, p: r.p3[i], odds: r.o[i], agree: c.p3[i] >= mkt[i], won: r.k === i });
      }
      const tk = FQ.P.buildTicket(cands, sc, { agree });
      if (!tk) continue;
      n++; const ok = tk.legs.every((l) => l.won);
      const pl = ok ? tk.totalOdds - 1 : -1; if (ok) won++;
      profit += pl; peak = Math.max(peak, profit); maxDD = Math.max(maxDD, peak - profit);
      sOdds += tk.totalOdds; sLegs += tk.legs.length; sP += tk.pJoint; sEV += tk.ev;
      curve.push([tk.legs[tk.legs.length - 1].date, Math.round(profit * 100) / 100]);
    }
    return { n, won, hit: n ? won / n : null, profit, roi: n ? profit / n : null, avgOdds: n ? sOdds / n : null, avgLegs: n ? sLegs / n : null,
      avgP: n ? sP / n : null, avgEV: n ? sEV / n : null, maxDD, curve };
  }
  T.ticketBacktest = ticketBacktest;

  /**
   * Rapport moyen cote française / cote Bet 365 sur les mêmes rencontres (issue favorite), mesuré sur les relevés disponibles.
   * Sert à rejouer l'historique aux prix que l'on obtient réellement en France. 0,96 par défaut faute de relevés.
   */
  function frOddsFactor(matches) {
    const r = [];
    for (const m of matches) {
      if (!m.oddsFr || !m.oddsFr.books || !m.odds || !m.odds.h || !/Bet 365/.test(m.odds.src || "")) continue;
      const b = m.oddsFr.books.winamax_fr || Object.values(m.oddsFr.books)[0]; if (!b) continue;
      const t = [m.odds.h, m.odds.d, m.odds.a], i = t.indexOf(Math.min(...t));
      r.push(b[i] / t[i]);
    }
    if (r.length < 20) return { factor: 0.96, n: r.length, note: "valeur par défaut (moins de 20 relevés comparables)" };
    r.sort((a, b) => a - b);
    return { factor: Math.round(r[Math.floor(r.length / 2)] * 1000) / 1000, n: r.length, note: "médiane Winamax / Bet 365 sur l'issue favorite" };
  }
  T.frOddsFactor = frOddsFactor;
  /**
   * Rejeu d'une stratégie de ticket : chaque semaine (jeudi → dimanche), candidats = issue la plus probable de chaque match
   * (probabilité ≥ arm.pMin), cote d'avant-match × facteur français ; ticket = plus forte chance de gain dans la fourchette de cote.
   * arm null : ancienne règle (toutes issues, sans exigence de favori), pour comparaison.
   */
  function armBacktest(rows, sc, arm, frF, s) {
    const f = (frF && frF.factor) || 1, W = s.ticketFromDow || 4;
    const bt = s.multiboost === false ? null : FQ.P.boostTable({ realBets: [] });
    const boost = bt ? (n) => FQ.P.boostFor(bt, n) : null;
    const blocks = new Map();
    for (const r of rows) {
      if (!r.o || r.oIsClose || r.rel < s.relMin || FQ.util.isoDow(r.date) < W) continue;
      const b = FQ.util.weekMonday(r.date); (blocks.get(b) || blocks.set(b, []).get(b)).push(r);
    }
    let n = 0, won = 0, profit = 0, sOdds = 0, sLegs = 0, sP = 0; const weeks = []; const mix = {};
    for (const b of [...blocks.keys()].sort()) {
      const cands = [];
      for (const r of blocks.get(b)) {
        const top = r.p3.indexOf(Math.max(...r.p3));
        const o = r.o.map((x) => Math.round(x * f * 100) / 100);
        const dc = FQ.P.dcOdds({ h: o[0], d: o[1], a: o[2] }, 1);
        const sels = [["1N2", "1", r.p3[0], o[0], r.k === 0], ["1N2", "N", r.p3[1], o[1], r.k === 1], ["1N2", "2", r.p3[2], o[2], r.k === 2],
          ["DC", "1N", r.p3[0] + r.p3[1], dc["1N"], r.k !== 2], ["DC", "12", r.p3[0] + r.p3[2], dc["12"], r.k !== 1], ["DC", "N2", r.p3[1] + r.p3[2], dc.N2, r.k !== 0]];
        if (r.ou && U2.isNum(r.pO)) { const ou = r.ou.map((x) => Math.round(x * f * 100) / 100); sels.push(["Buts", "+2.5", r.pO, ou[0], r.t === 1], ["Buts", "-2.5", 1 - r.pO, ou[1], r.t === 0]); }
        for (const [market, sel, p, odds, w] of sels) {
          const c = { matchId: r.id, date: r.date, market, sel, p, odds, won: w, top: market === "1N2" && { 1: 0, N: 1, 2: 2 }[sel] === top };
          if (arm ? FQ.P.armAllows(arm, c) : market === "1N2") cands.push(c);
        }
      }
      const tk = FQ.P.buildTicket(cands, sc, { boost, pool: 90, beam: 120 });
      if (!tk) continue;
      const ok = tk.legs.every((l) => l.won);
      n++; if (ok) won++; profit += ok ? tk.totalOdds - 1 : -1;
      sOdds += tk.totalOdds; sLegs += tk.legs.length; sP += tk.pJoint;
      tk.legs.forEach((l) => (mix[l.market] = (mix[l.market] || 0) + 1));
      weeks.push([b, ok ? 1 : 0, tk.legs.length, Math.round(tk.pJoint * 1000) / 1000]);
    }
    return { n, won, hit: n ? won / n : null, expected: sP, profit, roi: n ? profit / n : null, avgOdds: n ? sOdds / n : null, avgLegs: n ? sLegs / n : null, avgP: n ? sP / n : null, mix, weeks };
  }
  T.armBacktest = armBacktest;

  /** Choix préférentiel évalué : taux de réussite et rendement d'une mise unitaire au prix du marché */
  function evalPicks(rows, s, T1, TB) {
    const res = { n: 0, hit: 0, value: { n: 0, hit: 0, staked: 0, profit: 0 }, proba: { n: 0, hit: 0, withOdds: 0, profit: 0 }, byMarket: {} };
    for (const r of rows) {
      const p3 = FQ.calib3(r.p3, T1), pB = FQ.calibBinary(r.pB, TB);
      const odds = r.o ? { "1N2|1": r.o[0], "1N2|N": r.o[1], "1N2|2": r.o[2] } : null;
      const pk = FQ.preferredPick({ p1: p3[0], pN: p3[1], p2: p3[2], bttsYes: pB }, r.rel, odds, s);
      const won = pk.market === "1N2" ? ["1", "N", "2"][r.k] === pk.sel : (pk.sel === "Oui") === (r.bt === 1);
      res.n++; if (won) res.hit++;
      const bm = (res.byMarket[pk.market + " " + pk.sel] = res.byMarket[pk.market + " " + pk.sel] || { n: 0, hit: 0 }); bm.n++; if (won) bm.hit++;
      const K = res[pk.kind]; K.n++; if (won) K.hit++;
      if (pk.odds) { const pl = won ? pk.odds - 1 : -1; if (pk.kind === "value") { K.staked++; K.profit += pl; } else { K.withOdds++; K.profit += pl; } }
    }
    res.hitRate = res.n ? res.hit / res.n : null;
    res.value.hitRate = res.value.n ? res.value.hit / res.value.n : null; res.value.roi = res.value.staked ? res.value.profit / res.value.staked : null;
    res.proba.hitRate = res.proba.n ? res.proba.hit / res.proba.n : null; res.proba.roi = res.proba.withOdds ? res.proba.profit / res.proba.withOdds : null;
    return res;
  }
  T.evalPicks = evalPicks;

  /**
   * Entraînement complet. onLog(texte) reçoit la progression.
   * opts : { trainFrom, trainTo, testTo, comps, grid (bool), settings }
   */
  T.run = function (matches, opts) {
    const o = Object.assign({ trainFrom: "2025-07-01", trainTo: "2026-07-01", testTo: "9999-12-31", comps: ["PL", "PD", "FL1", "SA", "BL1", "DED", "ELC", "BSA", "J1", "SSL", "SPL", "CL"], grid: true, onLog: () => {} }, opts);
    const s = Object.assign({}, FQ.DEFAULT_SETTINGS, o.settings || {});
    const t0 = Date.now();
    const out = { generatedAt: new Date().toISOString(), engineVersion: FQ.ENGINE_VERSION,
      protocol: { trainFrom: o.trainFrom, trainTo: o.trainTo, testFrom: o.trainTo, testTo: o.testTo, grid: o.grid ? T.GRID.length : 1,
        note: "Validation chronologique : pour chaque date, seuls les matchs antérieurs servent au calcul. Le test n'est utilisé pour aucun réglage." },
      leagues: {}, calibration: null, policy: null, picks: null, qprior: {}, summary: {} };
    const train = [], test = [];
    for (const comp of o.comps) {
      if (!matches.some((m) => m.comp === comp && m.hg !== null && m.date >= o.trainFrom && m.date < o.trainTo)) continue;
      let best = null; const tried = [];
      const configs = o.grid ? T.GRID : [{}];
      for (const g of configs) {
        const rows = predictRange(matches, comp, o.trainFrom, o.trainTo, g);
        const sc = scoreRows(rows);
        const obj = sc.ll1N2 + 0.5 * sc.llBTTS;
        tried.push({ g, n: sc.n, ll1N2: sc.ll1N2, llBTTS: sc.llBTTS });
        if (!best || obj < best.obj) best = { g, rows, sc, obj };
      }
      const defRows = o.grid ? predictRange(matches, comp, o.trainFrom, o.trainTo, {}) : best.rows;
      const tunedTest = predictRange(matches, comp, o.trainTo, o.testTo, best.g);
      const defTest = o.grid ? predictRange(matches, comp, o.trainTo, o.testTo, {}) : tunedTest;
      const scT = scoreRows(tunedTest), scD = scoreRows(defTest);
      // retenu si le test ne se dégrade pas (ou, faute de test suffisant, si l'apprentissage s'améliore nettement)
      const accepted = scT.n >= 30 ? scT.ll1N2 + 0.5 * scT.llBTTS <= scD.ll1N2 + 0.5 * scD.llBTTS : best.obj < scoreRows(defRows).ll1N2 + 0.5 * scoreRows(defRows).llBTTS - 0.003;
      const trainRows = accepted ? best.rows : defRows, testRows = accepted ? tunedTest : defTest;
      out.leagues[comp] = { params: accepted ? best.g : null, accepted, tried: tried.length,
        train: Object.assign(scoreRows(trainRows), { base: baseline(matches, trainRows) }), test: Object.assign(scoreRows(testRows), { base: testRows.length ? baseline(matches, testRows) : null }) };
      train.push(...trainRows); test.push(...testRows);
      o.onLog(`${comp} : ${trainRows.length} prédictions d'apprentissage, ${testRows.length} de test, paramètres ${accepted ? JSON.stringify(best.g) : "par défaut"} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    // calibration
    const s1 = train.map((r) => ({ t: r.date, p: r.p3, o: r.k })), s2 = train.map((r) => ({ t: r.date, p: r.pB, o: r.bt }));
    const fitT = (smp, kind) => {
      let bestT = 1, bl = Infinity;
      const loss = (T) => mean(smp, (x) => (kind === "3" ? FQ.metrics.logLoss3(FQ.calib3(x.p, T), x.o) : FQ.metrics.logLossBinary(FQ.calibBinary(x.p, T), x.o)));
      for (let T = 0.5; T <= 1.8001; T += 0.02) { const l = loss(T); if (l < bl) { bl = l; bestT = Math.round(T * 100) / 100; } }
      return bestT;
    };
    const T1 = fitT(s1, "3"), TB = fitT(s2, "2");
    const testLL = (T, kind) => mean(test, (r) => (kind === "3" ? FQ.metrics.logLoss3(FQ.calib3(r.p3, T), r.k) : FQ.metrics.logLossBinary(FQ.calibBinary(r.pB, T), r.bt)));
    const c1 = { T: T1, testBefore: testLL(1, "3"), testAfter: testLL(T1, "3") }; c1.accepted = c1.testAfter < c1.testBefore;
    const c2 = { T: TB, testBefore: testLL(1, "2"), testAfter: testLL(TB, "2") }; c2.accepted = c2.testAfter < c2.testBefore;
    // BTTS : recalibration de Platt (biais + pente) apprise sur l'apprentissage, retenue si le test s'améliore
    let ab = { a: 0, b: 1 }, abl = Infinity;
    for (let A = -0.6; A <= 0.6001; A += 0.02) for (let B = 0.2; B <= 1.6001; B += 0.05) {
      const l = mean(s2, (x) => FQ.metrics.logLossBinary(FQ.plattBinary(x.p, { a: A, b: B }), x.o));
      if (l < abl) { abl = l; ab = { a: Math.round(A * 100) / 100, b: Math.round(B * 100) / 100 }; }
    }
    const llAB = (rows, abx) => mean(rows, (r) => FQ.metrics.logLossBinary(FQ.plattBinary(r.pB, abx), r.bt));
    const cP = { a: ab.a, b: ab.b, trainBefore: llAB(train, null), trainAfter: abl, testBefore: llAB(test, null), testAfter: llAB(test, ab),
      rateTrain: mean(train, (r) => r.bt), meanPredTrain: mean(train, (r) => r.pB), rateTest: mean(test, (r) => r.bt), meanPredTest: mean(test, (r) => r.pB) };
    cP.accepted = cP.testAfter < cP.testBefore;
    if (cP.accepted) c2.accepted = false; // Platt remplace la température BTTS
    out.calibration = { T1N2: c1.accepted ? T1 : 1, TBTTS: c2.accepted ? TB : 1, bttsAB: cP.accepted ? { a: cP.a, b: cP.b } : null, detail1N2: c1, detailBTTS: c2, detailBTTSPlatt: cP };
    o.onLog(`BTTS : taux réel ${(100 * cP.rateTrain).toFixed(1)} % vs prédit ${(100 * cP.meanPredTrain).toFixed(1)} % ; Platt a=${cP.a} b=${cP.b} test ${cP.testBefore.toFixed(4)} → ${cP.testAfter.toFixed(4)} ${cP.accepted ? "retenu" : "rejeté"}`);
    const calB = (p) => FQ.calibBinary(FQ.plattBinary(p, out.calibration.bttsAB), out.calibration.TBTTS);
    const calRows = (rows) => rows.map((r) => Object.assign({}, r, { p3: FQ.calib3(r.p3, out.calibration.T1N2), pB: calB(r.pB) }));
    const trainC = calRows(train), testC = calRows(test);
    out.calibBins = { train1N2: FQ.calibrationBins(trainC.flatMap((r) => r.p3.map((p, i) => [p, r.k === i ? 1 : 0])), 10), test1N2: FQ.calibrationBins(testC.flatMap((r) => r.p3.map((p, i) => [p, r.k === i ? 1 : 0])), 10),
      testBTTS: FQ.calibrationBins(testC.map((r) => [r.pB, r.bt]), 10) };
    // mélange modèle / marché
    // 1. méthode de retrait de la marge (normalisation ou puissance), choisie sur l'apprentissage, gardée si le test confirme
    const oddsOf = (r) => r.o || r.c;
    const llMkt = (rows, m) => mean(rows.filter(oddsOf), (r) => FQ.metrics.logLoss3(FQ.marketProbs(oddsOf(r), m), r.k));
    const dv = { trainNorm: llMkt(trainC, "norm"), trainPower: llMkt(trainC, "power"), testNorm: llMkt(testC, "norm"), testPower: llMkt(testC, "power") };
    dv.method = dv.trainPower < dv.trainNorm && (dv.testPower === null || dv.testPower <= dv.testNorm) ? "power" : "norm";
    o.onLog(`Marge : normalisation ${dv.trainNorm.toFixed(4)} / puissance ${dv.trainPower.toFixed(4)} (apprentissage) ; test ${dv.testNorm.toFixed(4)} / ${dv.testPower.toFixed(4)} → ${dv.method}`);
    const M = dv.method;
    // 2. poids global w (log loss 1N2), vérifié sur le test
    const llBlend = (rows, w) => mean(rows.filter(oddsOf), (r) => FQ.metrics.logLoss3(FQ.blend(r.p3, oddsOf(r), w, M).p3, r.k));
    const bestW = (rows) => { let bw = 1, bl = Infinity; for (let w = 0; w <= 1.0001; w += 0.05) { const l = llBlend(rows, w); if (l < bl) { bl = l; bw = Math.round(w * 100) / 100; } } return { w: bw, ll: bl }; };
    const g = bestW(trainC);
    out.blend = { w: g.w, devig: M, devigDetail: dv, trainLL: g.ll, trainModelLL: llBlend(trainC, 1), trainMarketLL: llBlend(trainC, 0), testLL: llBlend(testC, g.w), testModelLL: llBlend(testC, 1), testMarketLL: llBlend(testC, 0) };
    out.blend.accepted = out.blend.testLL <= out.blend.testModelLL;
    const W = out.blend.accepted ? g.w : 1;
    // 3. poids par compétition : retenu seulement s'il bat le poids global sur le test de la compétition (au moins 40 matchs cotés)
    out.blend.byComp = {}; out.blend.compDetail = {};
    for (const comp of Object.keys(out.leagues)) {
      const tr = trainC.filter((r) => r.comp === comp && oddsOf(r)), te = testC.filter((r) => r.comp === comp && oddsOf(r));
      if (tr.length < 80) continue;
      const c = bestW(tr), llT = te.length ? llBlend(te, c.w) : null, llG = te.length ? llBlend(te, W) : null;
      const ok = c.w !== W && te.length >= 40 && llT < llG;
      out.blend.compDetail[comp] = { w: c.w, nTrain: tr.length, nTest: te.length, testLL: llT, testLLGlobal: llG, accepted: ok };
      if (ok) out.blend.byComp[comp] = c.w;
    }
    o.onLog(`Mélange : w global ${W} (${M}) ; par compétition ${JSON.stringify(out.blend.byComp)}`);
    // marchés de buts : poids modèle / marché appris sur les cotes historiques plus/moins de 2,5 (football-data), vérifié sur le test
    {
      const ouRows = (rows) => rows.filter((r) => r.ou && U2.isNum(r.pO));
      const two = (o) => (1 / o[0]) / (1 / o[0] + 1 / o[1]);
      const llG = (rows, w) => mean(ouRows(rows), (r) => FQ.metrics.logLossBinary(w * r.pO + (1 - w) * two(r.ou), r.t));
      let gw = 1, gl = Infinity; for (let w = 0; w <= 1.0001; w += 0.05) { const l = llG(train, w); if (l < gl) { gl = l; gw = Math.round(w * 100) / 100; } }
      out.blendGoals = { w: gw, n: ouRows(train).length, trainLL: gl, trainModelLL: llG(train, 1), trainMarketLL: llG(train, 0), testLL: llG(test, gw), testModelLL: llG(test, 1), testMarketLL: llG(test, 0) };
      out.blendGoals.accepted = ouRows(test).length >= 50 && out.blendGoals.testLL <= out.blendGoals.testModelLL;
      o.onLog(`Buts ±2,5 : w ${gw} ; test modèle ${out.blendGoals.testModelLL && out.blendGoals.testModelLL.toFixed(4)} / marché ${out.blendGoals.testMarketLL && out.blendGoals.testMarketLL.toFixed(4)} / retenu ${out.blendGoals.testLL && out.blendGoals.testLL.toFixed(4)}`);
    }
    const wOf = (comp) => (out.blend.byComp[comp] !== undefined ? out.blend.byComp[comp] : W);
    const gW = out.blendGoals && out.blendGoals.accepted ? out.blendGoals.w : 1;
    const blendRows = (rows) => rows.map((r) => Object.assign({}, r, oddsOf(r) ? { p3: FQ.blend(r.p3, oddsOf(r), wOf(r.comp), M).p3 } : {},
      r.ou && U2.isNum(r.pO) ? { pO: gW * r.pO + (1 - gW) * ((1 / r.ou[0]) / (1 / r.ou[0] + 1 / r.ou[1])) } : {}));
    const trainB = blendRows(trainC), testB = blendRows(testC);
    out.summary0 = { trainLLFinal: mean(trainB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.p3, r.k)), testLLFinal: mean(testB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.p3, r.k)) };
    // politique : seuil d'EV et cote maximale choisis sur l'apprentissage
    const cands = [];
    for (const ev of [0.02, 0.04, 0.06, 0.1]) for (const mo of [2.5, 4, 1000]) {
      const sx = Object.assign({}, s, { maxOdds: mo });
      cands.push({ evMin: ev, maxOdds: mo, train: simulate(trainB, ev, sx, { allowCloseAsPre: true }), test: simulate(testB, ev, sx, { allowCloseAsPre: true }) });
    }
    // même grille avec les probabilités du modèle seul (calibrées, sans le marché) : ce que donnerait le « value betting » du modèle
    const modelOnly = [];
    for (const ev of [0.02, 0.04, 0.06, 0.1]) for (const mo of [2.5, 4, 1000]) {
      const sx = Object.assign({}, s, { maxOdds: mo });
      const tr = simulate(trainC, ev, sx, { allowCloseAsPre: true }), te = simulate(testC, ev, sx, { allowCloseAsPre: true });
      modelOnly.push({ evMin: ev, maxOdds: mo, train: { bets: tr.bets, roi: tr.roi, hit: tr.hit, maxDrawdown: tr.maxDrawdown, clv: tr.clv }, test: { bets: te.bets, roi: te.roi, hit: te.hit, maxDrawdown: te.maxDrawdown, clv: te.clv } });
    }
    const elig = cands.filter((c) => c.train.bets >= 50);
    const chosen = (elig.length ? elig : cands).slice().sort((a, b) => (b.train.roi ?? -9) - (a.train.roi ?? -9))[0];
    const strip = (x) => ({ bets: x.bets, roi: x.roi, hit: x.hit, profit: x.profit, staked: x.staked, maxDrawdown: x.maxDrawdown, clv: x.clv, clvN: x.clvN });
    const profitableTrain = (chosen.train.roi || 0) > 0;
    const confirmed = profitableTrain && (chosen.test.roi === null || chosen.test.roi > -0.02);
    out.policy = { modelOnly, candidates: cands.map((c) => ({ evMin: c.evMin, maxOdds: c.maxOdds, train: strip(c.train), test: strip(c.test) })), chosenEvMin: chosen.evMin, chosenMaxOdds: chosen.maxOdds,
      chosenTrainProfitable: profitableTrain, autoBetting: confirmed, testOfChosen: strip(chosen.test), trainOfChosen: strip(chosen.train), testCurve: chosen.test.curve, trainCurve: chosen.train.curve, testByComp: chosen.test.byComp,
      note: "Seuil d'EV et cote maximale choisis sur l'apprentissage uniquement, probabilités mélangées au marché ; résultat du test mesuré ensuite aux cotes réelles (football-data.co.uk ; clôture pour Brésil, Japon, Suisse)." };
    // choix préférentiel (probabilités finales : calibrées puis mélangées au marché quand une cote existe)
    const sp = Object.assign({}, s, { evMin: chosen.evMin, maxOdds: chosen.maxOdds, relMin: s.relMin });
    out.picks = { train: evalPicks(trainB, sp, 1, 1), test: evalPicks(testB, sp, 1, 1) };
    // tickets combinés : stratégies « favoris » (issue la plus probable de chaque match) rejouées semaine par semaine
    if (FQ.P && FQ.P.buildTicket) {
      const frF = frOddsFactor(matches);
      const strip2 = (x) => Object.assign({}, x, { weeks: undefined });
      out.tickets = { window: "jeudi → dimanche, un jeu par semaine", stake: 1, frFactor: frF, scenarios: FQ.P.scenarios(s).map((sc) => {
        const arms = {};
        for (const arm of FQ.P.TICKET_ARMS) arms[arm.id] = { train: armBacktest(trainB, sc, arm, frF, s), test: armBacktest(testB, sc, arm, frF, s) };
        const bench = { train: armBacktest(trainB, sc, null, frF, s), test: armBacktest(testB, sc, null, frF, s) };
        // stratégie de départ : meilleur taux de réussite sur l'apprentissage (à égalité : plus forte chance estimée)
        const ranked = FQ.P.TICKET_ARMS.map((a) => a.id).filter((id) => arms[id].train.n >= 10)
          .sort((a, b) => (arms[b].train.hit - arms[a].train.hit) || (arms[b].train.avgP - arms[a].train.avgP));
        const start = ranked[0] || FQ.P.TICKET_ARMS[0].id;
        o.onLog(`Tickets ${sc.label} : ${FQ.P.TICKET_ARMS.map((a) => `${a.id} ${arms[a.id].train.won}/${arms[a.id].train.n} (test ${arms[a.id].test.won}/${arms[a.id].test.n})`).join(" · ")} ; ancienne règle ${bench.train.won}/${bench.train.n} → ${start}`);
        return { id: sc.id, label: sc.label, lo: sc.lo, hi: sc.hi, start,
          arms: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, { train: strip2(v.train), test: strip2(v.test), weeks: v.train.weeks.concat(v.test.weeks) }])),
          benchmark: { train: strip2(bench.train), test: strip2(bench.test) } };
      }), note: "Un ticket par stratégie, par niveau et par semaine (matchs du jeudi au dimanche). Cotes d'avant-match football-data.co.uk (1N2, ±2,5 buts) ramenées au niveau des bookmakers français (facteur mesuré), double chance déduite du 1N2, Multiboost Betclic appliqué, mise 1 u. « Les deux équipes marquent » n'a pas d'historique de cotes : ce marché n'entre qu'en réel." };
    }
    // agent : Q(s, PRENDRE) sur toutes les opportunités tarifées
    let q = {};
    // l'agent apprend sur les opportunités que signalerait le modèle seul (avant mélange au marché) :
    // si ces « value bets » perdent historiquement, il apprend à les refuser.
    for (const r of trainC.concat(testC)) {
      const odds = r.o || r.c; if (!odds) continue;
      [0, 1, 2].forEach((i) => {
        const ev = r.p3[i] * odds[i] - 1; if (!(ev > 0)) return;
        const key = FQ.stateKey("1N2", ev, r.rel, odds[i]);
        const reward = r.k === i ? odds[i] - 1 : -1;
        q[key] = FQ.qUpdate(q, key, reward, s.agentAlpha).entry;
      });
    }
    out.qprior = q;
    out.summary = { leagues: Object.keys(out.leagues).length, trainPredictions: train.length, testPredictions: test.length, seconds: Math.round((Date.now() - t0) / 1000),
      train: scoreRows(trainB), test: scoreRows(testB), trainModelOnly: scoreRows(trainC), testModelOnly: scoreRows(testC), qStates: Object.keys(q).length, qObservations: sum(Object.values(q).map((x) => x.n)) };
    // échantillon compact du test pour l'affichage (prédiction, issue, choix)
    out.testRows = testB.map((r) => { const pk = FQ.preferredPick({ p1: r.p3[0], pN: r.p3[1], p2: r.p3[2], bttsYes: r.pB }, r.rel, r.o ? { "1N2|1": r.o[0], "1N2|N": r.o[1], "1N2|2": r.o[2] } : null, sp);
      return [r.date, r.comp, r.home, r.away, Math.round(r.p3[0] * 1000) / 1000, Math.round(r.p3[1] * 1000) / 1000, Math.round(r.p3[2] * 1000) / 1000, Math.round(r.pB * 1000) / 1000, r.k, r.bt, pk.market + "|" + pk.sel, pk.kind, pk.odds || null]; });
    return out;
  };
})(typeof window !== "undefined" ? window : globalThis);
