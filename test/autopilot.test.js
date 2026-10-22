"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FQ, raw, TRAINED, match, ctxFor } = require("./helpers");
const P = FQ.P;

const now = new Date().toISOString();
const fr = (books, at) => ({ books, at: at || now, first: books, ko: "2026-10-18T15:00:00Z", eventId: "e" });

test("cote de référence : bookmaker choisi, sinon meilleur prix FR, puis Bet 365 ; jamais calculée ; saisie prioritaire", () => {
  const books = { winamax_fr: [2.05, 3.3, 3.45, null], betclic_fr: [2.0, 3.25, 3.5, null], unibet_fr: [1.98, 3.4, 3.6, null] };
  const bet365 = { h: 2.1, d: 3.4, a: 3.6, src: "Bet 365 via ESPN", at: now };
  const set = { oddsBook: "winamax_fr" };
  let o = P.refOdds(match({ oddsFr: fr(books), odds: bet365 }), set);
  assert.equal(o.h, 2.05); assert.match(o.src, /^Winamax/);
  // bookmaker choisi absent du match, ou réglage par défaut : meilleur prix par issue parmi les bookmakers français
  o = P.refOdds(match({ oddsFr: fr(books), odds: bet365 }), { oddsBook: "pmu_fr" });
  assert.equal(o.h, 2.05); assert.equal(o.a, 3.6); assert.match(o.srcs[2], /Unibet/);
  o = P.refOdds(match({ oddsFr: fr(books), odds: bet365 }), {});
  assert.deepEqual([o.h, o.d, o.a], [2.05, 3.4, 3.6]);
  // un bookmaker précis (ticket) : ses cotes à lui, ou rien
  assert.equal(P.refOdds(match({ oddsFr: fr(books) }), {}, "betclic_fr").h, 2.0);
  assert.equal(P.refOdds(match({ oddsFr: fr(books) }), {}, "pmu_fr"), null);
  // cote saisie par Iso : prioritaire et signalée
  const mm = match({ oddsFr: fr(books) });
  const om = P.matchOddsMap(mm, {}, null, null, { [mm.id + "|1N2|1"]: { v: 2.4, at: "2026-10-16" } });
  assert.equal(om["1N2|1"].v, 2.4); assert.ok(om["1N2|1"].user);
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
    for (const l of t.legs) assert.ok(l.why && /Chance retenue/.test(l.why) && /cote juste/.test(l.why), "justification de chaque sélection");
    assert.ok(Array.isArray(t.byN) && t.byN.some((x) => x.n === t.legs.length), "comparaison par nombre de sélections");
    assert.ok(/Méthode/.test(t.why), "méthode expliquée");
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

test("tickets : chance et profit, comparaison par nombre de sélections, prudence sur les désaccords", () => {
  // 3 sélections peu taxées (rendement 0,99) contre 8 favoris très taxés (rendement 0,92) : à cote ~10, 3 sélections gagnent
  const c = [];
  for (let i = 0; i < 3; i++) c.push({ matchId: "a" + i, p: 0.99 / 2.16, odds: 2.16 });
  for (let i = 0; i < 8; i++) c.push({ matchId: "b" + i, p: 0.92 / 1.34, odds: 1.34 });
  const sc = { lo: 9.5, hi: 11, maxLegs: 10, maxLegOdds: 5 };
  const t = P.buildTicket(c, sc, {});
  assert.equal(t.legs.length, 3, "les sélections peu taxées l'emportent");
  assert.ok(t.byN.length >= 2 && t.byN.find((x) => x.n === 3).pJoint >= Math.max(...t.byN.map((x) => x.pJoint)) - 1e-12);
  // même chance, prudence : la sélection où modèle et marché divergent passe derrière
  const q = { mk: 0.45, mo: 0.30 };
  assert.ok(Math.abs(P.robustP(0.45, q, "1N2", 0.5) - 0.375) < 1e-9);
  assert.equal(P.robustP(0.45, { mk: 0.45, mo: 0.45 }, "1N2", 2), 0.45);
  const d = [{ matchId: "x", p: 0.5, pR: 0.42, odds: 2 }, { matchId: "y", p: 0.5, pR: 0.5, odds: 2 }];
  const t2 = P.buildTicket(d, { lo: 1.9, hi: 2.1, maxLegs: 1, maxLegOdds: 3 }, {});
  assert.equal(t2.legs[0].matchId, "y");
  // à chance quasi égale (écart < 10 %), le ticket qui rapporte le plus
  const e = [{ matchId: "u", p: 0.5, odds: 1.9 }, { matchId: "v", p: 0.48, odds: 2.1 }];
  const t3 = P.buildTicket(e, { lo: 1.8, hi: 2.2, maxLegs: 1, maxLegOdds: 3 }, {});
  assert.equal(t3.legs[0].matchId, "v");
});

test("correction apprise par stratégie et choix de la stratégie jouée", () => {
  const saved = FQ.TRAINED;
  // fav45 annonce 20 % et gagne 1 fois sur 20 ; fav55 annonce 18 % et gagne 6 fois sur 20
  FQ.TRAINED = { tickets: { choice: "corrected", scenarios: [{ id: "prudent", arms: {
    fav45: { weeks: Array.from({ length: 20 }, (_, i) => ["w" + i, i < 1 ? 1 : 0, 2, 0.2, 3.5, 0.2]) },
    fav55: { weeks: Array.from({ length: 20 }, (_, i) => ["w" + i, i < 6 ? 1 : 0, 2, 0.18, 3.5, 0.18]) } } }] } };
  const state = FQ.emptyState(); state.settings.ticketPolicy = "favoris";
  const ctx = ctxFor([], state);
  const F = P.armFactors(ctx, "prudent");
  assert.ok(F.fav45.f < 1 && F.fav55.f > 1, JSON.stringify(F));
  const armTk = { fav45: { pJoint: 0.22, pRobust: 0.22, totalOdds: 3.5, legs: [1, 2] }, fav55: { pJoint: 0.2, pRobust: 0.2, totalOdds: 3.5, legs: [1, 2] } };
  const c = P.pickArm(ctx, P.scenarios(state.settings)[1], armTk);
  assert.equal(c.arm.id, "fav55", "la chance corrigée l'emporte sur la chance annoncée");
  assert.ok(/Sans correction/.test(c.reason));
  FQ.TRAINED = saved;
});

test("paris saisis : test ou réel, bilans séparés, anciens paris comptés comme tests", () => {
  const s = FQ.emptyState();
  s.realBets = [{ id: "a", status: "GAGNÉ", stake: 10, profit: 15 }, { id: "b", mode: "reel", status: "PERDU", stake: 5, profit: -5 }];
  assert.equal(P.migrateBets(s), 1);
  assert.equal(s.realBets[0].mode, "test");
  assert.equal(s.realBets.filter(P.isRealBet).length, 1);
  const r = P.betSummary(s.realBets.filter(P.isRealBet)), t = P.betSummary(s.realBets.filter((b) => !P.isRealBet(b)));
  assert.deepEqual([r.done, r.won, r.profit], [1, 0, -5]);
  assert.deepEqual([t.done, t.won, t.profit], [1, 1, 15]);
});

test("contrôle de couverture : matchs analysés, résultats manquants, doublons", () => {
  const ms = [match({ id: "A", date: "2026-10-18" }), match({ id: "B", date: "2026-10-18" }), match({ id: "C", date: "2026-10-12", home: "Nice", away: "Brest", status: "RÉSULTAT MANQUANT" })];
  const s = FQ.emptyState(); s.predictions = [{ matchId: "A", markets: { p1: 0.5, pN: 0.3, p2: 0.2 } }];
  const cov = P.coverageReport(ctxFor(ms, s));
  assert.equal(cov.comps.FL1.dup, 1);
  assert.equal(cov.comps.FL1.up, 1);
  assert.equal(cov.comps.FL1.analysed, 1);
  assert.equal(cov.comps.FL1.missingRes, 1);
  assert.ok(cov.issues.some((x) => x.kind === "doublon") && cov.issues.some((x) => x.kind === "résultat manquant"));
});

test("intervalles de confiance : Wilson et bootstrap", () => {
  const w = FQ.T.wilson(5, 10);
  assert.ok(Math.abs(w[0] - 0.2366) < 0.001 && Math.abs(w[1] - 0.7634) < 0.001);
  assert.equal(FQ.T.wilson(0, 0), null);
  const b = FQ.T.bootRoi([1, -1, 1, -1, 1, -1, 1, -1]);
  assert.ok(b[0] < 0 && b[1] > 0);
});

test("journal des prévisions : un instantané par horizon, jamais réécrit, puis évalué", () => {
  const ko = Date.now() + 4 * 864e5; // dans 4 jours → horizon J-3
  const d = new Date(ko).toISOString().slice(0, 10), t = new Date(ko).toISOString().slice(11, 16);
  const m = match({ id: "F1", date: d, time: t + " UTC+0" });
  const s = FQ.emptyState();
  const pred = { id: "p1", matchId: "F1", createdAt: new Date().toISOString(), markets: { p1: 0.5, pN: 0.3, p2: 0.2 }, modelMarkets: { p1: 0.45, pN: 0.3, p2: 0.25 }, blend: { w: 0, market: [0.5, 0.3, 0.2], src: "Bet 365" }, pick: { market: "1N2", sel: "1", odds: 1.9, kind: "proba" }, reliability: 70 };
  s.predictions = [pred];
  const ctx = ctxFor([m], s);
  assert.equal(P.logForecasts(ctx), 1);
  assert.equal(P.logForecasts(ctx), 0, "pas de doublon pour le même horizon");
  const row = s.forecastLog[0];
  assert.equal(row[4], "J-3");
  assert.deepEqual(row[7], [450, 300, 250]); assert.deepEqual(row[8], [500, 300, 200]); assert.equal(row[10], 0);
  // nouvelle prévision : la ligne existante n'est pas modifiée
  s.predictions.push(Object.assign({}, pred, { id: "p2", markets: { p1: 0.6, pN: 0.25, p2: 0.15 } }));
  P.logForecasts(ctx);
  assert.deepEqual(s.forecastLog[0][9], [500, 300, 200]);
  s.results = { F1: { hg: 2, ag: 0 } };
  const ev = P.forecastEval(s);
  const b = ev.buckets.find((x) => x.b === "J-3");
  assert.equal(b.n, 1); assert.ok(Math.abs(b.llF + Math.log(0.5)) < 1e-9); assert.ok(Math.abs(b.llM + Math.log(0.45)) < 1e-9); assert.equal(b.acc, 1);
  assert.equal(P.flBucket(300), "J-14"); assert.equal(P.flBucket(30), "J-1"); assert.equal(P.flBucket(3), "J-0");
});

test("couverture : une compétition configurée sans match n'est pas présentée comme couverte", () => {
  const cov = P.coverageReport(ctxFor([match({ id: "A", date: "2026-10-18" })], Object.assign(FQ.emptyState(), { predictions: [{ matchId: "A", markets: { p1: 0.5, pN: 0.3, p2: 0.2 } }] })));
  assert.equal(cov.comps.FL1.status, "couverte");
  assert.equal(cov.comps.WC.status, "aucune donnée");
});

test("ticket non admissible : sous l'espérance minimale, aucun ticket affiché, fantômes toujours suivis", () => {
  const r = raw(); const today = "2026-10-16";
  const matches = FQ.buildMatches(FQ.ETL.build(r), today);
  FQ.TRAINED = TRAINED;
  const state = FQ.emptyState(); state.schemaData = 2; state.settings.ticketEvFloor = 0.5; state.settings.ticketEvFloorUser = true; // impossible à atteindre
  const cache = new Map();
  const ctx = { mode: "real", state, matches, matchById: new Map(matches.map((m) => [m.id, m])), today, rulesMap: FQ.RULES,
    getModel: (c, d) => { const k = c + d; if (!cache.has(k)) cache.set(k, FQ.fitModel(matches, c, d)); return cache.get(k); }, dataVersion: (c) => c, dataAgeDays: 1 };
  P.runCycle(ctx, "test");
  assert.equal(state.paperTickets.length, 0);
  assert.ok(Object.values(state.ticketSkip || {}).some((x) => /sous le seuil/.test(x.reason)));
  assert.ok((state.shadowTickets || []).length > 0);
  assert.ok((state.forecastLog || []).length > 50, "journal des prévisions alimenté par le cycle");
});

test("tickets : un seul par semaine et par niveau après fusion de deux cycles parallèles", () => {
  const leg = { matchId: "m1", market: "1N2", sel: "1", odds: 1.5 };
  const a = { id: "tk_a", week: "2026-10-19", scenario: "prudent", status: "EN ATTENTE", frozen: false, legs: [leg], createdAt: "2026-10-22T06:07:34Z", updatedAt: "2026-10-22T07:03:22Z" };
  const b = { id: "tk_b", week: "2026-10-19", scenario: "prudent", status: "EN ATTENTE", frozen: false, legs: [leg], createdAt: "2026-10-22T06:07:44Z", updatedAt: "2026-10-22T06:07:44Z" };
  const c = { id: "tk_c", week: "2026-10-19", scenario: "sur", status: "EN ATTENTE", frozen: false, legs: [leg], createdAt: "2026-10-22T06:07:44Z" };
  const base = FQ.emptyState(), inc = FQ.emptyState();
  base.paperTickets = [a, c]; inc.paperTickets = [b];
  const out = FQ.mergeStates(base, inc).state.paperTickets;
  assert.deepEqual(out.map((t) => t.id).sort(), ["tk_a", "tk_c"]); // le plus récemment mis à jour l'emporte
  // un ticket figé ou réglé l'emporte toujours sur un ticket encore modifiable
  const d = Object.assign({}, b, { id: "tk_d", frozen: true, updatedAt: "2026-10-20T00:00:00Z" });
  assert.deepEqual(FQ.dedupeTickets([a, d]).map((t) => t.id), ["tk_d"]);
  const e = Object.assign({}, b, { id: "tk_e", status: "PERDU", updatedAt: "2026-10-19T00:00:00Z" });
  assert.deepEqual(FQ.dedupeTickets([a, d, e]).map((t) => t.id), ["tk_e"]);
  // semaines différentes : rien n'est retiré
  const f = Object.assign({}, a, { id: "tk_f", week: "2026-10-12" });
  assert.equal(FQ.dedupeTickets([a, f]).length, 2);
});

test("mélange : à moins de 24 h du coup d'envoi, marché seul ; plus tôt, poids appris de la compétition", () => {
  const r = raw(); const today = "2026-10-16";
  const matches = FQ.buildMatches(FQ.ETL.build(r), today);
  FQ.TRAINED = TRAINED;
  const wPL = TRAINED.blend.byComp.PL;
  assert.ok(wPL > 0, "poids du modèle > 0 en PL dans l'entraînement de référence");
  const base = matches.find((m) => m.comp === "PL" && m.status === "PROGRAMMÉ" && m.date > "2026-10-17" && P.probOdds(m));
  assert.ok(base, "un match de PL coté à plus de 24 h");
  const cache = new Map();
  const ctx = { mode: "real", state: FQ.emptyState(), matches, matchById: new Map(matches.map((m) => [m.id, m])), today, rulesMap: FQ.RULES,
    getModel: (c, d) => { const k = c + d; if (!cache.has(k)) cache.set(k, FQ.fitModel(matches, c, d)); return cache.get(k); } };
  const far = P.buildPrediction(ctx, base, {});
  assert.equal(far.pr.blendInfo.w, wPL); assert.equal(far.pr.blendInfo.near, false);
  const near = P.buildPrediction(ctx, Object.assign({}, base, { date: "2026-10-16", time: "20:00 UTC+0" }), {});
  assert.equal(near.pr.blendInfo.w, P.CLOSE_MODEL_W); assert.equal(near.pr.blendInfo.near, true); assert.equal(near.pr.blendInfo.wBase, wPL);
});

test("simulation Claude : coffre à 50 % jusqu'à 400 €, puis tout en jeu ; capital perdu → nouveau parcours, coffre conservé", () => {
  const ms = ["A", "B", "C", "D"].map((k, i) => match({ id: "S" + k, date: "2026-10-1" + (i + 1), status: "TERMINÉ", hg: k === "D" ? 0 : 2, ag: k === "D" ? 1 : 0 }));
  const state = FQ.emptyState(); state.settings = Object.assign({}, FQ.DEFAULT_SETTINGS);
  const ctx = ctxFor(ms, state);
  const tk = (id, matchId, odds, stake, run) => ({ id, status: "EN ATTENTE", frozen: true, legs: [{ matchId, market: "1N2", sel: "1", odds, status: "EN ATTENTE" }], totalOdds: odds, stake, run });
  P.updateClaudeSim(ctx, {});
  const sim = state.claudeSim;
  assert.equal(sim.capital, 100); assert.equal(sim.injected, 100);
  // gain à 2,2 : 220 € → 110 au coffre, 110 en jeu
  sim.tickets.length = 0; sim.tickets.push(tk("t1", "SA", 2.2, 100, 1));
  P.updateClaudeSim(ctx, {});
  assert.equal(sim.capital, 110); assert.equal(sim.runSafe, 110); assert.equal(sim.safe, 110);
  // le coffre s'arrête à 400 € : seulement ce qui manque est retiré
  sim.capital = 200; sim.runSafe = 380; sim.safe = 380; sim.tickets.push(tk("t2", "SB", 2, 200, 1));
  P.updateClaudeSim(ctx, {});
  assert.equal(sim.runSafe, 400); assert.equal(sim.capital, 380);
  // coffre plein : tout reste en jeu
  sim.tickets.push(tk("t3", "SC", 2, 380, 1));
  P.updateClaudeSim(ctx, {});
  assert.equal(sim.capital, 760); assert.equal(sim.runSafe, 400);
  // perte : nouveau parcours à 100 €, coffre total conservé, 200 € mis au total
  sim.tickets.push(tk("t4", "SD", 2, 760, 1));
  P.updateClaudeSim(ctx, {});
  assert.equal(sim.run, 2); assert.equal(sim.capital, 100); assert.equal(sim.runSafe, 0); assert.equal(sim.safe, 400); assert.equal(sim.injected, 200);
  assert.equal(sim.runs[0].result, "capital perdu");
  assert.ok(sim.tickets.every((t) => t.applied), "chaque ticket réglé n'est compté qu'une fois");
  const before = JSON.stringify([sim.capital, sim.safe]); P.updateClaudeSim(ctx, {}); assert.equal(JSON.stringify([sim.capital, sim.safe]), before);
});

test("simulation Claude : match sans cote publiée → cote estimée = cote juste du modèle − 10 %, marquée estimée", () => {
  const m = match({ id: "E1", date: "2026-10-17", time: "15:00 UTC+0", status: "PROGRAMMÉ", odds: null, oddsFr: null });
  const state = FQ.emptyState(); state.settings = Object.assign({}, FQ.DEFAULT_SETTINGS);
  state.predictions = [{ id: "pe", matchId: "E1", reliability: 80, markets: { p1: 0.6, pN: 0.25, p2: 0.15, bttsYes: 0.5, over25: 0.55 } }];
  const ctx = ctxFor([m], state);
  const c = P.claudeSimEstCands(ctx, { start: "2026-10-16", to: "2026-10-19" }, Date.now());
  const home = c.find((x) => x.market === "1N2" && x.sel === "1");
  assert.ok(home && home.estOdds && /aucune cote/.test(home.oddsSrc));
  assert.equal(home.odds, Math.round((0.9 / 0.6) * 100) / 100);
  assert.ok(c.every((x) => Math.abs(x.p * x.odds - 0.9) < 0.01), "rendement 0,90 partout (marge de 10 %)");
  // match coté : pas d'estimation, les vraies cotes sont utilisées
  const m2 = Object.assign({}, m, { id: "E2", odds: { h: 1.6, d: 4, a: 6, src: "Bet 365" } });
  state.predictions.push(Object.assign({}, state.predictions[0], { id: "pe2", matchId: "E2" }));
  const c2 = P.claudeSimEstCands(ctxFor([m2], state), { start: "2026-10-16", to: "2026-10-19" }, Date.now());
  assert.equal(c2.length, 0);
});
