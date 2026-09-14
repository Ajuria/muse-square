// tools/generators/pole-deux-vues-proto.mts — LA PAGE D'UN PÔLE EN DEUX VUES, à arbitrer (owner 14/09 :
// « prototyper la page pôle augmentée avec vue du dispositif (les photos), vue de la performance »).
//
// CE QUE LE PROTO N'INVENTE PAS, et c'est tout le point : il ne redessine rien. Il appelle le VRAI
// endpoint (`/api/commitments/evolution`) sur un VRAI pôle du compte de l'owner, rend le VRAI kit
// (`MSCardKit.renderEvolution`, EVOL_COPY réel), puis RÉPARTIT les sections déjà rendues entre deux
// onglets. Ce qu'il y a à arbitrer est donc la RÉPARTITION, pas une maquette : ce que vous voyez est ce
// que la page produit aujourd'hui, rangé autrement.
//
// LA RÉPARTITION PROPOSÉE, par les marqueurs que le kit pose lui-même :
//   · Dispositif  — Composants et leurs photos · Articles des photos · Historique du dispositif ·
//                   La version suivante
//   · Performance — Familles du pôle · Résultats 30 jours · Opérations sur ce pôle
// Toute section que ce script ne sait PAS classer est signalée et rendue dans les DEUX vues : un bloc
// perdu en silence serait le pire résultat possible (règle « ADD, don't REPLACE »).
//
// Les photos ne s'affichent pas hors de l'app (le bucket est privé, l'image passe par un proxy
// authentifié) : les emplacements montrent leur libellé, comme avant le chargement dans la page réelle.
//
// Usage : npx tsx tools/generators/pole-deux-vues-proto.mts [--pole=<commitment_id>]
// Sortie : tools/proto/pole-deux-vues-proto.html
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import * as vm from "node:vm";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as evoGET } from "../../src/pages/api/commitments/evolution";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";
import { listPoles } from "../../src/lib/dispositifs/poleReading";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";           // le compte que l'owner teste (CLAUDE.md)
const SORTIE = "tools/proto/pole-deux-vues-proto.html";
const arg = (n: string) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").slice(n.length + 3);

const bq = makeBQClient(P);

// Le pôle : celui demandé, sinon le premier déclaré du site.
let commitmentId = arg("pole");
if (!commitmentId) {
  const poles = await listPoles(bq, LOC, 12);
  const p = poles.find((x) => x.commitment_id);
  if (!p) { console.error("Aucun pôle déclaré sur ce site — rien à prototyper."); process.exit(2); }
  commitmentId = String(p.commitment_id);
  console.log(`Pôle : « ${p.name} » (${commitmentId.slice(0, 8)}…)`);
}

// L'utilisateur du site, pour que la garde d'accès de l'endpoint passe (lecture seule).
const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const userId = String((u as any)?.clerk_user_id?.value ?? (u as any)?.clerk_user_id ?? "");
if (!userId) { console.error("Aucun utilisateur sur ce site."); process.exit(3); }

const res = await evoGET({
  url: new URL(`http://l/api/commitments/evolution?commitment_id=${encodeURIComponent(commitmentId)}`),
  locals: { clerk_user_id: userId },
} as any);
const data: any = await (res as Response).json();
if (!data?.ok) { console.error("evolution:", data?.error); process.exit(4); }
if (data.commitment?.dispositif_nature !== "permanent") { console.error("Ce commitment n'est pas un pôle."); process.exit(5); }

// Le VRAI kit, dans un vm — le harnais EST la page (CLAUDE.md § Verify Before Done).
const bac: any = { window: {}, console };
bac.window.window = bac.window;
vm.createContext(bac);
vm.runInContext(readFileSync("public/js/card-kit.js", "utf8"), bac, { filename: "card-kit.js" });
const rendu = String(bac.window.MSCardKit.renderEvolution(data, EVOL_COPY));

// La répartition, par les marqueurs du kit puis par le titre de section.
const win: any = new Window({ url: "https://app.local/" });
const doc = win.document;
const box = doc.createElement("div");
box.innerHTML = rendu;

const TITRE = (el: any): string => {
  const u2 = el.querySelector?.(".eg-uc");
  return String((u2?.textContent ?? "") || "").trim();
};
const DISPOSITIF_TITRES = new Set([EVOL_COPY.pole_components_title, EVOL_COPY.pole_items_title, EVOL_COPY.lin_pole_titre, EVOL_COPY.vform_title].map(String));
const PERFORMANCE_TITRES = new Set([EVOL_COPY.pole_fams_title, (EVOL_COPY as any).pole_reading_title, (EVOL_COPY as any).pole_ops_title].map(String));

