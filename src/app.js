/* =========================================================================
   FOOTBALL QUANT AI — interface React (htm, sans compilation)
   ========================================================================= */
window.__fqStartApp = function () {
  "use strict";
  if (!window.React || !window.ReactDOM || !window.htm) {
    const el = document.getElementById("fatal");
    if (el) { el.hidden = false; el.textContent = "Les bibliothèques d'interface (React, htm) n'ont pas pu être chargées depuis le CDN. Vérifiez la connexion puis rechargez la page."; }
    return;
  }
  const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;
  const html = htm.bind(React.createElement);
  const FQ = window.FQ, U = FQ.util, P = FQ.Persist;
  const RC = window.Recharts || null;
  const LI = window.LucideReact || {};
  let DATASET = window.FQ_DATASET;

  /* --------------------------------------------------------------- constantes */
  const COMP_ORDER = ["PL", "PD", "FL1", "SA", "BL1", "CL", "WC", "J1", "DED", "BSA", "ELC", "SSL", "SPL"];
  const COMP = {}; const indexComps = (ds) => ds.competitions.forEach((c) => (COMP[c.code] = c)); indexComps(DATASET);
  const SHORT = { PL: "PL", PD: "LIGA", FL1: "L1", SA: "SA", BL1: "BUN", CL: "UCL", WC: "CDM", J1: "J1", DED: "ERE", BSA: "BRA", ELC: "CHA", SSL: "SUI", SPL: "SAU" };
  const MARKETS = ["1N2", "Joueur Décisif", "Buteur", "BTTS"];
  const C = { pos: "#4fc08d", neg: "#e5675a", warn: "#e3a443", info: "#77a6dd", accent: "#ebb54a", muted: "#8a9b96", line: "#26343a", fg: "#e3ebe8", s1: "#3987e5", s2: "#d95926", s3: "#199e70" };
  const TZS = ["Europe/Paris", "Europe/London", "UTC", "America/Sao_Paulo", "Asia/Tokyo", "Asia/Riyadh", "America/New_York"];

  /* --------------------------------------------------------------- format */
  const fr = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : fr(100 * x, d) + " %");
  const eur = (x, cur) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : fr(x, 2) + " " + (cur || "u"));
  const sgn = (x, d = 2) => (Number.isFinite(x) ? (x > 0 ? "+" : "") + fr(x, d) : "—");
  const dFR = (d) => (d ? d.split("-").reverse().join("/") : "—");
  const dtFR = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }); } catch (e) { return iso; } };
  const parseNum = (s) => { if (s === "" || s === null || s === undefined) return null; const v = parseFloat(String(s).replace(",", ".")); return Number.isFinite(v) ? v : null; };

  /* --------------------------------------------------------------- petits composants */
  const Ic = ({ n, s = 16 }) => (LI[n] ? React.createElement(LI[n], { size: s, strokeWidth: 1.75, "aria-hidden": true }) : null);
  const Pill = ({ tone = "muted", children, title }) => html`<span className=${"pill pill-" + tone} title=${title || undefined}>${children}</span>`;
  const DECISION_TONE = { "VALUE BET": "pos", "À SURVEILLER": "warn", "NO BET": "muted", "DONNÉES INSUFFISANTES": "muted" };
  const STATUS_TONE = { "GAGNÉ": "pos", "PERDU": "neg", "ANNULÉ": "muted", "EN ATTENTE": "info", "NON VÉRIFIABLE": "warn", "À VÉRIFIER": "warn" };
  const DecisionPill = ({ d }) => html`<${Pill} tone=${DECISION_TONE[d] || "muted"}>${d === "VALUE BET" ? html`<${Ic} n="CircleCheck" s=${12} />` : d === "À SURVEILLER" ? html`<${Ic} n="Eye" s=${12} />` : html`<${Ic} n="CircleSlash" s=${12} />`} ${d}<//>`;
  const Card = ({ title, eyebrow, right, children, className = "" }) => html`
    <section className=${"card " + className}>
      ${(title || right) && html`<header className="card-h"><div className="min-w-0">${eyebrow && html`<div className="eyebrow">${eyebrow}</div>`}<h3>${title}</h3></div>${right && html`<div className="card-r">${right}</div>`}</header>`}
      ${children}
    </section>`;
  const Stat = ({ label, value, sub, tone }) => html`<div className="stat"><div className="stat-l">${label}</div><div className=${"stat-v " + (tone ? "t-" + tone : "")}>${value}</div>${sub && html`<div className="stat-s">${sub}</div>`}</div>`;
  const Field = ({ label, children, hint, id }) => html`<label className="field" htmlFor=${id}><span className="field-l">${label}</span>${children}${hint && html`<span className="field-h">${hint}</span>`}</label>`;
  const Btn = ({ onClick, children, kind = "ghost", disabled, title, small, type = "button" }) => html`<button type=${type} className=${"btn btn-" + kind + (small ? " btn-sm" : "")} onClick=${onClick} disabled=${disabled} title=${title || undefined}>${children}</button>`;
  const Empty = ({ icon = "Inbox", children }) => html`<div className="empty"><${Ic} n=${icon} s=${20} /><div>${children}</div></div>`;
  const TableWrap = ({ children }) => html`<div className="tbl-wrap">${children}</div>`;
  const CompTag = ({ code }) => html`<span className="comp-tag" title=${COMP[code] ? COMP[code].name : code}>${SHORT[code] || code}</span>`;

  function NumInput({ id, value, onChange, step = "any", min, max, placeholder, width }) {
    const [txt, setTxt] = useState(value === null || value === undefined ? "" : String(value));
    useEffect(() => { const v = parseNum(txt); if (v !== value) setTxt(value === null || value === undefined ? "" : String(value)); }, [value]);
    return html`<input id=${id} className="inp mono" inputMode="decimal" style=${width ? { width } : undefined} value=${txt} placeholder=${placeholder || ""}
      onChange=${(e) => { setTxt(e.target.value); const v = parseNum(e.target.value); if (e.target.value === "") onChange(null); else if (v !== null && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v); }} />`;
  }

  /* --------------------------------------------------------------- graphiques */
  const axisProps = { stroke: C.muted, tick: { fill: C.muted, fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }, tickLine: false, axisLine: { stroke: C.line } };
  const tipStyle = { contentStyle: { background: "#141d20", border: "1px solid " + C.line, borderRadius: 8, fontSize: 12, color: C.fg }, labelStyle: { color: C.muted }, itemStyle: { color: C.fg } };
  function Chart({ title, height = 220, children, empty, note }) {
    return html`<figure className="chart"><figcaption>${title}</figcaption>
      ${!RC ? html`<${Empty} icon="ChartNoAxesColumn">Bibliothèque de graphiques non chargée (réseau). Les données restent consultables dans les tableaux.<//>` :
        empty ? html`<${Empty} icon="ChartNoAxesColumn">${empty}<//>` :
        html`<div style=${{ width: "100%", height }}><${RC.ResponsiveContainer} width="100%" height="100%">${children}<//></div>`}
      ${note && html`<div className="fig-note">${note}</div>`}
    </figure>`;
  }
  function CalibrationChart({ bins, title, color = C.s1 }) {
    const data = (bins || []).map((b) => ({ x: +(b.pred * 100).toFixed(1), y: +(b.obs * 100).toFixed(1), n: b.n }));
    return html`<${Chart} title=${title} empty=${data.length ? null : "Aucune observation résolue"} note="Diagonale = calibration parfaite. Taille d'échantillon par tranche dans l'infobulle.">
      ${RC && html`<${RC.ComposedChart} data=${data} margin=${{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} />
        <${RC.XAxis} ...${axisProps} type="number" dataKey="x" domain=${[0, 100]} ticks=${[0, 25, 50, 75, 100]} unit="%" />
        <${RC.YAxis} ...${axisProps} type="number" domain=${[0, 100]} ticks=${[0, 25, 50, 75, 100]} unit="%" />
        <${RC.Tooltip} ...${tipStyle} formatter=${(v, n) => [n === "n" ? v : v + " %", n === "y" ? "Fréquence observée" : n === "x" ? "Probabilité prévue" : "n"]} />
        <${RC.ReferenceLine} segment=${[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke=${C.muted} strokeDasharray="4 4" />
        <${RC.Line} type="monotone" dataKey="y" stroke=${color} strokeWidth=${2} dot=${{ r: 4, fill: color, stroke: "#131b1e", strokeWidth: 2 }} isAnimationActive=${false} />
      <//>`}
    <//>`;
  }

  /* --------------------------------------------------------------- confirmation in-page */
  function Confirm({ open, title, text, onYes, onNo, yesLabel = "Confirmer", danger }) {
    if (!open) return null;
    return html`<div className="overlay" role="dialog" aria-modal="true"><div className="dialog">
      <h3>${title}</h3><p className="muted">${text}</p>
      <div className="row gap-2 justify-end mt-3"><${Btn} onClick=${onNo}>Annuler<//><${Btn} kind=${danger ? "danger" : "primary"} onClick=${onYes}>${yesLabel}<//></div>
    </div></div>`;
  }

  /* --------------------------------------------------------------- exports (fichier ou copie) */
  function ExportBox({ payload, onClose }) {
    const [msg, setMsg] = useState("");
    const ref = useRef(null);
    if (!payload) return null;
    return html`<div className="overlay" role="dialog" aria-modal="true"><div className="dialog wide">
      <h3>${payload.filename}</h3>
      <p className="muted">${payload.note || "L'enregistrement de fichier n'est pas disponible dans cette vue : copiez le contenu ci-dessous et collez-le dans un fichier."}</p>
      <textarea ref=${ref} className="inp mono export-ta" readOnly value=${payload.data}></textarea>
      <div className="row gap-2 justify-end mt-3">
        <span className="muted small">${msg}</span>
        <${Btn} onClick=${async () => { try { await navigator.clipboard.writeText(payload.data); setMsg("Copié"); } catch (e) { ref.current && ref.current.select(); setMsg("Sélectionné : utilisez Copier"); } }}><${Ic} n="Copy" /> Copier<//>
        <${Btn} kind="primary" onClick=${onClose}>Fermer<//>
      </div></div></div>`;
  }

  /* =========================================================================
     APPLICATION
     ========================================================================= */
  function App() {
    const today = useMemo(() => FQ.time.dateInTz(Date.now(), "Europe/Paris"), []);
    const [mode, setModeRaw] = useState("real"); // une seule base : les vrais matchs (le mode démo fictif a été retiré)
    const [states, setStates] = useState({ demo: null, real: null });
    const [persistInfo, setPersistInfo] = useState({ kind: "…", saved: null, error: null, loadedFrom: {} });
    const [tab, setTab] = useState(() => { const h = (location.hash || "").slice(1); return ["dashboard", "pronostics", "audit", "performance"].includes(h) ? h : "dashboard"; });
    const [toast, setToast] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [panel, setPanel] = useState(null); // "settings" | "data"
    const [exportPayload, setExportPayload] = useState(null);
    const [slip, setSlip] = useState([]);
    const [realForm, setRealForm] = useState(null);

    const demoData = useMemo(() => ({ matches: [], results: {}, players: {}, odds: {}, hidden: {} }), []);
    const [dataset, setDatasetRaw] = useState(DATASET);
    const [trainedAt, setTrainedAt] = useState(FQ.TRAINED ? FQ.TRAINED.generatedAt : null);
    const setDataset = (ds) => { indexComps(ds); DATASET = ds; setDatasetRaw(ds); };
    /** Données et entraînement plus récents enregistrés par la tâche planifiée */
    const rawRef = useRef(window.FQ_RAW || null);
    function applyShared(sh) {
      if (!sh) return;
      if (sh.trained && (!FQ.TRAINED || sh.trained.generatedAt > FQ.TRAINED.generatedAt)) { FQ.TRAINED = sh.trained; setTrainedAt(sh.trained.generatedAt); }
      if (sh.raw && FQ.ETL) {
        const ds = FQ.ETL.build(sh.raw);
        const fresh = (d) => Math.max(...Object.values(d.source.repos || {}).map((r) => Date.parse(r.commitDate || 0) || 0));
        if (fresh(ds) > fresh(DATASET)) { setDataset(ds); rawRef.current = sh.raw; }
      }
    }
    /** Intègre les lignes ESPN déposées par la tâche planifiée (collecte sans code), puis enregistre magasin brut et état */
    const inboxBusy = useRef(false);
    async function checkInbox() {
      if (!P.shared || !rawRef.current || inboxBusy.current) return;
      inboxBusy.current = true;
      try {
        const docs = await P.loadInbox();
        const pendingIds = new Set(((P.pendingShared && P.pendingShared.inboxIds) || []));
        const fresh = docs.filter((d) => !pendingIds.has(d.id));
        if (!fresh.length) return;
        const raw2 = structuredClone(rawRef.current);
        const files = []; fresh.forEach((d) => Object.entries(d.data.files).forEach(([name, text]) => files.push({ name, text })));
        const ing = FQ.ETL.ingestFiles(raw2, files, fresh.map((d) => d.data.at).filter(Boolean).sort().slice(-1)[0] || new Date().toISOString());
        rawRef.current = raw2;
        P.pendingShared = Object.assign({}, P.pendingShared, { raw: raw2, inboxIds: [...pendingIds, ...fresh.map((d) => d.id)] });
        setDataset(FQ.ETL.build(raw2));
        update((s) => { s.log.push({ t: new Date().toISOString(), text: `Collecte intégrée : ${ing.accepted} ligne(s) ESPN acceptée(s), ${ing.rejected.length} rejetée(s), ${ing.newResults} nouveau(x) résultat(s), ${ing.odds} cote(s)` }); return s; }, "real");
        notify(`Collecte intégrée : ${ing.newResults} résultat(s), ${ing.odds} cote(s)`, "pos");
      } catch (e) { console.error(e); } finally { inboxBusy.current = false; }
    }
    const baseReal = useMemo(() => FQ.buildMatches(dataset, today), [today, dataset]);
    const [autoInfo, setAutoInfo] = useState({ last: null, running: false });

    const notify = useCallback((text, tone = "info") => { setToast({ text, tone, k: Date.now() }); }, []);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3800); return () => clearTimeout(t); }, [toast]);

    // chargement initial
    useEffect(() => {
      (async () => {
        const kind = await P.init();
        let r = null;
        if (P.shared) {
          try {
            const sh = await P.loadShared();
            applyShared(sh);
            if (sh && sh.state) r = { state: sh.state, from: "base de l'artefact (rév. " + sh.meta.rev + ")" };
            setAutoInfo((a) => Object.assign({}, a, { meta: sh ? sh.meta : null }));
          } catch (e) { /* repli */ }
        }
        if (!r) r = await P.load("real");
        let demoState = FQ.emptyState();
        let realState = r && r.state && !FQ.validateState(r.state).length ? r.state : FQ.emptyState();
        if (!realState.schemaData || realState.schemaData < 2) {
          // nouvelles sources (identifiants ESPN) : les analyses automatiques de l'ancien jeu openfootball ne sont pas reprises
          const keep = realState.settings; realState = FQ.emptyState(keep); realState.schemaData = 2; dirty.current.real = true;
          realState.log.push({ t: new Date().toISOString(), text: "Passage aux sources ESPN + football-data.co.uk : nouvel état réel" });
        }
        // aucune bankroll réelle : un état sans pari encore en euros passe en unités
        for (const st of [realState, demoState]) if (st.settings.currency !== "u" && !st.bets.length) Object.assign(st.settings, { initialBankroll: 100, currency: "u", unitMode: true, minStake: 0.1 });
        if (realState.settings.currency === "u" && (!r || !r.state)) dirty.current.real = true;
        setStates({ demo: demoState, real: realState });
        setPersistInfo((p) => Object.assign({}, p, { kind, loadedFrom: { real: r ? r.from : "nouvel état" } }));
      })();
    }, []);

    useEffect(() => {
      if (!states.real) return;
      const t = setTimeout(checkInbox, 1500);
      const iv = setInterval(checkInbox, 10 * 60 * 1000);
      return () => { clearTimeout(t); clearInterval(iv); };
    }, [!!states.real]);
    // synchronisation en direct avec la tâche planifiée (ou un autre onglet)
    useEffect(() => {
      if (!states.real) return;
      return P.subscribeMeta(async (meta) => {
        setAutoInfo((a) => Object.assign({}, a, { meta }));
        if (!P.meta || meta.rev <= P.meta.rev || meta.tab === P.tab) return;
        try {
          const sh = await P.loadShared();
          applyShared(sh);
          if (sh && sh.state) setStates((prev) => {
            if (dirty.current.real) { const mg = FQ.mergeStates(sh.state, prev.real); return Object.assign({}, prev, { real: mg.state }); }
            return Object.assign({}, prev, { real: sh.state });
          });
          notify(`Nouvelles données de la ${meta.by === "page" ? "page (autre onglet)" : "tâche planifiée"} chargées`, "pos");
        } catch (e) {}
      });
    }, [!!states.real]);

    const state = states[mode];
    const setMode = (m) => { setModeRaw(m); P.pref("mode", m); setSelectedId(null); };

    // sauvegarde différée
    const saveTimer = useRef({});
    const dirty = useRef({});
    useEffect(() => {
      for (const m of ["real"]) {
        if (!states[m] || !dirty.current[m]) continue;
        clearTimeout(saveTimer.current[m]);
        const snap = states[m];
        saveTimer.current[m] = setTimeout(async () => {
          try { const where = await P.save(m, snap); dirty.current[m] = false; setPersistInfo((p) => Object.assign({}, p, { saved: { at: new Date().toISOString(), where, mode: m }, error: null })); }
          catch (e) { setPersistInfo((p) => Object.assign({}, p, { error: (e && (e.message || e.code)) || "échec d'écriture" })); }
        }, 1200);
      }
    }, [states]);

    const update = useCallback((fn, m) => {
      const target = m || mode;
      setStates((prev) => {
        const next = fn(structuredClone(prev[target]));
        dirty.current[target] = true;
        return Object.assign({}, prev, { [target]: next });
      });
    }, [mode]);

    // données dérivées
    const matches = useMemo(() => (state ? FQ.mergeMatches(mode === "demo" ? demoData.matches : baseReal, state, today) : []), [state && state.results, state && state.userMatches, mode, today]);
    const matchById = useMemo(() => { const m = new Map(); matches.forEach((x) => m.set(x.id, x)); return m; }, [matches]);
    const dataRev = useMemo(() => matches.filter((m) => m.hg !== null).length + ":" + (state ? Object.keys(state.results).length : 0), [matches]);
    const modelCache = useRef(new Map());
    const getModel = useCallback((comp, asOf) => {
      const k = `${mode}|${comp}|${asOf}|${dataRev}|${trainedAt}`;
      if (!modelCache.current.has(k)) modelCache.current.set(k, FQ.fitModel(matches, comp, asOf));
      return modelCache.current.get(k);
    }, [mode, dataRev, matches, trainedAt]);
    const settings = state ? state.settings : FQ.DEFAULT_SETTINGS;
    const acct = useMemo(() => (state ? FQ.accounting(state.bets, settings.initialBankroll) : null), [state && state.bets, settings.initialBankroll]);
    const qtable = useMemo(() => (state ? FQ.qtableFromLog(state.qlog) : {}), [state && state.qlog]);
    const cov = useMemo(() => (mode === "real" ? FQ.coverage(dataset, matches, today) : null), [mode, matches, today, dataset]);
    const sig = useMemo(() => (mode === "demo" ? "demo-" + today : FQ.P.dataSignature(dataset)), [mode, dataset, today]);
    const playedByComp = useMemo(() => { const c = {}; matches.forEach((m) => { if (m.hg !== null) c[m.comp] = (c[m.comp] || 0) + 1; }); return c; }, [matches]);
    const lastDataDate = useMemo(() => matches.filter((m) => m.hg !== null && !m.manual && m.date <= today).map((m) => m.date).sort().slice(-1)[0], [matches]);
    const quality = useMemo(() => FQ.qualityReport(matches, today), [matches, today]);
    const projCache = useRef(new Map());
    const projRun = useRef({});
    const [projTick, setProjTick] = useState(0);
    void projTick;
    const rulesMap = mode === "demo" ? FQ.RULES_DEMO : FQ.RULES;

    if (!state) return html`<div className="boot"><div className="brand-mark">FQ</div><div>Chargement de l'état et de la persistance…</div></div>`;

    const ctx = { mode, state, update, matches, matchById, today, settings, acct, qtable, getModel, cov, quality, notify, demoData, setTab, selectedId, setSelectedId, persistInfo, setExportPayload, rulesMap, dataset, autoInfo };
    ctx.dataVersion = (comp) => `${sig}|${playedByComp[comp] || 0}|${trainedAt || ""}`;
    ctx.trainedAt = trainedAt;
    ctx.effSettings = FQ.P.effSettings(ctx);
    ctx.dataAgeDays = lastDataDate ? U.daysBetween(lastDataDate, today) : null;
    ctx.runAuto = (origin) => {
      const s2 = structuredClone(state);
      const rep = FQ.P.runCycle(Object.assign({}, ctx, { state: s2 }), origin);
      if (mode === "real" && P.shared && FQ.ETL && FQ.ETL.storedPlan) {
        const last = (P.pendingShared && P.pendingShared.plan && P.pendingShared.plan.updatedAt) || (P.meta && P.meta.planAt) || "";
        if (!last || Date.now() - Date.parse(last) > 6 * 3600e3) { P.pendingShared = Object.assign({}, P.pendingShared, { plan: FQ.ETL.storedPlan(matches, today) }); if (!rep.changed) update((x) => x); }
      }
      if (rep.changed) update(() => s2);
      setAutoInfo((a) => Object.assign({}, a, { last: rep, lastMode: mode }));
      return rep;
    };
    const pkey = (comp, season) => `${mode}|${comp}|${season}|${dataRev}`;
    ctx.getProjection = (comp, season) => projCache.current.get(pkey(comp, season)) || null;
    ctx.projStatus = (comp, season) => projRun.current[pkey(comp, season)] || null;
    ctx.runProjection = (comp, season, nSims) => {
      const key = pkey(comp, season);
      if (projRun.current[key] && projRun.current[key].running) return;
      const prep = FQ.prepareProjection(matches, comp, season, today, getModel(comp, today), rulesMap);
      if (!prep.ok) { projCache.current.set(key, { ok: false, reason: prep.reason }); setProjTick((t) => t + 1); return; }
      projRun.current[key] = { running: true, progress: 0 }; setProjTick((t) => t + 1);
      FQ.runProjection(prep, nSims, 20261014, (p) => { projRun.current[key] = { running: true, progress: p }; setProjTick((t) => t + 1); },
        (res) => { res.ok = true; projCache.current.set(key, res); projRun.current[key] = { running: false }; setProjTick((t) => t + 1); });
    };

    ctx.slip = slip;
    ctx.toggleSlip = (p) => setSlip((cur) => (cur.some((x) => x.matchId === p.matchId) ? cur.filter((x) => x.matchId !== p.matchId) : cur.concat([legOf(p)])));
    ctx.clearSlip = () => setSlip([]);
    ctx.openReal = (init) => setRealForm(init);
    ctx.analyze = (id) => { setSelectedId(id); setTab("dashboard"); setTimeout(() => { const el = document.getElementById("match-center"); el && el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); };

    const TABS = [
      { id: "dashboard", label: "Tableau de bord", icon: "Gauge" },
      { id: "pronostics", label: "Pronostics & tickets", icon: "ListChecks" },
      { id: "audit", label: "Mes paris & audit", icon: "ClipboardCheck" },
      { id: "performance", label: "Performance", icon: "ChartLine" },
    ];
    const paperS = betStats(state.paperTickets || []), realS = betStats((state.realBets || []).filter(FQ.P.isRealBet));

    return html`
      <div className="app">
        <header className="topbar">
          <div className="topbar-in">
            <div className="brand"><span className="brand-mark">FQ</span><div><div className="brand-n">Football Quant AI</div><div className="brand-s">moteur ${FQ.ENGINE_VERSION} · ${dFR(today)}</div></div></div>
            <button className="pl-chip" onClick=${() => setTab("audit")} title="Paper betting : tickets fictifs, 1 u chacun">
              <span className="muted tiny">Paper</span><b className=${"mono " + (paperS.profit > 0 ? "t-pos" : paperS.profit < 0 ? "t-neg" : "")}>${sgn(paperS.profit)} u</b></button>
            <button className="pl-chip" onClick=${() => setTab("audit")} title="Vos paris réellement joués (les tests sont à part)">
              <span className="muted tiny">Réel</span><b className=${"mono " + (realS.profit > 0 ? "t-pos" : realS.profit < 0 ? "t-neg" : "")}>${sgn(realS.profit)} €</b></button>
            <div className="row gap-1">
              <${Btn} small kind="primary" onClick=${() => setRealForm({ legs: [], label: "Mon ticket" })} title="Enregistrer un ticket à tester ou joué chez votre bookmaker"><${Ic} n="Plus" /> Mon ticket<//>
              <${Btn} small onClick=${() => setPanel("data")} title="Sauvegarde, import, export"><${Ic} n="Database" /> <span className="hide-sm">Données</span><//>
              <${Btn} small onClick=${() => setPanel("settings")} title="Paramètres de risque"><${Ic} n="SlidersHorizontal" /> <span className="hide-sm">Paramètres</span><//>
            </div>
          </div>
          <nav className="tabs" role="tablist">
            ${TABS.map((t) => html`<button key=${t.id} role="tab" aria-selected=${tab === t.id} className=${tab === t.id ? "on" : ""} onClick=${() => { setTab(t.id); try { history.replaceState(null, "", "#" + t.id); } catch (e) {} }}><${Ic} n=${t.icon} /> ${t.label}</button>`)}
          </nav>
        </header>
        <main className="main">
          <${AutoPilot} ctx=${ctx} />
          ${tab === "dashboard" && html`<${Dashboard} ctx=${ctx} />`}
          ${tab === "pronostics" && html`<${Pronostics} ctx=${ctx} />`}
          ${tab === "audit" && html`<${Audit} ctx=${ctx} />`}
          ${tab === "performance" && html`<${Performance} ctx=${ctx} />`}
        </main>
        <${Legend} ctx=${ctx} />
        <footer className=${"foot" + (slip.length ? " with-slip" : "")}>
          Outil d'aide à la décision : aucune rentabilité n'est garantie. Pariez uniquement ce que vous pouvez perdre. Aide : joueurs-info-service.fr — 09 74 75 13 13.
        </footer>
        ${panel === "settings" && html`<${SettingsPanel} ctx=${ctx} onClose=${() => setPanel(null)} />`}
        ${panel === "data" && html`<${DataPanel} ctx=${ctx} onClose=${() => setPanel(null)} reseed=${() => {}} />`}
        <${ExportBox} payload=${exportPayload} onClose=${() => setExportPayload(null)} />
        <${SlipBar} ctx=${ctx} />
        ${realForm && html`<${RealBetForm} ctx=${ctx} init=${realForm} onClose=${() => setRealForm(null)} />`}
        ${toast && html`<div key=${toast.k} className=${"toast t-" + toast.tone} role="status">${toast.text}</div>`}
      </div>`;
  }

  /* =========================================================================
     PILOTE AUTOMATIQUE
     ========================================================================= */
  function AutoPilot({ ctx }) {
    const ref = useRef(ctx); ref.current = ctx;
    const [open, setOpen] = useState(false);
    useEffect(() => {
      const run = () => { try { ref.current.runAuto("page"); } catch (e) { console.error(e); } };
      const t = setTimeout(run, 300);
      const iv = setInterval(run, 10 * 60 * 1000);
      return () => { clearTimeout(t); clearInterval(iv); };
    }, [ctx.mode, ctx.dataset]);
    const last = ctx.autoInfo.lastMode === ctx.mode ? ctx.autoInfo.last : null;
    const meta = ctx.autoInfo.meta;
    const job = meta && meta.lastJob;
    const logs = (ctx.state.autoLog || []).slice().reverse();
    const sum = (r) => r ? [r.audited && `${r.audited} match(s) audité(s)`, r.settled && `${r.settled} pari(s) réglé(s)`, r.analysed && `${r.analysed} match(s) analysé(s)`, r.insufficient && `${r.insufficient} insuffisant(s)`, r.autoBets && `${r.autoBets} value bet(s) engagé(s) (${fr(r.staked, 2)} u)`, r.closed && `${r.closed} opportunité(s) close(s)`, r.calibration].filter(Boolean).join(" · ") || "rien de nouveau" : "—";
    const pending = ctx.state.opportunities.filter((o) => o.status === "ouverte" && !o.insufficient).length;
    const noOdds = ctx.state.opportunities.filter((o) => o.status === "ouverte" && !o.insufficient && !Number.isFinite(o.odds)).length;
    return html`<section className="autopilot">
      <div className="ap-head">
        <span className="ap-dot" aria-hidden="true"></span>
        <div className="min-w-0"><b>Automatique</b> <span className="muted small">· ${ctx.mode === "demo" ? "données fictives (démo)" : html`dernier résultat le ${dFR(ctx.matches.filter((m) => m.hg !== null && !m.manual && m.date <= ctx.today).map((m) => m.date).sort().slice(-1)[0])}${job ? html` · collecte ${dtFR(job.at)}` : ""}`} · analyse des ${ctx.settings.horizonDays || 14} prochains jours, tickets, audit et apprentissage sans clic</span></div>
        <${Btn} small onClick=${() => setOpen(!open)}>${open ? "Masquer" : "Détails"}<//>
      </div>
      ${open && html`<div className="ap-grid">
        <div><div className="eyebrow">Dernier cycle (cette page)</div><div className="small">${last ? `${dtFR(last.at)} · ${sum(last)}` : "en cours…"}</div></div>
        ${ctx.mode === "real" && html`<div><div className="eyebrow">Tâche planifiée quotidienne</div><div className="small">${job ? `${dtFR(job.at)} · ${sum(job.report)}` : P.shared ? "pas encore exécutée" : "base de l'artefact non disponible dans cette vue"}</div></div>`}
        <div><div className="eyebrow">Données</div><div className=${"small " + (ctx.dataAgeDays > 10 ? "t-warn" : "")}>${ctx.mode === "demo" ? "fictives (démo)" : `dernier résultat connu le ${dFR(ctx.matches.filter((m) => m.hg !== null && !m.manual && m.date <= ctx.today).map((m) => m.date).sort().slice(-1)[0])} (${ctx.dataAgeDays} j)`}</div></div>
        ${ctx.state.coverage && html`<div><div className="eyebrow">Couverture des 14 jours</div><div className=${"small " + (ctx.state.coverage.nIssues ? "t-warn" : "")}>${(() => { const c = ctx.state.coverage.totals || {}; return `${c.analysed || 0}/${c.up || 0} matchs à venir analysés · ${c.odds || 0} avec cote (${c.fr || 0} française) · ${ctx.state.coverage.nIssues ? ctx.state.coverage.nIssues + " point(s) à vérifier" : "aucune anomalie"}`; })()}</div></div>`}
        <div><div className="eyebrow">Opportunités ouvertes</div><div className="small">${pending}${noOdds ? ` dont ${noOdds} sans cote publiée (BTTS, joueurs, compétitions sans cote à ce jour) : seuil du modèle et cote minimale affichées` : ""}</div></div>
      </div>`}
      ${open && ctx.state.coverage && html`<${CoverageTable} cov=${ctx.state.coverage} />`}
      ${open && html`<div className="mt-2">
        ${last && last.notes && last.notes.length > 0 && html`<ul className="notes small t-warn">${last.notes.map((n, i) => html`<li key=${i}>${n}</li>`)}</ul>`}
        <${TableWrap}><table className="tbl tiny"><thead><tr><th>Date</th><th>Origine</th><th>Audités</th><th>Réglés</th><th>Analysés</th><th>Paris auto</th><th>Clos</th><th>Apprentissage</th></tr></thead>
          <tbody>${logs.length ? logs.slice(0, 20).map((r, i) => html`<tr key=${i}><td className="mono">${dtFR(r.at)}</td><td>${r.origin}</td><td className="mono">${r.audited}</td><td className="mono">${r.settled}</td><td className="mono">${r.analysed}${r.insufficient ? " (+" + r.insufficient + " insuff.)" : ""}</td><td className="mono">${r.autoBets}${r.autoBets ? ` · ${fr(r.staked, 2)} u` : ""}</td><td className="mono">${r.closed}</td><td>${r.calibration || "—"}</td></tr>`) : html`<tr><td colSpan="8" className="muted">Aucun cycle n'a encore modifié l'état.</td></tr>`}</tbody></table><//>
        <div className="muted tiny mt-1">Cycle relancé à l'ouverture, toutes les 10 minutes tant que la page est ouverte, et deux fois par jour par la tâche planifiée (6 h 54 et 18 h 54). Un cycle est idempotent : sans nouvelle donnée, il ne change rien. Paper betting : 3 tickets fictifs par semaine (1 u chacun) ; value bets fictifs seulement si une stratégie a été rentable sur l'historique.</div>
      </div>`}
    </section>`;
  }

  /** Contrôle de couverture : par compétition, matchs à venir, analysés, avec cote ; anomalies listées */
  function CoverageTable({ cov }) {
    const rows = COMP_ORDER.filter((c) => cov.comps[c]).map((c) => [c, cov.comps[c]]);
    return html`<details className="mt-2 small"><summary>Contrôle de couverture du ${dFR(cov.from)} au ${dFR(cov.to)} · ${cov.nIssues ? `${cov.nIssues} point(s) à vérifier` : "aucune anomalie"}</summary>
      <${TableWrap}><table className="tbl tiny"><thead><tr><th>Comp.</th><th>À venir</th><th>Analysés</th><th>Avec cote</th><th>Cote FR</th><th>Sous 3 j avec cote</th><th>Résultat manquant</th><th>Reportés</th><th>Doublons</th><th>Dernier résultat</th></tr></thead>
        <tbody>${rows.map(([c, x]) => html`<tr key=${c}><td><${CompTag} code=${c} /></td><td className="mono">${x.up}</td><td className=${"mono " + (x.analysed < x.up ? "t-warn" : "")}>${x.analysed}</td><td className="mono">${x.odds}</td><td className="mono">${x.fr}</td><td className=${"mono " + (x.soonOdds < x.soon ? "t-warn" : "")}>${x.soon ? `${x.soonOdds}/${x.soon}` : "—"}</td><td className=${"mono " + (x.missingRes ? "t-warn" : "")}>${x.missingRes}</td><td className="mono">${x.postponed}</td><td className=${"mono " + (x.dup ? "t-warn" : "")}>${x.dup}</td><td className="mono">${x.lastResult ? dFR(x.lastResult) : "—"}</td></tr>`)}</tbody></table><//>
      ${cov.issues.length > 0 && html`<ul className="notes tiny mt-1">${cov.issues.slice(0, 30).map((x, i) => html`<li key=${i}><b>${x.kind}</b> · ${SHORT[x.comp] || x.comp} · ${x.text}</li>`)}</ul>`}
      <div className="tiny muted">Vérifié à chaque cycle (${dtFR(cov.at)}). Un match à plus de 3 jours sans cote est normal : les bookmakers publient en général 3 à 5 jours avant.</div></details>`;
  }

  /* --------------------------------------------------------------- légende et lexique (bas de page) */
  /** Ouvre la légende et y fait défiler la page (optionnellement jusqu'à une rubrique) */
  function openLegend(part) {
    const el = document.getElementById("legende"); if (!el) return;
    const d = el.querySelector("details"); if (d) d.open = true;
    const t = (part && document.getElementById("leg-" + part)) || el;
    setTimeout(() => t.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }
  function Legend({ ctx }) {
    const s = ctx.settings || {};
    const evMin = Math.round(100 * (s.evMin || 0.03)), relMin = s.relMin || 55;
    const G = ({ id, title, items }) => html`<div className="leg-g" id=${"leg-" + id}><h4>${title}</h4><dl>${items.map(([k, v], i) => html`<div key=${i} className="leg-i"><dt>${k}</dt><dd>${v}</dd></div>`)}</dl></div>`;
    return html`<section className="legend" id="legende" aria-label="Légende et lexique"><details>
      <summary><${Ic} n="BookOpen" s=${15} /> <b>Légende et lexique</b> <span className="muted small">· comment lire les pronostics, les tickets et les chiffres</span></summary>
      <div className="leg-grid">
        <${G} id="pronostic" title="Lire un pronostic (un choix par match)" items=${[
          ["21:00 · L1", "Heure du coup d'envoi (fuseau choisi) et compétition."],
          ["Le choix en gras", "L'issue retenue pour ce match : une value bet s'il en existe une, sinon l'issue la plus probable parmi 1, N, 2, « les deux équipes marquent » oui / non."],
          ["La barre et le %", "Probabilité estimée de ce choix. Une barre pleine à moitié = 50 %."],
          ["cote 1,85 · Winamax", "Meilleure cote réelle relevée pour ce choix, et chez qui. « médiane FR » = médiane des bookmakers français ; « Bet 365 » quand aucune cote française n'est disponible."],
          ["« à jouer à partir de 1,70 »", "Aucune cote publiée : c'est la cote minimale à exiger pour que le pari soit intéressant selon nos probabilités."],
          ["fiabilité 72/100", "Qualité des données pour ce match, pas la chance de gagner : matchs récents connus pour les deux équipes (45 %), fraîcheur des résultats (35 %), volume de données de la compétition (20 %). Sous " + relMin + ", le match est exclu des tickets."],
          ["+ Ticket", "Ajoute le choix à ton panier (« Mon ticket » en bas de l'écran), à enregistrer ensuite en test ou en réel."],
          ["ⓘ", "Le pourquoi du choix, et le tableau de toutes les sélections du match avec cote juste, cote minimale, cote disponible, espérance et une case pour saisir la cote que tu vois."],
          ["Choix figé", "Le choix est recalculé à chaque mise à jour jusqu'au coup d'envoi, puis figé et audité au résultat."],
        ]} />
        <${G} id="ticket" title="Lire un ticket de la semaine" items=${[
          ["Sûr, Prudent, Équilibré, Audacieux", "Quatre niveaux de cote visée : 1,4–1,8 · 3–4 · 7–8 · 40–60. Plus la cote est haute, plus la chance est faible : à cote 40, elle ne peut pas dépasser environ 2,5 %."],
          ["Pastille de stratégie", "La façon dont les sélections ont été choisies (favoris, chance maximale, multi-marchés…). Toutes sont suivies chaque semaine ; celle jouée a la meilleure chance corrigée par son historique."],
          ["Chance estimée", "Probabilité que toutes les sélections passent (produit des probabilités)."],
          ["Barres 1, 2, 3…", "Chance du meilleur ticket possible avec 1, 2, 3… sélections pour la même cote visée. La barre colorée = le ticket proposé."],
          ["Cote suivie de *", "Cote estimée (double chance déduite du 1N2 du même bookmaker) : vérifie le prix réel avant de jouer."],
          ["Encadré rouge / vert", "Espérance du ticket et cote totale à partir de laquelle il deviendrait rentable."],
          ["Pourquoi ce ticket / pourquoi", "Justification du ticket (méthode, nombre de sélections, autres stratégies) et de chaque sélection (marché, modèle, marge prélevée, contexte)."],
          ["ouvert / en cours / figé", "Ouvert : réoptimisé à chaque mise à jour. En cours : le premier match a commencé, le ticket ne bouge plus."],
          ["Enregistrer ce ticket", "Le copie dans « Mes tickets », en test (pas joué) ou en réel (joué pour de vrai)."],
        ]} />
        <${G} id="termes" title="Les termes" items=${[
          ["Cote", "Ce que rapporte 1 € misé s'il gagne, mise comprise. Cote 2,00 : 1 € rapporte 2 €."],
          ["Probabilité", "Chance estimée qu'une issue arrive. Elle mélange les cotes du marché (sans marge) et notre modèle, avec un poids appris sur l'historique."],
          ["Cote juste", "1 ÷ probabilité : la cote à laquelle le pari est neutre. 50 % → 2,00."],
          ["Marge", "Commission du bookmaker cachée dans ses cotes : 10 à 13 % chez les bookmakers français sur un 1N2."],
          ["Espérance (EV)", "Gain moyen par euro misé si on jouait le pari une infinité de fois : probabilité × cote − 1. 55 % × 2,00 − 1 = +10 %."],
          ["Value bet", "Pari dont la cote réelle est assez au-dessus de la cote juste pour une espérance d'au moins +" + evMin + " %, avec une fiabilité suffisante. C'est la seule situation où un pari est intéressant à long terme. Rare : les cotes françaises sont presque toujours sous la cote juste."],
          ["Intéressant dès", "Cote minimale pour une espérance d'au moins +" + evMin + " % : (1 + " + evMin + " %) ÷ probabilité."],
          ["Rendement d'une sélection", "Probabilité × cote. 1 = prix juste ; 0,90 = le bookmaker garde 10 %. La chance d'un ticket = produit des rendements ÷ cote totale."],
          ["Modèle seul / marché", "Modèle seul : notre estimation à partir des résultats et des buts, sans les cotes. Marché : les cotes des bookmakers, marge retirée. Quand ils divergent de plus de 8 points, c'est le plus souvent le marché qui avait raison."],
          ["Prudence", "Quand modèle et marché divergent, la chance d'une sélection est diminuée pour construire les tickets."],
          ["Correction d'une stratégie", "Tickets gagnés ÷ tickets annoncés par cette stratégie dans le passé. Au-dessus de 1 : ses tickets passent plus souvent qu'annoncé."],
          ["Multiboost", "Bonus de cote Betclic selon le nombre de sélections. Désactivé par défaut (Paramètres)."],
        ]} />
        <${G} id="marches" title="Les marchés" items=${[
          ["1 · N · 2", "Victoire de l'équipe à domicile · match nul · victoire de l'équipe à l'extérieur (temps réglementaire)."],
          ["Double chance (1N, 12, N2)", "Deux issues sur trois : « ne perd pas » (1N, N2) ou « pas de nul » (12)."],
          ["Les deux équipes marquent (BTTS)", "Oui : chaque équipe marque au moins un but. Non : au moins une ne marque pas."],
          ["Plus / moins de 2,5 buts", "Au moins 3 buts dans le match / au plus 2."],
          ["Gagne ou 2 buts d'avance", "Gagné si l'équipe gagne, ou si elle a mené de 2 buts à un moment du match."],
          ["Buteur / joueur décisif", "Le joueur marque / marque ou fait une passe décisive. Pas de cote française accessible : saisis la cote que tu vois."],
        ]} />
        <${G} id="suivi" title="Suivi, audit et mesures" items=${[
          ["Paper betting (u)", "Tickets fictifs joués par le système, 1 unité chacun : on mesure sans risquer d'argent."],
          ["Test / réel", "Tes tickets enregistrés : « test » = simulation, pas joué ; « réel » = joué pour de vrai. Les deux sont audités, seuls les réels entrent dans le bilan en euros."],
          ["Fantôme", "Ticket qu'aurait proposé chaque autre stratégie, suivi en silence pour apprendre laquelle marche le mieux."],
          ["EN ATTENTE · GAGNÉ · PERDU", "Statut d'un pari ou d'une sélection. ANNULÉ : match reporté ou annulé (cote 1). À VÉRIFIER : à confirmer à la main (ex. buteur non trouvé)."],
          ["CLV (cote de clôture)", "Compare la cote prise à la cote juste juste avant le match. La battre régulièrement est le meilleur signe d'un vrai avantage, bien avant les gains."],
          ["Log loss", "Note d'erreur des probabilités : plus bas = meilleur. Prévoir 1/3-1/3-1/3 donne 1,099 ; le marché fait environ 0,99."],
          ["IC 95 %", "Fourchette dans laquelle se situe probablement la vraie valeur. Très large avec peu de semaines : aucune conclusion possible."],
          ["Apprentissage / validation / test final", "Trois périodes de l'historique : on ajuste, on décide si un réglage est gardé, puis on mesure sur des matchs qui n'ont servi à aucun choix."],
          ["Couverture", "Contrôle à chaque mise à jour : matchs à venir analysés, avec cote, résultats manquants, reports, doublons (Automatique › Détails)."],
        ]} />
      </div>
    </details></section>`;
  }

  /* --------------------------------------------------------------- export utilitaire */
  async function offerExport(ctx, filename, data, note) {
    const r = await P.offerFile(filename, data);
    if (r.ok) { ctx.notify(r.r === "saved" || r.r === undefined ? "Fichier proposé à l'enregistrement" : "Fichier transmis", "pos"); return; }
    if (r.code === "declined" || r.code === "cancelled") { ctx.notify("Enregistrement annulé"); return; }
    ctx.setExportPayload({ filename, data, note });
  }

  /* =========================================================================
     ONGLET 1 — DASHBOARD & DRIVERS
     ========================================================================= */
  /** Résumé en tête du tableau de bord : l'essentiel en un coup d'œil, chaque tuile mène à son détail */
  function DashSummary({ ctx }) {
    const { state, today } = ctx;
    const picks = (state.picks || []).filter((p) => p.status === "EN ATTENTE");
    const todayN = picks.filter((p) => p.date === today).length;
    const win = FQ.P.ticketWindow(today, state.settings);
    const tks = FQ.P.scenarios(state.settings).map((sc) => (state.paperTickets || []).find((t) => t.week === win.week && t.scenario === sc.id)).filter(Boolean);
    const ps = betStats(state.paperTickets || []), rs = betStats((state.realBets || []).filter(FQ.P.isRealBet)), ts = betStats((state.realBets || []).filter((b) => !FQ.P.isRealBet(b)));
    const done = (state.picks || []).filter((p) => p.status === "GAGNÉ" || p.status === "PERDU");
    const won = done.filter((p) => p.status === "GAGNÉ").length;
    const tr = FQ.TRAINED && FQ.TRAINED.picks && FQ.TRAINED.picks.test;
    const Tile = ({ to, label, value, sub, tone }) => html`<button className="ds-tile" onClick=${() => { ctx.setTab(to); try { history.replaceState(null, "", "#" + to); } catch (e) {} }}>
      <span className="eyebrow">${label}</span><b className=${"ds-v mono " + (tone ? "t-" + tone : "")}>${value}</b><span className="muted small">${sub}</span></button>`;
    return html`<section className="dash-sum" aria-label="Résumé">
      <${Tile} to="pronostics" label="Pronostics" value=${picks.length} sub=${`matchs sur 14 jours · ${todayN} aujourd'hui`} />
      <${Tile} to="pronostics" label="Tickets de la semaine" value=${tks.length ? tks.map((t) => fr(t.totalOdds, 1)).join(" · ") : "—"} sub=${tks.length ? tks.map((t) => t.label).join(" · ") : win.open ? "pas encore assez de cotes" : `construits à partir du ${shortDay(win.from)}`} />
      <${Tile} to="audit" label="Choix réussis" value=${done.length ? pct(won / done.length, 0) : tr ? pct(tr.hitRate, 0) : "—"} sub=${done.length ? `${won}/${done.length} depuis la mise en service` : "sur la saison en cours (test historique)"} />
      <${Tile} to="audit" label="Paper betting" value=${sgn(ps.profit) + " u"} tone=${ps.profit > 0 ? "pos" : ps.profit < 0 ? "neg" : null} sub=${`${ps.done} réglé(s) · ${ps.open} en cours`} />
      <${Tile} to="audit" label="Mes paris réels" value=${sgn(rs.profit) + " €"} tone=${rs.profit > 0 ? "pos" : rs.profit < 0 ? "neg" : null} sub=${`${rs.done} réglé(s) · ${rs.open} en cours${ts.n ? ` · ${ts.n} test(s) à part` : ""}`} />
    </section>`;
  }

  function Dashboard({ ctx }) {
    const match = ctx.selectedId ? ctx.matchById.get(ctx.selectedId) : null;
    return html`
      <${DashSummary} ctx=${ctx} />
      <div className="grid-dash">
        <div className="col-left">
          <${CalendarPanel} ctx=${ctx} />
          <${StandingsPanel} ctx=${ctx} />
          <${DataStatus} ctx=${ctx} />
        </div>
        <div className="col-right" id="match-center">
          ${match ? html`<${MatchWorkspace} key=${match.id + ctx.mode} ctx=${ctx} match=${match} />`
            : html`<${Card} eyebrow="Analyse d'un match" title="Choisissez une rencontre"><${Empty} icon="CalendarSearch">Cliquez « Analyser » sur une rencontre du calendrier pour voir les probabilités, les drivers, les enjeux et le classement projeté.<//><//>`}
        </div>
      </div>`;
  }

  /* ----------------------------------------------- Zone A : sélection + calendrier */
  function CalendarPanel({ ctx }) {
    const { matches, today, state } = ctx;
    const [view, setView] = useState("week");
    const [day, setDay] = useState(today);
    const [comp, setComp] = useState("ALL");
    const [season, setSeason] = useState("ALL");
    const [q, setQ] = useState("");
    const [statusF, setStatusF] = useState("ALL");
    const [anaF, setAnaF] = useState("ALL");
    const [dataF, setDataF] = useState("ALL");
    const [tz, setTz] = useState(() => P.pref("tz") || ctx.settings.timezone || "Europe/Paris");
    const [month, setMonth] = useState(today.slice(0, 7));
    const [adding, setAdding] = useState(false);
    const [batchMsg, setBatchMsg] = useState(null);

    const analysed = useMemo(() => new Set(state.predictions.map((p) => p.matchId)), [state.predictions]);
    const playedCount = useMemo(() => {
      const c = {};
      matches.forEach((m) => { if (m.hg === null) return; for (const t of [m.home, m.away]) { const k = m.comp + "|" + t; c[k] = (c[k] || 0) + 1; } });
      return c;
    }, [matches]);
    const enriched = useMemo(() => matches.map((m) => {
      const ko = FQ.time.kickoffUtc(m.date, m.time, m.tz);
      const dd = ko ? FQ.time.dateInTz(ko, tz) : m.date;
      const hasData = (playedCount[m.comp + "|" + m.home] || 0) >= 3 && (playedCount[m.comp + "|" + m.away] || 0) >= 3;
      return { m, ko, dd, hasData, analysed: analysed.has(m.id) };
    }), [matches, tz, playedCount, analysed]);

    const seasons = comp === "ALL" ? [] : [...new Set(matches.filter((m) => m.comp === comp).map((m) => m.season))];
    let from = today, to = today;
    if (view === "week") { to = U.addDays(today, 6); }
    if (view === "date") { from = to = day; }
    if (view === "month") { from = day.slice(0, 7) === month ? day : month + "-01"; to = from === day ? day : month + "-31"; }
    const filt = (e) => (comp === "ALL" || e.m.comp === comp) && (season === "ALL" || e.m.season === season) &&
      (!q || FQ.normName(e.m.home + " " + e.m.away).includes(FQ.normName(q))) &&
      (statusF === "ALL" || e.m.status === statusF) && (anaF === "ALL" || (anaF === "yes") === e.analysed) && (dataF === "ALL" || (dataF === "yes") === e.hasData);
    const list = enriched.filter((e) => e.dd >= from && e.dd <= to && filt(e));
    const upcoming = enriched.filter((e) => e.dd >= today && e.dd <= U.addDays(today, 7) && !e.analysed && e.hasData && e.m.status === "PROGRAMMÉ" && (comp === "ALL" || e.m.comp === comp));

    // mois
    const monthDays = useMemo(() => {
      const [y, mo] = month.split("-").map(Number);
      const first = new Date(Date.UTC(y, mo - 1, 1)); const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const lead = (first.getUTCDay() + 6) % 7;
      const counts = {}; enriched.filter(filt).forEach((e) => { if (e.dd.slice(0, 7) === month) counts[e.dd] = (counts[e.dd] || 0) + 1; });
      return { lead, n, counts };
    }, [month, enriched, comp, season, q, statusF, anaF, dataF]);

    const grouped = {};
    list.forEach((e) => { (grouped[e.dd] = grouped[e.dd] || []).push(e); });

    function analyzeWeek() {
      const res = batchAnalyze(ctx, enriched.filter((e) => e.dd >= today && e.dd <= U.addDays(today, 6) && e.m.status === "PROGRAMMÉ" && (comp === "ALL" || e.m.comp === comp)).map((e) => e.m));
      setBatchMsg(res);
    }

    return html`<${Card} eyebrow="Calendrier" title="Calendrier des 13 compétitions" right=${html`<${Btn} small onClick=${analyzeWeek} title="Le pilote automatique le fait déjà à chaque cycle"><${Ic} n="Zap" /> Réanalyser la semaine<//>`}>
      ${batchMsg && html`<div className="note"><b>${batchMsg.analysed}</b> match(s) analysé(s), <b>${batchMsg.insufficient}</b> avec données insuffisantes, ${batchMsg.skipped} déjà analysé(s). Aucune requête externe : calcul local sur les données chargées. <button className="link" onClick=${() => ctx.setTab("pronostics")}>Voir les pronostics →</button></div>`}
      <details className="filt-d"><summary className="small muted"><${Ic} n="Filter" /> Filtres (compétition, équipe, statut, fuseau)</summary>
      <div className="filters">
        <${Field} label="Compétition" id="f-comp"><select id="f-comp" className="inp" value=${comp} onChange=${(e) => { setComp(e.target.value); setSeason("ALL"); }}>
          <option value="ALL">Les 13 compétitions</option>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//>
        <${Field} label="Saison" id="f-season"><select id="f-season" className="inp" value=${season} onChange=${(e) => setSeason(e.target.value)} disabled=${comp === "ALL"}>
          <option value="ALL">Toutes</option>${seasons.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
        <${Field} label="Équipe" id="f-q"><input id="f-q" className="inp" value=${q} placeholder="Rechercher…" onChange=${(e) => setQ(e.target.value)} /><//>
        <${Field} label="Statut" id="f-st"><select id="f-st" className="inp" value=${statusF} onChange=${(e) => setStatusF(e.target.value)}>
          <option value="ALL">Tous</option><option>PROGRAMMÉ</option><option>TERMINÉ</option><option>RÉSULTAT MANQUANT</option><option>REPORTÉ</option></select><//>
        <${Field} label="Analyse" id="f-an"><select id="f-an" className="inp" value=${anaF} onChange=${(e) => setAnaF(e.target.value)}><option value="ALL">Toutes</option><option value="yes">Analysés</option><option value="no">Non analysés</option></select><//>
        <${Field} label="Données" id="f-da"><select id="f-da" className="inp" value=${dataF} onChange=${(e) => setDataF(e.target.value)}><option value="ALL">Toutes</option><option value="yes">Disponibles</option><option value="no">Insuffisantes</option></select><//>
        <${Field} label="Fuseau" id="f-tz"><select id="f-tz" className="inp" value=${tz} onChange=${(e) => { setTz(e.target.value); P.pref("tz", e.target.value); }}>${TZS.map((z) => html`<option key=${z}>${z}</option>`)}</select><//>
      </div></details>
      <div className="seg" role="tablist">
        ${[["today", "Aujourd'hui"], ["week", "Cette semaine"], ["month", "Mois"], ["date", "Date"]].map(([k, l]) => html`<button key=${k} className=${view === k ? "on" : ""} onClick=${() => { setView(k); if (k === "today") setDay(today); }}>${l}</button>`)}
        ${view === "date" && html`<input type="date" className="inp" value=${day} onChange=${(e) => e.target.value && setDay(e.target.value)} aria-label="Date" />`}
      </div>
      ${view === "month" && html`<div className="month">
        <div className="row justify-between items-center"><${Btn} small onClick=${() => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); setMonth(d.toISOString().slice(0, 7)); }}><${Ic} n="ChevronLeft" /><//>
          <b className="cap">${new Date(month + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</b>
          <${Btn} small onClick=${() => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); setMonth(d.toISOString().slice(0, 7)); }}><${Ic} n="ChevronRight" /><//></div>
        <div className="mgrid">${["L", "M", "M", "J", "V", "S", "D"].map((d, i) => html`<div key=${"h" + i} className="mh">${d}</div>`)}
          ${Array.from({ length: monthDays.lead }, (_, i) => html`<div key=${"l" + i}></div>`)}
          ${Array.from({ length: monthDays.n }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, "0")}`; const n = monthDays.counts[d] || 0;
            return html`<button key=${d} className=${"mday" + (d === day ? " on" : "") + (d === today ? " today" : "") + (n ? " has" : "")} onClick=${() => setDay(d)}><span>${i + 1}</span>${n ? html`<small>${n}</small>` : null}</button>`; })}
        </div><div className="muted small">Sélectionnez un jour pour afficher ses rencontres.</div></div>`}
      ${upcoming.length > 0 && html`<details className="upnext"><summary><${Ic} n="Timer" /> Prochains matchs à analyser (7 jours) : <b>${upcoming.length}</b></summary>
        <div className="chips">${upcoming.slice(0, 12).map((e) => html`<button key=${e.m.id} className="chip" onClick=${() => ctx.analyze(e.m.id)}><${CompTag} code=${e.m.comp} /> ${e.m.home} – ${e.m.away}</button>`)}</div></details>`}
      <div className="fixtures">
        ${list.length === 0 ? html`<${Empty} icon="CalendarX">Aucune rencontre programmée dans la source pour cette période et ces filtres.${comp !== "ALL" && ctx.cov && ctx.cov[comp] ? html`<br/><span className="small">${ctx.cov[comp].note}</span>` : null}<//>` :
          Object.entries(grouped).slice(0, 40).map(([d, arr]) => html`<div key=${d} className="fx-day">
            <div className="fx-date">${new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} <span className="muted">· ${arr.length}</span></div>
            ${arr.map((e) => html`<${FixtureRow} key=${e.m.id} e=${e} tz=${tz} ctx=${ctx} />`)}
          </div>`)}
        ${list.length > 0 && Object.keys(grouped).length > 40 && html`<div className="muted small">Affichage limité à 40 jours : affinez les filtres.</div>`}
      </div>
      <div className="row gap-2 mt-2"><${Btn} small onClick=${() => setAdding(!adding)}><${Ic} n="Plus" /> Ajouter une rencontre manuellement<//><span className="muted small">Pour les compétitions sans calendrier gratuit vérifié (UCL 2026-27, J1, Saudi Pro League).</span></div>
      ${adding && html`<${AddMatchForm} ctx=${ctx} onDone=${() => setAdding(false)} />`}
    <//>`;
  }

  function FixtureRow({ e, tz, ctx }) {
    const m = e.m;
    const time = e.ko ? FQ.time.formatInTz(e.ko, tz, { hour: "2-digit", minute: "2-digit" }) : "—:—";
    const tone = m.status === "TERMINÉ" ? "muted" : m.status === "PROGRAMMÉ" ? "info" : "warn";
    return html`<div className=${"fx" + (ctx.selectedId === m.id ? " sel" : "")}>
      <div className="fx-time mono">${time}</div>
      <div className="fx-main">
        <div className="fx-meta"><${CompTag} code=${m.comp} /><span className="muted small">${m.round}${m.neutral ? " · terrain neutre" : ""}${m.manual ? " · saisie manuelle" : ""}</span></div>
        <div className="fx-teams"><span>${m.home}</span>${m.hg !== null ? html`<b className="mono score">${m.hg} – ${m.ag}</b>` : html`<span className="muted">–</span>`}<span>${m.away}</span></div>
        <div className="fx-flags"><${Pill} tone=${tone}>${m.status}<//>
          <${Pill} tone=${e.hasData ? "pos" : "muted"} title="Au moins 3 matchs joués par équipe dans les données">${e.hasData ? "stats ✓" : "stats insuffisantes"}<//>
          ${e.analysed && html`<${Pill} tone="accent">prédiction enregistrée<//>`}</div>
      </div>
      <${Btn} small kind=${ctx.selectedId === m.id ? "primary" : "ghost"} onClick=${() => ctx.analyze(m.id)}>Analyser<//>
    </div>`;
  }

  function AddMatchForm({ ctx, onDone }) {
    const [f, setF] = useState({ comp: "CL", date: U.addDays(ctx.today, 1), time: "21:00", home: "", away: "", neutral: false, round: "" });
    const teams = useMemo(() => [...new Set(ctx.matches.filter((m) => m.comp === f.comp).flatMap((m) => [m.home, m.away]))].sort(), [f.comp, ctx.matches]);
    const err = !f.home || !f.away ? "Renseignez les deux équipes" : f.home === f.away ? "Équipes identiques" : !/^\d{4}-\d{2}-\d{2}$/.test(f.date) ? "Date invalide" : null;
    return html`<form className="subform" onSubmit=${(e) => { e.preventDefault(); if (err) return;
        const id = `USR-${f.comp}-${f.date}-${FQ.normName(f.home).slice(0, 12)}-${FQ.normName(f.away).slice(0, 12)}`.replace(/ /g, "-");
        if (ctx.matches.some((m) => m.id === id)) { ctx.notify("Cette rencontre existe déjà", "warn"); return; }
        ctx.update((s) => { s.userMatches.push({ id, comp: f.comp, season: "saisie", date: f.date, time: f.time, tz: "Europe/Paris", round: f.round || "Saisie manuelle", home: f.home.trim(), away: f.away.trim(), neutral: f.neutral, manual: true, createdAt: new Date().toISOString() }); return s; });
        ctx.notify("Rencontre ajoutée (source : saisie utilisateur)", "pos"); onDone(); }}>
      <datalist id="teamlist">${teams.map((t) => html`<option key=${t} value=${t} />`)}</datalist>
      <div className="filters">
        <${Field} label="Compétition" id="am-c"><select id="am-c" className="inp" value=${f.comp} onChange=${(e) => setF({ ...f, comp: e.target.value })}>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//>
        <${Field} label="Date" id="am-d"><input id="am-d" type="date" className="inp" value=${f.date} onChange=${(e) => setF({ ...f, date: e.target.value })} /><//>
        <${Field} label="Heure (Paris)" id="am-t"><input id="am-t" type="time" className="inp" value=${f.time} onChange=${(e) => setF({ ...f, time: e.target.value })} /><//>
        <${Field} label="Domicile" id="am-h"><input id="am-h" list="teamlist" className="inp" value=${f.home} onChange=${(e) => setF({ ...f, home: e.target.value })} /><//>
        <${Field} label="Extérieur" id="am-a"><input id="am-a" list="teamlist" className="inp" value=${f.away} onChange=${(e) => setF({ ...f, away: e.target.value })} /><//>
        <${Field} label="Phase / journée" id="am-r"><input id="am-r" className="inp" value=${f.round} onChange=${(e) => setF({ ...f, round: e.target.value })} /><//>
      </div>
      <label className="check"><input type="checkbox" checked=${f.neutral} onChange=${(e) => setF({ ...f, neutral: e.target.checked })} /> Terrain neutre</label>
      <div className="row gap-2 mt-2"><${Btn} type="submit" kind="primary" disabled=${!!err}>Ajouter<//><${Btn} onClick=${onDone}>Annuler<//>${err && html`<span className="muted small">${err}</span>`}</div>
      <div className="muted small mt-1">Une équipe absente des données d'entraînement ne peut être modélisée qu'avec des λ saisis (fiabilité plafonnée à 40).</div>
    </form>`;
  }

  /* ----------------------------------------------- pipeline partagé (voir autopilot.js) */
  const { buildPrediction, makeSnapshot, standingsSnapshot, demoOddsMap, defaultPlayersFor, computePlayer } = FQ.P;
  function batchAnalyze(ctx, list) {
    const s2 = structuredClone(ctx.state);
    const res = FQ.P.analyzeList(Object.assign({}, ctx, { state: s2 }), list, { force: false });
    ctx.update(() => s2);
    return res;
  }

  /* ----------------------------------------------- Zone B/C/D : espace de travail du match */
  function MatchWorkspace({ ctx, match }) {
    const [drivers, setDrivers] = useState({});
    const [neutral, setNeutral] = useState(!!match.neutral);
    const [useManual, setUseManual] = useState(false);
    const [manual, setManual] = useState({ h: 1.4, a: 1.1 });
    const [launched, setLaunched] = useState(false);
    const [players, setPlayers] = useState(() => defaultPlayersFor(ctx, match));
    const [odds, setOdds] = useState({});
    const [applyStake, setApplyStake] = useState(false);
    const opts = { drivers, neutral, manualLambda: useManual ? manual : null, applyStake };
    const b = useMemo(() => buildPrediction(ctx, match, opts), [match.id, JSON.stringify(drivers), neutral, useManual, manual.h, manual.a, ctx.getModel, ctx.state.calibration.version, applyStake, ctx.state.calibration.stakeTest]);
    const b0 = useMemo(() => (applyStake ? buildPrediction(ctx, match, Object.assign({}, opts, { applyStake: false })) : null), [b]);
    const pl = useMemo(() => (b.pr.ok ? players.map((p) => computePlayer(ctx, match, b, p)) : []), [b, players]);
    useEffect(() => { if (ctx.mode === "demo") { const m = demoOddsMap(ctx, match, players) || {}; setOdds(m); } else { const m = FQ.P.matchOddsMap(match, ctx.state.settings); if (m) setOdds(m); } }, [match.id]);
    const existing = ctx.state.predictions.filter((p) => p.matchId === match.id);

    function savePlayers(next) {
      setPlayers(next);
      ctx.update((s) => {
        for (const [side, team] of [["H", match.home], ["A", match.away]]) s.players[match.comp + "|" + team] = next.filter((p) => p.side === side).map(({ team: _t, side: _s, ...rest }) => rest);
        return s;
      });
    }
    function record() {
      const okPlayers = pl.filter((p) => !p.incomplete);
      const snap = makeSnapshot(ctx, match, b, opts, okPlayers, odds);
      ctx.update((s) => {
        s.opportunities.forEach((o) => { if (o.matchId === match.id && o.status === "ouverte") o.status = "remplacée"; });
        s.predictions.push(snap.pred); s.opportunities.push(...snap.opps);
        s.log.push({ t: snap.pred.createdAt, text: `Prédiction enregistrée : ${match.home} – ${match.away}` });
        return s;
      });
      ctx.notify("Prédiction figée et envoyée aux pronostics", "pos");
    }

    return html`<div className="stack">
      <${MatchCenter} ctx=${ctx} match=${match} b=${b} />
      <${StakesCard} ctx=${ctx} match=${match} b=${b} b0=${b0} applyStake=${applyStake} setApplyStake=${setApplyStake} />
      <${Card} eyebrow="Zone C · Drivers interactifs" title="Contexte du match" right=${html`<${Btn} small onClick=${() => { setDrivers({}); setNeutral(!!match.neutral); setUseManual(false); }}><${Ic} n="RotateCcw" /> Réinitialiser<//>`}>
        <div className="muted small mb-2">Les effets sont des <b>hypothèses non apprises</b>, explicites et plafonnées (multiplicateur total de λ entre ${FQ.DRIVER_CAP[0]} et ${FQ.DRIVER_CAP[1]}). Valeurs mesurées : repos ${b.ch.restDays ?? "—"} j (dom.) / ${b.ca.restDays ?? "—"} j (ext.) d'après le calendrier de la compétition seulement.</div>
        <div className="drivers">
          ${FQ.DRIVER_DEFS.map((d) => { const v = drivers[d.key] || 0; const eff = d.effect;
            const effTxt = eff.selfLam ? `${sgn(eff.selfLam * 100, 1)} % λ ${d.side === "H" ? "dom." : "ext."} / unité` : eff.oppLam ? `${sgn(eff.oppLam * 100, 1)} % λ adverse / unité` : `${sgn(eff.bothLam * 100, 1)} % λ des deux / unité`;
            return html`<div key=${d.key} className=${"drv" + (v ? " active" : "")}>
              <label htmlFor=${"d-" + d.key}>${d.label}</label>
              <div className="row gap-2 items-center"><input id=${"d-" + d.key} type="range" min=${d.min} max=${d.max} step=${d.step} value=${v} onChange=${(e) => setDrivers({ ...drivers, [d.key]: +e.target.value })} /><b className="mono">${v > 0 && d.min < 0 ? "+" : ""}${v}</b></div>
              <span className="muted small">${effTxt} · hypothèse</span></div>`; })}
        </div>
        <div className="row gap-3 mt-2 wrap">
          <label className="check"><input type="checkbox" checked=${neutral} onChange=${(e) => setNeutral(e.target.checked)} /> Terrain neutre (avantage domicile γ annulé)</label>
          <label className="check"><input type="checkbox" checked=${useManual} onChange=${(e) => setUseManual(e.target.checked)} /> Saisir λ manuellement</label>
          ${useManual && html`<span className="row gap-1 items-center small">λ dom. <${NumInput} value=${manual.h} min=${0.05} max=${6} onChange=${(v) => v !== null && setManual({ ...manual, h: v })} width="4.5rem" /> λ ext. <${NumInput} value=${manual.a} min=${0.05} max=${6} onChange=${(v) => v !== null && setManual({ ...manual, a: v })} width="4.5rem" /></span>`}
        </div>
      <//>
      <${PlayersPanel} ctx=${ctx} match=${match} players=${players} computed=${pl} onChange=${savePlayers} />
      <${Card} eyebrow="Zone D · Analyse prédictive" title="Probabilités, valeur et mise" right=${html`<${Btn} kind="primary" onClick=${() => setLaunched(true)}><${Ic} n="Play" /> Lancer la prédiction ML/RL<//>`}>
        <${EngineStatus} ctx=${ctx} b=${b} />
        ${!launched ? html`<${Empty} icon="Activity">Ajustez les drivers puis lancez la prédiction. Les probabilités se recalculent ensuite à chaque modification.<//>`
          : !b.pr.ok ? html`<div className="alert"><${Ic} n="TriangleAlert" /> ${b.pr.reason}. Recommandation : NO BET. Vous pouvez saisir λ manuellement (hypothèse, fiabilité plafonnée).</div>`
          : html`<${PredictionView} ctx=${ctx} match=${match} b=${b} players=${pl} odds=${odds} setOdds=${setOdds} />
            <div className="row gap-2 mt-3 wrap items-center"><${Btn} kind="primary" onClick=${record}><${Ic} n="Lock" /> Figer la prédiction et l'envoyer aux pronostics<//>
              <span className="muted small">${existing.length ? `${existing.length} snapshot(s) déjà enregistré(s) pour ce match ; les nouvelles opportunités remplacent les anciennes encore ouvertes.` : "Le snapshot (données, paramètres, drivers, cotes, version) ne sera plus jamais modifié."}</span></div>`}
      <//>
    </div>`;
  }

  function EngineStatus({ ctx, b }) {
    const cal = ctx.state.calibration;
    const nQ = ctx.state.qlog.length;
    const active = Object.values(ctx.qtable).filter((q) => q.n >= ctx.settings.agentMinN).length;
    return html`<div className="engine">
      <div><span className="lvl on">A</span> Modèle statistique opérationnel : ${b.pr.source || "—"}${b.model && b.model.ok ? ` · ${b.model.nMatches} matchs, μ=${fr(b.model.mu, 3)}, γ=${fr(b.model.gamma, 3)}, ρ=${fr(b.model.rho, 2)}, ${b.model.iterations} itérations${b.model.converged ? " (convergé)" : " (non convergé)"}` : ""}</div>
      <div><span className="lvl off">B</span> ML supervisé avancé (gradient boosting, xG) : <b>non actif</b> — aucune donnée xG/xA libre exploitable ici ; l'architecture accepte un modèle externe via λ saisis.</div>
      <div><span className=${"lvl " + (cal.version > 1 ? "on" : "off")}>C</span> Calibration : v${cal.version} (T 1N2 ${fr(cal.T1N2, 2)}, BTTS ${fr(cal.TBTTS, 2)}, joueurs ${fr(cal.TPLAYER, 2)})${cal.version > 1 ? "" : " — aucun ajustement retenu à ce stade"}</div>
      <div><span className=${"lvl " + (active ? "on" : "off")}>RL</span> Agent de décision : politique déterministe + bandit contextuel (${nQ} observations, ${active} état(s) actif(s) à n ≥ ${ctx.settings.agentMinN}).</div>
    </div>`;
  }

  function MatchCenter({ ctx, match, b }) {
    const ko = FQ.time.kickoffUtc(match.date, match.time, match.tz);
    const table = useMemo(() => FQ.standings(ctx.matches, match.comp, match.season, match.date), [match.id, ctx.matches]);
    const rank = (t) => { const i = table.findIndex((x) => x.team === t); return i >= 0 ? i + 1 : null; };
    const h2h = ctx.matches.filter((m) => m.hg !== null && m.date < match.date && ((m.home === match.home && m.away === match.away) || (m.home === match.away && m.away === match.home))).slice(-4);
    const T = (t) => (b.model && b.model.ok ? b.model.teams[t] : null);
    const side = (team, c, label) => {
      const r = T(team);
      return html`<div className="team-col">
        <div className="eyebrow">${label}</div><div className="team-n">${team}</div>
        <div className="muted small">${rank(team) ? `${rank(team)}e · ${table[rank(team) - 1].pts} pts` : "hors classement"} · ${c.played} matchs ${c.season || ""}</div>
        <div className="form">${c.last5.map((x) => html`<span key=${x.id} className=${"f f-" + x.r} title=${`${dFR(x.date)} ${x.home ? "vs" : "@"} ${x.opp} ${x.gf}-${x.ga}`}>${x.r}</span>`)}${!c.last5.length && html`<span className="muted small">aucun résultat</span>`}</div>
        <dl className="kv">
          <dt>Buts pour / contre</dt><dd className="mono">${c.gf} / ${c.ga}</dd>
          <dt>Dom. (n, BP-BC)</dt><dd className="mono">${c.home.n} · ${c.home.gf}-${c.home.ga}</dd>
          <dt>Ext. (n, BP-BC)</dt><dd className="mono">${c.away.n} · ${c.away.gf}-${c.away.ga}</dd>
          <dt>Force attaque e^att</dt><dd className="mono">${r ? fr(Math.exp(r.att), 2) : "—"}</dd>
          <dt>Faiblesse déf. e^def</dt><dd className="mono">${r ? fr(Math.exp(r.def), 2) : "—"}</dd>
          <dt>Matchs pondérés</dt><dd className="mono">${r ? fr(r.nEff, 1) : "—"}${r && r.promoted ? " · promu" : ""}</dd>
          <dt>Repos</dt><dd className="mono">${c.restDays ?? "—"} j</dd>
          <dt>Résultats manquants</dt><dd className=${"mono " + (c.missing ? "t-warn" : "")}>${c.missing}</dd>
        </dl></div>`;
    };
    return html`<${Card} eyebrow="Zone B · Match Center" title=${`${match.home} – ${match.away}`} right=${html`<${CompTag} code=${match.comp} />`}>
      <div className="muted small mb-2">${COMP[match.comp] ? COMP[match.comp].name : match.comp} · ${match.round} · ${ko ? FQ.time.formatInTz(ko, "Europe/Paris", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) + " (Paris)" : dFR(match.date)} · source : ${match.source}${match.hg !== null ? ` · score ${match.hg}-${match.ag}` : ""}</div>
      ${match.date < ctx.today && html`<div className="note small">Match passé : le modèle est ajusté uniquement sur les matchs antérieurs au ${dFR(match.date)} (pas de fuite d'information).</div>`}
      <div className="teams2">${side(match.home, b.ch, "Domicile")}${side(match.away, b.ca, "Extérieur")}</div>
      ${b.missing > 0 && html`<div className="alert warn small"><${Ic} n="TriangleAlert" /> ${b.missing} résultat(s) récent(s) de ces équipes absent(s) de la source : saisissez-les dans l'onglet Audit pour actualiser le modèle.</div>`}
      <div className="muted small mt-2">Confrontations dans les données (non utilisées directement par le modèle, à lire avec prudence) : ${h2h.length ? h2h.map((m) => `${dFR(m.date)} ${m.home} ${m.hg}-${m.ag} ${m.away}`).join(" · ") : "aucune"}</div>
    <//>`;
  }

  function PlayersPanel({ ctx, match, players, computed, onChange }) {
    const set = (i, k, v) => { const n = players.map((p, j) => (j === i ? Object.assign({}, p, { [k]: v }, k === "shareGoals" || k === "shareAssists" ? { sharesFromData: false } : {}) : p)); onChange(n); };
    const add = (side) => onChange(players.concat([{ side, team: side === "H" ? match.home : match.away, name: "", pPlay: 0.85, minutes: 75, shareGoals: 0.15, shareAssists: null, sharesFromData: false }]));
    const prefill = () => {
      const n = players.slice();
      for (const [side, team] of [["H", match.home], ["A", match.away]]) {
        const sc = FQ.teamScorers(ctx.matches, match.comp, team, match.date);
        sc.list.slice(0, 3).forEach((x) => { if (!n.some((p) => FQ.sameName(p.name, x.name))) n.push({ side, team, name: x.name, shareGoals: Math.round(((x.goals + 0.5) / (sc.teamGoals + 2)) * 1000) / 1000, shareAssists: null, pPlay: null, minutes: null, sharesFromData: true, note: `${x.goals}/${sc.teamGoals} buts de l'équipe (openfootball)` }); });
      }
      onChange(n);
    };
    return html`<${Card} eyebrow="Zone C · Joueurs" title="Buteur & Joueur Décisif" right=${html`<div className="row gap-1">${ctx.mode === "real" && html`<${Btn} small onClick=${prefill}><${Ic} n="DatabaseZap" /> Pré-remplir<//>`}<${Btn} small onClick=${() => add("H")}>+ dom.<//><${Btn} small onClick=${() => add("A")}>+ ext.<//></div>`}>
      <div className="muted small mb-2">P(buteur) = p<sub>joue</sub>·(1 − e<sup>−λ<sub>équipe</sub>·m/90·s<sub>buts</sub></sup>) ; P(décisif) utilise s<sub>buts</sub> + s<sub>passes</sub> (un même but ne peut être marqué et passé par le même joueur), ce qui traite l'intersection. Part de passes vide = inconnue → marché Joueur Décisif non calculé. Les minutes et la probabilité de jouer ne sont jamais inventées : à saisir.</div>
      ${!players.length ? html`<${Empty} icon="UserRound">${ctx.mode === "real" ? "Aucun joueur. « Pré-remplir » utilise les buteurs de la source quand ils existent (Bundesliga 2025-26, Super League 2026-27, Coupe du Monde 2026) ; sinon, saisie manuelle." : "Aucun joueur."}<//>` :
      html`<${TableWrap}><table className="tbl">
        <thead><tr><th>Équipe</th><th>Joueur</th><th title="Probabilité de jouer">p joue</th><th>Min. si joue</th><th title="Part des buts de l'équipe">Part buts</th><th title="Part des passes décisives de l'équipe">Part passes</th><th>Compo off.</th><th>P(buteur)</th><th>P(décisif)</th><th>Fiab.</th><th></th></tr></thead>
        <tbody>${players.map((p, i) => { const c = computed[i] || {}; return html`<tr key=${i}>
          <td className="small">${p.side === "H" ? "Dom." : "Ext."}</td>
          <td><input className="inp" style=${{ minWidth: "9rem" }} value=${p.name} onChange=${(e) => set(i, "name", e.target.value)} aria-label="Nom" />${p.note && html`<div className="muted tiny">${p.note}</div>`}</td>
          <td><${NumInput} value=${p.pPlay} min=${0} max=${1} onChange=${(v) => set(i, "pPlay", v)} width="4rem" placeholder="0–1" /></td>
          <td><${NumInput} value=${p.minutes} min=${0} max=${95} onChange=${(v) => set(i, "minutes", v)} width="4rem" placeholder="min" /></td>
          <td><${NumInput} value=${p.shareGoals} min=${0} max=${0.95} onChange=${(v) => set(i, "shareGoals", v)} width="4.2rem" placeholder="0–1" /></td>
          <td><${NumInput} value=${p.shareAssists} min=${0} max=${0.95} onChange=${(v) => set(i, "shareAssists", v)} width="4.2rem" placeholder="?" /></td>
          <td><input type="checkbox" checked=${!!p.lineupConfirmed} onChange=${(e) => set(i, "lineupConfirmed", e.target.checked)} aria-label="Composition officielle" /></td>
          <td className="mono">${c.incomplete ? html`<span className="muted small">à compléter</span>` : pct(c.pScore)}</td>
          <td className="mono">${c.incomplete ? "—" : c.pDecisive === null ? html`<span className="muted small">passes inconnues</span>` : pct(c.pDecisive)}</td>
          <td className="mono">${c.incomplete ? "—" : c.rel}</td>
          <td><button className="iconbtn" aria-label="Retirer" onClick=${() => onChange(players.filter((_, j) => j !== i))}><${Ic} n="X" s=${14} /></button></td>
        </tr>`; })}</tbody></table><//>`}
    <//>`;
  }

  function PredictionView({ ctx, match, b, players, odds, setOdds }) {
    const mk = b.pr.markets;
    const s = ctx.settings;
    const sm = b.pr.matrix;
    const maxCell = Math.max(...sm.M.slice(0, 6).flatMap((r) => r.slice(0, 6)));
    const rows = [
      { market: "1N2", sel: "1", label: `1 · ${match.home}`, p: mk.p1, rel: b.rel.score },
      { market: "1N2", sel: "N", label: "N · nul", p: mk.pN, rel: b.rel.score },
      { market: "1N2", sel: "2", label: `2 · ${match.away}`, p: mk.p2, rel: b.rel.score },
      { market: "BTTS", sel: "Oui", label: "BTTS Oui", p: mk.bttsYes, rel: b.rel.score },
      { market: "BTTS", sel: "Non", label: "BTTS Non", p: mk.bttsNo, rel: b.rel.score },
    ];
    players.filter((p) => !p.incomplete).forEach((p) => {
      rows.push({ market: "Buteur", sel: p.name, label: `Buteur · ${p.name}`, p: p.pScore, rel: p.rel, pu: p.inputs.pPlay < 0.05 });
      if (Number.isFinite(p.pDecisive)) rows.push({ market: "Joueur Décisif", sel: p.name, label: `Décisif · ${p.name}`, p: p.pDecisive, rel: p.rel, pu: p.inputs.pPlay < 0.05 });
    });
    const evaluated = rows.map((r) => {
      const o = odds[r.market + "|" + r.sel];
      const opp = { matchId: match.id, market: r.market, p: r.p, rel: r.rel, odds: o ? o.v : null, missing: b.missing, playerUnavailable: r.pu };
      return Object.assign({}, r, FQ.evaluateOpportunity(opp, { settings: ctx.effSettings, acct: ctx.acct, bets: ctx.state.bets, qtable: ctx.qtable }), { odds: o ? o.v : null, src: o ? o.src : null, matchId: match.id });
    });
    FQ.exclusiveMarkets(evaluated);
    const dv1 = FQ.value.devig([odds["1N2|1"]?.v, odds["1N2|N"]?.v, odds["1N2|2"]?.v]);
    const dv2 = FQ.value.devig([odds["BTTS|Oui"]?.v, odds["BTTS|Non"]?.v]);
    const top = b.pr.drivers.detail;
    return html`
      <div className="probs">
        ${[["1", mk.p1, match.home], ["N", mk.pN, "Nul"], ["2", mk.p2, match.away]].map(([k, p, n]) => html`<div key=${k} className="prob"><div className="prob-k">${k}</div><div className="prob-v mono">${pct(p)}</div><div className="prob-bar"><i style=${{ width: (p * 100).toFixed(1) + "%" }}></i></div><div className="muted small ellip">${n}</div></div>`)}
        <div className="prob"><div className="prob-k">BTTS</div><div className="prob-v mono">${pct(mk.bttsYes)}</div><div className="prob-bar"><i style=${{ width: (mk.bttsYes * 100).toFixed(1) + "%" }}></i></div><div className="muted small">Oui · Non ${pct(mk.bttsNo)}</div></div>
      </div>
      ${(() => { const oddsV = {}; Object.entries(odds || {}).forEach(([k, v]) => { if (v && Number.isFinite(v.v)) oddsV[k] = v.v; });
        const pk = FQ.preferredPick(mk, b.rel.score, oddsV, ctx.effSettings, { h: match.home, a: match.away });
        return html`<div className="pickbox mt-2"><div className="eyebrow">Choix préférentiel</div><div className="row gap-2 items-center wrap"><b className="pick-l">${pk.label}</b><span className="mono">${pct(pk.p)}</span>
          ${pk.kind === "value" ? html`<${Pill} tone="pos">Value bet<//>` : html`<${Pill} tone="info">Pronostic sans mise<//>`}${pk.odds ? html`<span className="small">cote ${fr(pk.odds, 2)} · ${srcShort((odds[pk.market + "|" + pk.sel] || {}).src)}</span>` : html`<span className="small muted">aucune cote de bookmaker</span>`}<span className="small muted">cote minimale ${fr(pk.minOdds, 2)} (seuil du modèle)</span></div>
          <div className="small muted">${pk.why}</div></div>`; })()}
      ${match.oddsFr && match.oddsFr.books && html`<details className="mt-2"><summary className="small">Cotes 1N2 des bookmakers français · relevées le ${dtFR(match.oddsFr.at)}</summary>
        <${TableWrap}><table className="tbl tiny"><thead><tr><th>Bookmaker</th><th>1</th><th>N</th><th>2</th><th>Marge</th></tr></thead><tbody>
        ${Object.entries(match.oddsFr.books).map(([k, v]) => html`<tr key=${k} className=${k === (ctx.state.settings.oddsBook || "best") ? "hl" : ""}><td>${(FQ.ETL.FR_BOOKS || {})[k] || k}</td><td className="mono">${fr(v[0], 2)}</td><td className="mono">${fr(v[1], 2)}</td><td className="mono">${fr(v[2], 2)}</td><td className="mono">${pct(1 / v[0] + 1 / v[1] + 1 / v[2] - 1, 1)}</td></tr>`)}
        </tbody></table><//></details>`}
      ${b.pr.blendInfo && html`<div className="note small mt-2">Cote 1N2 connue (${b.pr.blendInfo.src}) : probabilités retenues = ${Math.round(100 * b.pr.blendInfo.w)} % modèle + ${Math.round(100 * (1 - b.pr.blendInfo.w))} % marché sans marge, poids appris sur 12 mois (sur cet historique, le marché seul prédisait mieux que le modèle seul). Modèle seul : 1 ${pct(b.pr.modelMarkets.p1)} · N ${pct(b.pr.modelMarkets.pN)} · 2 ${pct(b.pr.modelMarkets.p2)}. BTTS : modèle seul (pas de cote BTTS gratuite).</div>`}
      <div className="row gap-3 wrap mt-2 small">
        <span>λ dom. <b className="mono">${fr(b.pr.lambdaHome, 2)}</b>${b.pr.base ? html` <span className="muted">(base ${fr(b.pr.base.h, 2)})</span>` : ""}</span>
        <span>λ ext. <b className="mono">${fr(b.pr.lambdaAway, 2)}</b>${b.pr.base ? html` <span className="muted">(base ${fr(b.pr.base.a, 2)})</span>` : ""}</span>
        <span>ρ <b className="mono">${fr(b.pr.rho, 2)}</b></span>
        <span>Masse tronquée (scores > 10) <b className="mono">${fr(sm.truncatedMass * 100, 4)} %</b> (renormalisée)</span>
        <span>Σ 1N2 = <b className="mono">${fr((mk.p1 + mk.pN + mk.p2) * 100, 6)} %</b></span>
      </div>
      <div className="split mt-3">
        <div>
          <div className="eyebrow">Matrice des scores (0–5), probabilités</div>
          <div className="tbl-wrap"><table className="matrix"><thead><tr><th className="muted">${match.home.slice(0, 10)} ↓ / ${match.away.slice(0, 10)} →</th>${[0, 1, 2, 3, 4, 5].map((j) => html`<th key=${j}>${j}</th>`)}</tr></thead>
            <tbody>${[0, 1, 2, 3, 4, 5].map((i) => html`<tr key=${i}><th>${i}</th>${[0, 1, 2, 3, 4, 5].map((j) => { const v = sm.M[i][j]; return html`<td key=${j} title=${`${i}-${j} : ${pct(v, 2)}`} style=${{ background: `rgba(235,181,74,${(0.06 + 0.8 * v / maxCell).toFixed(3)})` }} className="mono">${fr(v * 100, 1)}</td>`; })}</tr>`)}</tbody></table></div>
          <div className="muted small mt-1">Scores les plus probables : ${mk.topScores.slice(0, 4).map((x) => `${x.h}-${x.a} (${pct(x.p)})`).join(" · ")}</div>
        </div>
        <div>
          <div className="eyebrow">Fiabilité de l'estimation : ${b.rel.score}/100</div>
          <div className="relbar"><i style=${{ width: b.rel.score + "%" }}></i></div>
          <dl className="kv mt-1"><dt>Profondeur (×0,45)</dt><dd className="mono">${b.rel.depth}</dd><dt>Fraîcheur (×0,35)</dt><dd className="mono">${b.rel.freshness}</dd><dt>Échantillon ligue (×0,20)</dt><dd className="mono">${b.rel.sample}</dd><dt>Pénalité ajustements</dt><dd className="mono">−${b.rel.penalty}</dd></dl>
          <ul className="notes">${b.rel.notes.map((n, i) => html`<li key=${i}>${n}</li>`)}</ul>
          <div className="eyebrow mt-2">Drivers actifs</div>
          ${top.length ? html`<ul className="notes">${top.map((d) => html`<li key=${d.key}>${d.label} (${d.value}) : λ dom. ${sgn(d.dHome * 100, 1)} %, λ ext. ${sgn(d.dAway * 100, 1)} %</li>`)}${b.pr.drivers.capped && html`<li className="t-warn">Plafond appliqué</li>`}</ul>` : html`<div className="muted small">Aucun — probabilités issues du seul modèle ajusté.</div>`}
          <div className="muted tiny mt-1">Probabilité ≠ fiabilité : 80 % de probabilité n'est pas 80 % de confiance dans l'estimation.</div>
        </div>
      </div>
      <div className="eyebrow mt-3">Cotes et valeur ${ctx.mode === "demo" ? "(cotes fictives pré-remplies, modifiables)" : "(1N2 : cotes Bet 365 via ESPN ou football-data.co.uk quand elles sont publiées ; autres marchés : saisie)"}</div>
      <${TableWrap}><table className="tbl">
        <thead><tr><th>Sélection</th><th>Prob.</th><th>Fiab.</th><th>Cote</th><th>P implicite</th><th title="1 / probabilité du modèle : ce n'est pas une cote de bookmaker">Seuil 1/p</th><th>Cote min.</th><th>EV</th><th>Décision</th><th>Mise</th></tr></thead>
        <tbody>${evaluated.map((r) => html`<tr key=${r.market + r.sel}>
          <td>${r.label}</td><td className="mono">${pct(r.p)}</td><td className="mono">${r.rel}</td>
          <td><${NumInput} value=${r.odds} min=${1.01} max=${1000} width="4.6rem" placeholder="cote" onChange=${(v) => setOdds({ ...odds, [r.market + "|" + r.sel]: v === null ? null : { v, src: "saisie utilisateur" } })} /></td>
          <td className="mono">${pct(r.implied)}</td><td className="mono">${fr(r.fair, 2)}</td><td className="mono">${fr(r.minOdds, 2)}</td>
          <td className=${"mono " + (r.ev > 0 ? "t-pos" : r.ev < 0 ? "t-neg" : "")}>${r.ev === null ? "—" : sgn(r.ev * 100, 1) + " %"}</td>
          <td><${DecisionPill} d=${r.decision} /><div className="muted tiny">${r.reasons.join(" · ")}</div></td>
          <td className="mono">${r.stake ? eur(r.stake, s.currency) : "—"}</td></tr>`)}</tbody></table><//>
      <div className="muted small mt-1">${dv1 ? `Marge 1N2 ${pct(dv1.margin)} · probabilités marché corrigées ${dv1.probs.map((x) => pct(x)).join(" / ")}` : "Marge 1N2 : saisir les trois cotes."} · ${dv2 ? `Marge BTTS ${pct(dv2.margin)}` : "Marge BTTS : saisir Oui et Non."} · Marges des marchés joueurs non retraitées (marché incomplet).</div>`;
  }

  /* ----------------------------------------------- Zone E : état des données */
  function DataStatus({ ctx }) {
    const [tests, setTests] = useState({});
    const ENDPOINTS = [
      { id: "openmeteo", name: "Open-Meteo (météo, sans clé)", url: "https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m" },
      { id: "tsdb", name: "TheSportsDB v1 (clé publique 123)", url: "https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4334" },
      { id: "fdorg", name: "football-data.org v4 (clé requise)", url: "https://api.football-data.org/v4/competitions" },
      { id: "github", name: "openfootball (raw.githubusercontent.com)", url: "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/fr.1.json" },
    ];
    async function test(ep) {
      setTests((t) => ({ ...t, [ep.id]: { state: "test…" } }));
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
      const t0 = performance.now();
      try {
        const r = await fetch(ep.url, { signal: ctl.signal });
        setTests((t) => ({ ...t, [ep.id]: { state: r.ok ? "joignable" : `HTTP ${r.status}`, ok: r.ok, ms: Math.round(performance.now() - t0), at: new Date().toISOString() } }));
      } catch (e) {
        setTests((t) => ({ ...t, [ep.id]: { state: e.name === "AbortError" ? "délai dépassé" : "bloqué (politique de sécurité du bac à sable ou CORS)", ok: false, at: new Date().toISOString() } }));
      } finally { clearTimeout(tm); }
    }
    const pi = ctx.persistInfo;
    return html`<${Card} eyebrow="Zone E · État des données" title="Sources, fraîcheur, connexions">
      ${ctx.mode === "demo" ? html`<div className="note">Mode démo : données fictives générées localement (graine fixe). Aucune connexion utilisée.</div>` :
      html`<div className="small">
        <div><b>Sources chargées</b> (jeu reconstruit le ${dtFR(ctx.dataset.generatedAt)}) :</div>
        <ul className="notes">${Object.values(ctx.dataset.source.repos).map((r) => html`<li key=${r.repo}>${r.repo} · relevé le ${dtFR(r.commitDate)}</li>`)}</ul>
        ${ctx.dataset.joinStats && html`<div className="muted">${ctx.dataset.joinStats.fdJoined} matchs associés à leurs cotes football-data.co.uk ; ${ctx.dataset.joinStats.upcomingOdds} rencontres à venir avec cote.</div>`}
        <div className="muted">Synchronisation : la tâche planifiée relève les résultats, calendriers et cotes deux fois par jour (navigateur de l'ordinateur relié quand il est allumé, sinon lecture web depuis le cloud), puis enregistre le tout dans la base de l'artefact ; la page charge automatiquement la version la plus récente.</div>
      </div>
      <${TableWrap}><table className="tbl small"><thead><tr><th>Compétition</th><th>Saisons</th><th>Joués</th><th>Dernier résultat</th><th>Manquants</th><th>À venir</th><th>Couverture</th></tr></thead>
        <tbody>${COMP_ORDER.map((c) => { const v = ctx.cov[c]; return html`<tr key=${c} title=${v.note}><td><${CompTag} code=${c} /> ${v.name}</td><td className="tiny">${v.seasons.join(", ")}</td><td className="mono">${v.played}</td>
          <td className=${"mono " + (v.staleDays > 14 ? "t-warn" : "")}>${dFR(v.last)}${v.staleDays !== null ? html` <span className="muted">(${v.staleDays} j)</span>` : ""}</td><td className=${"mono " + (v.missing ? "t-warn" : "")}>${v.missing}</td><td className="mono">${v.upcoming}</td>
          <td><${Pill} tone=${v.level === "bonne" ? "pos" : v.level === "partielle" ? "warn" : "muted"}>${v.level}<//></td></tr>`; })}</tbody></table><//>
      <details className="mt-2"><summary className="small">Notes de couverture par compétition</summary><ul className="notes">${COMP_ORDER.map((c) => html`<li key=${c}><b>${COMP[c].name}</b> : ${ctx.cov[c].note}</li>`)}</ul></details>`}
      <div className="eyebrow mt-3">Marchés disponibles</div>
      <div className="small">1N2 et BTTS : calculés pour toute rencontre modélisable. Buteur : parts de buts mesurées à partir des buteurs ESPN (toutes compétitions sauf Suisse 2024-26). Joueur Décisif : ESPN ne fournit pas les passes décisives dans son flux → part de passes à saisir. Cotes : ${ctx.mode === "demo" ? "fictives (démo)" : "1N2 seulement (Bet 365 via ESPN pour les matchs à venir, football-data.co.uk pour l'historique et les fichiers d'avant-match) ; pas de cote BTTS ni joueur gratuite"}.</div>
      <div className="eyebrow mt-3">Contrôle qualité</div>
      <div className="small">${ctx.quality.checked} rencontres contrôlées · ${ctx.quality.issues.length} anomalie(s) · ${ctx.quality.missing} résultat(s) passé(s) absent(s) de la source.
        ${ctx.quality.issues.length > 0 && html`<details><summary>Détail</summary><ul className="notes">${ctx.quality.issues.slice(0, 20).map((i, k) => html`<li key=${k}>${i.type} : <span className="mono tiny">${i.id}</span></li>`)}</ul></details>`}</div>
      <div className="eyebrow mt-3">Connexions API (test réel depuis cette page)</div>
      <div className="muted small mb-1">La page s'exécute dans un bac à sable qui n'autorise que les scripts de CDN : les appels directs aux API sportives sont normalement refusés. Le bouton exécute un vrai appel et affiche le résultat obtenu, sans clé secrète.</div>
      ${ENDPOINTS.map((ep) => { const t = tests[ep.id]; return html`<div key=${ep.id} className="api-row"><div className="min-w-0"><div className="small">${ep.name}</div><div className="tiny muted ellip">${ep.url}</div></div>
        <div className="row gap-2 items-center">${t ? html`<${Pill} tone=${t.ok ? "pos" : t.state === "test…" ? "info" : "neg"}>${t.state}${t.ms ? ` · ${t.ms} ms` : ""}<//>` : html`<span className="muted tiny">non testé</span>`}<${Btn} small onClick=${() => test(ep)}>Tester<//></div></div>`; })}
      <div className="eyebrow mt-3">Persistance</div>
      <div className="small">${pi.kind}${pi.saved ? ` · dernière sauvegarde ${dtFR(pi.saved.at)} (${pi.saved.where.join(" + ") || "mémoire"})` : " · aucune écriture depuis l'ouverture"}${pi.error ? html` · <span className="t-neg">erreur : ${pi.error}</span>` : ""}. Mode ${ctx.mode === "demo" ? "démo : stocké dans ce navigateur uniquement" : "réel : base privée par utilisateur quand elle est disponible, copie dans le navigateur sinon"}.</div>
    <//>`;
  }

  /* =========================================================================
     §25 — CLASSEMENTS, ENJEUX SPORTIFS ET PROJECTIONS (dans le Dashboard)
     ========================================================================= */
  const ZONE_TONE = { title: "accent", eu: "info", eu2: "info2", eu3: "info3", bar: "warn", rel: "neg" };
  function zoneOf(rules, pos) {
    if (!rules) return null;
    const zs = rules.zones.filter((z) => pos >= z.from && pos <= z.to);
    return zs.find((z) => z.kind !== "title") || zs[0] || null;
  }
  function currentSeasonOf(ctx, comp) {
    const ss = [...new Set(ctx.matches.filter((m) => m.comp === comp && !m.manual).map((m) => m.season))];
    const withUpcoming = ss.filter((s) => ctx.matches.some((m) => m.comp === comp && m.season === s && m.hg === null && m.date >= ctx.today));
    return withUpcoming[withUpcoming.length - 1] || ss[ss.length - 1] || null;
  }
  function tableAvailability(ctx, comp, st, season) {
    if (comp === "WC") return "Format à groupes puis élimination directe : pas de classement général. Les groupes de la source ne sont pas chargés.";
    const upcoming = ctx.matches.some((m) => m.comp === comp && m.season === season && m.hg === null && m.date >= ctx.today);
    const missingPast = st.seasonMatches.filter((m) => m.hg === null && m.date < ctx.today).length;
    if (!upcoming && missingPast > 0) return `Source arrêtée en cours de saison (${st.played}/${st.total} matchs renseignés) : classement non fiable.`;
    if (!st.played) return "Aucun résultat disponible pour cette saison.";
    return null;
  }

  function StandingsPanel({ ctx }) {
    const selComp = ctx.selectedId && ctx.matchById.get(ctx.selectedId) ? ctx.matchById.get(ctx.selectedId).comp : null;
    const [comp, setComp] = useState(selComp || "PL");
    useEffect(() => { if (selComp) setComp(selComp); }, [selComp]);
    const seasons = useMemo(() => [...new Set(ctx.matches.filter((m) => m.comp === comp && !m.manual).map((m) => m.season))], [comp, ctx.matches]);
    const [season, setSeason] = useState(null);
    useEffect(() => { setSeason(currentSeasonOf(ctx, comp)); }, [comp, ctx.mode]);
    const [view, setView] = useState("all");
    const [nSims, setNSims] = useState(5000);
    const rules = ctx.rulesMap[comp];
    const st = useMemo(() => (season ? FQ.seasonTable(ctx.matches, comp, season, null, ctx.rulesMap) : null), [comp, season, ctx.matches, ctx.mode]);
    const isCurrent = season && season === currentSeasonOf(ctx, comp) && ctx.matches.some((m) => m.comp === comp && m.season === season && m.hg === null && m.date >= ctx.today);
    const unavailable = st ? tableAvailability(ctx, comp, st, season) : "Aucune saison disponible.";
    const proj = season ? ctx.getProjection(comp, season) : null;
    const pst = season ? ctx.projStatus(comp, season) : null;
    const missing = st ? st.seasonMatches.filter((m) => m.status === "RÉSULTAT MANQUANT").length : 0;
    let rows = st ? st.table : [];
    if (view === "home") rows = rows.slice().sort((a, b) => a.homeRank - b.homeRank);
    if (view === "away") rows = rows.slice().sort((a, b) => a.awayRank - b.awayRank);
    const hl = ctx.selectedId && ctx.matchById.get(ctx.selectedId) ? [ctx.matchById.get(ctx.selectedId).home, ctx.matchById.get(ctx.selectedId).away] : [];
    const crit = { pts: "points", gd: "différence de buts", gf: "buts marqués", wins: "victoires", h2hPts: "points en confrontations directes", h2hGd: "différence en confrontations directes", h2hGf: "buts en confrontations directes" };

    return html`<${Card} eyebrow="§25 · Classement & enjeux" title="Classement de la compétition">
      <div className="filters">
        <${Field} label="Compétition" id="st-c"><select id="st-c" className="inp" value=${comp} onChange=${(e) => setComp(e.target.value)}>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//>
        <${Field} label="Saison" id="st-s"><select id="st-s" className="inp" value=${season || ""} onChange=${(e) => setSeason(e.target.value)}>${seasons.map((s) => html`<option key=${s}>${s}</option>`)}</select><//>
        <${Field} label="Vue" id="st-v"><select id="st-v" className="inp" value=${view} onChange=${(e) => setView(e.target.value)}><option value="all">Général</option><option value="home">Domicile</option><option value="away">Extérieur</option></select><//>
      </div>
      ${unavailable ? html`<div className="alert warn small"><${Ic} n="CircleSlash" /> <span><b>Classement indisponible.</b> ${unavailable}</span></div>` : html`
        ${!rules && html`<div className="note small">Règlement de cette compétition non vérifié : zones et projection désactivées, classement par points, différence et buts marqués.</div>`}
        <${TableWrap}><table className="tbl small tbl-std">
          <thead><tr><th>#</th><th>Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>BP</th><th>BC</th><th>Diff</th><th>Pts</th><th>Forme</th><th title="Rang au classement domicile">Dom.</th><th title="Rang au classement extérieur">Ext.</th><th title="Écart avec l'équipe juste devant / juste derrière">Écarts</th><th title="Matchs restant à jouer">Rest.</th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const z = zoneOf(rules, r.pos);
            const ab = st.table[r.pos - 2], be = st.table[r.pos];
            const v = view === "home" ? { p: r.hp, w: r.hw, d: r.hd, l: r.hl, gf: r.hgf, ga: r.hga, pts: r.hw * 3 + r.hd } : view === "away" ? { p: r.ap, w: r.aw, d: r.ad, l: r.al, gf: r.agf, ga: r.aga, pts: r.aw * 3 + r.ad } : r;
            return html`<tr key=${r.team} className=${(hl.includes(r.team) ? "hl " : "") + (z ? "z-" + (ZONE_TONE[z.kind] || "none") : "")} title=${z ? z.label : ""}>
              <td className="mono pos">${view === "all" ? r.pos : i + 1}</td><td className="team-cell">${r.team}${rules && r.pos === 1 && view === "all" ? html` <${Ic} n="Crown" s=${12} />` : ""}</td>
              <td className="mono">${v.p}</td><td className="mono">${v.w}</td><td className="mono">${v.d}</td><td className="mono">${v.l}</td><td className="mono">${v.gf}</td><td className="mono">${v.ga}</td>
              <td className="mono">${sgn(v.gf - v.ga, 0)}</td><td className="mono"><b>${v.pts}</b></td>
              <td><div className="form sm">${r.form.map((x, k) => html`<span key=${k} className=${"f f-" + x}>${x}</span>`)}</div></td>
              <td className="mono">${r.homeRank}</td><td className="mono">${r.awayRank}</td>
              <td className="mono tiny">${ab ? "−" + (ab.pts - r.pts) : "—"} / ${be ? "+" + (r.pts - be.pts) : "—"}</td><td className="mono">${r.remaining}</td></tr>`; })}</tbody></table><//>
        ${rules && html`<div className="legend">${rules.zones.filter((z) => z.kind !== "title").map((z) => html`<span key=${z.key}><i className=${"sw z-" + ZONE_TONE[z.kind]}></i>${z.from === z.to ? z.from : z.from + "–" + z.to} · ${z.label}</span>`)}</div>`}
        <div className="muted tiny mt-1">Source : ${ctx.mode === "demo" ? "données fictives (démo)" : "openfootball"} · saison ${season} · ${st.played}/${st.total} matchs · dernier résultat ${dFR(st.lastResult)}${missing ? html` · <span className="t-warn">${missing} résultat(s) manquant(s) dans la source</span>` : ""} · calculé à l'ouverture (${dtFR(new Date().toISOString())}).
          ${rules ? html`<br/>Règlement : ${rules.id} — ${rules.source}. Départage : ${rules.tiebreak.map((c) => crit[c]).join(", ")} (confrontations directes seulement quand tous les matchs entre les équipes concernées sont joués). ${rules.note}` : ""}
          ${rules && rules.zones.some((z) => z.kind === "eu" || z.kind === "eu2") ? html`<br/>Places continentales indicatives : elles peuvent changer selon les vainqueurs de coupe et le coefficient UEFA.` : ""}</div>
        ${rules && isCurrent && html`<div className="proj mt-3">
          <div className="row justify-between items-center wrap gap-2"><div><div className="eyebrow">Projection de fin de saison (Monte-Carlo)</div>
            <div className="muted tiny">Chaque rencontre restante est tirée dans la matrice de scores du modèle (buts des deux équipes tirés conjointement), puis le classement est recalculé avec le départage officiel.</div></div>
            <div className="row gap-2 items-center"><select className="inp" style=${{ width: "auto" }} value=${nSims} onChange=${(e) => setNSims(+e.target.value)} aria-label="Nombre de simulations"><option value=${2000}>2 000 sim.</option><option value=${5000}>5 000 sim.</option><option value=${20000}>20 000 sim.</option></select>
              <${Btn} small kind="primary" disabled=${pst && pst.running} onClick=${() => ctx.runProjection(comp, season, nSims)}><${Ic} n="Dices" /> ${pst && pst.running ? `Simulation… ${Math.round(pst.progress * 100)} %` : proj && proj.ok ? "Relancer" : "Projeter"}<//></div></div>
          ${proj && !proj.ok && html`<div className="alert warn small mt-2"><${Ic} n="CircleSlash" /> Projection désactivée : ${proj.reason}</div>`}
          ${proj && proj.ok && html`<${ProjectionTable} proj=${proj} rules=${rules} hl=${hl} />`}
        </div>`}
        ${rules && !isCurrent && html`<div className="muted small mt-2">Saison terminée ou sans rencontre à venir : pas de projection.</div>`}`}
    <//>`;
  }

  function ProjectionTable({ proj, rules, hl }) {
    const zs = rules.zones;
    return html`<div className="mt-2">
      <${TableWrap}><table className="tbl small tbl-std">
        <thead><tr><th>Équipe</th><th>Pts proj.</th><th>Rang (IC 90 %)</th>${zs.map((z) => html`<th key=${z.key} title=${z.label}>${z.kind === "title" ? "Titre" : z.label.length > 18 ? z.label.slice(0, 16) + "…" : z.label}</th>`)}</tr></thead>
        <tbody>${proj.teams.map((t) => html`<tr key=${t.team} className=${hl.includes(t.team) ? "hl" : ""}>
          <td className="team-cell">${t.team}</td><td className="mono">${fr(t.meanPts, 1)} <span className="muted">± ${fr(t.sdPts, 1)}</span></td><td className="mono">${fr(t.expPos, 1)} <span className="muted">(${t.posLo}–${t.posHi})</span></td>
          ${zs.map((z) => { const p = t.zones[z.key]; return html`<td key=${z.key} className="mono pcell" style=${{ background: p > 0.005 ? `rgba(${z.kind === "rel" ? "229,103,90" : z.kind === "bar" ? "227,164,67" : "235,181,74"},${(0.08 + 0.5 * p).toFixed(3)})` : "transparent" }}>${p < 0.0005 ? "—" : p > 0.9995 ? "> 99,9 %" : pct(p, 1)}</td>`; })}
        </tr>`)}</tbody></table><//>
      <ul className="notes tiny muted mt-1">
        <li>${proj.nSims.toLocaleString("fr-FR")} simulations · graine ${proj.seed} · ${proj.remaining} rencontres simulées · modèle ajusté au ${dFR(proj.modelAsOf)} · moteur ${proj.engineVersion} · calculé le ${dtFR(proj.at)}.</li>
        ${proj.nMissing > 0 && html`<li className="t-warn">${proj.nMissing} rencontre(s) déjà jouée(s) mais absente(s) de la source sont simulées comme si elles restaient à jouer : saisissez ces résultats (onglet Audit) pour une projection exacte.</li>`}
        <li>Estimations du modèle, pas des certitudes. Égalités parfaites tranchées au hasard (critères disciplinaires non disponibles). Aucune rencontre n'est inventée : seules celles du calendrier publié sont simulées.</li>
      </ul></div>`;
  }

  function StakesCard({ ctx, match, b, b0, applyStake, setApplyStake }) {
    const rules = ctx.rulesMap[match.comp];
    const [testing, setTesting] = useState(false);
    const st = useMemo(() => (rules ? FQ.seasonTable(ctx.matches, match.comp, match.season, match.date, ctx.rulesMap) : null), [match.id, ctx.matches, ctx.mode]);
    const unavailable = !rules ? "Règlement non vérifié pour cette compétition (ou saison absente de la source)." : st ? tableAvailability(ctx, match.comp, FQ.seasonTable(ctx.matches, match.comp, match.season, null, ctx.rulesMap), match.season) : null;
    const future = match.hg === null && match.date >= ctx.today;
    const proj = rules ? ctx.getProjection(match.comp, match.season) : null;
    const pst = rules ? ctx.projStatus(match.comp, match.season) : null;
    useEffect(() => { if (rules && !unavailable && future && !proj && !(pst && pst.running)) ctx.runProjection(match.comp, match.season, 3000); }, [match.id]);
    const stk = ctx.state.calibration.stakeTest;
    function runTest() {
      setTesting(true);
      setTimeout(() => {
        const comps = Object.keys(ctx.rulesMap);
        const seasonOf = {};
        comps.forEach((c) => {
          const ss = [...new Set(ctx.matches.filter((m) => m.comp === c && !m.manual).map((m) => m.season))];
          const done = ss.filter((s) => { const ms = ctx.matches.filter((m) => m.comp === c && m.season === s && FQ.isRegular(m)); const pl = ms.filter((m) => m.hg !== null).length; return ms.length && pl >= 0.98 * ms.length && !ms.some((m) => m.hg === null && m.date >= ctx.today); });
          seasonOf[c] = ctx.mode === "demo" ? ss[0] : done[done.length - 1];
        });
        const r = FQ.stakeDriverBacktest(ctx.matches, comps, seasonOf, null, ctx.rulesMap);
        const summary = Object.assign({ at: new Date().toISOString(), engineVersion: FQ.ENGINE_VERSION, seasons: seasonOf }, r);
        delete summary.rows;
        ctx.update((s) => { s.calibration.stakeTest = summary; s.log.push({ t: summary.at, text: `Test du driver enjeu : ${r.ok ? (r.accepted ? "effet retenu" : "effet non démontré") : r.reason}` }); return s; });
        setTesting(false);
      }, 30);
    }
    if (unavailable) return html`<${Card} eyebrow="Classement & enjeux" title="Contexte sportif"><div className="alert warn small"><${Ic} n="CircleSlash" /> <span><b>Classement indisponible.</b> ${unavailable}</span></div><//>`;
    const row = (t) => st.table.find((x) => x.team === t);
    const H = row(match.home), A = row(match.away);
    const math = FQ.mathStatus(st.table, rules);
    const levH = proj && proj.ok && future ? FQ.matchLeverage(proj, match.id, match.home) : null;
    const levA = proj && proj.ok && future ? FQ.matchLeverage(proj, match.id, match.away) : null;
    const sH = FQ.stakeSummary(match.home, proj && proj.ok ? proj : null, math, levH, rules);
    const sA = FQ.stakeSummary(match.away, proj && proj.ok ? proj : null, math, levA, rules);
    const total = st.total / (st.teams.length / 2);
    const side = (team, R, S, lev) => {
      const z = zoneOf(rules, R.pos);
      const P = proj && proj.ok ? proj.teams.find((x) => x.team === team) : null;
      return html`<div className="team-col">
        <div className="team-n">${team}</div>
        <div className="row gap-2 items-center wrap mt-1"><span className="bigpos mono">${R.pos}<sup>e</sup></span><span className="mono">${R.pts} pts · ${R.p} J · ${R.remaining} restants</span>${z && html`<${Pill} tone=${ZONE_TONE[z.kind] === "neg" ? "neg" : ZONE_TONE[z.kind] === "warn" ? "warn" : "info"}>${z.label}<//>`}</div>
        <div className="form">${R.form.map((x, k) => html`<span key=${k} className=${"f f-" + x}>${x}</span>`)}</div>
        <div className="muted small">Rang domicile ${R.homeRank}e · rang extérieur ${R.awayRank}e${P ? ` · projection ${fr(P.meanPts, 1)} pts, rang ${P.posLo}–${P.posHi}` : ""}</div>
        <div className="eyebrow mt-2">Vérifié mathématiquement</div>
        ${S.mathItems.length ? html`<ul className="notes small">${S.mathItems.map((x, i) => html`<li key=${i}>${x.txt}</li>`)}</ul>` : html`<div className="muted small">Aucune zone acquise ni perdue mathématiquement (vérification prudente, hors confrontations restantes).</div>`}
        <div className="eyebrow mt-2">Estimé (simulations)</div>
        ${!future ? html`<div className="muted small">Match passé : enjeux estimés non recalculés (le classement affiché est celui connu avant le coup d'envoi).</div>` :
          !proj ? html`<div className="muted small">${pst && pst.running ? `Simulation en cours… ${Math.round(pst.progress * 100)} %` : "Projection non lancée."}</div>` : !proj.ok ? html`<div className="muted small">${proj.reason}</div>` :
          html`<div><b>Objectif plausible : ${S.objective || "—"}</b></div><ul className="notes small">${S.categories.map((c, i) => html`<li key=${i}><b>${c.k}</b> — ${c.txt}</li>`)}</ul>`}
        ${lev && html`<div className="eyebrow mt-2">Ce que ce match change (probabilités conditionnelles)</div>
          <${TableWrap}><table className="tbl tiny"><thead><tr><th>Zone</th><th>si victoire</th><th>si nul</th><th>si défaite</th></tr></thead>
            <tbody>${Object.entries(lev).filter(([, v]) => v.leverage !== null && (v.leverage >= 0.01 || (v.ifWin > 0.01 && v.ifWin < 0.99))).map(([k, v]) => html`<tr key=${k}><td>${v.label}</td><td className="mono">${pct(v.ifWin, 1)}</td><td className="mono">${pct(v.ifDraw, 1)}</td><td className="mono">${pct(v.ifLoss, 1)}</td></tr>`)}</tbody></table><//>`}
        <div className="muted tiny mt-1">Motivation psychologique : non modélisée (jamais présentée comme un fait).</div>
      </div>`;
    };
    return html`<${Card} eyebrow="Classement & enjeux" title="Contexte sportif" right=${html`<span className="muted small">${st.played}/${st.total} matchs · classement avant le ${dFR(match.date)}</span>`}>
      <div className="row gap-3 wrap small mb-2"><span>Écart : <b className="mono">${sgn(H.pts - A.pts, 0)} pt(s)</b> (${match.home} − ${match.away})</span><span>Rencontres restantes par équipe : <b className="mono">${H.remaining}</b> / <b className="mono">${A.remaining}</b> sur ${Math.round(total)}</span>
        <span>Incertitude : ${H.remaining > total * 0.6 ? "élevée (début de saison)" : H.remaining > total * 0.25 ? "moyenne" : "faible (fin de saison)"}</span></div>
      <div className="teams2">${side(match.home, H, sH, levH)}${side(match.away, A, sA, levA)}</div>
      <div className="eyebrow mt-3">Incidence sur la prédiction</div>
      ${!stk ? html`<div className="small">Aucun impact appliqué : l'effet de l'enjeu n'a pas encore été testé hors échantillon. <${Btn} small onClick=${runTest} disabled=${testing}>${testing ? "Test en cours…" : "Tester l'apport de l'enjeu (walk-forward)"}<//></div>` :
        html`<div className="small">
          ${!stk.ok ? html`Test du ${dtFR(stk.at)} : ${stk.reason} Le classement reste explicatif, sans effet sur les probabilités.` :
            html`Test hors échantillon du ${dtFR(stk.at)} (caractéristique : équipe mathématiquement fixée, classement connu avant chaque match ; ${stk.nTrain} matchs d'ajustement, ${stk.nTest} de test ; compétitions : ${stk.comps.join(", ")}) : β = ${fr(stk.beta, 2)}, log loss 1N2 ${fr(stk.testBefore, 4)} → ${fr(stk.testAfter, 4)}, écart IC 95 % [${fr(stk.ci[0], 4)} ; ${fr(stk.ci[1], 4)}].
              ${stk.accepted ? html` <b className="t-pos">Effet retenu.</b>` : html` <b>Effet non démontré</b> : le classement est affiché à titre explicatif et ne modifie pas les probabilités.`}`}
          <${Btn} small onClick=${runTest} disabled=${testing}>${testing ? "Test en cours…" : "Relancer le test"}<//></div>`}
      ${stk && stk.accepted && html`<label className="check small mt-1"><input type="checkbox" checked=${applyStake} onChange=${(e) => setApplyStake(e.target.checked)} /> Appliquer l'effet validé (λ × e<sup>β</sup> pour une équipe sans enjeu)</label>
        ${applyStake && b0 && b.pr.ok && html`<div className="small mt-1">${b.stakeInfo && (b.stakeInfo.home || b.stakeInfo.away) ? `Avant → après : 1 ${pct(b0.pr.markets.p1)} → ${pct(b.pr.markets.p1)} · N ${pct(b0.pr.markets.pN)} → ${pct(b.pr.markets.pN)} · 2 ${pct(b0.pr.markets.p2)} → ${pct(b.pr.markets.p2)} · BTTS ${pct(b0.pr.markets.bttsYes)} → ${pct(b.pr.markets.bttsYes)}` : "Aucune des deux équipes n'est mathématiquement fixée : aucun ajustement."}</div>`}`}
      <div className="muted tiny mt-2">Règle : un enjeu sportif explique le contexte d'un match ; il ne garantit ni son résultat ni l'existence d'une value bet. Aucune équipe n'est favorisée parce qu'elle « doit gagner ».</div>
    <//>`;
  }

  /* =========================================================================
     ONGLET 2 — PRONOSTICS DE LA SEMAINE
     ========================================================================= */
  function Pronostics({ ctx }) {
    const { state, settings } = ctx;
    const [comp, setComp] = useState("ALL");
    const [market, setMarket] = useState("ALL");
    const [onlyValue, setOnlyValue] = useState(false);
    const [showClosed, setShowClosed] = useState(false);
    const [q, setQ] = useState("");
    const [sort, setSort] = useState("score");
    const [open, setOpen] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [stakeEdit, setStakeEdit] = useState({});

    const rows = useMemo(() => FQ.evaluateAll(state.opportunities.filter((o) => o.status !== "remplacée"), { settings: ctx.effSettings, acct: ctx.acct, bets: state.bets, qtable: ctx.qtable }), [state.opportunities, state.bets, settings, ctx.qtable, ctx.trainedAt]);
    let list = rows.filter((r) => (showClosed || r.opp.status === "ouverte") && (comp === "ALL" || r.opp.comp === comp) && (market === "ALL" || r.opp.market === market) &&
      (!onlyValue || r.decision === "VALUE BET") && (!q || FQ.normName(r.opp.match).includes(FQ.normName(q))));
    list = list.slice().sort((a, b) => sort === "ev" ? (b.ev ?? -9) - (a.ev ?? -9) : sort === "rel" ? b.opp.rel - a.opp.rel : sort === "date" ? (a.opp.date < b.opp.date ? -1 : 1) : (b.score ?? -9) - (a.score ?? -9));
    const openRows = rows.filter((r) => r.opp.status === "ouverte");
    const values = openRows.filter((r) => r.decision === "VALUE BET");
    const plannedExp = values.reduce((a, r) => a + r.stake, 0);
    const evMean = values.length ? values.reduce((a, r) => a + r.ev, 0) / values.length : null;
    const alerts = [];
    if (ctx.acct.openStakes + plannedExp > settings.maxTotalPct * ctx.acct.bankroll) alerts.push("Exposition prévue au-delà du plafond total : les mises seront réduites au moment de l'enregistrement.");
    const corr = {}; values.forEach((r) => (corr[r.opp.matchId] = (corr[r.opp.matchId] || 0) + 1));
    Object.entries(corr).filter(([, n]) => n > 1).forEach(([id, n]) => alerts.push(`${n} sélections sur le même match (${ctx.matchById.get(id)?.home || id} …) : corrélation, plafond match de ${pct(settings.maxMatchPct, 0)} partagé.`));
    if (rows.some((r) => r.opp.missing >= settings.missingWatch)) alerts.push("Certaines analyses reposent sur des données avec résultats manquants.");

    function setOdds(oppId, v) {
      ctx.update((s) => { const o = s.opportunities.find((x) => x.id === oppId); if (o && o.status === "ouverte") { o.odds = v; o.oddsSource = v === null ? null : "saisie utilisateur"; o.oddsAt = v === null ? null : new Date().toISOString(); } return s; });
    }
    function place(r, offPolicy) {
      const stake = stakeEdit[r.opp.id] !== undefined && stakeEdit[r.opp.id] !== null ? Math.min(stakeEdit[r.opp.id], r.stake || capStake(r)) : (r.stake || capStake(r));
      if (!(stake > 0)) { ctx.notify("Mise nulle après plafonds : pari impossible", "warn"); return; }
      if (stake > ctx.acct.cash) { ctx.notify("Mise supérieure au cash disponible", "neg"); return; }
      const now = new Date().toISOString();
      ctx.update((s) => {
        const o = s.opportunities.find((x) => x.id === r.opp.id);
        if (!o || o.status !== "ouverte") return s;
        o.status = "pariée"; o.decidedAt = now;
        const ac = FQ.accounting(s.bets, s.settings.initialBankroll);
        o.exposureShare = ac.openStakes / (s.settings.maxTotalPct * ac.bankroll);
        s.bets.push({ id: U.uid("bet"), createdAt: now, opportunityId: o.id, predictionId: o.predictionId, matchId: o.matchId, comp: o.comp, date: o.date, match: o.match, market: o.market, selection: o.selection, playerName: o.playerName || null,
          p: o.p, rel: o.rel, odds: o.odds, oddsSource: o.oddsSource, ev: r.ev, stake: Math.floor(stake * 100) / 100, decision: r.decision + (offPolicy ? " (hors recommandation)" : ""), reasons: r.reasons, stakeSteps: r.stakeSteps,
          status: "EN ATTENTE", profit: 0, engineVersion: FQ.ENGINE_VERSION, calibrationVersion: s.calibration.version, agent: r.agent || null });
        s.log.push({ t: now, text: `Pari enregistré : ${o.match} · ${o.market} ${o.selection} @ ${o.odds}` });
        return s;
      });
      ctx.notify("Pari ajouté au registre", "pos");
    }
    function capStake(r) {
      if (!(r.ev > 0)) return 0;
      return FQ.computeStake(r.opp.p, r.opp.odds, settings, ctx.acct, r.matchExposure || 0).stake;
    }
    function pass(r) {
      ctx.update((s) => { const o = s.opportunities.find((x) => x.id === r.opp.id); if (o && o.status === "ouverte") { o.status = "passée"; o.decidedAt = new Date().toISOString(); const ac = FQ.accounting(s.bets, s.settings.initialBankroll); o.exposureShare = ac.openStakes / (s.settings.maxTotalPct * ac.bankroll); } return s; });
    }
    function exportCSV() {
      const cols = [{ label: "Date", get: (r) => r.opp.date }, { label: "Compétition", get: (r) => r.opp.comp }, { label: "Match", get: (r) => r.opp.match }, { label: "Marché", get: (r) => r.opp.market }, { label: "Sélection", get: (r) => r.opp.selection },
        { label: "Probabilité", get: (r) => r.opp.p?.toFixed(4) }, { label: "Fiabilité", get: (r) => r.opp.rel }, { label: "Cote", get: (r) => r.opp.odds }, { label: "Source cote", get: (r) => r.opp.oddsSource }, { label: "Cote minimale", get: (r) => r.minOdds?.toFixed(3) },
        { label: "EV", get: (r) => r.ev?.toFixed(4) }, { label: "Décision", get: (r) => r.decision }, { label: "Mise", get: (r) => r.stake }, { label: "Statut", get: (r) => r.opp.status }];
      offerExport(ctx, `pronostics_${ctx.mode}_${ctx.today}.csv`, FQ.toCSV(list, cols));
    }

    return html`<div className="stack">
      <${WeeklyTickets} ctx=${ctx} />
      <${MatchPicks} ctx=${ctx} />
      <details className="adv"><summary><${Ic} n="SlidersHorizontal" /> Analyse détaillée : toutes les sélections, value bets, cotes à saisir</summary><div className="stack mt-2">
      <div className="stats">
        <${Stat} label="Matchs analysés" value=${new Set(openRows.map((r) => r.opp.matchId)).size} sub=${`${openRows.length} sélections ouvertes`} />
        <${Stat} label="Opportunités EV > 0" value=${openRows.filter((r) => r.ev > 0).length} />
        <${Stat} label="Value bets admissibles" value=${values.length} tone=${values.length ? "pos" : null} />
        <${Stat} label="Exposition prévue" value=${eur(plannedExp, settings.currency)} sub=${`ouverte ${eur(ctx.acct.openStakes, settings.currency)} · plafond ${pct(settings.maxTotalPct, 0)}`} />
        <${Stat} label="EV moyenne estimée" value=${evMean === null ? "—" : sgn(evMean * 100, 1) + " %"} sub="estimation, pas une garantie" />
      </div>
      ${alerts.length > 0 && html`<div className="alert warn"><${Ic} n="ShieldAlert" /><ul className="notes">${alerts.map((a, i) => html`<li key=${i}>${a}</li>`)}</ul></div>`}
      <${Card} title="Toutes les sélections analysées" eyebrow="Détail par marché" right=${html`<${Btn} small onClick=${exportCSV}><${Ic} n="FileDown" /> Exporter CSV<//>`}>
        <div className="filters">
          <${Field} label="Compétition" id="p-c"><select id="p-c" className="inp" value=${comp} onChange=${(e) => setComp(e.target.value)}><option value="ALL">Toutes</option>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//>
          <${Field} label="Marché" id="p-m"><select id="p-m" className="inp" value=${market} onChange=${(e) => setMarket(e.target.value)}><option value="ALL">Tous</option>${MARKETS.map((m) => html`<option key=${m}>${m}</option>`)}</select><//>
          <${Field} label="Équipe" id="p-q"><input id="p-q" className="inp" value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="Rechercher…" /><//>
          <${Field} label="Tri" id="p-s"><select id="p-s" className="inp" value=${sort} onChange=${(e) => setSort(e.target.value)}><option value="score">Intérêt ajusté du risque</option><option value="ev">EV</option><option value="rel">Fiabilité</option><option value="date">Date</option></select><//>
        </div>
        <div className="row gap-3 wrap mb-2"><label className="check"><input type="checkbox" checked=${onlyValue} onChange=${(e) => setOnlyValue(e.target.checked)} /> Value bets seulement</label>
          <label className="check"><input type="checkbox" checked=${showClosed} onChange=${(e) => setShowClosed(e.target.checked)} /> Afficher aussi les sélections pariées / passées</label></div>
        ${!list.length ? html`<${Empty} icon="ListX">Aucune sélection. Analysez un match (onglet 1) ou utilisez « Analyser les matchs de la semaine ».<//>` :
        html`<${TableWrap}><table className="tbl tbl-pron">
          <thead><tr><th>Date</th><th>Compétition</th><th>Match</th><th>Marché</th><th>Sélection</th><th>Prob.</th><th>Fiab.</th><th>Cote</th><th>Cote min.</th><th>EV</th><th>Décision</th><th>Mise rec.</th><th></th></tr></thead>
          <tbody>${list.slice(0, 300).map((r) => { const o = r.opp; const isOpen = o.status === "ouverte"; return html`<${Fragment} key=${o.id}>
            <tr className=${isOpen ? "" : "closed"}>
              <td className="mono small">${dFR(o.date)}</td><td><${CompTag} code=${o.comp} /></td><td className="small">${o.match}</td><td className="small">${o.market}</td><td className="small">${o.selection}</td>
              <td className="mono">${o.p === null ? "—" : pct(o.p)}</td><td className="mono">${o.insufficient ? "—" : o.rel}</td>
              <td>${isOpen && !o.insufficient ? html`<${NumInput} value=${o.odds} min=${1.01} max=${1000} width="4.6rem" placeholder="cote" onChange=${(v) => setOdds(o.id, v)} />` : html`<span className="mono">${fr(o.odds, 2)}</span>`}</td>
              <td className="mono">${fr(r.minOdds, 2)}</td>
              <td className=${"mono " + (r.ev > 0 ? "t-pos" : r.ev < 0 ? "t-neg" : "")}>${r.ev === null || r.ev === undefined ? "—" : sgn(r.ev * 100, 1) + " %"}</td>
              <td><${DecisionPill} d=${r.decision} /></td>
              <td className="mono">${r.stake ? eur(r.stake, settings.currency) : "—"}</td>
              <td><div className="row gap-1 nowrap">
                <button className="iconbtn" aria-label="Expliquer" title="Expliquer" onClick=${() => setOpen(open === o.id ? null : o.id)}><${Ic} n="Info" s=${15} /></button>
                ${isOpen && !o.insufficient && html`<${Btn} small kind=${r.decision === "VALUE BET" ? "primary" : "ghost"} disabled=${!(r.ev > 0)} onClick=${() => r.decision === "VALUE BET" ? place(r) : setConfirm(r)}>Parier<//><${Btn} small onClick=${() => pass(r)}>Passer<//>`}
                ${!isOpen && html`<span className="muted tiny">${o.status}</span>`}
              </div></td>
            </tr>
            ${open === o.id && html`<tr className="explain"><td colSpan="13">
              <div className="explain-in">
                <div><b>Pourquoi :</b> ${r.reasons.join(" · ") || "—"}</div>
                <div><b>Calcul :</b> EV = p × c − 1 = ${o.p === null ? "—" : fr(o.p, 4)} × ${fr(o.odds, 2)} − 1 = ${r.ev === null || r.ev === undefined ? "—" : fr(r.ev, 4)} · seuil du modèle 1/p (pas une cote de bookmaker) = ${fr(r.fair, 3)} · cote minimale (1 + ${fr(settings.evMin, 2)})/p = ${fr(r.minOdds, 3)} · probabilité implicite 1/c = ${pct(r.implied)}</div>
                ${r.stakeSteps && r.stakeSteps.length > 0 && html`<div><b>Mise :</b> ${r.stakeSteps.join(" → ")}</div>`}
                ${r.agent && html`<div><b>Agent :</b> état ${r.agent.key} · n = ${r.agent.n}${r.agent.active ? ` · Q moyen ${sgn(r.agent.mean * 100, 1)} % · borne haute ${sgn(r.agent.ucb * 100, 1)} %` : ` · inactif (n < ${settings.agentMinN}) : politique déterministe seule`}</div>`}
                <div className="muted small">Source de la cote : ${o.oddsSource || "aucune"}${o.oddsAt ? " · " + dtFR(o.oddsAt) : ""} · snapshot ${o.predictionId || "—"} · données manquantes : ${o.missing || 0}</div>
                ${isOpen && r.ev > 0 && html`<div className="row gap-2 items-center mt-1 small">Mise personnalisée (≤ plafond) <${NumInput} value=${stakeEdit[o.id] ?? null} min=${0} width="5rem" placeholder=${String(r.stake || capStake(r))} onChange=${(v) => setStakeEdit({ ...stakeEdit, [o.id]: v })} /></div>`}
              </div></td></tr>`}
          <//>`; })}</tbody></table><//>`}
        <div className="muted small mt-2">Une sélection peut figurer sans être recommandée ; aucun nombre minimal de paris n'est imposé. « Passer » est une décision enregistrée : l'issue sera quand même observée à l'audit pour l'apprentissage contrefactuel de l'agent.</div>
      <//>
      </div></details>
      <${Confirm} open=${!!confirm} title="Pari hors recommandation" text=${confirm ? `Décision du moteur : ${confirm.decision} (${confirm.reasons.join(" · ")}). La mise reste plafonnée par Kelly fractionné et les limites d'exposition. Enregistrer quand même ?` : ""}
        onNo=${() => setConfirm(null)} onYes=${() => { place(confirm, true); setConfirm(null); }} yesLabel="Enregistrer ce pari" />
    </div>`;
  }

  /* ----------------------------------------------- choix préférentiel par match */
  function PicksBoard({ ctx }) {
    const { state, today } = ctx;
    const [comp, setComp] = useState("ALL");
    const [scope, setScope] = useState("done");
    const [open, setOpen] = useState(null);
    const tz = ctx.settings.timezone || "Europe/Paris";
    const all = (state.picks || []).filter((p) => comp === "ALL" || p.comp === comp);
    const list = all.filter((p) => (scope === "open" ? p.status === "EN ATTENTE" : p.status !== "EN ATTENTE"))
      .sort((a, b) => (scope === "open" ? (a.date + (a.time || "") < b.date + (b.time || "") ? -1 : 1) : (a.settledAt < b.settledAt ? 1 : -1)));
    const settled = (state.picks || []).filter((p) => p.status === "GAGNÉ" || p.status === "PERDU");
    const won = settled.filter((p) => p.status === "GAGNÉ").length;
    const withOdds = settled.filter((p) => Number.isFinite(p.profit));
    const roi = withOdds.length ? withOdds.reduce((a, p) => a + p.profit, 0) / withOdds.length : null;
    const tr = FQ.TRAINED && FQ.TRAINED.picks && FQ.TRAINED.picks.test;
    const nVal = (state.picks || []).filter((p) => p.status === "EN ATTENTE" && p.kind === "value").length;
    const kick = (p) => { const m = ctx.matchById.get(p.matchId); const ko = m ? FQ.time.kickoffUtc(m.date, m.time, m.tz) : null; return ko ? FQ.time.formatInTz(ko, tz, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : dFR(p.date); };
    return html`<${Card} eyebrow="Un choix par match, suivi à 1 u" title="Bilan des choix préférentiels" right=${html`<div className="seg">${[["open", "À venir"], ["done", "Réglés"]].map(([k, l]) => html`<button key=${k} className=${scope === k ? "on" : ""} onClick=${() => setScope(k)}>${l}</button>`)}</div>`}>
      <div className="stats mb-2">
        <${Stat} label="Choix à venir" value=${(state.picks || []).filter((p) => p.status === "EN ATTENTE").length} sub=${`${nVal} value bet(s), le reste en pronostic sans mise`} />
        <${Stat} label="Réussite des choix réglés" value=${settled.length ? pct(won / settled.length) : "—"} sub=${`${won}/${settled.length} depuis la mise en service`} />
        <${Stat} label="Rendement à 1 u par choix" value=${roi === null ? "—" : sgn(roi * 100, 1) + " %"} sub=${`${withOdds.length} choix réglés avec cote connue`} tone=${roi > 0 ? "pos" : roi < 0 ? "neg" : null} />
        <${Stat} label="Réussite sur le test historique" value=${tr ? pct(tr.hitRate) : "—"} sub=${tr ? `${tr.n} matchs du 01/07/2026 à aujourd'hui, jamais vus à l'entraînement` : "entraînement indisponible"} />
      </div>
      <div className="filters"><${Field} label="Compétition" id="pk-c"><select id="pk-c" className="inp" value=${comp} onChange=${(e) => setComp(e.target.value)}><option value="ALL">Toutes</option>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//></div>
      ${!list.length ? html`<${Empty} icon="Target">${scope === "open" ? "Aucun choix en attente : le pilote automatique analyse les rencontres des 14 prochains jours à chaque cycle." : "Aucun choix réglé pour l'instant."}<//>` :
      html`<${TableWrap}><table className="tbl tbl-pron">
        <thead><tr><th>Coup d'envoi</th><th>Comp.</th><th>Match</th><th>Choix</th><th>Proba.</th><th>Cote</th><th>Cote min.</th><th>Type</th><th>Fiab.</th>${scope === "done" ? html`<th>Score</th><th>Issue</th><th>P/L (1 u)</th>` : null}<th></th></tr></thead>
        <tbody>${list.slice(0, 250).map((p) => html`<${Fragment} key=${p.id}><tr>
          <td className="mono small">${kick(p)}</td><td><${CompTag} code=${p.comp} /></td><td className="small">${p.home} – ${p.away}</td>
          <td><b>${p.label}</b></td><td className="mono">${pct(p.p)}</td>
          <td className="mono">${p.odds ? fr(p.odds, 2) : html`<span className="muted">—</span>`}</td><td className="mono">${fr(p.minOdds, 2)}</td>
          <td>${p.kind === "value" ? html`<${Pill} tone="pos">Value bet<//>` : html`<${Pill} tone="info">Pronostic<//>`}</td><td className="mono">${p.rel}</td>
          ${scope === "done" ? html`<td className="mono">${p.score || "—"}</td><td><${Pill} tone=${STATUS_TONE[p.status]}>${p.status}<//></td><td className=${"mono " + (p.profit > 0 ? "t-pos" : p.profit < 0 ? "t-neg" : "")}>${Number.isFinite(p.profit) ? sgn(p.profit) : "—"}</td>` : null}
          <td><div className="row gap-1 nowrap"><button className="iconbtn" aria-label="Pourquoi" title="Pourquoi" onClick=${() => setOpen(open === p.id ? null : p.id)}><${Ic} n="Info" s=${15} /></button>${ctx.matchById.get(p.matchId) && html`<${Btn} small onClick=${() => ctx.analyze(p.matchId)}>Analyser<//>`}</div></td></tr>
          ${open === p.id && html`<tr className="explain"><td colSpan=${scope === "done" ? 13 : 10}><div className="explain-in">
            <div><b>Pourquoi ce choix :</b> ${p.why}</div>
            <div className="muted small">Règle : une value bet admissible (cote connue, EV ≥ seuil, fiabilité ≥ seuil, cote ≤ plafond appris) est choisie en priorité ; sinon l'issue la plus probable parmi 1, N, 2, BTTS Oui et BTTS Non. Probabilités ${FQ.TRAINED && FQ.TRAINED.blend && FQ.TRAINED.blend.accepted && p.odds ? "mélangées au marché (poids appris sur 12 mois)" : "du modèle calibré"}. Cote : ${p.oddsSrc || "non disponible"}. Choix mis à jour ${p.revisions || 0} fois, figé au coup d'envoi.</div>
          </div></td></tr>`}<//>`)}</tbody></table><//>`}
    <//>`;
  }

  /* =========================================================================
     TICKETS DE LA SEMAINE, PRONOSTICS 14 JOURS, PANIER ET PARIS RÉELS
     ========================================================================= */
  const SC_HINT = { sur: "≈ 1,4 à 1,8", prudent: "≈ 3 à 4", equilibre: "≈ 7 à 8", audacieux: "≈ 50" };
  const SC_DESC = { sur: "Chance de gain la plus haute (55 à 65 %).", prudent: "Peu de sélections, les plus sûres.", equilibre: "Compromis entre chance et gain.", audacieux: "Gros gain possible, faible chance." };
  const dayLabel = (d, today) => d === today ? "Aujourd'hui" : d === U.addDays(today, 1) ? "Demain" : new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const shortDay = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  function koText(ctx, x, withDay = true) {
    const m = ctx.matchById.get(x.matchId);
    const tz = ctx.settings.timezone || "Europe/Paris";
    const ko = m ? FQ.time.kickoffUtc(m.date, m.time, m.tz) : x.kickoff ? Date.parse(x.kickoff) : null;
    if (!ko) return dFR(x.date);
    return FQ.time.formatInTz(ko, tz, withDay ? { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  }
  const legOf = (x) => ({ matchId: x.matchId, comp: x.comp, date: x.date, time: x.time || "", kickoff: x.kickoff || null, home: x.home, away: x.away, market: x.market, sel: x.sel, label: x.label,
    p: Number.isFinite(x.p) ? x.p : null, odds: Number.isFinite(x.odds) ? x.odds : null, status: "EN ATTENTE" });
  /** Bilan d'une liste de tickets ou de paris (fictifs en u, réels en €) */
  function betStats(list) {
    const done = list.filter((t) => t.status === "GAGNÉ" || t.status === "PERDU");
    const won = done.filter((t) => t.status === "GAGNÉ").length;
    const profit = done.reduce((a, t) => a + (Number.isFinite(t.profit) ? t.profit : 0), 0);
    const staked = done.reduce((a, t) => a + (t.stake || 0), 0);
    const open = list.filter((t) => t.status === "EN ATTENTE");
    return { n: list.length, done: done.length, won, profit, staked, roi: staked ? profit / staked : null, open: open.length, openStake: open.reduce((a, t) => a + (t.stake || 0), 0) };
  }

  function TicketCard({ ctx, t, sc, preview }) {
    const id = t.scenario || sc.id;
    const st = t.status || "EN ATTENTE";
    const settled = !preview && st !== "EN ATTENTE";
    const badge = preview ? html`<${Pill} tone="muted">aperçu<//>` : settled ? html`<${Pill} tone=${STATUS_TONE[st] || "muted"}>${st}<//>` : t.frozen ? html`<${Pill} tone="info">en cours<//>` : html`<${Pill} tone="accent">ouvert jusqu'au 1er coup d'envoi<//>`;
    return html`<article className=${"ticket tk-" + id + (settled ? " tk-done" : "")}>
      <header className="tk-h">
        <div className="min-w-0"><div className="tk-name">${t.label || sc.label}</div><div className="muted tiny">${SC_DESC[id] || ""} Objectif ${SC_HINT[id] || ""}.</div>${(t.strategyLabel || t.rule) && html`<div className="tiny mt-1"><${Pill} tone="info">${t.strategyLabel || t.rule}<//></div>`}</div>
        <div className="tk-odds"><span className="muted tiny">cote</span><b className="mono">${fr(t.totalOdds, 2)}</b></div>
      </header>
      <ol className="tk-legs">${t.legs.map((l, i) => html`<li key=${i} className=${"tk-leg" + (l.status === "GAGNÉ" ? " ok" : l.status === "PERDU" ? " ko" : "")}>
        <div className="min-w-0"><div className="muted tiny mono">${koText(ctx, l)} · ${SHORT[l.comp] || l.comp}</div><div className="small ellip">${l.home} – ${l.away}</div><div className="small"><b>${l.label}</b>${U.isNum(l.p) ? html` <span className="muted mono tiny">${pct(l.p, 0)}</span>` : ""}</div>${l.why && html`<details className="tiny muted"><summary>pourquoi</summary>${l.why}</details>`}</div>
        <div className="tk-leg-r"><span className="mono" title=${l.estOdds ? "cote estimée d'après le 1N2 : vérifiez le prix" : l.oddsSrc || ""}>${fr(l.odds, 2)}${l.estOdds ? "*" : ""}</span>${l.status && l.status !== "EN ATTENTE" ? html`<span className="tiny mono">${l.score || ""} ${l.status === "GAGNÉ" ? "✓" : l.status === "PERDU" ? "✗" : "—"}</span>` : null}</div>
      </li>`)}</ol>
      <div className="tk-foot">
        ${U.isNum(t.pJoint) && U.isNum(t.totalOdds) && html`<div className=${"ev-verdict" + (t.pJoint * t.totalOdds - 1 >= 0 ? " pos" : "")}>${t.pJoint * t.totalOdds - 1 >= 0
          ? html`<b>Espérance positive</b> (+${fr(100 * (t.pJoint * t.totalOdds - 1), 0)} %).`
          : html`<b>Espérance ${fr(100 * (t.pJoint * t.totalOdds - 1), 0)} %</b> : à jouer seulement à une cote totale d'au moins <b className="mono">${fr(1.03 / t.pJoint, 2)}</b> (cote boostée) ou avec une information que le marché ignore.`}
          ${t.bookName ? html` <span className="muted">Meilleur prix chez ${t.bookName}.</span>` : ""}</div>`}
        ${Array.isArray(t.byN) && t.byN.length > 1 && html`<div className="byn" aria-label="Chance selon le nombre de sélections"><div className="tiny muted">Chance selon le nombre de sélections (même cote visée)</div>
          <div className="byn-row">${(() => { const mx = Math.max(...t.byN.map((x) => x.p)); return t.byN.map((x) => html`<div key=${x.n} className=${"byn-c" + (x.n === t.legs.length ? " on" : "")} title=${`${x.n} sélections : ${pct(x.p, 1)} (cote ${fr(x.odds, 2)})`}><i style=${{ height: Math.max(6, Math.round(100 * x.p / mx)) + "%" }}></i><span className="mono">${x.n}</span></div>`); })()}</div></div>`}
        ${(t.why || t.reason) && html`<details className="small"><summary className="muted">Pourquoi ce ticket</summary>${String(t.why || t.reason).split("\n").map((x, i) => html`<p key=${i} className="small mt-1">${x}</p>`)}</details>`}
        <div className="tk-meta small">
          <span><span className="muted">Chance estimée</span> <b className="mono">${pct(t.pJoint, 1)}</b></span>
          ${t.boost ? html`<span><span className="muted">Multiboost</span> <b className="mono">+${fr(100 * t.boost, 1)} %</b></span>` : null}
          <span><span className="muted">Espérance</span> <b className=${"mono " + (t.ev >= 0 ? "t-pos" : "t-neg")}>${sgn(100 * t.ev, 1)} %</b></span>
          <span><span className="muted">Mise fictive</span> <b className="mono">${fr(t.stake || 1, 0)} u</b></span>
        </div>
        <div className="row gap-2 items-center wrap justify-between">
          <span className="row gap-2 items-center">${badge}${settled ? html`<b className=${"mono " + (t.profit > 0 ? "t-pos" : t.profit < 0 ? "t-neg" : "")}>${sgn(t.profit)} u</b>` : null}</span>
          ${!settled && html`<${Btn} small kind="primary" onClick=${() => ctx.openReal({ legs: t.legs.map(legOf), label: "Ticket " + (t.label || sc.label), totalOdds: t.totalOdds, fromTicket: t.id || null })}><${Ic} n="Check" /> Enregistrer ce ticket<//>`}
        </div>
      </div>
    </article>`;
  }

  function WeeklyTickets({ ctx }) {
    const { state, today } = ctx;
    const win = FQ.P.ticketWindow(today, state.settings);
    const mine = (state.paperTickets || []).filter((t) => t.week === win.week);
    const prev = useMemo(() => (mine.length >= FQ.P.scenarios(state.settings).length ? null : FQ.P.previewTickets(ctx)), [state.predictions, state.userOdds, mine.length, today, ctx.trainedAt]);
    const items = FQ.P.scenarios(state.settings).map((sc) => {
      const t = mine.find((x) => x.scenario === sc.id);
      if (t) return { sc, t };
      const p = prev && prev.find((x) => x.sc.id === sc.id);
      return p && p.ticket ? { sc, t: Object.assign({ label: sc.label, scenario: sc.id, stake: sc.stake, strategyLabel: p.rule, reason: p.why || p.reason, bookName: p.bookName }, p.ticket, { legs: p.ticket.legs, byN: (p.ticket.byN || []).map((x) => ({ n: x.n, p: x.pJoint, odds: x.totalOdds })) }), preview: true } : { sc, t: null };
    });
    const bt = FQ.TRAINED && FQ.TRAINED.tickets;
    return html`<${Card} eyebrow=${`Tickets de la semaine · ${shortDay(win.from)} → ${shortDay(win.to)}`} title="4 tickets, 4 niveaux de risque">
      <p className="muted small lead">${win.open
        ? "Construits sur les matchs du jeudi au dimanche, avec les cotes réelles publiées. Ils sont réoptimisés à chaque mise à jour jusqu'au premier coup d'envoi, puis figés et joués en paper betting (1 u fictive chacun)."
        : "Les tickets de la semaine sont construits à partir de jeudi, quand les cotes du week-end sont publiées. En attendant, voici un aperçu avec les cotes déjà disponibles (non joué)."}</p>
      <div className="tickets">${items.map(({ sc, t, preview }) => t ? html`<${TicketCard} key=${sc.id} ctx=${ctx} t=${t} sc=${sc} preview=${preview} />`
        : html`<article key=${sc.id} className=${"ticket tk-" + sc.id + " tk-empty"}><div className="tk-name">${sc.label}</div><div className="muted small">Pas encore assez de matchs avec cote pour viser une cote ${SC_HINT[sc.id]}. Les cotes arrivent environ 3 jours avant les matchs.</div></article>`)}</div>
      <div className="mt-2 small"><button className="link small" onClick=${() => openLegend("ticket")}>Légende des tickets et lexique</button></div>
      <details className="mt-2 small"><summary className="muted">Comment lire ces tickets</summary>
        <ul className="notes muted">
          <li>Chance et profit vont ensemble : pour une cote totale donnée, la chance d'un combiné = produit des rendements de ses sélections (chance × cote) ÷ cote totale, et l'espérance suit ce même produit. Le ticket retient donc les sélections où le bookmaker prélève le moins, avec le nombre de sélections qui donne la meilleure chance (les barres comparent 1 à 15 sélections) ; à chance quasi égale, celui qui rapporte le plus.</li>
          <li>Quand notre modèle et le marché ne sont pas d'accord sur une sélection, sa chance est jugée moins sûre ; la prudence appliquée est apprise sur l'historique.</li>
          <li>Plusieurs stratégies sont suivies chaque semaine (favoris, chance maximale, multi-marchés, valeur). Celle qui a le meilleur taux de réussite attendu, d'après les semaines rejouées puis les semaines réelles, est jouée ; les autres sont suivies en fantôme pour apprendre. Détail dans Performance › Apprentissage continu.</li>
          <li>Chance estimée = produit des probabilités de chaque sélection. Espérance = chance × cote − 1 : elle est en général négative, car la marge du bookmaker s'ajoute à chaque sélection. Plus le ticket est long, plus elle s'accumule.</li>
        </ul></details>
    <//>`;
  }

  /**
   * Toutes les sélections d'un match : probabilité, cote juste (1/p), cote minimale intéressante ((1 + EV min)/p),
   * cote disponible (relevée, estimée ou saisie) et verdict. Iso peut saisir la cote qu'il voit, y compris une cote boostée :
   * elle est enregistrée et utilisée par les choix et les tickets au prochain calcul.
   */
  function SelectionTable({ ctx, matchId }) {
    const { state } = ctx;
    const m = ctx.matchById.get(matchId);
    const pred = useMemo(() => { let x = null; for (const p of state.predictions) if (p.matchId === matchId) x = p; return x; }, [state.predictions, matchId]);
    if (!m || !pred || !pred.markets) return null;
    const evMin = state.settings.evMin || 0.03;
    const om = FQ.P.matchOddsMap(m, state.settings, state.oddsLearn, null, state.userOdds) || {};
    const rows = FQ.P.selectionsOf(pred, m).map(([market, sel, label, p]) => ({ market, sel, label, p }));
    const pl = (pred.players || []).slice();
    pl.filter((x) => U.isNum(x.pScore)).sort((a, b) => b.pScore - a.pScore).slice(0, 4).forEach((x) => rows.push({ market: "Buteur", sel: x.name, label: `Buteur : ${x.name}`, p: x.pScore }));
    pl.filter((x) => U.isNum(x.pDecisive)).sort((a, b) => b.pDecisive - a.pDecisive).slice(0, 3).forEach((x) => rows.push({ market: "Joueur Décisif", sel: x.name, label: `Décisif (but ou passe) : ${x.name}`, p: x.pDecisive }));
    function setUser(key, v) {
      ctx.update((s) => { s.userOdds = s.userOdds || {}; if (v > 1) s.userOdds[matchId + "|" + key] = { v, at: new Date().toISOString() }; else delete s.userOdds[matchId + "|" + key]; return s; });
      ctx.notify(v > 1 ? "Cote enregistrée : elle sera utilisée au prochain calcul" : "Cote saisie retirée");
    }
    return html`<div className="mt-2"><div className="eyebrow">Cotes et seuils de toutes les sélections</div>
      <${TableWrap}><table className="tbl tiny seltbl"><thead><tr><th>Sélection</th><th title="probabilité retenue (mélange appris)">Proba.</th><th title="cotes du marché sans marge">Marché</th><th title="notre modèle sportif, sans les cotes">Modèle seul</th><th title="1 / probabilité">Cote juste</th><th title=${`espérance ≥ ${Math.round(100 * evMin)} %`}>Intéressant dès</th><th>Cote dispo</th><th>Espérance</th><th>Ta cote</th></tr></thead><tbody>
      ${rows.filter((r) => U.isNum(r.p) && r.p > 0.01).map((r) => { const key = r.market + "|" + r.sel, od = om[key], ev = od ? r.p * od.v - 1 : null, u = (state.userOdds || {})[matchId + "|" + key];
        const q = FQ.P.legProbs(pred, r.market, r.sel);
        return html`<tr key=${key}><td>${r.label}</td><td className="mono">${pct(r.p, 0)}</td><td className="mono muted">${q.mk === null ? "—" : pct(q.mk, 0)}</td><td className=${"mono " + (q.mk !== null && q.mo !== null && Math.abs(q.mo - q.mk) >= 0.08 ? "t-warn" : "muted")}>${q.mo === null ? "—" : pct(q.mo, 0)}</td><td className="mono">${fr(1 / r.p, 2)}</td><td className="mono"><b>${fr((1 + evMin) / r.p, 2)}</b></td>
          <td className="mono" title=${od ? od.src : "aucune cote relevée"}>${od ? html`${fr(od.v, 2)}${od.est ? "*" : ""}${od.user ? html` <span className="muted">(toi)</span>` : ""}` : html`<span className="muted">—</span>`}</td>
          <td className=${"mono " + (ev === null ? "" : ev >= evMin ? "t-pos" : ev < 0 ? "t-neg" : "")}>${ev === null ? "—" : sgn(100 * ev, 0) + " %"}</td>
          <td><${NumInput} value=${u ? u.v : null} min=${1.01} max=${1000} placeholder="cote" onChange=${(v) => setUser(key, v)} /></td></tr>`; })}
      </tbody></table><//>
      <p className="tiny muted mt-1">Marché = cotes sans marge ; modèle seul = notre modèle sportif sans les cotes (en orange quand il s'écarte de 8 points ou plus : estimation moins sûre). « Intéressant dès » : cote minimale pour une espérance d'au moins ${Math.round(100 * evMin)} % selon nos probabilités. Saisis la cote que tu vois (même boostée) : l'espérance se recalcule et la sélection peut entrer dans les tickets. * = cote estimée (double chance déduite du 1N2).</p></div>`;
  }

  /** Filtres et tri des pronostics (mémorisés dans ce navigateur) */
  const PICK_SORTS = [["time", "Heure du match"], ["oddsDesc", "Cote décroissante"], ["oddsAsc", "Cote croissante"], ["pDesc", "Probabilité décroissante"], ["pAsc", "Probabilité croissante"], ["evDesc", "Espérance décroissante"], ["relDesc", "Fiabilité décroissante"]];
  const PICK_F0 = { sort: "time", scope: "day", market: "ALL", oddsMin: null, oddsMax: null, pMin: null, onlyOdds: false, onlyValue: false };
  function MatchPicks({ ctx }) {
    const { state, today } = ctx;
    const H = state.settings.horizonDays || 14;
    const days = useMemo(() => Array.from({ length: H }, (_, i) => U.addDays(today, i)), [today, H]);
    const [comp, setComp] = useState("ALL");
    const [day, setDay] = useState(null);
    const [open, setOpen] = useState(null);
    const [f, setF0] = useState(() => { try { return Object.assign({}, PICK_F0, JSON.parse(P.pref("picksFilter") || "{}")); } catch (e) { return Object.assign({}, PICK_F0); } });
    const setF = (patch) => setF0((cur) => { const nx = Object.assign({}, cur, patch); try { P.pref("picksFilter", JSON.stringify(nx)); } catch (e) {} return nx; });
    const nFilters = ["market", "oddsMin", "oddsMax", "pMin", "onlyOdds", "onlyValue"].filter((k) => f[k] !== PICK_F0[k] && f[k] !== null && f[k] !== "").length;
    const allOpen = (state.picks || []).filter((p) => p.status === "EN ATTENTE" && (comp === "ALL" || p.comp === comp));
    const openPicks = allOpen.filter((p) => (f.market === "ALL" || p.market === f.market) && (!f.onlyOdds || Number.isFinite(p.odds)) && (!f.onlyValue || p.kind === "value")
      && (!(f.oddsMin > 1) || (Number.isFinite(p.odds) && p.odds >= f.oddsMin)) && (!(f.oddsMax > 1) || (Number.isFinite(p.odds) && p.odds <= f.oddsMax)) && (!(f.pMin > 0) || p.p >= f.pMin / 100));
    const byDay = {}; openPicks.forEach((p) => { (byDay[p.date] = byDay[p.date] || []).push(p); });
    const d = day && byDay[day] ? day : days.find((x) => byDay[x]) || today;
    const kickMs = (p) => { const m = ctx.matchById.get(p.matchId); return (m && FQ.time.kickoffUtc(m.date, m.time, m.tz)) || 0; };
    const num = (x, dflt) => (Number.isFinite(x) ? x : dflt);
    const cmp = {
      time: (a, b) => kickMs(a) - kickMs(b) || (a.comp < b.comp ? -1 : 1),
      oddsDesc: (a, b) => num(b.odds, -1) - num(a.odds, -1), oddsAsc: (a, b) => num(a.odds, 1e9) - num(b.odds, 1e9),
      pDesc: (a, b) => b.p - a.p, pAsc: (a, b) => a.p - b.p,
      evDesc: (a, b) => num(b.odds ? b.p * b.odds - 1 : null, -9) - num(a.odds ? a.p * a.odds - 1 : null, -9), relDesc: (a, b) => (b.rel || 0) - (a.rel || 0),
    }[f.sort] || ((a, b) => kickMs(a) - kickMs(b));
    const all = f.scope === "all";
    const list = (all ? openPicks : byDay[d] || []).slice().sort((a, b) => cmp(a, b) || kickMs(a) - kickMs(b));
    const inSlip = new Set(ctx.slip.map((x) => x.matchId));
    const comps = COMP_ORDER.filter((c) => (state.picks || []).some((p) => p.status === "EN ATTENTE" && p.comp === c));
    const total = openPicks.length;
    return html`<${Card} eyebrow=${`Pronostics · ${H} prochains jours · ${total} match${total > 1 ? "s" : ""}${total < allOpen.length ? ` sur ${allOpen.length} (filtrés)` : ""}`} title="Un choix par match" right=${html`<select className="inp" aria-label="Compétition" value=${comp} onChange=${(e) => setComp(e.target.value)}><option value="ALL">Toutes les compétitions</option>${comps.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select>`}>
      <div className="pick-tools">
        <div className="seg" role="radiogroup" aria-label="Période">${[["day", "Par jour"], ["all", "Les 14 jours"]].map(([k, l]) => html`<button key=${k} role="radio" aria-checked=${f.scope === k} className=${f.scope === k ? "on" : ""} onClick=${() => setF({ scope: k })}>${l}</button>`)}</div>
        <button className="link small" onClick=${() => openLegend("pronostic")}>Comment lire ?</button>
        <label className="pick-sort"><span className="muted tiny">Trier par</span> <select className="inp" aria-label="Trier par" value=${f.sort} onChange=${(e) => setF({ sort: e.target.value })}>${PICK_SORTS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select></label>
      </div>
      <details className="pick-filters small" open=${nFilters > 0}><summary className="muted">Filtres${nFilters ? ` (${nFilters} actif${nFilters > 1 ? "s" : ""})` : ""}</summary>
        <div className="filters">
          <${Field} label="Marché" id="pf-m"><select id="pf-m" className="inp" value=${f.market} onChange=${(e) => setF({ market: e.target.value })}><option value="ALL">Tous</option><option value="1N2">Résultat (1N2)</option><option value="BTTS">Les deux équipes marquent</option></select><//>
          <${Field} label="Cote min." id="pf-o1"><${NumInput} id="pf-o1" value=${f.oddsMin} min=${1.01} max=${100} placeholder="ex. 1,5" onChange=${(v) => setF({ oddsMin: v })} /><//>
          <${Field} label="Cote max." id="pf-o2"><${NumInput} id="pf-o2" value=${f.oddsMax} min=${1.01} max=${100} placeholder="ex. 3" onChange=${(v) => setF({ oddsMax: v })} /><//>
          <${Field} label="Probabilité min. (%)" id="pf-p"><${NumInput} id="pf-p" value=${f.pMin} min=${1} max=${99} placeholder="ex. 60" onChange=${(v) => setF({ pMin: v })} /><//>
        </div>
        <div className="row gap-3 wrap items-center mt-1">
          <label className="row gap-1 items-center"><input type="checkbox" checked=${f.onlyOdds} onChange=${(e) => setF({ onlyOdds: e.target.checked })} /> Avec cote seulement</label>
          <label className="row gap-1 items-center"><input type="checkbox" checked=${f.onlyValue} onChange=${(e) => setF({ onlyValue: e.target.checked })} /> Value bets seulement</label>
          ${nFilters > 0 && html`<button className="link small" onClick=${() => setF({ market: "ALL", oddsMin: null, oddsMax: null, pMin: null, onlyOdds: false, onlyValue: false })}>Effacer les filtres</button>`}
        </div>
        <div className="tiny muted mt-1">Un filtre de cote écarte les matchs sans cote. Les filtres et le tri sont gardés dans ce navigateur.</div>
      </details>
      ${!all && html`<div className="daybar" role="tablist" aria-label="Jour">${days.map((x) => { const n = (byDay[x] || []).length; return html`<button key=${x} role="tab" aria-selected=${x === d} className=${"dayb" + (x === d ? " on" : "") + (n ? "" : " off")} disabled=${!n} onClick=${() => setDay(x)}>
        <span className="dw">${x === today ? "auj." : new Date(x + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "short" })}</span><span className="dn">${+x.slice(8)}</span><span className="dc">${n || "·"}</span></button>`; })}</div>`}
      <div className="day-h"><b className="cap">${all ? "Les 14 prochains jours" : dayLabel(d, today)}</b> <span className="muted small">· ${list.length} match${list.length > 1 ? "s" : ""}${f.sort !== "time" ? ` · ${(PICK_SORTS.find((x) => x[0] === f.sort) || [])[1].toLowerCase()}` : ""}</span></div>
      ${!list.length ? html`<${Empty} icon="CalendarX">Aucun match${nFilters ? " avec ces filtres" : " analysé"}${all ? "" : " ce jour-là"}${comp !== "ALL" ? " dans cette compétition" : ""}.<//>` :
      html`<div className="mlist">${list.map((p) => { const added = inSlip.has(p.matchId); const m = ctx.matchById.get(p.matchId); return html`<div key=${p.id} className="mcard">
        <div className="mc-time">${all && html`<span className="tiny muted cap">${shortDay(p.date)}</span>`}<b className="mono">${koText(ctx, p, false)}</b><span className="comp-tag">${SHORT[p.comp] || p.comp}</span></div>
        <div className="mc-main min-w-0">
          <div className="mc-teams ellip">${p.home} <span className="muted">–</span> ${p.away}</div>
          <div className="mc-pick"><span className="mc-sel">${p.label}</span><span className="pbar" aria-hidden="true"><i style=${{ width: Math.round(100 * p.p) + "%" }}></i></span><span className="mono small">${pct(p.p, 0)}</span></div>
          <div className="muted tiny">${p.odds ? html`cote <b className="mono t-fg">${fr(p.odds, 2)}</b> <span title=${p.oddsSrc || ""}>${srcShort(p.oddsSrc)}</span>${p.kind === "value" ? html` · <span className="t-pos">value bet</span>` : ""}` : html`aucune cote de bookmaker pour ce marché · à jouer à partir de <span className="mono">${fr(p.minOdds, 2)}</span> (seuil du modèle)`} · fiabilité ${p.rel}/100</div>
          ${open === p.id && html`<div className="small mt-1 explain-in"><div>${p.why}</div><${SelectionTable} ctx=${ctx} matchId=${p.matchId} /><div className="muted tiny mt-1">Règle : une value bet admissible (cote connue, espérance ≥ seuil, fiabilité suffisante) est choisie en priorité ; sinon l'issue la plus probable parmi 1, N, 2 et « les deux équipes marquent » oui / non. Choix figé au coup d'envoi.</div></div>`}
        </div>
        <div className="mc-act">
          <${Btn} small kind=${added ? "primary" : "ghost"} onClick=${() => ctx.toggleSlip(p)} title="Ajouter à mon ticket">${added ? html`<${Ic} n="Check" /> Ajouté` : html`<${Ic} n="Plus" /> Ticket`}<//>
          <button className="iconbtn" aria-label="Pourquoi ce choix, cotes et seuils" title="Pourquoi ce choix · cotes et seuils · saisir une cote" onClick=${() => setOpen(open === p.id ? null : p.id)}><${Ic} n="Info" s=${15} /></button>
          ${m && html`<button className="iconbtn" aria-label="Analyse complète" title="Analyse complète" onClick=${() => ctx.analyze(p.matchId)}><${Ic} n="ChartColumn" s=${15} /></button>`}
        </div>
      </div>`; })}</div>`}
    <//>`;
  }

  /** Barre du panier : sélections ajoutées depuis les pronostics, à enregistrer comme pari réel */
  function SlipBar({ ctx }) {
    if (!ctx.slip.length) return null;
    const odds = ctx.slip.every((l) => Number.isFinite(l.odds)) ? ctx.slip.reduce((a, l) => a * l.odds, 1) : null;
    const p = ctx.slip.every((l) => Number.isFinite(l.p)) ? ctx.slip.reduce((a, l) => a * l.p, 1) : null;
    return html`<div className="slipbar" role="region" aria-label="Mon ticket">
      <div className="min-w-0"><b>Mon ticket</b> <span className="muted small">· ${ctx.slip.length} sélection${ctx.slip.length > 1 ? "s" : ""}${odds ? ` · cote ${fr(odds, 2)}` : " · cotes à saisir"}${p ? ` · chance estimée ${pct(p, 1)}` : ""}</span>
        <div className="tiny muted ellip">${ctx.slip.map((l) => l.label).join(" · ")}</div></div>
      <div className="row gap-2"><${Btn} small onClick=${() => ctx.clearSlip()}>Vider<//><${Btn} small kind="primary" onClick=${() => ctx.openReal({ legs: ctx.slip.map(legOf), label: "Mon ticket", fromSlip: true })}>Enregistrer<//></div>
    </div>`;
  }

  /* --------------------------------------------------------------- saisie d'un ticket réel */
  const BET_MARKETS = [
    { id: "1N2", label: "Résultat (1N2)", sels: [["1", "1"], ["N", "N · nul"], ["2", "2"]] },
    { id: "DC", label: "Double chance", sels: [["1N", "1N"], ["12", "12"], ["N2", "N2"]] },
    { id: "W2", label: "Gagne ou 2 buts d'avance", sels: [["1", "1"], ["2", "2"]] },
    { id: "BTTS", label: "Les deux équipes marquent", sels: [["Oui", "Oui"], ["Non", "Non"]] },
    { id: "Buts", label: "Nombre de buts", sels: ["+0.5", "+1.5", "+2.5", "+3.5", "+4.5", "-0.5", "-1.5", "-2.5", "-3.5", "-4.5"].map((x) => [x, (x[0] === "+" ? "Plus de " : "Moins de ") + x.slice(1).replace(".", ",") + " buts"]) },
    { id: "Buteur", label: "Buteur", text: "Nom du joueur" },
    { id: "Autre", label: "Autre (réglé à la main)", text: "Votre sélection" },
  ];
  const BOOKS = ["Winamax", "Betclic", "Unibet", "PMU", "NetBet", "Parions Sport", "ZEbet", "Bwin", "Vbet"];
  const nrm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function legLabel(m, market, sel) {
    if (market === "1N2") return sel === "1" ? `1 · ${m.home}` : sel === "2" ? `2 · ${m.away}` : "N · match nul";
    if (market === "DC") return sel === "1N" ? `${m.home} ou nul` : sel === "N2" ? `Nul ou ${m.away}` : `${m.home} ou ${m.away}`;
    if (market === "W2") return `${sel === "1" ? m.home : m.away} gagne ou 2 buts d'avance`;
    if (market === "BTTS") return sel === "Oui" ? "Les deux équipes marquent" : "Au moins une équipe ne marque pas";
    if (market === "Buts") return (sel[0] === "+" ? "Plus de " : "Moins de ") + sel.slice(1).replace(".", ",") + " buts";
    if (market === "Buteur") return `Buteur : ${sel}`;
    return sel;
  }
  /** Ajout d'une sélection : recherche du match, marché, sélection, cote obtenue */
  function LegPicker({ ctx, onAdd, taken }) {
    const [q, setQ] = useState("");
    const [mid, setMid] = useState(null);
    const [mkt, setMkt] = useState("1N2");
    const [sel, setSel] = useState("1");
    const [txt, setTxt] = useState("");
    const [odds, setOdds] = useState(null);
    const lo = U.addDays(ctx.today, -3), hi = U.addDays(ctx.today, 14);
    const pool = useMemo(() => ctx.matches.filter((m) => m.date >= lo && m.date <= hi && m.status !== "ANNULÉ"), [ctx.matches, lo, hi]);
    const nq = nrm(q).trim();
    const res = nq.length >= 2 ? pool.filter((m) => nrm(m.home + " " + m.away).includes(nq) && !taken.has(m.id)).slice(0, 8) : [];
    const m = mid ? ctx.matchById.get(mid) : null;
    const M = BET_MARKETS.find((x) => x.id === mkt);
    const om = m ? FQ.P.matchOddsMap(m, ctx.state.settings, ctx.state.oddsLearn) : null;
    const refO = om && !M.text ? om[mkt + "|" + sel] : null;
    const ref = refO ? { src: refO.src } : null, refV = refO ? refO.v : null;
    const selV = M.text ? txt.trim() : sel;
    const ok = m && selV && (!odds || odds > 1);
    function add() {
      if (!ok) return;
      const ko = FQ.time.kickoffUtc(m.date, m.time, m.tz);
      onAdd({ matchId: m.id, comp: m.comp, date: m.date, time: m.time || "", kickoff: ko ? new Date(ko).toISOString() : null, home: m.home, away: m.away,
        market: mkt, sel: selV, label: legLabel(m, mkt, selV), p: null, odds: odds > 1 ? odds : null, estOdds: refO && refO.est ? refO.v : null, status: "EN ATTENTE" });
      setMid(null); setQ(""); setOdds(null); setTxt("");
    }
    return html`<div className="subform">
      <div className="eyebrow">Ajouter une sélection</div>
      ${!m ? html`<${Field} label="Match" id="lp-q" hint="Tapez au moins 2 lettres d'une équipe (matchs des 3 derniers jours et des 14 prochains)."><input id="lp-q" className="inp" value=${q} placeholder="ex. Lens" autoComplete="off" onChange=${(e) => setQ(e.target.value)} /><//>
        ${res.length > 0 && html`<div className="chips">${res.map((x) => html`<button key=${x.id} className="chip" onClick=${() => { setMid(x.id); setSel(BET_MARKETS[0].sels[0][0]); setMkt("1N2"); }}><span className="comp-tag">${SHORT[x.comp] || x.comp}</span> ${x.home} – ${x.away} <span className="muted tiny">${koText(ctx, x)}</span></button>`)}</div>`}
        ${nq.length >= 2 && !res.length && html`<div className="muted small mt-1">Aucun match trouvé. Pour un match hors des 13 compétitions, choisissez « Autre » après avoir ajouté un match proche, ou décrivez le pari ci-dessous.</div>`}`
      : html`<div className="row gap-2 items-center wrap mb-2"><span className="comp-tag">${SHORT[m.comp] || m.comp}</span><b>${m.home} – ${m.away}</b><span className="muted small">${koText(ctx, m)}</span><button className="link small" onClick=${() => setMid(null)}>changer</button></div>
        <div className="form-grid">
          <${Field} label="Marché" id="lp-m"><select id="lp-m" className="inp" value=${mkt} onChange=${(e) => { const x = BET_MARKETS.find((y) => y.id === e.target.value); setMkt(x.id); if (x.sels) setSel(x.sels[0][0]); }}>${BET_MARKETS.map((x) => html`<option key=${x.id} value=${x.id}>${x.label}</option>`)}</select><//>
          ${M.sels ? html`<${Field} label="Sélection" id="lp-s"><select id="lp-s" className="inp" value=${sel} onChange=${(e) => setSel(e.target.value)}>${M.sels.map(([v, l]) => html`<option key=${v} value=${v}>${["1N2", "DC", "W2"].includes(mkt) ? legLabel(m, mkt, v) : l}</option>`)}</select><//>`
            : html`<${Field} label=${M.text} id="lp-t"><input id="lp-t" className="inp" value=${txt} onChange=${(e) => setTxt(e.target.value)} /><//>`}
          <${Field} label="Cote obtenue" id="lp-o" hint=${refV ? `repère : ${fr(refV, 2)}${refO.est ? " (estimée)" : ` chez ${srcShort(ref.src)}`}` : "facultative si vous saisissez la cote totale"}><${NumInput} id="lp-o" value=${odds} min=${1.01} max=${1000} placeholder=${refV ? fr(refV, 2) : "ex. 1,85"} onChange=${setOdds} /><//>
        </div>
        <div className="row justify-end mt-2"><${Btn} small kind="primary" disabled=${!ok} onClick=${add}><${Ic} n="Plus" /> Ajouter au ticket<//></div>`}
    </div>`;
  }
  /** Nom court d'une source de cote : « Winamax », « médiane FR », « Bet 365 »… */
  function srcShort(src) {
    const t = String(src || "");
    if (/^médiane/.test(t)) return "médiane FR";
    if (/Bet 365/.test(t)) return "Bet 365";
    return t.split(/ \(| ·| via /)[0] || "—";
  }

  /** Saisie d'un pari réel (euros) : depuis un ticket proposé, le panier, ou de zéro */
  function RealBetForm({ ctx, init, onClose }) {
    const [legs, setLegs] = useState(() => (init.legs || []).map((l) => Object.assign({}, l)));
    const prod = legs.length && legs.every((l) => Number.isFinite(l.odds)) ? Math.round(legs.reduce((a, l) => a * l.odds, 1) * 100) / 100 : null;
    const [total, setTotal] = useState(init.totalOdds || prod);
    const [touched, setTouched] = useState(false);
    const [stake, setStake] = useState(null);
    const [book, setBook] = useState(() => P.pref("book") || "");
    const [label, setLabel] = useState(init.label || "Mon ticket");
    const [desc, setDesc] = useState("");
    const [mode, setMode] = useState(init.mode || "test");
    useEffect(() => { if (!touched) setTotal(prod); }, [prod]);
    const free = !legs.length;
    const manual = legs.some((l) => l.market === "Autre");
    const ok = stake > 0 && total > 1 && (!free || desc.trim().length > 1);
    function save() {
      if (!ok) return;
      const now = new Date().toISOString();
      P.pref("book", book);
      ctx.update((s) => {
        s.realBets = s.realBets || [];
        s.realBets.push({ id: U.uid("rb"), createdAt: now, label: label.trim() || "Pari", desc: free ? desc.trim() : null, bookmaker: book.trim() || null, currency: "€", stake: Math.round(stake * 100) / 100,
          totalOdds: Math.round(total * 100) / 100, legs: legs.map((l) => Object.assign({}, l, { status: "EN ATTENTE" })), status: "EN ATTENTE", profit: 0, fromTicket: init.fromTicket || null, mode, updatedAt: now,
          pJoint: legs.length && legs.every((l) => Number.isFinite(l.p)) ? legs.reduce((a, l) => a * l.p, 1) : null });
        return s;
      });
      if (init.fromSlip) ctx.clearSlip();
      ctx.notify((mode === "test" ? "Test enregistré (compté à part des paris réels)" : "Pari réel enregistré") + (free || manual ? " : à régler à la main" : " : réglé automatiquement avec les résultats"), "pos");
      onClose();
    }
    return html`<div className="overlay" role="dialog" aria-modal="true" aria-label="Enregistrer mon ticket"><div className="dialog wide">
      <h3>Enregistrer mon ticket</h3>
      <div className="seg mb-2" role="radiogroup" aria-label="Type de ticket">${[["test", "Test (simulation, pas joué)"], ["reel", "Joué pour de vrai"]].map(([k, l]) => html`<button key=${k} role="radio" aria-checked=${mode === k} className=${mode === k ? "on" : ""} onClick=${() => setMode(k)}>${l}</button>`)}</div>
      <p className="muted small">${mode === "test" ? "Un test est suivi et audité comme un vrai pari, mais compté à part : il n'entre pas dans le bilan de tes paris réels. " : "Pari réellement joué : il entre dans le bilan en euros. "}Ajoutez chaque sélection, avec la cote obtenue chez votre bookmaker, puis la cote totale affichée (Multiboost compris) et la mise. Résultat, double chance, gagne ou 2 buts d'avance, les deux équipes marquent et nombre de buts sont réglés automatiquement ; un buteur est confirmé automatiquement s'il a marqué, sinon à vérifier à la main. Vos cotes réelles servent à corriger les estimations (double chance, Multiboost).</p>
      <div className="form-grid">
        <${Field} label="Nom" id="rb-l"><input id="rb-l" className="inp" value=${label} onChange=${(e) => setLabel(e.target.value)} /><//>
        <${Field} label="Bookmaker" id="rb-b"><input id="rb-b" className="inp" list="rb-books" value=${book} placeholder="ex. Winamax" onChange=${(e) => setBook(e.target.value)} /><datalist id="rb-books">${BOOKS.map((b) => html`<option key=${b} value=${b} />`)}</datalist><//>
      </div>
      ${legs.length > 0 && html`<div className="rb-legs">${legs.map((l, i) => html`<div key=${i} className="rb-leg">
        <div className="min-w-0"><div className="tiny muted mono">${koText(ctx, l)} · ${SHORT[l.comp] || l.comp}</div><div className="small ellip">${l.home} – ${l.away} · <b>${l.label}</b></div></div>
        <${NumInput} value=${l.odds} min=${1.01} max=${1000} width="5rem" placeholder="cote" onChange=${(v) => setLegs(legs.map((x, j) => (j === i ? Object.assign({}, x, { odds: v }) : x)))} />
        <button className="iconbtn" aria-label="Retirer" title="Retirer" onClick=${() => setLegs(legs.filter((_, j) => j !== i))}><${Ic} n="X" s=${15} /></button>
      </div>`)}</div>`}
      <${LegPicker} ctx=${ctx} taken=${new Set(legs.map((l) => l.matchId))} onAdd=${(l) => setLegs(legs.concat([l]))} />
      ${free && html`<${Field} label="Ou décrivez un pari sans match de la liste" id="rb-d"><input id="rb-d" className="inp" value=${desc} placeholder="ex. Combiné tennis, réglé à la main" onChange=${(e) => setDesc(e.target.value)} /><//>`}
      <div className="form-grid mt-2">
        <${Field} label="Cote totale obtenue" id="rb-o" hint=${prod && !free ? `produit des cotes : ${fr(prod, 2)} (modifiable : boost, cote arrondie…)` : null}><${NumInput} id="rb-o" value=${total} min=${1.01} max=${100000} onChange=${(v) => { setTouched(true); setTotal(v); }} /><//>
        <${Field} label=${mode === "test" ? "Mise fictive (€)" : "Mise (€)"} id="rb-s"><${NumInput} id="rb-s" value=${stake} min=${0.01} max=${100000} placeholder="ex. 5" onChange=${setStake} /><//>
        <div className="field"><span className="field-l">Gain possible</span><b className="mono rb-gain">${stake > 0 && total > 1 ? fr(stake * total, 2) + " €" : "—"}</b></div>
      </div>
      <div className="row gap-2 justify-end mt-3"><${Btn} onClick=${onClose}>Annuler<//><${Btn} kind="primary" disabled=${!ok} onClick=${save}>Enregistrer<//></div>
    </div></div>`;
  }

  /** Mes paris : paper betting (tickets fictifs) et paris réels (euros) */
  function MyBets({ ctx }) {
    const { state } = ctx;
    const [view, setView] = useState("real");
    const [confirmDel, setConfirmDel] = useState(null);
    const [kind, setKind] = useState("all");
    const allBets = (state.realBets || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const real = allBets.filter((b) => kind === "all" || (kind === "reel") === FQ.P.isRealBet(b));
    const rsR = betStats(allBets.filter(FQ.P.isRealBet)), rsT = betStats(allBets.filter((b) => !FQ.P.isRealBet(b)));
    const paper = (state.paperTickets || []).slice().sort((a, b) => ((a.week || "") + a.scenario < (b.week || "") + b.scenario ? 1 : -1));
    const ps = betStats(paper);
    const byLevel = FQ.P.scenarios(state.settings).map((sc) => Object.assign({ sc }, betStats(paper.filter((t) => t.scenario === sc.id))));
    function setManual(id, st) {
      ctx.update((s) => { const b = (s.realBets || []).find((x) => x.id === id); if (!b) return s;
        if (st === null) { delete b.manualStatus; b.status = "EN ATTENTE"; b.profit = 0; delete b.settledAt; delete b.settledOdds; }
        else { b.manualStatus = st; b.status = st; b.profit = st === "GAGNÉ" ? Math.round(b.stake * (b.totalOdds - 1) * 100) / 100 : st === "PERDU" ? -b.stake : 0; b.settledAt = new Date().toISOString(); }
        b.updatedAt = new Date().toISOString();
        return s; });
    }
    function setMode(id, mode) { ctx.update((s) => { const b = (s.realBets || []).find((x) => x.id === id); if (b) { b.mode = mode; b.updatedAt = new Date().toISOString(); } return s; }); ctx.notify(mode === "reel" ? "Compté comme pari réel" : "Compté comme test"); }
    function del(id) { ctx.update((s) => { s.realBets = (s.realBets || []).filter((x) => x.id !== id); s.deletedReal = (s.deletedReal || []).concat([id]); return s; }); }
    const legsLine = (b) => b.legs.length ? b.legs.map((l) => html`<span key=${l.matchId + l.sel} className=${"leg-chip" + (l.status === "GAGNÉ" ? " ok" : l.status === "PERDU" ? " ko" : "")} title=${l.clv ? `Clôture ${fr(l.clv.close, 2)} (${l.clv.src})` : l.oddsSrc || ""}>${l.home} – ${l.away} : <b>${l.label}</b>${Number.isFinite(l.odds) ? html` <span className="mono">@${fr(l.odds, 2)}</span>` : ""}${l.score ? ` (${l.score})` : ""}${l.status === "À VÉRIFIER" ? html` <span className="t-warn">à vérifier</span>` : ""}${l.clv ? html` <span className=${"mono " + (l.clv.ev > 0 ? "t-pos" : "t-neg")}>CLV ${sgn(100 * l.clv.ev, 1)} %</span>` : ""}</span>`) : html`<span className="small">${b.desc}</span>`;
    const clvLine = (b) => b.clv ? html`<div className=${"tiny mono " + (b.clv.ev > 0 ? "t-pos" : "t-neg")} title=${`Cote de clôture ${fr(b.clv.close, 2)} · ${b.clv.src}${b.clv.final ? "" : " (provisoire)"}`}>CLV ${sgn(100 * b.clv.ev, 1)} %${b.clv.final ? "" : " (prov.)"}</div>` : null;
    return html`<${Card} eyebrow="Suivi" title="Mes paris" right=${html`<div className="seg">${[["real", `Mes tickets (${allBets.length})`], ["paper", `Paper betting (${paper.length})`]].map(([k, l]) => html`<button key=${k} className=${view === k ? "on" : ""} onClick=${() => setView(k)}>${l}</button>`)}</div>`}>
      ${view === "real" ? html`
        <div className="stats mb-2">
          <${Stat} label="Paris réels · résultat" value=${sgn(rsR.profit) + " €"} tone=${rsR.profit > 0 ? "pos" : rsR.profit < 0 ? "neg" : null} sub=${`${rsR.done} réglé(s) · ${rsR.won} gagné(s) · ${rsR.open} en cours · rendement ${rsR.roi === null ? "—" : sgn(100 * rsR.roi, 1) + " %"}`} />
          <${Stat} label="Tests · résultat fictif" value=${sgn(rsT.profit) + " €"} tone=${rsT.profit > 0 ? "pos" : rsT.profit < 0 ? "neg" : null} sub=${`${rsT.done} réglé(s) · ${rsT.won} gagné(s) · ${rsT.open} en cours (pas d'argent engagé)`} />
        </div>
        <div className="seg mb-2">${[["all", "Tous"], ["reel", `Réels (${allBets.length - rsT.n})`], ["test", `Tests (${rsT.n})`]].map(([k, l]) => html`<button key=${k} className=${kind === k ? "on" : ""} onClick=${() => setKind(k)}>${l}</button>`)}</div>
        <div className="row gap-2 mb-2 wrap"><${Btn} small kind="primary" onClick=${() => ctx.openReal({ legs: [], label: "Mon ticket" })}><${Ic} n="Plus" /> Saisir mon ticket<//><span className="muted small">Depuis un ticket proposé ou ton panier : « Enregistrer ce ticket ». Choisis « test » si tu ne l'as pas joué.</span></div>
        ${!real.length ? html`<${Empty} icon="Wallet">Aucun ticket enregistré ici. « Enregistrer ce ticket » sur un ticket proposé ou « + Mon ticket » : le résultat sera suivi et audité automatiquement, en test ou en réel.<//>` :
        html`<div className="betlist">${real.map((b) => html`<div key=${b.id} className="betrow">
          <div className="min-w-0">
            <div className="row gap-2 items-center wrap"><b>${b.label}</b><${Pill} tone=${FQ.P.isRealBet(b) ? "accent" : "muted"}>${FQ.P.isRealBet(b) ? "réel" : "test"}<//><${Pill} tone=${STATUS_TONE[b.status] || "muted"}>${b.status}<//>${b.bookmaker && html`<span className="muted tiny">${b.bookmaker}</span>`}<span className="muted tiny">${dtFR(b.createdAt)}</span></div>
            <div className="legs-line">${legsLine(b)}</div>
          </div>
          <div className="betrow-r">
            <div className="mono small">${fr(b.stake, 2)} € × ${fr(b.totalOdds, 2)}</div>${clvLine(b)}
            <div className=${"mono " + (b.profit > 0 ? "t-pos" : b.profit < 0 ? "t-neg" : "muted")}>${b.status === "EN ATTENTE" ? `gain possible ${fr(b.stake * b.totalOdds, 2)} €` : sgn(b.profit) + " €"}</div>
            <div className="row gap-1 justify-end wrap">
              ${b.status === "EN ATTENTE" || b.status === "À VÉRIFIER" || b.manualStatus ? html`${["GAGNÉ", "PERDU", "ANNULÉ"].map((s) => html`<button key=${s} className=${"mini" + (b.manualStatus === s ? " on" : "")} onClick=${() => setManual(b.id, b.manualStatus === s ? null : s)} title=${b.legs.length ? "Forcer le statut (sinon réglé automatiquement)" : "Régler ce pari"}>${s === "GAGNÉ" ? "Gagné" : s === "PERDU" ? "Perdu" : "Annulé"}</button>`)}` : null}
              <button className="mini" onClick=${() => setMode(b.id, FQ.P.isRealBet(b) ? "test" : "reel")} title=${FQ.P.isRealBet(b) ? "Compter comme test" : "Compter comme pari réel"}>${FQ.P.isRealBet(b) ? "→ test" : "→ réel"}</button>
              <button className="mini" onClick=${() => setConfirmDel(b)} title="Supprimer"><${Ic} n="Trash2" s=${13} /></button>
            </div>
          </div>
        </div>`)}</div>`}`
      : html`
        <div className="stats mb-2">
          <${Stat} label="Paper betting" value=${sgn(ps.profit) + " u"} tone=${ps.profit > 0 ? "pos" : ps.profit < 0 ? "neg" : null} sub=${`${ps.done} ticket(s) réglé(s), ${ps.won} gagné(s), ${ps.open} en cours`} />
          ${byLevel.map((x) => html`<${Stat} key=${x.sc.id} label=${x.sc.label} value=${x.done ? `${x.won}/${x.done}` : "—"} sub=${x.done ? `${sgn(x.profit)} u · rendement ${x.roi === null ? "—" : sgn(100 * x.roi, 0) + " %"}` : "aucun ticket réglé"} />`)}
        </div>
        ${!paper.length ? html`<${Empty} icon="Ticket">Aucun ticket fictif pour l'instant : le premier jeu de la semaine est construit jeudi.<//>` :
        html`<div className="betlist">${paper.map((t) => html`<div key=${t.id} className="betrow">
          <div className="min-w-0">
            <div className="row gap-2 items-center wrap"><b>${t.label}</b><${Pill} tone=${STATUS_TONE[t.status] || "muted"}>${t.status === "EN ATTENTE" ? (t.frozen ? "EN COURS" : "OUVERT") : t.status}<//><span className="muted tiny">semaine du ${dFR(t.week)}</span></div>
            <div className="legs-line">${legsLine(t)}</div>
          </div>
          <div className="betrow-r"><div className="mono small">${fr(t.stake, 0)} u × ${fr(t.totalOdds, 2)}</div><div className="muted tiny">chance estimée ${pct(t.pJoint, 1)}</div>${clvLine(t)}
            <div className=${"mono " + (t.profit > 0 ? "t-pos" : t.profit < 0 ? "t-neg" : "muted")}>${t.status === "EN ATTENTE" ? "—" : sgn(t.profit) + " u"}</div></div>
        </div>`)}</div>`}`}
      <${Confirm} open=${!!confirmDel} title="Supprimer ce pari ?" text=${confirmDel ? `${confirmDel.label} · ${fr(confirmDel.stake, 2)} € × ${fr(confirmDel.totalOdds, 2)}` : ""} danger yesLabel="Supprimer" onNo=${() => setConfirmDel(null)} onYes=${() => { del(confirmDel.id); setConfirmDel(null); }} />
    <//>`;
  }

  /* =========================================================================
     ONGLET 3 — AUDIT T+1 & APPRENTISSAGE
     ========================================================================= */
  function Audit({ ctx }) {
    const { state, today } = ctx;
    const [sel, setSel] = useState(null);
    const [learnMsg, setLearnMsg] = useState(null);
    const audited = new Set(state.audits.map((a) => a.matchId));
    const pendingMatchIds = [...new Set([
      ...state.bets.filter((b) => b.status === "EN ATTENTE" || b.status === "NON VÉRIFIABLE").map((b) => b.matchId),
      ...state.predictions.filter((p) => !audited.has(p.matchId)).map((p) => p.matchId),
    ])].filter((id) => { const m = ctx.matchById.get(id); return m && m.date <= today; });
    const futurePending = state.bets.filter((b) => b.status === "EN ATTENTE" && (ctx.matchById.get(b.matchId)?.date || "9") > today).length;
    const metrics = useMemo(() => FQ.predictionMetrics(state), [state.predictions, state.results]);
    const pendingBets = state.bets.filter((b) => pendingMatchIds.includes(b.matchId));

    function learn() {
      const s2 = structuredClone(state);
      const entry = FQ.P.learnCalibration(s2, "manuel");
      ctx.update(() => s2);
      setLearnMsg(entry);
    }

    const qrows = Object.entries(ctx.qtable).map(([k, q]) => Object.assign({ k }, q, FQ.agentView(ctx.qtable, k, ctx.settings.agentMinN))).sort((a, b) => b.n - a.n);
    const brierSeries = (arr) => { let acc = 0; return arr.slice().sort((a, b) => (a.t < b.t ? -1 : 1)).map((x, i) => { acc += x.brier; return { i: i + 1, v: +(acc / (i + 1)).toFixed(4) }; }); };
    const calBins = FQ.calibrationBins([...metrics.BTTS.map((x) => [x.p, x.o]), ...metrics["1N2"].flatMap((x) => x.p3.map((p, i) => [p, x.k === i ? 1 : 0])), ...metrics.Buteur.map((x) => [x.p, x.o])], 10);
    const decisionOutcome = ["VALUE BET", "VALUE BET (hors recommandation)", "À SURVEILLER (hors recommandation)", "NO BET (hors recommandation)"].map((d) => {
      const arr = state.bets.filter((b) => b.decision === d && (b.status === "GAGNÉ" || b.status === "PERDU"));
      return { d: d.replace(" (hors recommandation)", " (hors rec.)"), gagnés: arr.filter((b) => b.status === "GAGNÉ").length, perdus: arr.filter((b) => b.status === "PERDU").length, profit: +arr.reduce((a, b) => a + b.profit, 0).toFixed(2) };
    }).filter((x) => x.gagnés + x.perdus > 0);
    const tHist = state.calibration.history.map((h, i) => ({ i: i + 1, "T 1N2": h.after.T1N2, "T BTTS": h.after.TBTTS, "T joueurs": h.after.TPLAYER }));

    return html`<div className="stack">
      <${MyBets} ctx=${ctx} />
      <${PicksBoard} ctx=${ctx} />
      <details className="adv"><summary><${Ic} n="ClipboardCheck" /> Audit détaillé : saisie manuelle des résultats, apprentissage, calibration</summary><div className="stack mt-2">
      <div className="grid-2">
        <${Card} eyebrow="Zone A" title="Paris et prédictions à auditer">
          ${futurePending > 0 && html`<div className="muted small mb-2">${futurePending} pari(s) ouvert(s) concernent des matchs futurs : audit possible après la rencontre.</div>`}
          ${!pendingMatchIds.length ? html`<${Empty} icon="CircleCheck">Rien à auditer pour l'instant.<//>` :
          html`<${TableWrap}><table className="tbl small"><thead><tr><th>Date</th><th>Match</th><th>Marché</th><th>Sélection</th><th>Prob.</th><th>Cote</th><th>Mise</th><th>Statut</th><th>P/L</th></tr></thead>
            <tbody>${pendingMatchIds.map((id) => { const m = ctx.matchById.get(id); const bs = pendingBets.filter((b) => b.matchId === id);
              return html`<${Fragment} key=${id}><tr className=${"grp" + (sel === id ? " sel" : "")} onClick=${() => setSel(id)}><td className="mono">${dFR(m.date)}</td><td colSpan="7"><b>${m.home} – ${m.away}</b> <${CompTag} code=${m.comp} /> ${m.hg !== null ? html`<span className="mono">· source ${m.hg}-${m.ag}</span>` : ""}</td><td><${Btn} small kind=${sel === id ? "primary" : "ghost"} onClick=${() => setSel(id)}>Saisir<//></td></tr>
                ${bs.map((b) => html`<tr key=${b.id}><td></td><td className="muted">${b.match}</td><td>${b.market}</td><td>${b.selection}</td><td className="mono">${pct(b.p)}</td><td className="mono">${fr(b.odds, 2)}</td><td className="mono">${eur(b.stake)}</td><td><${Pill} tone=${STATUS_TONE[b.status]}>${b.status}<//></td><td className="mono">—</td></tr>`)}<//>`; })}</tbody></table><//>`}
        <//>
        <${Card} eyebrow="Zone B" title="Saisie des résultats">
          ${sel ? html`<${ResultForm} key=${sel} ctx=${ctx} match=${ctx.matchById.get(sel)} onDone=${() => setSel(null)} />` : html`<${Empty} icon="PenLine">Sélectionnez un match à gauche.<//>`}
        <//>
      </div>
      <${Card} eyebrow="Zone C · Apprentissage" title="Observations, scores, paramètres" right=${html`<${Btn} kind="primary" onClick=${learn}><${Ic} n="RefreshCcw" /> Actualiser le modèle<//>`}>
        <div className="stats">
          ${Object.entries(metrics).map(([k, arr]) => html`<${Stat} key=${k} label=${k} value=${arr.length ? fr(arr.reduce((a, x) => a + x.brier, 0) / arr.length, 4) : "—"} sub=${`Brier${k === "1N2" ? " multiclasses (0–2)" : " (0–1)"} · n = ${arr.length}${arr.length ? " · log loss " + fr(arr.reduce((a, x) => a + x.ll, 0) / arr.length, 3) : ""}`} />`)}
          <${Stat} label="Résultat net réalisé" value=${eur(ctx.acct.realized, ctx.settings.currency)} tone=${ctx.acct.realized >= 0 ? "pos" : "neg"} sub=${`${ctx.acct.won + ctx.acct.lost} paris résolus`} />
        </div>
        ${learnMsg && html`<div className=${"note " + (learnMsg.changed ? "pos" : "")}><b>${learnMsg.changed ? `Paramètres actualisés (calibration v${state.calibration.version})` : "Aucun apprentissage justifié"}</b>
          <ul className="notes">${Object.entries(learnMsg.results).map(([k, r]) => html`<li key=${k}>${k} : ${r.ok ? `T = ${fr(r.T, 2)} ajusté sur ${r.nTrain} obs., log loss hors échantillon (${r.nTest} obs.) ${fr(r.testBefore, 4)} → ${fr(r.testAfter, 4)} : ${r.accepted ? "retenu" : "rejeté (pas d'amélioration hors échantillon)"}` : r.reason}</li>`)}</ul></div>`}
        <div className="grid-2 mt-2">
          <div><div className="eyebrow">Paramètres de calibration (température, validation chronologique 70/30)</div>
            <${TableWrap}><table className="tbl small"><thead><tr><th>Version</th><th>Date</th><th>T 1N2</th><th>T BTTS</th><th>T joueurs</th><th>Retenu</th></tr></thead>
              <tbody><tr><td>v1</td><td className="muted">initial</td><td className="mono">1,00</td><td className="mono">1,00</td><td className="mono">1,00</td><td>—</td></tr>
              ${state.calibration.history.map((h, i) => html`<tr key=${i}><td>essai ${i + 1}</td><td className="mono">${dtFR(h.at)}</td><td className="mono">${fr(h.before.T1N2, 2)} → ${fr(h.after.T1N2, 2)}</td><td className="mono">${fr(h.before.TBTTS, 2)} → ${fr(h.after.TBTTS, 2)}</td><td className="mono">${fr(h.before.TPLAYER, 2)} → ${fr(h.after.TPLAYER, 2)}</td><td>${h.changed ? html`<${Pill} tone="pos">oui<//>` : html`<${Pill}>non<//>`}</td></tr>`)}</tbody></table><//>
            <div className="muted small">Les paramètres Poisson (μ, γ, ρ, attaques, défenses) sont ré-estimés par maximum de vraisemblance à chaque nouvelle donnée : ils évoluent dès qu'un résultat est saisi.</div></div>
          <div><div className="eyebrow">Politique RL (bandit contextuel, Q(s, PRENDRE) ; Q(s, PASSER) = 0)</div>
            ${!qrows.length ? html`<${Empty} icon="Brain">Aucune observation : l'agent apprend à l'audit, y compris sur les opportunités passées (récompense contrefactuelle observable).<//>` :
            html`<${TableWrap}><table className="tbl small"><thead><tr><th>État (marché | EV | fiabilité | cote)</th><th>n</th><th>Q</th><th>Moyenne</th><th>Borne haute</th><th>Statut</th></tr></thead>
              <tbody>${qrows.slice(0, 18).map((q) => html`<tr key=${q.k}><td className="mono tiny">${q.k}</td><td className="mono">${q.n}</td><td className="mono">${sgn(q.q, 3)}</td><td className="mono">${sgn(q.mean, 3)}</td><td className="mono">${q.active ? sgn(q.ucb, 3) : "—"}</td><td>${q.active ? (q.veto ? html`<${Pill} tone="neg">veto<//>` : html`<${Pill} tone="pos">actif<//>`) : html`<${Pill}>${"n < " + ctx.settings.agentMinN}<//>`}</td></tr>`)}</tbody></table><//>`}
            <div className="muted small">Récompense = rendement unitaire (c − 1 si gagné, −1 si perdu, 0 si annulé) − κ × part d'exposition (κ = ${ctx.settings.riskKappa}). Mise à jour Q ← Q + α(r − Q), α = ${ctx.settings.agentAlpha}. Le Brier est suivi à part, jamais additionné au rendement.</div></div>
        </div>
        <details className="mt-2"><summary className="small">Journal de l'agent (${state.qlog.length} entrées) et historique des versions</summary>
          <${TableWrap}><table className="tbl tiny"><thead><tr><th>Date</th><th>État</th><th>Action</th><th>r</th><th>Q avant</th><th>Q après</th><th>α</th><th>Version</th></tr></thead>
            <tbody>${state.qlog.slice(-60).reverse().map((e) => html`<tr key=${e.id}><td className="mono">${dtFR(e.t)}</td><td className="mono">${e.key}</td><td>${e.action}</td><td className="mono">${sgn(e.reward, 3)}</td><td className="mono">${fr(e.old, 4)}</td><td className="mono">${fr(e.new, 4)}</td><td className="mono">${e.alpha}</td><td>${e.version}</td></tr>`)}</tbody></table><//>
        </details>
      <//>
      <${Card} eyebrow="Zone D · Comparatif visuel" title="Calibration, décisions, paramètres">
        <div className="grid-2">
          <${CalibrationChart} bins=${calBins} title="Calibration des prédictions résolues (tous marchés)" />
          <${Chart} title="Résultat des décisions (paris résolus)" empty=${decisionOutcome.length ? null : "Aucun pari résolu"}>
            ${RC && html`<${RC.BarChart} data=${decisionOutcome} margin=${{ top: 8, right: 8, bottom: 4, left: -16 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="d" /><${RC.YAxis} ...${axisProps} allowDecimals=${false} /><${RC.Tooltip} ...${tipStyle} /><${RC.Legend} wrapperStyle=${{ fontSize: 12, color: C.muted }} /><${RC.Bar} dataKey="gagnés" fill=${C.pos} radius=${[4, 4, 0, 0]} isAnimationActive=${false} /><${RC.Bar} dataKey="perdus" fill=${C.neg} radius=${[4, 4, 0, 0]} isAnimationActive=${false} /><//>`}
          <//>
          <${Chart} title="Évolution des températures de calibration" empty=${tHist.length ? null : "Aucun essai d'apprentissage"}>
            ${RC && html`<${RC.LineChart} data=${tHist} margin=${{ top: 8, right: 12, bottom: 4, left: -16 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="i" /><${RC.YAxis} ...${axisProps} domain=${[0.5, 1.7]} /><${RC.Tooltip} ...${tipStyle} /><${RC.Legend} wrapperStyle=${{ fontSize: 12 }} />
              <${RC.Line} dataKey="T 1N2" stroke=${C.s1} strokeWidth=${2} dot=${{ r: 4 }} isAnimationActive=${false} /><${RC.Line} dataKey="T BTTS" stroke=${C.s2} strokeWidth=${2} dot=${{ r: 4 }} isAnimationActive=${false} /><${RC.Line} dataKey="T joueurs" stroke=${C.s3} strokeWidth=${2} dot=${{ r: 4 }} isAnimationActive=${false} /><//>`}
          <//>
          <${Chart} title="Brier 1N2 cumulé (moyenne glissante)" empty=${metrics["1N2"].length ? null : "Aucune prédiction 1N2 résolue"} note="Référence : une prévision uniforme (1/3) obtient 0,667.">
            ${RC && html`<${RC.LineChart} data=${brierSeries(metrics["1N2"])} margin=${{ top: 8, right: 12, bottom: 4, left: -8 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="i" /><${RC.YAxis} ...${axisProps} domain=${["auto", "auto"]} /><${RC.Tooltip} ...${tipStyle} /><${RC.ReferenceLine} y=${0.6667} stroke=${C.muted} strokeDasharray="4 4" /><${RC.Line} dataKey="v" name="Brier" stroke=${C.s1} strokeWidth=${2} dot=${false} isAnimationActive=${false} /><//>`}
          <//>
        </div>
      <//>
      </div></details>
    </div>`;
  }

  function ResultForm({ ctx, match, onDone }) {
    const existingAudit = ctx.state.audits.find((a) => a.matchId === match.id);
    const prev = ctx.state.results[match.id];
    const hidden = ctx.mode === "demo" ? ctx.demoData.hidden[match.id] : null;
    const srcGoals = match.goals && match.goals.length ? match.goals.map((g) => ({ name: g[1], side: g[0], og: g[3] === "og" })) : [];
    const [f, setF] = useState(() => ({
      status: prev ? prev.status : match.status === "REPORTÉ" ? "REPORTÉ" : "TERMINÉ",
      hg: prev ? prev.hg : match.hg, ag: prev ? prev.ag : match.ag,
      scorers: prev && prev.scorers ? prev.scorers : srcGoals, assisters: prev && prev.assisters ? prev.assisters.join(", ") : "", assistsKnown: prev ? !!prev.assistsKnown : false, played: prev && prev.played ? prev.played : {},
    }));
    const [confirm, setConfirm] = useState(false);
    const players = [...new Set([
      ...ctx.state.bets.filter((b) => b.matchId === match.id && b.playerName).map((b) => b.playerName),
      ...ctx.state.predictions.filter((p) => p.matchId === match.id).flatMap((p) => (p.players || []).map((x) => x.name)),
    ])];
    const goalsOk = f.status !== "TERMINÉ" || (Number.isFinite(f.hg) && Number.isFinite(f.ag) && f.hg >= 0 && f.ag >= 0);
    const scorerMismatch = f.status === "TERMINÉ" && f.scorers.length > 0 && (f.scorers.filter((s) => s.side === 0).length !== f.hg || f.scorers.filter((s) => s.side === 1).length !== f.ag);
    const sourceMismatch = match.hg !== null && f.status === "TERMINÉ" && (f.hg !== match.hg || f.ag !== match.ag) && match.source !== "saisie utilisateur";

    function validate() {
      const now = new Date().toISOString();
      const result = { hg: f.status === "TERMINÉ" ? f.hg : null, ag: f.status === "TERMINÉ" ? f.ag : null, status: f.status, scorers: f.scorers.filter((s) => s.name.trim()),
        assisters: f.assisters.split(",").map((x) => x.trim()).filter(Boolean), assistsKnown: f.assistsKnown, played: f.played,
        source: hidden ? "démo fictive" : match.hg !== null && f.hg === match.hg && f.ag === match.ag ? "openfootball + saisie" : "saisie utilisateur", enteredAt: now, overrideScore: match.hg !== null && (f.hg !== match.hg || f.ag !== match.ag) };
      const auditId = U.uid("audit");
      ctx.update((s) => { FQ.P.auditMatch(s, match, result, { now, auditId }); return s; });
      ctx.notify("Audit validé : paris réglés, unités et métriques actualisées", "pos");
      onDone();
    }
    function revert() {
      ctx.update((s) => {
        const a = s.audits.find((x) => x.matchId === match.id && !x.reverted); if (!a) return s;
        a.reverted = new Date().toISOString();
        s.bets.forEach((b) => { if (b.auditId === a.id) { b.status = "EN ATTENTE"; b.profit = 0; b.settledAt = null; b.settleNote = "audit annulé"; b.auditId = null; } });
        s.qlog = s.qlog.filter((e) => e.auditId !== a.id);
        s.opportunities.forEach((o) => { if (o.matchId === match.id && o.status === "expirée") o.status = "ouverte"; });
        delete s.results[match.id];
        s.log.push({ t: a.reverted, text: `Audit annulé : ${match.home} – ${match.away}` });
        return s;
      });
      ctx.notify("Audit annulé : règlements et apprentissage retirés");
    }
    const activeAudit = ctx.state.audits.find((a) => a.matchId === match.id && !a.reverted);
    if (activeAudit) return html`<div><div className="note">Audit validé le ${dtFR(activeAudit.at)} : score ${activeAudit.result.hg ?? "—"}–${activeAudit.result.ag ?? "—"} (${activeAudit.result.status}). Une nouvelle validation est bloquée pour éviter un double règlement.</div>
      <div className="row gap-2 mt-2"><${Btn} kind="danger" onClick=${() => setConfirm(true)}>Annuler cet audit<//><${Btn} onClick=${onDone}>Fermer<//></div>
      <${Confirm} open=${confirm} danger title="Annuler l'audit ?" text="Les paris réglés repassent en attente et les mises à jour de l'agent issues de cet audit sont retirées." onNo=${() => setConfirm(false)} onYes=${() => { setConfirm(false); revert(); }} /></div>`;

    const setScorer = (i, k, v) => setF({ ...f, scorers: f.scorers.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
    return html`<form onSubmit=${(e) => { e.preventDefault(); if (goalsOk) setConfirm(true); }}>
      <div className="small mb-2"><b>${match.home} – ${match.away}</b> · ${dFR(match.date)} · ${match.source}${match.hg !== null ? ` · score source ${match.hg}-${match.ag}` : " · score absent de la source"}</div>
      ${hidden && html`<${Btn} small onClick=${() => setF({ status: "TERMINÉ", hg: hidden.hg, ag: hidden.ag, scorers: hidden.scorers, assisters: hidden.assisters.join(", "), assistsKnown: true, played: hidden.played })}><${Ic} n="Download" /> Importer le résultat (démo)<//>`}
      <div className="filters mt-2">
        <${Field} label="Statut" id="r-st"><select id="r-st" className="inp" value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}><option>TERMINÉ</option><option>REPORTÉ</option><option>ANNULÉ</option></select><//>
        <${Field} label=${"Buts " + match.home} id="r-h"><${NumInput} id="r-h" value=${f.hg} min=${0} max=${20} onChange=${(v) => setF({ ...f, hg: v === null ? null : Math.round(v) })} /><//>
        <${Field} label=${"Buts " + match.away} id="r-a"><${NumInput} id="r-a" value=${f.ag} min=${0} max=${20} onChange=${(v) => setF({ ...f, ag: v === null ? null : Math.round(v) })} /><//>
      </div>
      <div className="muted tiny">Règlement sur 90 minutes + temps additionnel, hors prolongations et tirs au but.</div>
      <div className="eyebrow mt-2">Buteurs (CSC exclus du marché Buteur)</div>
      ${f.scorers.map((s, i) => html`<div key=${i} className="row gap-2 items-center mb-1">
        <input className="inp" value=${s.name} onChange=${(e) => setScorer(i, "name", e.target.value)} aria-label="Buteur" style=${{ flex: 1, minWidth: 0 }} />
        <select className="inp" value=${s.side} onChange=${(e) => setScorer(i, "side", +e.target.value)} aria-label="Équipe"><option value=${0}>Dom.</option><option value=${1}>Ext.</option></select>
        <label className="check tiny"><input type="checkbox" checked=${!!s.og} onChange=${(e) => setScorer(i, "og", e.target.checked)} /> CSC</label>
        <button type="button" className="iconbtn" aria-label="Retirer" onClick=${() => setF({ ...f, scorers: f.scorers.filter((_, j) => j !== i) })}><${Ic} n="X" s=${14} /></button></div>`)}
      <${Btn} small onClick=${() => setF({ ...f, scorers: f.scorers.concat([{ name: "", side: 0, og: false }]) })}>+ buteur<//>
      ${scorerMismatch && html`<div className="t-warn small mt-1">Le nombre de buteurs ne correspond pas au score.</div>`}
      ${sourceMismatch && html`<div className="t-warn small mt-1">Score différent de la source openfootball (${match.hg}-${match.ag}) : vérifiez avant de valider.</div>`}
      <${Field} label="Passeurs décisifs officiels (séparés par des virgules)" id="r-as"><input id="r-as" className="inp" value=${f.assisters} onChange=${(e) => setF({ ...f, assisters: e.target.value })} /><//>
      <label className="check small"><input type="checkbox" checked=${f.assistsKnown} onChange=${(e) => setF({ ...f, assistsKnown: e.target.checked })} /> La liste des passes décisives officielles est complète (sinon, les paris Joueur Décisif non gagnants restent « non vérifiables »)</label>
      ${players.length > 0 && html`<div className="eyebrow mt-2">Participation des joueurs suivis</div>
        ${players.map((p) => html`<div key=${p} className="row gap-2 items-center small mb-1"><span style=${{ flex: 1 }}>${p}</span>
          <select className="inp" value=${f.played[p] === true ? "y" : f.played[p] === false ? "n" : "?"} onChange=${(e) => setF({ ...f, played: { ...f.played, [p]: e.target.value === "y" ? true : e.target.value === "n" ? false : undefined } })} aria-label=${"Participation " + p}>
            <option value="?">inconnue</option><option value="y">a joué</option><option value="n">n'a pas joué (remboursé)</option></select></div>`)}`}
      <div className="row gap-2 mt-3"><${Btn} type="submit" kind="primary" disabled=${!goalsOk}><${Ic} n="Check" /> Valider l'audit<//><${Btn} onClick=${onDone}>Fermer<//></div>
      <${Confirm} open=${confirm} title="Valider l'audit ?" text=${`Règlement de ${ctx.state.bets.filter((b) => b.matchId === match.id && b.status === "EN ATTENTE").length} pari(s) ouvert(s) sur ${f.status === "TERMINÉ" ? `${f.hg}-${f.ag}` : f.status}. Les prédictions initiales ne sont pas modifiées.`} onNo=${() => setConfirm(false)} onYes=${() => { setConfirm(false); validate(); }} />
    </form>`;
  }

  /* =========================================================================
     ONGLET 4 — PERFORMANCE & BACKTEST
     ========================================================================= */
  /**
   * Mesure de la cote de clôture : avoir pris une cote meilleure que la cote de clôture est le signe le plus fiable d'un avantage réel,
   * bien avant que les résultats ne parlent. Référence : Pinnacle à la clôture (football-data.co.uk), sinon dernier relevé avant le match.
   */
  function ClvCard({ ctx }) {
    const { state } = ctx;
    const groups = [["Choix du modèle (1 par match)", (state.picks || []).filter((p) => p.clv)], ["Tickets paper", (state.paperTickets || []).filter((t) => t.clv)], ["Mes paris réels", (state.realBets || []).filter((t) => t.clv && FQ.P.isRealBet(t))], ["Mes tests", (state.realBets || []).filter((t) => t.clv && !FQ.P.isRealBet(t))]];
    const sum = (list) => { const v = list.map((x) => x.clv.ev); const n = v.length; if (!n) return null; const mean = v.reduce((a, x) => a + x, 0) / n; const sd = n > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : null;
      return { n, mean, beat: v.filter((x) => x > 0).length, se: sd !== null ? sd / Math.sqrt(n) : null, fin: list.filter((x) => x.clv.final).length }; };
    return html`<${Card} eyebrow="Avantage réel" title="Cote prise vs cote de clôture (CLV)">
      <p className="muted small lead">Pour chaque sélection jouée, on compare la cote prise à la cote de clôture : Pinnacle juste avant le coup d'envoi (publiée par football-data.co.uk quelques jours après), sinon le dernier relevé de votre bookmaker avant le match (provisoire). L'espérance à la clôture = cote prise × probabilité sans marge de la clôture − 1. Positive en moyenne sur beaucoup de paris : le modèle bat le marché. Seul le marché 1N2 a une cote de clôture.</p>
      <div className="stats">${groups.map(([label, list]) => { const r = sum(list); return html`<${Stat} key=${label} label=${label} value=${r ? sgn(100 * r.mean, 1) + " %" : "—"} tone=${r ? (r.mean > 0 ? "pos" : "neg") : null}
        sub=${r ? `${r.beat}/${r.n} au-dessus de la clôture${r.se !== null ? ` · ± ${fr(196 * r.se, 1)} pts (95 %)` : ""}${r.fin < r.n ? ` · ${r.n - r.fin} provisoire(s)` : ""}` : "pas encore de clôture mesurée"} />`; })}</div>
    <//>`;
  }

  /**
   * Apprentissage continu : qualité des probabilités face au marché, stratégies de ticket (rejouées puis réelles, choix courant)
   * et audit de chaque semaine terminée.
   */
  function LearningCard({ ctx }) {
    const { state, today } = ctx;
    const T = FQ.TRAINED || {}, bl = T.blend || {}, dv = bl.devigDetail || null;
    const week = U.weekMonday(today);
    const scs = FQ.P.scenarios(state.settings);
    const log = (state.learnLog || []).slice().reverse();
    const stTone = (x) => (x === "GAGNÉ" ? "pos" : x === "PERDU" ? "neg" : "muted");
    return html`<${Card} eyebrow="Amélioration continue" title="Apprentissage continu">
      <p className="muted small lead">Le système se réentraîne chaque semaine sur les vrais matchs, en trois périodes : apprentissage (il ajuste), validation (elle décide si un réglage est gardé), test final (mesuré seulement, jamais utilisé pour choisir). Chaque semaine terminée est auditée : pronostics, tickets joués et fantômes, tes paris réels et tes tests.</p>
      <div className="eyebrow mt-2">Qualité des probabilités 1N2 · test final · log loss (plus bas = meilleur)</div>
      ${dv ? html`<${TableWrap}><table className="tbl tiny"><thead><tr><th>Méthode</th><th>Log loss</th></tr></thead><tbody>
        <tr><td>Modèle seul</td><td className="mono">${fr(bl.testModelLL, 4)}</td></tr>
        <tr><td>Marché, marge retirée à parts égales</td><td className="mono">${fr(dv.testNorm, 4)}</td></tr>
        <tr><td>Marché, marge retirée surtout sur les outsiders (puissance)</td><td className="mono">${fr(dv.testPower, 4)}</td></tr>
        <tr className="hl"><td><b>Retenu : ${bl.devig === "power" ? "puissance" : "parts égales"}${Object.keys(bl.byComp || {}).length ? ` + modèle mêlé pour ${Object.entries(bl.byComp).map(([c, w]) => `${SHORT[c] || c} (${Math.round(100 * w)} %)`).join(", ")}` : ""}</b></td><td className="mono"><b>${fr((T.summary0 || {}).testLLFinal, 4)}</b></td></tr>
      </tbody></table><//>
      ${(() => { const S0 = T.summary0 || {}, a = S0.diffModelVsMarket, b = S0.diffFinalVsMarket; const ci = (x) => (x && x.ci ? `IC 95 % ${sgn(x.ci[0], 4)} à ${sgn(x.ci[1], 4)}` : "");
        return a ? html`<p className="tiny muted mt-1">Écart avec le marché sur ${S0.testN || "—"} matchs du test final : modèle seul ${sgn(a.mean, 4)} (${ci(a)}) ${a.ci && a.ci[0] > 0 ? "→ le modèle seul est moins précis que le marché, c'est démontré" : "→ différence non démontrée"} ; probabilités retenues ${sgn(b.mean, 4)} (${ci(b)}) ${b.ci && b.ci[0] <= 0 && b.ci[1] >= 0 ? "→ pas de différence démontrée : nous faisons aussi bien que le marché, pas mieux" : ""}. Le modèle n'est mêlé que là où la validation l'a justifié. Entraînement du ${dFR((T.generatedAt || "").slice(0, 10))}.</p>` : html`<p className="tiny muted mt-1">Entraînement du ${dFR((T.generatedAt || "").slice(0, 10))}.</p>`; })()}` : html`<p className="small muted">Disponible après le prochain réentraînement.</p>`}
      ${(() => { const D = (T.summary0 || {}).disagree; if (!D) return null;
        const live = { up: { n: 0, mo: 0, mk: 0, y: 0 }, down: { n: 0, mo: 0, mk: 0, y: 0 } };
        for (const e of state.learnLog || []) for (const k of ["up", "down"]) { const x = e.dis && e.dis[k]; if (x && x.n) { live[k].n += x.n; live[k].mo += x.mo; live[k].mk += x.mk; live[k].y += x.y; } }
        const avg = (x) => (x.n ? { n: x.n, mo: x.mo / x.n, mk: x.mk / x.n, y: x.y / x.n } : null);
        const row = (lab, x) => x && x.n ? html`<tr key=${lab}><td>${lab}</td><td className="mono">${x.n}</td><td className="mono">${pct(x.mo, 1)}</td><td className="mono">${pct(x.mk, 1)}</td><td className="mono"><b>${pct(x.y, 1)}</b></td></tr>` : null;
        return html`<div className="eyebrow mt-3">Quand notre modèle et le marché ne sont pas d'accord (1N2, écart ≥ 8 points) : qui avait raison ?</div>
        <${TableWrap}><table className="tbl tiny"><thead><tr><th>Cas</th><th>Issues</th><th>Modèle disait</th><th>Marché disait</th><th>Arrivé en réalité</th></tr></thead><tbody>
          ${row("Modèle plus optimiste · passé", D.past.up)}${row("Modèle plus optimiste · test final", D.test.up)}${row("Modèle plus optimiste · depuis la mise en service", avg(live.up))}
          ${row("Modèle moins optimiste · passé", D.past.down)}${row("Modèle moins optimiste · test final", D.test.down)}${row("Modèle moins optimiste · depuis la mise en service", avg(live.down))}
        </tbody></table><//>
        <p className="tiny muted mt-1">Si la colonne « réel » colle au marché, c'est le modèle qui se trompait quand ils divergeaient : la prudence des tickets est justifiée. Si un jour elle colle au modèle, la prudence sera réapprise à la baisse au réentraînement hebdomadaire.</p>`; })()}
      <div className="eyebrow mt-3">Stratégies de ticket · taux de réussite</div>
      ${T.tickets && U.isNum(T.tickets.kappa) && html`<p className="tiny muted">Prudence apprise : κ = ${fr(T.tickets.kappa, 1)} (une sélection où modèle et marché divergent de 10 points perd ${fr(10 * T.tickets.kappa, 0)} points de chance pour la construction du ticket). Choisie sur l'apprentissage et la validation, d'après le rendement réalisé des sélections ; le test final n'a pas servi.</p>`}
      ${scs.map((sc) => { const stats = FQ.P.armStats(ctx, sc.id); const ch = (state.armChoice || {})[week + "|" + sc.id]; const F = FQ.P.armFactors(ctx, sc.id);
        const tr = (T.tickets && (T.tickets.scenarios || []).find((x) => x.id === sc.id)) || {};
        return html`<div key=${sc.id} className="mt-2"><div className="small"><b>${sc.label}</b> <span className="muted">· cote ${fr(sc.lo, 0)} à ${fr(sc.hi, 0)}</span></div>
        <${TableWrap}><table className="tbl tiny"><thead><tr><th>Stratégie</th><th>Semaines rejouées</th><th>Attendu</th><th>Sélections moy.</th><th title="test final : semaines jamais utilisées pour choisir">Test final (IC 95 %)</th><th>Semaines réelles</th><th>Taux attendu</th><th title="gagnés ÷ annoncés (rétréci vers 1) : multiplie les chances annoncées par cette stratégie">Correction</th><th></th></tr></thead><tbody>
          ${stats.map((x) => { const a = (tr.arms || {})[x.id] || {}, t2 = a.train || {}, t3 = a.test || {}; const n = (t2.n || 0) + (t3.n || 0), e = (t2.expected || 0) + (t3.expected || 0);
            return html`<tr key=${x.id} className=${ch && ch.arm === x.id ? "hl" : ""}><td>${x.label}</td><td className="mono">${x.btW}/${x.btN}</td><td className="mono">${n ? fr(e, 1) : "—"}</td><td className="mono">${t2.avgLegs ? fr(t2.avgLegs, 1) : "—"}</td><td className="mono">${t3.n ? `${t3.won}/${t3.n}${t3.hitCI ? ` (${pct(t3.hitCI[0], 0)}–${pct(t3.hitCI[1], 0)})` : ""}` : "—"}</td><td className="mono">${x.lvN ? `${x.lvW}/${x.lvN}` : "—"}</td><td className="mono">${pct(x.mean, 1)}</td><td className="mono">×${fr(F[x.id].f, 2)}</td><td>${ch && ch.arm === x.id ? html`<${Pill} tone="accent">jouée cette semaine<//>` : ""}</td></tr>`; })}
        </tbody></table><//>
        ${tr.bandit && tr.bandit.n > 0 && html`<div className="tiny muted">Choix de la stratégie semaine par semaine, rejoué sur le test final sans regarder l'avenir : ${tr.bandit.won}/${tr.bandit.n} tickets gagnés${tr.bandit.hitCI ? ` (IC 95 % ${pct(tr.bandit.hitCI[0], 0)} à ${pct(tr.bandit.hitCI[1], 0)})` : ""}${tr.bandit.roi !== null ? `, rendement ${sgn(100 * tr.bandit.roi, 0)} %` : ""}${tr.bandit.roiCI ? ` (IC ${sgn(100 * tr.bandit.roiCI[0], 0)} à ${sgn(100 * tr.bandit.roiCI[1], 0)} %)` : ""}.</div>`}</div>`; })}
      <p className="tiny muted mt-1">« Attendu » : nombre de tickets gagnants prévu par les probabilités ; un écart durable entre attendu et réel signale des probabilités à corriger. Taux attendu = loi Bêta (semaines rejouées comptées à moitié, semaines réelles en entier). Correction = tickets gagnés ÷ tickets annoncés par la stratégie, rétrécie vers 1 tant que l'historique est court ; ${(T.tickets || {}).choice === "hitrate" ? "la stratégie jouée est celle au meilleur taux attendu (procédure qui a gagné le plus de tickets sur le passé)" : "la stratégie jouée est celle dont le ticket de la semaine a la plus forte chance corrigée (procédure qui a gagné le plus de tickets sur le passé)"}. IC 95 % : fourchette dans laquelle se situe probablement le vrai taux ; avec moins de 10 semaines de test elle est très large, aucune conclusion de rentabilité n'est possible.</p>
      <div className="eyebrow mt-3">Audit des semaines terminées</div>
      ${!log.length ? html`<${Empty} icon="ClipboardCheck">Le premier audit sera écrit quand tous les tickets de la semaine en cours seront réglés (lundi).<//>` :
      html`<${TableWrap}><table className="tbl tiny"><thead><tr><th>Semaine</th>${scs.map((sc) => html`<th key=${sc.id}>${sc.label}</th>`)}<th>Choix du modèle</th><th>Log loss nous / marché</th><th>CLV</th><th>Mes paris réels · tests</th></tr></thead><tbody>
        ${log.map((e) => html`<tr key=${e.week}><td className="mono">${dFR(e.week)}</td>
          ${scs.map((sc) => { const x = e.scen && e.scen[sc.id]; const sh = x && x.shown; return html`<td key=${sc.id}>${sh ? html`<${Pill} tone=${stTone(sh.status)}>${sh.status}<//> <span className="muted">${sh.lost ? `${sh.lost} perdue(s)/${sh.legs}` : `${sh.legs} sél.`}</span>` : "—"}</td>`; })}
          <td className="mono">${e.picks ? `${e.picks.won}/${e.picks.n} (att. ${fr(e.picks.expected, 1)})` : "—"}</td>
          <td className="mono">${e.ll ? `${fr(e.ll.ours, 3)} / ${fr(e.ll.market, 3)}` : "—"}</td>
          <td className="mono">${e.clv ? sgn(100 * e.clv.ev, 1) + " %" : "—"}</td>
          <td className="mono">${e.bets ? `${e.bets.reel.n ? `${e.bets.reel.won}/${e.bets.reel.done} (${sgn(e.bets.reel.profit)} €)` : "—"} · ${e.bets.test.n ? `${e.bets.test.won}/${e.bets.test.done}` : "—"}` : "—"}</td></tr>`)}
      </tbody></table><//>`}
    <//>`;
  }

  function Performance({ ctx }) {
    const { state, acct, settings } = ctx;
    const [hq, setHq] = useState(""); const [hComp, setHComp] = useState("ALL"); const [hMarket, setHMarket] = useState("ALL"); const [hStatus, setHStatus] = useState("ALL");
    const [hSort, setHSort] = useState({ k: "createdAt", d: -1 }); const [page, setPage] = useState(0);
    const [detail, setDetail] = useState(null);
    const metrics = useMemo(() => FQ.predictionMetrics(state), [state.predictions, state.results]);
    const resolved = state.bets.filter((b) => b.status === "GAGNÉ" || b.status === "PERDU");
    const weak = useMemo(() => FQ.weaknesses(state, acct, metrics, settings), [state, acct, metrics]);
    const allMetricsBrier = metrics["1N2"].length ? metrics["1N2"].reduce((a, x) => a + x.brier, 0) / metrics["1N2"].length : null;

    const curve = acct.curve.map((p, i) => ({ i, bankroll: p.bankroll, pl: +(p.bankroll - acct.initial).toFixed(2), dd: 0 }));
    let peak = acct.initial; curve.forEach((p) => { peak = Math.max(peak, p.bankroll); p.dd = +(-100 * (peak - p.bankroll) / peak).toFixed(2); });
    const byKey = (f) => { const g = {}; resolved.forEach((b) => { const k = f(b); g[k] = g[k] || { k, st: 0, pl: 0, n: 0 }; g[k].st += b.stake; g[k].pl += b.profit; g[k].n++; }); return Object.values(g).map((x) => ({ ...x, roi: +(100 * x.pl / x.st).toFixed(1) })); };
    const roiComp = byKey((b) => SHORT[b.comp] || b.comp);
    const perfMarket = byKey((b) => b.market).map((x) => { const m = metrics[x.k] || []; return { ...x, brier: m.length ? +(m.reduce((a, y) => a + y.brier, 0) / m.length).toFixed(3) : null }; });
    const oddsHist = [[1, 1.5], [1.5, 2], [2, 2.5], [2.5, 3], [3, 4], [4, 6], [6, 1000]].map(([a, b]) => ({ k: b > 100 ? `≥ ${a}` : `${fr(a, 1)}–${fr(b, 1)}`, n: state.bets.filter((x) => x.odds >= a && x.odds < b).length }));
    const calBins = FQ.calibrationBins([...metrics.BTTS.map((x) => [x.p, x.o]), ...metrics["1N2"].flatMap((x) => x.p3.map((p, i) => [p, x.k === i ? 1 : 0])), ...metrics.Buteur.map((x) => [x.p, x.o]), ...metrics["Joueur Décisif"].map((x) => [x.p, x.o])], 10);
    const versions = [
      ...state.calibration.history.filter((h) => h.results["1N2"].ok).map((h, i) => ({ k: `calib. essai ${i + 1}`, avant: +h.results["1N2"].testBefore.toFixed(4), après: +h.results["1N2"].testAfter.toFixed(4) })),
      ...state.backtests.slice(-6).map((b) => ({ k: `${SHORT[b.comp] || b.comp} ${b.season} v${b.engineVersion}`, avant: b.logLossBase !== null ? +b.logLossBase.toFixed(4) : null, après: b.logLoss !== null ? +b.logLoss.toFixed(4) : null })),
    ];

    let hist = state.bets.filter((b) => (hComp === "ALL" || b.comp === hComp) && (hMarket === "ALL" || b.market === hMarket) && (hStatus === "ALL" || b.status === hStatus) && (!hq || FQ.normName(b.match + " " + b.selection).includes(FQ.normName(hq))));
    hist = hist.slice().sort((a, b) => { const x = a[hSort.k], y = b[hSort.k]; return (x < y ? -1 : x > y ? 1 : 0) * hSort.d; });
    const PAGE = 20; const pages = Math.max(1, Math.ceil(hist.length / PAGE));
    const th = (k, l) => html`<th className="sortable" onClick=${() => setHSort({ k, d: hSort.k === k ? -hSort.d : -1 })}>${l}${hSort.k === k ? (hSort.d > 0 ? " ↑" : " ↓") : ""}</th>`;
    function exportHist() {
      const cols = ["id", "createdAt", "comp", "date", "match", "market", "selection", "p", "odds", "ev", "stake", "status", "profit", "engineVersion", "calibrationVersion", "oddsSource"].map((k) => ({ label: k, key: k }));
      offerExport(ctx, `historique_${ctx.mode}_${ctx.today}.csv`, FQ.toCSV(hist, cols));
    }

    return html`<div className="stack">
      <${LearningCard} ctx=${ctx} />
      <${ClvCard} ctx=${ctx} />
      <div className="stats">
        <${Stat} label="Capital (unités)" value=${eur(acct.bankroll, settings.currency)} sub=${`capital ${eur(acct.initial, settings.currency)} · cash ${eur(acct.cash, settings.currency)}`} />
        <${Stat} label="Profit net" value=${(acct.realized >= 0 ? "+" : "") + eur(acct.realized, settings.currency)} tone=${acct.realized >= 0 ? "pos" : "neg"} />
        <${Stat} label="ROI global" value=${pct(acct.roi)} sub="profit / mises réglées (annulés exclus)" tone=${acct.roi > 0 ? "pos" : acct.roi < 0 ? "neg" : null} />
        <${Stat} label="Hit rate" value=${pct(acct.hitRate)} sub="gagnés / (gagnés + perdus)" />
        <${Stat} label="Brier 1N2" value=${allMetricsBrier === null ? "—" : fr(allMetricsBrier, 4)} sub=${`n = ${metrics["1N2"].length} · uniforme = 0,667`} />
        <${Stat} label="Drawdown max." value=${pct(acct.maxDrawdown)} tone=${acct.maxDrawdown > 0.15 ? "neg" : null} />
        <${Stat} label="Paris résolus" value=${resolved.length} sub=${`${acct.voided} annulé(s) · ${acct.unverifiable} non vérifiable(s) · ${acct.pending} en attente`} />
        <${Stat} label="Exposition actuelle" value=${eur(acct.openStakes, settings.currency)} sub=${pct(acct.bankroll ? acct.openStakes / acct.bankroll : 0) + " de la bankroll"} />
      </div>
      ${resolved.length < 30 && html`<div className="note small">Moins de 30 paris résolus : ROI et hit rate sont très bruités à ce stade.</div>`}
      <div className="grid-2">
        <${Chart} title="1 · Courbe du capital (unités)" empty=${curve.length > 1 ? null : "Aucun pari réglé"}>
          ${RC && html`<${RC.AreaChart} data=${curve} margin=${{ top: 8, right: 12, bottom: 4, left: 0 }}><defs><linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor=${C.accent} stopOpacity=${0.35} /><stop offset="100%" stopColor=${C.accent} stopOpacity=${0} /></linearGradient></defs>
            <${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="i" /><${RC.YAxis} ...${axisProps} domain=${["auto", "auto"]} width=${56} /><${RC.Tooltip} ...${tipStyle} formatter=${(v) => [eur(v, settings.currency), "Capital"]} labelFormatter=${(l) => "Règlement n° " + l} />
            <${RC.ReferenceLine} y=${acct.initial} stroke=${C.muted} strokeDasharray="4 4" /><${RC.Area} type="monotone" dataKey="bankroll" stroke=${C.accent} strokeWidth=${2} fill="url(#gB)" isAnimationActive=${false} /><//>`}
        <//>
        <${Chart} title="2 · Profit / perte cumulé" empty=${curve.length > 1 ? null : "Aucun pari réglé"}>
          ${RC && html`<${RC.LineChart} data=${curve} margin=${{ top: 8, right: 12, bottom: 4, left: 0 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="i" /><${RC.YAxis} ...${axisProps} width=${56} /><${RC.Tooltip} ...${tipStyle} formatter=${(v) => [eur(v, settings.currency), "P/L cumulé"]} /><${RC.ReferenceLine} y=${0} stroke=${C.muted} /><${RC.Line} dataKey="pl" stroke=${C.s1} strokeWidth=${2} dot=${false} isAnimationActive=${false} /><//>`}
        <//>
        <${Chart} title="3 · ROI par compétition (%)" empty=${roiComp.length ? null : "Aucun pari réglé"}>
          ${RC && html`<${RC.BarChart} data=${roiComp} margin=${{ top: 8, right: 8, bottom: 4, left: -12 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="k" /><${RC.YAxis} ...${axisProps} /><${RC.Tooltip} ...${tipStyle} formatter=${(v, n, p) => [v + " % (n = " + p.payload.n + ")", "ROI"]} /><${RC.ReferenceLine} y=${0} stroke=${C.muted} />
            <${RC.Bar} dataKey="roi" radius=${[4, 4, 0, 0]} isAnimationActive=${false}>${roiComp.map((x, i) => html`<${RC.Cell} key=${i} fill=${x.roi >= 0 ? C.pos : C.neg} />`)}<//><//>`}
        <//>
        <${Chart} title="4 · Performance par marché (ROI %)" empty=${perfMarket.length ? null : "Aucun pari réglé"} note=${perfMarket.map((x) => `${x.k} : Brier ${x.brier ?? "—"}, n = ${x.n}`).join(" · ")}>
          ${RC && html`<${RC.BarChart} data=${perfMarket} margin=${{ top: 8, right: 8, bottom: 4, left: -12 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="k" /><${RC.YAxis} ...${axisProps} /><${RC.Tooltip} ...${tipStyle} formatter=${(v, n, p) => [v + " % (n = " + p.payload.n + ")", "ROI"]} /><${RC.ReferenceLine} y=${0} stroke=${C.muted} />
            <${RC.Bar} dataKey="roi" radius=${[4, 4, 0, 0]} isAnimationActive=${false}>${perfMarket.map((x, i) => html`<${RC.Cell} key=${i} fill=${x.roi >= 0 ? C.pos : C.neg} />`)}<//><//>`}
        <//>
        <${Chart} title="5 · Distribution des cotes jouées" empty=${state.bets.length ? null : "Aucun pari"}>
          ${RC && html`<${RC.BarChart} data=${oddsHist} margin=${{ top: 8, right: 8, bottom: 4, left: -16 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="k" /><${RC.YAxis} ...${axisProps} allowDecimals=${false} /><${RC.Tooltip} ...${tipStyle} formatter=${(v) => [v, "paris"]} /><${RC.Bar} dataKey="n" fill=${C.s1} radius=${[4, 4, 0, 0]} isAnimationActive=${false} /><//>`}
        <//>
        <${CalibrationChart} bins=${calBins} title="6 · Calibration probabiliste" />
        <${Chart} title="7 · Drawdown (%)" empty=${curve.length > 1 ? null : "Aucun pari réglé"}>
          ${RC && html`<${RC.AreaChart} data=${curve} margin=${{ top: 8, right: 12, bottom: 4, left: -12 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="i" /><${RC.YAxis} ...${axisProps} /><${RC.Tooltip} ...${tipStyle} formatter=${(v) => [v + " %", "Drawdown"]} /><${RC.Area} type="stepAfter" dataKey="dd" stroke=${C.neg} fill=${C.neg} fillOpacity=${0.2} strokeWidth=${2} isAnimationActive=${false} /><//>`}
        <//>
        <${Chart} title="8 · Comparatif des versions du modèle (log loss 1N2 hors échantillon)" empty=${versions.length ? null : "Lancez un backtest ou un apprentissage"} note="« avant » = référence (calibration précédente ou fréquences naïves), « après » = version testée. Plus bas = meilleur.">
          ${RC && html`<${RC.BarChart} data=${versions} margin=${{ top: 8, right: 8, bottom: 4, left: -8 }}><${RC.CartesianGrid} stroke=${C.line} strokeDasharray="2 4" vertical=${false} /><${RC.XAxis} ...${axisProps} dataKey="k" tick=${{ fill: C.muted, fontSize: 10 }} /><${RC.YAxis} ...${axisProps} domain=${["auto", "auto"]} /><${RC.Tooltip} ...${tipStyle} /><${RC.Legend} wrapperStyle=${{ fontSize: 12 }} />
            <${RC.Bar} dataKey="avant" name="référence" fill=${C.muted} radius=${[4, 4, 0, 0]} isAnimationActive=${false} /><${RC.Bar} dataKey="après" name="version testée" fill=${C.s1} radius=${[4, 4, 0, 0]} isAnimationActive=${false} /><//>`}
        <//>
      </div>
      <${Card} eyebrow="Analyse des faiblesses" title="Ce que les données disent (et ne disent pas)">
        <ul className="weak">${weak.map((w, i) => html`<li key=${i} className=${"w-" + w.level}><${Ic} n=${w.level === "warn" ? "TriangleAlert" : w.level === "ok" ? "CircleCheck" : "Info"} /> ${w.text}</li>`)}</ul>
      <//>
      <${Card} eyebrow="Historique complet" title=${`Registre des paris (${hist.length})`} right=${html`<${Btn} small onClick=${exportHist}><${Ic} n="FileDown" /> Export CSV<//>`}>
        <div className="filters">
          <${Field} label="Recherche" id="h-q"><input id="h-q" className="inp" value=${hq} onChange=${(e) => { setHq(e.target.value); setPage(0); }} /><//>
          <${Field} label="Compétition" id="h-c"><select id="h-c" className="inp" value=${hComp} onChange=${(e) => { setHComp(e.target.value); setPage(0); }}><option value="ALL">Toutes</option>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//>
          <${Field} label="Marché" id="h-m"><select id="h-m" className="inp" value=${hMarket} onChange=${(e) => { setHMarket(e.target.value); setPage(0); }}><option value="ALL">Tous</option>${MARKETS.map((m) => html`<option key=${m}>${m}</option>`)}</select><//>
          <${Field} label="Statut" id="h-s"><select id="h-s" className="inp" value=${hStatus} onChange=${(e) => { setHStatus(e.target.value); setPage(0); }}><option value="ALL">Tous</option>${Object.keys(STATUS_TONE).map((s) => html`<option key=${s}>${s}</option>`)}</select><//>
        </div>
        ${!hist.length ? html`<${Empty}>Aucun pari.<//>` : html`<${TableWrap}><table className="tbl small">
          <thead><tr>${th("id", "ID")}${th("createdAt", "Date")}${th("comp", "Comp.")}<th>Match</th>${th("market", "Marché")}<th>Sélection</th>${th("p", "Prob.")}${th("odds", "Cote")}${th("ev", "EV")}${th("stake", "Mise")}${th("status", "Statut")}${th("profit", "P/L")}<th>Version</th></tr></thead>
          <tbody>${hist.slice(page * PAGE, page * PAGE + PAGE).map((b) => html`<tr key=${b.id} className="clickable" onClick=${() => setDetail(detail === b.id ? null : b.id)}>
            <td className="mono tiny">${b.id.slice(-8)}</td><td className="mono">${dFR(b.date)}</td><td><${CompTag} code=${b.comp} /></td><td>${b.match}</td><td>${b.market}</td><td>${b.selection}</td>
            <td className="mono">${pct(b.p)}</td><td className="mono">${fr(b.odds, 2)}</td><td className="mono">${sgn((b.ev || 0) * 100, 1)} %</td><td className="mono">${eur(b.stake)}</td>
            <td><${Pill} tone=${STATUS_TONE[b.status]}>${b.status}<//></td><td className=${"mono " + (b.profit > 0 ? "t-pos" : b.profit < 0 ? "t-neg" : "")}>${sgn(b.profit)}</td><td className="tiny">${b.engineVersion}</td></tr>`)}</tbody></table><//>
          <div className="row gap-2 items-center mt-2 justify-end"><${Btn} small disabled=${page === 0} onClick=${() => setPage(page - 1)}><${Ic} n="ChevronLeft" /><//><span className="small mono">${page + 1} / ${pages}</span><${Btn} small disabled=${page >= pages - 1} onClick=${() => setPage(page + 1)}><${Ic} n="ChevronRight" /><//></div>`}
        ${detail && (() => { const b = state.bets.find((x) => x.id === detail); const pr = state.predictions.find((p) => p.id === b.predictionId);
          return html`<div className="note small mt-2"><b>Paramètres du pari ${b.id}</b><pre className="pre">${JSON.stringify({ pari: { decision: b.decision, raisons: b.reasons, calculMise: b.stakeSteps, sourceCote: b.oddsSource, reglement: b.settleNote, agent: b.agent }, snapshot: pr ? { creeLe: pr.createdAt, lambda: [pr.lambdaHome, pr.lambdaAway], rho: pr.rho, marches: pr.markets, fiabilite: pr.reliability, drivers: pr.drivers, modele: pr.modelSummary && { mu: pr.modelSummary.mu, gamma: pr.modelSummary.gamma, matchs: pr.modelSummary.nMatches }, source: pr.dataSource, version: pr.engineVersion, calibration: pr.calibrationVersion } : null }, null, 2)}</pre></div>`; })()}
      <//>
      <${TrainingCard} ctx=${ctx} />
      <${Backtest} ctx=${ctx} />
    </div>`;
  }

  /* ----------------------------------------------- entraînement historique */
  function TrainingCard({ ctx }) {
    const TK = FQ.TRAINED && FQ.TRAINED.tickets;
    const T = FQ.TRAINED;
    if (!T) return html`<${Card} eyebrow="Entraînement" title="Entraînement sur l'historique"><${Empty}>Aucun entraînement chargé.<//><//>`;
    const S = T.summary, P = T.policy, B = T.blend, C = T.calibration;
    const L = Object.entries(T.leagues);
    const q = Object.entries(T.qprior || {}).map(([k, v]) => Object.assign({ k }, v, FQ.agentView(T.qprior, k, ctx.settings.agentMinN))).sort((a, b) => b.n - a.n);
    const r4 = (x) => (Number.isFinite(x) ? fr(x, 4) : "—");
    return html`<${Card} eyebrow="Entraînement · validation chronologique" title="Apprentissage, validation, test final">
      <div className="small mb-2">${T.protocol.valFrom ? html`Apprentissage du ${dFR(T.protocol.trainFrom)} au ${dFR(U.addDays(T.protocol.valFrom, -1))} (${S.learnPredictions} matchs) ; validation du ${dFR(T.protocol.valFrom)} au ${dFR(U.addDays(T.protocol.trainTo, -1))} (${S.valPredictions} matchs), qui décide si un réglage est gardé ; ` : html`Apprentissage du ${dFR(T.protocol.trainFrom)} au ${dFR(U.addDays(T.protocol.trainTo, -1))} (${S.trainPredictions} matchs) ; `}test final du ${dFR(T.protocol.testFrom)} au ${dFR(T.protocol.testTo === "9999-12-31" ? ctx.today : T.protocol.testTo)} (${S.testPredictions} matchs jamais utilisés pour choisir quoi que ce soit). Pour chaque match, le modèle n'est ajusté que sur les rencontres antérieures. Entraînement du ${dtFR(T.generatedAt)}, ${S.seconds} s de calcul.</div>
      <div className="stats">
        <${Stat} label="Log loss 1N2 (test)" value=${r4(S.testModelOnly.ll1N2)} sub=${`modèle seul ; marché ${r4(B.testMarketLL)} ; retenu ${r4(S.test.ll1N2)}`} />
        <${Stat} label="Précision 1N2 (test)" value=${pct(S.test.acc)} sub="issue la plus probable = issue réelle" />
        <${Stat} label="Choix préférentiel (test)" value=${pct(T.picks.test.hitRate)} sub=${`${T.picks.test.n} matchs ; apprentissage ${pct(T.picks.train.hitRate)}`} />
        <${Stat} label="Poids du modèle face au marché" value=${pct(B.w, 0)} sub=${`appris sur l'apprentissage ; ${B.accepted ? "confirmé" : "non confirmé"} sur la validation`} />
        <${Stat} label="Calibration" value=${`T = ${fr(C.T1N2, 2)}`} sub=${`1N2 ${C.detail1N2.accepted ? "retenue" : "rejetée"} ; BTTS ${C.bttsAB ? `Platt a ${fr(C.bttsAB.a, 2)} b ${fr(C.bttsAB.b, 2)} (taux réel ${pct(C.detailBTTSPlatt.rateTrain)} vs prédit ${pct(C.detailBTTSPlatt.meanPredTrain)})` : C.detailBTTS.accepted ? "retenue (T " + fr(C.TBTTS, 2) + ")" : "rejetée"}`} />
        <${Stat} label="Paris automatiques" value=${P.autoBetting ? "autorisés" : "suspendus"} sub=${P.autoBetting ? "stratégie rentable sur l'apprentissage et confirmée" : "aucune stratégie rentable sur l'apprentissage"} tone=${P.autoBetting ? "pos" : "warn"} />
      </div>
      <div className="note small mt-2"><b>Ce que l'historique montre.</b> Le modèle (Poisson-Dixon-Coles réglé par compétition) bat nettement la référence naïve dans toutes les compétitions, mais il reste moins précis que les cotes du marché (log loss ${r4(B.testModelLL)} contre ${r4(B.testMarketLL)} sur le test). Le mélange optimal appris donne donc ${pct(1 - B.w, 0)} du poids au marché quand une cote existe. Conséquence directe : les « value bets » signalées par le modèle seul ont perdu de l'argent sur 12 mois, l'agent a appris à les refuser, et aucune mise automatique n'est engagée tant qu'une stratégie ne devient pas rentable sur l'apprentissage puis confirmée sur le test. Les choix préférentiels restent publiés pour chaque match.</div>
      <div className="grid-2 mt-2">
        <div><div className="eyebrow">Par compétition (test)</div>
          <${TableWrap}><table className="tbl small"><thead><tr><th>Comp.</th><th>Appr.</th><th>Test</th><th>Réglage</th><th>LL modèle</th><th>LL naïve</th><th>LL marché</th><th>Précision</th></tr></thead>
            <tbody>${L.map(([k, v]) => html`<tr key=${k}><td><${CompTag} code=${k} /></td><td className="mono">${v.train.n}</td><td className="mono">${v.test.n}</td>
              <td className="tiny">${v.accepted && v.params ? `demi-vie ${v.params.halfLifeDays} j, prior ${v.params.priorMatches}` : "par défaut"}</td>
              <td className="mono">${r4(v.test.ll1N2)}</td><td className="mono">${r4(v.test.base)}</td><td className="mono">${v.test.market ? r4(v.test.market.ll) : "—"}</td><td className="mono">${pct(v.test.acc)}</td></tr>`)}</tbody></table><//>
          <div className="muted tiny mt-1">Log loss : plus bas = meilleur. Naïve = fréquences de victoires/nuls/défaites observées avant chaque match. Marché = cotes sans marge (football-data.co.uk).</div></div>
        <${CalibrationChart} bins=${T.calibBins.test1N2} title="Calibration 1N2 sur le test (probabilités retenues)" />
      </div>
      <div className="grid-2 mt-2">
        <div><div className="eyebrow">Value betting avec le modèle seul (unités, Kelly ${pct(ctx.settings.kellyFraction, 0)})</div>
          <${TableWrap}><table className="tbl small"><thead><tr><th>EV min.</th><th>Cote max.</th><th>Paris appr.</th><th>ROI appr.</th><th>Paris test</th><th>ROI test</th><th>CLV test</th></tr></thead>
            <tbody>${(P.modelOnly || []).map((c, i) => html`<tr key=${i}><td className="mono">${pct(c.evMin, 0)}</td><td className="mono">${c.maxOdds > 100 ? "—" : fr(c.maxOdds, 1)}</td>
              <td className="mono">${c.train.bets}</td><td className=${"mono " + (c.train.roi > 0 ? "t-pos" : "t-neg")}>${c.train.roi === null ? "—" : sgn(100 * c.train.roi, 1) + " %"}</td><td className="mono">${c.test.bets}</td><td className=${"mono " + (c.test.roi > 0 ? "t-pos" : "t-neg")}>${c.test.roi === null ? "—" : sgn(100 * c.test.roi, 1) + " %"}</td><td className="mono">${c.test.clv === null ? "—" : sgn(100 * c.test.clv, 2) + " %"}</td></tr>`)}</tbody></table><//>
          <div className="muted tiny mt-1">Ce que rapporterait un pari sur chaque écart entre le modèle seul et la cote (football-data.co.uk ; clôture pour Brésil, Japon, Suisse). Avec les probabilités retenues (marché inclus à ${pct(1 - B.w, 0)}), ${P.candidates.every((c) => !c.train.bets) ? "aucune sélection n'atteint le seuil : aucun avantage détecté face au marché." : `la meilleure stratégie de l'apprentissage (EV ≥ ${pct(P.chosenEvMin, 0)}) donne ${P.testOfChosen.roi === null ? "—" : sgn(100 * P.testOfChosen.roi, 1) + " %"} sur le test.`}</div></div>
        <div><div className="eyebrow">Agent : ce qu'il a appris (${S.qStates} états, ${S.qObservations} opportunités historiques)</div>
          <${TableWrap}><table className="tbl small"><thead><tr><th>État (marché | EV modèle | fiabilité | cote)</th><th>n</th><th>Gain moyen / u</th><th>Décision</th></tr></thead>
            <tbody>${q.slice(0, 10).map((x) => html`<tr key=${x.k}><td className="mono tiny">${x.k}</td><td className="mono">${x.n}</td><td className=${"mono " + (x.mean > 0 ? "t-pos" : "t-neg")}>${sgn(x.mean, 3)}</td><td>${x.active ? (x.veto ? html`<${Pill} tone="neg">refuse<//>` : html`<${Pill} tone="muted">pas de veto<//>`) : html`<${Pill}>${"n < " + ctx.settings.agentMinN}<//>`}</td></tr>`)}</tbody></table><//>
          <div className="muted tiny mt-1">« Pas de veto » : pertes non démontrées statistiquement (forte variance des grosses cotes), pas un feu vert. Opportunités que le modèle seul jugeait favorables, récompense réelle observée au résultat (cote − 1 si gagné, −1 si perdu). L'agent refuse un état quand la borne haute de son gain moyen est négative.</div></div>
      </div>
      ${TK && TK.scenarios && html`<div className="mt-3"><div className="eyebrow">Tickets de la semaine rejoués sur l'historique (1 u par ticket, cotes réelles d'avant-match)</div>
        <${TableWrap}><table className="tbl small"><thead><tr><th>Niveau</th><th>Stratégie de départ</th><th>Tickets appr.</th><th>Gagnés</th><th>Cote moy.</th><th>Sélections moy.</th><th>ROI appr.</th><th>Tickets test</th><th>Gagnés (IC 95 %)</th><th>ROI test (IC 95 %)</th></tr></thead>
          <tbody>${TK.scenarios.filter((x) => x.arms && x.arms[x.start]).map((x) => { const a = x.arms[x.start].train, b = x.arms[x.start].test; return html`<tr key=${x.id}><td>${x.label}</td><td>${(FQ.P.TICKET_ARMS.find((y) => y.id === x.start) || {}).label || x.start}</td>
            <td className="mono">${a.n}</td><td className="mono">${a.won}</td><td className="mono">${fr(a.avgOdds, 1)}</td><td className="mono">${fr(a.avgLegs, 1)}</td><td className=${"mono " + (a.roi > 0 ? "t-pos" : "t-neg")}>${a.roi === null ? "—" : sgn(100 * a.roi, 0) + " %"}</td>
            <td className="mono">${b.n}</td><td className="mono">${b.won}${b.hitCI ? ` (${pct(b.hitCI[0], 0)}–${pct(b.hitCI[1], 0)})` : ""}</td><td className=${"mono " + (b.roi > 0 ? "t-pos" : "t-neg")}>${b.roi === null ? "—" : sgn(100 * b.roi, 0) + " %"}${b.roiCI ? ` (${sgn(100 * b.roiCI[0], 0)} à ${sgn(100 * b.roiCI[1], 0)})` : ""}</td></tr>`; })}</tbody></table><//>
        <div className="muted tiny mt-1">${TK.note} Échantillons très petits (une quarantaine de semaines) : un ticket gagné de plus ou de moins change le rendement de dizaines de points. Toutes les stratégies et leur suivi réel : carte « Apprentissage continu » ci-dessus.</div></div>`}
    <//>`;
  }

  /* ----------------------------------------------- backtest */
  function Backtest({ ctx }) {
    const [comp, setComp] = useState(ctx.mode === "demo" ? "PL" : "PL");
    const seasons = useMemo(() => [...new Set(ctx.matches.filter((m) => m.comp === comp && m.hg !== null).map((m) => m.season))], [comp, ctx.matches]);
    const [season, setSeason] = useState("");
    const [running, setRunning] = useState(false);
    const [res, setRes] = useState(null);
    const [csv, setCsv] = useState(null);
    const [csvRes, setCsvRes] = useState(null);
    useEffect(() => {
      const cnt = (x) => ctx.matches.filter((m) => m.comp === comp && m.season === x && m.hg !== null).length;
      setSeason(seasons.slice().sort((a, b) => cnt(b) - cnt(a))[0] || "");
    }, [comp, seasons.length]);

    function run() {
      setRunning(true); setRes(null);
      setTimeout(() => {
        const t0 = performance.now();
        const oddsMap = {};
        ctx.matches.forEach((m) => { if (m.comp === comp && m.season === season && m.odds && m.odds.h) oddsMap[m.id] = { h: m.odds.h, d: m.odds.d, a: m.odds.a, ch: m.close && m.close.h, cd: m.close && m.close.d, ca: m.close && m.close.a }; });
        const r = FQ.walkForward(ctx.matches, comp, season, { odds: Object.keys(oddsMap).length ? oddsMap : null, settings: ctx.effSettings });
        r.ms = Math.round(performance.now() - t0);
        setRes(r); setRunning(false);
        ctx.update((s) => { s.backtests.push({ id: U.uid("bt"), kind: ctx.mode === "demo" ? "démo" : "openfootball", at: new Date().toISOString(), comp, season, n: r.n, brier: r.brier, brierBase: r.brierBase, logLoss: r.logLoss, logLossBase: r.logLossBase, brierBTTS: r.brierBTTS, brierBTTSBase: r.brierBTTSBase, accuracy: r.accuracy, ci: r.brierDiffCI || null, engineVersion: FQ.ENGINE_VERSION }); return s; });
      }, 30);
    }
    function onFile(e) {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => { try { const imp = FQ.importFootballDataCSV(String(rd.result), "CSV", file.name.replace(/\.csv$/i, "")); setCsv({ name: file.name, ...imp }); setCsvRes(null); } catch (err) { ctx.notify("Fichier illisible : " + err.message, "neg"); } };
      rd.readAsText(file);
    }
    function runCsv() {
      setRunning(true);
      setTimeout(() => {
        const r = FQ.walkForward(csv.matches, "CSV", csv.matches[0].season, { odds: csv.odds, settings: ctx.settings });
        setCsvRes(r); setRunning(false);
        ctx.update((s) => { s.backtests.push({ id: U.uid("bt"), kind: "csv", at: new Date().toISOString(), comp: "CSV", season: csv.name, n: r.n, brier: r.brier, brierBase: r.brierBase, logLoss: r.logLoss, logLossBase: r.logLossBase, brierBTTS: r.brierBTTS, brierBTTSBase: r.brierBTTSBase, betting: r.betting && { bets: r.betting.bets, roi: r.betting.roi, profit: r.betting.profit, clv: r.betting.clv }, engineVersion: FQ.ENGINE_VERSION }); return s; });
      }, 30);
    }
    const R = (r) => html`<div className="stats">
      <${Stat} label="Prédictions" value=${r.n} sub=${`${r.dates} dates · ${r.skipped} ignorées (< 3 matchs par équipe)`} />
      <${Stat} label="Brier 1N2" value=${fr(r.brier, 4)} sub=${`réf. fréquences ${fr(r.brierBase, 4)} · uniforme ${fr(r.brierUniform, 4)}`} tone=${r.brier < r.brierBase ? "pos" : "neg"} />
      <${Stat} label="Log loss 1N2" value=${fr(r.logLoss, 4)} sub=${`réf. ${fr(r.logLossBase, 4)}`} tone=${r.logLoss < r.logLossBase ? "pos" : "neg"} />
      <${Stat} label="Brier BTTS" value=${fr(r.brierBTTS, 4)} sub=${`réf. fréquence ${fr(r.brierBTTSBase, 4)}`} tone=${r.brierBTTS < r.brierBTTSBase ? "pos" : "neg"} />
      <${Stat} label="Précision (argmax)" value=${pct(r.accuracy)} />
      <${Stat} label="Écart Brier modèle − réf." value=${fr(r.brier - r.brierBase, 4)} sub=${r.brierDiffCI ? `IC 95 % bootstrap [${fr(r.brierDiffCI[0], 4)} ; ${fr(r.brierDiffCI[1], 4)}]` : "IC non calculé (n < 30)"} />
    </div>`;
    return html`<${Card} eyebrow="Backtest & validation scientifique" title="Walk-forward chronologique">
      <div className="muted small mb-2">Pour chaque date, le modèle est ré-ajusté uniquement sur les matchs antérieurs, prédit les rencontres du jour, puis est comparé au résultat. Comparateurs : fréquences historiques (stratégie naïve) et prévision uniforme. ${ctx.mode === "real" ? "Les cotes historiques football-data.co.uk sont associées aux matchs : le ROI, la CLV et le drawdown du value betting du modèle seul sont calculés directement." : "Données fictives de démonstration."}</div>
      <div className="filters">
        <${Field} label="Compétition" id="bt-c"><select id="bt-c" className="inp" value=${comp} onChange=${(e) => setComp(e.target.value)}>${COMP_ORDER.map((c) => html`<option key=${c} value=${c}>${COMP[c].name}</option>`)}</select><//>
        <${Field} label="Saison testée" id="bt-s"><select id="bt-s" className="inp" value=${season} onChange=${(e) => setSeason(e.target.value)}>${seasons.map((s) => html`<option key=${s}>${s}</option>`)}</select><//>
        <div className="field"><span className="field-l"> </span><${Btn} kind="primary" disabled=${running || !season} onClick=${run}><${Ic} n="FlaskConical" /> ${running ? "Calcul…" : "Lancer le backtest"}<//></div>
      </div>
      ${res && html`<div className="mt-2">${R(res)}<div className="muted tiny">Durée de calcul ${res.ms} ms · moteur ${FQ.ENGINE_VERSION}</div>
        ${res.betting && html`<div className="stats mt-2">
          <${Stat} label="Value bets du modèle seul" value=${res.betting.bets} sub=${`EV ≥ ${pct(ctx.effSettings.evMin)}${ctx.effSettings.maxOdds ? ", cote ≤ " + ctx.effSettings.maxOdds : ""}, cotes football-data.co.uk`} />
          <${Stat} label="ROI simulé" value=${pct(res.betting.roi)} tone=${res.betting.roi > 0 ? "pos" : "neg"} sub=${`profit ${eur(res.betting.profit)}`} />
          <${Stat} label="Drawdown max." value=${pct(res.betting.maxDrawdown)} />
          <${Stat} label="CLV moyenne" value=${res.betting.clv === null ? "—" : sgn(res.betting.clv * 100, 2) + " %"} sub=${res.betting.clvN ? `n = ${res.betting.clvN}` : "pas de clôture"} />
        </div>`}
        <div className="grid-2 mt-2"><${CalibrationChart} bins=${res.calibHome} title="Calibration : victoire domicile" /><${CalibrationChart} bins=${res.calibBTTS} title="Calibration : BTTS Oui" color=${C.s2} /></div></div>`}
      <div className="eyebrow mt-3">Backtest avec cotes historiques (ROI, CLV)</div>
      <div className="muted small">Importez un fichier CSV au format football-data.co.uk (colonnes Date, HomeTeam, AwayTeam, FTHG, FTAG, cotes B365H/D/A ou AvgH/D/A, clôture B365CH/PSCH…). Le fichier reste dans votre navigateur. Les cotes de clôture servent à la CLV uniquement si elles sont présentes.</div>
      <input type="file" accept=".csv,text/csv" className="mt-1 small" onChange=${onFile} aria-label="Fichier CSV de cotes" />
      ${csv && html`<div className="small mt-1">${csv.name} : ${csv.matches.length} matchs, ${csv.nOdds} avec cotes 1N2${csv.errors.length ? `, ${csv.errors.length} ligne(s) ignorée(s)` : ""}. <${Btn} small kind="primary" disabled=${running || csv.matches.length < 50} onClick=${runCsv}>Lancer<//>${csv.matches.length < 50 ? html` <span className="t-warn">au moins 50 matchs requis</span>` : ""}</div>`}
      ${csvRes && html`<div className="mt-2">${R(csvRes)}${csvRes.betting && html`<div className="stats mt-2">
        <${Stat} label="Paris simulés" value=${csvRes.betting.bets} sub=${`seuil EV ${pct(ctx.settings.evMin)} · fiabilité ≥ ${ctx.settings.relMin}`} />
        <${Stat} label="ROI simulé" value=${pct(csvRes.betting.roi)} tone=${csvRes.betting.roi > 0 ? "pos" : "neg"} sub=${`profit ${eur(csvRes.betting.profit)}`} />
        <${Stat} label="Hit rate" value=${pct(csvRes.betting.hitRate)} />
        <${Stat} label="Drawdown max." value=${pct(csvRes.betting.maxDrawdown)} />
        <${Stat} label="CLV moyenne" value=${csvRes.betting.clv === null ? "non calculable" : sgn(csvRes.betting.clv * 100, 2) + " %"} sub=${csvRes.betting.clvN ? `n = ${csvRes.betting.clvN}` : "pas de cotes de clôture"} />
      </div>`}</div>`}
      ${ctx.state.backtests.length > 0 && html`<details className="mt-2"><summary className="small">Backtests enregistrés (${ctx.state.backtests.length})</summary><${TableWrap}><table className="tbl small"><thead><tr><th>Date</th><th>Type</th><th>Compétition</th><th>Saison</th><th>n</th><th>Brier</th><th>Réf.</th><th>BTTS</th><th>Réf.</th><th>Version</th></tr></thead>
        <tbody>${ctx.state.backtests.slice().reverse().map((b) => html`<tr key=${b.id}><td className="mono">${dtFR(b.at)}</td><td>${b.kind}</td><td>${b.comp}</td><td>${b.season}</td><td className="mono">${b.n}</td><td className="mono">${fr(b.brier, 4)}</td><td className="mono">${fr(b.brierBase, 4)}</td><td className="mono">${fr(b.brierBTTS, 4)}</td><td className="mono">${fr(b.brierBTTSBase, 4)}</td><td>${b.engineVersion}</td></tr>`)}</tbody></table><//></details>`}
    <//>`;
  }

  /* =========================================================================
     PANNEAUX : paramètres, données
     ========================================================================= */
  function SettingsPanel({ ctx, onClose }) {
    const [s, setS] = useState(Object.assign({}, ctx.settings));
    const F = (k, label, hint, mult = 1, d = 2) => html`<${Field} label=${label} id=${"s-" + k} hint=${hint}><${NumInput} id=${"s-" + k} value=${s[k] === null ? null : +(s[k] * mult).toFixed(6)} min=${0} onChange=${(v) => setS({ ...s, [k]: v === null ? null : v / mult })} /><//>`;
    const errs = [];
    if (!(s.initialBankroll > 0)) errs.push("Capital de référence > 0");
    if (!(s.kellyFraction > 0 && s.kellyFraction <= 1)) errs.push("Fraction de Kelly entre 0 et 100 %");
    if (!(s.maxStakePct > 0 && s.maxStakePct <= s.maxMatchPct && s.maxMatchPct <= s.maxTotalPct && s.maxTotalPct <= 1)) errs.push("Plafonds : mise ≤ match ≤ total ≤ 100 %");
    if (!(s.evMin >= 0 && s.evMin < 1)) errs.push("EV minimale entre 0 et 100 %");
    return html`<div className="overlay" role="dialog" aria-modal="true"><div className="dialog wide">
      <div className="row justify-between items-center"><h3>Paramètres (${ctx.mode === "demo" ? "démo" : "réel"})</h3><button className="iconbtn" onClick=${onClose} aria-label="Fermer"><${Ic} n="X" /></button></div>
      <p className="muted small">Garde-fous initiaux prudents, modifiables. Ce ne sont pas des seuils universellement optimaux.</p>
      <div className="filters">
        <${Field} label="Bookmaker de référence" id="s-book" hint="cotes utilisées pour les choix et les tickets ; s'il n'a pas coté un match : médiane des bookmakers français, puis Bet 365"><select id="s-book" className="inp" value=${s.oddsBook || "best"} onChange=${(e) => setS({ ...s, oddsBook: e.target.value, oddsBookUser: true })}>
          <option value="best">Meilleur prix des 5 bookmakers français</option>
          ${Object.entries((FQ.ETL && FQ.ETL.FR_BOOKS) || {}).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}</select><//>
        <${Field} label="Multiboost Betclic" id="s-mb" hint="bonus de cote des combinés Betclic à partir de 5 sélections ; barème appris sur tes tickets Betclic saisis"><select id="s-mb" className="inp" value=${s.multiboost === true ? "on" : "off"} onChange=${(e) => setS({ ...s, multiboost: e.target.value === "on", multiboostUser: true })}><option value="off">Ignoré</option><option value="on">Appliqué (tickets chiffrés chez Betclic)</option></select><//>
        ${F("initialBankroll", "Capital de référence (unités)", "aucune bankroll réelle : 100 u par défaut", 1)}
        ${F("kellyFraction", "Kelly fractionné (%)", "25 % par défaut", 100)}
        ${F("maxStakePct", "Mise maximale (% bankroll)", "1 % par défaut", 100)}
        ${F("maxMatchPct", "Exposition max. par match (%)", "4 % par défaut", 100)}
        ${F("maxTotalPct", "Exposition totale max. (%)", "10 % par défaut", 100)}
        ${F("minStake", "Mise minimale (unités)", "en dessous : aucune mise", 1)}
        ${F("evMin", "EV minimale (%)", "3 % : hypothèse de travail", 100)}
        ${F("maxOdds", "Cote maximale", "vide = plafond appris sur l'historique", 1)}
        <${Field} label="Paris automatiques" id="s-abm"><select id="s-abm" className="inp" value=${s.autoBetMode || "policy"} onChange=${(e) => setS({ ...s, autoBetMode: e.target.value })}>
          <option value="policy">Selon la stratégie validée sur l'historique</option><option value="always">Toujours (value bets)</option><option value="never">Jamais</option></select><//>
        ${F("relMin", "Fiabilité minimale (0–100)", "en dessous : à surveiller / no bet", 1)}
        ${F("missingWatch", "Résultats manquants → à surveiller", "", 1)}
        ${F("missingBlock", "Résultats manquants → no bet", "", 1)}
        ${F("agentMinN", "Agent : observations min. par état", "avant tout veto", 1)}
        ${F("agentAlpha", "Agent : taux d'apprentissage α", "", 1)}
        ${F("riskKappa", "Agent : pénalité d'exposition κ", "", 1)}
        ${F("calibMinN", "Calibration : observations min.", "", 1)}
      </div>
      ${errs.length > 0 && html`<div className="t-warn small">${errs.join(" · ")}</div>`}
      <div className="row gap-2 justify-end mt-3"><${Btn} onClick=${() => setS(Object.assign({}, FQ.DEFAULT_SETTINGS, { initialBankroll: s.initialBankroll }))}>Valeurs par défaut<//><${Btn} onClick=${onClose}>Annuler<//>
        <${Btn} kind="primary" disabled=${errs.length > 0} onClick=${() => { ctx.update((st) => { st.settings = s; st.log.push({ t: new Date().toISOString(), text: "Paramètres modifiés" }); return st; }); ctx.notify("Paramètres enregistrés : mises recalculées", "pos"); onClose(); }}>Enregistrer<//></div>
    </div></div>`;
  }

  function DataPanel({ ctx, onClose, reseed }) {
    const [imp, setImp] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const pi = ctx.persistInfo;
    function exportJSON() {
      const payload = { app: "Football Quant AI", schema: 1, mode: ctx.mode, exportedAt: new Date().toISOString(), engineVersion: FQ.ENGINE_VERSION, state: ctx.state };
      offerExport(ctx, `football-quant-ai_${ctx.mode}_${ctx.today}.json`, JSON.stringify(payload, null, 1));
    }
    function onFile(e) {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(String(rd.result));
          const st = j.state || j;
          const errs = FQ.validateState(st);
          setImp({ name: file.name, st, errs, mode: j.mode, counts: errs.length ? null : { bets: st.bets.length, predictions: st.predictions.length, audits: st.audits.length } });
        } catch (err) { setImp({ name: file.name, errs: ["JSON invalide : " + err.message] }); }
      };
      rd.readAsText(file);
    }
    return html`<div className="overlay" role="dialog" aria-modal="true"><div className="dialog wide">
      <div className="row justify-between items-center"><h3>Sauvegarde et données (${ctx.mode === "demo" ? "démo" : "réel"})</h3><button className="iconbtn" onClick=${onClose} aria-label="Fermer"><${Ic} n="X" /></button></div>
      <div className="small"><b>Persistance active :</b> ${pi.kind}. ${ctx.mode === "real" ? (pi.kind.startsWith("base") ? "L'état réel est enregistré automatiquement dans votre espace privé de la base de l'artefact (invisible des autres lecteurs), avec copie locale." : "Base privée indisponible dans cette vue (non connecté ou aperçu) : l'état n'est conservé que dans ce navigateur. Exportez régulièrement.") : "L'état de démo reste dans ce navigateur."}
        ${pi.saved ? ` Dernière sauvegarde : ${dtFR(pi.saved.at)}.` : ""} Chargé depuis : ${pi.loadedFrom[ctx.mode] || "—"}.</div>
      <div className="stats mt-2"><${Stat} label="Prédictions" value=${ctx.state.predictions.length} /><${Stat} label="Paris" value=${ctx.state.bets.length} /><${Stat} label="Audits" value=${ctx.state.audits.length} /><${Stat} label="Journal agent" value=${ctx.state.qlog.length} /></div>
      <div className="row gap-2 wrap mt-2"><${Btn} kind="primary" onClick=${exportJSON}><${Ic} n="FileDown" /> Exporter l'état complet (JSON)<//>
        <label className="btn btn-ghost"><${Ic} n="FileUp" /> Importer une sauvegarde<input type="file" accept="application/json,.json" hidden onChange=${onFile} /></label></div>
      ${imp && html`<div className="note mt-2 small"><b>${imp.name}</b>${imp.errs.length ? html`<ul className="notes t-neg">${imp.errs.map((e, i) => html`<li key=${i}>${e}</li>`)}</ul>` : html`
        <div>Fichier valide${imp.mode ? ` (mode ${imp.mode})` : ""} : ${imp.counts.predictions} prédictions, ${imp.counts.bets} paris, ${imp.counts.audits} audits.</div>
        <div className="row gap-2 mt-1"><${Btn} small onClick=${() => setConfirm({ kind: "merge" })}>Fusionner (sans doublons)<//><${Btn} small kind="danger" onClick=${() => setConfirm({ kind: "replace" })}>Remplacer l'état actuel<//></div>`}</div>`}
      <div className="eyebrow mt-3">Réinitialisation</div>
      <div className="row gap-2 wrap">${ctx.mode === "demo" ? html`<${Btn} onClick=${() => setConfirm({ kind: "reseed" })}><${Ic} n="RotateCcw" /> Régénérer la démo<//>` : html`<${Btn} kind="danger" onClick=${() => setConfirm({ kind: "reset" })}><${Ic} n="Trash2" /> Effacer l'état réel<//>`}</div>
      <${Confirm} open=${!!confirm} danger=${confirm && confirm.kind !== "merge"} title=${confirm ? { merge: "Fusionner la sauvegarde ?", replace: "Remplacer l'état ?", reset: "Effacer définitivement l'état réel ?", reseed: "Régénérer la démo ?" }[confirm.kind] : ""}
        text=${confirm ? { merge: "Les éléments déjà présents (même identifiant) sont ignorés.", replace: "L'état actuel sera écrasé. Exportez-le d'abord si besoin.", reset: "Paris, prédictions, audits et apprentissage du mode réel seront supprimés. Cette action est irréversible.", reseed: "Tous les paris et audits de démonstration seront recréés à l'identique." }[confirm.kind] : ""}
        onNo=${() => setConfirm(null)} onYes=${() => {
          const k = confirm.kind; setConfirm(null);
          if (k === "merge") { let info; ctx.update((s) => { const r = FQ.mergeStates(s, imp.st); info = r; return r.state; }); ctx.notify("Fusion effectuée", "pos"); setImp(null); }
          if (k === "replace") { ctx.update(() => Object.assign(FQ.emptyState(), imp.st)); ctx.notify("État remplacé", "pos"); setImp(null); }
          if (k === "reset") { P.clear("real"); ctx.update(() => FQ.emptyState(), "real"); ctx.notify("État réel effacé"); }
          if (k === "reseed") { reseed(); }
        }} />
    </div></div>`;
  }

  /* --------------------------------------------------------------- démarrage */
  window.addEventListener("error", (e) => { const el = document.getElementById("fatal"); if (el) { el.hidden = false; el.textContent = "Erreur : " + e.message; } });
  try {
    const rootEl = document.getElementById("root");
    ReactDOM.createRoot(rootEl).render(html`<${App} />`);
  } catch (e) {
    const el = document.getElementById("fatal"); if (el) { el.hidden = false; el.textContent = "Impossible de démarrer : " + e.message; }
  }
};
