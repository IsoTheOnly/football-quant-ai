/* Chargement des modules (ils s'attachent à globalThis.FQ) et données de référence pour les tests. */
"use strict";
const path = require("path"), fs = require("fs"), zlib = require("zlib");
const SRC = path.join(__dirname, "..", "src");
for (const f of ["engine.js", "standings.js", "core.js", "autopilot.js", "etl2.js", "train2.js"]) require(path.join(SRC, f));
const FQ = globalThis.FQ;
// Horloge figée sur la date des données de référence (16/10/2026) : sans cela, les coups d'envoi des rencontres
// embarquées deviennent passés avec le temps et les tests de tickets ou de couverture échouent sans régression réelle.
const FIXED_NOW = Date.parse("2026-10-16T10:00:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(FIXED_NOW); }
  static now() { return FIXED_NOW; }
};

let rawCache = null;
/** Copie fraîche du magasin brut embarqué dans le dépôt */
function raw() {
  if (!rawCache) rawCache = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "data", "snapshot.json.gz"))).toString("utf8");
  return JSON.parse(rawCache);
}
const TRAINED = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "trained.json"), "utf8"));

/** Rencontre minimale pour les tests unitaires */
function match(extra) {
  return Object.assign({ id: "M1", comp: "FL1", season: "2026-27", date: "2026-10-18", time: "15:00 UTC+0", tz: "Europe/Paris", round: "Saison régulière",
    home: "Lens", away: "Lyon", hg: null, ag: null, goals: null, status: "PROGRAMMÉ", odds: null, oddsFr: null, closeRef: null }, extra || {});
}
/** Contexte d'exécution réel minimal autour d'une liste de rencontres */
function ctxFor(matches, state) {
  const s = state || FQ.emptyState();
  return { mode: "real", state: s, matches, matchById: new Map(matches.map((m) => [m.id, m])), today: "2026-10-16", rulesMap: FQ.RULES };
}
module.exports = { FQ, raw, TRAINED, match, ctxFor };