const tete: string[] = [];            // l'en-tête du document : nom, chips, responsable — dans les DEUX vues
const dispo: string[] = [];
const perf: string[] = [];
const inconnues: string[] = [];

Array.from(box.children as any[]).forEach((el: any, i: number) => {
  const html = el.outerHTML as string;
  const t = TITRE(el);
  const estSection = el.classList?.contains("eg-sec") || el.hasAttribute?.("data-eg-items") || el.hasAttribute?.("data-eg-nextversion-sec");
  const texte = String(el.textContent || "");
  if (i === 0 && !estSection) { tete.push(html); return; }                       // l'en-tête du kit
  if (el.hasAttribute?.("data-eg-components") || el.hasAttribute?.("data-eg-items") || el.hasAttribute?.("data-eg-nextversion-sec")) { dispo.push(html); return; }
  if (t && DISPOSITIF_TITRES.has(t)) { dispo.push(html); return; }
  if (t && PERFORMANCE_TITRES.has(t)) { perf.push(html); return; }
  if (texte.indexOf(String(EVOL_COPY.lin_pole_titre)) >= 0) { dispo.push(html); return; }   // l'historique n'a pas de .eg-uc
  if (texte.indexOf(String(EVOL_COPY.sources_title ?? "Sources")) >= 0) { tete.push(html); return; }
  inconnues.push(html);
});

const vue = (titre: string, blocs: string[]) =>
  `<section data-vue="${titre}"><div class="proto-doc">${tete.join("")}${blocs.join("")}${inconnues.join("")}</div></section>`;

const html = `<!doctype html><meta charset="utf-8"><title>La page d'un pôle — deux vues (proto)</title>
<style>
  /* Styles COPIÉS de src/components/EngagementDoc.astro — le proto ne réinvente aucune valeur. */
  body { font-family: system-ui, -apple-system, sans-serif; color: #111827; margin: 0; padding: 20px 24px 60px; background: #f7f8fa; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .intro { color: #6B7280; font-size: 13px; margin-bottom: 20px; max-width: 76ch; line-height: 1.6; }
  .onglets { display: flex; gap: 8px; margin-bottom: 14px; }
  .onglet { padding: 8px 16px; border: 1px solid #1D3BB3; border-radius: 10px; background: #fff; color: #1D3BB3; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .onglet.on { background: #1D3BB3; color: #fff; }
  .proto-doc { max-width: 820px; background: #fff; border: 1px solid rgba(0,0,0,0.10); border-radius: 10px; padding: 26px 28px; }
  .eg-uc { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: #111827; font-weight: 700; margin-bottom: 10px; }
  .eg-sec { margin-bottom: 26px; }
  section[data-vue] { display: none; }
  section[data-vue].on { display: block; }
  .note { font-size: 12px; color: #6B7280; margin-top: 16px; max-width: 76ch; line-height: 1.6; }
</style>
<h1>La page d'un pôle — deux vues</h1>
<div class="intro">Rendu par le VRAI kit sur un VRAI pôle du compte de test : rien n'est redessiné, les sections sont
celles que la page produit aujourd'hui, rangées autrement. Ce qui s'arbitre ici est la RÉPARTITION.
Les photos ne s'affichent pas hors de l'app (bucket privé, proxy authentifié) : leurs emplacements montrent leur libellé.</div>
<div class="onglets">
  <button type="button" class="onglet on" data-o="Dispositif">Dispositif</button>
  <button type="button" class="onglet" data-o="Performance">Performance</button>
</div>
${vue("Dispositif", dispo)}
${vue("Performance", perf)}
<div class="note">Dispositif : ${dispo.length} section(s). Performance : ${perf.length}. En-tête repris dans les deux : ${tete.length}.
${inconnues.length ? `<b>${inconnues.length} section(s) non classée(s)</b> — rendues dans les DEUX vues pour qu'aucun bloc ne disparaisse en silence.` : "Aucune section non classée."}</div>
<script>
  document.querySelectorAll(".onglet").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".onglet").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll("section[data-vue]").forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-vue") === b.getAttribute("data-o")); });
    });
  });
  document.querySelector('section[data-vue="Dispositif"]').classList.add("on");
</script>`;

writeFileSync(SORTIE, html);
console.log(`Dispositif : ${dispo.length} section(s) · Performance : ${perf.length} · en-tête : ${tete.length} · non classées : ${inconnues.length}`);
if (inconnues.length) console.warn("ATTENTION — sections non classées, rendues dans les deux vues. Classez-les avant de livrer la page.");
console.log(`Écrit : ${SORTIE}`);
