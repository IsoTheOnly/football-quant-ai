/* =========================================================================
   FOOTBALL QUANT AI — pipeline partagé et pilote automatique
   Utilisé par la page (cycle à l'ouverture et toutes les 10 min) et par la
   tâche planifiée quotidienne (Node). Aucune dépendance à React.
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ;
  const U = FQ.util;

  function buildPrediction(ctx, match, opts) {
    const asOf = match.date < ctx.today ? match.date : ctx.today;
    const model = opts.manualLambda ? null : ctx.getModel(match.comp, asOf);
    let extraMult = null, stakeInfo = null;
    const stk = ctx.state.calibration.stakeTest;
    if (opts.applyStake && stk && stk.accepted && ctx.rulesMap[match.comp]) {
      const st0 = FQ.seasonTable(ctx.matches, match.comp, match.season, match.date, ctx.rulesMap);
      const flags = FQ.lockedFlags(st0.table, ctx.rulesMap[match.comp]);
      extraMult = { h: flags[match.home] ? Math.exp(stk.beta) : 1, a: flags[match.away] ? Math.exp(stk.beta) : 1 };
      stakeInfo = { beta: stk.beta, home: !!flags[match.home], away: !!flags[match.away] };
    }
    const pr = FQ.predictMatch(model, match, { drivers: opts.drivers, neutral: opts.neutral, manualLambda: opts.manualLambda, calibration: ctx.state.calibration, extraMult });
    // mélange au marché (poids appris sur l'historique) quand une cote 1N2 est connue
    const bl = FQ.TRAINED && FQ.TRAINED.blend;
    if (pr.ok && match.odds && match.odds.h && bl && bl.accepted && !opts.noBlend && ctx.mode !== "demo") {
      const B = FQ.blend([pr.markets.p1, pr.markets.pN, pr.markets.p2], [match.odds.h, match.odds.d, match.odds.a], bl.w);
      if (B.used) {
        pr.modelMarkets = { p1: pr.markets.p1, pN: pr.markets.pN, p2: pr.markets.p2 };
        pr.blendInfo = { w: bl.w, market: B.market, src: match.odds.src };
        pr.markets = Object.assign({}, pr.markets, { p1: B.p3[0], pN: B.p3[1], p2: B.p3[2] });
      }
    }
    const ch = FQ.teamContext(ctx.matches, match.comp, match.home, match.date, ctx.today);
    const ca = FQ.teamContext(ctx.matches, match.comp, match.away, match.date, ctx.today);
    const lastComp = ctx.matches.filter((m) => m.comp === match.comp && m.hg !== null && m.date < asOf).map((m) => m.date).sort().slice(-1)[0];
    const staleDays = lastComp ? U.daysBetween(lastComp, asOf) : 999;
    const missing = ch.missing + ca.missing;
    const rel = FQ.reliability(model, match, { drivers: opts.drivers, manualLambda: opts.manualLambda, missingResults: missing, staleDays });
    return { asOf, model, pr, ch, ca, rel, missing, staleDays, stakeInfo };
  }

  function makeSnapshot(ctx, match, b, opts, players, oddsMap) {
    const now = new Date().toISOString();
    const predId = U.uid("pred");
    const mk = b.pr.markets;
    const pred = {
      id: predId, createdAt: now, matchId: match.id, comp: match.comp, date: match.date, home: match.home, away: match.away,
      lambdaHome: b.pr.lambdaHome, lambdaAway: b.pr.lambdaAway, rho: b.pr.rho, source: b.pr.source,
      markets: { p1: mk.p1, pN: mk.pN, p2: mk.p2, bttsYes: mk.bttsYes }, raw: b.pr.raw, topScores: mk.topScores.slice(0, 5),
      players: players.map((p) => ({ name: p.name, team: p.team, pScore: p.pScore, pScoreRaw: p.pScoreRaw, pDecisive: p.pDecisive, rel: p.rel, inputs: p.inputs })),
      reliability: b.rel.score, reliabilityDetail: b.rel, drivers: opts.drivers || {}, neutral: !!opts.neutral, manualLambda: opts.manualLambda || null,
      missing: b.missing, staleDays: b.staleDays,
      engineVersion: FQ.ENGINE_VERSION, calibrationVersion: ctx.state.calibration.version,
      modelSummary: b.model && b.model.ok ? { mu: b.model.mu, gamma: b.model.gamma, rho: b.model.rho, nMatches: b.model.nMatches, asOf: b.model.asOf,
        home: b.model.teams[match.home], away: b.model.teams[match.away] } : null,
      dataSource: ctx.mode === "demo" ? "démo fictive" : `${match.source}${match.sourceCommitDate ? " (relevé " + match.sourceCommitDate.slice(0, 16).replace("T", " ") + ")" : ""}`,
      demo: ctx.mode === "demo",
      standings: standingsSnapshot(ctx, match),
      dataVersion: ctx.dataVersion ? ctx.dataVersion(match.comp) : null,
      origin: opts.origin || "manuel",
      stakeEffect: b.stakeInfo || null,
      blend: b.pr.blendInfo || null, modelMarkets: b.pr.modelMarkets || null,
      matchOdds: match.odds || null,
    };
    pred.pick = pickFor(ctx, match, mk, b.rel.score, oddsMap);
    const sel = [
      ["1N2", "1", mk.p1], ["1N2", "N", mk.pN], ["1N2", "2", mk.p2], ["BTTS", "Oui", mk.bttsYes], ["BTTS", "Non", mk.bttsNo],
    ].map(([market, selection, p]) => ({ market, selection, p, rel: b.rel.score }));
    players.forEach((pl) => {
      sel.push({ market: "Buteur", selection: pl.name, playerName: pl.name, p: pl.pScore, rel: pl.rel, playerUnavailable: pl.inputs.pPlay < 0.05 });
      if (Number.isFinite(pl.pDecisive)) sel.push({ market: "Joueur Décisif", selection: pl.name, playerName: pl.name, p: pl.pDecisive, rel: pl.rel, playerUnavailable: pl.inputs.pPlay < 0.05 });
    });
    const opps = sel.map((x) => {
      const key = x.market + "|" + x.selection;
      const o = oddsMap ? oddsMap[key] : null;
      return Object.assign({ id: U.uid("opp"), predictionId: predId, matchId: match.id, comp: match.comp, date: match.date, match: `${match.home} – ${match.away}`,
        odds: Number.isFinite(o && o.v) ? o.v : null, oddsSource: o && o.src ? o.src : null, oddsAt: o && Number.isFinite(o.v) ? now : null,
        missing: b.missing, status: "ouverte", createdAt: now }, x);
    });
    return { pred, opps };
  }

  /**
   * Cote 1N2 de référence d'une rencontre, toujours relevée chez un bookmaker (jamais calculée) :
   * 1. bookmaker français choisi dans les paramètres (The Odds API) ;
   * 2. sinon médiane des bookmakers français relevés pour ce match ;
   * 3. sinon Bet 365 (ESPN ou football-data.co.uk), quand aucune cote française n'est disponible (crédits épuisés, compétition non couverte).
   * Un relevé français de plus de 72 h est écarté si une cote Bet 365 plus récente existe.
   */
  const FR_NAMES = () => (FQ.ETL && FQ.ETL.FR_BOOKS) || { winamax_fr: "Winamax", betclic_fr: "Betclic", unibet_fr: "Unibet", pmu_fr: "PMU", netbet_fr: "NetBet" };
  const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); const n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
  function refOdds(match, set) {
    const fr = match && match.oddsFr, o = match && match.odds;
    const at = (x) => (x && x.at ? Date.parse(x.at) : 0);
    const frUsable = fr && fr.books && Object.keys(fr.books).length && !(o && o.h && at(o) > at(fr) && Date.now() - at(fr) > 72 * 3600e3);
    if (frUsable) {
      const names = FR_NAMES(), pref = (set && set.oddsBook) || "winamax_fr", stamp = ` · relevée le ${String(fr.at).slice(0, 16).replace("T", " ")} UTC`;
      const b = fr.books[pref];
      if (b) return { h: b[0], d: b[1], a: b[2], src: `${names[pref] || pref} (The Odds API)${stamp}`, at: fr.at, book: pref, fr: true };
      const keys = Object.keys(fr.books);
      const pick = (i) => Math.round(median(keys.map((k) => fr.books[k][i])) * 100) / 100;
      return { h: pick(0), d: pick(1), a: pick(2), src: `médiane de ${keys.map((k) => names[k] || k).join(", ")} (The Odds API ; ${names[pref] || pref} absent)${stamp}`, at: fr.at, book: "median_fr", fr: true };
    }
    if (o && o.h) return Object.assign({}, o, { src: o.src + (o.at ? ` · relevée le ${String(o.at).slice(0, 16).replace("T", " ")} UTC` : "") + " · aucune cote française disponible", fr: false });
    return null;
  }
  /** Cotes 1N2 du match (source réelle) au format attendu par les opportunités */
  function matchOddsMap(match, set) {
    const o = refOdds(match, set);
    if (!o) return null;
    return { "1N2|1": { v: o.h, src: o.src }, "1N2|N": { v: o.d, src: o.src }, "1N2|2": { v: o.a, src: o.src } };
  }

  /* ----------------------------------------------- mesure de la cote de clôture (CLV) */
  /**
   * Cote de clôture d'une sélection 1N2 :
   * - définitive : Pinnacle (ou moyenne du marché) à la clôture, publiée par football-data.co.uk quelques jours après le match ;
   * - provisoire : dernier relevé d'avant-match du même bookmaker français (ou de la médiane), quand le match a commencé.
   * Retourne { odds, pFair, src, final } ou null. pFair = probabilité sans marge (normalisation des trois cotes).
   */
  function closingFor(match, market, sel, set, nowMs) {
    if (!match || market !== "1N2") return null;
    const i = { 1: 0, N: 1, 2: 2 }[sel];
    if (i === undefined) return null;
    const fair = (t) => { const inv = t.map((x) => 1 / x), s = inv[0] + inv[1] + inv[2]; return inv[i] / s; };
    const cr = match.closeRef;
    if (cr && cr.h && cr.d && cr.a) { const t = [cr.h, cr.d, cr.a]; return { odds: t[i], pFair: fair(t), src: cr.src, final: true }; }
    if (!kickoffPassed(match, nowMs || Date.now())) return null;
    const fr = match.oddsFr;
    if (fr && fr.books && Object.keys(fr.books).length) {
      const names = FR_NAMES(), pref = (set && set.oddsBook) || "winamax_fr";
      const keys = fr.books[pref] ? [pref] : Object.keys(fr.books);
      const t = [0, 1, 2].map((j) => median(keys.map((k) => fr.books[k][j])));
      const ko = fr.ko ? Date.parse(fr.ko) : null, hrs = ko ? Math.max(0, Math.round((ko - Date.parse(fr.at)) / 3600e3)) : null;
      return { odds: t[i], pFair: fair(t), src: `dernier relevé ${keys.length === 1 ? names[keys[0]] || keys[0] : "médiane FR"} avant le match${hrs !== null ? ` (${hrs} h avant)` : ""}`, final: false };
    }
    return null;
  }
  /** CLV d'une cote prise : écart brut à la clôture et espérance à la clôture (cote prise × probabilité sans marge − 1) */
  function clvOf(taken, close) {
    if (!close || !(taken > 1)) return null;
    return { close: Math.round(close.odds * 100) / 100, src: close.src, final: !!close.final, pct: taken / close.odds - 1, ev: taken * close.pFair - 1 };
  }
  /** Met à jour la CLV des choix, des tickets fictifs et des paris réels ; une mesure provisoire est remplacée par la définitive dès qu'elle paraît. */
  function updateClv(ctx) {
    const s = ctx.state, set = s.settings, nowMs = Date.now();
    const mById = (id) => (ctx.matchById ? ctx.matchById.get(id) : ctx.matches.find((x) => x.id === id));
    let changed = 0;
    const need = (x) => !x.clv || !x.clv.final;
    for (const p of s.picks || []) {
      if (!(p.odds > 1) || !need(p)) continue;
      const c = clvOf(p.odds, closingFor(mById(p.matchId), p.market, p.sel, set, nowMs));
      if (c && JSON.stringify(c) !== JSON.stringify(p.clv)) { p.clv = c; changed++; }
    }
    for (const t of (s.paperTickets || []).concat(s.realBets || [])) {
      if (!t.legs || !t.legs.length || (t.clv && t.clv.final)) continue;
      let all = true, prodFair = 1, prodClose = 1, final = true;
      for (const l of t.legs) {
        if (l.status === "ANNULÉ") continue;
        const cl = closingFor(mById(l.matchId), l.market, l.sel, set, nowMs);
        if (!cl) { all = false; continue; }
        if (l.odds > 1) { const c = clvOf(l.odds, cl); if (JSON.stringify(c) !== JSON.stringify(l.clv)) { l.clv = c; changed++; } }
        prodFair *= cl.pFair; prodClose *= cl.odds; final = final && cl.final;
      }
      if (all && t.totalOdds > 1 && t.legs.some((l) => l.status !== "ANNULÉ")) {
        const odds = U.isNum(t.settledOdds) ? t.settledOdds : t.totalOdds;
        const c = { close: Math.round(prodClose * 100) / 100, pct: odds / prodClose - 1, ev: odds * prodFair - 1, final, src: final ? "clôture football-data.co.uk" : "derniers relevés avant les matchs" };
        if (JSON.stringify(c) !== JSON.stringify(t.clv)) { t.clv = c; changed++; }
      }
    }
    return changed;
  }
  function effSettings(ctx) {
    const s = Object.assign({}, ctx.state.settings);
    const pol = FQ.TRAINED && FQ.TRAINED.policy;
    if (!(s.maxOdds > 1) && pol && pol.chosenMaxOdds && ctx.mode !== "demo") s.maxOdds = pol.chosenMaxOdds;
    return s;
  }
  function pickFor(ctx, match, mk, rel, oddsMap) {
    const odds = {};
    if (oddsMap) for (const [k, v] of Object.entries(oddsMap)) if (v && Number.isFinite(v.v)) odds[k] = v.v;
    const pk = FQ.preferredPick(mk, rel, odds, effSettings(ctx), { h: match.home, a: match.away });
    const k = pk.market + "|" + pk.sel;
    return { market: pk.market, sel: pk.sel, label: pk.label, p: pk.p, odds: pk.odds, oddsSrc: oddsMap && oddsMap[k] ? oddsMap[k].src : null, ev: pk.ev, fair: pk.fair, minOdds: pk.minOdds, kind: pk.kind, why: pk.why, rel };
  }

  function standingsSnapshot(ctx, match) {
    const rules = ctx.rulesMap[match.comp];
    if (!rules) return null;
    const st = FQ.seasonTable(ctx.matches, match.comp, match.season, match.date, ctx.rulesMap);
    const pick = (t) => { const r = st.table.find((x) => x.team === t); return r ? { pos: r.pos, pts: r.pts, played: r.p, remaining: r.remaining, gd: r.gd } : null; };
    const proj = ctx.getProjection ? ctx.getProjection(match.comp, match.season) : null;
    const pz = (t) => (proj && proj.ok ? (proj.teams.find((x) => x.team === t) || {}).zones || null : null);
    return { asOf: match.date, rules: rules.id, home: pick(match.home), away: pick(match.away), projection: proj && proj.ok ? { nSims: proj.nSims, at: proj.at, home: pz(match.home), away: pz(match.away) } : null };
  }

  function demoOddsMap(ctx, match, players) {
    if (ctx.mode !== "demo") return null;
    const o = ctx.demoData.odds[match.id]; if (!o) return null;
    const src = "cote fictive (démo)";
    const m = { "1N2|1": { v: o["1"], src }, "1N2|N": { v: o.N, src }, "1N2|2": { v: o["2"], src }, "BTTS|Oui": { v: o.Oui, src }, "BTTS|Non": { v: o.Non, src } };
    (players || []).forEach((p) => { if (o.scorers[p.name]) m["Buteur|" + p.name] = { v: o.scorers[p.name], src }; if (o.decisive[p.name]) m["Joueur Décisif|" + p.name] = { v: o.decisive[p.name], src }; });
    return m;
  }

  /* ----------------------------------------------- joueurs */
  function defaultPlayersFor(ctx, match) {
    const out = [];
    for (const [side, team] of [["H", match.home], ["A", match.away]]) {
      const key = match.comp + "|" + team;
      const saved = ctx.state.players[key];
      if (saved && saved.length) { saved.forEach((p) => out.push(Object.assign({ team, side }, p))); continue; }
      if (ctx.mode === "real") {
        const sc = FQ.teamScorers(ctx.matches, match.comp, team, match.date);
        sc.list.slice(0, 3).forEach((x) => out.push({ team, side, name: x.name, shareGoals: Math.round(((x.goals + 0.5) / (sc.teamGoals + 2)) * 1000) / 1000, shareAssists: null, pPlay: null, minutes: null, sharesFromData: true,
          note: `${x.goals} but(s) sur ${sc.teamGoals} de l'équipe (${sc.matchesWithData} matchs avec buteurs, openfootball)` }));
      }
    }
    return out;
  }
  function computePlayer(ctx, match, b, p) {
    const lam = p.side === "H" ? b.pr.lambdaHome : b.pr.lambdaAway;
    const inputs = { pPlay: p.pPlay, minutes: p.minutes, shareGoals: p.shareGoals, shareAssists: p.shareAssists };
    const complete = Number.isFinite(p.pPlay) && Number.isFinite(p.minutes) && Number.isFinite(p.shareGoals);
    if (!complete) return { name: p.name, team: p.team, side: p.side, pScore: null, pDecisive: null, rel: 0, inputs, incomplete: true, note: p.note };
    const pp = FQ.playerProbs(lam, inputs);
    const T = ctx.state.calibration.TPLAYER || 1;
    const relP = FQ.playerReliability(b.rel.score, { sharesFromData: p.sharesFromData, minutesConfirmed: p.minutesConfirmed, lineupConfirmed: p.lineupConfirmed });
    return { name: p.name, team: p.team, side: p.side, pScore: FQ.calibBinary(pp.pScore, T), pScoreRaw: pp.pScore, pDecisive: pp.pDecisive === null ? null : FQ.calibBinary(pp.pDecisive, T),
      rel: pp.assistsKnown ? relP.score : relP.score, relNotes: relP.notes, inputs, lambdaGoals: pp.lambdaGoals, note: p.note };
  }


  /* ----------------------------------------------- analyse d'une liste de matchs */
  /**
   * Fige une prédiction par match (une seule par version de données de la compétition).
   * force=false : un match déjà analysé avec la même version de données n'est pas ré-analysé.
   */
  function analyzeList(ctx, list, opts) {
    const o = opts || {};
    const s = ctx.state;
    let analysed = 0, insufficient = 0, skipped = 0;
    for (const m of list) {
      const dv = ctx.dataVersion ? ctx.dataVersion(m.comp) : null;
      const prev = s.predictions.filter((p) => p.matchId === m.id);
      const last = prev[prev.length - 1];
      if (last && (!o.refresh || last.dataVersion === dv)) { skipped++; continue; }
      const b = buildPrediction(ctx, m, {});
      if (!b.pr.ok) {
        const already = s.opportunities.some((x) => x.matchId === m.id && x.insufficient && x.dataVersion === dv);
        if (!already) {
          s.opportunities.push({ id: U.uid("opp"), predictionId: null, matchId: m.id, comp: m.comp, date: m.date, match: `${m.home} – ${m.away}`, market: "1N2", selection: "—", p: null, rel: 0, odds: null,
            status: "ouverte", insufficient: "Données insuffisantes : " + b.pr.reason, dataVersion: dv, origin: o.origin || "manuel", createdAt: new Date().toISOString() });
          insufficient++;
        } else skipped++;
        continue;
      }
      const players = defaultPlayersFor(ctx, m).map((p) => computePlayer(ctx, m, b, p)).filter((p) => !p.incomplete);
      const snap = makeSnapshot(ctx, m, b, { origin: o.origin || "manuel" }, players, ctx.mode === "demo" ? demoOddsMap(ctx, m, players) : matchOddsMap(m, ctx.state.settings));
      s.opportunities.forEach((x) => { if (x.matchId === m.id && x.status === "ouverte") x.status = "remplacée"; });
      snap.opps.forEach((x) => { x.dataVersion = dv; x.origin = o.origin || "manuel"; });
      s.predictions.push(snap.pred); s.opportunities.push(...snap.opps);
      upsertPick(s, m, snap.pred);
      analysed++;
    }
    if (analysed || insufficient) s.log.push({ t: new Date().toISOString(), text: `Analyse ${o.origin || "manuelle"} : ${analysed} match(s), ${insufficient} insuffisant(s)` });
    return { analysed, insufficient, skipped };
  }

  /* ----------------------------------------------- choix préférentiels (un par match) */
  function kickoffPassed(m, nowMs) {
    const ko = FQ.time.kickoffUtc(m.date, m.time, m.tz);
    return ko ? ko <= nowMs : m.date < new Date(nowMs).toISOString().slice(0, 10);
  }
  function upsertPick(s, m, pred) {
    if (!pred.pick) return;
    s.picks = s.picks || [];
    const id = "pick_" + m.id;
    const prev = s.picks.find((x) => x.id === id);
    if (prev && (prev.status !== "EN ATTENTE" || kickoffPassed(m, Date.now()))) return; // figé au coup d'envoi
    const e = Object.assign({ id, matchId: m.id, comp: m.comp, date: m.date, home: m.home, away: m.away, predictionId: pred.id, createdAt: prev ? prev.createdAt : pred.createdAt, updatedAt: pred.createdAt,
      status: "EN ATTENTE", profit: 0, revisions: prev ? (prev.revisions || 0) + 1 : 0 }, pred.pick);
    if (prev) Object.assign(prev, e); else s.picks.push(e);
  }
  function settlePicks(s, match, result, now) {
    for (const p of s.picks || []) {
      if (p.matchId !== match.id || p.status !== "EN ATTENTE") continue;
      if (result.status !== "TERMINÉ" || !Number.isFinite(result.hg)) { p.status = "ANNULÉ"; p.settledAt = now; continue; }
      const won = p.market === "1N2" ? (result.hg > result.ag ? "1" : result.hg === result.ag ? "N" : "2") === p.sel : (p.sel === "Oui") === (result.hg > 0 && result.ag > 0);
      p.status = won ? "GAGNÉ" : "PERDU"; p.settledAt = now; p.score = `${result.hg}-${result.ag}`;
      p.profit = p.odds ? (won ? p.odds - 1 : -1) : null;
    }
  }

  /* ----------------------------------------------- audit d'un match */
  function auditMatch(s, match, result, opts) {
    const o = opts || {};
    const now = o.now || new Date().toISOString();
    const auditId = o.auditId || U.uid("audit");
    if (s.audits.some((a) => a.matchId === match.id && !a.reverted)) return null; // pas de double règlement
    s.results[match.id] = result;
    const settled = [];
    s.bets.forEach((b) => {
      if (b.matchId !== match.id || (b.status !== "EN ATTENTE" && b.status !== "NON VÉRIFIABLE")) return;
      const st = FQ.settleBet(b, result);
      b.status = st.status; b.profit = st.profit; b.settleNote = st.note; b.settledAt = st.status === "NON VÉRIFIABLE" ? null : now; b.auditId = auditId;
      settled.push(b.id);
    });
    let q = FQ.qtableFromLog(s.qlog);
    s.opportunities.filter((op) => op.matchId === match.id && (op.status === "pariée" || op.status === "passée" || op.status === "ouverte") && Number.isFinite(op.odds) && Number.isFinite(op.p)).forEach((op) => {
      const ev = FQ.value.expectedValue(op.p, op.odds);
      if (!(ev > 0)) return;
      const st = FQ.settleBet({ market: op.market, selection: op.selection, playerName: op.playerName, stake: 1, odds: op.odds }, result);
      if (st.status === "NON VÉRIFIABLE") return;
      const key = FQ.stateKey(op.market, ev, op.rel, op.odds);
      const reward = FQ.unitReward(st.status, op.odds, op.exposureShare || 0, s.settings.riskKappa);
      const u = FQ.qUpdate(q, key, reward, s.settings.agentAlpha);
      q[key] = u.entry;
      s.qlog.push({ id: U.uid("q"), auditId, t: now, key, action: op.status === "pariée" ? "PRENDRE" : "PASSER (contrefactuel)", reward, old: u.old, new: u.nq, alpha: s.settings.agentAlpha, version: FQ.ENGINE_VERSION });
      if (op.status === "ouverte") op.status = "expirée";
    });
    s.opportunities.forEach((op) => { if (op.matchId === match.id && op.status === "ouverte") op.status = "expirée"; });
    settlePicks(s, match, result, now);
    s.audits.push({ id: auditId, matchId: match.id, at: now, result, settled, origin: o.origin || "manuel" });
    s.log.push({ t: now, text: `Audit ${o.origin === "auto" ? "automatique" : "validé"} : ${match.home} ${result.hg ?? "-"}–${result.ag ?? "-"} ${match.away} (${settled.length} pari(s) réglé(s))` });
    return { auditId, settled };
  }

  /** Résultat construit uniquement depuis la source (aucune donnée inventée) */
  function resultFromSource(m) {
    const scorers = m.goals && (m.goals.length || (m.hg === 0 && m.ag === 0)) ? m.goals.map((g) => ({ name: g[1], side: g[0], og: g[3] === "og" })) : [];
    return { hg: m.hg, ag: m.ag, status: "TERMINÉ", scorers, scorersKnown: !!(m.goals && (m.goals.length || (m.hg === 0 && m.ag === 0))), assisters: [], assistsKnown: false, played: {},
      source: (m.resultSource || m.source) + " (intégration automatique)", enteredAt: new Date().toISOString() };
  }

  /* ----------------------------------------------- apprentissage (calibration) */
  function learnCalibration(s, origin) {
    const smp = FQ.learningSamples(s);
    const n = s.settings.calibMinN;
    const r1 = FQ.fitTemperature(smp.s1, "3", n), r2 = FQ.fitTemperature(smp.s2, "2", n), r3 = FQ.fitTemperature(smp.s3, "2", n);
    const cal = s.calibration;
    const next = { T1N2: r1.ok && r1.accepted ? r1.T : cal.T1N2, TBTTS: r2.ok && r2.accepted ? r2.T : cal.TBTTS, TPLAYER: r3.ok && r3.accepted ? r3.T : cal.TPLAYER };
    const changed = next.T1N2 !== cal.T1N2 || next.TBTTS !== cal.TBTTS || next.TPLAYER !== cal.TPLAYER;
    const entry = { at: new Date().toISOString(), from: cal.version, origin: origin || "manuel", results: { "1N2": r1, BTTS: r2, Joueurs: r3 }, before: { T1N2: cal.T1N2, TBTTS: cal.TBTTS, TPLAYER: cal.TPLAYER }, after: next, changed };
    cal.history.push(entry);
    if (changed) { Object.assign(cal, next); cal.version += 1; }
    s.log.push({ t: entry.at, text: changed ? `Calibration v${cal.version} (${origin || "manuel"})` : `Apprentissage (${origin || "manuel"}) : aucun ajustement justifié` });
    return entry;
  }

  /* ----------------------------------------------- tickets combinés : 3 scénarios de risque */
  const SCENARIOS = [
    { id: "prudent", label: "Prudent", lo: 3, hi: 4, maxLegs: 4, maxLegOdds: 2.6, stake: 1 },
    { id: "equilibre", label: "Équilibré", lo: 7, hi: 8, maxLegs: 6, maxLegOdds: 3.6, stake: 1 },
    { id: "audacieux", label: "Audacieux", lo: 40, hi: 60, maxLegs: 10, maxLegOdds: 6, stake: 1 },
  ];
  function scenarios(settings) {
    const cfg = (settings && settings.ticketCfg) || [];
    return SCENARIOS.map((sc) => {
      const c = cfg.find((x) => x && x.id === sc.id) || {};
      const lo = U.isNum(c.lo) && c.lo > 1.05 ? c.lo : sc.lo, hi = U.isNum(c.hi) && c.hi > lo ? c.hi : Math.max(sc.hi, lo * 1.1);
      return Object.assign({}, sc, { lo, hi, stake: U.isNum(c.stake) && c.stake >= 0 ? c.stake : sc.stake,
        maxLegOdds: Math.max(sc.maxLegOdds, Math.min(15, Math.sqrt(hi) + 0.5)), maxLegs: hi > 80 ? 12 : sc.maxLegs });
    });
  }
  /**
   * Résultat d'une sélection à partir du score (temps réglementaire) : true gagné, false perdu, null non vérifiable automatiquement.
   * Marchés : 1N2 (1, N, 2), DC double chance (1N, 12, N2), BTTS (Oui, Non), Buts (+0.5 … -4.5), Buteur (nom du joueur, buteurs connus).
   */
  function legWon(market, sel, hg, ag, goals) {
    if (market === "1N2") return (hg > ag ? "1" : hg === ag ? "N" : "2") === sel;
    if (market === "DC") { const r = hg > ag ? "1" : hg === ag ? "N" : "2"; return ["1N", "12", "N2"].includes(sel) ? sel.includes(r) : null; }
    if (market === "BTTS") return (sel === "Oui") === (hg > 0 && ag > 0);
    if (market === "Buts") { const m = /^([+-])(\d+(?:\.5))$/.exec(sel || ""); if (!m) return null; const n = hg + ag, line = +m[2]; return m[1] === "+" ? n > line : n < line; }
    if (market === "Buteur") {
      if (!Array.isArray(goals)) return null;
      const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
      const want = norm(sel), last = want.split(" ").slice(-1)[0];
      const scored = goals.some((g) => g[3] !== "og" && (norm(g[1]) === want || (last.length > 3 && norm(g[1]).split(" ").slice(-1)[0] === last)));
      return scored ? true : null; // non buteur : participation inconnue (remboursé s'il n'a pas joué) → vérification manuelle
    }
    return null;
  }

  /**
   * Meilleur ticket d'un scénario : au plus une sélection par match, cote totale dans [lo, hi],
   * probabilité conjointe maximale (issues de matchs différents supposées indépendantes).
   * À cote totale fixée, maximiser la probabilité revient à maximiser l'espérance : les sélections
   * où la marge du bookmaker est la plus faible (ou l'avis du modèle le plus favorable) passent en premier.
   * cands : [{ matchId, p, odds, agree?, ... }] ; opt.agree : n'utiliser que les sélections où le modèle seul est au moins aussi optimiste que le marché.
   */
  function buildTicket(cands, sc, opt) {
    const o = opt || {};
    const LO = Math.log(sc.lo), HI = Math.log(sc.hi);
    const pool = cands.filter((c) => U.isNum(c.odds) && c.odds >= 1.05 && c.odds <= sc.maxLegOdds && U.isNum(c.p) && c.p > 0.04 && (!o.agree || c.agree))
      .map((c) => ({ c, lo: Math.log(c.odds), lp: Math.log(c.p) }))
      .sort((a, b) => b.lp + b.lo - (a.lp + a.lo) || b.lp - a.lp).slice(0, 160);
    let beam = [{ idx: [], last: -1, lo: 0, lp: 0 }], best = null;
    for (let d = 0; d < sc.maxLegs && beam.length; d++) {
      const next = [];
      for (const st of beam) {
        for (let i = st.last + 1; i < pool.length; i++) {
          const x = pool[i];
          if (st.idx.some((j) => pool[j].c.matchId === x.c.matchId)) continue;
          const lo = st.lo + x.lo; if (lo > HI + 1e-9) continue;
          const ns = { idx: st.idx.concat([i]), last: i, lo, lp: st.lp + x.lp };
          if (lo >= LO - 1e-9) { if (!best || ns.lp > best.lp + 1e-12 || (Math.abs(ns.lp - best.lp) < 1e-12 && ns.idx.length < best.idx.length)) best = ns; }
          else next.push(ns);
        }
      }
      next.sort((a, b) => b.lp + b.lo - (a.lp + a.lo));
      beam = next.slice(0, 500);
    }
    if (!best) return null;
    const legs = best.idx.map((j) => pool[j].c).sort((a, b) => ((a.kickoff || a.date) < (b.kickoff || b.date) ? -1 : 1));
    const totalOdds = Math.exp(best.lo), pJoint = Math.exp(best.lp);
    return { legs, totalOdds, pJoint, ev: pJoint * totalOdds - 1 };
  }

  /** Fenêtre des tickets de la semaine : du jeudi (ou d'aujourd'hui) au dimanche ; open = la construction a commencé */
  function ticketWindow(today, set) {
    const mon = U.weekMonday(today), fromDow = (set && set.ticketFromDow) || 4;
    const from = U.addDays(mon, fromDow - 1), to = U.addDays(mon, 6);
    return { week: mon, from, to, start: today > from ? today : from, open: today >= from };
  }
  /** Sélections jouables pour les tickets : rencontres programmées de la fenêtre, cote réelle connue, analysées par le moteur */
  function ticketCandidates(ctx, win) {
    const s = ctx.state, set = s.settings, nowMs = Date.now();
    const w = win || ticketWindow(ctx.today, set);
    const start = w.start, end = w.to;
    const lastPred = new Map(); for (const p of s.predictions) lastPred.set(p.matchId, p);
    const out = [];
    for (const m of ctx.matches) {
      if (m.status !== "PROGRAMMÉ" || m.date < start || m.date > end || kickoffPassed(m, nowMs)) continue;
      const pr = lastPred.get(m.id); if (!pr || !pr.markets) continue;
      if ((pr.reliability || 0) < (set.relMin || 55)) continue;
      const om = ctx.mode === "demo" ? demoOddsMap(ctx, m, []) : matchOddsMap(m, set);
      if (!om) continue;
      const mk = pr.markets, mm = pr.modelMarkets || null;
      const mkt = om["1N2|1"] && om["1N2|N"] && om["1N2|2"] ? FQ.marketProbs([om["1N2|1"].v, om["1N2|N"].v, om["1N2|2"].v]) : null;
      const ko = FQ.time.kickoffUtc(m.date, m.time, m.tz);
      const sels = [["1N2", "1", mk.p1, `1 · ${m.home}`, 0], ["1N2", "N", mk.pN, "N · match nul", 1], ["1N2", "2", mk.p2, `2 · ${m.away}`, 2],
        ["BTTS", "Oui", mk.bttsYes, "Les deux équipes marquent", null], ["BTTS", "Non", 1 - mk.bttsYes, "Au moins une équipe ne marque pas", null]];
      for (const [market, sel, p, label, i] of sels) {
        const od = om[market + "|" + sel]; if (!od || !U.isNum(od.v) || od.v <= 1) continue;
        const pModel = mm && i !== null ? [mm.p1, mm.pN, mm.p2][i] : p;
        const pMkt = mkt && i !== null ? mkt[i] : 1 / od.v;
        out.push({ matchId: m.id, comp: m.comp, date: m.date, time: m.time || "", kickoff: ko ? new Date(ko).toISOString() : null, home: m.home, away: m.away,
          market, sel, label, p, odds: od.v, oddsSrc: od.src, rel: pr.reliability, pModel, pMkt, agree: pModel >= pMkt, predictionId: pr.id });
      }
    }
    return out;
  }
  function trainedTicketRule(id) {
    const t = FQ.TRAINED && FQ.TRAINED.tickets;
    const r = t && (t.scenarios || []).find((x) => x.id === id);
    return r && r.rule ? r.rule : "marché";
  }
  function settleTicketLegs(ctx, t) {
    for (const l of t.legs) {
      if (l.status !== "EN ATTENTE" && !(l.status === "À VÉRIFIER" && l.market === "Buteur")) continue;
      const m = ctx.matchById ? ctx.matchById.get(l.matchId) : ctx.matches.find((x) => x.id === l.matchId);
      const r = ctx.state.results[l.matchId];
      if ((m && (m.status === "REPORTÉ" || m.status === "ANNULÉ")) || (r && (r.status === "REPORTÉ" || r.status === "ANNULÉ"))) { l.status = "ANNULÉ"; continue; }
      const hg = r && U.isNum(r.hg) ? r.hg : m ? m.hg : null, ag = r && U.isNum(r.ag) ? r.ag : m ? m.ag : null;
      if (!U.isNum(hg) || !U.isNum(ag) || !l.market) continue;
      const w = legWon(l.market, l.sel, hg, ag, m ? m.goals : null);
      l.score = `${hg}-${ag}`;
      if (w === null) { l.status = "À VÉRIFIER"; continue; }
      l.status = w ? "GAGNÉ" : "PERDU";
    }
  }
  /** Règle un ticket (fictif ou réel) : une jambe perdue suffit ; jambe annulée = cote 1 */
  function settleTicket(ctx, t, now) {
    settleTicketLegs(ctx, t);
    if (t.manualStatus) { t.status = t.manualStatus; }
    else if (t.legs.some((l) => l.status === "PERDU")) t.status = "PERDU";
    else if (t.legs.length && t.legs.every((l) => l.status !== "EN ATTENTE") && t.legs.some((l) => l.status === "À VÉRIFIER")) { if (t.status === "À VÉRIFIER") return false; t.status = "À VÉRIFIER"; t.profit = 0; return true; }
    else if (t.legs.length && t.legs.every((l) => l.status !== "EN ATTENTE")) {
      const live = t.legs.filter((l) => l.status === "GAGNÉ");
      if (!live.length) t.status = "ANNULÉ";
      else if (t.legs.some((l) => l.status === "ANNULÉ")) {
        // cote recalculée sans les jambes annulées quand toutes les cotes de jambe sont connues
        if (t.legs.every((l) => l.status !== "ANNULÉ" || U.isNum(l.odds))) { t.status = "GAGNÉ"; t.settledOdds = t.legs.filter((l) => l.status === "ANNULÉ").reduce((a, l) => a / l.odds, t.totalOdds); }
        else t.status = "À VÉRIFIER";
      } else t.status = "GAGNÉ";
    } else return false;
    if (t.status === "EN ATTENTE") return false;
    const odds = U.isNum(t.settledOdds) ? t.settledOdds : t.totalOdds;
    t.profit = t.status === "GAGNÉ" ? Math.round(t.stake * (odds - 1) * 100) / 100 : t.status === "PERDU" ? -t.stake : 0;
    t.settledAt = t.settledAt || now;
    return true;
  }
  /**
   * Paper betting : un jeu de 3 tickets par semaine (lundi → dimanche). Construit à partir du jeudi sur les matchs jeudi → dimanche
   * avec les cotes publiées, réoptimisé à chaque cycle tant qu'aucune rencontre du ticket n'a commencé, figé au premier coup d'envoi, réglé à l'audit.
   */
  function updateTickets(ctx, rep) {
    const s = ctx.state, now = new Date().toISOString(), nowMs = Date.now();
    s.paperTickets = s.paperTickets || []; s.realBets = s.realBets || [];
    for (const t of s.paperTickets.concat(s.realBets)) if ((t.status === "EN ATTENTE" || (t.status === "À VÉRIFIER" && !t.manualStatus)) && settleTicket(ctx, t, now) && rep) rep.ticketsSettled = (rep.ticketsSettled || 0) + 1;
    const started = (t) => t.legs.some((l) => { const m = ctx.matchById ? ctx.matchById.get(l.matchId) : null; return m ? kickoffPassed(m, nowMs) : l.date < ctx.today; });
    for (const t of s.paperTickets) if (t.status === "EN ATTENTE" && !t.frozen && started(t)) { t.frozen = true; t.frozenAt = now; }
    if (s.settings.paperTickets === false) return;
    const win = ticketWindow(ctx.today, s.settings);
    if (!win.open) return;
    const cands = ticketCandidates(ctx, win);
    for (const sc of scenarios(s.settings)) {
      const rule = trainedTicketRule(sc.id);
      const mine = s.paperTickets.find((t) => t.scenario === sc.id && t.week === win.week);
      if (mine && (mine.frozen || mine.status !== "EN ATTENTE")) continue; // ticket de la semaine déjà engagé
      let tk = buildTicket(cands, sc, { agree: rule === "accord" });
      let ruleUsed = rule;
      if (!tk && rule === "accord") { tk = buildTicket(cands, sc, {}); ruleUsed = "marché"; }
      if (!tk) { if (mine && mine.legs.some((l) => !cands.some((c) => c.matchId === l.matchId))) s.paperTickets.splice(s.paperTickets.indexOf(mine), 1); continue; }
      const legs = tk.legs.map((c) => ({ matchId: c.matchId, comp: c.comp, date: c.date, time: c.time, kickoff: c.kickoff, home: c.home, away: c.away, market: c.market, sel: c.sel, label: c.label,
        p: Math.round(c.p * 10000) / 10000, odds: c.odds, oddsSrc: c.oddsSrc, rel: c.rel, agree: c.agree, status: "EN ATTENTE" }));
      const body = { scenario: sc.id, label: sc.label, week: win.week, window: [win.from, win.to], target: [sc.lo, sc.hi], rule: ruleUsed, legs, totalOdds: Math.round(tk.totalOdds * 100) / 100, pJoint: tk.pJoint, ev: tk.ev, stake: sc.stake, updatedAt: now };
      if (mine) {
        const same = mine.legs.length === legs.length && mine.legs.every((l, i) => l.matchId === legs[i].matchId && l.sel === legs[i].sel && l.odds === legs[i].odds);
        if (!same) { Object.assign(mine, body); mine.revisions = (mine.revisions || 0) + 1; }
      } else {
        s.paperTickets.push(Object.assign({ id: U.uid("tk"), createdAt: now, status: "EN ATTENTE", frozen: false, profit: 0, revisions: 0 }, body));
        if (rep) rep.ticketsNew = (rep.ticketsNew || 0) + 1;
      }
    }
  }
  /** Aperçu des 3 tickets sur une fenêtre (par défaut celle de la semaine ; avant jeudi : les cotes déjà publiées jusqu'à dimanche) */
  function previewTickets(ctx, winArg) {
    const w0 = ticketWindow(ctx.today, ctx.state.settings);
    const win = winArg || (w0.open ? w0 : Object.assign({}, w0, { start: ctx.today }));
    const cands = ticketCandidates(ctx, win);
    return scenarios(ctx.state.settings).map((sc) => {
      const rule = trainedTicketRule(sc.id);
      let tk = buildTicket(cands, sc, { agree: rule === "accord" }), ruleUsed = rule;
      if (!tk && rule === "accord") { tk = buildTicket(cands, sc, {}); ruleUsed = "marché"; }
      return { sc, rule: ruleUsed, ticket: tk, nCands: cands.length, nMatches: new Set(cands.map((c) => c.matchId)).size, win };
    });
  }

  /* ----------------------------------------------- compactage de l'état */
  /** Une seule prédiction conservée par match (la dernière, figée au coup d'envoi) ; sélections remplacées supprimées ; anciennes analyses allégées */
  function compactState(s, today) {
    const keepBet = new Set(s.bets.map((b) => b.predictionId)), keepOpp = new Set(s.bets.map((b) => b.opportunityId));
    const last = new Map(); for (const p of s.predictions) last.set(p.matchId, p.id);
    const cut = U.addDays(today, -45);
    const before = s.predictions.length + s.opportunities.length;
    s.predictions = s.predictions.filter((p) => last.get(p.matchId) === p.id || keepBet.has(p.id)).map((p) => {
      if (p.date >= cut || keepBet.has(p.id) || p.slim) return p;
      return { id: p.id, slim: true, createdAt: p.createdAt, matchId: p.matchId, comp: p.comp, date: p.date, home: p.home, away: p.away, markets: p.markets, raw: p.raw,
        players: (p.players || []).map((x) => ({ name: x.name, pScoreRaw: x.pScoreRaw })), reliability: p.reliability, pick: p.pick, engineVersion: p.engineVersion, origin: p.origin, dataSource: p.dataSource };
    });
    const preds = new Set(s.predictions.map((p) => p.id));
    s.opportunities = s.opportunities.filter((o) => keepOpp.has(o.id) || (o.status !== "remplacée" && (o.predictionId === null || preds.has(o.predictionId)) && (o.date >= cut || o.status === "pariée")));
    s.log = (s.log || []).slice(-300);
    return before - s.predictions.length - s.opportunities.length;
  }

  /* ----------------------------------------------- cycle automatique */
  const HORIZON_DAYS = 14;
  /**
   * Un cycle complet, idempotent : relancer sans nouvelle donnée ne change rien.
   * 1. intègre les résultats disponibles et règle les paris (audit automatique)
   * 2. clôt les opportunités dont le match a commencé
   * 3. analyse les rencontres des 7 prochains jours (une prédiction par version de données)
   * 4. enregistre les paris fictifs VALUE BET (mises en unités, plafonds appliqués)
   * 5. tente un apprentissage de calibration quand assez de nouvelles observations sont résolues
   */
  function runCycle(ctx, origin) {
    const s = ctx.state;
    const t0 = Date.now();
    const rep = { at: new Date().toISOString(), origin, audited: 0, settled: 0, analysed: 0, insufficient: 0, autoBets: 0, staked: 0, closed: 0, calibration: null, notes: [] };
    // 1. audit automatique
    const audited = new Set(s.audits.filter((a) => !a.reverted).map((a) => a.matchId));
    const toCheck = new Set([...s.predictions.map((p) => p.matchId), ...s.bets.filter((b) => b.status === "EN ATTENTE").map((b) => b.matchId)]);
    for (const id of toCheck) {
      if (audited.has(id)) continue;
      const m = ctx.matchById ? ctx.matchById.get(id) : ctx.matches.find((x) => x.id === id);
      if (!m || m.hg === null || m.date > ctx.today) continue;
      const r = auditMatch(s, m, resultFromSource(m), { origin: "auto" });
      if (r) { rep.audited++; rep.settled += r.settled.length; }
    }
    // 2. clôture des opportunités dont le match est passé sans résultat
    for (const op of s.opportunities) {
      if (op.status !== "ouverte" || op.date >= ctx.today) continue;
      op.status = Number.isFinite(op.odds) && FQ.value.expectedValue(op.p, op.odds) > 0 ? "passée" : "expirée";
      op.decidedAt = rep.at; rep.closed++;
    }
    // 3. analyse des rencontres à venir
    const end = U.addDays(ctx.today, (s.settings.horizonDays || HORIZON_DAYS) - 1);
    const nowMs = Date.now();
    const upcoming = ctx.matches.filter((m) => m.status === "PROGRAMMÉ" && m.date >= ctx.today && m.date <= end && !kickoffPassed(m, nowMs));
    const a = analyzeList(ctx, upcoming, { force: true, refresh: true, origin: "auto" });
    rep.analysed = a.analysed; rep.insufficient = a.insufficient;
    // 4. paris fictifs automatiques : seulement si la politique validée sur l'historique l'autorise
    const mode = s.settings.autoBetMode || "policy";
    const pol = FQ.TRAINED && FQ.TRAINED.policy;
    const allowBets = ctx.mode === "demo" || mode === "always" || (mode === "policy" && pol && pol.autoBetting);
    if (!allowBets) rep.notes.push(mode === "never" ? "Paris automatiques désactivés dans les paramètres." : "Paris automatiques suspendus : aucune stratégie de mise n'a été rentable sur l'historique d'apprentissage (12 mois). Les choix préférentiels restent publiés et suivis.");
    const open = !allowBets ? [] : s.opportunities.filter((o) => o.status === "ouverte" && Number.isFinite(o.odds) && !o.insufficient && o.date >= ctx.today);
    let rows = FQ.evaluateAll(open, { settings: effSettings(ctx), acct: FQ.accounting(s.bets, s.settings.initialBankroll), bets: s.bets, qtable: FQ.qtableFromLog(s.qlog) })
      .filter((r) => r.decision === "VALUE BET").sort((x, y) => y.score - x.score);
    for (const r of rows) {
      const acct = FQ.accounting(s.bets, s.settings.initialBankroll);
      const mExp = s.bets.filter((b) => b.matchId === r.opp.matchId && b.status === "EN ATTENTE").reduce((x, b) => x + b.stake, 0);
      const st = FQ.computeStake(r.opp.p, r.opp.odds, effSettings(ctx), acct, mExp);
      if (!(st.stake > 0)) continue;
      const o = r.opp;
      o.status = "pariée"; o.decidedAt = rep.at; o.exposureShare = acct.openStakes / (s.settings.maxTotalPct * acct.bankroll);
      s.bets.push({ id: U.uid("bet"), createdAt: rep.at, opportunityId: o.id, predictionId: o.predictionId, matchId: o.matchId, comp: o.comp, date: o.date, match: o.match, market: o.market, selection: o.selection, playerName: o.playerName || null,
        p: o.p, rel: o.rel, odds: o.odds, oddsSource: o.oddsSource, ev: r.ev, stake: st.stake, decision: "VALUE BET", reasons: r.reasons, stakeSteps: st.steps, status: "EN ATTENTE", profit: 0,
        engineVersion: FQ.ENGINE_VERSION, calibrationVersion: s.calibration.version, agent: r.agent || null, origin: "auto" });
      rep.autoBets++; rep.staked += st.stake;
    }
    // 4 bis. tickets combinés (paper betting, 3 scénarios) et règlement des paris réels saisis
    const tkBefore = JSON.stringify((s.paperTickets || []).map((t) => [t.id, t.status, t.updatedAt, t.frozen]).concat((s.realBets || []).map((t) => [t.id, t.status])));
    updateTickets(ctx, rep);
    rep.clv = updateClv(ctx);
    rep.ticketsChanged = tkBefore !== JSON.stringify((s.paperTickets || []).map((t) => [t.id, t.status, t.updatedAt, t.frozen]).concat((s.realBets || []).map((t) => [t.id, t.status])));
    // 5. apprentissage
    const resolvedPreds = s.predictions.filter((p) => s.results[p.matchId] && Number.isFinite(s.results[p.matchId].hg)).length;
    s.autoMeta = s.autoMeta || { lastCalibN: 0 };
    if (resolvedPreds >= s.settings.calibMinN && resolvedPreds - (s.autoMeta.lastCalibN || 0) >= 10) {
      const e = learnCalibration(s, "auto");
      s.autoMeta.lastCalibN = resolvedPreds;
      rep.calibration = e.changed ? `calibration v${s.calibration.version} retenue` : "aucun ajustement justifié";
    }
    // notes de fraîcheur
    if (ctx.dataAgeDays !== undefined && ctx.dataAgeDays > 10) rep.notes.push(`Source libre mise à jour il y a ${ctx.dataAgeDays} j : résultats récents peut-être manquants.`);
    if (allowBets && !rows.length && open.length === 0 && s.opportunities.some((o) => o.status === "ouverte" && !Number.isFinite(o.odds) && !o.insufficient)) rep.notes.push("Aucune cote disponible : probabilités, cotes justes et cotes minimales publiées, aucun pari engagé.");
    rep.compacted = compactState(s, ctx.today);
    rep.ms = Date.now() - t0;
    rep.changed = rep.audited + rep.analysed + rep.insufficient + rep.autoBets + rep.closed + rep.compacted + (rep.clv || 0) > 0 || !!rep.calibration || rep.ticketsChanged;
    if (rep.changed) {
      s.autoLog = (s.autoLog || []).concat([rep]).slice(-80);
    }
    return rep;
  }

  /* ----------------------------------------------- découpage pour la base */
  const CHUNK = 150000;
  function chunkText(txt) { const out = []; for (let i = 0; i < txt.length; i += CHUNK) out.push(txt.slice(i, i + CHUNK)); return out.length ? out : [""]; }
  function dataSignature(ds) { return Object.values(ds.source.repos).map((r) => r.commit).join("-"); }

  FQ.P = { buildPrediction, makeSnapshot, standingsSnapshot, demoOddsMap, matchOddsMap, effSettings, upsertPick, settlePicks, kickoffPassed, defaultPlayersFor, computePlayer, analyzeList, auditMatch, resultFromSource, learnCalibration, runCycle, chunkText, dataSignature, CHUNK, HORIZON_DAYS,
    SCENARIOS, scenarios, buildTicket, ticketCandidates, ticketWindow, updateTickets, previewTickets, settleTicket, legWon, compactState, refOdds, closingFor, clvOf, updateClv };
})(typeof window !== "undefined" ? window : globalThis);
