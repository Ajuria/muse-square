// Vérité COMPORTEMENT du routage d'import par caisse (P3.1-c) — deux étages :
// 1. ENDPOINT réel : /api/import/locations (GET direct) rend `pos` quand le profil porte une
//    caisse — pose temporaire de sage100 sur MS Test, lecture, retour à NULL (aucun état durable).
// 2. FLUX réel : l'IIFE setupCsvImport EXTRAITE VERBATIM de public/scripts/ie-prompt.js exécutée
//    sous happy-dom — caisse déclarée → question sautée + import routé source=sage100 ;
//    sans caisse → question « De quel logiciel provient l'export ? » inchangée.
// Usage : npx tsx tools/harness/import-routing-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as locGET } from "../../src/pages/api/import/locations.ts";

const P = "muse-square-open-data";
const LOC = "29383776-bd7a-4401-ac26-f2e6efe1f58c"; // MS Test
const TBL = `\`${P}.raw.insight_event_user_location_profile\``;
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (l, c, d) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + d : "")); if (!c) fails++; };

// ── Étage 1 : endpoint réel ──
const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id, pos_system FROM ${TBL} WHERE location_id = @l LIMIT 1`, params: { l: LOC }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const posBefore = flat(u.pos_system);
if (posBefore != null) throw new Error("MS Test porte déjà une caisse (" + posBefore + ") — harnais prévu pour un état NULL, abandon sans écrire");

const setPos = (v) => bq.query({
  query: `UPDATE ${TBL} SET pos_system = @v WHERE location_id = @l`,
  params: { v, l: LOC }, types: { v: "STRING", l: "STRING" }, location: "EU",
});
const callEndpoint = async () => {
  const res = await locGET({ locals: { clerk_user_id: uid, location_id: LOC, all_location_ids: [LOC] } });
  return JSON.parse(await res.text());
};

let ep1, ep2;
try {
  await setPos("sage100");
  ep1 = await callEndpoint();
} finally {
  await setPos(null); // retour à l'origine quoi qu'il arrive
}
ep2 = await callEndpoint();

const l1 = (ep1.locations || []).find((x) => x.location_id === LOC);
check("endpoint : caisse posée → pos {sage100, Sage 100, import_source sage100, consigne}",
  l1 && l1.pos && l1.pos.pos_key === "sage100" && l1.pos.label_fr === "Sage 100"
  && l1.pos.import_source === "sage100" && typeof l1.pos.export_note_fr === "string" && l1.pos.export_note_fr.length > 0,
  JSON.stringify(l1 && l1.pos));
const l2 = (ep2.locations || []).find((x) => x.location_id === LOC);
check("endpoint : caisse retirée → pos null (et le libellé du site tient toujours)", l2 && l2.pos === null && !!l2.label);

// ── Étage 2 : flux réel sous happy-dom ──
const js = readFileSync(new URL("../../public/scripts/ie-prompt.js", import.meta.url), "utf8");
const start = js.indexOf("(function setupCsvImport() {");
if (start < 0) throw new Error("setupCsvImport introuvable");
const end = js.indexOf("\n    })();", start);
if (end < 0) throw new Error("fin de setupCsvImport introuvable");
const iife = js.slice(start, end + "\n    })();".length);
if (!/routeOrAskSource/.test(iife)) throw new Error("l'extrait ne contient pas routeOrAskSource — bornes fausses");

const POS = { pos_key: "sage100", label_fr: "Sage 100", ingestion_mode: "csv", import_source: "sage100", export_note_fr: "Export Ventes (factures) en CSV." };
const IMPORT_OK = { ok: true, status: "ok", rows_total: 2, rows_accepted: 2, rows_rejected: 0, date_range: ["2025-01-01", "2025-01-02"] };

async function runScenario(posOrNull, locsOverride) {
  const win = new Window({ url: "https://app.local/x" });
  const doc = win.document;
  doc.body.innerHTML = [
    '<div id="ie-prompt-empty"></div><div id="ie-thread" hidden></div>',
    '<div id="ie-prompt-input-wrap"><div id="ie-prompt-input-bar">',
    '<textarea id="ie-prompt-input"></textarea>',
    '<input type="file" id="ie-import-file-input" />',
    '<button id="ie-import-attach"></button><button id="ie-prompt-submit-btn"></button>',
    '</div></div>',
  ].join("");
  const calls = [];
  const fetchStub = (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).indexOf("/api/import/locations") >= 0) {
      const locations = locsOverride || [{ location_id: LOC, label: "MS Test", pos: posOrNull }];
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, active: LOC, locations }) });
    }
    if (String(url).indexOf("/api/import/sales-csv") >= 0) {
      return Promise.resolve({ json: () => Promise.resolve(IMPORT_OK) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ ok: false }) });
  };
  const qs = (id) => doc.getElementById(id);
  const appendMsg = (role, text) => {
    const row = doc.createElement("div");
    row.className = "msg-" + role;
    const bubble = doc.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text || "";
    row.appendChild(bubble);
    doc.getElementById("ie-thread").appendChild(row);
    return bubble;
  };
  const setBubbleHtml = (b, html) => { b.innerHTML = html; };
  const escapeHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  new Function("document", "fetch", "qs", "appendMsg", "setBubbleHtml", "escapeHtml", "FormData", iife)(
    doc, fetchStub, qs, appendMsg, setBubbleHtml, escapeHtml, win.FormData,
  );
  // Joindre un fichier réel puis envoyer — le vrai chemin (change → chip → clic envoi).
  const fileInput = doc.getElementById("ie-import-file-input");
  const file = new win.File(["date;montant\n2025-01-01;10"], "ventes.csv", { type: "text/csv" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new win.Event("change"));
  doc.getElementById("ie-prompt-submit-btn").click();
  await new Promise((r) => setTimeout(r, 60));
  return { doc, calls, win };
}

// Scénario A : caisse déclarée → question sautée, import routé.
{
  const { doc, calls } = await runScenario(POS);
  const thread = doc.getElementById("ie-thread").textContent;
  const csvCall = calls.find((c) => c.url.indexOf("/api/import/sales-csv") >= 0);
  check("caisse déclarée : la question « De quel logiciel » ne se pose PAS", thread.indexOf("De quel logiciel provient") < 0);
  check("caisse déclarée : ligne de provenance « Sage 100 — votre caisse déclarée »",
    thread.indexOf("Sage 100") >= 0 && thread.indexOf("votre caisse déclarée") >= 0);
  check("caisse déclarée : import lancé DIRECT avec source=sage100",
    !!csvCall && csvCall.opts && csvCall.opts.body && csvCall.opts.body.get("source") === "sage100",
    csvCall && csvCall.opts && csvCall.opts.body ? String(csvCall.opts.body.get("source")) : "aucun appel");
  check("caisse déclarée : résumé d'import rendu (lignes importées)", thread.indexOf("2 lignes import") >= 0);
  check("mono-site : geste « Ajouter vos autres sites → » après import réussi (P3.1-d)", thread.indexOf("Ajouter vos autres sites") >= 0);
}

// Scénario D (P3.1-d) : compte MULTI-site → pas de geste « Ajouter vos autres sites » ; routage après choix du site.
{
  const locs = [
    { location_id: LOC, label: "MS Test", pos: POS },
    { location_id: "autre-site", label: "Site 2", pos: null },
  ];
  const { doc, calls } = await runScenario(null, locs);
  const threadEl = doc.getElementById("ie-thread");
  check("multi-site : la question « Pour quel établissement ? » se pose", threadEl.textContent.indexOf("Pour quel établissement") >= 0);
  const optLoc = threadEl.querySelector('.ie-import-opt[data-id="' + LOC + '"]');
  check("multi-site : le site MS Test est proposé", !!optLoc);
  if (optLoc) {
    optLoc.click();
    await new Promise((r) => setTimeout(r, 60));
    const csvCall = calls.find((c) => c.url.indexOf("/api/import/sales-csv") >= 0);
    check("multi-site : site choisi avec caisse → routé source=sage100 sans question logiciel",
      !!csvCall && csvCall.opts.body.get("source") === "sage100" && threadEl.textContent.indexOf("De quel logiciel provient") < 0);
    check("multi-site : PAS de geste « Ajouter vos autres sites »", threadEl.textContent.indexOf("Ajouter vos autres sites") < 0);
  }
}

// Scénario A' : caisse connector_planned → même routage + consigne « Connexion directe prévue » visible.
{
  const POS_CONN = { pos_key: "sumup", label_fr: "SumUp", ingestion_mode: "connector_planned", import_source: "sumup", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes depuis SumUp." };
  const { doc, calls } = await runScenario(POS_CONN);
  const thread = doc.getElementById("ie-thread").textContent;
  const csvCall = calls.find((c) => c.url.indexOf("/api/import/sales-csv") >= 0);
  check("connector_planned : consigne « Connexion directe prévue » affichée", thread.indexOf("Connexion directe prévue") >= 0);
  check("connector_planned : import routé source=sumup", !!csvCall && csvCall.opts.body.get("source") === "sumup");
}

// Scénario B : sans caisse → question inchangée, import après réponse.
{
  const { doc, calls, win } = await runScenario(null);
  const threadEl = doc.getElementById("ie-thread");
  check("sans caisse : la question « De quel logiciel provient l'export ? » se pose", threadEl.textContent.indexOf("De quel logiciel provient") >= 0);
  check("sans caisse : aucun import avant réponse", !calls.some((c) => c.url.indexOf("/api/import/sales-csv") >= 0));
  const opt = threadEl.querySelector('.ie-import-opt[data-id="sumup"]');
  check("sans caisse : l'option SumUp existe dans la liste", !!opt);
  if (opt) {
    opt.click();
    await new Promise((r) => setTimeout(r, 60));
    const csvCall = calls.find((c) => c.url.indexOf("/api/import/sales-csv") >= 0);
    check("sans caisse : réponse SumUp → import source=sumup",
      !!csvCall && csvCall.opts.body.get("source") === "sumup",
      csvCall ? String(csvCall.opts.body.get("source")) : "aucun appel");
  }
}

console.log(fails === 0 ? "\nTOUT VERT" : "\n" + fails + " ÉCHEC(S)");
process.exit(fails === 0 ? 0 : 1);
