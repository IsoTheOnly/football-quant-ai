"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FQ, raw } = require("./helpers");
const E = FQ.ETL;

/** Événement au format du scoreboard ESPN (structure relevée le 16/10/2026) */
const espnEvent = (o) => Object.assign({
  id: "999000001", date: "2026-10-18T13:00Z", season: { year: 2026, slug: "2026-27-english-premier-league" },
  status: { type: { name: "STATUS_FULL_TIME" } },
  competitions: [{
    competitors: [{ homeAway: "home", score: "2", team: { id: "349", displayName: "AFC Bournemouth" } }, { homeAway: "away", score: "1", team: { id: "366", displayName: "Sunderland" } }],
    details: [
      { scoringPlay: true, team: { id: "349" }, clock: { displayValue: "12'" }, athletesInvolved: [{ displayName: "Antoine Semenyo" }] },
      { scoringPlay: true, team: { id: "366" }, clock: { displayValue: "40'" }, penaltyKick: true, athletesInvolved: [{ displayName: "Wilson Isidor" }] },
      { scoringPlay: false, team: { id: "349" }, clock: { displayValue: "55'" } },
      { scoringPlay: true, team: { id: "349" }, clock: { displayValue: "80'" }, athletesInvolved: [{ displayName: "Marcos Senesi" }] },
    ],
    odds: [{ provider: { name: "Bet 365" }, homeTeamOdds: { value: 1.95 }, drawOdds: { value: 3.5 }, awayTeamOdds: { value: 3.6 } }],
  }],
}, o || {});

test("ESPN brut → ligne : équipes, score, buteurs, penalty, cotes", () => {
  const l = E.espnEventToLine(espnEvent());
  assert.equal(l.home, "AFC Bournemouth"); assert.equal(l.away, "Sunderland");
  assert.equal(l.hs, "2"); assert.equal(l.status, "STATUS_FULL_TIME");
  assert.deepEqual(l.goals.map((g) => g[0]), [0, 1, 0]);
  assert.equal(l.goals[1][3], "p");
  assert.deepEqual(l.odds, [1.95, 3.5, 3.6, "Bet 365"]);
});

test("ESPN brut → intégration : équipe inconnue rejetée, cotes ignorées après le match", () => {
  const r = raw();
  r.espn.PL = r.espn.PL || {};
  // deux équipes connues de la compétition, identifiant nouveau
  const known = [...new Set(Object.values(r.espn.PL).flatMap((x) => [x[2], x[3]]))];
  const ev = espnEvent();
  ev.competitions[0].competitors[0].team.displayName = known[0];
  ev.competitions[0].competitors[1].team.displayName = known[1];
  const bad = espnEvent({ id: "999000002" });
  bad.competitions[0].competitors[0].team.displayName = "Équipe Imaginaire";
  bad.competitions[0].competitors[1].team.displayName = "Autre Inconnue";
  const text = E.espnJsonToLines({ events: [ev, bad] });
  const ing = E.ingestFiles(r, [{ name: "PL__2026-10-18", text }], "2026-10-18T20:00:00Z");
  assert.equal(ing.accepted, 1);
  assert.equal(ing.rejected.length, 1);
  assert.equal(ing.odds, 0, "pas de cote enregistrée pour un match terminé");
  assert.equal(r.espn.PL["999000001"][4], 2);
});

test("football-data : clôture de référence = Pinnacle, sinon moyenne", () => {
  const csv = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A,B365CH,B365CD,B365CA,PSCH,PSCD,PSCA,AvgCH,AvgCD,AvgCA\n" +
    "F1,18/10/2026,15:00,Lens,Lyon,1,0,2.1,3.4,3.5,2.0,3.5,3.7,2.05,3.6,3.8,2.0,3.45,3.6\n" +
    "F1,19/10/2026,15:00,Nice,Brest,1,0,2.1,3.4,3.5,2.0,3.5,3.7,,,,2.0,3.45,3.6\n";
  const rows = E.compactFD("mmz4281/2627/F1.csv", csv);
  assert.equal(E.closeRefOf(rows[0]).ref, "PSC");
  assert.equal(E.closeRefOf(rows[0]).h, 2.05);
  assert.equal(E.closeRefOf(rows[1]).ref, "AvgC");
  assert.match(E.closeRefOf(rows[0]).src, /Pinnacle/);
});

