"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FQ, raw, TRAINED } = require("./helpers");

test("probabilités 1N2 et BTTS cohérentes (somme à 1, bornes)", () => {
  const sm = FQ.scoreMatrix(1.6, 1.1, -0.05, 10);
  const mk = FQ.marketsFromMatrix(sm);
  assert.ok(Math.abs(mk.p1 + mk.pN + mk.p2 - 1) < 1e-6, "1 + N + 2 = 1");
  assert.ok(Math.abs(mk.bttsYes + mk.bttsNo - 1) < 1e-9);
  for (const p of [mk.p1, mk.pN, mk.p2, mk.bttsYes]) assert.ok(p > 0 && p < 1);
  assert.ok(mk.p1 > mk.p2, "l'équipe à λ plus élevé est favorite");
});

test("valeur : cote seuil, espérance, retrait de la marge, Kelly", () => {
  const V = FQ.value;
  assert.equal(V.fairOdds(0.5), 2);
  assert.ok(Math.abs(V.minOdds(0.5, 0.03) - 2.06) < 1e-9);
  assert.ok(Math.abs(V.expectedValue(0.5, 2.2) - 0.1) < 1e-9);
  const dv = V.devig([2.0, 3.4, 3.8]);
  assert.ok(Math.abs(dv.probs.reduce((a, x) => a + x, 0) - 1) < 1e-9, "probabilités sans marge normalisées");
  assert.ok(dv.margin > 0, "marge du bookmaker positive");
  assert.ok(V.kelly(0.4, 2.0) <= 0, "pas de mise sans avantage");
  assert.ok(V.kelly(0.6, 2.0) > 0);
});

test("règlement d'un pari simple : 1N2, BTTS, report", () => {
  const b = (market, selection) => ({ market, selection, stake: 1, odds: 2.5 });
  assert.equal(FQ.settleBet(b("1N2", "1"), { hg: 2, ag: 1 }).status, "GAGNÉ");
  assert.equal(FQ.settleBet(b("1N2", "N"), { hg: 2, ag: 1 }).status, "PERDU");
  assert.equal(FQ.settleBet(b("BTTS", "Oui"), { hg: 1, ag: 1 }).status, "GAGNÉ");
  assert.equal(FQ.settleBet(b("BTTS", "Non"), { hg: 0, ag: 3 }).status, "GAGNÉ");
  assert.equal(FQ.settleBet(b("1N2", "1"), { status: "REPORTÉ" }).status, "ANNULÉ");
  assert.equal(FQ.settleBet(b("1N2", "1"), { hg: 2, ag: 1 }).profit, 1.5);
});

test("modèle ajusté sur les données embarquées : prédiction valide pour une affiche connue", () => {
  const ds = FQ.ETL.build(raw());
  const M = FQ.buildMatches(ds, "2026-10-16");
  const upcoming = M.find((m) => m.comp === "PL" && m.status === "PROGRAMMÉ" && m.date >= "2026-10-16");
  assert.ok(upcoming, "au moins un match de Premier League à venir");
  const model = FQ.fitModel(M, "PL", upcoming.date);
  assert.ok(model.ok, "modèle ajusté");
  const pr = FQ.predictMatch(model, upcoming);
  assert.ok(pr.ok, pr.reason);
  assert.ok(Math.abs(pr.markets.p1 + pr.markets.pN + pr.markets.p2 - 1) < 1e-6);
});

test("entraînement embarqué : apprentissage strictement antérieur à la période de test (pas de fuite)", () => {
  const p = TRAINED.protocol;
  assert.ok(p.trainFrom < p.trainTo && p.trainTo <= p.testFrom, JSON.stringify(p));
});

test("test final figé : la référence historique ne bouge plus", () => {
  assert.equal(FQ.T.FROZEN_TEST_TO, "2026-10-16");
  assert.equal(TRAINED.protocol.testTo, FQ.T.FROZEN_TEST_TO);
  const ref = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "data", "reference_test_2026-10-16.json"), "utf8"));
  assert.equal(ref.protocol.testTo, "2026-10-16");
  assert.ok(Array.isArray(ref.versions) && ref.versions.length >= 1, "chaque version est mesurée sur la même période figée");
});

test("drivers : forces des tirs cadrés et des cotes passées, sans fuite temporelle", () => {
  const ms = [];
  for (let i = 0; i < 30; i++) ms.push({ comp: "X", date: "2026-01-" + String(1 + (i % 28)).padStart(2, "0"), home: "A" + (i % 5), away: "B" + (i % 5), hg: 1, ag: 1, sot: [5, 3], odds: { h: 1.8, d: 3.6, a: 4.5 } });
  const late = { comp: "X", date: "2026-03-01", home: "A0", away: "B0", hg: 9, ag: 0, sot: [30, 0], odds: { h: 1.01, d: 30, a: 50 } };
  const F1 = FQ.fitRatings(ms, "X", "2026-02-15", "sot"), F2 = FQ.fitRatings(ms.concat([late]), "X", "2026-02-15", "sot");
  assert.ok(F1 && Math.abs(F1.att.A0 - F2.att.A0) < 1e-12, "un match postérieur ne change rien");
  const il = FQ.impliedLambdas({ h: 1.8, d: 3.6, a: 4.5 });
  assert.ok(il[0] > il[1], "le favori a plus de buts attendus");
  const c = FQ.combineLambdas(1, 2, { odds: [2, 1] }, { goals: 0.5, sot: 0.5, odds: 0.5 });
  assert.ok(Math.abs(c[0] - Math.sqrt(2)) < 1e-9, "famille absente : poids renormalisés");
});
