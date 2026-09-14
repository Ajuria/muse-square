// tools/harness/description-render-verify.mts — TYPER UN COMPOSANT : LE RENDU (owner 14/09, option 3).
//
// Le harnais EST la page. Il prend le VRAI kit (`public/js/card-kit.js`), la VRAIE réponse de
// `/api/commitments/evolution` sur le pôle Cave du compte owner, et le bloc `wireDescriptions`
// EXTRAIT OCTET POUR OCTET de `src/components/EngagementDoc.astro` — jamais une copie réécrite, sinon
// il prouverait son propre code (défaut mesuré le 14/09 sur les clés de copie du relevé).
//
// Ce qu'il vérifie, et qu'aucun test pur ne peut voir :
//   1. la rangée d'un composant porte son type et son rôle COURANTS (sans quoi la liste s'ouvrirait
//      sur une valeur fausse et le premier enregistrement changerait le type en silence) ;
//   2. les deux listes remplacent bien le libellé de description, avec la bonne valeur sélectionnée ;
//   3. changer une liste envoie TOUTE la composition du pôle — pas un delta ;
//   4. le menu Rôle enregistre lui aussi (il ne le faisait pas au premier jet : son écouteur était
//      posé sur une fonction pas encore assignée, en silence) ;
//   5. un contexte indisponible laisse la rangée sur son TEXTE d'avant, jamais sur un trou.
//
// LECTURE SEULE : le `fetch` est espionné, rien ne part. Usage :
//   npx tsx tools/harness/description-render-verify.mts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as evoGET } from "../../src/pages/api/commitments/evolution";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";
import { dispositifTypesFor, dispositifRolesFor } from "../../src/lib/dispositifs/dispositifTypes";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

let echecs = 0;
const dire = (ok: boolean, txt: string) => { if (!ok) echecs++; console.log(`  ${ok ? "✓" : "✗"} ${txt}`); };

// ── le bloc de la page, extrait tel quel ────────────────────────────────────────────────────────
const astro = readFileSync(new URL("../../src/components/EngagementDoc.astro", import.meta.url), "utf8");
const DEB = "(function wireDescriptions() {";
const iDeb = astro.indexOf(DEB);
if (iDeb < 0) throw new Error("wireDescriptions introuvable dans EngagementDoc.astro");
const iFin = astro.indexOf("\n          })();", iDeb);
if (iFin < 0) throw new Error("fin du bloc wireDescriptions introuvable");
const BLOC = astro.slice(iDeb, iFin + "\n          })();".length);
console.log(`\nTYPER UN COMPOSANT — LE RENDU\n\n  bloc extrait d'EngagementDoc.astro : ${BLOC.length} octets`);

const bq = makeBQClient(P);
const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const uid = String(flat((u as any).clerk_user_id));
const [[cave]] = await bq.query({
  query: `SELECT commitment_id FROM \`${P}.semantic.vw_insight_event_dispositif_components\`
          WHERE location_id = @l AND committed_action_text = 'Cave' LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
if (!cave) { console.error("✗ pôle Cave introuvable."); process.exit(2); }
const cid = String(flat((cave as any).commitment_id));

const resp: any = await evoGET({
  url: new URL(`http://l/api/commitments/evolution?commitment_id=${cid}&location_id=${LOC}`),
  locals: { clerk_user_id: uid, role: "owner", all_location_ids: [LOC] },
} as any);
const data = await resp.json();
if (!data?.ok) { console.error(`✗ evolution : ${data?.error}`); process.exit(2); }
const comps = (data.commitment?.components || []) as any[];
console.log(`  pôle « ${data.commitment?.committed_action_text} », ${comps.length} composant(s), version ${data.commitment?.version_no}\n`);

// ── le contexte de création, la vraie forme servie par evenement.ts ──────────────────────────────
const contexte = {
  ok: true,
  component_types: dispositifTypesFor("grocery").filter((o) => !o.provisoire).map((o) => ({
    value: o.value, label_fr: o.label_fr,
    roles: dispositifRolesFor(o.value).filter((r) => !r.provisoire).map((r) => ({ value: r.value, label_fr: r.label_fr })),
  })),
};

