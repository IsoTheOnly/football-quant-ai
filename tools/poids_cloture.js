/* Étude : le poids du modèle dans le mélange (appris face aux cotes Bet 365 d'avant-match) reste-t-il utile
   face à la cote du même bookmaker à la clôture (l'équivalent des cotes de la veille ou du jour du match) ?
   Lignes : 3 périodes chronologiques (apprentissage / validation / test figé). Écart de log loss ; négatif = mieux. */
process.chdir(require("path").join(__dirname, ".."));
const fs = require("fs"), z = require("zlib");
for (const f of ["engine.js", "standings.js", "core.js", "autopilot.js", "etl2.js", "train2.js"]) require(require("path").join(__dirname, "..", "src", f));
const raw = JSON.parse(z.gunzipSync(fs.readFileSync("data/snapshot.json.gz")).toString("utf8"));
const M = FQ.buildMatches(FQ.ETL.build(raw), "2026-10-16");
const T = JSON.parse(fs.readFileSync("data/trained.json"));
const byId = new Map(M.map((m) => [m.id, m]));
const per = { train: ["2025-07-01", "2026-03-01"], val: ["2026-03-01", "2026-07-01"], test: ["2026-07-01", "2026-10-16"] };
const R = { train: [], val: [], test: [] };
for (const [k, [a, b]] of Object.entries(per)) for (const comp of Object.keys(T.leagues)) for (const r of FQ.T.predictRange(FQ.T.applyDrivers ? M : M, comp, a, b, T.leagues[comp].params || {})) {
  const m = byId.get(r.id);
  // même bookmaker avant-match et à la clôture (Bet 365) : seul l'horizon change
  if (!r.o || r.oIsClose || !r.c) continue;
  r.pm = FQ.calib3(r.p3, T.calibration.T1N2); r.cl = r.c;
  R[k].push(r);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ll = (p, k) => -Math.log(Math.max(1e-9, p[k]));
const L = (rows, odds, w) => rows.map((r) => ll(FQ.blend(r.pm, odds(r), w, "norm").p3, r.k));
const pre = (r) => r.o, clo = (r) => r.cl;
const wOf = (c) => (T.blend.byComp[c] !== undefined ? T.blend.byComp[c] : T.blend.w);
console.log("lignes", Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length])));
for (const grp of [["toutes", () => true], ["PL", (r) => r.comp === "PL"], ["SA", (r) => r.comp === "SA"], ["BSA", (r) => r.comp === "BSA"]]) {
  const [name, f] = grp; const fit = R.train.concat(R.val).filter(f), te = R.test.filter(f);
  const best = (odds) => { let bw = 0, bl = Infinity; for (let w = 0; w <= 1.0001; w += 0.05) { const l = mean(L(fit, odds, w)); if (l < bl) { bl = l; bw = Math.round(w * 100) / 100; } } return bw; };
  const wPre = best(pre), wClo = best(clo);
  // test : poids actuel (appris avant-match) appliqué à la clôture, contre le marché de clôture seul
  const cur = te.map((r) => ll(FQ.blend(r.pm, r.cl, wOf(r.comp), "norm").p3, r.k)), mk = L(te, clo, 0);
  const d = cur.map((x, i) => x - mk[i]);
  console.log(`${name.padEnd(7)} n apprentissage+validation ${fit.length}, test ${te.length} | poids modèle optimal : avant-match ${wPre}, clôture ${wClo} | test, poids actuel face à la clôture seule : ${mean(d) >= 0 ? "+" : ""}${mean(d).toFixed(4)} [${FQ.T.bootRoi(d, 600).map((x) => x.toFixed(4)).join(" ; ")}]`);
}
