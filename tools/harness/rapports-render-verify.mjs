// Vérité RENDU — la page « Rapports » (12/09, docs/explorer-outil-spec.md § 6, incrément 4). Le script inline RÉEL de
// rapports.astro exécuté dans happy-dom, sur les documents et les Modèles RÉELS du compte de test owner (lus par les libs,
// servis par un fetch de substitution qui rend ce que les routes rendent). Le harnais EST la page : liste des rapports,
// liste des modèles, un document ouvert par le kit avec ses actions (flèches, Dupliquer, Retirer, Votre note, Approfondir,
// Actualiser, Modifier la Synthèse, Enregistrer comme modèle), l'historique des versions ; depuis l'incrément 5, le formulaire
// « Envoyer chaque… » sous un Modèle et la zone « Vos envois ». La composition (la boucle) n'est pas rejouée ici : la
// batterie de l'agent la porte ; l'envoi réel non plus : la route /api/explorer/envois (maintenant: true) le fait.
// Usage : npm run harness:rapports
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { listReportDocuments, listReportVersions, readReportDocument } from "../../src/lib/rapport/documents";
import { listReportTemplates } from "../../src/lib/rapport/modeles";
import { SECTION_BY_CLE, MODELE_VENTES } from "../../src/lib/fr/rapport.fr";

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
let fails = 0;
const check = (label, cond, detail) => { console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 160) : "")); if (!cond) fails++; };
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const bq = makeBQClient("muse-square-open-data");
const [documents, modeles] = await Promise.all([listReportDocuments(bq, LOC), listReportTemplates(bq, LOC)]);
check("le compte de test porte des Rapports enregistrés", documents.length >= 1, documents.length);
const first = documents[0];
const versions = await listReportVersions(bq, LOC, first.document_id);
const docFull = await readReportDocument(bq, LOC, first.document_id);

// Le fetch de substitution : ce que les routes rendent, depuis les libs (mêmes objets).
const modelesJson = { ok: true, location_id: LOC, modeles: [
  { template_id: "ventes", version: 0, nom: "Rapport de ventes", periode_relative: "30_derniers_jours", indicateur: "ca", par_defaut: true, sections_fr: MODELE_VENTES.map((c) => SECTION_BY_CLE[c].titre) },
  ...modeles.map((t) => ({ ...t, par_defaut: false, sections_fr: t.sections.map((s) => SECTION_BY_CLE[s.cle].titre) })),
] };
const fetchStub = async (url, init) => {
  const u = String(url);
  const json = (o) => ({ ok: true, status: 200, json: async () => o, body: null });
  if (u.startsWith("/api/explorer/modeles")) return json(modelesJson);
  // Incrément 5 : les envois du site (aucun ici — le harnais ne programme rien) et les destinataires connus.
  if (u.startsWith("/api/explorer/envois")) return json({ ok: true, location_id: LOC, envois: [], ponctuels: [], contacts: { moi: "owner@example.test", equipe: [{ nom: "Nadia Test", email: "nadia@example.test" }] } });
  if (u.startsWith("/api/explorer/rapports")) {
    const p = new URL("http://l" + u).searchParams;
    if (init && init.method === "POST") return json({ ok: true, document_id: first.document_id, version: first.version + 1, document: docFull });
    if (p.get("document_id") && p.get("versions") === "1") return json({ ok: true, versions });
    if (p.get("document_id")) return json({ ok: true, document: docFull });
    return json({ ok: true, location_id: LOC, documents: documents.map(({ rapport, ...d }) => ({ ...d, n_sections: rapport.sections.length })) });
  }
  return { ok: false, status: 404, json: async () => ({ ok: false, error: "inconnu" }) };
};

const astro = readFileSync(new URL("../../src/pages/app/insightevent/rapports.astro", import.meta.url), "utf8");
const src = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/)[1];
const markup = astro.match(/<div id="rp-root"[\s\S]*?<div id="rp-doc"><\/div>\n\s*<\/div>/)[0].replace("data-location={location_id}", 'data-location=""').replace("data-document={document_id}", 'data-document="' + first.document_id + '"');
const win = new Window({ url: "https://app.local/app/insightevent/rapports" });
const doc = win.document;
doc.body.innerHTML = markup;
new Function("window", "document", readFileSync(new URL("../../public/js/card-kit.js", import.meta.url), "utf8"))(win, doc);
new Function("window", "document", "fetch", "prompt", "setTimeout", src)(win, doc, fetchStub, () => null, setTimeout);
await tick(); await tick(); await tick();

