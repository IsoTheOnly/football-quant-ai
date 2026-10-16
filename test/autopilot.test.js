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
  // gagne ou 2 buts d'avance : 2-0 à la 30e puis 2-2 → gagné ; 1-0 puis 1-1 → perdu
  assert.equal(P.legWon("W2", "1", 2, 2, [[0, "a", "10'", ""], [0, "b", "30'", ""], [1, "c", "60'", ""], [1, "d", "90'+2'", ""]]), true);
  assert.equal(P.legWon("W2", "1", 1, 1, [[0, "a", "10'", ""], [1, "c", "60'", ""]]), false);
  assert.equal(P.legWon("W2", "2", 0, 3, null), true);
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

test("retrait de marge par la puissance : favoris relevés, outsiders abaissés, somme à 1", () => {
  const o = [1.3, 5.5, 9];
  const pw = FQ.marketProbs(o, "power"), nm = FQ.marketProbs(o, "norm");
  assert.ok(Math.abs(pw.reduce((a, x) => a + x, 0) - 1) < 1e-9);
  assert.ok(pw[0] > nm[0] && pw[2] < nm[2]);
});

test("stratégies « favoris » : seule l'issue la plus probable, au-dessus du seuil ; politique « favoris » respectée", () => {
  const c = (matchId, sel, p, top, market) => ({ matchId, sel, p, top, market: market || "1N2" });
  const cands = [c("a", "1", 0.62, true), c("a", "N", 0.22, false), c("a", "2", 0.16, false), c("b", "1", 0.30, false), c("b", "N", 0.28, false), c("b", "2", 0.42, true),
    c("a", "1N", 0.84, false, "DC"), c("b", "N2", 0.70, false, "DC"), c("b", "+2.5", 0.55, false, "Buts")];
  const arm = (id) => P.TICKET_ARMS.find((a) => a.id === id);
  assert.deepEqual(P.armCands(cands, arm("fav55")).map((c) => c.matchId + c.sel), ["a1"]);
  assert.deepEqual(P.armCands(cands, arm("fav45")).map((c) => c.matchId + c.sel), ["a1"]);
  assert.ok(P.armCands(cands, arm("chance_v")).every((c) => c.sel !== "N"));
  assert.equal(P.armCands(cands, arm("chance")).length, 6, "stratégies 1N2 : pas d'autre marché");
  assert.deepEqual(P.armCands(cands, arm("securise")).map((x) => x.market + x.sel).sort(), ["DC1N", "DCN2"], "sécurisé : tous marchés, ≥ 70 %");
  assert.ok(P.armCands(cands, arm("multi")).some((x) => x.market === "Buts"));
  assert.equal(P.allowedArms({ ticketPolicy: "auto" }).length, P.TICKET_ARMS.length);
});

test("choix de stratégie : semaines rejouées à demi-poids, semaines réelles en entier", () => {
  const saved = FQ.TRAINED;
  FQ.TRAINED = { tickets: { scenarios: [{ id: "prudent", arms: {
    fav45: { weeks: Array.from({ length: 20 }, (_, i) => ["w" + i, i < 4 ? 1 : 0]) },
    fav55: { weeks: Array.from({ length: 20 }, (_, i) => ["w" + i, i < 8 ? 1 : 0]) } } }] } };
  const state = FQ.emptyState(); state.settings.ticketPolicy = "favoris"; // limité aux favoris pour isoler fav45 / fav55
  const ctx = ctxFor([], state);
  assert.equal(P.chooseArm(ctx, "prudent").arm.id, "fav55");
  // 6 semaines réelles perdues pour fav55, gagnées pour fav45 : le choix bascule
  state.shadowTickets = [];
  for (let i = 0; i < 6; i++) {
    state.shadowTickets.push({ scenario: "prudent", arm: "fav55", status: "PERDU", week: "x" + i, legs: [] });
    state.shadowTickets.push({ scenario: "prudent", arm: "fav45", status: "GAGNÉ", week: "x" + i, legs: [] });
  }
  assert.equal(P.chooseArm(ctx, "prudent").arm.id, "fav45");
  FQ.TRAINED = saved;
});

