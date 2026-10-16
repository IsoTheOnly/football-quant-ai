// Étude de drivers gratuits : tirs, tirs cadrés, corners (football-data.co.uk) et force perçue par le marché sur les matchs passés.
// Question : rapprochent-ils le modèle du marché ? Aucune fuite : l'état de chaque équipe n'est mis à jour qu'après chaque match.
// Usage : node tools/drivers_tirs.js <dossier de CSV football-data bruts, ex. 2526_E0.csv>
const fs = require("fs"), path = require("path");
for (const f of ["engine.js", "standings.js", "core.js", "autopilot.js", "etl2.js", "train2.js"]) require(path.join(__dirname, "..", "src", f));
const D = process.argv[2];
const parse = (t) => { const L = t.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean); const h = L[0].split(","); return L.slice(1).map((l) => { const v = l.split(","); const o = {}; h.forEach((k, i) => (o[k] = v[i])); return o; }); };
const N = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : null; };
const ms = [];
for (const f of fs.readdirSync(D).filter((x) => x.endsWith(".csv"))) {
  const lg = f.slice(5, -4);
  for (const r of parse(fs.readFileSync(path.join(D, f), "utf8"))) {
    if (!r.FTR || !r.HomeTeam) continue;
    const d = r.Date.split("/"); const y = d[2].length === 2 ? "20" + d[2] : d[2];
    const o = [N(r.B365H), N(r.B365D), N(r.B365A)];
    ms.push({ lg, date: `${y}-${d[1]}-${d[0]}`, h: r.HomeTeam, a: r.AwayTeam, hg: +r.FTHG, ag: +r.FTAG, k: { H: 0, D: 1, A: 2 }[r.FTR],
      hs: N(r.HS), as: N(r.AS), hst: N(r.HST), ast: N(r.AST), hc: N(r.HC), ac: N(r.AC), o: o.every((x) => x > 1) ? o : null });
  }
}
ms.sort((a, b) => (a.date < b.date ? -1 : 1));
const HL = Number(process.argv[3]) || 8, A = 1 - Math.pow(0.5, 1 / HL);
const st = {}; const S = (lg, t) => { const k = lg + "|" + t; return (st[k] = st[k] || { n: 0, gf: 1.35, ga: 1.35, sf: 12, sa: 12, tf: 4.3, ta: 4.3, cf: 5, ca: 5, mk: 0 }); };
const upd = (x, k, v) => { if (v !== null && v !== undefined) x[k] += A * (v - x[k]); };
const rows = [];
for (const m of ms) {
  const H = S(m.lg, m.h), W = S(m.lg, m.a);
  if (H.n >= 5 && W.n >= 5 && m.o) rows.push({ m, pk: FQ.marketProbs(m.o, "norm"), x: { g: [H.gf - H.ga, W.gf - W.ga], s: [H.sf - H.sa, W.sf - W.sa], t: [H.tf - H.ta, W.tf - W.ta], c: [H.cf - H.ca, W.cf - W.ca], mk: [H.mk, W.mk] } });
  if (m.o) { const p = FQ.marketProbs(m.o, "norm"); const sup = p[0] - p[2] - 0.16; upd(H, "mk", sup); upd(W, "mk", -sup); }
  upd(H, "gf", m.hg); upd(H, "ga", m.ag); upd(W, "gf", m.ag); upd(W, "ga", m.hg);
  upd(H, "sf", m.hs); upd(H, "sa", m.as); upd(W, "sf", m.as); upd(W, "sa", m.hs);
  upd(H, "tf", m.hst); upd(H, "ta", m.ast); upd(W, "tf", m.ast); upd(W, "ta", m.hst);
  upd(H, "cf", m.hc); upd(H, "ca", m.ac); upd(W, "cf", m.ac); upd(W, "ca", m.hc); H.n++; W.n++;
}
const per = (r) => (r.m.date < "2026-03-01" ? "train" : r.m.date < "2026-07-01" ? "val" : "test");
const R = { train: [], val: [], test: [] }; for (const r of rows) R[per(r)].push(r);
console.log("matchs avec historique et cote", JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length]))));
const feats = (r, set) => set.map((k) => r.x[k][0] - r.x[k][1]);
function fit(rows, set) {
  let w = new Array(set.length).fill(0), a = [0.3, 0, -0.1]; const lr = 0.1;
  const sd = set.map((_, j) => { const v = rows.map((r) => feats(r, set)[j]); const m = v.reduce((x, y) => x + y, 0) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length) || 1; });
  const P = (r) => { const f = feats(r, set); let s = 0; f.forEach((v, j) => (s += (w[j] * v) / sd[j])); const z = [a[0] + s, a[1], a[2] - s]; const mx = Math.max(...z); const e = z.map((x) => Math.exp(x - mx)); const Z = e[0] + e[1] + e[2]; return e.map((x) => x / Z); };
  for (let it = 0; it < 800; it++) {
    const gw = new Array(set.length).fill(0), ga = [0, 0, 0];
    for (const r of rows) { const p = P(r), f = feats(r, set); const y = [0, 0, 0]; y[r.m.k] = 1; for (let j = 0; j < 3; j++) ga[j] += p[j] - y[j]; const ds = p[0] - y[0] - (p[2] - y[2]); f.forEach((v, j) => (gw[j] += (ds * v) / sd[j])); }
    w = w.map((x, j) => x - (lr * gw[j]) / rows.length); a = a.map((x, j) => x - (lr * ga[j]) / rows.length);
  }
  return { P, w: w.map((x, j) => x / sd[j]) };
}
const ll = (p, k) => -Math.log(Math.max(1e-9, p[k]));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const show = (name, P) => {
  const o = [];
  for (const k of ["train", "val", "test"]) { const d = R[k].map((r) => ll(P(r), r.m.k) - ll(r.pk, r.m.k)); const ci = FQ.T.bootRoi(d, 500); o.push(`${k} ${mean(R[k].map((r) => ll(P(r), r.m.k))).toFixed(4)} (écart ${mean(d) >= 0 ? "+" : ""}${mean(d).toFixed(4)} [${ci.map((x) => x.toFixed(4)).join(";")}])`); }
  console.log(name.padEnd(34), o.join("  "));
};
show("marché (B365 avant-match)", (r) => r.pk);
const out = {};
for (const set of [["g"], ["g", "s"], ["g", "t"], ["g", "s", "t", "c"], ["mk"], ["g", "t", "mk"], ["g", "s", "t", "c", "mk"]]) { const M = fit(R.train, set); out[set.join("+")] = M; show("drivers " + set.join("+"), M.P); }
// combinaison avec le marché : les drivers ajoutent-ils quelque chose au marché du jour ?
for (const set of [["g", "s", "t", "c"], ["g", "s", "t", "c", "mk"]]) {
  const M = out[set.join("+")];
  let best = 0, bl = Infinity;
  for (let w = 0; w <= 0.5001; w += 0.05) { const l = mean(R.train.map((r) => { const p = M.P(r); return ll([0, 1, 2].map((i) => w * p[i] + (1 - w) * r.pk[i]), r.m.k); })); if (l < bl) { bl = l; best = Math.round(w * 100) / 100; } }
  show(`marché + drivers ${set.join("+")} (poids ${best})`, (r) => { const p = M.P(r); return [0, 1, 2].map((i) => best * p[i] + (1 - best) * r.pk[i]); });
}
