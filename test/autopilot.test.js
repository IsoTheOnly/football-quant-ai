"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FQ, raw, TRAINED, match, ctxFor } = require("./helpers");
const P = FQ.P;

const now = new Date().toISOString();
const fr = (books, at) => ({ books, at: at || now, first: books, ko: "2026-10-18T15:00:00Z", eventId: "e" });

test("cote de référence : bookmaker choisi, puis médiane FR, puis Bet 365 ; jamais calculée", () => {
  const books = { winamax_fr: [2.05, 3.3, 3.45, null], betclic_fr: [2.0, 3.25, 3.5, null], unibet_fr: [1.98, 3.4, 3.6, null] };
  const bet365 = { h: 2.1, d: 3.4, a: 3.6, src: "Bet 365 via ESPN", at: now };
  const set = { oddsBook: "winamax_fr" };
  let o = P.refOdds(match({ oddsFr: fr(books), odds: bet365 }), set);
  assert.equal(o.h, 2.05); assert.match(o.src, /^Winamax/);
  o = P.refOdds(match({ oddsFr: fr(books), odds: bet365 }), { oddsBook: "pmu_fr" });
  assert.equal(o.h, 2.0); assert.equal(o.a, 3.5); assert.match(o.src, /^médiane/);
  o = P.refOdds(match({ odds: bet365 }), set);
  assert.equal(o.h, 2.1); assert.match(o.src, /aucune cote française/);
  assert.equal(P.refOdds(match({}), set), null, "sans cote relevée : aucune cote");
  // relevé français périmé (> 72 h) et Bet 365 plus récent : Bet 365
  const old = new Date(Date.now() - 4 * 864e5).toISOString();
  o = P.refOdds(match({ oddsFr: fr(books, old), odds: bet365 }), set);
  assert.equal(o.h, 2.1);
});

test("règlement des sélections : 1N2, double chance, BTTS, nombre de buts, buteur", () => {
  assert.equal(P.legWon("1N2", "2", 0, 1), true);
  assert.equal(P.legWon("DC", "N2", 1, 1), true);
  assert.equal(P.legWon("DC", "12", 1, 1), false);
  assert.equal(P.legWon("BTTS", "Non", 2, 0), true);
  assert.equal(P.legWon("Buts", "+2.5", 2, 1), true);
  assert.equal(P.legWon("Buts", "-1.5", 1, 1), false);
  assert.equal(P.legWon("Buteur", "Florian Sotoca", 1, 0, [[0, "Florian Sotoca", "10'", ""]]), true);
  assert.equal(P.legWon("Buteur", "Florian Sotoca", 1, 0, [[0, "Florian Sotoca", "10'", "og"]]), null, "un but contre son camp ne compte pas");
  assert.equal(P.legWon("Buteur", "Florian Sotoca", 1, 0, [[0, "Autre Joueur", "10'", ""]]), null, "non buteur : à vérifier (participation inconnue)");
  assert.equal(P.legWon("Autre", "Corner", 1, 0), null);
});

test("ticket réel : une sélection perdue suffit, buteur non confirmé → à vérifier, match annulé → cote recalculée", () => {
  const m1 = match({ id: "A", hg: 2, ag: 0, status: "TERMINÉ", goals: [[0, "X Y", "5'", ""]] });
  const m2 = match({ id: "B", hg: 1, ag: 1, status: "TERMINÉ" });
  const m3 = match({ id: "C", status: "REPORTÉ" });
  const ctx = ctxFor([m1, m2, m3]);
  const leg = (matchId, market, sel, odds) => ({ matchId, market, sel, odds, status: "EN ATTENTE", date: "2026-10-18" });
  let t = { legs: [leg("A", "1N2", "1", 1.5), leg("B", "1N2", "1", 2)], totalOdds: 3, stake: 10, status: "EN ATTENTE" };
  P.settleTicket(ctx, t, now); assert.equal(t.status, "PERDU"); assert.equal(t.profit, -10);
  t = { legs: [leg("A", "1N2", "1", 1.5), leg("B", "Buteur", "Inconnu", 4)], totalOdds: 6, stake: 10, status: "EN ATTENTE" };
  P.settleTicket(ctx, t, now); assert.equal(t.status, "À VÉRIFIER"); assert.equal(t.profit, 0);
  t = { legs: [leg("A", "1N2", "1", 1.5), leg("C", "1N2", "1", 2)], totalOdds: 3, stake: 10, status: "EN ATTENTE" };
  P.settleTicket(ctx, t, now); assert.equal(t.status, "GAGNÉ"); assert.equal(t.profit, 5);
});