const oddsEvent = (o) => Object.assign({
  id: "ev1", commence_time: "2026-10-18T15:00:00Z", home_team: "RC Lens", away_team: "Lyon",
  bookmakers: [
    { key: "winamax_fr", last_update: "2026-10-16T08:00:00Z", markets: [{ key: "h2h", outcomes: [{ name: "RC Lens", price: 2.05 }, { name: "Draw", price: 3.3 }, { name: "Lyon", price: 3.45 }] }] },
    { key: "betclic_fr", last_update: "2026-10-16T08:00:00Z", markets: [{ key: "h2h", outcomes: [{ name: "RC Lens", price: 2.0 }, { name: "Draw", price: 3.25 }, { name: "Lyon", price: 3.5 }] }] },
    { key: "pinnacle", markets: [{ key: "h2h", outcomes: [{ name: "RC Lens", price: 2.2 }, { name: "Draw", price: 3.5 }, { name: "Lyon", price: 3.6 }] }] },
    { key: "unibet_fr", markets: [{ key: "h2h", outcomes: [{ name: "RC Lens", price: 9.0 }, { name: "Draw", price: 9.0 }, { name: "Lyon", price: 9.0 }] }] },
  ],
}, o || {});

test("The Odds API : bookmakers français seulement, marges invraisemblables écartées, pas de cote en direct", () => {
  const r = { oddsFr: {}, feeds: {} };
  const res = E.mergeOddsApi(r, "FL1", [oddsEvent(), oddsEvent({ id: "ev2", commence_time: "2026-10-16T07:00:00Z" })], "2026-10-16T09:00:00Z");
  assert.equal(res.kept, 1); assert.equal(res.live, 1); assert.equal(res.rejected, 1);
  const o = r.oddsFr.ev1;
  assert.deepEqual(Object.keys(o[4]).sort(), ["betclic_fr", "winamax_fr"]);
  assert.deepEqual(o[4].winamax_fr.slice(0, 3), [2.05, 3.3, 3.45]);
  // second relevé : le premier relevé est conservé, la dernière valeur remplace l'ancienne
  const later = oddsEvent(); later.bookmakers[0].markets[0].outcomes[0].price = 1.95;
  E.mergeOddsApi(r, "FL1", [later], "2026-10-17T09:00:00Z");
  assert.equal(r.oddsFr.ev1[4].winamax_fr[0], 1.95);
  assert.equal(r.oddsFr.ev1[6].winamax_fr[0], 2.05);
  // après le coup d'envoi : plus de mise à jour (la dernière valeur sert de clôture)
  const live = oddsEvent(); live.bookmakers[0].markets[0].outcomes[0].price = 1.2;
  E.mergeOddsApi(r, "FL1", [live], "2026-10-18T15:30:00Z");
  assert.equal(r.oddsFr.ev1[4].winamax_fr[0], 1.95);
});

test("The Odds API : rattachement au bon match malgré des noms différents", () => {
  const r = raw();
  const M = FQ.buildMatches(E.build(r), "2026-10-16");
  const target = M.find((m) => m.comp === "FL1" && m.status === "PROGRAMMÉ" && m.date >= "2026-10-16");
  assert.ok(target);
  const ev = oddsEvent({ id: "evX", commence_time: target.date + "T18:00:00Z", home_team: target.home + " FC", away_team: target.away });
  ev.bookmakers[0].markets[0].outcomes[0].name = ev.home_team; ev.bookmakers[0].markets[0].outcomes[2].name = ev.away_team;
  ev.bookmakers = [ev.bookmakers[0]];
  E.mergeOddsApi(r, "FL1", [ev], "2026-10-16T08:00:00Z");
  const M2 = FQ.buildMatches(E.build(r), "2026-10-16");
  const got = M2.find((m) => m.id === target.id);
  assert.ok(got.oddsFr, "relevé rattaché");
  assert.equal(got.oddsFr.books.winamax_fr[0], 2.05);
  assert.equal(M2.filter((m) => m.oddsFr && m.oddsFr.eventId === "evX").length, 1, "rattaché à un seul match");
});

test("reconstruction déterministe : identifiants uniques, aucune date invalide", () => {
  const ds = E.build(raw(), { now: "2026-10-16T00:00:00Z" });
  const M = FQ.buildMatches(ds, "2026-10-16");
  const ids = new Set(M.map((m) => m.id));
  assert.equal(ids.size, M.length);
  assert.ok(M.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date)));
  assert.equal(JSON.stringify(E.build(raw(), { now: "2026-10-16T00:00:00Z" })), JSON.stringify(ds));
});

test("fichiers football-data de la saison en cours", () => {
  assert.ok(E.fdFilesFor("2026-10-16").includes("mmz4281/2627/F1.csv"));
  assert.ok(E.fdFilesFor("2027-03-01").includes("mmz4281/2627/E0.csv"));
  assert.ok(E.fdFilesFor("2027-08-01").includes("mmz4281/2728/E0.csv"));
});
