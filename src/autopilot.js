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
    const po = probOdds(match);
    if (pr.ok && po && bl && bl.accepted && !opts.noBlend && ctx.mode !== "demo") {
      const w = bl.byComp && bl.byComp[match.comp] !== undefined ? bl.byComp[match.comp] : bl.w;
      const B = FQ.blend([pr.markets.p1, pr.markets.pN, pr.markets.p2], po.t, w, bl.devig || "norm");
      if (B.used) {
        pr.modelMarkets = { p1: pr.markets.p1, pN: pr.markets.pN, p2: pr.markets.p2 };
        pr.blendInfo = { w, market: B.market, src: po.src, method: bl.devig || "norm" };
        pr.markets = Object.assign({}, pr.markets, { p1: B.p3[0], pN: B.p3[1], p2: B.p3[2] });
      }
    }
    // marchés de buts (plus/moins de 2,5, les deux équipes marquent) : mêlés à la cote réelle quand elle existe (poids appris sur l'historique ±2,5)
    const bg = FQ.TRAINED && FQ.TRAINED.blendGoals;
    const xo = ctx.mode !== "demo" ? extraOdds(match, ctx.state.settings) : null;
    if (pr.ok && bg && bg.accepted && xo && !opts.noBlend) {
      const two = (a, b) => (1 / a) / (1 / a + 1 / b);
      const mk2 = Object.assign({}, pr.markets), gm = {};
      if (xo.ou && U.isNum(mk2.over25)) { gm.over = two(xo.ou.o, xo.ou.u); gm.overModel = mk2.over25; mk2.over25 = bg.w * mk2.over25 + (1 - bg.w) * gm.over; }
      if (xo.btts) { gm.btts = two(xo.btts.y, xo.btts.n); gm.bttsModel = mk2.bttsYes; mk2.bttsYes = bg.w * mk2.bttsYes + (1 - bg.w) * gm.btts; mk2.bttsNo = 1 - mk2.bttsYes; }
      pr.markets = mk2; pr.goalsBlend = Object.assign({ w: bg.w }, gm);
    }
    const ch = FQ.teamContext(ctx.matches, match.comp, match.home, match.date, ctx.today);
    const ca = FQ.teamContext(ctx.matches, match.comp, match.away, match.date, ctx.today);
    const lastComp = ctx.matches.filter((m) => m.comp === match.comp && m.hg !== null && m.date < asOf).map((m) => m.date).sort().slice(-1)[0];
    const staleDays = lastComp ? U.daysBetween(lastComp, asOf) : 999;
    const missing = ch.missing + ca.missing;
    const rel = FQ.reliability(model, match, { drivers: opts.drivers, manualLambda: opts.manualLambda, missingResults: missing, staleDays });
    return { asOf, model, pr, ch, ca, rel, missing, staleDays, stakeInfo };
  }

  /**
   * Cotes servant à estimer les probabilités (pas à parier) : les plus précises disponibles.
   * Bet 365 (marge faible) quand il existe, sinon la médiane des bookmakers français.
   */
  function probOdds(match) {
    const o = match && match.odds;
    if (o && o.h && o.d && o.a) return { t: [o.h, o.d, o.a], src: o.src };
    const fr = match && match.oddsFr;
    if (fr && fr.books && Object.keys(fr.books).length) {
      const k = Object.keys(fr.books);
      return { t: [0, 1, 2].map((i) => median(k.map((x) => fr.books[x][i]))), src: "médiane des bookmakers français" };
    }
    return null;
  }

  function makeSnapshot(ctx, match, b, opts, players, oddsMap) {
    const now = new Date().toISOString();
    const predId = U.uid("pred");
    const mk = b.pr.markets;
    const pred = {
      id: predId, createdAt: now, matchId: match.id, comp: match.comp, date: match.date, home: match.home, away: match.away,
      lambdaHome: b.pr.lambdaHome, lambdaAway: b.pr.lambdaAway, rho: b.pr.rho, source: b.pr.source,
      markets: { p1: mk.p1, pN: mk.pN, p2: mk.p2, bttsYes: mk.bttsYes, over25: U.isNum(mk.over25) ? mk.over25 : null }, raw: b.pr.raw, goalsBlend: b.pr.goalsBlend || null, topScores: mk.topScores.slice(0, 5),
      players: players.map((p) => ({ name: p.name, team: p.team, pScore: p.pScore, pScoreRaw: p.pScoreRaw, pDecisive: p.pDecisive, rel: p.rel, inputs: p.inputs })),
      reliability: b.rel.score, reliabilityDetail: b.rel, drivers: opts.drivers || {}, neutral: !!opts.neutral, manualLambda: opts.manualLambda || null,
      missing: b.missing, staleDays: b.staleDays,
      engineVersion: FQ.ENGINE_VERSION, calibrationVersion: ctx.state.calibration.version,
      modelSummary: b.model && b.model.ok ? { mu: b.model.mu, gamma: b.model.gamma, rho: b.model.rho, nMatches: b.model.nMatches, asOf: b.model.asOf,
        home: b.model.teams[match.home], away: b.model.teams[match.away] } : null,
      dataSource: ctx.mode === "demo" ? "démo fictive" : `${match.source}${match.sourceCommitDate ? " (relevé " + match.sourceCommitDate.slice(0, 16).replace("T", " ") + ")" : ""}`,
      demo: ctx.mode === "demo",
      standings: standingsSnapshot(ctx, match),
      form: { h: (b.ch.last5 || []).map((x) => x.r).join(""), a: (b.ca.last5 || []).map((x) => x.r).join("") },
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
  function refOdds(match, set, book) {
    const fr = match && match.oddsFr, o = match && match.odds;
    const at = (x) => (x && x.at ? Date.parse(x.at) : 0);
    const names = FR_NAMES();
    const frUsable = fr && fr.books && Object.keys(fr.books).length && !(o && o.h && at(o) > at(fr) && Date.now() - at(fr) > 72 * 3600e3);
    const stamp = fr ? ` · relevée le ${String(fr.at).slice(0, 16).replace("T", " ")} UTC` : "";
    if (book) { // un bookmaker précis (construction d'un ticket chez ce bookmaker)
      const b = frUsable && fr.books[book];
      return b ? { h: b[0], d: b[1], a: b[2], src: `${names[book] || book} (The Odds API)${stamp}`, at: fr.at, book, fr: true } : null;
    }
    const pref = (set && set.oddsBook) || "best";
    if (frUsable) {
      const b = pref !== "best" && fr.books[pref];
      if (b) return { h: b[0], d: b[1], a: b[2], src: `${names[pref] || pref} (The Odds API)${stamp}`, at: fr.at, book: pref, fr: true };
      // meilleur prix par issue parmi les bookmakers français relevés
      const keys = Object.keys(fr.books);
      const best = [0, 1, 2].map((i) => { let k = keys[0]; for (const x of keys) if (fr.books[x][i] > fr.books[k][i]) k = x; return { v: fr.books[k][i], k }; });
      const srcs = best.map((x) => `meilleure cote FR : ${names[x.k] || x.k} (The Odds API)${stamp}`);
      return { h: best[0].v, d: best[1].v, a: best[2].v, srcs, books: best.map((x) => x.k), src: srcs[0], at: fr.at, book: "best", fr: true };
    }
    if (o && o.h) return Object.assign({}, o, { src: o.src + (o.at ? ` · relevée le ${String(o.at).slice(0, 16).replace("T", " ")} UTC` : "") + " · aucune cote française disponible", fr: false });
    return null;
  }
  /**
   * Cotes complémentaires relevées (The Odds API, bookmakers français) : les deux équipes marquent, plus/moins de 2,5 buts.
   * Bookmaker demandé, sinon meilleur prix parmi les bookmakers qui les proposent (souvent NetBet ou PMU).
   */
  function extraOdds(match, set, book) {
    const x = match && match.oddsFrX; if (!x) return null;
    const names = FR_NAMES(), stamp = ` · relevée le ${String(x.at).slice(0, 16).replace("T", " ")} UTC`;
    const tb = {}; for (const [k, lines] of Object.entries(x.totals || {})) if (lines["2.5"]) tb[k] = lines["2.5"];
    const pick = (obj, i) => {
      if (book) return obj[book] ? { k: book, v: obj[book][i] } : null;
      let best = null; for (const [k, v] of Object.entries(obj || {})) if (!best || v[i] > best.v) best = { k, v: v[i] };
      return best;
    };
    const out = {};
    const y = pick(x.btts, 0), n = pick(x.btts, 1);
    if (y && n) out.btts = { y: y.v, n: n.v, srcY: `${names[y.k] || y.k} (The Odds API)${stamp}`, srcN: `${names[n.k] || n.k} (The Odds API)${stamp}` };
    const ov = pick(tb, 0), un = pick(tb, 1);
    if (ov && un) out.ou = { o: ov.v, u: un.v, srcO: `${names[ov.k] || ov.k} (The Odds API)${stamp}`, srcU: `${names[un.k] || un.k} (The Odds API)${stamp}` };
    return Object.keys(out).length ? out : null;
  }
  /**
   * Double chance : aucune source ne la publie pour les bookmakers français. Cote déduite du 1N2 réel du même bookmaker,
   * comme le font les bookmakers (1 / (1/c₁ + 1/c₂), arrondi à l'inférieur), puis corrigée par le rapport « cote réelle / cote déduite »
   * appris sur les tickets double chance saisis par Iso. Toujours affichée comme estimée.
   */
  function dcOdds(o, factor) {
    const f = U.isNum(factor) && factor > 0.8 && factor < 1.2 ? factor : 1;
    const d = (a, b) => Math.floor((1 / (1 / a + 1 / b)) * f * 100) / 100;
    return { "1N": d(o.h, o.d), "12": d(o.h, o.a), N2: d(o.d, o.a) };
  }
  /**
   * Cotes du match au format attendu par les opportunités et les tickets.
   * ol : corrections apprises (ol.dcFactor) ; book : un bookmaker précis (sinon meilleur prix FR) ;
   * user : cotes saisies par Iso (clé « matchId|marché|sélection »), prioritaires et marquées comme telles.
   */
  function matchOddsMap(match, set, ol, book, user) {
    const o = refOdds(match, set, book);
    const m = {};
    if (o) {
      const sr = (i) => (o.srcs ? o.srcs[i] : o.src);
      m["1N2|1"] = { v: o.h, src: sr(0) }; m["1N2|N"] = { v: o.d, src: sr(1) }; m["1N2|2"] = { v: o.a, src: sr(2) };
      // double chance : déduite du 1N2 d'un même bookmaker (sinon on mélangerait des prix qu'aucun bookmaker ne propose ensemble)
      const one = o.book && o.book !== "best" ? o : (match.oddsFr && match.oddsFr.books ? (() => { const fr = match.oddsFr.books; let k = null, mg = Infinity; for (const [x, t] of Object.entries(fr)) { const g = 1 / t[0] + 1 / t[1] + 1 / t[2]; if (g < mg) { mg = g; k = x; } } return k ? { h: fr[k][0], d: fr[k][1], a: fr[k][2], src: (FR_NAMES()[k] || k) } : null; })() : o);
      if (one) {
        const dc = dcOdds(one, ol && ol.dcFactor), short = String(one.src).split(" (")[0].split(" ·")[0];
        for (const k of ["1N", "12", "N2"]) if (dc[k] > 1.01) m["DC|" + k] = { v: dc[k], src: `estimée d'après le 1N2 ${short}${ol && ol.dcN ? ` (corrigée sur ${ol.dcN} cote(s) réelle(s))` : ""}`, est: true };
      }
    }
    const x = extraOdds(match, set, book);
    if (x && x.btts) { m["BTTS|Oui"] = { v: x.btts.y, src: x.btts.srcY }; m["BTTS|Non"] = { v: x.btts.n, src: x.btts.srcN }; }
    if (x && x.ou) { m["Buts|+2.5"] = { v: x.ou.o, src: x.ou.srcO }; m["Buts|-2.5"] = { v: x.ou.u, src: x.ou.srcU }; }
    if (user) for (const [k, u] of Object.entries(user)) {
      if (!k.startsWith(match.id + "|") || !(u && u.v > 1)) continue;
      const key = k.slice(match.id.length + 1);
      m[key] = { v: u.v, src: `saisie par toi${u.book ? " (" + u.book + ")" : ""} le ${String(u.at || "").slice(0, 10)}`, user: true };
    }
    return Object.keys(m).length ? m : null;
  }
  /** Rapport médian « cote double chance réelle / cote déduite » sur les tickets saisis (au moins 3 sélections double chance) */
  function learnDcFactor(state) {
    const r = [];
    for (const b of state.realBets || []) for (const l of b.legs || []) if (l.market === "DC" && U.isNum(l.odds) && U.isNum(l.estOdds) && l.estOdds > 1) r.push(l.odds / l.estOdds);
    state.oddsLearn = state.oddsLearn || {};
    if (r.length >= 3) { state.oddsLearn.dcFactor = Math.round(median(r) * 1000) / 1000; state.oddsLearn.dcN = r.length; }
    return state.oddsLearn;
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
      const snap = makeSnapshot(ctx, m, b, { origin: o.origin || "manuel" }, players, ctx.mode === "demo" ? demoOddsMap(ctx, m, players) : matchOddsMap(m, ctx.state.settings, ctx.state.oddsLearn, null, ctx.state.userOdds));
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
    { id: "sur", label: "Sûr", lo: 1.4, hi: 1.8, maxLegs: 3, maxLegOdds: 1.8, stake: 1 },
    { id: "prudent", label: "Prudent", lo: 3, hi: 4, maxLegs: 6, maxLegOdds: 2.6, stake: 1 },
    { id: "equilibre", label: "Équilibré", lo: 7, hi: 8, maxLegs: 9, maxLegOdds: 3.6, stake: 1 },
    { id: "audacieux", label: "Audacieux", lo: 40, hi: 60, maxLegs: 15, maxLegOdds: 6, stake: 1 },
  ];
  function scenarios(settings) {
    const cfg = (settings && settings.ticketCfg) || [];
    return SCENARIOS.map((sc) => {
      const c = cfg.find((x) => x && x.id === sc.id) || {};
      const lo = U.isNum(c.lo) && c.lo > 1.05 ? c.lo : sc.lo, hi = U.isNum(c.hi) && c.hi > lo ? c.hi : Math.max(sc.hi, lo * 1.1);
      return Object.assign({}, sc, { lo, hi, stake: U.isNum(c.stake) && c.stake >= 0 ? c.stake : sc.stake,
        maxLegOdds: Math.max(sc.maxLegOdds, Math.min(15, Math.sqrt(hi) + 0.5)), maxLegs: hi > 80 ? 15 : sc.maxLegs });
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
    if (market === "W2") {
      // « gagne ou mène de 2 buts » (Betclic) : gagné si l'équipe gagne, ou si elle a mené de 2 buts à un moment (minutes des buts)
      const home = sel === "1";
      if (home ? hg > ag : ag > hg) return true;
      if (!Array.isArray(goals) || goals.length !== hg + ag) return null;
      const min = (c) => { const m = /^(\d+)(?:\D+(\d+))?/.exec(String(c || "")); return m ? +m[1] + (m[2] ? +m[2] / 100 : 0) : 999; };
      let h = 0, a = 0;
      for (const g of goals.slice().sort((x, y) => min(x[2]) - min(y[2]))) { if (g[0] === 0) h++; else a++; if ((home ? h - a : a - h) >= 2) return true; }
      return false;
    }
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
  /*
   * Objectif : chance de gain ET profit. À cote totale fixée O, chance = Π(p × cote) / O et espérance = Π(p × cote) − 1 :
   * les deux montent ensemble avec le « rendement » des sélections (p × cote, 1 = prix juste). On garde donc les sélections
   * où le bookmaker prélève le moins, et le nombre de sélections qui donne la meilleure chance (souvent peu : chaque sélection
   * ajoute sa marge), puis, parmi les tickets dont la chance est à moins de opt.tol (10 %) de la meilleure, celui qui rapporte le plus.
   * Probabilité prudente c.pR (si fournie) : probabilité diminuée quand modèle et marché ne sont pas d'accord ; elle sert au choix,
   * la chance affichée reste celle de la probabilité retenue c.p.
   * Retour : byN = meilleur ticket trouvé pour chaque nombre de sélections (pour comparer 3, 4, 7, 10 sélections…).
   */
  function buildTicket(cands, sc, opt) {
    const o = opt || {};
    const LO = Math.log(sc.lo), HI = Math.log(sc.hi);
    const boost = typeof o.boost === "function" ? o.boost : () => 0; // bonus de cote selon le nombre de sélections (Multiboost)
    const lb = (lo, n) => lo + Math.log(1 + boost(n));
    const pool = cands.filter((c) => U.isNum(c.odds) && c.odds >= 1.05 && c.odds <= sc.maxLegOdds && U.isNum(c.p) && c.p > 0.04 && (!o.agree || c.agree))
      .map((c) => ({ c, lo: Math.log(c.odds), lp: Math.log(c.p), lr: Math.log(U.isNum(c.pR) && c.pR > 0 ? Math.min(c.p, c.pR) : c.p) }))
      .sort((a, b) => b.lr + b.lo - (a.lr + a.lo) || b.lr - a.lr).slice(0, o.pool || 160);
    const ev = o.objective === "ev";
    const key = (z) => (ev ? z.lr + z.lo + Math.log(1 + boost(z.idx.length)) : z.lr); // chance prudente (défaut) ou espérance prudente
    const tol = U.isNum(o.tol) ? o.tol : 0.1;
    let beam = [{ idx: [], last: -1, lo: 0, lp: 0, lr: 0 }];
    const top = [], byN = {};
    for (let d = 0; d < sc.maxLegs && beam.length; d++) {
      const next = [];
      for (const st of beam) {
        for (let i = st.last + 1; i < pool.length; i++) {
          const x = pool[i];
          if (st.idx.some((j) => pool[j].c.matchId === x.c.matchId)) continue;
          const lo = st.lo + x.lo, n = st.idx.length + 1, b = lb(lo, n);
          if (b > HI + 1e-9) continue;
          const ns = { idx: st.idx.concat([i]), last: i, lo, lp: st.lp + x.lp, lr: st.lr + x.lr };
          // dans la fourchette : candidat (ajouter une sélection ne ferait que baisser la chance de gain)
          if (b >= LO - 1e-9) {
            if (!byN[n] || key(ns) > key(byN[n])) byN[n] = ns;
            top.push(ns); if (top.length > 400) { top.sort((a, c) => key(c) - key(a)); top.length = 60; }
          } else next.push(ns);
        }
      }
      next.sort((a, b) => b.lr + b.lo - (a.lr + a.lo));
      beam = next.slice(0, o.beam || 500);
    }
    if (!top.length) return null;
    top.sort((a, c) => key(c) - key(a) || a.idx.length - c.idx.length);
    // chance (prudente) maximale ; à chance quasi égale (écart < tol), le ticket qui rapporte le plus
    const evOf = (z) => z.lr + z.lo + Math.log(1 + boost(z.idx.length));
    const near = ev ? [top[0]] : top.filter((z) => z.lr >= top[0].lr + Math.log(1 - tol));
    const best = near.reduce((a, z) => (evOf(z) > evOf(a) + 1e-12 ? z : a), near[0]);
    const pack = (z) => { const raw = Math.exp(z.lo), bonus = boost(z.idx.length), tot = raw * (1 + bonus), p = Math.exp(z.lp); return { n: z.idx.length, totalOdds: tot, rawOdds: raw, boost: bonus, pJoint: p, pRobust: Math.exp(z.lr), ev: p * tot - 1 }; };
    const legs = best.idx.map((j) => pool[j].c).sort((a, b) => ((a.kickoff || a.date) < (b.kickoff || b.date) ? -1 : 1));
    return Object.assign(pack(best), { legs, byN: Object.keys(byN).map(Number).sort((a, b) => a - b).map((n) => pack(byN[n])) });
  }

  /**
   * Multiboost Betclic : bonus sur la cote totale d'un combiné selon le nombre de sélections (à partir de 5).
   * Barème de départ relevé sur les tickets réels d'Iso (8 → +4,7 %, 10 → +6,2 %, 11 → +6,2 %, 13 → +7,7 %),
   * remplacé point par point par les bonus observés sur les tickets Betclic qu'il saisit (cote totale ÷ produit des cotes).
   */
  const BOOST_SEED = [[8, 0.0468], [10, 0.062], [11, 0.0623], [13, 0.0774]];
  function boostTable(state) {
    const pts = new Map(BOOST_SEED);
    const obs = {};
    for (const b of (state && state.realBets) || []) {
      if (!/betclic/i.test(b.bookmaker || "") || !b.legs || b.legs.length < 5 || !b.legs.every((l) => U.isNum(l.odds) && l.odds > 1) || !(b.totalOdds > 1)) continue;
      const prod = b.legs.reduce((a, l) => a * l.odds, 1), r = b.totalOdds / prod - 1;
      if (r >= 0 && r < 1) (obs[b.legs.length] = obs[b.legs.length] || []).push(r);
    }
    for (const [n, v] of Object.entries(obs)) pts.set(+n, median(v));
    return [...pts.entries()].sort((a, b) => a[0] - b[0]);
  }
  function boostFor(table, n) {
    if (n < 5 || !table.length) return 0;
    const exact = table.find((x) => x[0] === n); if (exact) return exact[1];
    let lo = null, hi = null;
    for (const x of table) { if (x[0] < n) lo = x; if (x[0] > n && !hi) hi = x; }
    const slope = table.length > 1 ? (table[table.length - 1][1] - table[0][1]) / (table[table.length - 1][0] - table[0][0]) : 0.007;
    if (lo && hi) return lo[1] + ((hi[1] - lo[1]) * (n - lo[0])) / (hi[0] - lo[0]);
    if (hi) return Math.max(0, hi[1] - slope * (hi[0] - n));
    return Math.min(0.25, lo[1] + slope * (n - lo[0]));
  }
  /** Fonction de bonus à utiliser pour les tickets : seulement si le Multiboost est activé et le bookmaker de référence est Betclic */
  function boostFn(state) {
    const set = (state && state.settings) || {};
    if (set.multiboost !== true) return null; // désactivé par défaut ; appliqué seulement aux tickets chiffrés chez Betclic
    const t = boostTable(state);
    return (n) => boostFor(t, n);
  }

  /** Fenêtre des tickets de la semaine : du jeudi (ou d'aujourd'hui) au dimanche ; open = la construction a commencé */
  function ticketWindow(today, set) {
    const mon = U.weekMonday(today), fromDow = (set && set.ticketFromDow) || 4;
    const from = U.addDays(mon, fromDow - 1), to = U.addDays(mon, 6);
    return { week: mon, from, to, start: today > from ? today : from, open: today >= from };
  }
  /** Sélections jouables pour les tickets : rencontres programmées de la fenêtre, cote réelle connue, analysées par le moteur */
  /**
   * Stratégies de ticket (« bras ») : chaque sélection est l'issue jugée la plus probable de son match,
   * avec une probabilité minimale. Toutes sont suivies chaque semaine ; la meilleure d'après les résultats est jouée.
   */
  const TICKET_ARMS = [
    { id: "fav45", label: "Favoris ≥ 45 %", pMin: 0.45, top: true, markets: ["1N2"], family: "favoris" },
    { id: "fav55", label: "Favoris ≥ 55 %", pMin: 0.55, top: true, markets: ["1N2"], family: "favoris" },
    { id: "fav65", label: "Favoris ≥ 65 %", pMin: 0.65, top: true, markets: ["1N2"], family: "favoris" },
    { id: "chance_v", label: "1N2 chance max, sans nul", pMin: 0.2, markets: ["1N2"], noDraw: true, family: "chance" },
    { id: "chance", label: "1N2 chance max", pMin: 0, markets: ["1N2"], family: "chance" },
    { id: "securise", label: "Combiné sécurisé multi-marchés (≥ 70 %)", pMin: 0.7, markets: ["1N2", "DC", "BTTS", "Buts"], family: "multi" },
    { id: "multi", label: "Multi-marchés chance max (≥ 50 %)", pMin: 0.5, markets: ["1N2", "DC", "BTTS", "Buts", "Buteur", "Joueur Décisif"], family: "multi" },
    // valeur : seules les sélections à espérance positive (cote réelle ou saisie > cote juste), ticket à espérance maximale ; souvent vide
    { id: "valeur", label: "Valeur : espérance positive seulement", pMin: 0.3, evMin: 0.0, markets: ["1N2", "DC", "BTTS", "Buts", "Buteur", "Joueur Décisif"], family: "valeur", objective: "ev" },
  ];
  /** Sélections admises par une stratégie : marché, issue favorite (ou non), nul exclu (ou non), probabilité minimale */
  const armAllows = (arm, c) => (arm.markets || ["1N2"]).includes(c.market) && (!arm.top || c.top) && !(arm.noDraw && c.market === "1N2" && c.sel === "N") && c.p >= arm.pMin
    && (arm.evMin === undefined || (U.isNum(c.ev) ? c.ev : c.p * c.odds - 1) > arm.evMin);
  const pc = (x) => (U.isNum(x) ? Math.round(100 * x) + " %" : "—");
  /** Libellés et probabilités des sélections d'un match pour chaque marché */
  function selectionsOf(pr, m) {
    const mk = pr.markets, p3 = [mk.p1, mk.pN, mk.p2];
    const out = [["1N2", "1", `1 · ${m.home}`, p3[0]], ["1N2", "N", "N · match nul", p3[1]], ["1N2", "2", `2 · ${m.away}`, p3[2]],
      ["DC", "1N", `${m.home} ou nul`, p3[0] + p3[1]], ["DC", "12", `${m.home} ou ${m.away}`, p3[0] + p3[2]], ["DC", "N2", `Nul ou ${m.away}`, p3[1] + p3[2]],
      ["BTTS", "Oui", "Les deux équipes marquent", mk.bttsYes], ["BTTS", "Non", "Au moins une équipe ne marque pas", 1 - mk.bttsYes]];
    if (U.isNum(mk.over25)) out.push(["Buts", "+2.5", "Plus de 2,5 buts", mk.over25], ["Buts", "-2.5", "Moins de 2,5 buts", 1 - mk.over25]);
    return out;
  }
  /**
   * Probabilités séparées d'une sélection : marché sans marge (mk) et modèle sportif seul (mo), quand elles existent.
   * La probabilité retenue p est leur mélange (poids appris) : c'est elle qui sert aux tickets.
   */
  function legProbs(pr, market, sel) {
    let mk = null, mo = null;
    if (market === "1N2" || market === "DC") {
      const idx = { 1: [0], N: [1], 2: [2], "1N": [0, 1], 12: [0, 2], N2: [1, 2] }[sel] || [];
      if (pr.blend && pr.blend.market) mk = idx.reduce((x, i) => x + pr.blend.market[i], 0);
      const mm = pr.modelMarkets;
      if (mm) mo = idx.reduce((x, i) => x + [mm.p1, mm.pN, mm.p2][i], 0);
    } else if (market === "Buts" && pr.goalsBlend && U.isNum(pr.goalsBlend.over)) { mk = sel === "+2.5" ? pr.goalsBlend.over : 1 - pr.goalsBlend.over; mo = sel === "+2.5" ? pr.goalsBlend.overModel : 1 - pr.goalsBlend.overModel; }
    else if (market === "BTTS" && pr.goalsBlend && U.isNum(pr.goalsBlend.btts)) { mk = sel === "Oui" ? pr.goalsBlend.btts : 1 - pr.goalsBlend.btts; mo = sel === "Oui" ? pr.goalsBlend.bttsModel : 1 - pr.goalsBlend.bttsModel; }
    return { mk: U.isNum(mk) ? mk : null, mo: U.isNum(mo) ? mo : null };
  }
  /**
   * Probabilité prudente : p − κ × |modèle − marché|. Quand les deux sources divergent, la probabilité est moins sûre :
   * le ticket préfère les sélections où elles s'accordent. Buteur / joueur décisif (modèle seul, sans marché) : incertitude 25 % de p.
   * κ est choisi sur l'historique (apprentissage + validation), jamais sur le test final.
   */
  function robustP(p, q, market, kappa) {
    if (!U.isNum(p)) return p;
    const k = U.isNum(kappa) ? kappa : 0;
    const u = q && U.isNum(q.mk) && U.isNum(q.mo) ? Math.abs(q.mo - q.mk) : market === "Buteur" || market === "Joueur Décisif" ? 0.25 * p : 0;
    return Math.max(0.01, p - k * u);
  }
  const trainedKappa = () => { const t = FQ.TRAINED && FQ.TRAINED.tickets; return t && U.isNum(t.kappa) ? t.kappa : 0; };
  const f2 = (x, d) => (U.isNum(x) ? x.toFixed(d === undefined ? 2 : d).replace(".", ",") : "—");
  /** Phrase simple décrivant l'issue jouée */
  function selPhrase(m, market, sel) {
    if (market === "1N2") return sel === "N" ? `Match nul entre ${m.home} et ${m.away}` : sel === "1" ? `${m.home} gagne à domicile contre ${m.away}` : `${m.away} gagne à l'extérieur chez ${m.home}`;
    if (market === "DC") return sel === "1N" ? `${m.home} ne perd pas contre ${m.away}` : sel === "N2" ? `${m.away} ne perd pas chez ${m.home}` : `Pas de match nul entre ${m.home} et ${m.away}`;
    if (market === "BTTS") return sel === "Oui" ? `${m.home} et ${m.away} marquent tous les deux` : `${m.home} ou ${m.away} ne marque pas`;
    if (market === "Buts") return `${sel[0] === "+" ? "Plus" : "Moins"} de ${sel.slice(1).replace(".", ",")} buts dans ${m.home} – ${m.away}`;
    if (market === "Buteur") return `${sel} marque pendant ${m.home} – ${m.away}`;
    if (market === "Joueur Décisif") return `${sel} marque ou fait une passe décisive (${m.home} – ${m.away})`;
    return sel;
  }
  /**
   * Justification en langage clair d'une sélection : l'issue, d'où vient la probabilité (marché, modèle, accord ou non),
   * ce que prélève le bookmaker sur ce choix comparé aux autres sélections de la semaine, et le contexte sportif.
   * ref : { medYield } rendement médian des sélections disponibles ; kappa : prudence appliquée.
   */
  function legWhy(pr, m, market, sel, p, odds, src, ref) {
    const st = pr.standings, f = pr.form || {};
    const q = legProbs(pr, market, sel);
    const out = [selPhrase(m, market, sel) + "."];
    if (q.mk !== null && q.mo !== null) {
      const gap = Math.abs(q.mo - q.mk);
      out.push(`Chance retenue ${pc(p)} : le marché (cotes sans marge) dit ${pc(q.mk)}, notre modèle sportif seul ${pc(q.mo)}` +
        (gap < 0.04 ? ", les deux sont d'accord." : gap < 0.08 ? `, léger écart.` : `, écart de ${Math.round(100 * gap)} points : choix moins sûr${ref && ref.kappa > 0 ? `, compté à ${pc(robustP(p, q, market, ref.kappa))} seulement pour construire le ticket (prudence)` : ""}.`));
    } else if (q.mk !== null) out.push(`Chance retenue ${pc(p)} (cotes du marché sans marge, ${pc(q.mk)}).`);
    else out.push(`Chance retenue ${pc(p)} d'après notre modèle seul (aucune cote de marché pour la comparer : estimation moins sûre).`);
    const y = p * odds;
    const bk = String(src || "").split(" · relevée")[0].split(" (")[0];
    out.push(`Cote ${f2(odds)} chez ${bk || "le bookmaker"} pour une cote juste de ${f2(1 / p)} : ` +
      (y >= 1 ? `elle paie ${Math.round(100 * (y - 1))} % au-dessus du prix juste.` : `le bookmaker garde environ ${Math.max(1, Math.round(100 * (1 - y)))} % sur ce choix`) +
      (y < 1 && ref && U.isNum(ref.medYield) ? (y >= ref.medYield + 0.015 ? `, moins que sur la plupart des sélections de la semaine (${Math.round(100 * (1 - ref.medYield))} % en médiane) : c'est pour cela qu'il est retenu.` : `, ${Math.round(100 * (1 - ref.medYield))} % en médiane sur les sélections de la semaine.`) : y < 1 ? "." : ""));
    const ctx = [];
    if (st && st.home && st.away) ctx.push(`${m.home} ${st.home.pos}e (${st.home.pts} pts), ${m.away} ${st.away.pos}e (${st.away.pts} pts)`);
    if (f.h || f.a) ctx.push(`forme récente ${f.h || "—"} contre ${f.a || "—"}`);
    if (U.isNum(pr.lambdaHome)) ctx.push(`buts attendus ${f2(pr.lambdaHome, 1)} – ${f2(pr.lambdaAway, 1)}`);
    if (ctx.length) out.push("Contexte : " + ctx.join(" ; ") + ".");
    return out.join(" ");
  }
  function ticketCandidates(ctx, win, book) {
    const s = ctx.state, set = s.settings, nowMs = Date.now(), kappa = trainedKappa();
    const w = win || ticketWindow(ctx.today, set);
    const start = w.start, end = w.to;
    const lastPred = new Map(); for (const p of s.predictions) lastPred.set(p.matchId, p);
    const out = [];
    for (const m of ctx.matches) {
      if (m.status !== "PROGRAMMÉ" || m.date < start || m.date > end || kickoffPassed(m, nowMs)) continue;
      const pr = lastPred.get(m.id); if (!pr || !pr.markets) continue;
      if ((pr.reliability || 0) < (set.relMin || 55)) continue;
      const om = ctx.mode === "demo" ? demoOddsMap(ctx, m, []) : matchOddsMap(m, set, s.oddsLearn, book || null, s.userOdds);
      if (!om || !om["1N2|1"]) continue;
      const p3 = [pr.markets.p1, pr.markets.pN, pr.markets.p2], top = p3.indexOf(Math.max(...p3));
      const ko = FQ.time.kickoffUtc(m.date, m.time, m.tz);
      const sels = selectionsOf(pr, m);
      for (const pl of pr.players || []) { // buteur / joueur décisif : seulement avec une cote saisie
        if (U.isNum(pl.pScore) && om["Buteur|" + pl.name]) sels.push(["Buteur", pl.name, `Buteur : ${pl.name}`, pl.pScore]);
        if (U.isNum(pl.pDecisive) && om["Joueur Décisif|" + pl.name]) sels.push(["Joueur Décisif", pl.name, `Décisif : ${pl.name}`, pl.pDecisive]);
      }
      for (const [market, sel, label, p] of sels) {
        const od = om[market + "|" + sel]; if (!od || !U.isNum(od.v) || od.v <= 1 || !U.isNum(p)) continue;
        const q = legProbs(pr, market, sel);
        out.push({ matchId: m.id, comp: m.comp, date: m.date, time: m.time || "", kickoff: ko ? new Date(ko).toISOString() : null, home: m.home, away: m.away,
          market, sel, label, p, pR: robustP(p, q, market, kappa), pMkt: q.mk, pMod: q.mo, odds: od.v, oddsSrc: od.src, estOdds: !!od.est, userOdds: !!od.user, ev: p * od.v - 1, rel: pr.reliability, playerName: market === "Buteur" || market === "Joueur Décisif" ? sel : null,
          top: market === "1N2" && { 1: 0, N: 1, 2: 2 }[sel] === top, predictionId: pr.id, _pr: pr, _m: m });
      }
    }
    // justification : écrite une fois le rendement médian des sélections de la semaine connu (référence de comparaison)
    const ys = out.filter((c) => c.market === "1N2" || c.market === "DC").map((c) => c.p * c.odds).sort((a, b) => a - b);
    const ref = { medYield: ys.length ? ys[Math.floor(ys.length / 2)] : null, kappa };
    for (const c of out) { c.why = legWhy(c._pr, c._m, c.market, c.sel, c.p, c.odds, c.oddsSrc, ref); delete c._pr; delete c._m; }
    out.medYield = ref.medYield;
    return out;
  }
  const armCands = (cands, arm) => cands.filter((c) => armAllows(arm, c));
  /** Stratégies autorisées par les paramètres : toutes (l'apprentissage choisit) ou favoris seulement */
  const allowedArms = (set) => TICKET_ARMS.filter((a) => (set && set.ticketPolicy) !== "favoris" || a.family === "favoris");
  /**
   * Apprentissage du choix de stratégie (bandit à information complète) : pour chaque bras, loi Bêta du taux de réussite.
   * A priori : semaines rejouées sur l'historique, comptées à moitié ; puis chaque semaine réelle (tickets fantômes réglés) compte pleinement.
   * Le bras joué est celui dont le taux de réussite attendu est le plus élevé.
   */
  function armStats(ctx, scId) {
    const tr = FQ.TRAINED && FQ.TRAINED.tickets && (FQ.TRAINED.tickets.scenarios || []).find((x) => x.id === scId);
    const live = (ctx.state.shadowTickets || []).filter((t) => t.scenario === scId && (t.status === "GAGNÉ" || t.status === "PERDU"));
    return allowedArms(ctx.state.settings).map((a) => {
      const wk = (tr && tr.arms && tr.arms[a.id] && tr.arms[a.id].weeks) || [];
      const btN = wk.length, btW = wk.reduce((x, w) => x + w[1], 0);
      const lv = live.filter((t) => t.arm === a.id), lvN = lv.length, lvW = lv.filter((t) => t.status === "GAGNÉ").length;
      const al = 1 + 0.5 * btW + lvW, be = 1 + 0.5 * (btN - btW) + (lvN - lvW);
      return { id: a.id, label: a.label, pMin: a.pMin, btN, btW, lvN, lvW, mean: al / (al + be), enough: btN + lvN >= 5 };
    }).sort((x, y) => (y.enough - x.enough) || (y.mean - x.mean)); // une stratégie sans données (moins de 5 semaines) n'est jamais préférée
  }
  function chooseArm(ctx, scId) {
    const st = armStats(ctx, scId), b = st[0];
    const arm = TICKET_ARMS.find((a) => a.id === b.id);
    const reason = `Stratégie « ${b.label} » : ${b.btW}/${b.btN} tickets gagnés sur les semaines rejouées` + (b.lvN ? `, ${b.lvW}/${b.lvN} en réel` : "") +
      `, meilleur taux attendu de cette fourchette (${pc(b.mean)} ; suivante : « ${st[1] ? st[1].label : "—"} » ${st[1] ? pc(st[1].mean) : ""}).`;
    return { arm, reason, stats: st };
  }
  /**
   * Correction apprise par stratégie : tickets gagnés ÷ tickets attendus (somme des chances prudentes annoncées),
   * semaines rejouées à demi-poids + semaines réelles (tickets fantômes réglés), rétrécie vers 1 (K = 1,5 ticket fictif).
   * Une stratégie dont les tickets gagnent moins souvent qu'annoncé voit ses chances réduites, et inversement.
   */
  function armFactors(ctx, scId) {
    const tr = FQ.TRAINED && FQ.TRAINED.tickets && (FQ.TRAINED.tickets.scenarios || []).find((x) => x.id === scId);
    const live = (ctx.state.shadowTickets || []).filter((t) => t.scenario === scId && (t.status === "GAGNÉ" || t.status === "PERDU"));
    const K = 1.5, out = {};
    for (const a of TICKET_ARMS) {
      const wk = (tr && tr.arms && tr.arms[a.id] && tr.arms[a.id].weeks) || [];
      const lv = live.filter((t) => t.arm === a.id);
      const btW = wk.reduce((x, w) => x + w[1], 0), btE = wk.reduce((x, w) => x + (U.isNum(w[5]) ? w[5] : w[3]), 0);
      const lvW = lv.filter((t) => t.status === "GAGNÉ").length, lvE = lv.reduce((x, t) => x + (U.isNum(t.pRobust) ? t.pRobust : t.pJoint || 0), 0);
      const W = 0.5 * btW + lvW, E = 0.5 * btE + lvE;
      out[a.id] = { f: Math.min(1.6, Math.max(0.5, (W + K) / (E + K))), W, E, btW, btN: wk.length, btE, lvW, lvN: lv.length, lvE };
    }
    return out;
  }
  /**
   * Stratégie jouée cette semaine. Procédure « corrigée » (par défaut) : chaque stratégie propose son meilleur ticket ;
   * on retient la plus forte chance prudente × correction apprise, et, à 10 % près, la meilleure espérance corrigée.
   * Procédure « taux » : meilleur taux de réussite passé (loi Bêta). La procédure est choisie à l'entraînement sur le passé.
   */
  function pickArm(ctx, sc, armTk) {
    const proc = (FQ.TRAINED && FQ.TRAINED.tickets && FQ.TRAINED.tickets.choice) || "corrected";
    const fresh = (id) => armTk[id] && !armTk[id].stub;
    if (proc === "hitrate") {
      const st = armStats(ctx, sc.id).filter((x) => fresh(x.id));
      if (!st.length) return null;
      const b = st[0], arm = TICKET_ARMS.find((a) => a.id === b.id);
      const pOf = (id) => (U.isNum(armTk[id].pRobust) ? armTk[id].pRobust : armTk[id].pJoint);
      const hi = st.filter((x) => pOf(x.id) > pOf(b.id) * 1.02).sort((x, y) => pOf(y.id) - pOf(x.id))[0];
      const cd = FQ.TRAINED && FQ.TRAINED.tickets && FQ.TRAINED.tickets.choiceDetail;
      return { arm, reason: `Stratégie « ${b.label} » : ${b.btW}/${b.btN} tickets gagnés sur les semaines rejouées${b.lvN ? `, ${b.lvW}/${b.lvN} en réel` : ""}, meilleur taux de réussite attendu de cette fourchette (${pc(b.mean)}).` +
        (hi ? ` Cette semaine, « ${hi.label} » annonce une chance un peu plus haute (${pc1(pOf(hi.id))} contre ${pc1(pOf(b.id))}), mais la règle retenue suit le taux de réussite réellement observé${cd ? ` : rejouée semaine par semaine sur le passé, elle a gagné ${cd.hitrate.past} tickets contre ${cd.corrected.past} en suivant la chance annoncée corrigée` : ""}.` : ""), stats: st.map((x) => ({ id: x.id, mean: Math.round(x.mean * 1000) / 1000, bt: [x.btW, x.btN], live: [x.lvW, x.lvN] })) };
    }
    const F = armFactors(ctx, sc.id);
    const c = allowedArms(ctx.state.settings).filter((a) => fresh(a.id)).map((a) => { const t = armTk[a.id], f = F[a.id].f, p0 = U.isNum(t.pRobust) ? t.pRobust : t.pJoint; return { a, t, f, p0, pc: p0 * f, evc: p0 * f * t.totalOdds }; });
    if (!c.length) return null;
    const mx = Math.max(...c.map((x) => x.pc));
    const near = c.filter((x) => x.pc >= 0.9 * mx);
    const b = near.reduce((a, x) => (x.evc > a.evc ? x : a), near[0]);
    const raw = c.reduce((a, x) => (x.p0 > a.p0 ? x : a), c[0]);
    const fb = F[b.a.id];
    const reason = `Stratégie « ${b.a.label} » : meilleure chance de la semaine une fois corrigée par l'historique (${pc1(b.p0)} annoncés × ${f2(b.f)} ; ce produit sert à classer les stratégies, ce n'est pas une probabilité). ` +
      `Ses tickets passés ont gagné ${f2(fb.W, 1)} fois pour ${f2(fb.E, 1)} annoncées (semaines rejouées comptées à moitié${fb.lvN ? `, dont ${fb.lvW}/${fb.lvN} en réel` : ""}) : ${b.f > 1.05 ? "ils passent plus souvent qu'annoncé" : b.f < 0.95 ? "ils passent moins souvent qu'annoncé" : "conforme à l'annonce"}.` +
      (raw.a.id !== b.a.id ? ` Sans correction, « ${raw.a.label} » aurait été devant (${pc1(raw.p0)} annoncé, ×${f2(raw.f)} d'après son historique).` : "");
    return { arm: b.a, reason, stats: c.map((x) => ({ id: x.a.id, p: Math.round(x.p0 * 10000) / 10000, f: Math.round(x.f * 1000) / 1000, pc: Math.round(x.pc * 10000) / 10000 })) };
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
  const legOfCand = (c) => ({ matchId: c.matchId, comp: c.comp, date: c.date, time: c.time, kickoff: c.kickoff, home: c.home, away: c.away, market: c.market, sel: c.sel, label: c.label,
    p: Math.round(c.p * 10000) / 10000, pMkt: U.isNum(c.pMkt) ? Math.round(c.pMkt * 10000) / 10000 : null, pMod: U.isNum(c.pMod) ? Math.round(c.pMod * 10000) / 10000 : null, pR: U.isNum(c.pR) ? Math.round(c.pR * 10000) / 10000 : null, odds: c.odds, oddsSrc: c.oddsSrc, estOdds: !!c.estOdds, rel: c.rel, why: c.why || null, status: "EN ATTENTE" });
  const pc1 = (x) => (U.isNum(x) ? (100 * x).toFixed(x < 0.1 ? 1 : 0).replace(".", ",") + " %" : "—");
  /** Meilleurs tickets des autres stratégies au même niveau (comparaison affichée) */
  function altsOf(armTk, chosen) {
    return TICKET_ARMS.filter((a) => a.id !== chosen && armTk[a.id]).map((a) => ({ arm: a.id, label: a.label, p: Math.round(armTk[a.id].pJoint * 10000) / 10000, n: armTk[a.id].legs.length, odds: Math.round(armTk[a.id].totalOdds * 100) / 100 }))
      .sort((x, y) => y.p - x.p).slice(0, 4);
  }
  /**
   * Pourquoi ce ticket, en clair : comment il est construit, pourquoi ce nombre de sélections (comparaison 1 → 15),
   * ce que donnent les autres stratégies à la même cote, pourquoi cette stratégie, et à quelle cote il deviendrait rentable.
   * Paragraphes séparés par « \n ».
   */
  function ticketWhy(tk, sc, arm, choice, armTk) {
    const n = tk.legs.length, book = tk.book ? FR_NAMES()[tk.book] || tk.book : "Bet 365 (aucune cote française)";
    const L = [];
    L.push(`${n} sélection${n > 1 ? "s" : ""} chez ${book}, cote ${f2(tk.totalOdds)} (visée ${f2(sc.lo, 1)} à ${f2(sc.hi, 1)}). Chance estimée que tout passe : ${pc1(tk.pJoint)}${U.isNum(tk.pRobust) && tk.pRobust < tk.pJoint - 0.0005 ? ` (${pc1(tk.pRobust)} en version prudente, en tenant compte des désaccords entre modèle et marché)` : ""}.`);
    L.push("Méthode : à cote totale fixée, la chance d'un combiné vaut le produit des « rendements » de ses sélections (chance × cote ; 1 = prix juste) divisé par la cote totale, et son espérance suit le même produit. " +
      "On garde donc les sélections où le bookmaker prélève le moins" + (trainedKappa() > 0 ? " et où notre modèle et le marché sont d'accord" : "") + ", avec le nombre de sélections qui donne la meilleure chance, sans nombre fixé à l'avance ; à chance quasi égale, le ticket qui rapporte le plus l'emporte.");
    const bn = (tk.byN || []).filter((x) => U.isNum(x.pJoint || x.p));
    if (bn.length > 1) {
      const pj = (x) => (U.isNum(x.pJoint) ? x.pJoint : x.p);
      const bestN = bn.reduce((a, x) => (pj(x) > pj(a) ? x : a), bn[0]);
      const last = bn[bn.length - 1];
      L.push(`Nombre de sélections comparé (meilleur ticket trouvé pour chaque longueur, même cote visée) : ${bn.map((x) => `${x.n} → ${pc1(pj(x))}`).join(" · ")}. ` +
        (bestN.n === bn[0].n && bestN.n > 3 ? `Avec cette stratégie, il faut au moins ${bestN.n} sélections pour atteindre la cote visée ; chaque sélection en plus ajoute la marge du bookmaker.` :
          last.n > bestN.n && bestN.n <= 5 ? `${bestN.n === 1 ? "Un seul pari suffit : avec" : "Avec"} plus de sélections, chacune ajoute la marge du bookmaker et la chance baisse (${last.n} sélections : ${pc1(pj(last))}).` :
          bestN.n > bn[0].n ? `Ici, des sélections très probables et peu taxées permettent d'aller jusqu'à ${bestN.n} sélections sans perdre de chance.` : ""));
    } else if (n === 1) L.push("Un seul pari : pour cette cote, ajouter une sélection ne ferait que baisser la chance (marge du bookmaker en plus).");
    const alts = altsOf(armTk || {}, arm.id);
    if (alts.length) L.push(`Autres stratégies essayées à cette cote : ${alts.map((a) => `${a.label} ${pc1(a.p)} (${a.n} sél.)`).join(" ; ")}.`);
    if (choice && choice.reason) L.push(choice.reason);
    const est = tk.legs.filter((l) => l.estOdds).length;
    L.push((tk.ev >= 0 ? `Espérance positive : +${Math.round(100 * tk.ev)} %.` : `Espérance ${Math.round(100 * tk.ev)} % : le ticket ne devient rentable qu'à une cote totale d'au moins ${f2(1.03 / tk.pJoint)} (cote boostée, ou information que le marché n'a pas).`) +
      (tk.boost ? ` Multiboost Betclic estimé +${f2(100 * tk.boost, 1)} % (cote ${f2(tk.rawOdds)} avant boost).` : "") + (est ? ` ${est} cote(s) double chance estimée(s) d'après le 1N2 : vérifie le prix.` : ""));
    return L.join("\n");
  }
  /**
   * Paper betting : un jeu de 3 tickets par semaine (lundi → dimanche), construit à partir du jeudi sur les matchs du jeudi au dimanche
   * avec les cotes publiées. Chaque sélection est l'issue jugée la plus probable de son match ; le ticket a la plus forte chance de gain
   * possible dans la fourchette de cote. Réoptimisé à chaque cycle jusqu'au premier coup d'envoi, puis figé et réglé à l'audit.
   * En parallèle, un ticket « fantôme » par stratégie est suivi et réglé : c'est la matière de l'apprentissage du choix de stratégie.
   */
  function updateTickets(ctx, rep) {
    const s = ctx.state, now = new Date().toISOString(), nowMs = Date.now();
    s.paperTickets = s.paperTickets || []; s.realBets = s.realBets || []; s.shadowTickets = s.shadowTickets || [];
    for (const t of s.paperTickets.concat(s.realBets, s.shadowTickets)) if ((t.status === "EN ATTENTE" || (t.status === "À VÉRIFIER" && !t.manualStatus)) && settleTicket(ctx, t, now) && rep && !t.arm) rep.ticketsSettled = (rep.ticketsSettled || 0) + 1;
    const started = (t) => t.legs.some((l) => { const m = ctx.matchById ? ctx.matchById.get(l.matchId) : null; return m ? kickoffPassed(m, nowMs) : l.date < ctx.today; });
    for (const t of s.paperTickets.concat(s.shadowTickets)) if (t.status === "EN ATTENTE" && !t.frozen && started(t)) { t.frozen = true; t.frozenAt = now; }
    s.shadowTickets = s.shadowTickets.filter((t) => t.week >= U.addDays(ctx.today, -400));
    if (s.settings.paperTickets === false) return;
    const win = ticketWindow(ctx.today, s.settings);
    if (!win.open) return;
    learnDcFactor(s);
    const bf = boostFn(s);
    const best = bestTicketFinder(ctx, win, bf), cands = best.all;
    s.armChoice = s.armChoice || {};
    for (const sc of scenarios(s.settings)) {
      // tickets fantômes : un par stratégie
      const armTk = {};
      for (const arm of TICKET_ARMS) {
        const sh = s.shadowTickets.find((t) => t.scenario === sc.id && t.week === win.week && t.arm === arm.id);
        if (sh && (sh.frozen || sh.status !== "EN ATTENTE")) { armTk[arm.id] = { stub: true, pJoint: sh.pJoint, pRobust: sh.pRobust, totalOdds: sh.totalOdds, legs: sh.legs, ev: sh.ev }; continue; }
        const tk = best.find(arm, sc);
        if (tk) armTk[arm.id] = tk;
        if (!tk) { if (sh) s.shadowTickets.splice(s.shadowTickets.indexOf(sh), 1); continue; }
        const body = { scenario: sc.id, arm: arm.id, week: win.week, book: tk.book, legs: tk.legs.map(legOfCand), totalOdds: Math.round(tk.totalOdds * 100) / 100, boost: tk.boost, pJoint: tk.pJoint, pRobust: tk.pRobust, ev: tk.ev, stake: 1 };
        if (sh) Object.assign(sh, body); else s.shadowTickets.push(Object.assign({ id: U.uid("sh"), createdAt: now, status: "EN ATTENTE", frozen: false, profit: 0 }, body));
      }
      // ticket joué : stratégie choisie à chaque cycle jusqu'au premier coup d'envoi du ticket, puis figée
      const key = win.week + "|" + sc.id;
      const mine = s.paperTickets.find((t) => t.scenario === sc.id && t.week === win.week);
      if (mine && (mine.frozen || mine.status !== "EN ATTENTE")) continue; // ticket de la semaine déjà engagé
      const choice = pickArm(ctx, sc, armTk);
      const arm = choice ? choice.arm : null;
      if (choice) s.armChoice[key] = { arm: arm.id, reason: choice.reason, at: now, stats: choice.stats };
      const tk = arm ? armTk[arm.id] : null;
      if (!tk) { if (mine && mine.legs.some((l) => !cands.some((c) => c.matchId === l.matchId))) s.paperTickets.splice(s.paperTickets.indexOf(mine), 1); continue; }
      const legs = tk.legs.map(legOfCand);
      const why = ticketWhy(tk, sc, arm, choice, armTk);
      const body = { scenario: sc.id, label: sc.label, week: win.week, window: [win.from, win.to], target: [sc.lo, sc.hi], arm: undefined, strategy: arm.id, strategyLabel: arm.label, why,
        book: tk.book, bookName: tk.book ? FR_NAMES()[tk.book] || tk.book : "Bet 365 (aucune cote française)",
        legs, totalOdds: Math.round(tk.totalOdds * 100) / 100, rawOdds: Math.round(tk.rawOdds * 100) / 100, boost: tk.boost, pJoint: tk.pJoint, pRobust: tk.pRobust, ev: tk.ev, stake: sc.stake, updatedAt: now,
        byN: (tk.byN || []).map((x) => ({ n: x.n, p: Math.round(x.pJoint * 10000) / 10000, odds: Math.round(x.totalOdds * 100) / 100 })), alts: altsOf(armTk, arm.id) };
      if (mine) {
        const same = mine.legs.length === legs.length && mine.legs.every((l, i) => l.matchId === legs[i].matchId && l.sel === legs[i].sel && l.odds === legs[i].odds);
        if (!same) { Object.assign(mine, body); mine.revisions = (mine.revisions || 0) + 1; }
        else Object.assign(mine, { book: body.book, bookName: body.bookName, why: body.why, strategy: body.strategy, strategyLabel: body.strategyLabel, pJoint: body.pJoint, pRobust: body.pRobust, ev: body.ev, byN: body.byN, alts: body.alts, legs: legs });
      } else {
        s.paperTickets.push(Object.assign({ id: U.uid("tk"), createdAt: now, status: "EN ATTENTE", frozen: false, profit: 0, revisions: 0 }, body));
        if (rep) rep.ticketsNew = (rep.ticketsNew || 0) + 1;
      }
    }
  }
  /**
   * Recherche du meilleur ticket d'une stratégie : construit chez chacun des bookmakers français (un ticket se joue chez un seul),
   * garde la meilleure chance prudente (à 10 % près, la meilleure espérance), ou la meilleure espérance pour « Valeur ». Repli Bet 365 sans cote française.
   */
  function bestTicketFinder(ctx, win, bf) {
    const books = Object.keys(FR_NAMES());
    let by = books.map((b) => ({ b, c: ticketCandidates(ctx, win, b) })).filter((x) => x.c.length);
    if (!by.length) by = [{ b: null, c: ticketCandidates(ctx, win, null) }];
    const all = [].concat(...by.map((x) => x.c));
    const find = (arm, sc) => {
      const found = [];
      for (const { b, c } of by) {
        const tk = buildTicket(armCands(c, arm), sc, { boost: b === "betclic_fr" ? bf : null, objective: arm.objective, pool: 120, beam: 300 });
        if (tk) { tk.book = b; tk.medYield = c.medYield; found.push(tk); }
      }
      if (!found.length) return null;
      const ev = (t) => t.pRobust * t.totalOdds;
      if (arm.objective === "ev") return found.reduce((a, t) => (ev(t) > ev(a) ? t : a), found[0]);
      // même règle qu'à l'intérieur d'un bookmaker : chance prudente maximale, à 10 % près l'espérance départage
      const pMax = Math.max(...found.map((t) => t.pRobust));
      const near = found.filter((t) => t.pRobust >= 0.9 * pMax);
      return near.reduce((a, t) => (ev(t) > ev(a) ? t : a), near[0]);
    };
    return { all, find };
  }
  /** Aperçu des tickets sur une fenêtre (par défaut celle de la semaine ; avant jeudi : les cotes déjà publiées jusqu'à dimanche) */
  function previewTickets(ctx, winArg) {
    const w0 = ticketWindow(ctx.today, ctx.state.settings);
    const win = winArg || (w0.open ? w0 : Object.assign({}, w0, { start: ctx.today }));
    const f = bestTicketFinder(ctx, win, boostFn(ctx.state)), cands = f.all;
    return scenarios(ctx.state.settings).map((sc) => {
      const armTk = {};
      for (const a of allowedArms(ctx.state.settings)) { const t = f.find(a, sc); if (t) armTk[a.id] = t; }
      const c = pickArm(ctx, sc, armTk) || { arm: TICKET_ARMS[0], reason: "" };
      const tk = armTk[c.arm.id] || null;
      if (tk) tk.legs = tk.legs.map(legOfCand);
      return { sc, rule: c.arm.label, strategy: c.arm.id, reason: c.reason, why: tk ? ticketWhy(tk, sc, c.arm, c, armTk) : null, ticket: tk, bookName: tk && tk.book ? FR_NAMES()[tk.book] : null, nCands: cands.filter((x) => x.top).length, nMatches: new Set(cands.map((x) => x.matchId)).size, win };
    });
  }

  /* ----------------------------------------------- audit hebdomadaire (journal d'apprentissage) */
  /**
   * Une entrée par semaine terminée (tous ses tickets réglés) : tickets joués et fantômes, choix du modèle (réussite observée vs attendue),
   * qualité des probabilités face au marché (log loss), cote de clôture, et stratégie retenue pour la suite.
   */
  function updateJournal(ctx) {
    const s = ctx.state; s.learnLog = s.learnLog || [];
    const done = new Set(s.learnLog.map((e) => e.week));
    const cur = U.weekMonday(ctx.today);
    const weeks = [...new Set((s.shadowTickets || []).map((t) => t.week))].filter((w) => w < cur && !done.has(w)).sort();
    let added = 0;
    for (const wk of weeks) {
      const sh = s.shadowTickets.filter((t) => t.week === wk);
      if (sh.some((t) => t.status === "EN ATTENTE")) continue;
      const end = U.addDays(wk, 6);
      const scen = {};
      for (const sc of scenarios(s.settings)) {
        const shown = (s.paperTickets || []).find((t) => t.week === wk && t.scenario === sc.id);
        scen[sc.id] = { shown: shown ? { strategy: shown.strategy || null, status: shown.status, odds: shown.totalOdds, legs: shown.legs.length, lost: shown.legs.filter((l) => l.status === "PERDU").length } : null,
          arms: Object.fromEntries(sh.filter((t) => t.scenario === sc.id).map((t) => [t.arm, { status: t.status, legs: t.legs.length, lost: t.legs.filter((l) => l.status === "PERDU").length, p: Math.round(t.pJoint * 1000) / 1000 }])),
          factors: Object.fromEntries(Object.entries(armFactors(ctx, sc.id)).map(([k, v]) => [k, Math.round(v.f * 1000) / 1000])) };
      }
      const pk = (s.picks || []).filter((p) => p.date >= wk && p.date <= end && (p.status === "GAGNÉ" || p.status === "PERDU"));
      const ll = { ours: 0, market: 0, n: 0 };
      for (const p of s.predictions) {
        if (p.date < wk || p.date > end || !p.blend || !p.blend.market) continue;
        const r = s.results[p.matchId]; if (!r || !U.isNum(r.hg)) continue;
        const k = r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2;
        ll.ours += FQ.metrics.logLoss3([p.markets.p1, p.markets.pN, p.markets.p2], k); ll.market += FQ.metrics.logLoss3(p.blend.market, k); ll.n++;
      }
      // désaccords modèle / marché de la semaine : qui avait raison ?
      const dis = { up: { n: 0, mo: 0, mk: 0, y: 0 }, down: { n: 0, mo: 0, mk: 0, y: 0 } };
      for (const p of s.predictions) {
        if (p.date < wk || p.date > end || !p.blend || !p.blend.market || !p.modelMarkets) continue;
        const r = s.results[p.matchId]; if (!r || !U.isNum(r.hg)) continue;
        const k = r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2, mo = [p.modelMarkets.p1, p.modelMarkets.pN, p.modelMarkets.p2];
        for (let i = 0; i < 3; i++) { const d = mo[i] - p.blend.market[i]; const b = d >= 0.08 ? dis.up : d <= -0.08 ? dis.down : null; if (b) { b.n++; b.mo += mo[i]; b.mk += p.blend.market[i]; b.y += k === i ? 1 : 0; } }
      }
      const clv = pk.map((p) => p.clv && p.clv.ev).filter(U.isNum);
      s.learnLog.push({ week: wk, at: new Date().toISOString(), scen,
        picks: { n: pk.length, won: pk.filter((p) => p.status === "GAGNÉ").length, expected: Math.round(pk.reduce((a, p) => a + (p.p || 0), 0) * 10) / 10 },
        ll: ll.n ? { n: ll.n, ours: ll.ours / ll.n, market: ll.market / ll.n } : null, dis, clv: clv.length ? { n: clv.length, ev: clv.reduce((a, x) => a + x, 0) / clv.length } : null });
      added++;
    }
    // paris saisis par Iso (réels et tests séparés), recalculés sur les 10 dernières semaines (règlements tardifs)
    const betWeek = (b) => U.weekMonday(((b.legs || []).map((l) => l.date).filter(Boolean).sort()[0]) || String(b.createdAt || "").slice(0, 10));
    for (const e of s.learnLog.slice(-10)) {
      const bs = (s.realBets || []).filter((b) => betWeek(b) === e.week);
      e.bets = { reel: betSummary(bs.filter(isRealBet)), test: betSummary(bs.filter((b) => !isRealBet(b))) };
    }
    s.learnLog = s.learnLog.slice(-80);
    return added;
  }

  /* ----------------------------------------------- contrôle de couverture (14 jours) */
  /**
   * Chaque cycle, par compétition : matchs à venir sur 14 jours, analysés, avec cote française / une cote ;
   * matchs des 7 derniers jours sans résultat, reportés ou annulés, doublons. Les anomalies sont listées une par une.
   */
  function coverageReport(ctx) {
    const s = ctx.state, today = ctx.today, end = U.addDays(today, 13), past = U.addDays(today, -7), nowMs = Date.now();
    const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const lastPred = new Map(); for (const p of s.predictions) lastPred.set(p.matchId, p);
    const comps = {}, issues = [], seen = new Map();
    const C = (c) => (comps[c] = comps[c] || { up: 0, analysed: 0, fr: 0, odds: 0, soon: 0, soonOdds: 0, missingRes: 0, postponed: 0, dup: 0, lastResult: null, next: null });
    const name = (m) => `${m.home} – ${m.away} (${m.date})`;
    for (const m of ctx.matches) {
      const c = C(m.comp);
      if (m.hg !== null && m.hg !== undefined && (!c.lastResult || m.date > c.lastResult)) c.lastResult = m.date;
      if (m.date < past || m.date > end) continue;
      const key = m.comp + "|" + m.date + "|" + norm(m.home) + "|" + norm(m.away);
      if (seen.has(key)) { c.dup++; issues.push({ comp: m.comp, kind: "doublon", text: `${name(m)} présent deux fois` }); continue; }
      seen.set(key, m.id);
      if (m.status === "REPORTÉ" || m.status === "ANNULÉ") { c.postponed++; issues.push({ comp: m.comp, kind: m.status === "REPORTÉ" ? "reporté" : "annulé", text: name(m) }); continue; }
      const played = m.hg !== null && m.hg !== undefined;
      if (!played && kickoffPassed(m, nowMs - 3 * 3600e3)) { c.missingRes++; issues.push({ comp: m.comp, kind: "résultat manquant", text: `${name(m)} : coup d'envoi passé depuis plus de 3 h, score pas encore publié par les sources` }); continue; }
      if (played || m.date < today || kickoffPassed(m, nowMs)) continue;
      c.up++; if (!c.next || m.date < c.next) c.next = m.date;
      const pr = lastPred.get(m.id);
      if (pr && pr.markets) c.analysed++;
      else issues.push({ comp: m.comp, kind: "non analysé", text: `${name(m)} : pas de pronostic (historique insuffisant pour une des équipes, ou match ajouté depuis le dernier calcul)` });
      const fr = !!(m.oddsFr && m.oddsFr.books && Object.keys(m.oddsFr.books).length), any = fr || !!(m.odds && m.odds.h);
      if (fr) c.fr++; if (any) c.odds++;
      if (U.daysBetween(today, m.date) <= 2) { c.soon++; if (any) c.soonOdds++; else issues.push({ comp: m.comp, kind: "sans cote", text: `${name(m)} : à moins de 3 jours et aucune cote relevée` }); }
    }
    const tot = Object.values(comps).reduce((a, c) => { for (const k of ["up", "analysed", "fr", "odds", "missingRes", "postponed", "dup", "soon", "soonOdds"]) a[k] = (a[k] || 0) + c[k]; return a; }, {});
    return { at: new Date().toISOString(), from: today, to: end, comps, totals: tot, issues: issues.slice(0, 80), nIssues: issues.length };
  }

  /** Paris saisis par Iso : « test » (simulation, par défaut) ou « réel » (vraiment joué). Les anciens paris sont des tests. */
  const isRealBet = (b) => !!b && b.mode === "reel";
  function migrateBets(s) { let n = 0; for (const b of s.realBets || []) if (b.mode !== "reel" && b.mode !== "test") { b.mode = "test"; n++; } return n; }
  /** Bilan d'une liste de paris saisis */
  function betSummary(list) {
    const done = list.filter((b) => b.status === "GAGNÉ" || b.status === "PERDU");
    const staked = done.reduce((a, b) => a + (b.stake || 0), 0), profit = done.reduce((a, b) => a + (b.profit || 0), 0);
    return { n: list.length, done: done.length, won: done.filter((b) => b.status === "GAGNÉ").length, staked: Math.round(staked * 100) / 100, profit: Math.round(profit * 100) / 100, expected: Math.round(done.reduce((a, b) => a + (U.isNum(b.pJoint) ? b.pJoint : 0), 0) * 100) / 100 };
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
    // réglages introduits depuis : Betclic par défaut (bookmaker d'Iso) tant qu'il n'a pas choisi lui-même, Multiboost activé
    if (!s.settings.oddsBookUser) s.settings.oddsBook = "best";       // meilleur prix parmi les bookmakers français
    if (!s.settings.multiboostUser) s.settings.multiboost = false;      // Multiboost seulement si Iso l'active
    s.settings.ticketPolicy = "auto";
    migrateBets(s);
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
    rep.journal = updateJournal(ctx);
    s.coverage = coverageReport(ctx); rep.coverageIssues = s.coverage.nIssues;
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
    rep.changed = rep.audited + rep.analysed + rep.insufficient + rep.autoBets + rep.closed + rep.compacted + (rep.clv || 0) + (rep.journal || 0) > 0 || !!rep.calibration || rep.ticketsChanged;
    if (rep.changed) {
      s.autoLog = (s.autoLog || []).concat([rep]).slice(-80);
    }
    return rep;
  }

  /* ----------------------------------------------- découpage pour la base */
  const CHUNK = 150000;
  function chunkText(txt) { const out = []; for (let i = 0; i < txt.length; i += CHUNK) out.push(txt.slice(i, i + CHUNK)); return out.length ? out : [""]; }
  function dataSignature(ds) { return Object.values(ds.source.repos).map((r) => r.commit).join("-"); }

  FQ.P = { coverageReport, isRealBet, migrateBets, betSummary, legProbs, robustP, ticketWhy, selPhrase, buildPrediction, makeSnapshot, standingsSnapshot, demoOddsMap, matchOddsMap, effSettings, upsertPick, settlePicks, kickoffPassed, defaultPlayersFor, computePlayer, analyzeList, auditMatch, resultFromSource, learnCalibration, runCycle, chunkText, dataSignature, CHUNK, HORIZON_DAYS,
    SCENARIOS, scenarios, buildTicket, ticketCandidates, ticketWindow, updateTickets, previewTickets, settleTicket, legWon, compactState, refOdds, closingFor, clvOf, updateClv, updateJournal, TICKET_ARMS, bestTicketFinder, armStats, chooseArm, armFactors, pickArm, armCands, armAllows, allowedArms, probOdds, extraOdds, dcOdds, selectionsOf, boostTable, boostFor, boostFn, learnDcFactor };
})(typeof window !== "undefined" ? window : globalThis);