test("CLV : clôture Pinnacle prioritaire, espérance à la clôture correcte", () => {
  const m = match({ closeRef: { h: 2.0, d: 3.6, a: 4.0, src: "Pinnacle à la clôture", final: 1 } });
  const c = P.closingFor(m, "1N2", "1", {}, Date.now());
  const pFair = (1 / 2.0) / (1 / 2.0 + 1 / 3.6 + 1 / 4.0);
  assert.ok(Math.abs(c.pFair - pFair) < 1e-12);
  const v = P.clvOf(2.2, c);
  assert.ok(Math.abs(v.pct - 0.1) < 1e-12);
  assert.ok(Math.abs(v.ev - (2.2 * pFair - 1)) < 1e-12);
  assert.equal(v.final, true);
  assert.equal(P.closingFor(m, "BTTS", "Oui", {}, Date.now()), null, "pas de clôture hors 1N2");
  // provisoire : dernier relevé français, seulement après le coup d'envoi
  const m2 = match({ date: "2026-10-01", time: "15:00 UTC+0", oddsFr: fr({ winamax_fr: [1.9, 3.5, 4.2, null] }, "2026-10-01T12:00:00Z") });
  m2.oddsFr.ko = "2026-10-01T15:00:00Z";
  const c2 = P.closingFor(m2, "1N2", "1", { oddsBook: "winamax_fr" }, Date.parse("2026-10-02T00:00:00Z"));
  assert.equal(c2.odds, 1.9); assert.equal(c2.final, false); assert.match(c2.src, /3 h avant/);
  const m3 = match({ date: "2099-01-01", oddsFr: fr({ winamax_fr: [1.9, 3.5, 4.2, null] }) });
  assert.equal(P.closingFor(m3, "1N2", "1", {}, Date.now()), null, "match pas commencé : pas de clôture");
});

test("tickets : cotes réelles uniquement, une sélection par match, cote totale dans la cible", () => {
  const cands = [];
  for (let i = 0; i < 12; i++) {
    cands.push({ matchId: "m" + i, p: 0.55, odds: 1.7 + i * 0.05, date: "2026-10-18" });
    cands.push({ matchId: "m" + i, p: 0.3, odds: 3.2, date: "2026-10-18" });
    cands.push({ matchId: "m" + i, p: 0.5, odds: null, date: "2026-10-18" }); // sans cote : jamais retenu
  }
  for (const sc of P.SCENARIOS) {
    const t = P.buildTicket(cands, sc, {});
    assert.ok(t, sc.id);
    assert.ok(t.totalOdds >= sc.lo - 1e-9 && t.totalOdds <= sc.hi + 1e-9, `${sc.id} : ${t.totalOdds}`);
    assert.ok(t.legs.every((l) => l.odds > 1));
    assert.equal(new Set(t.legs.map((l) => l.matchId)).size, t.legs.length);
  }
});

test("cycle complet sur les données embarquées : tickets et choix sans cote inventée", () => {
  const r = raw();
  const ds = FQ.ETL.build(r);
  const today = "2026-10-16";
  const matches = FQ.buildMatches(ds, today);
  FQ.TRAINED = TRAINED;
  const state = FQ.emptyState(); state.schemaData = 2;
  const cache = new Map();
  const ctx = { mode: "real", state, matches, matchById: new Map(matches.map((m) => [m.id, m])), today, rulesMap: FQ.RULES,
    getModel: (c, d) => { const k = c + d; if (!cache.has(k)) cache.set(k, FQ.fitModel(matches, c, d)); return cache.get(k); },
    dataVersion: (c) => c, dataAgeDays: 1 };
  const rep = P.runCycle(ctx, "test");
  assert.ok(rep.analysed > 50, "analyses faites");
  for (const p of state.picks) if (p.odds) assert.ok(p.oddsSrc && !/fictive/.test(p.oddsSrc), "toute cote de choix a une source réelle");
  for (const t of state.paperTickets || []) for (const l of t.legs) { assert.ok(l.odds > 1); assert.ok(l.oddsSrc, "jambe sans source"); }
  // idempotence : relancer sans nouvelle donnée ne crée rien de plus
  const n = JSON.stringify([state.picks.length, (state.paperTickets || []).length]);
  P.runCycle(ctx, "test");
  assert.equal(JSON.stringify([state.picks.length, (state.paperTickets || []).length]), n);
});
