"use strict";
/* Rendu de la page assemblée dans un navigateur simulé (jsdom), bibliothèques chargées depuis node_modules (pas de CDN). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), zlib = require("zlib");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); } catch (e) { JSDOM = null; }
const ROOT = path.join(__dirname, "..");
const LIBS = {
  "react.production.min.js": "react/umd/react.production.min.js",
  "react-dom.production.min.js": "react-dom/umd/react-dom.production.min.js",
  "prop-types.min.js": "prop-types/prop-types.min.js",
  "Recharts.js": "recharts/umd/Recharts.js",
  "lucide-react.min.js": "lucide-react/dist/umd/lucide-react.min.js",
  "htm.umd.js": "htm/dist/htm.umd.js",
};

function pageHtml() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fq-")), "page.html");
  cp.execFileSync("python3", [path.join(ROOT, "build.py"), out]);
  let html = fs.readFileSync(out, "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (all, src) => {
    const name = src.split("/").pop();
    if (/tailwind/.test(src)) return "";
    const lib = LIBS[name];
    assert.ok(lib, "bibliothèque inattendue : " + src);
    return `<script>${fs.readFileSync(path.join(ROOT, "node_modules", lib), "utf8").replace(/<\/script>/g, "<\\/script>")}</script>`;
  });
  return html.replace(/<link[^>]+fonts\.googleapis[^>]*>/g, "");
}

function open(html) {
  const errors = [];
  const virtualConsole = new (require("jsdom").VirtualConsole)();
  virtualConsole.on("jsdomError", (e) => errors.push(String(e && (e.stack || e.message || e))));
  virtualConsole.on("error", (...a) => errors.push(a.map(String).join(" ")));
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://fq.test/", virtualConsole,
    beforeParse(w) {
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLElement.prototype.scrollIntoView = function () {};
      // DecompressionStream absent de jsdom : la page bascule sur zlib (chemin prévu pour Node)
      w.DecompressionStream = undefined; w.CompressionStream = undefined;
      w.require = (m) => { if (m === "zlib") return zlib; throw new Error("module non disponible : " + m); };
      w.Buffer = Buffer;
      if (typeof w.structuredClone !== "function") w.structuredClone = (x) => JSON.parse(JSON.stringify(x)); // présent dans les navigateurs, absent de jsdom
    } });
  return { dom, errors };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(100); } return null; }

test("la page se charge, affiche les 4 onglets et le formulaire « Mon ticket »", { skip: !JSDOM && "jsdom non installé (npm install)", timeout: 240000 }, async () => {
  const { dom, errors } = open(pageHtml());
  const w = dom.window, d = w.document;
  try {
  const tabs = await until(() => d.querySelectorAll(".tabs button").length >= 4 && d.querySelectorAll(".tabs button"), 180000);
  const fatal = d.getElementById("fatal");
  assert.ok(fatal.hidden, "erreur fatale : " + fatal.textContent);
  assert.ok(d.querySelector(".tabs svg"), "icônes absentes (lucide-react non chargé)");
  assert.ok(tabs, "onglets absents ; erreurs : " + errors.slice(0, 3).join(" | "));
  assert.deepEqual([...tabs].map((b) => b.textContent.trim()), ["Tableau de bord", "Pronostics & tickets", "Mes paris & audit", "Performance"]);
  // une seule base, réelle : plus de bascule démo
  assert.equal(d.querySelector(".mode-switch"), null, "la bascule Démo/Réel doit avoir disparu");
  assert.equal(d.querySelector(".banner.demo"), null);
  // bouton « Mon ticket » visible dans la barre du haut → formulaire de saisie avec recherche de match
  const btn = [...d.querySelectorAll(".topbar button")].find((b) => /Mon ticket/.test(b.textContent));
  assert.ok(btn, "bouton « Mon ticket » absent de la barre du haut");
  btn.click();
  const dlg = await until(() => d.querySelector('[aria-label="Enregistrer mon ticket"]'), 5000);
  assert.ok(dlg, "formulaire de saisie non ouvert");
  // test ou réel : « test » par défaut (un ticket saisi n'est pas forcément joué)
  const radios = [...dlg.querySelectorAll('[role="radio"]')];
  assert.equal(radios.length, 2, "choix test / réel absent");
  assert.ok(/Test/.test(radios.find((r) => r.getAttribute("aria-checked") === "true").textContent), "« test » doit être le choix par défaut");
  assert.ok(dlg.querySelector("#lp-q"), "recherche de match absente");
  // recherche d'une équipe présente dans les données
  const team = (w.FQ_DATASET.competitions.find((c) => c.code === "FL1").seasons.slice(-1)[0].matches.find((m) => m[6] === null) || [])[4];
  if (team) {
    const inp = dlg.querySelector("#lp-q");
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set;
    setter.call(inp, team.slice(0, 5)); inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    const chip = await until(() => dlg.querySelector(".chips .chip"), 5000);
    assert.ok(chip, "aucun match proposé pour « " + team.slice(0, 5) + " »");
    chip.click();
    assert.ok(await until(() => dlg.querySelector("#lp-m"), 3000), "choix du marché absent après sélection du match");
  }
  // onglet Performance : carte CLV
  [...d.querySelectorAll(".tabs button")].find((b) => /Performance/.test(b.textContent)).click();
  assert.ok(await until(() => /cote de clôture/i.test(d.body.textContent), 10000), "carte CLV absente");
  assert.ok(/test final/i.test(d.body.textContent), "résultats du test final absents");
  const real = errors.filter((e) => !/Not implemented|ResizeObserver|getBBox|width\(0\) and height\(0\)/.test(e));
  assert.deepEqual(real, [], "erreurs JavaScript dans la page");
  } finally { w.close(); } // ferme les minuteries de la page (sinon le processus ne se termine pas)
});
