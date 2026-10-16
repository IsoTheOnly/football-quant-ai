/* =========================================================================
   FOOTBALL QUANT AI — entraînement sur l'historique (≥ 12 mois), sans fuite
   Protocole (validation chronologique, trois périodes) :
   - apprentissage : 01/07/2025 → 28/02/2026 (historique de calage depuis juillet 2024) ;
   - validation : 01/03/2026 → 30/06/2026 : décide si un réglage est gardé (hyperparamètres, calibration,
     poids modèle / marché, méthode de retrait de la marge) ;
   - test final : 01/07/2026 → aujourd'hui, jamais utilisé pour choisir quoi que ce soit, seulement mesuré ;
   - pour chaque date, le modèle n'est ajusté que sur les matchs strictement antérieurs ;
   - un réglage accepté sur la validation est réajusté sur apprentissage + validation, puis mesuré sur le test ;
   - tickets : stratégie de départ et prudence κ choisies sur apprentissage + validation ; test final mesuré
     avec intervalles de confiance (Wilson) ; le choix semaine par semaine (bandit) est rejoué sans regarder l'avenir ;
   - politique de pari (seuil d'EV) choisie sur apprentissage + validation, mesurée sur le test aux cotes réelles ;
   - agent : Q(s, PRENDRE) appris sur les opportunités historiques tarifées (récompenses observées).
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
  function armBacktest(rows, sc, arm, frF, s, kappa) {
    const f = (frF && frF.factor) || 1, W = s.ticketFromDow || 4, k = U2.isNum(kappa) ? kappa : 0;
    const bt = s.multiboost === false ? null : FQ.P.boostTable({ realBets: [] });
    const boost = bt ? (n) => FQ.P.boostFor(bt, n) : null;
    const blocks = new Map();
    for (const r of rows) {
      if (!r.o || r.oIsClose || r.rel < s.relMin || FQ.util.isoDow(r.date) < W) continue;
      const b = FQ.util.weekMonday(r.date); (blocks.get(b) || blocks.set(b, []).get(b)).push(r);
    }
    let n = 0, won = 0, profit = 0, sOdds = 0, sLegs = 0, sP = 0, nL = 0, wL = 0, yL = 0, eL = 0; const weeks = []; const mix = {}; const pl = [];
    const q3 = (r, idx) => ({ mk: r.pK3 ? idx.reduce((a, i) => a + r.pK3[i], 0) : null, mo: r.pM3 ? idx.reduce((a, i) => a + r.pM3[i], 0) : null });
    for (const b of [...blocks.keys()].sort()) {
      const cands = [];
      for (const r of blocks.get(b)) {
        const top = r.p3.indexOf(Math.max(...r.p3));
        const o = r.o.map((x) => Math.round(x * f * 100) / 100);
        const dc = FQ.P.dcOdds({ h: o[0], d: o[1], a: o[2] }, 1);
        const sels = [["1N2", "1", r.p3[0], o[0], r.k === 0, [0]], ["1N2", "N", r.p3[1], o[1], r.k === 1, [1]], ["1N2", "2", r.p3[2], o[2], r.k === 2, [2]],
          ["DC", "1N", r.p3[0] + r.p3[1], dc["1N"], r.k !== 2, [0, 1]], ["DC", "12", r.p3[0] + r.p3[2], dc["12"], r.k !== 1, [0, 2]], ["DC", "N2", r.p3[1] + r.p3[2], dc.N2, r.k !== 0, [1, 2]]];
        if (r.ou && U2.isNum(r.pO)) { const ou = r.ou.map((x) => Math.round(x * f * 100) / 100); sels.push(["Buts", "+2.5", r.pO, ou[0], r.t === 1, "o"], ["Buts", "-2.5", 1 - r.pO, ou[1], r.t === 0, "u"]); }
        for (const [market, sel, p, odds, w, idx] of sels) {
          const q = idx === "o" ? { mk: r.pOK, mo: r.pOM } : idx === "u" ? { mk: U2.isNum(r.pOK) ? 1 - r.pOK : null, mo: U2.isNum(r.pOM) ? 1 - r.pOM : null } : q3(r, idx);
          const c = { matchId: r.id, date: r.date, market, sel, p, pR: FQ.P.robustP(p, q, market, k), odds, won: w, top: market === "1N2" && { 1: 0, N: 1, 2: 2 }[sel] === top };
          if (arm ? FQ.P.armAllows(arm, c) : market === "1N2") cands.push(c);
        }
      }
      const tk = FQ.P.buildTicket(cands, sc, { boost, pool: 90, beam: 120 });
      if (!tk) continue;
      const ok = tk.legs.every((l) => l.won);
      n++; if (ok) won++; profit += ok ? tk.totalOdds - 1 : -1; pl.push(ok ? tk.totalOdds - 1 : -1);
      sOdds += tk.totalOdds; sLegs += tk.legs.length; sP += tk.pJoint;
      for (const l of tk.legs) { nL++; if (l.won) { wL++; yL += l.odds; } eL += l.p; mix[l.market] = (mix[l.market] || 0) + 1; }
      weeks.push([b, ok ? 1 : 0, tk.legs.length, Math.round(tk.pJoint * 1000) / 1000, Math.round(tk.totalOdds * 100) / 100, Math.round(tk.pRobust * 1000) / 1000]);
    }
    // rendement réalisé par sélection (gagnée × cote) : mesure stable (des centaines de sélections) de la qualité des choix ;
    // ticket équivalent ≈ rendement ^ nombre moyen de sélections
    const legYield = nL ? yL / nL : null;
    return { n, won, hit: n ? won / n : null, hitCI: wilson(won, n), expected: sP, profit, roi: n ? profit / n : null, roiCI: bootRoi(pl), avgOdds: n ? sOdds / n : null, avgLegs: n ? sLegs / n : null, avgP: n ? sP / n : null, mix, weeks,
      legs: { n: nL, won: wL, expected: Math.round(eL * 10) / 10, hitCI: wilson(wL, nL), yield: legYield }, ticketEq: legYield && n ? Math.pow(legYield, sLegs / n) - 1 : null };
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
  /** Intervalle de confiance à 95 % (Wilson) d'un taux de réussite k / n */
  function wilson(k, n, z) {
    if (!n) return null;
    const Z = z || 1.96, ph = k / n, d = 1 + (Z * Z) / n;
    const c = (ph + (Z * Z) / (2 * n)) / d, h = (Z * Math.sqrt((ph * (1 - ph)) / n + (Z * Z) / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  T.wilson = wilson;
  /** Intervalle bootstrap (95 %) du rendement moyen par ticket, semaines rééchantillonnées (graine fixe : reproductible) */
  function bootRoi(pl, B) {
    if (pl.length < 5) return null;
    let x = 12345; const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const r = [];
    for (let b = 0; b < (B || 1000); b++) { let t = 0; for (let i = 0; i < pl.length; i++) t += pl[Math.floor(rnd() * pl.length)]; r.push(t / pl.length); }
    r.sort((a, c) => a - c);
    return [r[Math.floor(0.025 * r.length)], r[Math.floor(0.975 * r.length)]];
  }
  T.bootRoi = bootRoi;
  /**
   * Désaccords modèle / marché (1N2) : pour chaque issue, écart entre modèle seul (calibré) et marché sans marge.
   * up = modèle plus optimiste d'au moins 8 points, down = moins optimiste, agree = le reste ; moyennes et fréquence réelle.
   * Dit a posteriori qui avait raison quand les deux sources divergent.
   */
  function disagreeBins(rows) {
    const out = { up: { n: 0, mo: 0, mk: 0, y: 0 }, down: { n: 0, mo: 0, mk: 0, y: 0 }, agree: { n: 0, mo: 0, mk: 0, y: 0 } };
    for (const r of rows) {
      if (!r.pM3 || !r.pK3) continue;
      for (let i = 0; i < 3; i++) {
        const d = r.pM3[i] - r.pK3[i], b = d >= 0.08 ? out.up : d <= -0.08 ? out.down : out.agree;
        b.n++; b.mo += r.pM3[i]; b.mk += r.pK3[i]; b.y += r.k === i ? 1 : 0;
      }
    }
    for (const b of Object.values(out)) if (b.n) { b.mo /= b.n; b.mk /= b.n; b.y /= b.n; }
    return out;
  }
  T.disagreeBins = disagreeBins;

  /**
   * Entraînement complet. onLog(texte) reçoit la progression.
   * opts : { trainFrom, valFrom, trainTo (= début du test), testTo, comps, grid (bool), settings }
   * Sorties : « train » = apprentissage + validation (le passé), « val » = validation seule, « test » = test final.
   */
  T.run = function (matches, opts) {
    const o = Object.assign({ trainFrom: "2025-07-01", valFrom: "2026-03-01", trainTo: "2026-07-01", testTo: "9999-12-31", comps: ["PL", "PD", "FL1", "SA", "BL1", "DED", "ELC", "BSA", "J1", "SSL", "SPL", "CL"], grid: true, onLog: () => {} }, opts);
    const s = Object.assign({}, FQ.DEFAULT_SETTINGS, o.settings || {});
    const t0 = Date.now();
    const out = { generatedAt: new Date().toISOString(), engineVersion: FQ.ENGINE_VERSION,
      protocol: { trainFrom: o.trainFrom, valFrom: o.valFrom, trainTo: o.trainTo, testFrom: o.trainTo, testTo: o.testTo, grid: o.grid ? T.GRID.length : 1,
        note: "Trois périodes chronologiques : apprentissage (ajustement), validation (décide si un réglage est gardé), test final (mesuré seulement, jamais utilisé pour choisir). Pour chaque date, seuls les matchs antérieurs servent au calcul." },
      leagues: {}, calibration: null, policy: null, picks: null, qprior: {}, summary: {} };
    const train = [], val = [], test = [];
    const obj = (sc) => sc.ll1N2 + 0.5 * sc.llBTTS;
    for (const comp of o.comps) {
      if (!matches.some((m) => m.comp === comp && m.hg !== null && m.date >= o.trainFrom && m.date < o.trainTo)) continue;
      let best = null; const tried = [];
      const configs = o.grid ? T.GRID : [{}];
      for (const g of configs) {
        const rows = predictRange(matches, comp, o.trainFrom, o.valFrom, g);
        const sc = scoreRows(rows);
        tried.push({ g, n: sc.n, ll1N2: sc.ll1N2, llBTTS: sc.llBTTS });
        if (sc.n && (!best || obj(sc) < best.obj)) best = { g, rows, sc, obj: obj(sc) };
      }
      if (!best) continue;
      const defTrain = o.grid ? predictRange(matches, comp, o.trainFrom, o.valFrom, {}) : best.rows;
      const tunedVal = predictRange(matches, comp, o.valFrom, o.trainTo, best.g);
      const defVal = o.grid ? predictRange(matches, comp, o.valFrom, o.trainTo, {}) : tunedVal;
      const scV = scoreRows(tunedVal), scDV = scoreRows(defVal);
      // retenu si la validation ne se dégrade pas (ou, faute de validation suffisante, si l'apprentissage s'améliore nettement)
      const accepted = scV.n >= 30 ? obj(scV) <= obj(scDV) : best.obj < obj(scoreRows(defTrain)) - 0.003;
      const g = accepted ? best.g : {};
      const trR = accepted ? best.rows : defTrain, vaR = accepted ? tunedVal : defVal;
      const teR = predictRange(matches, comp, o.trainTo, o.testTo, g);
      out.leagues[comp] = { params: accepted ? best.g : null, accepted, tried: tried.length,
        train: Object.assign(scoreRows(trR.concat(vaR)), { base: baseline(matches, trR.concat(vaR)) }), val: scoreRows(vaR), valDefault: scoreRows(defVal),
        test: Object.assign(scoreRows(teR), { base: teR.length ? baseline(matches, teR) : null }) };
      train.push(...trR); val.push(...vaR); test.push(...teR);
      o.onLog(`${comp} : ${trR.length} appr. + ${vaR.length} valid. + ${teR.length} test, paramètres ${accepted ? JSON.stringify(best.g) : "par défaut"} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    const fit = train.concat(val); // le passé : apprentissage + validation
    // calibration : apprise sur l'apprentissage, gardée si la validation s'améliore, puis réajustée sur le passé
    const fitT = (rows, kind) => {
      let bestT = 1, bl = Infinity;
      const loss = (T) => mean(rows, (x) => (kind === "3" ? FQ.metrics.logLoss3(FQ.calib3(x.p3, T), x.k) : FQ.metrics.logLossBinary(FQ.calibBinary(x.pB, T), x.bt)));
      for (let T = 0.5; T <= 1.8001; T += 0.02) { const l = loss(T); if (l < bl) { bl = l; bestT = Math.round(T * 100) / 100; } }
      return bestT;
    };
    const llT = (rows, T, kind) => mean(rows, (r) => (kind === "3" ? FQ.metrics.logLoss3(FQ.calib3(r.p3, T), r.k) : FQ.metrics.logLossBinary(FQ.calibBinary(r.pB, T), r.bt)));
    const T1a = fitT(train, "3"), TBa = fitT(train, "2");
    const c1 = { Ttrain: T1a, valBefore: llT(val, 1, "3"), valAfter: llT(val, T1a, "3") }; c1.accepted = c1.valAfter < c1.valBefore;
    c1.T = c1.accepted ? fitT(fit, "3") : 1; c1.testBefore = llT(test, 1, "3"); c1.testAfter = llT(test, c1.T, "3");
    const c2 = { Ttrain: TBa, valBefore: llT(val, 1, "2"), valAfter: llT(val, TBa, "2") }; c2.accepted = c2.valAfter < c2.valBefore;
    c2.T = c2.accepted ? fitT(fit, "2") : 1; c2.testBefore = llT(test, 1, "2"); c2.testAfter = llT(test, c2.T, "2");
    // BTTS : recalibration de Platt (biais + pente), même protocole
    const fitAB = (rows) => {
      let ab = { a: 0, b: 1 }, abl = Infinity;
      for (let A = -0.6; A <= 0.6001; A += 0.02) for (let B = 0.2; B <= 1.6001; B += 0.05) {
        const l = mean(rows, (x) => FQ.metrics.logLossBinary(FQ.plattBinary(x.pB, { a: A, b: B }), x.bt));
        if (l < abl) { abl = l; ab = { a: Math.round(A * 100) / 100, b: Math.round(B * 100) / 100 }; }
      }
      return ab;
    };
    const llAB = (rows, abx) => mean(rows, (r) => FQ.metrics.logLossBinary(FQ.plattBinary(r.pB, abx), r.bt));
    const abT = fitAB(train);
    const cP = { abTrain: abT, valBefore: llAB(val, null), valAfter: llAB(val, abT),
      rateTrain: mean(fit, (r) => r.bt), meanPredTrain: mean(fit, (r) => r.pB), rateTest: mean(test, (r) => r.bt), meanPredTest: mean(test, (r) => r.pB) };
    cP.accepted = cP.valAfter < cP.valBefore;
    const ab = cP.accepted ? fitAB(fit) : null;
    if (ab) { cP.a = ab.a; cP.b = ab.b; }
    cP.testBefore = llAB(test, null); cP.testAfter = llAB(test, ab);
    if (cP.accepted) c2.accepted = false; // Platt remplace la température BTTS
    out.calibration = { T1N2: c1.accepted ? c1.T : 1, TBTTS: c2.accepted ? c2.T : 1, bttsAB: ab, detail1N2: c1, detailBTTS: c2, detailBTTSPlatt: cP };
    o.onLog(`Calibration : 1N2 T ${c1.T} (${c1.accepted ? "gardée" : "rejetée"} sur la validation) ; BTTS Platt ${cP.accepted ? `a=${ab.a} b=${ab.b}` : "rejeté"}`);
    const calB = (p) => FQ.calibBinary(FQ.plattBinary(p, out.calibration.bttsAB), out.calibration.TBTTS);
    const calRows = (rows) => rows.map((r) => Object.assign({}, r, { p3: FQ.calib3(r.p3, out.calibration.T1N2), pB: calB(r.pB) }));
    const trainC = calRows(train), valC = calRows(val), fitC = trainC.concat(valC), testC = calRows(test);
    out.calibBins = { train1N2: FQ.calibrationBins(fitC.flatMap((r) => r.p3.map((p, i) => [p, r.k === i ? 1 : 0])), 10), test1N2: FQ.calibrationBins(testC.flatMap((r) => r.p3.map((p, i) => [p, r.k === i ? 1 : 0])), 10),
      testBTTS: FQ.calibrationBins(testC.map((r) => [r.pB, r.bt]), 10) };
    // mélange modèle / marché
    // 1. méthode de retrait de la marge (normalisation ou puissance), choisie sur l'apprentissage, confirmée sur la validation
    const oddsOf = (r) => r.o || r.c;
    const llMkt = (rows, m) => mean(rows.filter(oddsOf), (r) => FQ.metrics.logLoss3(FQ.marketProbs(oddsOf(r), m), r.k));
    const dv = { trainNorm: llMkt(trainC, "norm"), trainPower: llMkt(trainC, "power"), valNorm: llMkt(valC, "norm"), valPower: llMkt(valC, "power"), testNorm: llMkt(testC, "norm"), testPower: llMkt(testC, "power") };
    dv.method = dv.trainPower < dv.trainNorm && (dv.valPower === null || dv.valPower <= dv.valNorm) ? "power" : "norm";
    o.onLog(`Marge : normalisation ${dv.trainNorm.toFixed(4)} / puissance ${dv.trainPower.toFixed(4)} (apprentissage) ; validation ${dv.valNorm && dv.valNorm.toFixed(4)} / ${dv.valPower && dv.valPower.toFixed(4)} → ${dv.method}`);
    const M = dv.method;
    // 2. poids global w (log loss 1N2) : appris sur l'apprentissage, gardé si la validation confirme, réajusté sur le passé
    const llBlend = (rows, w) => mean(rows.filter(oddsOf), (r) => FQ.metrics.logLoss3(FQ.blend(r.p3, oddsOf(r), w, M).p3, r.k));
    const bestW = (rows) => { let bw = 1, bl = Infinity; for (let w = 0; w <= 1.0001; w += 0.05) { const l = llBlend(rows, w); if (l < bl) { bl = l; bw = Math.round(w * 100) / 100; } } return { w: bw, ll: bl }; };
    const gT = bestW(trainC);
    const valOk = llBlend(valC, gT.w) <= llBlend(valC, 1);
    const g = valOk ? bestW(fitC) : { w: 1, ll: llBlend(fitC, 1) };
    out.blend = { w: g.w, wTrain: gT.w, devig: M, devigDetail: dv, trainLL: g.ll, trainModelLL: llBlend(fitC, 1), trainMarketLL: llBlend(fitC, 0),
      valLL: llBlend(valC, gT.w), valModelLL: llBlend(valC, 1), valMarketLL: llBlend(valC, 0),
      testLL: llBlend(testC, g.w), testModelLL: llBlend(testC, 1), testMarketLL: llBlend(testC, 0) };
    out.blend.accepted = valOk;
    const W = out.blend.accepted ? g.w : 1;
    // 3. poids par compétition : appris sur l'apprentissage de la compétition, gardé s'il bat le poids global sur sa validation (≥ 40 matchs cotés)
    out.blend.byComp = {}; out.blend.compDetail = {};
    for (const comp of Object.keys(out.leagues)) {
      const tr = trainC.filter((r) => r.comp === comp && oddsOf(r)), va = valC.filter((r) => r.comp === comp && oddsOf(r)), fi = fitC.filter((r) => r.comp === comp && oddsOf(r)), te = testC.filter((r) => r.comp === comp && oddsOf(r));
      if (tr.length < 80) continue;
      const c = bestW(tr), llV = va.length ? llBlend(va, c.w) : null, llVG = va.length ? llBlend(va, W) : null;
      const ok = c.w !== W && va.length >= 40 && llV < llVG;
      const wf = ok ? bestW(fi).w : W;
      out.blend.compDetail[comp] = { w: wf, wTrain: c.w, nTrain: fi.length, nVal: va.length, valLL: llV, valLLGlobal: llVG, nTest: te.length, testLL: te.length ? llBlend(te, wf) : null, testLLGlobal: te.length ? llBlend(te, W) : null, accepted: ok };
      if (ok && wf !== W) out.blend.byComp[comp] = wf;
    }
    o.onLog(`Mélange : w global ${W} (${M}) ; par compétition ${JSON.stringify(out.blend.byComp)}`);
    // marchés de buts : poids modèle / marché appris sur les cotes historiques plus/moins de 2,5 (football-data), même protocole
    const two = (x) => (1 / x[0]) / (1 / x[0] + 1 / x[1]);
    {
      const ouRows = (rows) => rows.filter((r) => r.ou && U2.isNum(r.pO));
      const llG = (rows, w) => mean(ouRows(rows), (r) => FQ.metrics.logLossBinary(w * r.pO + (1 - w) * two(r.ou), r.t));
      const fitG = (rows) => { let gw = 1, gl = Infinity; for (let w = 0; w <= 1.0001; w += 0.05) { const l = llG(rows, w); if (l < gl) { gl = l; gw = Math.round(w * 100) / 100; } } return { w: gw, ll: gl }; };
      const gt = fitG(train);
      const ok = ouRows(val).length >= 50 && llG(val, gt.w) <= llG(val, 1);
      const gf = ok ? fitG(fit) : { w: 1, ll: llG(fit, 1) };
      out.blendGoals = { w: gf.w, wTrain: gt.w, n: ouRows(fit).length, trainLL: gf.ll, trainModelLL: llG(fit, 1), trainMarketLL: llG(fit, 0), valLL: llG(val, gt.w), valModelLL: llG(val, 1), valMarketLL: llG(val, 0),
        testLL: llG(test, gf.w), testModelLL: llG(test, 1), testMarketLL: llG(test, 0), accepted: ok };
      o.onLog(`Buts ±2,5 : w ${gf.w} ; test modèle ${out.blendGoals.testModelLL && out.blendGoals.testModelLL.toFixed(4)} / marché ${out.blendGoals.testMarketLL && out.blendGoals.testMarketLL.toFixed(4)} / retenu ${out.blendGoals.testLL && out.blendGoals.testLL.toFixed(4)}`);
    }
    const wOf = (comp) => (out.blend.byComp[comp] !== undefined ? out.blend.byComp[comp] : W);
    const gW = out.blendGoals && out.blendGoals.accepted ? out.blendGoals.w : 1;
    // probabilités finales + séparation des sources : pM3 / pOM = modèle sportif seul (calibré), pK3 / pOK = marché sans marge
    const blendRows = (rows) => rows.map((r) => Object.assign({}, r, { pM3: r.p3, pK3: oddsOf(r) ? FQ.marketProbs(oddsOf(r), M) : null, pOM: r.pO, pOK: r.ou ? two(r.ou) : null },
      oddsOf(r) ? { p3: FQ.blend(r.p3, oddsOf(r), wOf(r.comp), M).p3 } : {},
      r.ou && U2.isNum(r.pO) ? { pO: gW * r.pO + (1 - gW) * two(r.ou) } : {}));
    const trainB = blendRows(fitC), valB = blendRows(valC), testB = blendRows(testC);
    out.summary0 = { trainLLFinal: mean(trainB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.p3, r.k)), valLLFinal: mean(valB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.p3, r.k)), testLLFinal: mean(testB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.p3, r.k)),
      testMarketLL: mean(testB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.pK3, r.k)), testModelLL: mean(testB.filter(oddsOf), (r) => FQ.metrics.logLoss3(r.pM3, r.k)), testN: testB.filter(oddsOf).length };
    // écart de log loss (retenu − marché) sur le test : IC bootstrap par match, pour savoir si la différence est réelle
    {
      const d = testB.filter(oddsOf).map((r) => FQ.metrics.logLoss3(r.p3, r.k) - FQ.metrics.logLoss3(r.pK3, r.k));
      const dm = testB.filter(oddsOf).map((r) => FQ.metrics.logLoss3(r.pM3, r.k) - FQ.metrics.logLoss3(r.pK3, r.k));
      out.summary0.diffFinalVsMarket = { mean: mean(d, (x) => x), ci: bootRoi(d, 1000) };
      out.summary0.diffModelVsMarket = { mean: mean(dm, (x) => x), ci: bootRoi(dm, 1000) };
      out.summary0.disagree = { past: disagreeBins(trainB), test: disagreeBins(testB) };
    }
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
      const tr = simulate(fitC, ev, sx, { allowCloseAsPre: true }), te = simulate(testC, ev, sx, { allowCloseAsPre: true });
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
    // tickets combinés : chaque stratégie rejouée semaine par semaine sur le passé (apprentissage + validation) et sur le test final
    if (FQ.P && FQ.P.buildTicket) {
      const frF = frOddsFactor(matches);
      const strip2 = (x) => Object.assign({}, x, { weeks: undefined });
      const scs = FQ.P.scenarios(s), arms0 = FQ.P.TICKET_ARMS;
      // prudence κ (probabilité diminuée quand modèle et marché divergent) : choisie sur le passé seulement,
      // critère = rendement réalisé par sélection porté au nombre moyen de sélections (log), moyenne sur niveaux et stratégies
      const kGrid = [0, 0.5, 1, 2], kRes = [];
      for (const kp of kGrid) {
        let sc0 = 0, m = 0, won = 0, n = 0, tsc = 0, tm = 0, twon = 0, tn = 0;
        for (const sc of scs) for (const arm of arms0) {
          const r = armBacktest(trainB, sc, arm, frF, s, kp);
          if (r.n >= 10 && r.legs.yield > 0) { sc0 += (r.n ? (r.legs.n / r.n) : 0) * Math.log(r.legs.yield); m++; }
          won += r.won; n += r.n;
          // test final : mesuré pour information, n'intervient pas dans le choix
          const t = armBacktest(testB, sc, arm, frF, s, kp);
          if (t.n >= 3 && t.legs.yield > 0) { tsc += (t.legs.n / t.n) * Math.log(t.legs.yield); tm++; }
          twon += t.won; tn += t.n;
        }
        kRes.push({ kappa: kp, score: m ? sc0 / m : null, won, n, testScore: tm ? tsc / tm : null, testWon: twon, testN: tn });
        o.onLog(`Prudence κ ${kp} : score ${m ? (sc0 / m).toFixed(4) : "—"} (${won}/${n} tickets gagnés sur le passé)`);
      }
      const kBest = kRes.filter((x) => x.score !== null).sort((a, b) => b.score - a.score)[0];
      // κ > 0 gardé seulement s'il bat κ = 0 d'au moins 0,005 (sinon la complexité n'apporte rien de démontré)
      const k0 = kRes.find((x) => x.kappa === 0);
      const kappa = kBest && k0 && kBest.kappa > 0 && kBest.score > k0.score + 0.005 ? kBest.kappa : 0;
      out.tickets = { window: "jeudi → dimanche, un jeu par semaine", stake: 1, frFactor: frF, kappa, kappaGrid: kRes, scenarios: scs.map((sc) => {
        const arms = {};
        for (const arm of arms0) arms[arm.id] = { train: armBacktest(trainB, sc, arm, frF, s, kappa), val: armBacktest(valB, sc, arm, frF, s, kappa), test: armBacktest(testB, sc, arm, frF, s, kappa) };
        const bench = { train: armBacktest(trainB, sc, null, frF, s, 0), test: armBacktest(testB, sc, null, frF, s, 0) };
        // stratégie de départ : meilleur taux de réussite sur le passé (à égalité : plus forte chance estimée) ; le test n'intervient pas
        const ranked = arms0.map((a) => a.id).filter((id) => arms[id].train.n >= 10)
          .sort((a, b) => (arms[b].train.hit - arms[a].train.hit) || (arms[b].train.avgP - arms[a].train.avgP));
        const start = ranked[0] || arms0[0].id;
        // choix semaine par semaine rejoué sans regarder l'avenir, avec les deux procédures possibles :
        // « taux » = meilleur taux de réussite passé (loi Bêta, ≥ 5 semaines) ; « corrigée » = plus forte chance prudente × correction apprise
        // (gagnés ÷ annoncés sur les semaines précédentes, K = 1,5), à 10 % près la meilleure espérance corrigée.
        const allW = {};
        for (const id of Object.keys(arms)) for (const w of arms[id].train.weeks.concat(arms[id].test.weeks)) (allW[w[0]] = allW[w[0]] || {})[id] = w;
        const replay = (proc) => {
          const hist = {}; const res = { past: { n: 0, won: 0, profit: 0, pl: [] }, test: { n: 0, won: 0, profit: 0, pl: [], picks: {} } };
          for (const wk of Object.keys(allW).sort()) {
            const avail = Object.keys(allW[wk]);
            const H = (id) => hist[id] || { n: 0, w: 0, e: 0 };
            let pick;
            if (proc === "hitrate") {
              const sc1 = (id) => ({ enough: H(id).n >= 5, mean: (1 + H(id).w) / (2 + H(id).n) });
              pick = avail.slice().sort((a, b) => (sc1(b).enough - sc1(a).enough) || (sc1(b).mean - sc1(a).mean) || (a === start ? -1 : b === start ? 1 : 0))[0];
            } else {
              const c = avail.map((id) => { const w = allW[wk][id], f = Math.min(1.6, Math.max(0.5, (H(id).w + 1.5) / (H(id).e + 1.5))); return { id, pc: w[5] * f, evc: w[5] * f * w[4] }; });
              const mx = Math.max(...c.map((x) => x.pc)); const near = c.filter((x) => x.pc >= 0.9 * mx);
              pick = near.reduce((a, x) => (x.evc > a.evc ? x : a), near[0]).id;
            }
            const R = wk >= o.trainTo ? res.test : res.past, w = allW[wk][pick], x = w[1] ? w[4] - 1 : -1;
            R.n++; if (w[1]) R.won++; R.profit += x; R.pl.push(x); if (R.picks) R.picks[pick] = (R.picks[pick] || 0) + 1;
            for (const id of avail) { const h = (hist[id] = hist[id] || { n: 0, w: 0, e: 0 }); h.n++; h.w += allW[wk][id][1]; h.e += allW[wk][id][5]; }
          }
          const fmt = (R) => ({ n: R.n, won: R.won, hitCI: wilson(R.won, R.n), roi: R.n ? R.profit / R.n : null, roiCI: bootRoi(R.pl), picks: R.picks });
          return { past: fmt(res.past), test: fmt(res.test) };
        };
        const procs = { corrected: replay("corrected"), hitrate: replay("hitrate") };
        const banditOut = Object.assign({ procs }, procs.corrected.test);
        const T0 = arms[start].test;
        o.onLog(`Tickets ${sc.label} : départ ${start} (passé ${arms[start].train.won}/${arms[start].train.n}, test ${T0.won}/${T0.n}) ; choix corrigé passé ${procs.corrected.past.won}/${procs.corrected.past.n} test ${procs.corrected.test.won}/${procs.corrected.test.n} ; choix par taux passé ${procs.hitrate.past.won}/${procs.hitrate.past.n} test ${procs.hitrate.test.won}/${procs.hitrate.test.n}`);
        return { id: sc.id, label: sc.label, lo: sc.lo, hi: sc.hi, start, bandit: banditOut,
          arms: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, { train: strip2(v.train), val: strip2(v.val), test: strip2(v.test), weeks: v.train.weeks.concat(v.test.weeks) }])),
          benchmark: { train: strip2(bench.train), test: strip2(bench.test) } };
      }), note: "Un ticket par stratégie, par niveau et par semaine (matchs du jeudi au dimanche). Cotes d'avant-match football-data.co.uk (1N2, ±2,5 buts) ramenées au niveau des bookmakers français (facteur mesuré), double chance déduite du 1N2, mise 1 u. Stratégie de départ et prudence choisies sur le passé ; le test final n'a servi à aucun choix. « Les deux équipes marquent » n'a pas d'historique de cotes : ce marché n'entre qu'en réel." };
    }
    if (out.tickets) {
      // procédure de choix de la stratégie : la « corrigée » suit la chance du ticket de la semaine (cohérente avec l'objectif chance + profit) ;
      // la règle « taux » n'est retenue que si elle gagne nettement plus de tickets sur le passé (au moins 5 % de plus, tous niveaux)
      const tot = (k, per) => out.tickets.scenarios.reduce((a, x) => a + x.bandit.procs[k][per].won, 0);
      const pc = tot("corrected", "past"), ph = tot("hitrate", "past");
      out.tickets.choice = ph >= Math.max(pc + 2, pc * 1.05) ? "hitrate" : "corrected";
      out.tickets.choiceDetail = { corrected: { past: pc, test: tot("corrected", "test") }, hitrate: { past: ph, test: tot("hitrate", "test") }, nPast: out.tickets.scenarios.reduce((a, x) => a + x.bandit.procs.corrected.past.n, 0), nTest: out.tickets.scenarios.reduce((a, x) => a + x.bandit.procs.corrected.test.n, 0) };
      for (const x of out.tickets.scenarios) Object.assign(x.bandit, x.bandit.procs[out.tickets.choice].test);
      o.onLog(`Choix de stratégie : ${out.tickets.choice} (passé : corrigée ${pc}, taux ${ph} tickets gagnés ; test : corrigée ${out.tickets.choiceDetail.corrected.test}, taux ${out.tickets.choiceDetail.hitrate.test})`);
    }
    // agent : Q(s, PRENDRE) sur toutes les opportunités tarifées
    let q = {};
    // l'agent apprend sur les opportunités que signalerait le modèle seul (avant mélange au marché) :
    // si ces « value bets » perdent historiquement, il apprend à les refuser.
    for (const r of fitC.concat(testC)) {
      const odds = r.o || r.c; if (!odds) continue;
      [0, 1, 2].forEach((i) => {
        const ev = r.p3[i] * odds[i] - 1; if (!(ev > 0)) return;
        const key = FQ.stateKey("1N2", ev, r.rel, odds[i]);
        const reward = r.k === i ? odds[i] - 1 : -1;
        q[key] = FQ.qUpdate(q, key, reward, s.agentAlpha).entry;
      });
    }
    out.qprior = q;
    out.summary = { leagues: Object.keys(out.leagues).length, trainPredictions: fit.length, learnPredictions: train.length, valPredictions: val.length, testPredictions: test.length, seconds: Math.round((Date.now() - t0) / 1000),
      train: scoreRows(trainB), test: scoreRows(testB), trainModelOnly: scoreRows(fitC), valFinal: scoreRows(valB), testModelOnly: scoreRows(testC), qStates: Object.keys(q).length, qObservations: sum(Object.values(q).map((x) => x.n)) };
    // échantillon compact du test pour l'affichage (prédiction, issue, choix)
    out.testRows = testB.map((r) => { const pk = FQ.preferredPick({ p1: r.p3[0], pN: r.p3[1], p2: r.p3[2], bttsYes: r.pB }, r.rel, r.o ? { "1N2|1": r.o[0], "1N2|N": r.o[1], "1N2|2": r.o[2] } : null, sp);
      return [r.date, r.comp, r.home, r.away, Math.round(r.p3[0] * 1000) / 1000, Math.round(r.p3[1] * 1000) / 1000, Math.round(r.p3[2] * 1000) / 1000, Math.round(r.pB * 1000) / 1000, r.k, r.bt, pk.market + "|" + pk.sel, pk.kind, pk.odds || null]; });
    return out;
  };
})(typeof window !== "undefined" ? window : globalThis);
