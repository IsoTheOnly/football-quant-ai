/* =========================================================================
   FOOTBALL QUANT AI — moteur quantitatif (fonctions pures, sans dépendance)
   Chargé tel quel dans le navigateur et dans Node (tests).
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ || (root.FQ = {});
  const ENGINE_VERSION = "1.0.0";
  FQ.ENGINE_VERSION = ENGINE_VERSION;

  /* ---------------------------------------------------------------- utils */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const isNum = (x) => typeof x === "number" && Number.isFinite(x);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const DAY = 86400000;
  const dateMs = (d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  const daysBetween = (a, b) => Math.round((dateMs(b) - dateMs(a)) / DAY);
  const addDays = (d, n) => new Date(dateMs(d) + n * DAY).toISOString().slice(0, 10);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const uid = (p = "id") => p + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  /** Jour de la semaine ISO (1 = lundi … 7 = dimanche) et lundi de la semaine d'une date AAAA-MM-JJ */
  const isoDow = (d) => ((new Date(dateMs(d)).getUTCDay() + 6) % 7) + 1;
  const weekMonday = (d) => addDays(d, 1 - isoDow(d));
  FQ.util = { clamp, isNum, sum, dateMs, daysBetween, addDays, r4, uid, isoDow, weekMonday };

  const LOGFACT = [0];
  for (let i = 1; i <= 60; i++) LOGFACT[i] = LOGFACT[i - 1] + Math.log(i);
  function poissonPmf(k, lam) {
    if (lam <= 0) return k === 0 ? 1 : 0;
    return Math.exp(-lam + k * Math.log(lam) - LOGFACT[k]);
  }
  FQ.poissonPmf = poissonPmf;

  /* ------------------------------------------------------- fuseaux horaires */
  function tzOffsetMs(tz, utcMs) {
    try {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const p = {};
      f.formatToParts(new Date(utcMs)).forEach((x) => (p[x.type] = x.value));
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return asUtc - utcMs;
    } catch (e) {
      return 0;
    }
  }
  /** Heure source (locale de la compétition, ou "HH:MM UTC±h") -> instant UTC (ms) ; null si heure inconnue */
  function kickoffUtc(date, time, tz) {
    if (!time) return null;
    const m = /^(\d{1,2}):(\d{2})(?:\s*UTC([+-]\d{1,2}))?/.exec(time);
    if (!m) return null;
    const [y, mo, d] = date.split("-").map(Number);
    const naive = Date.UTC(y, mo - 1, d, +m[1], +m[2]);
    if (m[3] !== undefined) return naive - +m[3] * 3600000;
    let guess = naive - tzOffsetMs(tz, naive);
    guess = naive - tzOffsetMs(tz, guess);
    return guess;
  }
  function formatInTz(utcMs, tz, opts) {
    try {
      return new Intl.DateTimeFormat("fr-FR", Object.assign({ timeZone: tz }, opts)).format(new Date(utcMs));
    } catch (e) {
      return new Date(utcMs).toISOString();
    }
  }
  /** date calendaire (YYYY-MM-DD) d'un instant dans un fuseau */
  function dateInTz(utcMs, tz) {
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(utcMs)).forEach((x) => (p[x.type] = x.value));
    return `${p.year}-${p.month}-${p.day}`;
  }
  FQ.time = { tzOffsetMs, kickoffUtc, formatInTz, dateInTz };

  /* ------------------------------------------------------------- dataset */
  /** Normalise le snapshot openfootball en objets match. today = YYYY-MM-DD */
  function buildMatches(dataset, today) {
    const out = [];
    for (const c of dataset.competitions) {
      for (const s of c.seasons) {
        for (const r of s.matches) {
          const [id, date, time, round, home, away, hg, ag, goals, x0] = r;
          const x = x0 || {};
          const played = hg !== null && hg !== undefined;
          const web = x.sources ? x : null;
          const src = web ? `web recoupé (${(web.sources || []).join(" + ")})` : x.eid ? "ESPN" : x.src || (dataset.version === 2 ? "football-data.co.uk" : "openfootball");
          out.push({
            id, comp: c.code, season: s.season, date, time, tz: c.tz, round, home, away,
            hg: played ? hg : null, ag: played ? ag : null,
            goals: goals || null, // null = buteurs inconnus
            status: played ? "TERMINÉ" : x.status ? x.status : date < today ? "RÉSULTAT MANQUANT" : "PROGRAMMÉ",
            neutral: x.neutral !== undefined ? !!x.neutral : c.code === "WC" ? !/Mexico|Canada|United States|USA/.test(home) : false,
            regular: x.reg !== undefined ? !!x.reg : undefined,
            odds: x.odds || (x.oddsIsClose && x.close ? Object.assign({}, x.close, { src: x.close.src + " — utilisée faute de cote d'avant-match" }) : null),
            close: x.close || null, closeRef: x.closeRef || null, oddsFr: x.oddsFr || null, oddsFrX: x.oddsFrX || null, oddsSharp: x.oddsSharp || null, sot: x.sot || null, oddsIsClose: x.oddsIsClose || 0, ou25: x.ou25 || null, xg: x.xg || null, aet: x.aet || null, ft: x.ft || null, eid: x.eid || null,
            source: src, sourceFile: s.file, sourceCommitDate: s.commitDate,
            webCheck: web,
          });
        }
      }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
  }
  FQ.buildMatches = buildMatches;

  /** Contrôle qualité : doublons, dates invalides, scores incohérents, équipes identiques, résultats manquants */
  function qualityReport(matches, today) {
    const issues = [];
    const seen = new Map();
    const pairDay = new Map();
    for (const m of matches) {
      if (seen.has(m.id)) issues.push({ type: "doublon d'identifiant", id: m.id });
      seen.set(m.id, 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || isNaN(dateMs(m.date))) issues.push({ type: "date invalide", id: m.id });
      if (m.home === m.away) issues.push({ type: "équipes identiques", id: m.id });
      if (m.hg !== null && (m.hg < 0 || m.ag < 0 || m.hg > 20 || m.ag > 20)) issues.push({ type: "score aberrant", id: m.id });
      if (m.hg !== null && m.date > today) issues.push({ type: "score dans le futur (fuite d'information)", id: m.id });
      const k = m.comp + m.date + m.home + m.away;
      if (pairDay.has(k)) issues.push({ type: "rencontre dupliquée", id: m.id });
      pairDay.set(k, 1);
      if (m.goals && m.hg !== null) {
        const g0 = m.goals.filter((g) => g[0] === 0).length;
        const g1 = m.goals.filter((g) => g[0] === 1).length;
        if (m.goals.length && (g0 !== m.hg || g1 !== m.ag)) issues.push({ type: "buteurs ≠ score", id: m.id });
      }
    }
    const missing = matches.filter((m) => m.status === "RÉSULTAT MANQUANT").length;
    return { issues, missing, checked: matches.length };
  }
  FQ.qualityReport = qualityReport;

  /* ------------------------------------------------- modèle Poisson / Dixon-Coles */
  const DEFAULT_FIT = {
    halfLifeDays: 180,   // pondération temporelle (Dixon & Coles 1997, ξ = ln2/halfLife)
    maxAgeDays: 730,
    priorMatches: 4,     // rétrécissement bayésien vers la moyenne (pseudo-matchs)
    promotedAtt: -0.15,  // hypothèse : équipe absente de la saison précédente de la compétition
    promotedDef: 0.15,
    maxIter: 200,
    tol: 1e-7,
  };
  FQ.DEFAULT_FIT = DEFAULT_FIT;

  /** Dixon-Coles tau */
  function dcTau(x, y, lh, la, rho) {
    if (x === 0 && y === 0) return 1 - lh * la * rho;
    if (x === 0 && y === 1) return 1 + lh * rho;
    if (x === 1 && y === 0) return 1 + la * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  }
  FQ.dcTau = dcTau;

  /**
   * Ajustement par maximum de vraisemblance pondéré (log λ = μ + γ·dom + att_i + def_j),
   * algorithme de mise à jour multiplicative (exacte coordonnée par coordonnée pour un modèle de Poisson log-linéaire),
   * avec rétrécissement vers un prior. Puis ρ de Dixon-Coles par recherche sur grille.
   * N'utilise que les matchs strictement antérieurs à asOf (pas de fuite).
   */
  function fitModel(allMatches, comp, asOf, opts) {
    const trained = !(opts && opts.ignoreTrained) && FQ.TRAINED && FQ.TRAINED.leagues && FQ.TRAINED.leagues[comp] && FQ.TRAINED.leagues[comp].params;
    const o = Object.assign({}, DEFAULT_FIT, trained || {}, opts || {});
    const train = allMatches.filter(
      (m) => m.comp === comp && m.hg !== null && m.date < asOf && daysBetween(m.date, asOf) <= o.maxAgeDays
    );
    const xi = Math.LN2 / o.halfLifeDays;
    const rows = train.map((m) => ({
      h: m.home, a: m.away, hg: m.hg, ag: m.ag, w: Math.exp(-xi * daysBetween(m.date, asOf)),
      neutral: !!m.neutral, date: m.date, season: m.season,
    }));
    const teams = {};
    const ensure = (t) => (teams[t] || (teams[t] = { att: 0, def: 0, nEff: 0, games: 0, lastDate: null, priorAtt: 0, priorDef: 0 }));
    rows.forEach((r) => {
      for (const t of [r.h, r.a]) {
        const T = ensure(t);
        T.nEff += r.w; T.games += 1;
        if (!T.lastDate || r.date > T.lastDate) T.lastDate = r.date;
      }
    });
    // prior "promu" : équipes présentes dans la saison courante mais pas dans la précédente
    const seasons = [...new Set(train.map((m) => m.season))].sort();
    if (seasons.length >= 2) {
      const cur = seasons[seasons.length - 1], prev = seasons[seasons.length - 2];
      const inPrev = new Set(train.filter((m) => m.season === prev).flatMap((m) => [m.home, m.away]));
      train.filter((m) => m.season === cur).forEach((m) => {
        for (const t of [m.home, m.away]) if (!inPrev.has(t)) { teams[t].priorAtt = o.promotedAtt; teams[t].priorDef = o.promotedDef; teams[t].promoted = true; }
      });
    }
    const W = sum(rows.map((r) => r.w));
    if (rows.length < 10 || W < 3) {
      return { ok: false, reason: "Moins de 10 matchs exploitables avant cette date", comp, asOf, nMatches: rows.length, teams, params: o };
    }
    const goals = sum(rows.map((r) => r.w * (r.hg + r.ag)));
    let mu = Math.log(goals / (2 * W));
    const hw = sum(rows.filter((r) => !r.neutral).map((r) => r.w * r.hg));
    const aw = sum(rows.filter((r) => !r.neutral).map((r) => r.w * r.ag));
    let gamma = hw > 0 && aw > 0 ? Math.log(hw / aw) : 0;
    const names = Object.keys(teams);
    const k = o.priorMatches;
    let iter = 0, delta = 1;
    for (; iter < o.maxIter && delta > o.tol; iter++) {
      const prev = { mu, gamma, t: names.map((t) => [teams[t].att, teams[t].def]) };
      const base = Math.exp(mu);
      // attaque
      const numA = {}, denA = {}, numD = {}, denD = {};
      names.forEach((t) => (numA[t] = denA[t] = numD[t] = denD[t] = 0));
      for (const r of rows) {
        const g = r.neutral ? 0 : gamma;
        const H = teams[r.h], A = teams[r.a];
        numA[r.h] += r.w * r.hg; denA[r.h] += r.w * Math.exp(mu + g + H.def * 0 + A.def);
        numA[r.a] += r.w * r.ag; denA[r.a] += r.w * Math.exp(mu + H.def);
      }
      for (const t of names) {
        const T = teams[t];
        T.att = Math.log((numA[t] + k * base * Math.exp(T.priorAtt)) / (denA[t] + k * base));
      }
      for (const r of rows) {
        const g = r.neutral ? 0 : gamma;
        const H = teams[r.h], A = teams[r.a];
        numD[r.a] += r.w * r.hg; denD[r.a] += r.w * Math.exp(mu + g + H.att);
        numD[r.h] += r.w * r.ag; denD[r.h] += r.w * Math.exp(mu + A.att);
      }
      for (const t of names) {
        const T = teams[t];
        T.def = Math.log((numD[t] + k * base * Math.exp(T.priorDef)) / (denD[t] + k * base));
      }
      // avantage domicile
      let num = 0, den = 0;
      for (const r of rows) if (!r.neutral) { num += r.w * r.hg; den += r.w * Math.exp(mu + teams[r.h].att + teams[r.a].def); }
      if (num > 0 && den > 0) gamma = Math.log(num / den);
      // intercept
      let en = 0;
      for (const r of rows) {
        const g = r.neutral ? 0 : gamma;
        en += r.w * (Math.exp(mu + g + teams[r.h].att + teams[r.a].def) + Math.exp(mu + teams[r.a].att + teams[r.h].def));
      }
      mu = mu + Math.log(goals / en);
      // identifiabilité : centrage pondéré
      const ws = names.map((t) => teams[t].nEff);
      const Ws = sum(ws);
      const ma = sum(names.map((t, i) => ws[i] * teams[t].att)) / Ws;
      const md = sum(names.map((t, i) => ws[i] * teams[t].def)) / Ws;
      names.forEach((t) => { teams[t].att -= ma; teams[t].def -= md; });
      mu += ma + md;
      delta = Math.max(Math.abs(mu - prev.mu), Math.abs(gamma - prev.gamma));
      names.forEach((t, i) => { delta = Math.max(delta, Math.abs(teams[t].att - prev.t[i][0]), Math.abs(teams[t].def - prev.t[i][1])); });
    }
    // ρ Dixon-Coles : grille, seulement si échantillon suffisant
    let rho = 0, rhoNote = "ρ = 0 (échantillon < 150 matchs pondérés)";
    const lam = (r) => [
      Math.exp(mu + (r.neutral ? 0 : gamma) + teams[r.h].att + teams[r.a].def),
      Math.exp(mu + teams[r.a].att + teams[r.h].def),
    ];
    let ll0 = 0;
    for (const r of rows) { const [lh, la] = lam(r); ll0 += r.w * (Math.log(poissonPmf(Math.min(r.hg, 60), lh)) + Math.log(poissonPmf(Math.min(r.ag, 60), la))); }
    if (W >= 150) {
      let best = -Infinity;
      for (let c = -0.2; c <= 0.1001; c += 0.01) {
        let ll = 0, ok = true;
        for (const r of rows) {
          if (r.hg > 1 || r.ag > 1) continue;
          const [lh, la] = lam(r);
          const t = dcTau(r.hg, r.ag, lh, la, c);
          if (t <= 0) { ok = false; break; }
          ll += r.w * Math.log(t);
        }
        if (ok && ll > best) { best = ll; rho = Math.round(c * 100) / 100; }
      }
      rhoNote = `ρ estimé par vraisemblance pondérée (grille −0,20…0,10)`;
    }
    return {
      ok: true, comp, asOf, mu, gamma, rho, rhoNote, teams, nMatches: rows.length, sumW: W,
      iterations: iter, converged: delta <= o.tol, logLik: ll0, params: o,
      avgGoals: goals / (2 * W),
    };
  }
  FQ.fitModel = fitModel;

  /* ------------------------------------------------------------- drivers */
  // Chaque driver : effet multiplicatif sur λ (hypothèse non apprise, plafonnée).
  const DRIVER_DEFS = [
    { key: "absAttH", side: "H", label: "Attaquants clés absents (domicile)", min: 0, max: 3, step: 1, unit: "joueur(s)", effect: { selfLam: -0.06 } },
    { key: "absDefH", side: "H", label: "Défenseurs clés absents (domicile)", min: 0, max: 3, step: 1, unit: "joueur(s)", effect: { oppLam: 0.05 } },
    { key: "gkH", side: "H", label: "Gardien titulaire absent (domicile)", min: 0, max: 1, step: 1, unit: "", effect: { oppLam: 0.07 } },
    { key: "absAttA", side: "A", label: "Attaquants clés absents (extérieur)", min: 0, max: 3, step: 1, unit: "joueur(s)", effect: { selfLam: -0.06 } },
    { key: "absDefA", side: "A", label: "Défenseurs clés absents (extérieur)", min: 0, max: 3, step: 1, unit: "joueur(s)", effect: { oppLam: 0.05 } },
    { key: "gkA", side: "A", label: "Gardien titulaire absent (extérieur)", min: 0, max: 1, step: 1, unit: "", effect: { oppLam: 0.07 } },
    { key: "fatigueH", side: "H", label: "Fatigue domicile (≤ 3 j de repos, rotation)", min: 0, max: 2, step: 1, unit: "niveau", effect: { selfLam: -0.035, oppLam: 0.02 } },
    { key: "fatigueA", side: "A", label: "Fatigue extérieur (≤ 3 j de repos, rotation)", min: 0, max: 2, step: 1, unit: "niveau", effect: { selfLam: -0.035, oppLam: 0.02 } },
    { key: "stakeH", side: "H", label: "Enjeu domicile (−1 faible … +1 vital)", min: -1, max: 1, step: 1, unit: "", effect: { selfLam: 0.03 } },
    { key: "stakeA", side: "A", label: "Enjeu extérieur (−1 faible … +1 vital)", min: -1, max: 1, step: 1, unit: "", effect: { selfLam: 0.03 } },
    { key: "weather", side: "B", label: "Météo défavorable (pluie forte / vent)", min: 0, max: 2, step: 1, unit: "niveau", effect: { bothLam: -0.04 } },
  ];
  FQ.DRIVER_DEFS = DRIVER_DEFS;
  const DRIVER_CAP = [0.7, 1.3];
  FQ.DRIVER_CAP = DRIVER_CAP;

  function driverMultipliers(drivers) {
    let mh = 1, ma = 1;
    const detail = [];
    for (const d of DRIVER_DEFS) {
      const v = (drivers && drivers[d.key]) || 0;
      if (!v) continue;
      const e = d.effect;
      let dh = 0, da = 0;
      if (d.side === "H") { dh += (e.selfLam || 0) * v; da += (e.oppLam || 0) * v; }
      if (d.side === "A") { da += (e.selfLam || 0) * v; dh += (e.oppLam || 0) * v; }
      if (d.side === "B") { dh += e.bothLam * v; da += e.bothLam * v; }
      mh *= 1 + dh; ma *= 1 + da;
      detail.push({ key: d.key, label: d.label, value: v, dHome: dh, dAway: da });
    }
    const capped = mh < DRIVER_CAP[0] || mh > DRIVER_CAP[1] || ma < DRIVER_CAP[0] || ma > DRIVER_CAP[1];
    return { mh: clamp(mh, DRIVER_CAP[0], DRIVER_CAP[1]), ma: clamp(ma, DRIVER_CAP[0], DRIVER_CAP[1]), detail, capped };
  }
  FQ.driverMultipliers = driverMultipliers;

  /* --------------------------------------------------- forces d'équipe complémentaires (drivers) */
  /**
   * Deux familles de forces, calculées comme le modèle de buts (attaque × défense × avantage du terrain, pondération temporelle),
   * mais sur d'autres observations des matchs passés :
   * - « sot » : tirs cadrés (football-data), convertis en buts au taux de conversion de la compétition ;
   * - « odds » : buts attendus implicites des cotes d'avant-match des matchs passés (ce que le marché pensait des équipes,
   *   donc transferts, blessures et forme déjà intégrés). Jamais la cote du match à prédire.
   * Seuls les matchs strictement antérieurs à asOf servent. Retour : { att, def, home, mu, conv } ou null.
   */
  const pmf = (k, l) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; };
  let INV_GRID = null;
  function impliedLambdas(odds) {
    if (!odds || !isNum(odds.h) || !isNum(odds.d) || !isNum(odds.a)) return null;
    if (!INV_GRID) {
      INV_GRID = [];
      for (let lh = 0.2; lh <= 4.01; lh += 0.05) for (let la = 0.2; la <= 4.01; la += 0.05) {
        let p1 = 0, pN = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const v = pmf(i, lh) * pmf(j, la); if (i > j) p1 += v; else if (i === j) pN += v; }
        INV_GRID.push([lh, la, p1, 1 - p1 - pN]);
      }
    }
    const inv = [1 / odds.h, 1 / odds.d, 1 / odds.a], t = inv[0] + inv[1] + inv[2], p1 = inv[0] / t, p2 = inv[2] / t;
    let b = null, bd = Infinity;
    for (const g of INV_GRID) { const d = (g[2] - p1) * (g[2] - p1) + (g[3] - p2) * (g[3] - p2); if (d < bd) { bd = d; b = g; } }
    return [b[0], b[1]];
  }
  FQ.impliedLambdas = impliedLambdas;
  const RATING_CACHE = new Map();
  function fitRatings(allMatches, comp, asOf, family, halfLife) {
    const key = comp + "|" + asOf + "|" + family + "|" + allMatches.length;
    if (RATING_CACHE.has(key)) return RATING_CACHE.get(key);
    const hl = halfLife || (family === "odds" ? 120 : 240);
    const W = [], teams = {};
    let sw = 0, sh = 0, sa = 0, g = 0, st = 0;
    for (const m of allMatches) {
      if (m.comp !== comp || m.hg === null || !(m.date < asOf)) continue;
      const age = daysBetween(m.date, asOf); if (age > 500) continue;
      let x = null;
      if (family === "sot") { if (m.sot) { x = m.sot; g += m.hg + m.ag; st += m.sot[0] + m.sot[1]; } }
      else if (family === "odds") { if (!m._il && m.odds) m._il = impliedLambdas(m.odds) || 0; x = m._il || null; }
      if (!x) continue;
      const w = Math.pow(0.5, age / hl);
      W.push([m.home, m.away, w, x[0], x[1]]); teams[m.home] = 1; teams[m.away] = 1; sw += w; sh += w * x[0]; sa += w * x[1];
    }
    let out = null;
    if (sw >= 20 && sa > 0) {
      const att = {}, def = {}, n = {}; for (const t in teams) { att[t] = 1; def[t] = 1; n[t] = 0; }
      const home = sh / sa, mu = sa / sw;
      for (const [h, a, w] of W) { n[h] += w; n[a] += w; }
      for (let it = 0; it < 25; it++) {
        const nA = {}, dA = {}, nD = {}, dD = {};
        for (const t in teams) { nA[t] = 0.5; dA[t] = 0.5; nD[t] = 0.5; dD[t] = 0.5; } // a priori : un demi-match moyen
        for (const [h, a, w, xh, xa] of W) {
          nA[h] += w * xh; dA[h] += w * mu * home * def[a]; nA[a] += w * xa; dA[a] += w * mu * def[h];
          nD[a] += w * xh; dD[a] += w * mu * home * att[h]; nD[h] += w * xa; dD[h] += w * mu * att[a];
        }
        for (const t in teams) { att[t] = nA[t] / dA[t]; def[t] = nD[t] / dD[t]; }
      }
      out = { att, def, home, mu, n, conv: family === "sot" ? (st ? g / st : 0.3) : 1 };
    }
    if (RATING_CACHE.size > 4000) RATING_CACHE.clear();
    RATING_CACHE.set(key, out);
    return out;
  }
  FQ.fitRatings = fitRatings;
  /**
   * Buts attendus d'un match par famille de forces. Une famille est absente si l'une des équipes y a moins d'un match pondéré.
   */
  function driverLambdas(allMatches, match, asOf, cfg) {
    const out = {};
    for (const fam of ["sot", "odds"]) {
      const F = fitRatings(allMatches, match.comp, asOf, fam, cfg && cfg.hl && cfg.hl[fam]);
      if (!F || !F.att[match.home] || !F.att[match.away] || F.n[match.home] < 1 || F.n[match.away] < 1) continue;
      const hm = match.neutral ? 1 : F.home;
      out[fam] = [F.conv * F.mu * hm * F.att[match.home] * F.def[match.away], F.conv * F.mu * F.att[match.away] * F.def[match.home]];
    }
    return out;
  }
  FQ.driverLambdas = driverLambdas;
  /** Combinaison géométrique des buts attendus : poids appris (goals = modèle de buts), renormalisés sur les familles disponibles */
  function combineLambdas(lh, la, dl, w) {
    if (!w) return null;
    let tw = w.goals || 0, xh = (w.goals || 0) * Math.log(lh), xa = (w.goals || 0) * Math.log(la);
    for (const fam of ["sot", "odds"]) if (w[fam] && dl[fam]) { tw += w[fam]; xh += w[fam] * Math.log(dl[fam][0]); xa += w[fam] * Math.log(dl[fam][1]); }
    if (!(tw > 0)) return null;
    return [Math.exp(xh / tw), Math.exp(xa / tw)];
  }
  FQ.combineLambdas = combineLambdas;

  /* --------------------------------------------------- matrice des scores */
  function scoreMatrix(lh, la, rho, maxG) {
    const N = maxG || 10;
    const M = [];
    let total = 0;
    for (let i = 0; i <= N; i++) {
      M[i] = [];
      for (let j = 0; j <= N; j++) {
        const v = poissonPmf(i, lh) * poissonPmf(j, la) * dcTau(i, j, lh, la, rho || 0);
        M[i][j] = v; total += v;
      }
    }
    const truncated = 1 - total; // masse hors 0..N (+ effet τ, qui conserve la masse totale)
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) M[i][j] /= total;
    return { M, N, truncatedMass: truncated };
  }
  FQ.scoreMatrix = scoreMatrix;

  function marketsFromMatrix(sm) {
    const { M, N } = sm;
    let p1 = 0, pN = 0, p2 = 0, btts = 0;
    const scores = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const v = M[i][j];
      if (i > j) p1 += v; else if (i === j) pN += v; else p2 += v;
      if (i > 0 && j > 0) btts += v;
      scores.push({ h: i, a: j, p: v });
    }
    scores.sort((a, b) => b.p - a.p);
    let over25 = 0; for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) if (i + j > 2) over25 += M[i][j];
    over25 /= sum(M.map((r) => sum(r))) || 1;
    return { p1, pN, p2, bttsYes: btts, bttsNo: 1 - btts, over25, topScores: scores.slice(0, 8), pHomeScores: 1 - sum(M.map((r) => r[0])) + 0, pAwayScores: 1 - sum(M[0]) };
  }
  FQ.marketsFromMatrix = marketsFromMatrix;

  /* ------------------------------------------------------------ prédiction */
  function predictMatch(model, match, opts) {
    const o = opts || {};
    const drv = driverMultipliers(o.drivers);
    let lh, la, base = null, src;
    if (o.manualLambda && isNum(o.manualLambda.h) && isNum(o.manualLambda.a)) {
      lh = o.manualLambda.h; la = o.manualLambda.a; src = "λ saisis par l'utilisateur (hypothèse)";
    } else {
      if (!model || !model.ok) return { ok: false, reason: (model && model.reason) || "Modèle non ajusté" };
      const H = model.teams[match.home], A = model.teams[match.away];
      if (!H || !A) return { ok: false, reason: `Équipe absente des données d'entraînement : ${!H ? match.home : match.away}` };
      const neutral = o.neutral !== undefined ? o.neutral : match.neutral;
      const g = neutral ? 0 : model.gamma;
      base = { h: Math.exp(model.mu + g + H.att + A.def), a: Math.exp(model.mu + A.att + H.def) };
      lh = base.h; la = base.a; src = "Poisson-Dixon-Coles ajusté (MLE pondéré)";
    }
    lh *= drv.mh; la *= drv.ma;
    if (o.extraMult) { lh *= o.extraMult.h; la *= o.extraMult.a; }
    const rho = o.manualLambda ? 0 : model.rho;
    const sm = scoreMatrix(lh, la, rho, 10);
    let mk = marketsFromMatrix(sm);
    const raw = { p1: mk.p1, pN: mk.pN, p2: mk.p2, bttsYes: mk.bttsYes };
    if (o.calibration) mk = applyCalibration(mk, o.calibration);
    return { ok: true, lambdaHome: lh, lambdaAway: la, base, rho, drivers: drv, matrix: sm, markets: mk, raw, source: src };
  }
  FQ.predictMatch = predictMatch;

  /* ------------------------------------------------------------ joueurs */
  /**
   * Modèle par amincissement de Poisson (thinning) :
   * buts de l'équipe ~ Poisson(λ_team). Chaque but est marqué par le joueur avec la probabilité s_g
   * et passé décisivement par lui avec la probabilité s_a (événements exclusifs pour un même but).
   * Le joueur joue m minutes (sur 90) s'il participe, avec la probabilité p_play.
   * P(buteur) = p_play · (1 − exp(−λ_team · m/90 · s_g))
   * P(décisif) = p_play · (1 − exp(−λ_team · m/90 · (s_g + s_a)))   [traite l'intersection buts/passes]
   * Hypothèse : intensité de but uniforme sur 90 min ; part de buts constante.
   */
  function playerProbs(lambdaTeam, pl) {
    const pPlay = clamp(+pl.pPlay || 0, 0, 1);
    const mins = clamp(+pl.minutes || 0, 0, 95) / 90;
    const sg = clamp(+pl.shareGoals || 0, 0, 0.95);
    const saKnown = pl.shareAssists !== null && pl.shareAssists !== undefined && pl.shareAssists !== "";
    const sa = saKnown ? clamp(+pl.shareAssists, 0, 0.95 - sg) : 0;
    const lg = lambdaTeam * mins * sg;
    const lgi = lambdaTeam * mins * (sg + sa);
    const pScore = pPlay * (1 - Math.exp(-lg));
    const pDec = saKnown ? pPlay * (1 - Math.exp(-lgi)) : null;
    return { pScore, pDecisive: pDec, lambdaGoals: lg, lambdaInvolvement: saKnown ? lgi : null, assistsKnown: saKnown };
  }
  FQ.playerProbs = playerProbs;

  /** Statistiques buteurs d'une équipe dans les données (pour pré-remplir la part de buts) */
  function teamScorers(matches, comp, team, asOf, seasonFilter) {
    const counts = {}; let teamGoals = 0, matchesWithData = 0, ownGoalsFor = 0;
    for (const m of matches) {
      if (m.comp !== comp || m.hg === null || m.date >= asOf || !m.goals) continue;
      if (seasonFilter && m.season !== seasonFilter) continue;
      const side = m.home === team ? 0 : m.away === team ? 1 : -1;
      if (side < 0) continue;
      if (m.goals.length === 0 && (side === 0 ? m.hg : m.ag) > 0) continue;
      matchesWithData++;
      for (const g of m.goals) {
        if (g[0] !== side) continue;
        teamGoals++;
        if (g[3] === "og") { ownGoalsFor++; continue; }
        counts[g[1]] = (counts[g[1]] || 0) + 1;
      }
    }
    const list = Object.entries(counts).map(([name, goals]) => ({ name, goals, share: teamGoals ? goals / teamGoals : 0 }))
      .sort((a, b) => b.goals - a.goals);
    return { list, teamGoals, matchesWithData, ownGoalsFor };
  }
  FQ.teamScorers = teamScorers;

  /* ------------------------------------------------------------ fiabilité */
  /**
   * Fiabilité de l'estimation (0-100), distincte de la probabilité.
   * F = 0,45·Profondeur + 0,35·Fraîcheur + 0,20·Échantillon − pénalités
   */
  function reliability(model, match, ctx) {
    const c = ctx || {};
    const notes = [];
    let depth = 0, sample = 0;
    if (c.manualLambda) {
      notes.push("λ saisis manuellement : fiabilité plafonnée à 40");
    }
    if (model && model.ok && model.teams[match.home] && model.teams[match.away]) {
      const n = Math.min(model.teams[match.home].nEff, model.teams[match.away].nEff);
      depth = 100 * (1 - Math.exp(-n / 8));
      sample = clamp((model.sumW / 150) * 100, 0, 100);
      notes.push(`Profondeur : ${n.toFixed(1)} matchs pondérés (équipe la moins documentée)`);
    }
    const missing = c.missingResults || 0;
    const stale = c.staleDays || 0;
    const fresh = clamp(100 - 20 * missing - Math.max(0, stale - 7) * 1.5, 0, 100);
    if (missing) notes.push(`${missing} résultat(s) récent(s) absent(s) des données pour ces équipes`);
    if (stale > 7) notes.push(`Dernier résultat connu de la compétition : il y a ${stale} jours`);
    const nDrivers = Object.values(c.drivers || {}).filter((v) => v).length;
    const pen = Math.min(20, 5 * nDrivers);
    if (nDrivers) notes.push(`${nDrivers} ajustement(s) manuel(s) : −${pen}`);
    let score = 0.45 * depth + 0.35 * fresh + 0.2 * sample - pen;
    if (c.manualLambda) score = Math.min(score || 40, 40);
    score = clamp(Math.round(score), 0, 100);
    return { score, depth: Math.round(depth), freshness: Math.round(fresh), sample: Math.round(sample), penalty: pen, notes };
  }
  FQ.reliability = reliability;

  /** Fiabilité d'un marché joueur : base × qualité des données joueur */
  function playerReliability(base, pl) {
    let q = 1; const notes = [];
    if (!pl.sharesFromData) { q *= 0.75; notes.push("parts de buts saisies (non mesurées)"); }
    if (!pl.minutesConfirmed) { q *= 0.85; notes.push("minutes attendues estimées"); }
    if (!pl.lineupConfirmed) { q *= 0.9; notes.push("composition non officielle"); }
    return { score: Math.round(base * q), notes };
  }
  FQ.playerReliability = playerReliability;

  /* ------------------------------------------------------------ calibration */
  const logit = (p) => Math.log(p / (1 - p));
  const sigm = (x) => 1 / (1 + Math.exp(-x));
  function calibBinary(p, T) {
    if (!T || T === 1) return p;
    const q = clamp(p, 1e-6, 1 - 1e-6);
    return sigm(T * logit(q));
  }
  function calib3(ps, T) {
    if (!T || T === 1) return ps;
    const e = ps.map((p) => Math.pow(clamp(p, 1e-9, 1), T));
    const s = sum(e);
    return e.map((x) => x / s);
  }
  /** Recalibration de Platt : p' = σ(a + b·logit p) — corrige un biais (a) et l'excès/défaut de confiance (b) */
  function plattBinary(p, ab) {
    if (!ab || !isNum(ab.a) || !isNum(ab.b)) return p;
    return sigm(ab.a + ab.b * logit(clamp(p, 1e-6, 1 - 1e-6)));
  }
  FQ.calibBinary = calibBinary; FQ.calib3 = calib3; FQ.plattBinary = plattBinary;
  function applyCalibration(mk, cal) {
    const out = Object.assign({}, mk);
    if (cal.T1N2 && cal.T1N2 !== 1) { const [a, b, c] = calib3([mk.p1, mk.pN, mk.p2], cal.T1N2); out.p1 = a; out.pN = b; out.p2 = c; }
    if (cal.bttsAB) { out.bttsYes = plattBinary(out.bttsYes, cal.bttsAB); out.bttsNo = 1 - out.bttsYes; }
    if (cal.TBTTS && cal.TBTTS !== 1) { out.bttsYes = calibBinary(out.bttsYes, cal.TBTTS); out.bttsNo = 1 - out.bttsYes; }
    return out;
  }
  FQ.applyCalibration = applyCalibration;

  /* ------------------------------------------------------------ scores */
  function brierBinary(p, o) { return (p - o) * (p - o); }
  function brier3(ps, k) { return sum(ps.map((p, i) => (p - (i === k ? 1 : 0)) ** 2)); }
  function logLossBinary(p, o) { const q = clamp(p, 1e-12, 1 - 1e-12); return -(o ? Math.log(q) : Math.log(1 - q)); }
  function logLoss3(ps, k) { return -Math.log(clamp(ps[k], 1e-12, 1)); }
  FQ.metrics = { brierBinary, brier3, logLossBinary, logLoss3 };

  function calibrationBins(pairs, nb) {
    const B = nb || 10;
    const bins = Array.from({ length: B }, (_, i) => ({ lo: i / B, hi: (i + 1) / B, n: 0, sp: 0, so: 0 }));
    for (const [p, o] of pairs) {
      const b = bins[Math.min(B - 1, Math.floor(p * B))];
      b.n++; b.sp += p; b.so += o;
    }
    return bins.filter((b) => b.n > 0).map((b) => ({ mid: (b.lo + b.hi) / 2, pred: b.sp / b.n, obs: b.so / b.n, n: b.n }));
  }
  FQ.calibrationBins = calibrationBins;

  /**
   * Apprentissage de température (validation chronologique 70/30) ;
   * retenu seulement si la log loss hors échantillon diminue.
   */
  function fitTemperature(samples, kind, minN) {
    const n = samples.length;
    const need = minN || 30;
    if (n < need) return { ok: false, reason: `${n} observation(s) résolue(s) < ${need} requises`, n };
    const sorted = samples.slice().sort((a, b) => (a.t < b.t ? -1 : 1));
    const cut = Math.floor(n * 0.7);
    const tr = sorted.slice(0, cut), te = sorted.slice(cut);
    const loss = (set, T) => sum(set.map((s) => kind === "3" ? logLoss3(calib3(s.p, T), s.o) : logLossBinary(calibBinary(s.p, T), s.o))) / set.length;
    let bestT = 1, best = loss(tr, 1);
    for (let T = 0.3; T <= 2.0001; T += 0.02) { const l = loss(tr, T); if (l < best - 1e-12) { best = l; bestT = Math.round(T * 100) / 100; } }
    const before = loss(te, 1), after = loss(te, bestT);
    return { ok: true, T: bestT, nTrain: tr.length, nTest: te.length, trainLoss: best, testBefore: before, testAfter: after, accepted: after < before };
  }
  FQ.fitTemperature = fitTemperature;

  /* ------------------------------------------------------------ value bet */
  function impliedProb(c) { return isNum(c) && c > 1 ? 1 / c : null; }
  function fairOdds(p) { return p > 0 ? 1 / p : null; }
  function expectedValue(p, c) { return isNum(c) && c > 1 ? p * c - 1 : null; }
  function minOdds(p, evMin) { return p > 0 ? (1 + evMin) / p : null; }
  /** Marge et probabilités corrigées (normalisation proportionnelle) — marché complet uniquement */
  function devig(oddsList) {
    if (!oddsList.every((c) => isNum(c) && c > 1)) return null;
    const inv = oddsList.map((c) => 1 / c);
    const s = sum(inv);
    return { margin: s - 1, probs: inv.map((x) => x / s) };
  }
  function kelly(p, c) { if (!(isNum(c) && c > 1)) return 0; return Math.max(0, (p * c - 1) / (c - 1)); }
  FQ.value = { impliedProb, fairOdds, expectedValue, minOdds, devig, kelly };

  const DEFAULT_SETTINGS = {
    initialBankroll: 100, currency: "u", unitMode: true,   // aucune bankroll réelle : capital de référence = 100 unités
    kellyFraction: 0.25, maxStakePct: 0.01, maxMatchPct: 0.04, maxTotalPct: 0.10, minStake: 0.1,
    evMin: 0.03, relMin: 55, missingWatch: 2, missingBlock: 4,
    agentMinN: 20, agentAlpha: 0.1, riskKappa: 0.05,
    timezone: "Europe/Paris", calibMinN: 30,
    autoBetMode: "policy",   // "policy" : selon la stratégie validée sur l'historique ; "always" ; "never"
    maxOdds: null,           // cote maximale (null = valeur apprise sur l'historique)
    horizonDays: 14,         // pronostics : toutes les rencontres programmées des 14 prochains jours
    ticketFromDow: 4,        // tickets de la semaine : construits à partir du jeudi, sur les matchs du jeudi au dimanche (cotes publiées 3 jours avant)
    paperTickets: true,      // paper betting des 3 tickets (unités fictives, 1 u par ticket)
    ticketPolicy: "auto",    // stratégies de ticket : "auto" (l'apprentissage choisit parmi toutes) ou "favoris" (issue la plus probable de chaque match seulement)
    oddsBook: "best",        // cotes : meilleur prix parmi les bookmakers français (The Odds API), ou un bookmaker choisi ; repli Bet 365
    ticketEvFloor: -0.2,     // espérance minimale d'un ticket affiché ; en dessous : « aucun ticket admissible » (les fantômes restent suivis)
    multiboost: false,       // Multiboost Betclic (option) : bonus de cote des combinés chiffrés chez Betclic
    ticketCfg: null,         // null = scénarios par défaut ; sinon [{ id, lo, hi, stake }]
  };
  FQ.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

  /**
   * Mise recommandée : Kelly fractionné, puis plafonds (mise max, exposition match, exposition totale, cash disponible).
   * Bankroll de référence = bankroll réalisée (capital + P&L réglé), jamais la valeur d'espérance.
   */
  function computeStake(p, c, s, acct, matchExposure) {
    const steps = [];
    const k = kelly(p, c);
    if (k <= 0) return { stake: 0, kellyFull: 0, steps: ["Kelly = 0 → aucune mise"] };
    const ref = acct.bankroll;
    let st = k * s.kellyFraction * ref;
    steps.push(`Kelly plein ${(k * 100).toFixed(2)} % × fraction ${(s.kellyFraction * 100).toFixed(0)} % × ${ref.toFixed(2)} = ${st.toFixed(2)}`);
    const capBet = s.maxStakePct * ref;
    if (st > capBet) { st = capBet; steps.push(`Plafond mise ${(s.maxStakePct * 100).toFixed(1)} % → ${capBet.toFixed(2)}`); }
    const capMatch = Math.max(0, s.maxMatchPct * ref - (matchExposure || 0));
    if (st > capMatch) { st = capMatch; steps.push(`Plafond match ${(s.maxMatchPct * 100).toFixed(1)} % (déjà engagé ${(matchExposure || 0).toFixed(2)}) → ${capMatch.toFixed(2)}`); }
    const capTotal = Math.max(0, s.maxTotalPct * ref - acct.openStakes);
    if (st > capTotal) { st = capTotal; steps.push(`Plafond exposition totale ${(s.maxTotalPct * 100).toFixed(0)} % → ${capTotal.toFixed(2)}`); }
    if (st > acct.cash) { st = Math.max(0, acct.cash); steps.push(`Limité au cash disponible ${acct.cash.toFixed(2)}`); }
    st = Math.floor(st * 100) / 100;
    if (st < s.minStake) { steps.push(`Inférieure à la mise minimale ${s.minStake} → 0`); st = 0; }
    return { stake: st, kellyFull: k, steps };
  }
  FQ.computeStake = computeStake;

  /* ------------------------------------------------------- agent de décision */
  function evBucket(ev) { return ev < 0.06 ? "EV3-6" : ev < 0.10 ? "EV6-10" : "EV10+"; }
  function relBucket(r) { return r < 65 ? "F<65" : r < 80 ? "F65-80" : "F80+"; }
  function oddsBucket(c) { return c < 1.8 ? "C<1.8" : c < 3 ? "C1.8-3" : "C3+"; }
  function stateKey(market, ev, rel, c) { return [market, evBucket(ev), relBucket(rel), oddsBucket(c)].join("|"); }
  FQ.stateKey = stateKey;

  /** Mise à jour Q(s, PRENDRE) ; la récompense est observable même pour une opportunité passée (le résultat ne dépend pas de l'action). */
  function qUpdate(qtable, key, reward, alpha) {
    const q = qtable[key] || { q: 0, n: 0, mean: 0, m2: 0 };
    const old = q.q;
    const nq = old + alpha * (reward - old);
    const n = q.n + 1;
    const d = reward - q.mean;
    const mean = q.mean + d / n;
    const m2 = q.m2 + d * (reward - mean);
    return { entry: { q: nq, n, mean, m2 }, old, nq };
  }
  FQ.qUpdate = qUpdate;
  function agentView(qtable, key, minN) {
    const q = qtable && qtable[key];
    if (!q || q.n < minN) return { active: false, n: q ? q.n : 0, q: q ? q.q : null };
    const sd = q.n > 1 ? Math.sqrt(q.m2 / (q.n - 1)) : 1;
    const ucb = q.mean + 1.0 * sd / Math.sqrt(q.n);
    return { active: true, n: q.n, q: q.q, mean: q.mean, ucb, veto: ucb < 0 };
  }
  FQ.agentView = agentView;
  function unitReward(status, odds, exposureShare, kappa) {
    let r = status === "GAGNÉ" ? odds - 1 : status === "PERDU" ? -1 : 0;
    return r - (kappa || 0) * (exposureShare || 0);
  }
  FQ.unitReward = unitReward;

  /**
   * Politique de décision : règles déterministes (EV, fiabilité, fraîcheur, risque), puis veto éventuel de l'agent bandit.
   */
  function decide(input) {
    const { p, odds, rel, market, s, acct, matchExposure, missing, qtable, playerUnavailable } = input;
    const reasons = [];
    const ev = expectedValue(p, odds);
    const out = { decision: "NO BET", ev, stake: 0, reasons, stakeSteps: [], agent: null };
    if (!(isNum(odds) && odds > 1.01 && odds < 1000)) { reasons.push("Cote absente ou invalide"); return out; }
    if (!(p > 0 && p < 1)) { reasons.push("Probabilité incohérente"); return out; }
    if (playerUnavailable) { reasons.push("Joueur indisponible"); return out; }
    if (missing >= s.missingBlock) { reasons.push(`Données trop anciennes : ${missing} résultats manquants`); return out; }
    if (ev <= 0) { reasons.push(`EV ${(ev * 100).toFixed(1)} % ≤ 0`); return out; }
    const st = computeStake(p, odds, s, acct, matchExposure);
    out.stakeSteps = st.steps; out.kellyFull = st.kellyFull;
    let watch = false;
    if (ev < s.evMin) { reasons.push(`EV ${(ev * 100).toFixed(1)} % < seuil ${(s.evMin * 100).toFixed(1)} %`); watch = true; }
    if (rel < s.relMin) {
      if (rel < s.relMin - 15) { reasons.push(`Fiabilité ${rel} trop faible`); return out; }
      reasons.push(`Fiabilité ${rel} < ${s.relMin}`); watch = true;
    }
    if (missing >= s.missingWatch) { reasons.push(`${missing} résultats récents manquants`); watch = true; }
    if (s.maxOdds > 1 && odds > s.maxOdds) { reasons.push(`Cote ${odds.toFixed(2)} au-dessus du plafond ${s.maxOdds} appris sur l'historique`); watch = true; }
    if (st.stake <= 0) {
      if (!watch) { reasons.push("Mise nulle après plafonds de risque (exposition)"); return out; }
    }
    const key = stateKey(market, ev, rel, odds);
    const ag = agentView(qtable, key, s.agentMinN);
    out.agent = Object.assign({ key }, ag);
    if (ag.active && ag.veto) { reasons.push(`Agent : Q moyen ${(ag.mean * 100).toFixed(1)} % (n=${ag.n}), borne haute < 0 → veto`); watch = true; }
    if (watch) { out.decision = "À SURVEILLER"; return out; }
    out.decision = "VALUE BET"; out.stake = st.stake;
    reasons.push(`EV ${(ev * 100).toFixed(1)} % ≥ ${(s.evMin * 100).toFixed(1)} %, fiabilité ${rel}`);
    return out;
  }
  FQ.decide = decide;

  /**
   * Choix préférentiel d'un match (un seul) :
   * 1. s'il existe une value bet admissible (cote connue, EV ≥ seuil, fiabilité ≥ seuil) → celle au meilleur EV × fiabilité ;
   * 2. sinon l'issue la plus probable parmi 1, N, 2, BTTS Oui, BTTS Non (pronostic sans mise).
   * odds = {"1N2|1": c, "1N2|N": c, "1N2|2": c, "BTTS|Oui": c, "BTTS|Non": c} (facultatif)
   */
  function preferredPick(mk, rel, odds, s, labels) {
    const L = labels || { h: "1", a: "2" };
    const cands = [
      { market: "1N2", sel: "1", label: `1 · ${L.h}`, p: mk.p1 }, { market: "1N2", sel: "N", label: "N · match nul", p: mk.pN },
      { market: "1N2", sel: "2", label: `2 · ${L.a}`, p: mk.p2 }, { market: "BTTS", sel: "Oui", label: "Les deux équipes marquent", p: mk.bttsYes },
      { market: "BTTS", sel: "Non", label: "Au moins une équipe ne marque pas", p: 1 - mk.bttsYes },
    ];
    for (const c of cands) {
      const o = odds ? odds[c.market + "|" + c.sel] : null;
      c.odds = isNum(o) && o > 1 ? o : null;
      c.ev = c.odds ? c.p * c.odds - 1 : null;
      c.fair = 1 / c.p; c.minOdds = (1 + ((s && s.evMin) || 0.03)) / c.p;
    }
    const evMin = (s && s.evMin) || 0.03, relMin = (s && s.relMin) || 55;
    const vals = cands.filter((c) => c.ev !== null && c.ev >= evMin && rel >= relMin && c.odds < ((s && s.maxOdds) || 1000));
    if (vals.length) {
      const best = vals.sort((a, b) => b.ev - a.ev)[0];
      return Object.assign({ kind: "value", why: `Value bet : EV ${(100 * best.ev).toFixed(1)} % à la cote ${best.odds.toFixed(2)} (cote juste ${best.fair.toFixed(2)})` }, best);
    }
    const best = cands.slice().sort((a, b) => b.p - a.p)[0];
    const why = best.odds ? `Issue la plus probable (${(100 * best.p).toFixed(1)} %) ; cote ${best.odds.toFixed(2)} sous la cote minimale ${best.minOdds.toFixed(2)} : pas de mise`
      : `Issue la plus probable (${(100 * best.p).toFixed(1)} %) ; à jouer seulement à une cote ≥ ${best.minOdds.toFixed(2)}`;
    return Object.assign({ kind: "proba", why }, best);
  }
  FQ.preferredPick = preferredPick;

  /**
   * Probabilités du marché sans marge.
   * - "norm" : normalisation proportionnelle (la marge est retirée à parts égales) ;
   * - "power" : méthode de la puissance, p_i = (1/c_i)^k avec Σ p_i = 1. Elle retire davantage de marge sur les outsiders
   *   que sur les favoris, ce qui corrige le biais favori-outsider (les bookmakers margent plus les grosses cotes).
   * La méthode retenue est choisie sur l'historique (log loss), voir FQ.T.run.
   */
  function devigPower(odds3) {
    const inv = odds3.map((c) => 1 / c);
    let lo = 0.5, hi = 2;
    for (let it = 0; it < 60; it++) { const k = (lo + hi) / 2; const s = sum(inv.map((x) => Math.pow(x, k))); if (s > 1) lo = k; else hi = k; }
    const k = (lo + hi) / 2; const p = inv.map((x) => Math.pow(x, k)); const sm = sum(p);
    return p.map((x) => x / sm);
  }
  FQ.devigPower = devigPower;
  function marketProbs(odds3, method) {
    if (!odds3 || !odds3.every((c) => isNum(c) && c > 1)) return null;
    if (method === "power") return devigPower(odds3);
    const inv = odds3.map((c) => 1 / c); const sm = sum(inv);
    return inv.map((x) => x / sm);
  }
  FQ.marketProbs = marketProbs;
  /** Mélange modèle / marché : p = w·p_modèle + (1 − w)·p_marché (w et méthode appris sur l'historique) */
  function blend(p3, odds3, w, method) {
    const pm = marketProbs(odds3, method);
    if (!pm || !isNum(w) || w >= 1) return { p3, used: false };
    const p = p3.map((x, i) => w * x + (1 - w) * pm[i]);
    const sm = sum(p);
    return { p3: p.map((x) => x / sm), used: true, market: pm, w, method: method || "norm" };
  }
  FQ.blend = blend;

  /** Issues mutuellement exclusives (1N2, BTTS) : une seule VALUE BET par marché et par match (la mieux classée). */
  function exclusiveMarkets(rows) {
    const best = {};
    rows.forEach((r) => {
      if (r.decision !== "VALUE BET" || (r.market !== "1N2" && r.market !== "BTTS")) return;
      const k = r.matchId + "|" + r.market;
      if (!best[k] || r.score > best[k].score) best[k] = r;
    });
    rows.forEach((r) => {
      const k = r.matchId + "|" + r.market;
      if (r.decision === "VALUE BET" && best[k] && best[k] !== r) {
        r.decision = "NO BET"; r.stake = 0; r.reasons = (r.reasons || []).concat(["Issue concurrente du même marché mieux classée"]);
      }
    });
    return rows;
  }
  FQ.exclusiveMarkets = exclusiveMarkets;
  FQ.riskScore = (ev, rel) => (isNum(ev) ? ev * (rel / 100) : -Infinity);

  /* ------------------------------------------------------------ comptabilité */
  function accounting(bets, initial) {
    let realized = 0, open = 0, staked = 0, won = 0, lost = 0, voided = 0, nv = 0, resolvedStake = 0;
    const ordered = bets.slice().sort((a, b) => ((a.settledAt || a.createdAt) < (b.settledAt || b.createdAt) ? -1 : 1));
    let eq = initial, peak = initial, maxDD = 0;
    const curve = [{ t: null, bankroll: initial }];
    for (const b of ordered) {
      staked += b.stake;
      if (b.status === "EN ATTENTE" || b.status === "NON VÉRIFIABLE") { open += b.stake; if (b.status === "NON VÉRIFIABLE") nv++; continue; }
      if (b.status === "ANNULÉ") { voided++; continue; }
      realized += b.profit; resolvedStake += b.stake;
      if (b.status === "GAGNÉ") won++; else if (b.status === "PERDU") lost++;
      eq = initial + realized; peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, peak > 0 ? (peak - eq) / peak : 0);
      curve.push({ t: b.settledAt, bankroll: r4(eq), id: b.id });
    }
    const bankroll = initial + realized;
    return {
      initial, realized, openStakes: open, cash: bankroll - open, bankroll, staked, resolvedStake,
      won, lost, voided, unverifiable: nv, pending: bets.filter((b) => b.status === "EN ATTENTE").length,
      hitRate: won + lost ? won / (won + lost) : null,
      roi: resolvedStake ? realized / resolvedStake : null,
      maxDrawdown: maxDD, curve,
    };
  }
  FQ.accounting = accounting;

  /* ------------------------------------------------------------ règlement */
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  FQ.normName = norm;
  function sameName(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const lx = x.split(" ").pop(), ly = y.split(" ").pop();
    return lx === ly && (x.includes(y) || y.includes(x) || x[0] === y[0]);
  }
  FQ.sameName = sameName;

  /**
   * result = { hg, ag, status: "TERMINÉ"|"REPORTÉ"|"ANNULÉ", scorers:[{name, side, og}], assisters:[name], assistsKnown, played: {name: true|false} }
   */
  function settleBet(bet, result) {
    if (result.status === "REPORTÉ" || result.status === "ANNULÉ") return { status: "ANNULÉ", profit: 0, note: "Match " + result.status.toLowerCase() };
    const { hg, ag } = result;
    if (!isNum(hg) || !isNum(ag)) return { status: "NON VÉRIFIABLE", profit: 0, note: "Score manquant" };
    let win = null, note = "";
    if (bet.market === "1N2") {
      const out = hg > ag ? "1" : hg === ag ? "N" : "2";
      win = bet.selection === out;
    } else if (bet.market === "BTTS") {
      const yes = hg > 0 && ag > 0;
      win = bet.selection === "Oui" ? yes : !yes;
    } else if (bet.market === "Buteur" || bet.market === "Joueur Décisif") {
      const pname = bet.playerName;
      const played = result.played ? result.played[pname] : undefined;
      if (played === false) return { status: "ANNULÉ", profit: 0, note: "Joueur non participant → remboursé" };
      const scored = (result.scorers || []).some((g) => !g.og && sameName(g.name, pname));
      if (bet.market === "Buteur") {
        if (scored) win = true;
        else if (played === true) win = false;
        else return { status: "NON VÉRIFIABLE", profit: 0, note: "Participation du joueur non confirmée" };
      } else {
        const assisted = (result.assisters || []).some((n) => sameName(n, pname));
        if (scored || assisted) win = true;
        else if (!result.assistsKnown) return { status: "NON VÉRIFIABLE", profit: 0, note: "Passes décisives officielles non renseignées" };
        else if (played === true) win = false;
        else return { status: "NON VÉRIFIABLE", profit: 0, note: "Participation du joueur non confirmée" };
      }
    }
    if (win === null) return { status: "NON VÉRIFIABLE", profit: 0, note: "Marché inconnu" };
    return win ? { status: "GAGNÉ", profit: r4(bet.stake * (bet.odds - 1)), note } : { status: "PERDU", profit: -bet.stake, note };
  }
  FQ.settleBet = settleBet;

  /** Issue binaire / ternaire d'une prédiction (pour le Brier), null si non vérifiable */
  function outcomeOf(market, selection, result, playerName) {
    if (!result || !isNum(result.hg)) return null;
    const { hg, ag } = result;
    if (market === "1N2") return hg > ag ? 0 : hg === ag ? 1 : 2;
    if (market === "BTTS") return hg > 0 && ag > 0 ? 1 : 0;
    const played = result.played ? result.played[playerName] : undefined;
    const scored = (result.scorers || []).some((g) => !g.og && sameName(g.name, playerName));
    if (market === "Buteur") return scored ? 1 : played === true ? 0 : null;
    if (market === "Joueur Décisif") {
      const as = (result.assisters || []).some((n) => sameName(n, playerName));
      if (scored || as) return 1;
      return result.assistsKnown && played === true ? 0 : null;
    }
    return null;
  }
  FQ.outcomeOf = outcomeOf;

  /* ------------------------------------------------------------ calendrier */
  function teamContext(matches, comp, team, beforeDate, today) {
    const past = matches.filter((m) => m.comp === comp && (m.home === team || m.away === team) && m.date < beforeDate);
    const played = past.filter((m) => m.hg !== null);
    const last5 = played.slice(-5).map((m) => {
      const home = m.home === team;
      const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg;
      return { id: m.id, date: m.date, opp: home ? m.away : m.home, home, gf, ga, r: gf > ga ? "V" : gf === ga ? "N" : "D" };
    });
    const missing = past.filter((m) => m.hg === null && m.date < today && (m.status === "RÉSULTAT MANQUANT" || m.status === "PROGRAMMÉ")).length;
    const lastAny = past.length ? past[past.length - 1].date : null;
    const restDays = lastAny ? daysBetween(lastAny, beforeDate) : null;
    const season = played.length ? played[played.length - 1].season : null;
    const cur = played.filter((m) => m.season === season);
    let gf = 0, ga = 0, hgf = 0, hga = 0, hn = 0, agf = 0, aga = 0, an = 0;
    cur.forEach((m) => {
      const h = m.home === team; const f = h ? m.hg : m.ag, a = h ? m.ag : m.hg;
      gf += f; ga += a;
      if (h) { hgf += f; hga += a; hn++; } else { agf += f; aga += a; an++; }
    });
    return { last5, missing, restDays, season, played: cur.length, gf, ga, home: { n: hn, gf: hgf, ga: hga }, away: { n: an, gf: agf, ga: aga } };
  }
  FQ.teamContext = teamContext;

  function standings(matches, comp, season, beforeDate) {
    const T = {};
    const e = (t) => T[t] || (T[t] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    matches.forEach((m) => {
      if (m.comp !== comp || m.season !== season) return;
      e(m.home); e(m.away);
      if (m.hg === null || (beforeDate && m.date >= beforeDate)) return;
      const H = e(m.home), A = e(m.away);
      H.p++; A.p++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
      if (m.hg > m.ag) { H.w++; A.l++; H.pts += 3; } else if (m.hg < m.ag) { A.w++; H.l++; A.pts += 3; } else { H.d++; A.d++; H.pts++; A.pts++; }
    });
    return Object.values(T).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team));
  }
  FQ.standings = standings;

  /* ------------------------------------------------------------ backtest */
  /**
   * Walk-forward : pour chaque date de la saison testée, ajuste le modèle sur les matchs strictement antérieurs,
   * prédit les rencontres du jour, puis compare au résultat. Aucune donnée future n'est utilisée.
   * odds (optionnel) : {matchId: {h,d,a, ch,cd,ca}} pour ROI / CLV.
   */
  function walkForward(matches, comp, season, opts) {
    const o = Object.assign({ minTeamGames: 3, settings: DEFAULT_SETTINGS, odds: null, fit: {} }, opts || {});
    const test = matches.filter((m) => m.comp === comp && m.season === season && m.hg !== null);
    const dates = [...new Set(test.map((m) => m.date))].sort();
    const preds = [];
    let skipped = 0;
    // simulation bankroll (si cotes)
    const s = o.settings;
    let bank = s.initialBankroll, peak = bank, maxDD = 0, staked = 0, profit = 0, nb = 0, wins = 0, losses = 0;
    const clv = [];
    const curve = [];
    for (const d of dates) {
      const model = fitModel(matches, comp, d, o.fit);
      const day = test.filter((m) => m.date === d);
      // fréquences d'entraînement (référence naïve)
      const tr = matches.filter((m) => m.comp === comp && m.hg !== null && m.date < d && daysBetween(m.date, d) <= 730);
      const nH = tr.filter((m) => m.hg > m.ag).length, nD = tr.filter((m) => m.hg === m.ag).length;
      const nBt = tr.filter((m) => m.hg > 0 && m.ag > 0).length;
      const base3 = tr.length ? [(nH + 1) / (tr.length + 3), (nD + 1) / (tr.length + 3), (tr.length - nH - nD + 1) / (tr.length + 3)] : [1 / 3, 1 / 3, 1 / 3];
      const baseB = tr.length ? (nBt + 1) / (tr.length + 2) : 0.5;
      const dayBets = [];
      for (const m of day) {
        if (!model.ok || !model.teams[m.home] || !model.teams[m.away] ||
          model.teams[m.home].games < o.minTeamGames || model.teams[m.away].games < o.minTeamGames) { skipped++; continue; }
        const pr = predictMatch(model, m, {});
        if (!pr.ok) { skipped++; continue; }
        const k = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
        const p3 = [pr.markets.p1, pr.markets.pN, pr.markets.p2];
        const bt = m.hg > 0 && m.ag > 0 ? 1 : 0;
        const rel = reliability(model, m, {}).score;
        const row = { id: m.id, date: d, home: m.home, away: m.away, p3, k, pB: pr.markets.bttsYes, bt, base3, baseB, rel, lh: pr.lambdaHome, la: pr.lambdaAway };
        preds.push(row);
        if (o.odds && o.odds[m.id]) {
          const od = o.odds[m.id];
          const opts3 = [od.h, od.d, od.a];
          let best = null;
          opts3.forEach((c, i) => {
            const ev = expectedValue(p3[i], c);
            if (ev !== null && ev >= s.evMin && rel >= s.relMin && (!best || ev > best.ev)) best = { i, c, ev, p: p3[i] };
          });
          if (best) dayBets.push({ m, best, k, close: [od.ch, od.cd, od.ca][best.i] });
        }
      }
      // règlement du jour (mises calculées sur la bankroll d'ouverture du jour, plafonds appliqués)
      let open = 0;
      for (const b of dayBets) {
        const acct = { bankroll: bank, cash: bank - open, openStakes: open };
        const st = computeStake(b.best.p, b.best.c, s, acct, 0).stake;
        if (st <= 0) continue;
        open += st; staked += st; nb++;
        const won = b.k === b.best.i;
        const pl = won ? st * (b.best.c - 1) : -st;
        profit += pl; if (won) wins++; else losses++;
        b.pl = pl; b.stake = st;
        if (isNum(b.close) && b.close > 1) clv.push(b.best.c / b.close - 1);
      }
      bank = s.initialBankroll + profit;
      peak = Math.max(peak, bank); maxDD = Math.max(maxDD, (peak - bank) / peak);
      curve.push({ date: d, bankroll: r4(bank) });
    }
    const n = preds.length;
    const agg = (f) => (n ? sum(preds.map(f)) / n : null);
    const res = {
      comp, season, n, skipped, dates: dates.length,
      brier: agg((r) => brier3(r.p3, r.k)), brierBase: agg((r) => brier3(r.base3, r.k)), brierUniform: agg((r) => brier3([1 / 3, 1 / 3, 1 / 3], r.k)),
      logLoss: agg((r) => logLoss3(r.p3, r.k)), logLossBase: agg((r) => logLoss3(r.base3, r.k)),
      accuracy: agg((r) => (r.p3.indexOf(Math.max(...r.p3)) === r.k ? 1 : 0)),
      brierBTTS: agg((r) => brierBinary(r.pB, r.bt)), brierBTTSBase: agg((r) => brierBinary(r.baseB, r.bt)),
      calibHome: calibrationBins(preds.map((r) => [r.p3[0], r.k === 0 ? 1 : 0]), 10),
      calibBTTS: calibrationBins(preds.map((r) => [r.pB, r.bt]), 10),
      preds,
      betting: o.odds ? { bets: nb, staked, profit, roi: staked ? profit / staked : null, hitRate: wins + losses ? wins / (wins + losses) : null, maxDrawdown: maxDD, clv: clv.length ? sum(clv) / clv.length : null, clvN: clv.length, curve } : null,
    };
    // intervalle d'incertitude (bootstrap simple, 200 tirages) sur l'écart de Brier modèle − référence
    if (n >= 30) {
      const diffs = preds.map((r) => brier3(r.p3, r.k) - brier3(r.base3, r.k));
      let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const bs = [];
      for (let b = 0; b < 200; b++) { let s2 = 0; for (let i = 0; i < n; i++) s2 += diffs[Math.floor(rnd() * n)]; bs.push(s2 / n); }
      bs.sort((a, b) => a - b);
      res.brierDiffCI = [bs[5], bs[194]];
    }
    return res;
  }
  FQ.walkForward = walkForward;

  /* ------------------------------------------------------- import CSV */
  function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
    const split = (l) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === sep && !q) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur); return out.map((x) => x.trim());
    };
    const head = split(lines[0]);
    return lines.slice(1).map((l) => { const v = split(l); const o = {}; head.forEach((h, i) => (o[h] = v[i])); return o; });
  }
  FQ.parseCSV = parseCSV;
  function parseFDDate(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s || "");
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`; }
    if (/^\d{4}-\d{2}-\d{2}/.test(s || "")) return s.slice(0, 10);
    return null;
  }
  /** Fichier au format football-data.co.uk → matchs + cotes (pré-match B365/Avg/PS, clôture B365C/AvgC/PSC) */
  function importFootballDataCSV(text, compCode, seasonLabel) {
    const rows = parseCSV(text);
    const matches = [], odds = {}, errors = [];
    const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : null; };
    rows.forEach((r, i) => {
      const date = parseFDDate(r.Date);
      const home = r.HomeTeam || r.Home, away = r.AwayTeam || r.Away;
      const hg = num(r.FTHG ?? r.HG), ag = num(r.FTAG ?? r.AG);
      if (!date || !home || !away) { errors.push(`ligne ${i + 2} ignorée (date/équipes)`); return; }
      const id = `${compCode}-${date}-${norm(home).slice(0, 14).replace(/ /g, "-")}-${norm(away).slice(0, 14).replace(/ /g, "-")}`;
      matches.push({ id, comp: compCode, season: seasonLabel, date, time: r.Time || "", tz: "Europe/London", home, away, hg, ag, goals: null, status: hg === null ? "PROGRAMMÉ" : "TERMINÉ", source: "import CSV", neutral: false });
      const pick = (...ks) => { for (const k of ks) { const v = num(r[k]); if (v && v > 1) return v; } return null; };
      const o = { h: pick("B365H", "AvgH", "PSH", "MaxH"), d: pick("B365D", "AvgD", "PSD", "MaxD"), a: pick("B365A", "AvgA", "PSA", "MaxA"),
        ch: pick("B365CH", "PSCH", "AvgCH"), cd: pick("B365CD", "PSCD", "AvgCD"), ca: pick("B365CA", "PSCA", "AvgCA") };
      if (o.h && o.d && o.a) odds[id] = o;
    });
    return { matches, odds, errors, nOdds: Object.keys(odds).length };
  }
  FQ.importFootballDataCSV = importFootballDataCSV;

  /* ---------------------------------------------- export CSV générique */
  function toCSV(rows, cols) {
    const esc = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[";\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.map((c) => esc(c.label)).join(";"), ...rows.map((r) => cols.map((c) => esc(typeof c.get === "function" ? c.get(r) : r[c.key])).join(";"))].join("\n");
  }
  FQ.toCSV = toCSV;
})(typeof window !== "undefined" ? window : globalThis);
