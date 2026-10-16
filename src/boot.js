
(async function () {
  const fatal = (t) => { const el = document.getElementById("fatal"); if (el) { el.hidden = false; el.textContent = t; } };
  try {
    const raw = JSON.parse(await window.FQ.gz.unpack(document.getElementById("fq-raw").textContent.trim()));
    window.FQ_RAW = raw;
    window.FQ_DATASET = window.FQ.ETL.build(raw);
  } catch (e) { fatal("Lecture des données intégrées impossible : " + e.message); return; }
  if (typeof window.__fqStartApp === "function") window.__fqStartApp();
})();