test("cycle réel : tickets justifiés, stratégie notée, fantômes suivis pour chaque stratégie", () => {
  const r = raw(); const today = "2026-10-16";
  const matches = FQ.buildMatches(FQ.ETL.build(r), today);
  FQ.TRAINED = TRAINED;
  const state = FQ.emptyState(); state.schemaData = 2;
  const cache = new Map();
  const ctx = { mode: "real", state, matches, matchById: new Map(matches.map((m) => [m.id, m])), today, rulesMap: FQ.RULES,
    getModel: (c, d) => { const k = c + d; if (!cache.has(k)) cache.set(k, FQ.fitModel(matches, c, d)); return cache.get(k); }, dataVersion: (c) => c, dataAgeDays: 1 };
  P.runCycle(ctx, "test");
  for (const t of state.paperTickets) {
    assert.ok(t.strategy && t.why, "stratégie et justification du ticket");
    for (const l of t.legs) assert.ok(l.why && /estimé/.test(l.why), "justification de chaque sélection");
    const arm = P.TICKET_ARMS.find((a) => a.id === t.strategy);
    if (arm.top) {
      const preds = new Map(state.predictions.map((p) => [p.matchId, p]));
      for (const l of t.legs) { const m = preds.get(l.matchId).markets; const p3 = [m.p1, m.pN, m.p2]; assert.equal(["1", "N", "2"][p3.indexOf(Math.max(...p3))], l.sel, "sélection = issue favorite"); }
    }
  }
  const arms = new Set((state.shadowTickets || []).map((t) => t.arm));
  assert.ok(arms.size >= 3, "plusieurs stratégies suivies en fantôme");
});

test("Multiboost : barème de départ, interpolation, apprentissage sur les tickets Betclic saisis", () => {
  const t0 = P.boostTable({ realBets: [] });
  assert.ok(Math.abs(P.boostFor(t0, 13) - 0.0774) < 1e-9);
  assert.equal(P.boostFor(t0, 4), 0, "pas de boost sous 5 sélections");
  const b9 = P.boostFor(t0, 9); assert.ok(b9 > 0.0468 && b9 < 0.062);
  const legs = Array.from({ length: 6 }, () => ({ odds: 1.3 })); const prod = Math.pow(1.3, 6);
  const t1 = P.boostTable({ realBets: [{ bookmaker: "Betclic", legs, totalOdds: prod * 1.05 }] });
  assert.ok(Math.abs(P.boostFor(t1, 6) - 0.05) < 1e-6, "bonus observé sur un vrai ticket");
  // le constructeur de tickets tient compte du bonus pour viser la fourchette
  const cands = Array.from({ length: 14 }, (_, i) => ({ matchId: "m" + i, p: 0.78, odds: 1.3 }));
  const sc = { lo: 31.5, hi: 34, maxLegs: 15, maxLegOdds: 3 }; // 13 × 1,30 = 30,3 avant boost, 32,6 après
  const tk = P.buildTicket(cands, sc, { boost: (n) => P.boostFor(t0, n) });
  assert.ok(tk && tk.totalOdds >= 31.5 && tk.totalOdds <= 34 && tk.rawOdds < 31.5, `cote ${tk && tk.totalOdds}`);
  assert.equal(tk.legs.length, 13);
});

test("double chance : cote déduite du 1N2 réel, corrigée par les cotes réelles saisies", () => {
  const dc = P.dcOdds({ h: 1.5, d: 4.2, a: 6.5 }, 1);
  assert.equal(dc["1N"], Math.floor(100 / (1 / 1.5 + 1 / 4.2)) / 100);
  const st = { realBets: [{ legs: [1.12, 1.25, 1.3].map((x) => ({ market: "DC", odds: x * 1.02, estOdds: x })) }] };
  assert.equal(P.learnDcFactor(st).dcFactor, 1.02);
});
