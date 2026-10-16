/* =========================================================================
   FOOTBALL QUANT AI — exécuteur de la tâche planifiée (Node)
   node fq-runner.js plan  <dir>   → <dir>/fetch_plan.json (adresses ESPN à lire)
   node fq-runner.js apply <dir> [--train]
       lit <dir>/auto/*.json (documents de la base), <dir>/fetched/*.jsonl (lectures web),
       <dir>/browser/*.json (relevé complet par le navigateur, facultatif),
       met à jour le magasin brut, reconstruit les données, ré-entraîne si nécessaire,
       exécute le cycle (audit, analyses, choix, paris selon la politique) et écrit
       <dir>/out/plan.json (écritures à faire dans la base, par lots).
   ========================================================================= */
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const [CMD, DIR] = process.argv.slice(2);
const dir = path.resolve(DIR || ".");
for (const f of ["fq-engine.js", "fq-standings.js", "fq-core.js", "fq-autopilot.js", "fq-etl2.js", "fq-train2.js"]) require(path.join(dir, f));
const FQ = globalThis.FQ, E = FQ.ETL;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const autoDir = path.join(dir, "auto");
const readDoc = (id) => { const p = path.join(autoDir, id + ".json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
const gzip = (txt) => zlib.gzipSync(Buffer.from(txt, "utf8"), { level: 9 }).toString("base64");
const meta = readDoc("meta");
const notes = [];
function readChunks(ids, len) {
  if (!Array.isArray(ids)) return null;
  const parts = ids.map(readDoc);
  if (!parts.every(Boolean)) { notes.push("morceau manquant : " + ids.find((id, i) => !parts[i])); return null; }
  const t = parts.map((x) => x.s).join("");
  if (len !== undefined && t.length !== len) { notes.push("longueur incohérente"); return null; }
  return t;
}
let raw = null;
try { const t = meta && readChunks(meta.rawChunks, meta.rawLen); if (t) raw = JSON.parse(gunzip(t)); } catch (e) { notes.push("magasin brut illisible : " + e.message); }
if (!raw) { const p = path.join(dir, "raw_seed.json"); if (fs.existsSync(p)) { raw = JSON.parse(fs.readFileSync(p, "utf8")); notes.push("magasin brut initialisé depuis la page"); } }
if (!raw) { console.error("Aucun magasin brut : extraire raw_seed.json de la page (script fq-raw)."); process.exit(2); }

/* ------------------------------------------------------------------ plan */
if (CMD === "plan") {
  const M = FQ.buildMatches(E.build(raw), today);
  const list = E.fetchPlan(raw, M, today, { max: 36 }).map((x) => Object.assign(x, { file: `fetched/${x.file}.jsonl` }));
  fs.writeFileSync(path.join(dir, "fetch_plan.json"), JSON.stringify({ today, prompt: E.FETCH_PROMPT, fetches: list }, null, 1));
  console.log(JSON.stringify({ today, fetches: list.length, byWhy: list.reduce((a, x) => ((a[x.why] = (a[x.why] || 0) + 1), a), {}) }));
  process.exit(0);
}

/* ------------------------------------------------------------------ apply */
const fetchedAt = new Date().toISOString();
const fdir = path.join(dir, "fetched");
const files = [];
if (fs.existsSync(fdir)) for (const f of fs.readdirSync(fdir)) if (f.endsWith(".jsonl")) files.push({ name: f, text: fs.readFileSync(path.join(fdir, f), "utf8") });
// boîte de réception : lignes déposées par une collecte sans code (documents in_*)
const inboxIds = [];
if (fs.existsSync(autoDir)) for (const f of fs.readdirSync(autoDir)) {
  if (!/^in_[\w-]+\.json$/.test(f)) continue;
  try { const d = JSON.parse(fs.readFileSync(path.join(autoDir, f), "utf8")); if (d && d.kind === "inbox" && d.files) { for (const [name, text] of Object.entries(d.files)) files.push({ name, text }); inboxIds.push(f.replace(/\.json$/, "")); } } catch (e) { notes.push("boîte de réception illisible : " + f); }
}
const ingest = E.ingestFiles(raw, files, fetchedAt);
ingest.inbox = inboxIds.length;
// relevé complet par le navigateur (même format que le relevé initial)
const bdir = path.join(dir, "browser");
if (fs.existsSync(bdir)) {
  for (const f of fs.readdirSync(bdir)) {
    const j = JSON.parse(fs.readFileSync(path.join(bdir, f), "utf8"));
    if (j.rows) for (const [c, rows] of Object.entries(j.rows)) if (c !== "SSL") E.mergeEspn(raw, c, rows, j.fetchedAt);
    if (j.files) E.mergeFD(raw, j.files, j.fetchedAt);
    if (j.odds) E.mergeOddsEspn(raw, j.odds, j.fetchedAt);
    ingest.browser = (ingest.browser || 0) + 1;
  }
}
// calendrier suisse openfootball (dépôt git) : résultats et buteurs absents d'ESPN
const ofp = path.join(dir, "ofssl.json");
if (fs.existsSync(ofp)) { try { const of = JSON.parse(fs.readFileSync(ofp, "utf8")); if (Array.isArray(of) && of.length) { raw.ofssl = of; raw.feeds.of = { fetchedAt, source: "openfootball europe (Suisse)" }; ingest.ofssl = of.length; } } catch (e) { notes.push("ofssl illisible"); } }

const ds = E.build(raw);
const matches = FQ.buildMatches(ds, today);

// entraînement : chargé depuis la base ; relancé s'il a plus de 7 jours ou sur demande
let trainTxt = meta && readChunks(meta.trainChunks, meta.trainLen);
let trained = null; try { if (trainTxt) trained = JSON.parse(gunzip(trainTxt)); } catch (e) { trained = null; }
let trainedFromSeed = false;
// un entraînement fourni à côté (plus récent que celui de la base) le remplace
{ const p = path.join(dir, "trained_seed.json"); if (fs.existsSync(p)) { const sd = JSON.parse(fs.readFileSync(p, "utf8")); if (!trained || sd.generatedAt > trained.generatedAt) { trained = sd; trainedFromSeed = true; } } }
let retrained = false;
const stale = !trained || Date.now() - Date.parse(trained.generatedAt) > 7 * 864e5;
if (process.argv.includes("--train") || stale) {
  trained = FQ.T.run(matches, { testTo: today, grid: true, onLog: (t) => console.error(t) });
  retrained = true;
}
FQ.TRAINED = trained;

// état
let state = null;
try { const t = meta && meta.schemaData === 2 && readChunks(meta.stateChunks, meta.stateLen); if (t) state = JSON.parse(meta.stateGz ? gunzip(t) : t); } catch (e) { notes.push("état illisible : " + e.message); }
if (!state || FQ.validateState(state).length) { if (meta && meta.schemaData === 2) notes.push("état précédent invalide ou absent : nouvel état créé"); state = FQ.emptyState(); state.schemaData = 2; }
state.picks = state.picks || [];
const matchById = new Map(matches.map((m) => [m.id, m]));
const played = {}; matches.forEach((m) => { if (m.hg !== null) played[m.comp] = (played[m.comp] || 0) + 1; });
const cache = new Map();
const lastDate = matches.filter((m) => m.hg !== null && !m.manual && m.date <= today).map((m) => m.date).sort().slice(-1)[0];
const sig = FQ.P.dataSignature(ds);
const ctx = { mode: "real", state, matches, matchById, today, rulesMap: FQ.RULES,
  getModel: (c, d) => { const k = c + d; if (!cache.has(k)) cache.set(k, FQ.fitModel(matches, c, d)); return cache.get(k); },
  dataVersion: (c) => `${sig}|${played[c] || 0}|${trained ? trained.generatedAt : ""}`, dataAgeDays: lastDate ? FQ.util.daysBetween(lastDate, today) : null };
const rep = FQ.P.runCycle(ctx, "tâche planifiée");

/* ------------------------------------------------------------------ écritures */
const out = path.join(dir, "out"); fs.mkdirSync(out, { recursive: true });
const rev = ((meta && meta.rev) || 0) + 1;
const writes = [];
const put = (prefix, txt) => FQ.P.chunkText(txt).map((c, i) => { const id = `${prefix}${rev}_${i}`; fs.writeFileSync(path.join(out, id + ".json"), JSON.stringify({ s: c })); writes.push({ op: "set", collection: "auto", doc_id: id, file_path: path.join(out, id + ".json") }); return id; });
// purge des vieilles vérifications de calendrier
if (raw.feeds && raw.feeds.checks) for (const k of Object.keys(raw.feeds.checks)) if (k.split("|")[1] < FQ.util.addDays(today, -3)) delete raw.feeds.checks[k];
const stateTxt = gzip(JSON.stringify(state));
const sIds = put("s", stateTxt);
const rawTxt = gzip(JSON.stringify(raw));
const rawChanged = !meta || !meta.rawChunks || ingest.accepted || ingest.browser || ingest.ofssl || !readChunks(meta.rawChunks, meta.rawLen);
const rIds = rawChanged ? put("r", rawTxt) : meta.rawChunks;
let tIds = meta && meta.trainChunks, tLen = meta && meta.trainLen;
if (retrained || trainedFromSeed || !tIds) { const tt = gzip(JSON.stringify(trained)); tIds = put("t", tt); tLen = tt.length; }
const newMeta = Object.assign({}, meta || {}, { rev, schemaData: 2, stateChunks: sIds, stateLen: stateTxt.length, stateGz: true, rawChunks: rIds, rawLen: rawChanged ? rawTxt.length : meta.rawLen,
  trainChunks: tIds, trainLen: tLen, trainedAt: trained.generatedAt, updatedAt: new Date().toISOString(), by: "tâche planifiée", tab: null,
  lastJob: { at: new Date().toISOString(), today, report: rep, ingest: Object.assign({}, ingest, { rejected: ingest.rejected.slice(0, 20) }), retrained, notes, lastResult: lastDate } });
fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(newMeta));
// plan long pour la collecte sans code
const planId = `plan_r${rev}`;
fs.writeFileSync(path.join(out, planId + ".json"), JSON.stringify(E.storedPlan(matches, today)));
writes.push({ op: "set", collection: "auto", doc_id: planId, file_path: path.join(out, planId + ".json") });
newMeta.planDoc = planId;
fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(newMeta));
const keep = new Set([...sIds, ...rIds, ...tIds, "meta"]);
const old = fs.existsSync(autoDir) ? fs.readdirSync(autoDir).map((f) => f.replace(/\.json$/, "")).filter((id) => !keep.has(id) && (/^[srtd]\d+_\d+$/.test(id) || /^plan_/.test(id))) : [];
old.push(...inboxIds);
const hbOld = fs.existsSync(autoDir) ? fs.readdirSync(autoDir).map((f) => f.replace(/\.json$/, "")).filter((id) => /^(hb|err)_\d+$/.test(id) && id.slice(3) < new Date(Date.now() - 3 * 864e5).toISOString().replace(/\D/g, "").slice(0, 12)) : [];
const batches = []; for (let i = 0; i < writes.length; i += 5) batches.push(writes.slice(i, i + 5));
fs.writeFileSync(path.join(out, "plan.json"), JSON.stringify({ batches, meta: { collection: "auto", doc_id: "meta", file_path: path.join(out, "meta.json"), exists: !!meta }, deleteAfter: old.concat(hbOld), rev }, null, 1));
const acct = FQ.accounting(state.bets, state.settings.initialBankroll);
console.log(JSON.stringify({ rev, today, lastResult: lastDate, ingest: { files: ingest.files, lines: ingest.lines, accepted: ingest.accepted, newResults: ingest.newResults, odds: ingest.odds, rejected: ingest.rejected.length, browser: ingest.browser || 0 },
  retrained, report: rep, notes, batches: batches.length, writes: writes.length, deleteAfter: old.length + hbOld.length,
  picksOpen: state.picks.filter((p) => p.status === "EN ATTENTE").length, picksSettled: state.picks.filter((p) => p.status === "GAGNÉ" || p.status === "PERDU").length, capital: acct.bankroll,
  tickets: (state.paperTickets || []).filter((t) => t.status === "EN ATTENTE").map((t) => `${t.label} @${t.totalOdds} (${t.legs.length} sél., ${t.frozen ? "figé" : "ouvert"})`),
  ticketsSettled: (state.paperTickets || []).filter((t) => t.status === "GAGNÉ" || t.status === "PERDU").length, realBets: (state.realBets || []).length }, null, 1));
