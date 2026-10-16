/* =========================================================================
   FOOTBALL QUANT AI — §25 classements, enjeux sportifs, projections
   Fonctions pures (navigateur + Node).
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ;
  const U = FQ.util;

  /* ------------------------------------------------------------------ règlements
     Vérifiés le 14/10/2026 (pages saison 2026-27 de Wikipédia, Sky Sports pour les barrages
     du Championship, O Imparcial pour le Brasileirão 2026). Les places européennes dépendent
     aussi des vainqueurs de coupe et du coefficient UEFA : elles sont marquées comme provisoires. */
  const Z = (from, to, key, label, kind) => ({ from, to, key, label, kind });
  const RULES = {
    PL: { id: "PL 2026-27", teams: 20, matches: 380, tiebreak: ["pts", "gd", "gf", "h2hPts"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 4, "ucl", "Ligue des champions", "eu"), Z(5, 5, "uel", "Ligue Europa", "eu2"), Z(18, 20, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 Premier League » (14/10/2026)", note: "Départage : points, différence de buts, buts marqués ; confrontations directes seulement pour l'Europe ou la relégation." },
    PD: { id: "LaLiga 2026-27", teams: 20, matches: 380, tiebreak: ["pts", "h2hPts", "h2hGd", "gd", "gf"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 4, "ucl", "Ligue des champions", "eu"), Z(5, 5, "uel", "Ligue Europa", "eu2"), Z(6, 6, "uecl", "Ligue Conférence", "eu3"), Z(18, 20, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 La Liga » (zones) ; départage selon le règlement LaLiga en vigueur (confrontations directes d'abord)", note: "La page saison 2026-27 consultée ne détaille pas le départage : ordre historique de LaLiga retenu." },
    FL1: { id: "Ligue 1 2026-27", teams: 18, matches: 306, tiebreak: ["pts", "gd", "h2hPts", "h2hGd", "h2hGf", "gf"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 3, "ucl", "Ligue des champions (phase de ligue)", "eu"), Z(4, 4, "uclq", "Ligue des champions (3e tour prélim.)", "eu"), Z(5, 5, "uel", "Ligue Europa", "eu2"), Z(6, 6, "uecl", "Ligue Conférence (barrages)", "eu3"), Z(16, 16, "bar", "Barrage de relégation", "bar"), Z(17, 18, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 Ligue 1 » (14/10/2026)", note: "Départage : points, différence de buts, puis confrontations directes." },
    SA: { id: "Serie A 2026-27", teams: 20, matches: 380, tiebreak: ["pts", "h2hPts", "h2hGd", "gd", "gf"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 4, "ucl", "Ligue des champions", "eu"), Z(5, 5, "uel", "Ligue Europa", "eu2"), Z(6, 6, "uecl", "Ligue Conférence (barrages)", "eu3"), Z(18, 20, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 Serie A » (14/10/2026)", note: "Départage : points, confrontations directes (points, différence), puis différence générale." },
    BL1: { id: "Bundesliga 2026-27", teams: 18, matches: 306, tiebreak: ["pts", "gd", "gf", "h2hPts"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 4, "ucl", "Ligue des champions", "eu"), Z(5, 5, "uel", "Ligue Europa", "eu2"), Z(6, 6, "uecl", "Ligue Conférence (barrages)", "eu3"), Z(16, 16, "bar", "Barrage de relégation", "bar"), Z(17, 18, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 Bundesliga » (14/10/2026)", note: "Départage : points, différence de buts, buts marqués, confrontations directes." },
    DED: { id: "Eredivisie 2026-27", teams: 18, matches: 306, tiebreak: ["pts", "gd", "gf", "h2hPts"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 1, "ucl", "Ligue des champions (phase de ligue)", "eu"), Z(2, 2, "uclq", "Ligue des champions (3e tour prélim.)", "eu"), Z(3, 3, "uelq", "Ligue Europa (2e tour prélim.)", "eu2"), Z(4, 4, "epo", "Barrages européens", "eu3"), Z(16, 16, "bar", "Barrages promotion/relégation", "bar"), Z(17, 18, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 Eredivisie » (14/10/2026)", note: "Étendue exacte des barrages européens non confirmée par la source : seule la 4e place est marquée. Critère « points de pénalité » ignoré (aucune sanction connue)." },
    ELC: { id: "Championship 2026-27", teams: 24, matches: 552, tiebreak: ["pts", "gd", "gf", "h2hPts"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 2, "promo", "Promotion directe", "eu"), Z(3, 8, "po", "Barrages de promotion (3e-4e en demi, 5e-8e en éliminatoires)", "eu2"), Z(22, 24, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026–27 EFL Championship » + Sky Sports (barrages à 6 équipes, 3e à 8e)", note: "Format des barrages encore susceptible d'ajustements selon la source." },
    BSA: { id: "Brasileirão 2026", teams: 20, matches: 380, tiebreak: ["pts", "wins", "gd", "gf", "h2hPts"],
      zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 4, "lib", "Libertadores (phase de groupes)", "eu"), Z(5, 5, "libq", "Libertadores (préliminaire)", "eu2"), Z(6, 11, "sud", "Sudamericana", "eu3"), Z(17, 20, "rel", "Relégation", "rel")],
      source: "Wikipédia « 2026 Campeonato Brasileiro Série A » + O Imparcial (règlement CBF 2026)", note: "Critères cartons rouges/jaunes non disponibles : tirage au sort à la place. Places continentales modifiables par la Copa do Brasil." },
    SSL: { id: "Super League 2026-27", teams: 12, matches: 198, tiebreak: ["pts", "gd", "gf", "h2hGd"], split: { after: 33, top: 6 },
      zones: [Z(1, 6, "champgrp", "Groupe championnat (après 33 j.)", "eu"), Z(7, 12, "relgrp", "Groupe relégation (après 33 j.)", "rel")],
      source: "Wikipédia « 2026–27 Swiss Super League » (14/10/2026)", note: "Phase 1 : 33 journées (3 tours), puis scission 6/6 avec points conservés. Titre, Europe (1er C1, 2e C4), barrage (11e) et relégation (12e) se décident en phase 2." },
  };
  FQ.RULES = RULES;
  const demoRule = (name) => ({ id: name + " (démo)", teams: 10, matches: 90, tiebreak: ["pts", "gd", "gf"],
    zones: [Z(1, 1, "title", "Champion", "title"), Z(1, 3, "ucl", "Europe (démo)", "eu"), Z(9, 10, "rel", "Relégation (démo)", "rel")],
    source: "Règlement fictif du mode démonstration", note: "Zones et départage fictifs, uniquement pour illustrer le module." });
  FQ.RULES_DEMO = { PL: demoRule("Ligue démo A"), FL1: demoRule("Ligue démo B"), J1: demoRule("Ligue démo C") };

  const NON_REGULAR = /play-?off|final|championship|relegation|round of|quarter|semi|third/i;
  FQ.isRegular = (m) => (m.regular !== undefined ? m.regular : !NON_REGULAR.test(m.round || ""));

  /* ------------------------------------------------------------------ table */
  /**
   * Classement avec règles de départage. results = [{h,a,hg,ag}] de la saison (matchs comptabilisés).
   * h2hComplete(group) : les confrontations directes ne s'appliquent que si tous les matchs entre ces équipes sont joués.
   */
  function computeTable(teams, results, crit, opts) {
    const o = opts || {};
    const T = {};
    teams.forEach((t) => (T[t] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, hp: 0, hw: 0, hd: 0, hl: 0, hgf: 0, hga: 0, ap: 0, aw: 0, ad: 0, al: 0, agf: 0, aga: 0, seq: [] }));
    for (const r of results) {
      const H = T[r.h], A = T[r.a]; if (!H || !A) continue;
      H.p++; A.p++; H.gf += r.hg; H.ga += r.ag; A.gf += r.ag; A.ga += r.hg; H.hp++; A.ap++; H.hgf += r.hg; H.hga += r.ag; A.agf += r.ag; A.aga += r.hg;
      if (r.hg > r.ag) { H.w++; A.l++; H.pts += 3; H.hw++; A.al++; H.seq.push(["V", r]); A.seq.push(["D", r]); }
      else if (r.hg < r.ag) { A.w++; H.l++; A.pts += 3; A.aw++; H.hl++; H.seq.push(["D", r]); A.seq.push(["V", r]); }
      else { H.d++; A.d++; H.pts++; A.pts++; H.hd++; A.ad++; H.seq.push(["N", r]); A.seq.push(["N", r]); }
    }
    const rows = Object.values(T);
    rows.forEach((x) => { x.gd = x.gf - x.ga; });
    const ordered = rankRows(rows, results, crit, o.expectedMeetings || 2, o.rng);
    ordered.forEach((x, i) => (x.pos = i + 1));
    return ordered;
  }
  FQ.computeTable = computeTable;

  function miniTable(group, results) {
    const set = new Set(group.map((g) => g.team));
    const M = {}; group.forEach((g) => (M[g.team] = { pts: 0, gd: 0, gf: 0, n: 0 }));
    for (const r of results) {
      if (!set.has(r.h) || !set.has(r.a)) continue;
      const H = M[r.h], A = M[r.a]; H.n++; A.n++;
      H.gf += r.hg; A.gf += r.ag; H.gd += r.hg - r.ag; A.gd += r.ag - r.hg;
      if (r.hg > r.ag) H.pts += 3; else if (r.hg < r.ag) A.pts += 3; else { H.pts++; A.pts++; }
    }
    return M;
  }
  function rankRows(rows, results, crit, meetings, rng) {
    const resolve = (group, ci) => {
      if (group.length <= 1) return group;
      if (ci >= crit.length) return rng ? group.map((g) => [g, rng()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]) : group.sort((a, b) => a.team.localeCompare(b.team));
      const c = crit[ci];
      let key;
      if (c.startsWith("h2h")) {
        const mt = miniTable(group, results);
        const needed = group.length * (group.length - 1) / 2 * meetings;
        const played = Object.values(mt).reduce((a, x) => a + x.n, 0) / 2;
        if (played < needed) return resolve(group, ci + 1); // confrontations incomplètes : critère non applicable
        const f = c === "h2hPts" ? "pts" : c === "h2hGd" ? "gd" : "gf";
        key = (g) => mt[g.team][f];
      } else {
        const f = c === "pts" ? "pts" : c === "gd" ? "gd" : c === "gf" ? "gf" : c === "wins" ? "w" : "pts";
        key = (g) => g[f];
      }
      const sorted = group.slice().sort((a, b) => key(b) - key(a));
      const out = [];
      let i = 0;
      while (i < sorted.length) {
        let j = i; while (j + 1 < sorted.length && key(sorted[j + 1]) === key(sorted[i])) j++;
        out.push(...resolve(sorted.slice(i, j + 1), ci + 1));
        i = j + 1;
      }
      return out;
    };
    return resolve(rows.slice(), 0);
  }

  /** Classement officiel reconstitué à une date (matchs strictement antérieurs) */
  function seasonTable(matches, comp, season, beforeDate, rulesMap) {
    const rules = (rulesMap || RULES)[comp];
    const ms = matches.filter((m) => m.comp === comp && m.season === season && FQ.isRegular(m));
    const teams = [...new Set(ms.flatMap((m) => [m.home, m.away]))];
    const res = ms.filter((m) => m.hg !== null && (!beforeDate || m.date < beforeDate)).map((m) => ({ h: m.home, a: m.away, hg: m.hg, ag: m.ag, date: m.date }));
    const crit = rules ? rules.tiebreak : ["pts", "gd", "gf"];
    const table = computeTable(teams, res, crit, { expectedMeetings: rules && rules.split ? 3 : 2 });
    const remaining = {}; teams.forEach((t) => (remaining[t] = 0));
    ms.filter((m) => m.hg === null || (beforeDate && m.date >= beforeDate)).forEach((m) => { remaining[m.home]++; remaining[m.away]++; });
    table.forEach((r) => { r.remaining = remaining[r.team]; r.max = r.pts + 3 * r.remaining; r.form = r.seq.slice(-5).map((x) => x[0]); });
    // classements domicile / extérieur
    const homeRank = table.slice().sort((a, b) => (b.hw * 3 + b.hd) - (a.hw * 3 + a.hd) || (b.hgf - b.hga) - (a.hgf - a.hga)).map((r) => r.team);
    const awayRank = table.slice().sort((a, b) => (b.aw * 3 + b.ad) - (a.aw * 3 + a.ad) || (b.agf - b.aga) - (a.agf - a.aga)).map((r) => r.team);
    table.forEach((r) => { r.homeRank = homeRank.indexOf(r.team) + 1; r.awayRank = awayRank.indexOf(r.team) + 1; });
    const lastResult = res.length ? res.map((r) => r.date).sort().slice(-1)[0] : null;
    return { table, teams, played: res.length, total: ms.length, rules, lastResult, seasonMatches: ms };
  }
  FQ.seasonTable = seasonTable;

  /* ------------------------------------------------------------------ enjeu mathématique */
  /** Vérifications mathématiques prudentes (ignorent les confrontations restantes entre équipes concernées). */
  function mathStatus(table, rules) {
    const N = table.length;
    const out = {};
    for (const t of table) {
      const others = table.filter((x) => x !== t);
      const s = {};
      const surelyAbove = others.filter((x) => x.pts > t.max).length;  // finiront devant quoi qu'il arrive
      const surelyBelow = others.filter((x) => x.max < t.pts).length;  // ne peuvent plus la rattraper
      const bestPos = surelyAbove + 1, worstPos = N - surelyBelow;
      for (const z of rules ? rules.zones : []) {
        const canReach = bestPos <= z.to && worstPos >= z.from;
        const clinched = bestPos >= z.from && worstPos <= z.to;
        s[z.key] = { canReach, clinched, impossible: !canReach, bestPos, worstPos };
      }
      out[t.team] = s;
    }
    return out;
  }
  FQ.mathStatus = mathStatus;

  /* ------------------------------------------------------------------ Monte-Carlo */
  function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  FQ.mulberry = mulberry;

  /**
   * Prépare une projection : vérifie règles, calendrier et modèle. Ne simule rien encore.
   */
  function prepareProjection(matches, comp, season, today, model, rulesMap) {
    const rules = (rulesMap || RULES)[comp];
    if (!rules) return { ok: false, reason: "Règlement de la compétition non vérifié : projection désactivée." };
    const st = seasonTable(matches, comp, season, null, rulesMap);
    if (rules.split) return { ok: false, reason: `Calendrier incomplet : ${st.total} matchs publiés sur ${rules.matches} de la phase 1 (33 journées), puis scission en groupes non programmée. Projection désactivée.` };
    if (st.teams.length !== rules.teams) return { ok: false, reason: `${st.teams.length} équipes dans les données, ${rules.teams} attendues : projection désactivée.` };
    if (st.total !== rules.matches) return { ok: false, reason: `Calendrier incomplet : ${st.total} rencontres sur ${rules.matches} attendues. Projection désactivée.` };
    if (!model || !model.ok) return { ok: false, reason: "Modèle non ajusté : projection impossible." };
    const missingTeam = st.teams.find((t) => !model.teams[t]);
    if (missingTeam) return { ok: false, reason: `Équipe sans paramètres dans le modèle : ${missingTeam}.` };
    const played = st.seasonMatches.filter((m) => m.hg !== null).map((m) => ({ h: m.home, a: m.away, hg: m.hg, ag: m.ag }));
    const remaining = st.seasonMatches.filter((m) => m.hg === null);
    const nMissing = remaining.filter((m) => m.date < today).length;
    const rem = remaining.map((m) => {
      const pr = FQ.predictMatch(model, m, {});
      const cdf = new Float64Array(121); let acc = 0;
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { acc += pr.matrix.M[i][j]; cdf[i * 11 + j] = acc; }
      return { id: m.id, h: m.home, a: m.away, date: m.date, cdf, p: [pr.markets.p1, pr.markets.pN, pr.markets.p2] };
    });
    return { ok: true, rules, comp, season, teams: st.teams, played, rem, nMissing, model, current: st.table };
  }
  FQ.prepareProjection = prepareProjection;

  /**
   * Simule nSims fins de saison par lots (callback de progression). Conserve, pour chaque simulation,
   * l'issue de chaque match restant (0/1/2) et la position finale de chaque équipe : cela permet
   * de calculer les probabilités conditionnelles (levier d'un match) sans relancer la simulation.
   */
  function runProjection(prep, nSims, seed, onChunk, done) {
    const R = prep.rem.length, N = prep.teams.length;
    const idx = {}; prep.teams.forEach((t, i) => (idx[t] = i));
    const outcomes = new Uint8Array(nSims * R);
    const positions = new Uint8Array(nSims * N);
    const ptsSum = new Float64Array(N), ptsSq = new Float64Array(N);
    const rng = mulberry(seed);
    const crit = prep.rules.tiebreak;
    let s = 0;
    const step = () => {
      const end = Math.min(nSims, s + 250);
      for (; s < end; s++) {
        const results = prep.played.slice();
        for (let r = 0; r < R; r++) {
          const m = prep.rem[r]; const u = rng() * m.cdf[120];
          let k = 0; while (k < 120 && m.cdf[k] < u) k++;
          const hg = (k / 11) | 0, ag = k % 11;
          results.push({ h: m.h, a: m.a, hg, ag });
          outcomes[s * R + r] = hg > ag ? 0 : hg === ag ? 1 : 2;
        }
        const table = computeTable(prep.teams, results, crit, { rng });
        for (const row of table) { const i = idx[row.team]; positions[s * N + i] = row.pos; ptsSum[i] += row.pts; ptsSq[i] += row.pts * row.pts; }
      }
      onChunk && onChunk(s / nSims);
      if (s < nSims) setTimeout(step, 0);
      else done(summarizeProjection(prep, { nSims, seed, outcomes, positions, ptsSum, ptsSq }));
    };
    setTimeout(step, 0);
  }
  FQ.runProjection = runProjection;

  /** Version synchrone (tests, Node) */
  function runProjectionSync(prep, nSims, seed) {
    let out = null;
    const R = prep.rem.length, N = prep.teams.length;
    const idx = {}; prep.teams.forEach((t, i) => (idx[t] = i));
    const outcomes = new Uint8Array(nSims * R), positions = new Uint8Array(nSims * N);
    const ptsSum = new Float64Array(N), ptsSq = new Float64Array(N);
    const rng = mulberry(seed);
    for (let s = 0; s < nSims; s++) {
      const results = prep.played.slice();
      for (let r = 0; r < R; r++) {
        const m = prep.rem[r]; const u = rng() * m.cdf[120];
        let k = 0; while (k < 120 && m.cdf[k] < u) k++;
        const hg = (k / 11) | 0, ag = k % 11;
        results.push({ h: m.h, a: m.a, hg, ag });
        outcomes[s * R + r] = hg > ag ? 0 : hg === ag ? 1 : 2;
      }
      const table = computeTable(prep.teams, results, prep.rules.tiebreak, { rng });
      for (const row of table) { const i = idx[row.team]; positions[s * N + i] = row.pos; ptsSum[i] += row.pts; ptsSq[i] += row.pts * row.pts; }
    }
    out = summarizeProjection(prep, { nSims, seed, outcomes, positions, ptsSum, ptsSq });
    return out;
  }
  FQ.runProjectionSync = runProjectionSync;

  function summarizeProjection(prep, raw) {
    const { nSims, positions, ptsSum, ptsSq } = raw;
    const N = prep.teams.length;
    const teams = prep.teams.map((t, i) => {
      const posCount = new Array(N + 1).fill(0);
      for (let s = 0; s < nSims; s++) posCount[positions[s * N + i]]++;
      const mean = ptsSum[i] / nSims, sd = Math.sqrt(Math.max(0, ptsSq[i] / nSims - mean * mean));
      const zones = {};
      for (const z of prep.rules.zones) { let c = 0; for (let p = z.from; p <= z.to; p++) c += posCount[p]; zones[z.key] = c / nSims; }
      let ep = 0; for (let p = 1; p <= N; p++) ep += p * posCount[p] / nSims;
      // intervalle 90 % du rang
      let acc = 0, lo = null, hi = null;
      for (let p = 1; p <= N; p++) { acc += posCount[p] / nSims; if (lo === null && acc >= 0.05) lo = p; if (hi === null && acc >= 0.95) hi = p; }
      return { team: t, meanPts: mean, sdPts: sd, expPos: ep, posLo: lo, posHi: hi, zones, posDist: posCount.slice(1).map((c) => c / nSims) };
    }).sort((a, b) => a.expPos - b.expPos);
    return { comp: prep.comp, season: prep.season, nSims, seed: raw.seed, remaining: prep.rem.length, nMissing: prep.nMissing, teams, raw, prep,
      at: new Date().toISOString(), modelAsOf: prep.model.asOf, engineVersion: FQ.ENGINE_VERSION };
  }

  /** Probabilités de zone conditionnelles à l'issue d'un match restant (levier du match) */
  function matchLeverage(proj, matchId, team) {
    const r = proj.prep.rem.findIndex((m) => m.id === matchId);
    if (r < 0) return null;
    const R = proj.prep.rem.length, N = proj.prep.teams.length, nS = proj.nSims;
    const ti = proj.prep.teams.indexOf(team);
    const cnt = [0, 0, 0]; const zc = [{}, {}, {}];
    for (const z of proj.prep.rules.zones) for (let k = 0; k < 3; k++) zc[k][z.key] = 0;
    for (let s = 0; s < nS; s++) {
      const k = proj.raw.outcomes[s * R + r]; cnt[k]++;
      const pos = proj.raw.positions[s * N + ti];
      for (const z of proj.prep.rules.zones) if (pos >= z.from && pos <= z.to) zc[k][z.key]++;
    }
    const out = {};
    for (const z of proj.prep.rules.zones) {
      const c = [0, 1, 2].map((k) => (cnt[k] ? zc[k][z.key] / cnt[k] : null));
      const isHome = proj.prep.rem[r].h === team;
      const win = isHome ? c[0] : c[2], loss = isHome ? c[2] : c[0];
      out[z.key] = { label: z.label, kind: z.kind, ifWin: win, ifDraw: c[1], ifLoss: loss, leverage: win !== null && loss !== null ? Math.abs(win - loss) : null, n: cnt };
    }
    return out;
  }
  FQ.matchLeverage = matchLeverage;

  /** Synthèse de l'enjeu : séparation stricte mathématique / estimée / non modélisée */
  function stakeSummary(team, proj, math, lev, rules) {
    const items = [];
    const P = proj ? (proj.teams.find((x) => x.team === team) || null) : null;
    const zs = rules.zones;
    const zp = (k) => (P ? P.zones[k] : null);
    const cat = [];
    const title = zs.find((z) => z.key === "title");
    if (title) {
      const m = math[team] && math[team].title;
      if (m && m.clinched) cat.push({ k: "Titre", txt: "Titre mathématiquement assuré" });
      else if (m && !m.canReach) items.push({ type: "math", txt: "Titre mathématiquement hors d'atteinte" });
      else if (zp("title") !== null && zp("title") >= 0.02) cat.push({ k: "Course au titre", txt: `P(titre) ≈ ${(100 * zp("title")).toFixed(1)} %` });
    }
    const eu = zs.filter((z) => z.kind === "eu" && z.key !== "title");
    for (const z of eu) { const p = zp(z.key); if (p !== null && p >= 0.05 && p <= 0.95) { cat.push({ k: z.key === "promo" ? "Promotion" : z.key === "champgrp" ? "Groupe championnat" : "Qualification continentale", txt: `${z.label} : ${(100 * p).toFixed(1)} %` }); break; } }
    for (const z of zs.filter((z) => z.kind === "eu2" || z.kind === "eu3")) { const p = zp(z.key); if (p !== null && p >= 0.05 && p <= 0.95 && z.key === "po") cat.push({ k: "Barrages / phase finale", txt: `${z.label} : ${(100 * p).toFixed(1)} %` }); }
    const relP = zs.filter((z) => z.kind === "rel" || z.kind === "bar").reduce((a, z) => a + (zp(z.key) || 0), 0);
    if (P && relP >= 0.05 && relP <= 0.95) cat.push({ k: "Maintien", txt: `P(relégation ou barrage) ≈ ${(100 * relP).toFixed(1)} %` });
    const relz = zs.find((z) => z.kind === "rel");
    if (relz && math[team] && math[team][relz.key]) {
      if (math[team][relz.key].impossible) items.push({ type: "math", txt: "Mathématiquement à l'abri de la relégation directe" });
      if (math[team][relz.key].clinched) items.push({ type: "math", txt: "Mathématiquement relégué" });
    }
    let maxLev = null;
    if (lev) for (const v of Object.values(lev)) if (v.leverage !== null && (!maxLev || v.leverage > maxLev.leverage)) maxLev = v;
    if (maxLev && maxLev.leverage >= 0.15) cat.push({ k: "Match couperet", txt: `${maxLev.label} : ${(100 * maxLev.ifWin).toFixed(0)} % si victoire contre ${(100 * maxLev.ifLoss).toFixed(0)} % si défaite` });
    if (P && !cat.length) cat.push({ k: "Enjeu limité", txt: "Aucune zone dont la probabilité se situe entre 5 % et 95 %" });
    const objective = cat.length ? cat[0].k : null;
    return { categories: cat, mathItems: items, objective, maxLev };
  }
  FQ.stakeSummary = stakeSummary;

  /* ------------------------------------------------------------------ test hors échantillon du driver « enjeu » */
  /**
   * Caractéristique testée : « enjeu limité » = équipe mathématiquement fixée (ne peut ni atteindre une zone meilleure
   * ni tomber dans une zone pire) d'après le classement connu AVANT le match. Effet testé : λ × exp(β).
   * β estimé sur les 60 % premiers matchs concernés (ordre chronologique), évalué sur les 40 % restants.
   */
  function lockedFlags(table, rules) {
    const ms = mathStatus(table, rules);
    const out = {};
    const N = table.length;
    for (const r of table) {
      const s = ms[r.team];
      // zone actuelle de l'équipe (ou « aucune »)
      const inZone = rules.zones.filter((z) => r.pos >= z.from && r.pos <= z.to).map((z) => z.key);
      let locked = true;
      for (const z of rules.zones) {
        const st = s[z.key];
        const isIn = inZone.includes(z.key);
        if (isIn && !st.clinched) locked = false;      // peut encore sortir de sa zone
        if (!isIn && st.canReach) locked = false;      // peut encore entrer dans une autre zone
      }
      out[r.team] = locked && r.remaining > 0 && r.remaining < N;
    }
    return out;
  }
  FQ.lockedFlags = lockedFlags;

  function stakeDriverBacktest(matches, comps, seasonOf, onProgress, rulesMap) {
    const rows = [];
    for (const comp of comps) {
      const rules = (rulesMap || RULES)[comp]; const season = seasonOf[comp];
      if (!rules || rules.split || !season) continue;
      const test = matches.filter((m) => m.comp === comp && m.season === season && m.hg !== null && FQ.isRegular(m));
      const dates = [...new Set(test.map((m) => m.date))].sort();
      for (const d of dates) {
        const st = seasonTable(matches, comp, season, d, rulesMap);
        if (st.played < st.total * 0.5) continue; // l'enjeu n'est potentiellement fixé qu'en seconde moitié
        const flags = lockedFlags(st.table, rules);
        if (!Object.values(flags).some(Boolean)) continue;
        const model = FQ.fitModel(matches, comp, d);
        if (!model.ok) continue;
        for (const m of test.filter((x) => x.date === d)) {
          if (!flags[m.home] && !flags[m.away]) continue;
          const pr = FQ.predictMatch(model, m, {});
          if (!pr.ok) continue;
          rows.push({ comp, date: d, id: m.id, lh: pr.lambdaHome, la: pr.lambdaAway, rho: pr.rho, fh: flags[m.home] ? 1 : 0, fa: flags[m.away] ? 1 : 0, k: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2 });
        }
      }
      onProgress && onProgress(comp);
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (rows.length < 40) return { ok: false, reason: `${rows.length} matchs concernés : échantillon insuffisant (< 40) pour estimer l'effet.`, n: rows.length, rows };
    const cut = Math.floor(rows.length * 0.6);
    const tr = rows.slice(0, cut), te = rows.slice(cut);
    const ll = (set, beta) => set.reduce((a, r) => {
      const sm = FQ.scoreMatrix(r.lh * Math.exp(beta * r.fh), r.la * Math.exp(beta * r.fa), r.rho, 10);
      const mk = FQ.marketsFromMatrix(sm);
      return a + FQ.metrics.logLoss3([mk.p1, mk.pN, mk.p2], r.k);
    }, 0) / set.length;
    let best = 0, bestLL = ll(tr, 0);
    for (let b = -0.7; b <= 0.3001; b += 0.02) { const v = ll(tr, b); if (v < bestLL - 1e-12) { bestLL = v; best = Math.round(b * 100) / 100; } }
    const before = ll(te, 0), after = ll(te, best);
    // bootstrap de l'écart sur l'échantillon test
    const per = te.map((r) => {
      const f = (beta) => { const mk = FQ.marketsFromMatrix(FQ.scoreMatrix(r.lh * Math.exp(beta * r.fh), r.la * Math.exp(beta * r.fa), r.rho, 10)); return FQ.metrics.logLoss3([mk.p1, mk.pN, mk.p2], r.k); };
      return f(best) - f(0);
    });
    const rng = mulberry(99); const bs = [];
    for (let i = 0; i < 300; i++) { let s = 0; for (let j = 0; j < per.length; j++) s += per[Math.floor(rng() * per.length)]; bs.push(s / per.length); }
    bs.sort((a, b) => a - b);
    const ci = [bs[7], bs[292]];
    const accepted = after < before && ci[1] < 0 && te.length >= 30;
    return { ok: true, beta: best, nTrain: tr.length, nTest: te.length, trainLoss: bestLL, testBefore: before, testAfter: after, ci, accepted, comps: [...new Set(rows.map((r) => r.comp))] };
  }
  FQ.stakeDriverBacktest = stakeDriverBacktest;
})(typeof window !== "undefined" ? window : globalThis);