async function jouer(ctxRend: () => Promise<any>) {
  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pole" });
  new Function("window", "document", readFileSync(new URL("../../public/js/card-kit.js", import.meta.url), "utf8"))(win, win.document);
  const doc = win.document;
  doc.body.innerHTML = '<div id="doc"></div>';
  const docEl = doc.getElementById("doc");
  docEl.innerHTML = win.MSCardKit.renderEvolution(data, EVOL_COPY);

  const envois: any[] = [];
  const fetchEspion = (url: string, init: any) => {
    envois.push({ url, body: JSON.parse(String(init?.body || "{}")) });
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, changements: [] }) });
  };
  const esc = (s: any) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const t = (k: string) => (EVOL_COPY as any)[k] || "";

  // Le bloc s'exécute avec EXACTEMENT les noms que la page lui donne.
  new Function("docEl", "data", "esc", "t", "contexteCreation", "fetch", "document", "window", BLOC)(
    docEl, data, esc, t, ctxRend, fetchEspion, doc, win,
  );
  await new Promise((r) => setTimeout(r, 30));
  return { docEl, doc, envois, win };
}

// ── 1. le cas nominal ───────────────────────────────────────────────────────────────────────────
{
  const { docEl, envois } = await jouer(() => Promise.resolve(contexte));
  const rangees = [].slice.call(docEl.querySelectorAll("[data-eg-component]")) as any[];
  dire(rangees.length === comps.length, `${rangees.length} rangée(s) rendue(s) par le vrai kit`);
  dire(rangees.every((r: any) => r.getAttribute("data-eg-comp-type")), "chaque rangée porte son type COURANT");

  const sels = [].slice.call(docEl.querySelectorAll("[data-eg-desc-type]")) as any[];
  dire(sels.length === comps.length, `${sels.length} liste(s) de type posée(s) à la place du libellé`);
  const justes = sels.filter((s: any, i: number) => s.value === comps[i].type).length;
  dire(justes === comps.length, `chaque liste s'ouvre sur la valeur courante (${justes}/${comps.length}, ex. « ${sels[0]?.value} »)`);

  // changer le type du premier composant
  const s0 = sels[0];
  s0.value = s0.value === "lineaire" ? "vitrine" : "lineaire";
  s0.dispatchEvent(new (docEl.ownerDocument.defaultView as any).Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  dire(envois.length === 1, `changer le type déclenche UN envoi (${envois.length})`);
  const corps = envois[0]?.body || {};
  dire(String(envois[0]?.url).indexOf("/api/commitments/edit") >= 0, `il part sur ${envois[0]?.url}`);
  dire(Array.isArray(corps.components) && corps.components.length === comps.length,
    `il porte TOUTE la composition : ${corps.components?.length} composant(s), pas un delta`);
  dire(corps.components?.[0]?.type === s0.value, `le composant touché porte sa valeur neuve : « ${corps.components?.[0]?.type} »`);
  dire(corps.commitment_id === cid && corps.location_id === LOC, "l'engagement et le site sont dans le corps");

  // Le menu RÔLE : c'est celui qui ne sauvegardait pas. Les composants de la Cave sont « autre », un
  // type SANS rôle — c'est le changement de type ci-dessus qui vient de peupler sa liste. On teste donc
  // la rangée qu'on a typée, pas une au hasard.
  const rSels = [].slice.call(docEl.querySelectorAll("[data-eg-desc-role]")) as any[];
  const avecRole = rSels.filter((r: any) => r.options.length > 1)[0];
  if (avecRole) {
    avecRole.value = avecRole.options[1].value;
    avecRole.dispatchEvent(new (docEl.ownerDocument.defaultView as any).Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    dire(envois.length === 2, `changer le RÔLE enregistre aussi (${envois.length} envois au total)`);
    dire((envois[1]?.body?.components || []).some((c: any) => c.role === avecRole.value), `le rôle « ${avecRole.value} » est dans le corps`);
  } else {
    dire(false, "aucune liste de rôle peuplée — impossible de vérifier le point 4");
  }
}

// ── 2. le contexte indisponible : la rangée garde son texte ──────────────────────────────────────
{
  const { docEl, envois } = await jouer(() => Promise.reject(new Error("contexte indisponible")));
  const metas = [].slice.call(docEl.querySelectorAll("[data-eg-comp-meta]")) as any[];
  const sels = [].slice.call(docEl.querySelectorAll("[data-eg-desc-type]")) as any[];
  dire(sels.length === 0, "aucune liste posée quand le contexte manque");
  dire(metas.length === comps.length && metas.every((m: any) => String(m.textContent).trim().length > 0),
    `les ${metas.length} rangées gardent leur texte (ex. « ${String(metas[0]?.textContent).trim()} »)`);
  dire(envois.length === 0, "et rien n'est envoyé");
}

console.log(`\n  ${echecs === 0 ? "✓ tout est vert." : `✗ ${echecs} contrôle(s) en échec.`}\n`);
process.exit(echecs === 0 ? 0 : 1);
