/* =========================================================================
   FOOTBALL QUANT AI — exécuteur de la tâche planifiée (Node, depuis le dépôt GitHub)

   node src/runner.js run <dir> [--fetched] [--train]
       <dir>/auto/*.json : documents de la base de la page (collection « auto »), téléchargés par la tâche.
       1. télécharge directement (curl, sans retranscription) :
          - ESPN : résultats, buteurs, horaires et cotes Bet 365 (J−5 → J+14) ;
          - football-data.co.uk : cotes d'avant-match et de clôture (Pinnacle, moyenne du marché) ;
          - The Odds API (si ODDS_API_KEY est défini) : cotes 1N2 de Winamax, Betclic, Unibet, PMU, NetBet,
            dans la limite du quota mensuel ; repli automatique sur Bet 365 quand il est épuisé.
          Si ESPN est injoignable : écrit <dir>/fetch_plan.json et sort avec le code 3 (lecture web à faire,
          puis relancer avec --fetched : les lignes lues sont dans <dir>/fetched/*.jsonl).
       2. intègre, reconstruit, ré-entraîne si l'entraînement a plus de 7 jours (ou --train),
          exécute le cycle (audit, analyses, choix, tickets, règlements, CLV)
       3. écrit <dir>/out/plan.json : écritures à faire dans la base, par lots.

   node src/runner.js summary <dir>
       Résumé lisible des tickets de la semaine et des bilans (notification hebdomadaire). N'écrit rien.
   ========================================================================= */
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), cp = require("child_process");
const [CMD, DIR] = process.argv.slice(2);
const SRC = __dirname, ROOT = path.resolve(__dirname, "..");
for (const f of ["engine.js", "standings.js", "core.js", "autopilot.js", "etl2.js", "train2.js"]) require(path.join(SRC, f));
const FQ = globalThis.FQ, E = FQ.ETL, U = FQ.util;
if (!CMD || !DIR) { console.error("usage : node src/runner.js run|summary <dossier>"); process.exit(1); }
const dir = path.resolve(DIR);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const autoDir = path.join(dir, "auto");
const readDoc = (id) => { const p = path.join(autoDir, id + ".json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
const gzip = (txt) => zlib.gzipSync(Buffer.from(txt, "utf8"), { level: 9 }).toString("base64");
const meta = readDoc("meta");
const notes = [];
const ODDS_KEY = (process.env.ODDS_API_KEY || "").trim();
const hide = (t) => (ODDS_KEY ? String(t).split(ODDS_KEY).join("***") : String(t));

function readChunks(ids, len) {
  if (!Array.isArray(ids)) return null;
  const parts = ids.map(readDoc);
  if (!parts.every(Boolean)) { notes.push("morceau manquant : " + ids.find((id, i) => !parts[i])); return null; }
  const t = parts.map((x) => x.s).join("");
  if (len !== undefined && t.length !== len) { notes.push("longueur incohérente"); return null; }
  return t;
}
function loadState() {
  let state = null;
  try { const t = meta && meta.schemaData === 2 && readChunks(meta.stateChunks, meta.stateLen); if (t) state = JSON.parse(meta.stateGz ? gunzip(t) : t); } catch (e) { notes.push("état illisible : " + e.message); }
  return state;
}

/* ------------------------------------------------------------------ résumé hebdomadaire */
if (CMD === "summary") {
  const state = loadState();
  if (!state) { console.log("Aucun état enregistré dans la page."); process.exit(0); }
  const fr = (x, d) => (Number.isFinite(x) ? x.toFixed(d === undefined ? 2 : d).replace(".", ",") : "—");
  const sg = (x, u) => (Number.isFinite(x) ? (x > 0 ? "+" : "") + fr(x) + " " + u : "—");
  const win = FQ.P.ticketWindow(today, state.settings);
  const tks = (state.paperTickets || []).filter((t) => t.week === win.week).sort((a, b) => (a.totalOdds < b.totalOdds ? -1 : 1));
  const lines = [`Tickets de la semaine (${win.from} → ${win.to}) :`];
  if (!tks.length) lines.push("- aucun ticket construit pour l'instant (pas assez de matchs avec cotes réelles).");
  for (const t of tks) {
    lines.push(`- ${t.label} : ${t.legs.length} sélection(s), cote ${fr(t.totalOdds)} chez ${t.bookName || "—"}, chance estimée ${fr(100 * t.pJoint, 1)} % (${t.status === "EN ATTENTE" ? (t.frozen ? "en cours" : "modifiable jusqu'au 1er coup d'envoi") : t.status.toLowerCase()})`);
    if (Array.isArray(t.byN) && t.byN.length > 1) lines.push(`    chance selon le nombre de sélections : ${t.byN.map((x) => `${x.n} → ${fr(100 * x.p, 1)} %`).join(", ")}`);
    for (const l of t.legs) lines.push(`    · ${l.date} ${l.home} – ${l.away} : ${l.label} @ ${fr(l.odds)} (${(l.oddsSrc || "").split(" · ")[0]})`);
  }
  const stats = (list) => { const d = list.filter((t) => t.status === "GAGNÉ" || t.status === "PERDU"); const p = d.reduce((a, t) => a + (t.profit || 0), 0); const st = d.reduce((a, t) => a + (t.stake || 0), 0); return { n: d.length, won: d.filter((t) => t.status === "GAGNÉ").length, profit: p, roi: st ? p / st : null }; };
  const clvAvg = (list) => { const v = list.map((t) => t.clv && t.clv.ev).filter(Number.isFinite); return v.length ? { n: v.length, ev: v.reduce((a, x) => a + x, 0) / v.length, beat: v.filter((x) => x > 0).length } : null; };
  const realL = (state.realBets || []).filter(FQ.P.isRealBet), testL = (state.realBets || []).filter((b) => !FQ.P.isRealBet(b));
  const ps = stats(state.paperTickets || []), rs = stats(realL), ts = stats(testL);
  lines.push(`Paper betting : ${ps.won}/${ps.n} tickets gagnés, ${sg(ps.profit, "u")}.`);
  if (realL.length) lines.push(`Paris réels : ${rs.won}/${rs.n} gagnés, ${sg(rs.profit, "€")}.`);
  if (testL.length) lines.push(`Tes tickets de test (pas joués) : ${ts.won}/${ts.n} gagnés, ${sg(ts.profit, "€")} fictifs.`);
  if (state.coverage && state.coverage.nIssues) lines.push(`Couverture 14 jours : ${state.coverage.nIssues} point(s) à vérifier (${[...new Set(state.coverage.issues.map((x) => x.kind))].join(", ")}).`);
  const picks = (state.picks || []).filter((p) => p.status === "GAGNÉ" || p.status === "PERDU");
  if (picks.length) lines.push(`Choix du modèle : ${picks.filter((p) => p.status === "GAGNÉ").length}/${picks.length} justes.`);
  for (const [lab, list] of [["choix", state.picks || []], ["tickets paper", state.paperTickets || []], ["paris réels", realL], ["tests", testL]]) {
    const c = clvAvg(list); if (c) lines.push(`Cote de clôture (${lab}) : ${c.beat}/${c.n} au-dessus, espérance moyenne à la clôture ${sg(100 * c.ev, "%")}.`);
  }
  console.log(lines.join("\n"));
  process.exit(0);
}
if (CMD !== "run") { console.error("commande inconnue : " + CMD); process.exit(1); }

/* ------------------------------------------------------------------ magasin brut */
let raw = null;
try { const t = meta && readChunks(meta.rawChunks, meta.rawLen); if (t) raw = JSON.parse(gunzip(t)); } catch (e) { notes.push("magasin brut illisible : " + e.message); }
if (!raw) { raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "data", "snapshot.json.gz"))).toString("utf8")); notes.push("magasin brut initialisé depuis le dépôt"); }
raw.oddsFr = raw.oddsFr || {}; raw.feeds = raw.feeds || {};

