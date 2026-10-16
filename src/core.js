/* =========================================================================
   FOOTBALL QUANT AI — état, persistance, logique applicative (sans UI)
   ========================================================================= */
(function (root) {
  "use strict";
  const FQ = root.FQ;
  const U = FQ.util;

  /* ------------------------------------------------------------ état */
  function emptyState(settings) {
    return {
      schema: 1,
      settings: Object.assign({}, FQ.DEFAULT_SETTINGS, settings || {}),
      predictions: [],     // snapshots immuables
      opportunities: [],   // sélections analysées (cotes modifiables tant qu'ouvertes)
      bets: [],            // registre
      results: {},         // matchId -> résultat saisi / importé
      audits: [],          // validations T+1
      qlog: [],            // journal de l'agent (la Q-table est rejouée depuis ce journal)
      calibration: pretrainedCalibration(),
      userMatches: [],     // rencontres saisies manuellement
      players: {},         // "COMP|Équipe" -> [joueurs saisis]
      backtests: [],       // résultats de backtests réalisés
      picks: [],           // choix préférentiels (un par match), suivis automatiquement
      paperTickets: [],    // tickets combinés fictifs (3 scénarios de risque), en unités
      realBets: [],        // paris réellement joués, saisis par l'utilisateur (euros)
      log: [],             // journal d'activité
    };
  }
  FQ.emptyState = emptyState;

  /** Calibration de départ : celle apprise hors ligne sur l'historique (si elle a amélioré le test), sinon neutre */
  function pretrainedCalibration() {
    const c = FQ.TRAINED && FQ.TRAINED.calibration;
    return { version: 1, T1N2: c ? c.T1N2 : 1, TBTTS: c ? c.TBTTS : 1, bttsAB: c ? c.bttsAB || null : null, TPLAYER: 1, history: [], pretrained: !!c, pretrainedAt: FQ.TRAINED ? FQ.TRAINED.generatedAt : null };
  }
  FQ.pretrainedCalibration = pretrainedCalibration;

  /** La Q-table part du prior appris sur l'historique (opportunités réelles, cotes Bet365), puis rejoue le journal en direct */
  function qtableFromLog(qlog) {
    let q = JSON.parse(JSON.stringify((FQ.TRAINED && FQ.TRAINED.qprior) || {}));
    for (const e of qlog) {
      const u = FQ.qUpdate(q, e.key, e.reward, e.alpha);
      q[e.key] = u.entry;
    }
    return q;
  }
  FQ.qtableFromLog = qtableFromLog;

  /** Validation d'un état importé */
  function validateState(s) {
    const errs = [];
    if (!s || typeof s !== "object") return ["Fichier vide ou non JSON"];
    if (s.schema !== 1) errs.push("Version de schéma inconnue");
    for (const k of ["predictions", "opportunities", "bets", "audits", "qlog", "userMatches", "backtests"]) if (!Array.isArray(s[k])) errs.push(`Champ « ${k} » manquant ou invalide`);
    if (s && !Array.isArray(s.picks)) s.picks = [];
    if (s && !Array.isArray(s.paperTickets)) s.paperTickets = [];
    if (s && !Array.isArray(s.realBets)) s.realBets = [];
    if (!s.settings || typeof s.settings !== "object") errs.push("Paramètres manquants");
    if (Array.isArray(s.bets)) s.bets.forEach((b, i) => {
      if (!b.id || !U.isNum(b.stake) || !U.isNum(b.odds) || b.stake < 0 || b.odds <= 1) errs.push(`Pari n°${i + 1} invalide`);
    });
    return errs.slice(0, 12);
  }
  FQ.validateState = validateState;

  function mergeStates(cur, inc) {
    const out = JSON.parse(JSON.stringify(cur));
    let added = 0, dup = 0;
    for (const k of ["predictions", "opportunities", "bets", "audits", "qlog", "userMatches", "backtests", "picks"]) {
      out[k] = out[k] || [];
      const ids = new Set(out[k].map((x) => x.id));
      for (const x of inc[k] || []) { if (ids.has(x.id)) dup++; else { out[k].push(x); ids.add(x.id); added++; } }
    }
    // tickets et paris réels : la version modifiée le plus récemment l'emporte (saisies faites pendant un cycle de la tâche)
    for (const k of ["paperTickets", "realBets"]) {
      out[k] = out[k] || [];
      for (const x of inc[k] || []) {
        const i = out[k].findIndex((y) => y.id === x.id);
        if (i < 0) { if (!(k === "realBets" && (out.deletedReal || []).includes(x.id))) { out[k].push(x); added++; } }
        else if ((x.updatedAt || x.createdAt || "") > (out[k][i].updatedAt || out[k][i].createdAt || "")) out[k][i] = x;
        else dup++;
      }
    }
    out.deletedReal = Array.from(new Set((out.deletedReal || []).concat(inc.deletedReal || [])));
    out.realBets = (out.realBets || []).filter((x) => !out.deletedReal.includes(x.id));
    for (const [id, r] of Object.entries(inc.results || {})) { if (out.results[id]) dup++; else { out.results[id] = r; added++; } }
    for (const [k, v] of Object.entries(inc.players || {})) if (!out.players[k]) out.players[k] = v;
    return { state: out, added, dup };
  }
  FQ.mergeStates = mergeStates;

  /* ------------------------------------------------------------ persistance */
  const CHUNK = 150000;
  /** gzip + base64 (navigateur : CompressionStream ; Node : zlib) */
  FQ.gz = {
    async unpack(b64) {
      if (typeof root.DecompressionStream === "function") {
        const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const ds = new DecompressionStream("gzip"); const w = ds.writable.getWriter(); w.write(u); w.close();
        return await new Response(ds.readable).text();
      }
      if (typeof require === "function") return require("zlib").gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
      throw new Error("décompression indisponible");
    },
    pack(txt) { return require("zlib").gzipSync(Buffer.from(txt, "utf8"), { level: 9 }).toString("base64"); },
    async packAsync(txt) {
      if (typeof root.CompressionStream === "function") {
        const cs = new CompressionStream("gzip"); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(txt)); w.close();
        const u = new Uint8Array(await new Response(cs.readable).arrayBuffer());
        let bin = ""; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return btoa(bin);
      }
      if (typeof require === "function") return this.pack(txt);
      return null;
    },
  };
  const Persist = {
    db: null, user: null, uid: null, downloads: null, ready: false, kind: "mémoire",
    async init() {
      const lsOk = (() => { try { localStorage.setItem("fq_probe", "1"); localStorage.removeItem("fq_probe"); return true; } catch (e) { return false; } })();
      this.ls = lsOk;
      this.kind = lsOk ? "navigateur (local)" : "mémoire seulement";
      try {
        if (root.claude && typeof root.claude.use === "function") {
          const timeout = (pr) => Promise.race([pr, new Promise((r) => setTimeout(() => r(null), 4000))]);
          const [db, user, dl] = await Promise.all([timeout(root.claude.use("db")), timeout(root.claude.use("user")), timeout(root.claude.use("downloads"))]);
          this.downloads = dl || null;
          if (db && user) {
            const id = await user.id();
            if (id) { this.db = db; this.user = user; this.uid = id; this.kind = "base privée (serveur)"; }
            try { this.owner = await user.isOwner(); } catch (e) { this.owner = false; }
            if (this.db && this.owner) this.kind = "base de l'artefact (propriétaire), partagée avec la tâche planifiée";
          }
        }
      } catch (e) { /* capacité absente : repli */ }
      this.ready = true;
      return this.kind;
    },
    path(mode, part) { return `data/users/${this.uid}/fq_${mode}_${part}`; },
    async load(mode) {
      if (this.db && mode === "real") {
        try {
          const meta = await this.db.doc(this.path(mode, "meta")).get();
          if (meta.exists) {
            const m = meta.data();
            const parts = await Promise.all(Array.from({ length: m.n }, (_, i) => this.db.doc(this.path(mode, "c" + i)).get()));
            const txt = parts.map((p) => (p.exists ? p.data().s : "")).join("");
            if (txt.length === m.len) return { state: JSON.parse(txt), from: "base privée", savedAt: m.savedAt };
          }
        } catch (e) { /* repli */ }
      }
      if (this.ls) {
        try { const t = localStorage.getItem("fq_state_" + mode); if (t) return { state: JSON.parse(t), from: "navigateur" }; } catch (e) {}
      }
      return null;
    },
    async save(mode, state) {
      const txt = JSON.stringify(state);
      let where = [];
      if (this.ls) { try { localStorage.setItem("fq_state_" + mode, txt); where.push("navigateur"); } catch (e) {} }
      if (this.shared && mode === "real") {
        try { where.push(...(await this.saveShared(state))); }
        catch (e) { throw new Error(`base de l'artefact indisponible en écriture (${(e && (e.code || e.message)) || "erreur"}) — copie locale conservée`); }
        return where;
      }
      if (this.db && mode === "real") {
       try {
        const n = Math.max(1, Math.ceil(txt.length / CHUNK));
        let prevN = 0;
        try { const meta = await this.db.doc(this.path(mode, "meta")).get(); if (meta.exists) prevN = meta.data().n || 0; } catch (e) {}
        for (let i = 0; i < n; i++) await this.db.doc(this.path(mode, "c" + i)).set({ s: txt.slice(i * CHUNK, (i + 1) * CHUNK) });
        await this.db.doc(this.path(mode, "meta")).set({ n, len: txt.length, savedAt: new Date().toISOString(), engine: FQ.ENGINE_VERSION });
        for (let i = n; i < prevN; i++) { try { await this.db.doc(this.path(mode, "c" + i)).delete(); } catch (e) {} }
        where.push("base privée");
       } catch (e) {
        const code = (e && (e.code || e.message)) || "erreur";
        throw new Error(`base privée indisponible en écriture (${code}) — copie locale conservée`);
       }
      }
      return where;
    },
    async clear(mode) {
      if (this.ls) { try { localStorage.removeItem("fq_state_" + mode); } catch (e) {} }
      if (this.db && mode === "real") {
        try {
          const meta = await this.db.doc(this.path(mode, "meta")).get();
          const n = meta.exists ? meta.data().n : 0;
          for (let i = 0; i < n; i++) await this.db.doc(this.path(mode, "c" + i)).delete();
          await this.db.doc(this.path(mode, "meta")).delete();
        } catch (e) {}
      }
    },
    /* ---- stockage partagé page / tâche planifiée : collection « auto » (propriétaire seul) ---- */
    tab: Math.random().toString(36).slice(2, 10),
    meta: null,
    get shared() { return !!(this.db && this.owner); },
    async readChunks(ids) {
      const parts = await Promise.all(ids.map((id) => this.db.doc("auto/" + id).get()));
      if (!parts.every((p) => p.exists)) return null;
      return parts.map((p) => p.data().s).join("");
    },
    async loadShared() {
      const m = await this.db.doc("auto/meta").get();
      if (!m.exists) return null;
      const meta = m.data();
      let state = null, raw = null, trained = null;
      if (Array.isArray(meta.stateChunks) && meta.schemaData === 2) { const t = await this.readChunks(meta.stateChunks); if (t && t.length === meta.stateLen) state = JSON.parse(meta.stateGz ? await FQ.gz.unpack(t) : t); }
      try { if (Array.isArray(meta.rawChunks)) { const t = await this.readChunks(meta.rawChunks); if (t && t.length === meta.rawLen) raw = JSON.parse(await FQ.gz.unpack(t)); } } catch (e) { raw = null; }
      try { if (Array.isArray(meta.trainChunks)) { const t = await this.readChunks(meta.trainChunks); if (t && t.length === meta.trainLen) trained = JSON.parse(await FQ.gz.unpack(t)); } } catch (e) { trained = null; }
      this.meta = meta;
      return { meta, state, raw, trained };
    },
    /** Collecte sans code déposée par la tâche planifiée : documents { kind: "inbox", files: { "COMP__AAAA-MM-JJ": lignes JSON } } */
    async loadInbox() {
      if (!this.shared) return [];
      try { const q = await this.db.collection("auto").where("kind", "==", "inbox").get(); return q.docs.map((d) => ({ id: d.id, data: d.data() })).filter((d) => d.data && d.data.files); }
      catch (e) { return []; }
    },
    pendingShared: null,
    async saveShared(state) {
      const plain = JSON.stringify(state);
      let gzTxt = null; try { gzTxt = await FQ.gz.packAsync(plain); } catch (e) { gzTxt = null; }
      const txt = gzTxt || plain;
      // relire le document de pilotage pour ne jamais écraser les données ou l'entraînement écrits par la tâche planifiée
      let cur = this.meta || {};
      try { const m = await this.db.doc("auto/meta").get(); if (m.exists) cur = m.data(); } catch (e) {}
      if (this.meta && cur.rev > this.meta.rev && cur.by !== "page") { const err = new Error("la tâche planifiée vient d'écrire : rechargement avant sauvegarde"); err.code = "stale"; throw err; }
      const rev = Math.max(cur.rev || 0, (this.meta && this.meta.rev) || 0) + 1;
      const chunks = FQ.P.chunkText(txt);
      const ids = chunks.map((_, i) => `s${rev}_${i}`);
      for (let i = 0; i < ids.length; i++) await this.db.doc("auto/" + ids[i]).set({ s: chunks[i] });
      const meta = Object.assign({}, cur, { rev, stateChunks: ids, stateLen: txt.length, stateGz: !!gzTxt, schemaData: 2, updatedAt: new Date().toISOString(), by: "page", tab: this.tab });
      // magasin brut enrichi par la collecte (boîte de réception) et plan de collecte, écrits avec l'état
      const pend = this.pendingShared; this.pendingShared = null;
      const oldExtra = [];
      try {
        if (pend && pend.raw) {
          const rz = await FQ.gz.packAsync(JSON.stringify(pend.raw));
          if (rz) {
            const rc = FQ.P.chunkText(rz), rids = rc.map((_, i) => `r${rev}_${i}`);
            for (let i = 0; i < rids.length; i++) await this.db.doc("auto/" + rids[i]).set({ s: rc[i] });
            oldExtra.push(...(cur.rawChunks || []).filter((id) => !rids.includes(id)));
            Object.assign(meta, { rawChunks: rids, rawLen: rz.length, rawAt: new Date().toISOString() });
          }
        }
        if (pend && pend.plan) {
          const pid = `plan_p${rev}`;
          await this.db.doc("auto/" + pid).set(pend.plan);
          if (cur.planDoc && cur.planDoc !== pid) oldExtra.push(cur.planDoc);
          Object.assign(meta, { planDoc: pid, planAt: pend.plan.updatedAt });
        }
      } catch (e) { this.pendingShared = Object.assign({}, pend, this.pendingShared); throw e; }
      await this.db.doc("auto/meta").set(meta);
      const old = (cur.stateChunks || []).filter((id) => !ids.includes(id)).concat(oldExtra, (pend && pend.inboxIds) || []);
      this.meta = meta;
      for (const id of old) { try { await this.db.doc("auto/" + id).delete(); } catch (e) {} }
      return ["base de l'artefact"];
    },
    subscribeMeta(fn) {
      if (!this.shared) return () => {};
      try { return this.db.doc("auto/meta").onSnapshot((snap) => { if (snap.exists) fn(snap.data()); }, () => {}); } catch (e) { return () => {}; }
    },
    pref(k, v) {
      if (!this.ls) return v;
      try { if (v === undefined) return localStorage.getItem("fq_pref_" + k); localStorage.setItem("fq_pref_" + k, v); } catch (e) {}
      return v;
    },
    /** Proposer un fichier : capacité downloads, sinon null (l'UI affiche le contenu à copier) */
    async offerFile(filename, data) {
      if (!this.downloads) return { ok: false, code: "unavailable" };
      try { const r = await this.downloads.save({ filename, data }); return { ok: true, r }; } catch (e) { return { ok: false, code: e && e.code }; }
    },
  };
  FQ.Persist = Persist;

  /* ------------------------------------------------------------ données de match */
  /** Applique les résultats saisis (sans modifier la source) et ajoute les matchs manuels */
  function mergeMatches(base, state, today) {
    const res = state.results || {};
    const out = base.map((m) => {
      const r = res[m.id];
      if (!r) return m;
      if (r.status === "REPORTÉ" || r.status === "ANNULÉ") return Object.assign({}, m, { hg: null, ag: null, status: r.status, resultSource: r.source });
      if (m.hg !== null && !r.overrideScore) return Object.assign({}, m, { resultSource: m.source });
      return Object.assign({}, m, { hg: r.hg, ag: r.ag, status: "TERMINÉ", resultSource: r.source || "saisie utilisateur",
        goals: r.scorers ? r.scorers.map((g) => [g.side, g.name, "", g.og ? "og" : ""]) : m.goals });
    });
    for (const um of state.userMatches || []) {
      const r = res[um.id];
      const m = Object.assign({ hg: null, ag: null, goals: null, source: "saisie utilisateur" }, um);
      if (r && r.status === "TERMINÉ") Object.assign(m, { hg: r.hg, ag: r.ag });
      m.status = m.hg !== null ? "TERMINÉ" : r && r.status !== "TERMINÉ" ? r.status : m.date < today ? "RÉSULTAT MANQUANT" : "PROGRAMMÉ";
      out.push(m);
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || "") < (b.time || "") ? -1 : 1));
    return out;
  }
  FQ.mergeMatches = mergeMatches;

  /** Couverture réelle par compétition (pour l'onglet données et le calendrier) */
  function coverage(dataset, matches, today) {
    const out = {};
    for (const c of dataset.competitions) {
      const ms = matches.filter((m) => m.comp === c.code && !m.manual);
      const played = ms.filter((m) => m.hg !== null);
      const last = played.length ? played[played.length - 1].date : null;
      const upcoming = ms.filter((m) => m.date >= today && m.status !== "TERMINÉ");
      const missing = ms.filter((m) => m.status === "RÉSULTAT MANQUANT").length;
      const seasons = c.seasons.map((s) => s.season);
      let level, note;
      const curSeason = seasons[seasons.length - 1];
      if (upcoming.length && last && U.daysBetween(last, today) <= 45) { level = missing > 10 ? "partielle" : "bonne"; }
      else if (upcoming.length) { level = "partielle"; }
      else level = "historique seulement";
      const notes = {
        CL: "ESPN : phase de ligue et phases finales, 2024-25 à 2026-27. Cotes Bet 365 des matchs à venir quand ESPN les publie.",
        WC: "Édition 2026 terminée (finale le 19/07/2026). Prochaine phase finale en 2030 : aucune rencontre programmée.",
        J1: "ESPN : saisons 2024, 2025, saison spéciale 2026 (février-juin) et 2026-27. Cotes historiques de clôture football-data.co.uk.",
        SPL: "ESPN : saisons 2024-25 à 2026-27 avec buteurs. Pas de cotes historiques gratuites.",
        SSL: "ESPN ne couvre plus la Suisse depuis septembre 2025 : résultats et cotes de clôture football-data.co.uk, calendrier 2026-27 openfootball (22 premières journées publiées).",
        BSA: "ESPN : saisons 2024 à 2026 avec buteurs ; cotes de clôture football-data.co.uk.",
      };
      note = notes[c.code] || `ESPN : calendrier ${curSeason} complet, résultats et buteurs jusqu'au ${last ? last.split("-").reverse().join("/") : "—"} ; cotes d'avant-match et de clôture football-data.co.uk ; cotes Bet 365 des matchs à venir via ESPN.`;
      out[c.code] = { code: c.code, name: c.name, country: c.country, tz: c.tz, seasons, matches: ms.length, played: played.length, last, upcoming: upcoming.length, missing, level, note,
        scorers: ms.filter((m) => m.goals && m.goals.length).length, staleDays: last ? U.daysBetween(last, today) : null };
    }
    return out;
  }
  FQ.coverage = coverage;

  /* ------------------------------------------------------------ évaluation d'une opportunité */
  function evaluateOpportunity(opp, ctx) {
    const { settings, acct, bets, qtable } = ctx;
    const matchExposure = bets.filter((b) => b.matchId === opp.matchId && b.status === "EN ATTENTE").reduce((a, b) => a + b.stake, 0);
    if (opp.insufficient) return { decision: "DONNÉES INSUFFISANTES", ev: null, stake: 0, reasons: [opp.insufficient], stakeSteps: [] };
    const d = FQ.decide({ p: opp.p, odds: opp.odds, rel: opp.rel, market: opp.market, s: settings, acct, matchExposure, missing: opp.missing || 0, qtable, playerUnavailable: opp.playerUnavailable });
    d.fair = FQ.value.fairOdds(opp.p);
    d.minOdds = FQ.value.minOdds(opp.p, settings.evMin);
    d.implied = FQ.value.impliedProb(opp.odds);
    d.score = FQ.riskScore(d.ev, opp.rel);
    d.matchExposure = matchExposure;
    return d;
  }
  FQ.evaluateOpportunity = evaluateOpportunity;

  function evaluateAll(opps, ctx) {
    const rows = opps.map((o) => Object.assign({ opp: o, matchId: o.matchId, market: o.market }, evaluateOpportunity(o, ctx)));
    const open = rows.filter((r) => r.opp.status === "ouverte");
    FQ.exclusiveMarkets(open);
    return rows;
  }
  FQ.evaluateAll = evaluateAll;

  /* ------------------------------------------------------------ apprentissage */
  function learningSamples(state) {
    const res = state.results || {};
    const s1 = [], s2 = [], s3 = [];
    for (const p of state.predictions) {
      const r = res[p.matchId];
      if (!r || !U.isNum(r.hg)) continue;
      const k = FQ.outcomeOf("1N2", null, r);
      if (p.raw) s1.push({ t: p.createdAt, p: [p.raw.p1, p.raw.pN, p.raw.p2], o: k });
      if (p.raw) s2.push({ t: p.createdAt, p: FQ.plattBinary(p.raw.bttsYes, state.calibration && state.calibration.bttsAB), o: r.hg > 0 && r.ag > 0 ? 1 : 0 }); // la température BTTS s'applique après Platt
      for (const pl of p.players || []) {
        const o = FQ.outcomeOf("Buteur", null, r, pl.name);
        if (o !== null && U.isNum(pl.pScoreRaw)) s3.push({ t: p.createdAt, p: pl.pScoreRaw, o });
      }
    }
    return { s1, s2, s3 };
  }
  FQ.learningSamples = learningSamples;

  /** Métriques de prédiction résolues (Brier, log loss) par marché */
  function predictionMetrics(state) {
    const res = state.results || {};
    const out = { "1N2": [], BTTS: [], Buteur: [], "Joueur Décisif": [] };
    for (const p of state.predictions) {
      const r = res[p.matchId];
      if (!r || !U.isNum(r.hg)) continue;
      const k = FQ.outcomeOf("1N2", null, r);
      const m = p.markets;
      out["1N2"].push({ id: p.id, comp: p.comp, t: p.createdAt, p3: [m.p1, m.pN, m.p2], k, brier: FQ.metrics.brier3([m.p1, m.pN, m.p2], k), ll: FQ.metrics.logLoss3([m.p1, m.pN, m.p2], k) });
      const bt = r.hg > 0 && r.ag > 0 ? 1 : 0;
      out.BTTS.push({ id: p.id, comp: p.comp, t: p.createdAt, p: m.bttsYes, o: bt, brier: FQ.metrics.brierBinary(m.bttsYes, bt), ll: FQ.metrics.logLossBinary(m.bttsYes, bt) });
      for (const pl of p.players || []) {
        const o1 = FQ.outcomeOf("Buteur", null, r, pl.name);
        if (o1 !== null) out.Buteur.push({ id: p.id + pl.name, comp: p.comp, t: p.createdAt, p: pl.pScore, o: o1, brier: FQ.metrics.brierBinary(pl.pScore, o1), ll: FQ.metrics.logLossBinary(pl.pScore, o1) });
        if (U.isNum(pl.pDecisive)) {
          const o2 = FQ.outcomeOf("Joueur Décisif", null, r, pl.name);
          if (o2 !== null) out["Joueur Décisif"].push({ id: p.id + pl.name + "d", comp: p.comp, t: p.createdAt, p: pl.pDecisive, o: o2, brier: FQ.metrics.brierBinary(pl.pDecisive, o2), ll: FQ.metrics.logLossBinary(pl.pDecisive, o2) });
        }
      }
    }
    return out;
  }
  FQ.predictionMetrics = predictionMetrics;

  /** Analyse des faiblesses : règles explicites et seuils d'effectif */
  function weaknesses(state, acct, metrics, settings) {
    const w = [];
    const resolved = state.bets.filter((b) => b.status === "GAGNÉ" || b.status === "PERDU");
    if (resolved.length < 50) w.push({ level: "info", text: `Échantillon de paris résolus faible (${resolved.length}) : aucune conclusion sur un avantage durable n'est possible.` });
    const group = (f) => { const g = {}; resolved.forEach((b) => { const k = f(b); (g[k] = g[k] || []).push(b); }); return g; };
    for (const [k, arr] of Object.entries(group((b) => b.comp))) {
      const st = arr.reduce((a, b) => a + b.stake, 0), pl = arr.reduce((a, b) => a + b.profit, 0);
      if (arr.length >= 10 && pl / st < -0.1) w.push({ level: "warn", text: `${k} : ROI ${(100 * pl / st).toFixed(1)} % sur ${arr.length} paris.` });
    }
    for (const [k, arr] of Object.entries(group((b) => (b.odds < 1.8 ? "cotes < 1,80" : b.odds < 3 ? "cotes 1,80–3,00" : "cotes ≥ 3,00")))) {
      const st = arr.reduce((a, b) => a + b.stake, 0), pl = arr.reduce((a, b) => a + b.profit, 0);
      if (arr.length >= 10 && pl / st < -0.1) w.push({ level: "warn", text: `Tranche ${k} : ROI ${(100 * pl / st).toFixed(1)} % (${arr.length} paris).` });
    }
    for (const [mk, arr] of Object.entries(metrics)) {
      if (!arr.length) continue;
      if (arr.length < 30) { w.push({ level: "info", text: `${mk} : ${arr.length} prédictions résolues, calibration non évaluable (< 30).` }); continue; }
      if (mk !== "1N2") {
        const base = arr.reduce((a, x) => a + x.o, 0) / arr.length;
        const bm = arr.reduce((a, x) => a + x.brier, 0) / arr.length;
        const bb = arr.reduce((a, x) => a + (base - x.o) ** 2, 0) / arr.length;
        if (bm >= bb) w.push({ level: "warn", text: `${mk} : Brier ${bm.toFixed(4)} ≥ fréquence de base ${bb.toFixed(4)} — le modèle n'apporte pas d'information sur ce marché.` });
        const bins = FQ.calibrationBins(arr.map((x) => [x.p, x.o]), 5);
        const gap = Math.max(...bins.filter((b) => b.n >= 8).map((b) => Math.abs(b.pred - b.obs)), 0);
        if (gap > 0.1) w.push({ level: "warn", text: `${mk} : écart de calibration jusqu'à ${(gap * 100).toFixed(0)} points dans une tranche de probabilité.` });
      }
    }
    if (acct.maxDrawdown > 0.15) w.push({ level: "warn", text: `Drawdown maximal ${(acct.maxDrawdown * 100).toFixed(1)} % : revoir la fraction de Kelly ou le seuil d'EV.` });
    if (acct.bankroll > 0 && acct.openStakes / acct.bankroll > settings.maxTotalPct * 0.9) w.push({ level: "warn", text: `Exposition ouverte proche du plafond (${(100 * acct.openStakes / acct.bankroll).toFixed(1)} %).` });
    const bt = state.backtests.filter((b) => b.kind === "openfootball");
    bt.forEach((b) => { if (b.brierBTTS !== null && b.brierBTTSBase !== null && b.brierBTTS >= b.brierBTTSBase) w.push({ level: "warn", text: `Backtest ${b.comp} ${b.season} : BTTS ${b.brierBTTS.toFixed(4)} ≥ référence ${b.brierBTTSBase.toFixed(4)} — pas de pouvoir prédictif démontré sur BTTS.` }); });
    const wins = resolved.slice(-10);
    if (wins.length === 10 && wins.every((b) => b.status === "GAGNÉ")) w.push({ level: "info", text: "Série de 10 gains consécutifs : une série courte ne prouve pas un avantage durable." });
    if (!w.length) w.push({ level: "ok", text: "Aucune faiblesse détectée avec les seuils actuels — vérifier la taille d'échantillon avant d'en conclure quoi que ce soit." });
    return w;
  }
  FQ.weaknesses = weaknesses;
})(typeof window !== "undefined" ? window : globalThis);
