/* =========================================================================
   Jeu de démonstration FICTIF, reproductible (graine fixe).
   Équipes, joueurs, résultats et cotes sont inventés et étiquetés DÉMO.
   Les paris historiques sont générés en faisant tourner le vrai moteur
   en walk-forward sur ces données fictives.
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ;
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function poisson(r, lam) { let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

  const LEAGUES = [
    { code: "PL", tz: "Europe/London", teams: ["Harwick Albion", "Dunmore Rovers", "Kestrel Park", "Ashby Town", "Port Hallam", "Brennock United", "Coldwater City", "Fenmoor Athletic", "Ravensgate", "Thornbury FC"] },
    { code: "FL1", tz: "Europe/Paris", teams: ["AS Orvane", "FC Montclar", "Racing Velaine", "Olympique Sarnac", "Stade Brévin", "US Calmette", "SC Lorvieux", "Girondins d'Aubrac", "AJ Pertuis", "FC Valmorin"] },
    { code: "J1", tz: "Asia/Tokyo", teams: ["Kanazawa Falcons", "Shirakami FC", "Minato Wave", "Hokusei United", "Kagura Tigers", "Tsurugi Rovers", "Asahi Bay", "Nagisa City", "Yamabuki SC", "Kirishima Stars"] },
  ];
  const FIRST = ["Léo", "Ilan", "Marco", "Sami", "Noah", "Kenji", "Tomás", "Yanis", "Elias", "Ruben", "Aaron", "Diego", "Hugo", "Malik", "Oscar", "Rafael", "Timo", "Kaito"];
  const LAST = ["Varenne", "Okoro", "Delmas", "Hartley", "Moreau", "Sato", "Ferreira", "Lindqvist", "Bakary", "Costa", "Nakamura", "Dubreuil", "Ashworth", "Petrov", "Mendes", "Kowal", "Rivera", "Takeda"];

  function generateDemo(today) {
    const r = rng(20261014);
    const players = {};
    const matches = [];
    const odds = {}; // matchId -> {1,N,2,bttsY,bttsN, scorers:{name:odd}, decisive:{name:odd}}
    const results = {}, hidden = {};
    const truth = {};
    for (const L of LEAGUES) {
      const str = {};
      L.teams.forEach((t) => {
        str[t] = { att: (r() - 0.5) * 1.1, def: (r() - 0.5) * 0.9 };
        const pl = [];
        const shares = [0.32, 0.2, 0.14, 0.09, 0.06, 0.04];
        const ash = [0.12, 0.16, 0.14, 0.1, 0.06, 0.05];
        for (let i = 0; i < 6; i++) {
          pl.push({
            name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
            pos: i < 2 ? "ATT" : i < 4 ? "MIL" : "DEF",
            shareGoals: shares[i], shareAssists: ash[i],
            pPlay: i < 3 ? 0.92 : 0.8, minutes: i < 2 ? 78 : 70,
          });
        }
        players[L.code + "|" + t] = pl;
      });
      truth[L.code] = str;
      // calendrier : double aller simple sur 18 journées hebdomadaires, 11 dans le passé, 7 à venir
      const n = L.teams.length;
      const rounds = [];
      const arr = L.teams.slice();
      for (let k = 0; k < n - 1; k++) {
        const pairs = [];
        for (let i = 0; i < n / 2; i++) pairs.push(k % 2 ? [arr[i], arr[n - 1 - i]] : [arr[n - 1 - i], arr[i]]);
        rounds.push(pairs);
        arr.splice(1, 0, arr.pop());
      }
      const all = rounds.concat(rounds.map((p) => p.map(([a, b]) => [b, a])));
      const start = FQ.util.addDays(today, -7 * 11);
      all.slice(0, 18).forEach((pairs, ri) => {
        const d0 = FQ.util.addDays(start, ri * 7);
        pairs.forEach(([h, a], j) => {
          const date = ri === 11 ? today : FQ.util.addDays(d0, j < 3 ? 0 : 1);
          const time = ["15:00", "17:30", "20:00", "14:00", "16:30"][j % 5];
          const id = `DEMO-${L.code}-${date}-${h.slice(0, 6)}-${a.slice(0, 6)}`.replace(/\s/g, "");
          const lh = Math.exp(0.15 + 0.25 + str[h].att + str[a].def), la = Math.exp(0.15 + str[a].att + str[h].def);
          const m = { id, comp: L.code, season: "Démo 2026-27", date, time, tz: L.tz, round: `Journée ${ri + 1}`, home: h, away: a, hg: null, ag: null, goals: null, status: "PROGRAMMÉ", neutral: false, source: "démo fictive", demo: true };
          // cotes fictives : probabilités "vraies" + marge 6 % + bruit
          const sm = FQ.scoreMatrix(lh, la, -0.05, 10); const mk = FQ.marketsFromMatrix(sm);
          const noisy = (p) => Math.max(1.03, Math.round((1 / (p * (1.06) * (0.95 + 0.1 * r()))) * 100) / 100);
          const o = { "1": noisy(mk.p1), N: noisy(mk.pN), "2": noisy(mk.p2), Oui: noisy(mk.bttsYes), Non: noisy(mk.bttsNo), scorers: {}, decisive: {} };
          for (const [side, team, lam] of [[0, h, lh], [1, a, la]]) {
            players[L.code + "|" + team].slice(0, 3).forEach((p) => {
              const pp = FQ.playerProbs(lam, p);
              o.scorers[p.name] = noisy(pp.pScore); o.decisive[p.name] = noisy(pp.pDecisive);
            });
          }
          odds[id] = o;
          if (date <= today) {
            const hg = poisson(r, lh), ag = poisson(r, la);
            const reveal = date < today;
            if (reveal) { m.hg = hg; m.ag = ag; m.status = "TERMINÉ"; }
            const goals = [], assisters = [], played = {};
            for (const [side, team, g] of [[0, h, hg], [1, a, ag]]) {
              const pl = players[L.code + "|" + team];
              pl.forEach((p) => (played[p.name] = r() < p.pPlay));
              for (let x = 0; x < g; x++) {
                const u = r(); let acc = 0, who = null;
                for (const p of pl) { acc += p.shareGoals; if (u < acc && played[p.name]) { who = p; break; } }
                if (!who) { goals.push([side, "Autre joueur", String(5 + Math.floor(r() * 85)), r() < 0.08 ? "og" : ""]); continue; }
                goals.push([side, who.name, String(5 + Math.floor(r() * 85)), ""]);
                const v = r(); let ac2 = 0;
                for (const p of pl) { if (p === who) continue; ac2 += p.shareAssists; if (v < ac2 && played[p.name]) { assisters.push(p.name); break; } }
              }
            }
            if (reveal) m.goals = goals;
            (reveal ? results : hidden)[id] = { hg, ag, status: "TERMINÉ", scorers: goals.map((g) => ({ name: g[1], side: g[0], og: g[3] === "og" })), assisters, assistsKnown: true, played, source: "démo fictive", enteredAt: date + "T22:00:00Z" };
          }
          matches.push(m);
        });
      });
    }
    matches.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { matches, players, odds, results, hidden };
  }

  /**
   * Historique de démonstration : walk-forward du vrai moteur sur les 6 dernières journées passées,
   * avec les cotes fictives ; décisions, mises plafonnées, règlements et journal Q réels.
   */
  function seedDemoHistory(demo, today, settings) {
    const s = settings;
    const bets = [], predictions = [], opportunities = [], qlog = [], audits = [];
    const pastDates = [...new Set(demo.matches.filter((m) => m.date < today).map((m) => m.date))].sort();
    const startIdx = Math.max(0, pastDates.length - 12);
    let qtable = {};
    for (const d of pastDates.slice(startIdx)) {
      const day = demo.matches.filter((m) => m.date === d);
      const masked = demo.matches.map((x) => (x.date < d ? x : Object.assign({}, x, { hg: null, ag: null })));
      const cache = {};
      for (const m of day) {
        const model = cache[m.comp] || (cache[m.comp] = FQ.fitModel(masked, m.comp, d));
        if (!model.ok) continue;
        const pr = FQ.predictMatch(model, m, {});
        if (!pr.ok) continue;
        const rel = FQ.reliability(model, m, {}).score;
        const predId = "pred_demo_" + m.id;
        const o = demo.odds[m.id];
        const sel = [
          { market: "1N2", selection: "1", p: pr.markets.p1, odds: o["1"] },
          { market: "1N2", selection: "N", p: pr.markets.pN, odds: o.N },
          { market: "1N2", selection: "2", p: pr.markets.p2, odds: o["2"] },
          { market: "BTTS", selection: "Oui", p: pr.markets.bttsYes, odds: o.Oui },
          { market: "BTTS", selection: "Non", p: pr.markets.bttsNo, odds: o.Non },
        ];
        predictions.push({
          id: predId, createdAt: d + "T09:00:00Z", matchId: m.id, comp: m.comp, date: m.date, home: m.home, away: m.away,
          lambdaHome: pr.lambdaHome, lambdaAway: pr.lambdaAway, rho: pr.rho, markets: { p1: pr.markets.p1, pN: pr.markets.pN, p2: pr.markets.p2, bttsYes: pr.markets.bttsYes }, raw: pr.raw,
          players: [], reliability: rel, drivers: {}, engineVersion: FQ.ENGINE_VERSION, calibrationVersion: 1, dataSource: "démo fictive", demo: true,
          modelSummary: { mu: model.mu, gamma: model.gamma, rho: model.rho, nMatches: model.nMatches },
        });
        const acctNow = FQ.accounting(bets, s.initialBankroll);
        const result = demo.results[m.id];
        const decs = sel.map((x) => {
          const dec = FQ.decide({ p: x.p, odds: x.odds, rel, market: x.market, s, acct: acctNow, matchExposure: 0, missing: 0, qtable });
          return Object.assign({}, x, dec, { matchId: m.id, score: FQ.riskScore(dec.ev, rel) });
        });
        FQ.exclusiveMarkets(decs);
        for (const x of decs) {
          const oppId = "opp_demo_" + m.id + "_" + x.market + x.selection;
          const opp = { id: oppId, predictionId: predId, matchId: m.id, comp: m.comp, date: m.date, match: `${m.home} – ${m.away}`, market: x.market, selection: x.selection, p: x.p, rel, odds: x.odds, oddsSource: "cote fictive (démo)", status: x.decision === "VALUE BET" ? "pariée" : "passée", exposureShare: acctNow.openStakes / (s.maxTotalPct * acctNow.bankroll), createdAt: d + "T09:00:00Z" };
          opportunities.push(opp);
          if (x.decision === "VALUE BET") {
            const a2 = FQ.accounting(bets, s.initialBankroll);
            const mExp = bets.filter((b) => b.matchId === m.id && b.status === "EN ATTENTE").reduce((a, b) => a + b.stake, 0);
            const st = FQ.computeStake(x.p, x.odds, s, a2, mExp).stake;
            if (st > 0) bets.push({ id: "bet_demo_" + oppId, createdAt: d + "T09:00:00Z", opportunityId: oppId, predictionId: predId, matchId: m.id, comp: m.comp, date: m.date, match: opp.match, market: x.market, selection: x.selection, p: x.p, rel, odds: x.odds, ev: x.ev, stake: st, decision: x.decision, status: "EN ATTENTE", profit: 0, engineVersion: FQ.ENGINE_VERSION, demo: true });
          }
        }
        // audit du match (T+1)
        const settledAt = FQ.util.addDays(d, 1) + "T10:00:00Z";
        bets.filter((b) => b.matchId === m.id && b.status === "EN ATTENTE").forEach((b) => { const st = FQ.settleBet(b, result); b.status = st.status; b.profit = st.profit; b.settledAt = settledAt; b.settleNote = st.note; });
        opportunities.filter((op) => op.matchId === m.id).forEach((op) => {
          const k = FQ.outcomeOf(op.market, op.selection, result);
          let status = op.market === "1N2" ? (["1", "N", "2"][k] === op.selection ? "GAGNÉ" : "PERDU") : ((k === 1) === (op.selection === "Oui") ? "GAGNÉ" : "PERDU");
          const ev = FQ.value.expectedValue(op.p, op.odds);
          if (!(ev > 0)) return;
          const key = FQ.stateKey(op.market, ev, op.rel, op.odds);
          const reward = FQ.unitReward(status, op.odds, op.exposureShare, s.riskKappa);
          const u = FQ.qUpdate(qtable, key, reward, s.agentAlpha);
          qtable = Object.assign({}, qtable, { [key]: u.entry });
          qlog.push({ id: "q_" + op.id, auditId: "audit_demo_" + m.id, t: settledAt, key, action: op.status === "pariée" ? "PRENDRE" : "PASSER (contrefactuel)", reward, old: u.old, new: u.nq, alpha: s.agentAlpha, version: FQ.ENGINE_VERSION });
        });
        audits.push({ id: "audit_demo_" + m.id, matchId: m.id, at: settledAt, result, settled: bets.filter((b) => b.matchId === m.id).map((b) => b.id) });
      }
    }
    return { bets, predictions, opportunities, qlog, audits };
  }

  FQ.demo = { generateDemo, seedDemoHistory };
})(typeof window !== "undefined" ? window : globalThis);
