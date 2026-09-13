// tools/oneoff/2026-09-13-proto-legende-photo.mts — LA LÉGENDE UNIQUE, À VOIR (owner 13/09 : « montre
// prototypes de légende unique : voir concrètement ce que ça donnera »).
//
// Écrit une page d'essai dans le SCRATCHPAD (jamais dans le dépôt : elle embarque les photos réelles du
// magasin d'un client, qui ne sont pas commitées). Trois densités — la vignette de l'historique du
// dispositif, la bande des cartes de Pulse, la photo ouverte du document du pôle — et trois variantes de
// légende à départager. Les images sont les VRAIES photos d'Épices et Tout, découpées par les MÊMES
// réglages que la prod (lib/dispositifs/dispositifPhotos : square 192, band 960×420, recadrage centre).
//
// Usage : npx tsx tools/oneoff/2026-09-13-proto-legende-photo.mts
import { readFileSync, writeFileSync } from "node:fs";
import * as vm from "node:vm";
import sharp from "sharp";
import { PHOTO_VARIANTS } from "../../src/lib/dispositifs/dispositifPhotos";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";

const RACINE = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/store_photos`;
const SORTIE = process.env.PROTO_OUT || "/tmp/proto-legende-photo.html";

// Trois composants réels, avec ce que la base porte vraiment sur une photo : le nom du composant (donné par
// l'exploitant, sinon composé « type — famille dominante »), son N° sur le plan, la version du dispositif,
// la date de la photo, le pôle, l'auteur.
const CAS = [
  { fichier: "Pôle Cuisine/Couteaux/IMG_0141.jpeg", nom: "Vitrine — Couteaux", type: "Vitrine", no: 27, version: 2, date: "12/09/2026", pole: "Cuisine", auteur: "Camille" },
  { fichier: "Pôle Epicerie sèche/Epices/IMG_0080.jpeg", nom: "Rayonnage — Épices", type: "Rayonnage", no: 8, version: 2, date: "12/09/2026", pole: "Épicerie sèche", auteur: "Camille" },
  { fichier: "Pôle Cave/Vin & Spiritueux/IMG_0121.jpeg", nom: "Rayonnage — Vin", type: "Rayonnage", no: null, version: 1, date: "10/09/2026", pole: "Cave", auteur: null },
];

const b64 = async (chemin: string, v: "square" | "band") => {
  const { width, height, quality } = PHOTO_VARIANTS[v];
  const buf = await sharp(chemin).rotate().resize({ width, height, fit: "cover", position: "center" }).webp({ quality }).toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
type Cas = (typeof CAS)[number] & { square: string; band: string };
const cas: Cas[] = [];
for (const c of CAS) cas.push({ ...c, square: await b64(`${RACINE}/${c.fichier}`, "square"), band: await b64(`${RACINE}/${c.fichier}`, "band") });

// Les trois variantes de légende. Même CONTENU partout (c'est le point : une seule grammaire), densités
// différentes selon la place disponible.
const meta = (c: Cas) => [c.date, c.pole, c.auteur].filter(Boolean).join(" · ");
const ident = (c: Cas) => [c.nom, c.no != null ? `N° ${c.no}` : null].filter(Boolean).join(" · ");
const VARIANTES = [
  {
    cle: "A", titre: "A — deux lignes : l'identité, puis la version et le reste",
    vignette: (c: Cas) => `<div class="l1">${esc(ident(c))}</div><div class="l2">Version ${c.version}</div>`,
    bande: (c: Cas) => `<span>${esc(ident(c))}</span><span>Version ${c.version} · ${esc(c.date)}</span>`,
    ouverte: (c: Cas) => `<div class="l1">${esc(ident(c))} · Version ${c.version}</div><div class="l2">${esc(meta(c))}</div>`,
  },
  {
    cle: "B", titre: "B — la version collée au nom, en gris",
    vignette: (c: Cas) => `<div class="l1">${esc(c.nom)} <span class="g">V${c.version}</span></div><div class="l2">${c.no != null ? `N° ${c.no} · ` : ""}${esc(c.date)}</div>`,
    bande: (c: Cas) => `<span>${esc(c.nom)} <span class="g">Version ${c.version}</span></span><span>${c.no != null ? `N° ${c.no} · ` : ""}${esc(c.date)}</span>`,
    ouverte: (c: Cas) => `<div class="l1">${esc(c.nom)} <span class="g">Version ${c.version}</span></div><div class="l2">${[c.no != null ? `N° ${c.no}` : null, meta(c)].filter(Boolean).join(" · ")}</div>`,
  },
  {
    cle: "C", titre: "C — le nom seul en vignette, tout le reste au survol",
    vignette: (c: Cas) => `<div class="l1">${esc(c.nom)}</div><div class="l2">${esc(c.date)}</div>`,
    bande: (c: Cas) => `<span>${esc(ident(c))}</span><span>${esc(c.date)}</span>`,
    ouverte: (c: Cas) => `<div class="l1">${esc(ident(c))} · Version ${c.version}</div><div class="l2">${esc(meta(c))}</div>`,
  },
];

const bloc = (v: (typeof VARIANTES)[number]) => `
<section>
  <h2>${esc(v.titre)}</h2>
  <div class="sous">Vignette — Historique du dispositif (72 px)</div>
  <div class="row">${cas.map((c) => `<figure class="vign"><img src="${c.square}" alt=""><figcaption>${v.vignette(c)}</figcaption></figure>`).join("")}</div>
  <div class="sous">Bande — carte famille de Pulse (16:7)</div>
  <div class="bandes">${cas.slice(0, 2).map((c) => `<div class="bande"><img src="${c.band}" alt=""><div class="cap">${v.bande(c)}</div></div>`).join("")}</div>
  <div class="sous">Photo ouverte — document du pôle</div>
  <div class="ouvertes">${cas.slice(0, 1).map((c) => `<div class="ouverte"><img src="${c.band}" alt=""><div class="meta">${v.ouverte(c)}</div></div>`).join("")}</div>