const list = doc.getElementById("rp-list");
check("« Vos rapports » liste chaque document avec période, sections, version, date", list.querySelectorAll(".rp-item").length === documents.length && /version \d+ · \d{2}\/\d{2}\/\d{4}/.test(list.textContent), list.textContent.slice(0, 120));
const mod = doc.getElementById("rp-modeles");
check("« Vos modèles » liste le Rapport de ventes par défaut puis les Modèles du site, chacun avec « Composer depuis ce modèle » et « Envoyer chaque… »", mod.textContent.includes("Rapport de ventes") && mod.querySelectorAll("button").length === 2 * modelesJson.modeles.length, mod.querySelectorAll("button").length);
// Incrément 5 — « Envoyer chaque… » ouvre le formulaire : cadence (chaque jour, chaque lundi…), heure, canal, destinataires (moi coché, l'équipe), Enregistrer, Envoyer maintenant.
const envBtn = [...mod.querySelectorAll("button")].find((b) => b.textContent === "Envoyer chaque…");
envBtn.click(); await tick();
const form = mod.querySelector(".rp-form");
check("le formulaire d'envoi s'ouvre sous le Modèle", !!form);
if (form) {
  const cad = [...form.querySelector("select[aria-label='Cadence']").options].map((o) => o.textContent);
  check("la cadence dit les mots du lexique : chaque jour · chaque lundi … dimanche · chaque 1er du mois · chaque trimestre · chaque année", cad[0] === "chaque jour" && cad[1] === "chaque lundi" && cad.includes("chaque 1er du mois") && cad.includes("chaque trimestre") && cad.includes("chaque année"), cad.join(" | "));
  check("chaque lundi à 8 h par email est la valeur par défaut", form.querySelector("select[aria-label='Cadence']").value === "hebdomadaire:1" && form.querySelector("select[aria-label='Heure']").value === "8" && form.querySelector("select[aria-label='Canal']").value === "email");
  const labels = [...form.querySelectorAll("label")].map((l) => l.textContent.trim());
  check("les destinataires : Moi (coché) et les membres de l'équipe qui ont un email", labels[0] === "Moi (owner@example.test)" && labels[1] === "Nadia Test" && form.querySelector("input[type=checkbox]").checked, labels.join(" | "));
  const btns = [...form.querySelectorAll("button")].map((b) => b.textContent);
  check("les deux boutons : Enregistrer · Envoyer maintenant", JSON.stringify(btns) === JSON.stringify(["Enregistrer", "Envoyer maintenant"]), JSON.stringify(btns));
}
const env = doc.getElementById("rp-envois");
check("« Vos envois » : sans envoi programmé, la zone renvoie à « Envoyer chaque… »", /Aucun envoi programmé/.test(env.textContent), env.textContent.slice(0, 80));
const d = doc.getElementById("rp-doc");
check("le document ouvert (?document_id) est rendu par le kit : titre, sections", d.textContent.includes(docFull.titre) && d.querySelectorAll("[data-rapport-section]").length === docFull.rapport.sections.length, d.querySelectorAll("[data-rapport-section]").length + " · " + d.textContent.slice(0, 120));
if (!d.querySelector("[data-rapport-section='0']")) { console.log(fails + " échec(s) — le document ne s'est pas rendu, les contrôles suivants n'ont pas de sens."); process.exit(1); }
const bar = [...d.querySelectorAll(".rp-bar button")].map((b) => b.textContent);
check("les actions du document : Actualiser · Modifier la Synthèse · Enregistrer comme modèle", JSON.stringify(bar) === JSON.stringify(["Actualiser", "Modifier la Synthèse", "Enregistrer comme modèle"]), JSON.stringify(bar));
const s0 = [...d.querySelector("[data-rapport-section='0'] .rp-actions").querySelectorAll("button")].map((b) => b.textContent);
check("sous la première section : ↓ · Dupliquer · Retirer · Votre note · Approfondir (pas de ↑ en tête)", JSON.stringify(s0) === JSON.stringify(["↓", "Dupliquer", "Retirer", "Votre note", "Approfondir"]), JSON.stringify(s0));
check("les flèches portent Monter / Descendre pour un lecteur d'écran", d.querySelector("[data-rapport-section='0'] .rp-actions button").getAttribute("aria-label") === "Descendre");
check("le mot « geste » n'apparaît nulle part sur la page", !/\bgestes?\b/i.test(doc.body.textContent));
check("l'historique des versions se montre quand il y en a plusieurs (" + versions.length + ")", versions.length < 2 || /Versions : v\d+/.test(d.textContent), d.querySelector(".rp-versions")?.textContent);
console.log(fails ? `\n${fails} échec(s).` : "\nTout vert.");
process.exit(fails ? 1 : 0);