/* ------------------------------------------------------------------ téléchargements directs */
const tmp = path.join(dir, "dl"); fs.mkdirSync(tmp, { recursive: true });
let dlN = 0;
/** GET via curl (respecte le proxy de l'environnement). Retourne { ok, status, headers, body, err } ; jamais d'exception. */
function get(url, binaryOk) {
  const n = ++dlN, out = path.join(tmp, `b${n}`), hdr = path.join(tmp, `h${n}`);
  try {
    cp.execFileSync("curl", ["-sS", "-L", "--compressed", "--max-time", "45", "--retry", "1", "-A", "Mozilla/5.0 (FootballQuantAI personal use)", "-D", hdr, "-o", out, "-w", "%{http_code}", url], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return { ok: false, status: 0, err: hide((e.stderr && e.stderr.toString().trim()) || e.message).slice(0, 200) };
  }
  const headers = {};
  try { for (const l of fs.readFileSync(hdr, "utf8").split(/\r?\n/)) { const m = /^([\w-]+):\s*(.*)$/.exec(l); if (m) headers[m[1].toLowerCase()] = m[2]; } } catch (e) {}
  const st = (() => { try { const h = fs.readFileSync(hdr, "utf8").match(/HTTP\/[\d.]+\s+(\d{3})/g); return h ? +h[h.length - 1].split(/\s+/)[1] : 0; } catch (e) { return 0; } })();
  const body = fs.existsSync(out) ? fs.readFileSync(out, binaryOk ? undefined : "utf8") : "";
  return { ok: st >= 200 && st < 300, status: st, headers, body };
}
const fetchedAt = new Date().toISOString();
const net = { espn: { tried: 0, ok: 0, fail: 0 }, fd: { tried: 0, ok: 0, fail: 0 }, odds: { tried: 0, ok: 0, fail: 0, credits: null } };
const useFetched = process.argv.includes("--fetched");
const files = [];
const M0 = FQ.buildMatches(E.build(raw), today);

// 1. ESPN
if (useFetched) {
  const fdir = path.join(dir, "fetched");
  if (fs.existsSync(fdir)) for (const f of fs.readdirSync(fdir)) if (f.endsWith(".jsonl")) files.push({ name: f, text: fs.readFileSync(path.join(fdir, f), "utf8") });
} else {
  const plan = E.fetchPlan(raw, M0, today, { max: 90 });
  for (const x of plan) {
    net.espn.tried++;
    const r = get(x.url);
    if (!r.ok) { net.espn.fail++; if (net.espn.fail >= 4 && net.espn.ok === 0) break; continue; }
    try { files.push({ name: x.file, text: E.espnJsonToLines(JSON.parse(r.body)) }); net.espn.ok++; } catch (e) { net.espn.fail++; notes.push(`ESPN ${x.file} illisible`); }
  }
  if (net.espn.tried && net.espn.ok === 0) {
    const list = E.fetchPlan(raw, M0, today, { max: 36 }).map((x) => Object.assign(x, { file: `fetched/${x.file}.jsonl` }));
    fs.writeFileSync(path.join(dir, "fetch_plan.json"), JSON.stringify({ today, prompt: E.FETCH_PROMPT, fetches: list }, null, 1));
    console.log(JSON.stringify({ needWeb: true, reason: "ESPN injoignable en direct (domaine non autorisé ?)", fetches: list.length }));
    process.exit(3);
  }
}
// boîte de réception : lignes déposées par l'ancienne collecte sans code (documents in_*), intégrées puis supprimées
const inboxIds = [];
if (fs.existsSync(autoDir)) for (const f of fs.readdirSync(autoDir)) {
  if (!/^in_[\w-]+\.json$/.test(f)) continue;
  try { const d = JSON.parse(fs.readFileSync(path.join(autoDir, f), "utf8")); if (d && d.kind === "inbox" && d.files) { for (const [name, text] of Object.entries(d.files)) files.unshift({ name, text }); inboxIds.push(f.replace(/\.json$/, "")); } } catch (e) { notes.push("boîte de réception illisible : " + f); }
}
const ingest = E.ingestFiles(raw, files, fetchedAt);
ingest.inbox = inboxIds.length;

// 2. football-data.co.uk (cotes d'avant-match et de clôture)
{
  const got = {};
  // saisons passées déjà stockées mais sans cotes ±2,5 (format antérieur) : retéléchargées une fois
  // anciennes saisons à recharger : sans cotes ±2,5 ou sans tirs cadrés (ajoutés le 16/10/2026)
  const older = Object.entries(raw.fd || {}).filter(([k, rows]) => /^mmz4281\//.test(k) && rows.length && (!rows.some((r) => r[12]) || !rows.some((r) => r[13]))).map(([k]) => k);
  for (const key of [...new Set(E.fdFilesFor(today).concat(older))]) {
    net.fd.tried++;
    const r = get(E.fdUrl(key));
    if (r.ok && /^﻿?Div,|^﻿?Country,|HomeTeam|Home,/.test(String(r.body).slice(0, 300))) { got[key] = r.body; net.fd.ok++; }
    else { net.fd.fail++; if (net.fd.fail >= 3 && net.fd.ok === 0) break; }
  }
  if (Object.keys(got).length) E.mergeFD(raw, got, fetchedAt);
  else notes.push("football-data.co.uk injoignable : cotes de clôture non mises à jour");
}

// 3. The Odds API (bookmakers français), dans la limite du quota
function oddsPlan(M) {
  const feed = raw.feeds.oddsApi || {};
  const month = today.slice(0, 7);
  let rem = Number.isFinite(feed.remaining) ? feed.remaining : 500;
  if (feed.at && feed.at.slice(0, 7) !== month && rem < 50) rem = 50; // nouveau mois : le quota a pu être rechargé, un sondage suffit à le savoir
  const dim = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate(), daysLeft = dim - +today.slice(8, 10) + 1;
  const dow = new Date(today + "T12:00:00Z").getUTCDay(); // 0 dimanche … 4 jeudi
  const weight = dow === 4 || dow === 5 || dow === 6 ? 1.6 : 0.7; // davantage de relevés pendant la fenêtre des tickets
  const budget = Math.max(0, Math.min(40, Math.floor((rem / (daysLeft * 2)) * weight)));
  const noFr = feed.noFr || {};
  const horizon = U.addDays(today, 3), soon = new Map();
  for (const m of M) {
    if (m.status !== "PROGRAMMÉ" || m.date < today || m.date > horizon || !E.ODDS_API_SPORTS[m.comp]) continue;
    if (noFr[m.comp] && U.daysBetween(noFr[m.comp], today) < 14) continue;
    const ko = FQ.time.kickoffUtc(m.date, m.time, m.tz) || Date.parse(m.date + "T12:00:00Z");
    if (ko <= Date.now()) continue;
    const cur = soon.get(m.comp); soon.set(m.comp, { comp: m.comp, first: Math.min(cur ? cur.first : Infinity, ko), n: (cur ? cur.n : 0) + 1 });
  }
  const comps = [...soon.values()].sort((a, b) => a.first - b.first || b.n - a.n).map((x) => x.comp);
  return { comps: comps.slice(0, Math.min(13, budget)), budget, remaining: rem, eligible: comps.length };
}
const oddsInfo = { enabled: !!ODDS_KEY };
if (ODDS_KEY && process.argv.includes("--no-odds")) { oddsInfo.skipped = true; notes.push("relevé des cotes françaises sauté pour ce passage (relevé récent conservé)"); }
else if (ODDS_KEY) {
  const op = oddsPlan(M0);
  Object.assign(oddsInfo, { budget: op.budget, eligible: op.eligible, remainingBefore: op.remaining, comps: op.comps, kept: 0 });
  const feed = (raw.feeds.oddsApi = Object.assign({ noFr: {} }, raw.feeds.oddsApi || {}));
  for (const comp of op.comps) {
    net.odds.tried++;
    const r = get(E.oddsApiUrl(comp, ODDS_KEY));
    const rem = parseInt(r.headers && r.headers["x-requests-remaining"], 10);
    if (Number.isFinite(rem)) { feed.remaining = rem; feed.used = parseInt(r.headers["x-requests-used"], 10) || null; feed.at = fetchedAt; net.odds.credits = rem; }
    if (!r.ok) {
      net.odds.fail++;
      if (r.status === 401) { notes.push("The Odds API : clé refusée (401)"); break; }
      if (r.status === 429 || (Number.isFinite(rem) && rem <= 0)) { notes.push("The Odds API : crédits du mois épuisés → repli sur Bet 365"); feed.remaining = 0; feed.at = fetchedAt; break; }
      if (!r.status) { notes.push("The Odds API injoignable : " + r.err); break; }
      continue;
    }
    let events = null; try { events = JSON.parse(r.body); } catch (e) { net.odds.fail++; continue; }
    const res = E.mergeOddsApi(raw, comp, events, fetchedAt);
    net.odds.ok++; oddsInfo.kept += res.kept;
    if (Array.isArray(events) && events.length && !res.kept && !res.live) feed.noFr[comp] = today; else delete feed.noFr[comp];
    if (res.rejected) notes.push(`The Odds API ${comp} : ${res.rejected} cote(s) écartée(s) (marge invraisemblable)`);
  }
  // marchés complémentaires (les deux équipes marquent, ±2,5 buts) des matchs à venir sous 4 jours, 2 crédits par match,
  // avec le reste du budget de ce passage ; priorité aux matchs les plus proches, un relevé par match toutes les 20 h au plus
  {
    const left = Math.max(0, op.budget - net.odds.tried);
    const lim = Date.now() + 4 * 864e5, recent = Date.now() - 20 * 3600e3;
    const evs = Object.entries(raw.oddsFr || {}).filter(([id, o]) => Date.parse(o[1]) > Date.now() && Date.parse(o[1]) < lim && E.ODDS_API_SPORTS[o[0]]
      && !(raw.oddsFrX && raw.oddsFrX[id] && Date.parse(raw.oddsFrX[id].at) > recent)).sort((a, b) => (a[1][1] < b[1][1] ? -1 : 1)).slice(0, Math.floor(left / 2));
    oddsInfo.events = { planned: evs.length, kept: 0 };
    for (const [id, o] of evs) {
      if (feed.remaining !== undefined && feed.remaining <= 2) break;
      const r = get(E.oddsApiEventUrl(o[0], id, ODDS_KEY));
      const rem = parseInt(r.headers && r.headers["x-requests-remaining"], 10);
      if (Number.isFinite(rem)) { feed.remaining = rem; feed.at = fetchedAt; net.odds.credits = rem; }
      if (!r.ok) { if (r.status === 401 || r.status === 429 || !r.status) break; continue; }
      try { oddsInfo.events.kept += E.mergeOddsApiEvent(raw, o[0], JSON.parse(r.body), fetchedAt).kept; } catch (e) {}
    }
  }
  raw.feeds.oddsFrFeed = { fetchedAt, source: "The Odds API (bookmakers français)" };
} else notes.push("ODDS_API_KEY absent : cotes Bet 365 seulement");
fs.rmSync(tmp, { recursive: true, force: true });

/* ------------------------------------------------------------------ reconstruction, entraînement, cycle */
const ds = E.build(raw);
const matches = FQ.buildMatches(ds, today);

let trainTxt = meta && readChunks(meta.trainChunks, meta.trainLen);
let trained = null; try { if (trainTxt) trained = JSON.parse(gunzip(trainTxt)); } catch (e) { trained = null; }
let trainedFromSeed = false;
{ const p = path.join(ROOT, "data", "trained.json"); if (fs.existsSync(p)) { const sd = JSON.parse(fs.readFileSync(p, "utf8")); if (!trained || sd.generatedAt > trained.generatedAt) { trained = sd; trainedFromSeed = true; } } }
let retrained = false;
const stale = !trained || Date.now() - Date.parse(trained.generatedAt) > 7 * 864e5;
if (process.argv.includes("--train") || stale) { trained = FQ.T.run(matches, { testTo: FQ.T.FROZEN_TEST_TO, postTo: today, grid: true, onLog: (t) => console.error(t) }); retrained = true; }
FQ.TRAINED = trained;

let state = loadState();
if (!state || FQ.validateState(state).length) { if (meta && meta.schemaData === 2) notes.push("état précédent invalide ou absent : nouvel état créé"); state = FQ.emptyState(); state.schemaData = 2; }
state.picks = state.picks || [];
state.settings = Object.assign({}, FQ.DEFAULT_SETTINGS, state.settings || {});
const matchById = new Map(matches.map((m) => [m.id, m]));
const played = {}; matches.forEach((m) => { if (m.hg !== null) played[m.comp] = (played[m.comp] || 0) + 1; });
const cache = new Map();
const lastDate = matches.filter((m) => m.hg !== null && !m.manual && m.date <= today).map((m) => m.date).sort().slice(-1)[0];
const sig = FQ.P.dataSignature(ds);
const ctx = { mode: "real", state, matches, matchById, today, rulesMap: FQ.RULES,
  getModel: (c, d) => { const k = c + d; if (!cache.has(k)) cache.set(k, FQ.fitModel(matches, c, d)); return cache.get(k); },
  dataVersion: (c) => `${sig}|${played[c] || 0}|${trained ? trained.generatedAt : ""}`, dataAgeDays: lastDate ? U.daysBetween(lastDate, today) : null };
const rep = FQ.P.runCycle(ctx, "tâche planifiée");

/* ------------------------------------------------------------------ écritures */
const out = path.join(dir, "out"); fs.mkdirSync(out, { recursive: true });
const rev = ((meta && meta.rev) || 0) + 1;
const writes = [];
// préfixe « g » : les documents de la tâche ne peuvent pas entrer en collision avec ceux qu'écrit la page au même moment
const put = (prefix, txt) => FQ.P.chunkText(txt).map((c, i) => { const id = `${prefix}g${rev}_${i}`; fs.writeFileSync(path.join(out, id + ".json"), JSON.stringify({ s: c })); writes.push({ op: "set", collection: "auto", doc_id: id, file_path: path.join(out, id + ".json") }); return id; });
if (raw.feeds && raw.feeds.checks) for (const k of Object.keys(raw.feeds.checks)) if (k.split("|")[1] < U.addDays(today, -3)) delete raw.feeds.checks[k];
const stateTxt = gzip(JSON.stringify(state));
const sIds = put("s", stateTxt);
const rawTxt = gzip(JSON.stringify(raw));
const rIds = put("r", rawTxt);
let tIds = meta && meta.trainChunks, tLen = meta && meta.trainLen;
if (retrained || trainedFromSeed || !tIds) { const tt = gzip(JSON.stringify(trained)); tIds = put("t", tt); tLen = tt.length; }
const report = { at: new Date().toISOString(), today, report: rep, ingest: Object.assign({}, ingest, { rejected: ingest.rejected.slice(0, 20) }), net, odds: oddsInfo, retrained, notes, lastResult: lastDate, runner: "github" };
const newMeta = Object.assign({}, meta || {}, { rev, schemaData: 2, stateChunks: sIds, stateLen: stateTxt.length, stateGz: true, rawChunks: rIds, rawLen: rawTxt.length,
  trainChunks: tIds, trainLen: tLen, trainedAt: trained.generatedAt, updatedAt: new Date().toISOString(), by: "tâche planifiée", tab: null, lastJob: report });
const planId = `plan_g${rev}`;
fs.writeFileSync(path.join(out, planId + ".json"), JSON.stringify(E.storedPlan(matches, today)));
writes.push({ op: "set", collection: "auto", doc_id: planId, file_path: path.join(out, planId + ".json") });
newMeta.planDoc = planId;
fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(newMeta));
const keep = new Set([...sIds, ...rIds, ...tIds, "meta", planId]);
const existing = fs.existsSync(autoDir) ? fs.readdirSync(autoDir).map((f) => f.replace(/\.json$/, "")) : [];
// ne jamais supprimer un document plus récent que l'état lu (la page peut être en train d'écrire au même moment)
const revOf = (id) => { const m = /^(?:[srtd]g?|plan_g?)(\d+)/.exec(id); return m ? +m[1] : null; };
const old = existing.filter((id) => !keep.has(id) && (/^[srtd]g?\d+_\d+$/.test(id) || /^plan_/.test(id) || /^in_[\w-]+$/.test(id) || /^code_/.test(id))
  && !(revOf(id) !== null && revOf(id) > ((meta && meta.rev) || 0)));
const cutHb = new Date(Date.now() - 3 * 864e5).toISOString().replace(/\D/g, "").slice(0, 12);
const hbOld = existing.filter((id) => /^(hb|err)_\d+$/.test(id) && id.slice(id.indexOf("_") + 1) < cutHb);
const batches = []; for (let i = 0; i < writes.length; i += 5) batches.push(writes.slice(i, i + 5));
fs.writeFileSync(path.join(out, "plan.json"), JSON.stringify({ batches, meta: { collection: "auto", doc_id: "meta", file_path: path.join(out, "meta.json"), exists: !!meta }, deleteAfter: old.concat(hbOld), rev }, null, 1));
console.log(JSON.stringify({ rev, today, lastResult: lastDate, net, odds: oddsInfo,
  ingest: { files: ingest.files, lines: ingest.lines, accepted: ingest.accepted, newResults: ingest.newResults, oddsBet365: ingest.odds, rejected: ingest.rejected.length },
  retrained, report: { audited: rep.audited, analysed: rep.analysed, ticketsNew: rep.ticketsNew || 0, ticketsSettled: rep.ticketsSettled || 0, clv: rep.clv || 0, notes: rep.notes }, notes,
  batches: batches.length, writes: writes.length, deleteAfter: old.length + hbOld.length,
  picksOpen: state.picks.filter((p) => p.status === "EN ATTENTE").length, picksSettled: state.picks.filter((p) => p.status === "GAGNÉ" || p.status === "PERDU").length,
  tickets: (state.paperTickets || []).filter((t) => t.status === "EN ATTENTE").map((t) => `${t.label} @${t.totalOdds} (${t.legs.length} sél., ${t.frozen ? "figé" : "ouvert"})`),
  realBets: (state.realBets || []).length }, null, 1));
