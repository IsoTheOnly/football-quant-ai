/* =========================================================================
   FOOTBALL QUANT AI — ETL v2 (Node + navigateur)
   Sources :
   - ESPN (site.api.espn.com) : calendriers, résultats, buteurs, 12 compétitions
   - football-data.co.uk : cotes d'avant-match et de clôture, xG, Suisse (résultats)
   - ESPN région GB : cotes Bet 365 des rencontres à venir
   - openfootball (CC0) : calendrier suisse 2026-27 (absent d'ESPN)
   Le « magasin brut » (raw) est fusionné à chaque mise à jour, puis le jeu de
   données est reconstruit de façon déterministe par build(raw).
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ || (root.FQ = {});
  const E = (FQ.ETL = {});

  E.COMPS = [
    ["PL", "Premier League", "Angleterre", "Europe/London", "eng.1", "E0"],
    ["PD", "La Liga", "Espagne", "Europe/Madrid", "esp.1", "SP1"],
    ["FL1", "Ligue 1", "France", "Europe/Paris", "fra.1", "F1"],
    ["SA", "Serie A", "Italie", "Europe/Rome", "ita.1", "I1"],
    ["BL1", "Bundesliga", "Allemagne", "Europe/Berlin", "ger.1", "D1"],
    ["CL", "UEFA Champions League", "Europe", "Europe/Paris", "uefa.champions", null],
    ["WC", "Coupe du Monde FIFA", "International", "UTC", "fifa.world", null],
    ["J1", "J1 League", "Japon", "Asia/Tokyo", "jpn.1", "JPN"],
    ["DED", "Eredivisie", "Pays-Bas", "Europe/Amsterdam", "ned.1", "N1"],
    ["BSA", "Brasileirão Série A", "Brésil", "America/Sao_Paulo", "bra.1", "BRA"],
    ["ELC", "EFL Championship", "Angleterre", "Europe/London", "eng.2", "E1"],
    ["SSL", "Swiss Super League", "Suisse", "Europe/Zurich", null, "SWZ"],
    ["SPL", "Saudi Pro League", "Arabie saoudite", "Asia/Riyadh", "ksa.1", null],
  ];
  E.ESPN_LEAGUES = Object.fromEntries(E.COMPS.filter((c) => c[4]).map((c) => [c[0], c[4]]));
  E.FD_FILES = { E0: "PL", E1: "ELC", SP1: "PD", I1: "SA", D1: "BL1", F1: "FL1", N1: "DED", BRA: "BSA", JPN: "J1", SWZ: "SSL" };

  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(fc|cf|afc|sc|ac|as|ss|ssc|us|sv|vfb|vfl|tsg|bv|rc|ca|ec|se|cr|club|de|da|do|of|the|calcio|football|futebol|1\.)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  E.norm = norm;
  function sim(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return 0.85;
    const A = new Set(x.split(" ")), B = new Set(y.split(" "));
    let inter = 0; A.forEach((t) => { if (B.has(t)) inter++; else for (const u of B) if (t.length >= 4 && u.length >= 4 && (t.startsWith(u.slice(0, 4)) || u.startsWith(t.slice(0, 4)))) { inter += 0.6; break; } });
    return inter / Math.max(A.size, B.size);
  }
  E.sim = sim;

  /* ------------------------------------------------------------ parsing */
  function parseCSV(text) {
    const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const head = lines[0].split(",");
    return lines.slice(1).map((l) => { const v = l.split(","); const o = {}; head.forEach((h, i) => (o[h] = v[i])); return o; });
  }
  const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) && v > 0 ? v : null; };
  const fdDate = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s || ""); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`; };
  /** heure « Royaume-Uni » de football-data → décalage UTC explicite */
  function ukTime(date, hhmm) {
    if (!hhmm) return "";
    try {
      const t = Date.parse(date + "T12:00:00Z");
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).formatToParts(new Date(t));
      const off = (+p.find((x) => x.type === "hour").value) - 12;
      return `${hhmm} UTC+${off}`;
    } catch (e) { return hhmm + " UTC+0"; }
  }
  E.ukTime = ukTime;
  const tri = (r, ...pref) => { for (const p of pref) { const h = num(r[p + "H"]), d = num(r[p + "D"]), a = num(r[p + "A"]); if (h && d && a) return [h, d, a, p]; } return null; };

  /** Compacte un fichier football-data en lignes [div, date, time, home, away, hg, ag, pre, close, xg, season] */
  function compactFD(fileKey, text) {
    const rows = parseCSV(text);
    const out = [];
    const isNew = /^new\//.test(fileKey) || /new_league/.test(fileKey);
    for (const r of rows) {
      const div = isNew ? ({ Brazil: "BRA", Japan: "JPN", Switzerland: "SWZ" })[r.Country] : r.Div;
      if (!div || !E.FD_FILES[div]) continue;
      const date = fdDate(r.Date); if (!date) continue;
      const home = r.HomeTeam || r.Home, away = r.AwayTeam || r.Away;
      const hg = r.FTHG !== undefined ? r.FTHG : r.HG, ag = r.FTAG !== undefined ? r.FTAG : r.AG;
      const pre = tri(r, "B365", "Avg", "PS", "Max");
      const close = tri(r, "B365C", "AvgC", "PSC", "MaxC");
      // référence de clôture pour la mesure CLV : Pinnacle (marché le plus efficient), sinon moyenne du marché
      const closeRef = tri(r, "PSC", "AvgC");
      // plus/moins de 2,5 buts d'avant-match (Bet 365, sinon moyenne du marché)
      const ou = (() => { for (const k of ["B365", "Avg", "P"]) { const o = num(r[k + ">2.5"]), u = num(r[k + "<2.5"]); if (o && u) return [o, u, k]; } return null; })();
      const xg = num(r.HxG) !== null || r.HxG === "0" ? [parseFloat(r.HxG), parseFloat(r.AxG)] : null;
      // tirs cadrés (domicile, extérieur) : driver des forces d'équipe, publié par football-data pour les championnats européens
      const sot = /^\d+$/.test(r.HST || "") && /^\d+$/.test(r.AST || "") ? [+r.HST, +r.AST] : null;
      out.push([div, date, r.Time || "", home, away, hg === "" || hg === undefined ? null : +hg, ag === "" || ag === undefined ? null : +ag, pre, close, xg, r.Season || null, closeRef, ou, sot]);
    }
    return out;
  }
  E.compactFD = compactFD;

  /* ------------------------------------------------------------ magasin brut */
  E.emptyRaw = () => ({ v: 2, espn: {}, fd: {}, oddsEspn: {}, oddsFr: {}, ofssl: [], feeds: {} });
  /** Fusionne de nouvelles lignes ESPN (format [id, isoDate, home, away, hs, as, st, neutral, slug, goals, hid, aid, odds, note]) */
  E.mergeEspn = function (raw, comp, rows, fetchedAt) {
    const st = (raw.espn[comp] = raw.espn[comp] || {});
    let added = 0, changed = 0;
    for (const r of rows) {
      const prev = st[r[0]];
      if (!prev) added++; else if (JSON.stringify(prev) !== JSON.stringify(r)) changed++;
      st[r[0]] = r;
    }
    raw.feeds.espn = { fetchedAt: fetchedAt || new Date().toISOString(), source: "ESPN site API" };
    return { added, changed };
  };
  E.mergeFD = function (raw, files, fetchedAt) {
    for (const [k, txt] of Object.entries(files)) {
      const rows = compactFD(k, txt);
      if (/fixtures/.test(k)) { raw.fd["fixtures:" + k] = rows; continue; }
      raw.fd[k] = rows;
    }
    raw.feeds.fd = { fetchedAt: fetchedAt || new Date().toISOString(), source: "football-data.co.uk" };
  };
  E.mergeOddsEspn = function (raw, odds, fetchedAt) {
    for (const [id, o] of Object.entries(odds)) raw.oddsEspn[id] = o;
    // purge des cotes de plus de 400 jours
    const lim = new Date(Date.now() - 400 * 864e5).toISOString(); // conservées : cotes d'avant-match des matchs joués (évaluation, entraînement)
    for (const [id, o] of Object.entries(raw.oddsEspn)) if (o[1] < lim) delete raw.oddsEspn[id];
    raw.feeds.oddsEspn = { fetchedAt: fetchedAt || new Date().toISOString(), source: "ESPN, cotes Bet 365 (région GB)" };
  };

  /* ------------------------------------------------------------ construction */
  const seasonFromDate = (d) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 7 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`; };
  const STAGE_FR = {
    "league-phase": "Phase de ligue", "knockout-round-playoffs": "Barrages (élimination)", "round-of-16": "Huitièmes de finale", quarterfinals: "Quarts de finale",
    semifinals: "Demi-finales", final: "Finale", "group-stage": "Phase de groupes", "round-of-32": "Seizièmes de finale", "3rd-place-match": "Match pour la 3e place",
    "promotion-semifinals": "Barrages de promotion : demi-finales", "promotion-final": "Barrages de promotion : finale", championship: "Play-off du championnat",
    "placement-playoffs": "Play-offs de classement", "second-phase": "Deuxième phase", "regular-season": "Saison régulière",
  };
  function seasonAndRound(comp, slug, date) {
    let m;
    if ((m = /^(\d{4})-(\d{2})-/.exec(slug))) return [`${m[1]}-${m[2]}`, "Saison régulière", 1];
    if (comp === "J1" && /^2026-j1-100/.test(slug)) return ["2026 (saison spéciale)", "Saison régulière", 1];
    if (comp === "J1" && (slug === "championship" || slug === "placement-playoffs")) return ["2026 (saison spéciale)", STAGE_FR[slug], 0];
    if (comp === "J1" && slug === "regular-season") return [seasonFromDate(date), "Saison régulière", 1];
    if ((m = /^(\d{4})-/.exec(slug))) return [m[1], "Saison régulière", 1];
    if (comp === "WC") return ["2026", STAGE_FR[slug] || slug, slug === "group-stage" ? 1 : 0];
    const reg = slug === "regular-season" || slug === "league-phase";
    const stage = STAGE_FR[slug] || (/conference|europa/.test(slug) ? "Barrages européens" + (/final$/.test(slug) ? " : finale" : " : demi-finales") : slug);
    return [seasonFromDate(date), stage, reg ? 1 : 0];
  }
  E.seasonAndRound = seasonAndRound;
  const baseMin = (clock) => { const m = /^(\d+)/.exec(clock || ""); return m ? +m[1] : 0; };
  const cleanClock = (c) => (c || "").replace(/'/g, "");

  function buildEspnMatch(comp, r) {
    const [id, iso, home, away, hs, as, st, neutral, slug, goals, hid, aid, odds, note] = r;
    const date = iso.slice(0, 10), time = iso.slice(11, 16) + " UTC+0";
    const [season, round0, reg] = seasonAndRound(comp, slug || "", iso);
    const round = note && !/leg/i.test(note) ? `${round0} · ${note}` : note ? `${round0} (${note.replace(/1st Leg/i, "aller").replace(/2nd Leg/i, "retour")})` : round0;
    let hg = hs, ag = as, g = goals, ex = { eid: id, st, reg };
    if (st === "E" || st === "K") {
      const regGoals = (goals || []).filter((x) => baseMin(x[2]) <= 90);
      hg = regGoals.filter((x) => x[0] === 0).length; ag = regGoals.filter((x) => x[0] === 1).length;
      ex.ft = [hs, as]; ex.aet = st === "E" ? "prolongation" : "tirs au but"; g = regGoals;
      if ((goals || []).length === 0) { hg = null; ag = null; ex.note = "score à 90 min inconnu"; }
    }
    if (g) g = g.map((x) => [x[0], x[1], cleanClock(x[2]), x[3]]);
    if (neutral) ex.neutral = 1;
    if (st === "P") ex.status = "REPORTÉ"; else if (st === "C") ex.status = "ANNULÉ"; else if (st === "A") ex.status = "INTERROMPU"; else if (st === "L") ex.status = "EN COURS";
    const finished = "FEKX".includes(st);
    return { season, row: ["E" + id, date, time, round, home, away, finished ? hg : null, finished ? ag : null, finished ? g || null : null, ex], hid, aid };
  }

  /** Cote de clôture de référence (CLV) : Pinnacle, sinon moyenne du marché, sinon la clôture disponible */
  const CLOSE_NAMES = { PSC: "Pinnacle", AvgC: "moyenne du marché", B365C: "Bet 365", MaxC: "meilleure cote du marché" };
  function closeRefOf(r) {
    const t = r[11] || r[8];
    if (!t) return null;
    return { h: t[0], d: t[1], a: t[2], src: `${CLOSE_NAMES[t[3]] || t[3]} à la clôture (football-data.co.uk)`, ref: t[3], final: 1 };
  }
  E.closeRefOf = closeRefOf;

  /** Association football-data ↔ ESPN : même compétition, date ±1 jour, même score, noms les plus proches. */
  function joinFD(matchesByComp, fdRows) {
    const alias = {}; // comp|fdName -> espnName
    const byComp = {};
    for (const r of fdRows) { const comp = E.FD_FILES[r[0]]; (byComp[comp] = byComp[comp] || []).push(r); }
    let joined = 0, unjoined = 0;
    for (const [comp, rows] of Object.entries(byComp)) {
      const ms = matchesByComp[comp] || [];
      const idx = {};
      ms.forEach((m) => { (idx[m.row[1]] = idx[m.row[1]] || []).push(m); });
      const near = (d) => { const t = Date.parse(d + "T12:00:00Z"); return [-1, 0, 1].flatMap((k) => idx[new Date(t + k * 864e5).toISOString().slice(0, 10)] || []); };
      // passe 1 : apprendre les alias sur les correspondances certaines (score identique + similarité)
      const votes = {};
      for (const r of rows) {
        if (r[5] === null) continue;
        const cands = near(r[1]).filter((m) => m.row[6] === r[5] && m.row[7] === r[6]);
        let best = null, bs = 0;
        for (const m of cands) { const s = sim(r[3], m.row[4]) + sim(r[4], m.row[5]); if (s > bs) { bs = s; best = m; } }
        if (best && bs >= 0.9) { for (const [f, e] of [[r[3], best.row[4]], [r[4], best.row[5]]]) { const k = comp + "|" + f; votes[k] = votes[k] || {}; votes[k][e] = (votes[k][e] || 0) + 1; } }
      }
      for (const [k, v] of Object.entries(votes)) alias[k] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
      // passe 2 : jointure par alias
      for (const r of rows) {
        const h = alias[comp + "|" + r[3]], a = alias[comp + "|" + r[4]];
        const m = h && a ? near(r[1]).find((x) => x.row[4] === h && x.row[5] === a) : null;
        if (!m) { unjoined++; continue; }
        const ex = m.row[9];
        if (r[7]) ex.odds = { h: r[7][0], d: r[7][1], a: r[7][2], src: `football-data.co.uk (${r[7][3] === "B365" ? "Bet 365" : r[7][3] === "Avg" ? "moyenne du marché" : r[7][3]}, avant-match)` };
        if (r[8]) ex.close = { h: r[8][0], d: r[8][1], a: r[8][2], src: `football-data.co.uk (${r[8][3].replace(/C$/, "")} clôture)` };
        const cr = closeRefOf(r); if (cr) ex.closeRef = cr;
        if (r[12]) ex.ou25 = { o: r[12][0], u: r[12][1], src: `football-data.co.uk (${r[12][2] === "B365" ? "Bet 365" : r[12][2] === "Avg" ? "moyenne du marché" : "Pinnacle"}, avant-match)` };
        if (!ex.odds && r[8] && m.row[6] !== null) ex.oddsIsClose = 1;
        if (r[9] && Number.isFinite(r[9][0])) ex.xg = r[9];
        if (r[13]) ex.sot = r[13];
        joined++;
      }
    }
    return { alias, joined, unjoined };
  }

  /** Suisse : résultats football-data + calendrier openfootball 2026-27 */
  function buildSwiss(raw, aliasOut) {
    const fdRows = Object.entries(raw.fd).filter(([k]) => /SWZ/.test(k)).flatMap(([, v]) => v).filter((r) => r[0] === "SWZ");
    const seen = new Set(); const out = [];
    const seasonOf = (s, d) => (s ? s.replace("/", "-").replace(/^(\d{4})-(\d{2})(\d{2})$/, "$1-$3") : seasonFromDate(d));
    const fdTeams = [...new Set(fdRows.flatMap((r) => [r[3], r[4]]))];
    const mapName = (n) => { let best = n, bs = 0; for (const t of fdTeams) { const s = sim(n, t); if (s > bs) { bs = s; best = t; } } return bs >= 0.5 ? best : n; };
    for (const r of fdRows) {
      const k = r[1] + r[3] + r[4]; if (seen.has(k)) continue; seen.add(k);
      const season = seasonOf(r[10], r[1]);
      const ex = { src: "football-data.co.uk", reg: 1 };
      if (r[7]) ex.odds = { h: r[7][0], d: r[7][1], a: r[7][2], src: "football-data.co.uk (avant-match)" };
      if (r[8]) ex.close = { h: r[8][0], d: r[8][1], a: r[8][2], src: `football-data.co.uk (${r[8][3].replace(/C$/, "")} clôture)` };
      const cr = closeRefOf(r); if (cr) ex.closeRef = cr;
      if (!ex.odds && r[8] && r[5] !== null) ex.oddsIsClose = 1;
      out.push({ season, row: [`SSL-${r[1]}-${norm(r[3]).replace(/ /g, "")}-${norm(r[4]).replace(/ /g, "")}`, r[1], ukTime(r[1], r[2]), "Saison régulière", r[3], r[4], r[5], r[6], null, ex] });
    }
    // calendrier openfootball (rencontres à venir non présentes dans football-data)
    for (const f of raw.ofssl || []) {
      const h = mapName(f.home), a = mapName(f.away);
      aliasOut["SSL|" + f.home] = h; aliasOut["SSL|" + f.away] = a;
      const dup = out.find((m) => m.row[4] === h && m.row[5] === a && Math.abs(Date.parse(m.row[1]) - Date.parse(f.date)) <= 3 * 864e5);
      if (dup) { if (!dup.row[8] && f.goals && dup.row[6] === f.hg && dup.row[7] === f.ag) dup.row[8] = f.goals; continue; }
      out.push({ season: f.season, row: [`SSL-${f.date}-${norm(h).replace(/ /g, "")}-${norm(a).replace(/ /g, "")}`, f.date, f.time || "", f.round || "Saison régulière", h, a, f.hg, f.ag, f.goals || null, { src: "openfootball (calendrier)", reg: 1 }] });
    }
    return out;
  }

  E.build = function (raw, opts) {
    const o = opts || {};
    const now = o.now || new Date().toISOString();
    const matchesByComp = {};
    for (const [code] of E.COMPS) {
      if (code === "SSL") continue;
      matchesByComp[code] = Object.values(raw.espn[code] || {}).map((r) => buildEspnMatch(code, r));
    }
    const fdAll = Object.entries(raw.fd).filter(([k]) => !/^fixtures:/.test(k) && !/SWZ/.test(k)).flatMap(([, v]) => v);
    const fdFix = Object.entries(raw.fd).filter(([k]) => /^fixtures:/.test(k)).flatMap(([, v]) => v).filter((r) => r[0] !== "SWZ");
    const j = joinFD(matchesByComp, fdAll);
    // cotes des rencontres à venir : football-data fixtures puis ESPN (plus récent)
    let upcomingOdds = 0;
    for (const r of fdFix) {
      const comp = E.FD_FILES[r[0]]; const h = j.alias[comp + "|" + r[3]], a = j.alias[comp + "|" + r[4]];
      if (!h || !a || !r[7]) continue;
      const t = Date.parse(r[1] + "T12:00:00Z");
      const m = (matchesByComp[comp] || []).find((x) => x.row[4] === h && x.row[5] === a && Math.abs(Date.parse(x.row[1] + "T12:00:00Z") - t) <= 864e5);
      if (m && m.row[6] === null) { m.row[9].odds = { h: r[7][0], d: r[7][1], a: r[7][2], src: `football-data.co.uk (${r[7][3] === "B365" ? "Bet 365" : "moyenne"}, ${raw.feeds.fd ? raw.feeds.fd.fetchedAt.slice(0, 10) : ""})`, at: raw.feeds.fd && raw.feeds.fd.fetchedAt }; upcomingOdds++; }
    }
    for (const [eid, oe] of Object.entries(raw.oddsEspn || {})) {
      const comp = oe[0]; const m = (matchesByComp[comp] || []).find((x) => x.row[9].eid === eid);
      if (!m) continue;
      if (m.row[6] === null) { m.row[9].odds = { h: oe[4], d: oe[5], a: oe[6], src: `${oe[7]} via ESPN`, at: oe[8] }; upcomingOdds++; }
      else if (!m.row[9].odds && oe[8] && oe[8] < oe[1]) m.row[9].odds = { h: oe[4], d: oe[5], a: oe[6], src: `${oe[7]} via ESPN (avant-match)`, at: oe[8] };
    }
    const sslAlias = {};
    const ssl = buildSwiss(raw, sslAlias);
    const fr = E.joinOddsFr(raw, Object.assign({}, matchesByComp, { SSL: ssl }));
    E.joinInjuries(raw, Object.assign({}, matchesByComp, { SSL: ssl }));
    const competitions = E.COMPS.map(([code, name, country, tz]) => {
      const list = code === "SSL" ? ssl : matchesByComp[code] || [];
      const bySeason = {};
      list.forEach((m) => { (bySeason[m.season] = bySeason[m.season] || []).push(m.row); });
      const seasons = Object.keys(bySeason).sort((a, b) => (a.slice(0, 4) === b.slice(0, 4) ? (a < b ? 1 : -1) : a < b ? -1 : 1)).map((s) => {
        const rows = bySeason[s].sort((a, b) => (a[1] + a[2] < b[1] + b[2] ? -1 : 1));
        return { season: s, file: code === "SSL" ? "football-data.co.uk + openfootball" : `ESPN ${E.ESPN_LEAGUES[code]}`, repo: code === "SSL" ? "fd" : "espn",
          commitDate: code === "SSL" ? (raw.feeds.fd || {}).fetchedAt : (raw.feeds.espn || {}).fetchedAt,
          count: rows.length, played: rows.filter((r) => r[6] !== null).length, withScorers: rows.filter((r) => r[8] && r[8].length).length,
          withOdds: rows.filter((r) => r[9] && (r[9].odds || r[9].close)).length, matches: rows };
      });
      // ordre chronologique des saisons
      seasons.sort((a, b) => (a.matches[0][1] < b.matches[0][1] ? -1 : 1));
      return { code, name, country, tz, seasons };
    });
    const feeds = raw.feeds || {};
    const repos = {};
    for (const [k, f] of Object.entries(feeds)) repos[k] = { repo: f.source, commit: (f.fetchedAt || "").replace(/\D/g, "").slice(0, 12), commitDate: f.fetchedAt };
    return { generatedAt: now, version: 2, source: { name: "ESPN + football-data.co.uk + openfootball", license: "données publiques ; usage personnel", url: "", repos },
      competitions, aliases: Object.assign({}, j.alias, sslAlias), joinStats: { fdJoined: j.joined, fdUnjoined: j.unjoined, upcomingOdds, oddsFrJoined: fr.joined, oddsFrUnjoined: fr.unjoined } };
  };

  /* ------------------------------------------------------------ collecte web (ESPN, lignes JSON) */
  E.FETCH_PROMPT = 'Output ONLY JSON lines, one per event, no prose, copying values exactly from the data: {"id": event id, "date": event date, "slug": season slug, "status": status.type.name, "neutral": neutralSite, "home": home team displayName, "away": away team displayName, "hs": home score, "as": away score, "goals": [[home(0)/away(1), athlete displayName, clock displayValue, "og" if ownGoal / "p" if penaltyKick / ""] for details with scoringPlay true], "odds": [homeTeamOdds.value, drawOdds.value, awayTeamOdds.value, provider name] or null}';
  E.espnUrl = (lg, date) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${date.replace(/-/g, "")}&region=gb&lang=en`;
  const addD = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  /**
   * Plan de collecte : résultats manquants (5 derniers jours), cotes et horaires (3 prochains jours, toutes compétitions),
   * puis revérification du calendrier des 14 prochains jours par rotation. M = FQ.buildMatches(E.build(raw), today).
   */
  E.fetchPlan = function (raw, M, today, opts) {
    const o = Object.assign({ max: 36, calendar: true }, opts);
    const want = new Map();
    const add = (comp, date, why) => { const lg = E.ESPN_LEAGUES[comp]; if (!lg) return; const k = comp + date; if (!want.has(k)) want.set(k, { comp, league: lg, date, why, url: E.espnUrl(lg, date) }); };
    for (const m of M) if (m.eid && m.hg === null && m.date <= today && m.date >= addD(today, -5) && m.status !== "ANNULÉ") add(m.comp, m.date, "résultat");
    for (const m of M) if (m.eid && m.hg === null && m.date > today && m.date <= addD(today, 3)) add(m.comp, m.date, "cotes/horaires");
    const list = [...want.values()].sort((a, b) => (a.why === b.why ? (a.date < b.date ? -1 : 1) : a.why === "résultat" ? -1 : 1)).slice(0, o.max - 4);
    if (o.calendar) {
      const checks = (raw.feeds && raw.feeds.checks) || {};
      const ck = (x) => checks[x.comp + "|" + x.date] || "";
      const cal = new Map();
      for (const m of M) if (m.eid && m.hg === null && m.date > addD(today, 3) && m.date <= addD(today, 13)) cal.set(m.comp + m.date, { comp: m.comp, date: m.date });
      const calList = [...cal.values()].filter((x) => !ck(x) || Date.now() - Date.parse(ck(x)) > 30 * 3600e3)
        .sort((a, b) => (ck(a) < ck(b) ? -1 : ck(a) > ck(b) ? 1 : a.date < b.date ? -1 : 1)).slice(0, Math.max(3, o.max - list.length));
      for (const x of calList) list.push({ comp: x.comp, league: E.ESPN_LEAGUES[x.comp], date: x.date, why: "calendrier", url: E.espnUrl(E.ESPN_LEAGUES[x.comp], x.date) });
    }
    return list.map((x) => Object.assign(x, { file: `${x.comp}__${x.date}` }));
  };
  /** Plan long stocké dans la base pour une collecte sans code : chaque (compétition, date) de J−5 à J+14 encore sans score final */
  E.storedPlan = function (M, today) {
    const want = new Map();
    for (const m of M) {
      if (!m.eid || m.hg !== null || m.status === "ANNULÉ" || m.date < addD(today, -5) || m.date > addD(today, 14)) continue;
      const lg = E.ESPN_LEAGUES[m.comp]; if (!lg) continue;
      const k = m.comp + "__" + m.date; if (!want.has(k)) want.set(k, { file: k, comp: m.comp, date: m.date, url: E.espnUrl(lg, m.date) });
    }
    return { kind: "plan", updatedAt: new Date().toISOString(), today, prompt: E.FETCH_PROMPT,
      rule: "Lire les entrées dont la date est comprise entre aujourd'hui − 5 jours et aujourd'hui + 3 jours, les plus anciennes d'abord, 36 au plus.",
      items: [...want.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.comp < b.comp ? -1 : 1)) };
  };
  const STC = { STATUS_FULL_TIME: "F", STATUS_FINAL: "F", STATUS_FINAL_AET: "E", STATUS_FINAL_PEN: "K", STATUS_SCHEDULED: "S", STATUS_POSTPONED: "P", STATUS_CANCELED: "C", STATUS_ABANDONED: "A",
    STATUS_IN_PROGRESS: "L", STATUS_HALFTIME: "L", STATUS_FIRST_HALF: "L", STATUS_SECOND_HALF: "L", STATUS_END_OF_REGULATION: "L", STATUS_EXTRA_TIME: "L", STATUS_DELAYED: "S", STATUS_SUSPENDED: "U" };
  E.STC = STC;
  /**
   * Intègre des lignes JSON lues sur ESPN : files = [{ name: "COMP__AAAA-MM-JJ", text }].
   * Contrôles : identifiant numérique, statut connu, équipes déjà connues de la compétition (ou identifiant existant, mêmes équipes),
   * score 0–20 pour un match terminé ; cotes gardées seulement avant le match. Rien n'est inventé : une ligne douteuse est rejetée.
   */
  E.ingestFiles = function (raw, files, fetchedAt, ingest) {
    const ing = ingest || { files: 0, lines: 0, accepted: 0, rejected: [], odds: 0, newResults: 0 };
    for (const fobj of files) {
      const mm = /^([A-Z0-9]+)__(\d{4}-\d{2}-\d{2})(\.jsonl)?$/.exec(fobj.name); if (!mm) continue;
      const comp = mm[1]; if (!E.ESPN_LEAGUES[comp]) continue;
      const f = mm[1] + "__" + mm[2]; ing.files++;
      raw.feeds = raw.feeds || {}; raw.feeds.checks = raw.feeds.checks || {}; raw.feeds.checks[comp + "|" + mm[2]] = fetchedAt;
      raw.espn[comp] = raw.espn[comp] || {};
      const known = new Set(Object.values(raw.espn[comp]).flatMap((r) => [r[2], r[3]]));
      const rows = [];
      for (const line of String(fobj.text || "").split(/\r?\n/)) {
        const t = line.trim().replace(/^```(json)?|```$/g, "").trim(); if (!t.startsWith("{")) continue;
        ing.lines++;
        let o; try { o = JSON.parse(t); } catch (e) { ing.rejected.push(`${f} : JSON invalide`); continue; }
        const st = STC[o.status];
        const prev = raw.espn[comp][String(o.id)];
        const okNames = known.has(o.home) && known.has(o.away);
        if (!/^\d+$/.test(String(o.id)) || !st || !/^\d{4}-\d{2}-\d{2}T/.test(o.date || "") || (!okNames && !prev)) { ing.rejected.push(`${f} : ${o.home} – ${o.away} (${o.status}) non reconnu`); continue; }
        if (prev && (prev[2] !== o.home || prev[3] !== o.away)) { ing.rejected.push(`${f} : équipes différentes pour l'identifiant ${o.id}`); continue; }
        const fin = "FEK".includes(st);
        const hs = fin ? parseInt(o.hs, 10) : null, as = fin ? parseInt(o.as, 10) : null;
        if (fin && (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0 || hs > 20 || as > 20)) { ing.rejected.push(`${f} : score invalide ${o.hs}-${o.as}`); continue; }
        const goals = fin && Array.isArray(o.goals) ? o.goals.filter((g) => Array.isArray(g) && (g[0] === 0 || g[0] === 1)).map((g) => [g[0], String(g[1] || "?"), String(g[2] || ""), g[3] === "og" || g[3] === "p" ? g[3] : ""]) : null;
        if (fin && (!prev || prev[4] === null)) ing.newResults++;
        rows.push([String(o.id), o.date, o.home, o.away, hs, as, st, o.neutral ? 1 : 0, o.slug || (prev && prev[8]) || "", goals, prev ? prev[10] : null, prev ? prev[11] : null, null, prev ? prev[13] : ""]);
        if (Array.isArray(o.odds) && o.odds.length >= 3 && o.odds.slice(0, 3).every((x) => Number.isFinite(+x) && +x > 1) && !fin && st !== "L") {
          raw.oddsEspn[String(o.id)] = [comp, o.date, o.home, o.away, +o.odds[0], +o.odds[1], +o.odds[2], String(o.odds[3] || "Bet 365"), fetchedAt]; ing.odds++;
        }
        ing.accepted++;
      }
      if (rows.length) E.mergeEspn(raw, comp, rows, fetchedAt);
    }
    if (ing.files) raw.feeds.espn = Object.assign({}, raw.feeds.espn, { fetchedAt, source: "ESPN site API (lecture web, tâche planifiée)" });
    if (ing.odds) raw.feeds.oddsEspn = { fetchedAt, source: "ESPN, cotes Bet 365 (région GB)" };
    return ing;
  };

  /* ------------------------------------------------------------ téléchargement direct (sans retranscription) */
  /** Convertit un événement brut du scoreboard ESPN en ligne au format de E.FETCH_PROMPT (mêmes contrôles à l'intégration). */
  E.espnEventToLine = function (ev) {
    const c = (ev && ev.competitions && ev.competitions[0]) || {};
    const cs = c.competitors || [];
    const H = cs.find((x) => x.homeAway === "home"), A = cs.find((x) => x.homeAway === "away");
    if (!ev || !H || !A || !H.team || !A.team) return null;
    const hid = String(H.team.id || H.id || ""), aid = String(A.team.id || A.id || "");
    const sc = (x) => (x && typeof x.score === "object" && x.score !== null ? (x.score.value !== undefined ? x.score.value : x.score.displayValue) : x.score);
    const goals = (c.details || []).filter((d) => d && d.scoringPlay).map((d) => {
      const tid = String((d.team && d.team.id) || "");
      const ath = (d.athletesInvolved || [])[0];
      return [tid === hid ? 0 : tid === aid ? 1 : null, ath ? ath.displayName : "?", (d.clock && d.clock.displayValue) || "", d.ownGoal ? "og" : d.penaltyKick ? "p" : ""];
    }).filter((g) => g[0] !== null);
    const o = (c.odds || [])[0];
    const v = (x) => (x && Number.isFinite(+x.value) && +x.value > 1 ? +x.value : null);
    const odds = o && v(o.homeTeamOdds) && v(o.drawOdds) && v(o.awayTeamOdds) ? [v(o.homeTeamOdds), v(o.drawOdds), v(o.awayTeamOdds), (o.provider && o.provider.name) || "Bet 365"] : null;
    return { id: String(ev.id), date: ev.date, slug: (ev.season && ev.season.slug) || "", status: ev.status && ev.status.type ? ev.status.type.name : null, neutral: !!c.neutralSite,
      home: H.team.displayName, away: A.team.displayName, hs: sc(H), as: sc(A), goals, odds, hid, aid };
  };
  /** Scoreboard ESPN brut → texte JSON-lines prêt pour E.ingestFiles */
  E.espnJsonToLines = function (json) {
    return ((json && json.events) || []).map(E.espnEventToLine).filter(Boolean).map((x) => JSON.stringify(x)).join("\n");
  };
  /** Fichiers football-data.co.uk à rafraîchir : saison en cours, ligues « new » (Brésil, Japon, Suisse) et calendriers */
  E.fdFilesFor = function (today) {
    const y = +today.slice(0, 4), m = +today.slice(5, 7), y0 = m >= 7 ? y : y - 1;
    const code = String(y0 % 100).padStart(2, "0") + String((y0 + 1) % 100).padStart(2, "0");
    return ["E0", "E1", "SP1", "I1", "D1", "F1", "N1"].map((d) => `mmz4281/${code}/${d}.csv`).concat(["new/BRA.csv", "new/JPN.csv", "new/SWZ.csv", "fixtures.csv", "new_league_fixtures.csv"]);
  };
  E.fdUrl = (key) => `https://football-data.co.uk/${key}`; // le site redirige www → domaine nu

  /* ------------------------------------------------------------ cotes des bookmakers français (The Odds API) */
  E.ODDS_API_SPORTS = { PL: "soccer_epl", PD: "soccer_spain_la_liga", FL1: "soccer_france_ligue_one", SA: "soccer_italy_serie_a", BL1: "soccer_germany_bundesliga",
    CL: "soccer_uefa_champs_league", J1: "soccer_japan_j_league", DED: "soccer_netherlands_eredivisie", BSA: "soccer_brazil_campeonato", ELC: "soccer_efl_champ",
    SSL: "soccer_switzerland_superleague", SPL: "soccer_saudi_arabia_pro_league", WC: "soccer_fifa_world_cup" };
  E.FR_BOOKS = { winamax_fr: "Winamax", betclic_fr: "Betclic", unibet_fr: "Unibet", pmu_fr: "PMU", netbet_fr: "NetBet" };
  /**
   * Références « sharp » (marges faibles, prix les plus justes) : servent à estimer la cote juste, jamais à parier.
   * Demandées dans le même appel que les bookmakers français (paramètre bookmakers : jusqu'à 10 bookmakers = 1 crédit).
   */
  E.SHARP_BOOKS = { pinnacle: "Pinnacle", betfair_ex_eu: "Betfair (bourse)", matchbook: "Matchbook (bourse)" };
  const plausibleSharp = (h, d, a) => [h, d, a].every((x) => Number.isFinite(x) && x > 1.01 && x < 1000) && 1 / h + 1 / d + 1 / a > 0.97 && 1 / h + 1 / d + 1 / a < 1.1;
  /** Adresse d'un relevé 1N2 chez les bookmakers français (1 crédit par appel) */
  E.oddsApiUrl = (comp, key) => `https://api.the-odds-api.com/v4/sports/${E.ODDS_API_SPORTS[comp]}/odds/?apiKey=${encodeURIComponent(key)}&bookmakers=${Object.keys(E.FR_BOOKS).concat(Object.keys(E.SHARP_BOOKS)).join(",")}&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
  /** Une cote 1N2 plausible : trois cotes > 1, marge du bookmaker entre 0 et 25 % */
  E.plausibleTriple = function (h, d, a) {
    if (![h, d, a].every((x) => Number.isFinite(x) && x > 1.01 && x < 1000)) return false;
    const over = 1 / h + 1 / d + 1 / a;
    return over > 1.0 && over < 1.25;
  };
  /**
   * Intègre la réponse /odds de The Odds API pour une compétition.
   * Seules les cotes d'avant-match sont gardées (relevé antérieur au coup d'envoi) : la dernière valeur gardée sert de cote de clôture approchée.
   * raw.oddsFr[id] = [comp, coupEnvoi, domicile, extérieur, { livre: [1, N, 2, majBookmaker] }, relevéLe, premierRelevé]
   */
  E.mergeOddsApi = function (raw, comp, events, fetchedAt) {
    raw.oddsFr = raw.oddsFr || {};
    const t = Date.parse(fetchedAt);
    let kept = 0, live = 0, rejected = 0;
    for (const ev of events || []) {
      if (!ev || !ev.id || !ev.home_team || !ev.away_team || !ev.commence_time) continue;
      if (!(Date.parse(ev.commence_time) > t)) { live++; continue; }
      const books = {}, sharp = {};
      for (const b of ev.bookmakers || []) {
        const isFr = !!E.FR_BOOKS[b.key], isSharp = !!E.SHARP_BOOKS[b.key];
        if (!isFr && !isSharp) continue;
        const mk = (b.markets || []).find((x) => x.key === "h2h"); if (!mk) continue;
        const price = (name) => { const x = (mk.outcomes || []).find((y) => y.name === name); return x ? +x.price : NaN; };
        const h = price(ev.home_team), d = price("Draw"), a = price(ev.away_team);
        if (isFr ? !E.plausibleTriple(h, d, a) : !plausibleSharp(h, d, a)) { rejected++; continue; }
        (isFr ? books : sharp)[b.key] = [h, d, a, b.last_update || mk.last_update || null];
      }
      if (Object.keys(sharp).length) {
        // référence sharp : premier relevé gardé (ouverture) et dernier relevé avant le coup d'envoi (clôture approchée)
        raw.oddsSharp = raw.oddsSharp || {};
        const ps = raw.oddsSharp[ev.id];
        raw.oddsSharp[ev.id] = [comp, ev.commence_time, ev.home_team, ev.away_team, sharp, fetchedAt, (ps && ps[6]) || sharp, (ps && ps[7]) || fetchedAt];
      }
      if (!Object.keys(books).length) continue;
      const prev = raw.oddsFr[ev.id];
      raw.oddsFr[ev.id] = [comp, ev.commence_time, ev.home_team, ev.away_team, books, fetchedAt, (prev && prev[6]) || books];
      kept++;
    }
    const lim = new Date(t - 400 * 864e5).toISOString();
    for (const [id, o] of Object.entries(raw.oddsFr)) if (o[1] < lim) delete raw.oddsFr[id];
    for (const [id, o] of Object.entries(raw.oddsSharp || {})) if (o[1] < lim) delete raw.oddsSharp[id];
    return { kept, live, rejected };
  };
  /** Marchés complémentaires d'un match (1 crédit par marché renvoyé) : les deux équipes marquent, plus/moins de buts */
  E.oddsApiEventUrl = (comp, eventId, key) => `https://api.the-odds-api.com/v4/sports/${E.ODDS_API_SPORTS[comp]}/events/${encodeURIComponent(eventId)}/odds?apiKey=${encodeURIComponent(key)}&regions=fr&markets=btts,totals&oddsFormat=decimal&dateFormat=iso`;
  const plausible2 = (a, b) => [a, b].every((x) => Number.isFinite(x) && x > 1.01 && x < 100) && 1 / a + 1 / b > 1.0 && 1 / a + 1 / b < 1.2;
  /**
   * Intègre la réponse /events/{id}/odds : raw.oddsFrX[id] = { comp, ko, home, away, at, btts: { livre: [oui, non] }, totals: { livre: { ligne: [plus, moins] } } }.
   * Avant-match seulement, comme le 1N2.
   */
  E.mergeOddsApiEvent = function (raw, comp, ev, fetchedAt) {
    raw.oddsFrX = raw.oddsFrX || {};
    if (!ev || !ev.id || !(Date.parse(ev.commence_time) > Date.parse(fetchedAt))) return { kept: 0 };
    const x = { comp, ko: ev.commence_time, home: ev.home_team, away: ev.away_team, at: fetchedAt, btts: {}, totals: {} };
    let rejected = 0;
    for (const b of ev.bookmakers || []) {
      if (!E.FR_BOOKS[b.key]) continue;
      for (const mk of b.markets || []) {
        if (mk.key === "btts") {
          const y = (mk.outcomes || []).find((o) => o.name === "Yes"), n = (mk.outcomes || []).find((o) => o.name === "No");
          if (y && n && plausible2(+y.price, +n.price)) x.btts[b.key] = [+y.price, +n.price]; else rejected++;
        } else if (mk.key === "totals") {
          const lines = {};
          for (const o of mk.outcomes || []) { const L = String(o.point); lines[L] = lines[L] || [null, null]; lines[L][o.name === "Over" ? 0 : 1] = +o.price; }
          for (const [L, v] of Object.entries(lines)) if (plausible2(v[0], v[1])) { x.totals[b.key] = x.totals[b.key] || {}; x.totals[b.key][L] = v; } else rejected++;
        }
      }
    }
    if (!Object.keys(x.btts).length && !Object.keys(x.totals).length) return { kept: 0, rejected };
    raw.oddsFrX[ev.id] = x;
    const lim = new Date(Date.parse(fetchedAt) - 400 * 864e5).toISOString();
    for (const [id, o] of Object.entries(raw.oddsFrX)) if (o.ko < lim) delete raw.oddsFrX[id];
    return { kept: 1, rejected };
  };

  /** Rattache chaque relevé français à sa rencontre : même compétition, date ±1 jour, noms d'équipes les plus proches. */
  /* ------------------------------------------------------------ absences (API-Football, offre gratuite) */
  /** Identifiants API-Football des 13 compétitions */
  E.AF_LEAGUES = { PL: 39, ELC: 40, PD: 140, SA: 135, BL1: 78, FL1: 61, DED: 88, BSA: 71, J1: 98, SSL: 207, SPL: 307, CL: 2, WC: 1 };
  /** Blessés et suspendus de toutes les compétitions pour une date (1 requête ; l'offre gratuite donne la saison en cours par date) */
  E.afInjuriesUrl = (date) => `https://v3.football.api-sports.io/injuries?date=${date}`;
  /**
   * Intègre une réponse /injuries : raw.injuries[fixtureId] = { comp, date, at, list: [[équipe, joueur, type, motif]] }.
   * type : « Missing Fixture » (absent) ou « Questionable » (incertain). Dernier relevé gardé ; relevés de plus de 40 jours supprimés.
   */
  E.mergeInjuries = function (raw, json, fetchedAt) {
    raw.injuries = raw.injuries || {};
    const byLeague = {}; for (const [c, id] of Object.entries(E.AF_LEAGUES)) byLeague[id] = c;
    const fx = {};
    for (const x of (json && json.response) || []) {
      const comp = x && x.league && byLeague[x.league.id]; if (!comp || !x.fixture || !x.team || !x.player) continue;
      const f = (fx[x.fixture.id] = fx[x.fixture.id] || { comp, date: x.fixture.date, at: fetchedAt, list: [] });
      f.list.push([x.team.name, x.player.name, x.player.type, x.player.reason]);
    }
    for (const [id, f] of Object.entries(fx)) raw.injuries[id] = f;
    const lim = new Date(Date.parse(fetchedAt) - 40 * 864e5).toISOString();
    for (const [id, f] of Object.entries(raw.injuries)) if (f.date < lim) delete raw.injuries[id];
    return Object.keys(fx).length;
  };
  /** Rattache les absences aux matchs (même compétition, date à un jour près, noms d'équipes proches) : ex.injuries = { home, away, at } */
  E.joinInjuries = function (raw, matchesByComp) {
    let joined = 0;
    for (const f of Object.values(raw.injuries || {})) {
      const t = Date.parse(f.date), teams = [...new Set(f.list.map((x) => x[0]))];
      let best = null, bs = 0;
      for (const m of matchesByComp[f.comp] || []) {
        if (Math.abs(Date.parse(m.row[1] + "T12:00:00Z") - t) > 1.5 * 864e5) continue;
        const sc = Math.max(...teams.map((n) => Math.max(sim(n, m.row[4]), sim(n, m.row[5]))));
        if (sc > bs) { bs = sc; best = m; }
      }
      if (!best || bs < 0.6) continue;
      const home = [], away = [];
      for (const x of f.list) (sim(x[0], best.row[4]) >= sim(x[0], best.row[5]) ? home : away).push([x[1], x[2], x[3]]);
      best.row[9].injuries = { home, away, at: f.at };
      joined++;
    }
    return joined;
  };

  E.joinOddsFr = function (raw, matchesByComp) {
    let joined = 0, unjoined = 0;
    for (const [id, o] of Object.entries(raw.oddsFr || {})) {
      const [comp, ko, home, away, books, at, first] = o;
      const t = Date.parse(ko);
      let best = null, bs = 0;
      for (const m of matchesByComp[comp] || []) {
        if (Math.abs(Date.parse(m.row[1] + "T12:00:00Z") - t) > 1.5 * 864e5) continue;
        const sc = sim(home, m.row[4]) + sim(away, m.row[5]);
        if (sc > bs) { bs = sc; best = m; }
      }
      if (!best || bs < 1.2) { unjoined++; continue; }
      best.row[9].oddsFr = { books, at, first, ko, eventId: id };
      const sh = raw.oddsSharp && raw.oddsSharp[id];
      if (sh) best.row[9].oddsSharp = { books: sh[4], at: sh[5], first: sh[6], firstAt: sh[7], ko };
      const x = raw.oddsFrX && raw.oddsFrX[id];
      if (x) best.row[9].oddsFrX = { btts: x.btts, totals: x.totals, at: x.at };
      joined++;
    }
    return { joined, unjoined };
  };
})(typeof window !== "undefined" ? window : globalThis);