</section>`;

// ── LE RENDU RÉEL : le VRAI card-kit.js exécuté dans un vm, sur un payload de la forme que sert
// /api/commitments/evolution. Les adresses d'image sont remplacées par les photos réelles en data: — le
// reste (balises, styles, légende) est ce que la page produira. Le harnais EST la page.
const bac: any = { window: {}, console };
bac.window.window = bac.window;
vm.createContext(bac);
vm.runInContext(readFileSync("public/js/card-kit.js", "utf8"), bac, { filename: "card-kit.js" });
const photo = (c: Cas, v: number) => ({
  photo_id: c.fichier, component_key: "k" + v, label_fr: c.nom, label_court: c.nom.split(" — ").pop(),
  fixture_no: c.no, auteur: c.auteur, url: `MS_IMG_${CAS.indexOf(c as any)}`, created_at: c.date.split("/").reverse().join("-") + "T10:00:00Z",
});
const payload = {
  commitment: {
    commitment_id: "pole-1", status: "open", dispositif_nature: "permanent", dispositif_id: "d1", version_no: 2,
    committed_action_text: "Pôle Cuisine", pole_families: '["Couteaux"]', created_at: "2026-06-01T10:00:00Z",
    components: [
      { key: "k1", type: "vitrine", role: null, label: null, type_label_fr: "Vitrine", role_label_fr: "" },
      { key: "k2", type: "lineaire", role: null, label: null, type_label_fr: "Rayonnage", role_label_fr: "" },
    ],
  },
  pole: { totals: { rev30_eur: 24965, share_pct: 51.1, avg30_eur_day: 832, base_eur_day: 767, delta_pct: 8.5, n30: 30 }, families: [], operations: [] },
  lineage: [
    { commitment_id: "c-v1", version_no: 1, status: "resolved", verdict: null, window_start: "2026-06-01", window_end: "2026-08-31",
      effect_pct: null, effect_proven: false, kpi_mention_fr: "", is_current: false, photos: [photo(cas[2], 1)], photos_autres: 0 },
    { commitment_id: "pole-1", version_no: 2, status: "open", verdict: null, window_start: "2026-09-01", window_end: "2026-09-30",
      effect_pct: null, effect_proven: false, kpi_mention_fr: "", is_current: true, photos: [photo(cas[0], 2), photo(cas[1], 2)], photos_autres: 0 },
  ],
  series: [], kpi: null, move_stats: [], best_in_class: [], site_name: "Épices et Tout",
};
let rendu = String(bac.window.MSCardKit.renderEvolution(payload, EVOL_COPY));
cas.forEach((c, i) => { rendu = rendu.split(`MS_IMG_${i}?variant=square`).join(c.square).split(`MS_IMG_${i}`).join(c.band); });

const html = `<!doctype html><meta charset="utf-8"><title>Légende d'une photo — trois variantes</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0; padding: 28px 32px 60px; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; } .intro { color: #6B7280; font-size: 13px; margin-bottom: 26px; max-width: 70ch; line-height: 1.6; }
  section { border-top: 1px solid #e5e7eb; padding: 22px 0 6px; }
  h2 { font-size: 15px; margin: 0 0 14px; }
  .sous { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6B7280; margin: 16px 0 8px; }
  .row { display: flex; gap: 14px; flex-wrap: wrap; }
  .vign { margin: 0; width: 88px; } .vign img { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; display: block; }
  figcaption { font-size: 11px; line-height: 1.35; margin-top: 3px; color: #6B7280; }
  .l1 { color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .l2 { } .g { color: #9CA3AF; }
  .bandes { display: flex; gap: 16px; flex-wrap: wrap; }
  .bande { width: 430px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  .bande img { width: 100%; aspect-ratio: 960/420; object-fit: cover; display: block; }
  .cap { display: flex; justify-content: space-between; gap: 10px; padding: 7px 10px; font-size: 12px; color: #6B7280; }
  .cap span:first-child { color: #374151; }
  .ouverte { width: 560px; } .ouverte img { width: 100%; border-radius: 10px; border: 1px solid #e5e7eb; display: block; }
  .meta { padding: 8px 2px; font-size: 13px; } .meta .l1 { font-weight: 600; color: #111827; } .meta .l2 { color: #6B7280; font-size: 12px; margin-top: 2px; }
</style>
<h1>La légende d'une photo — une seule grammaire, trois densités</h1>
<div class="intro">Photos réelles d'Épices et Tout, découpées par les réglages de la production (vignette carrée 192 px, bande 960×420, recadrage au centre).
Le contenu est le même partout — nom du composant, N° sur le plan, version du dispositif, date, pôle, auteur ; seule la densité change selon la place.
Le troisième cas n'a ni N° ni auteur : une métadonnée inconnue s'omet, elle ne s'affiche jamais en tiret.</div>
${VARIANTES.map(bloc).join("")}
<section><h2>Le rendu RÉEL du kit (card-kit.js exécuté, légende A + nom court)</h2>
<div class="sous">Ce que la page d'un pôle affichera — historique du dispositif et bloc Composants</div>
<div style="max-width:760px;font-size:13px;">${rendu}</div></section>`;

writeFileSync(SORTIE, html);
console.log(`Écrit : ${SORTIE}`);
