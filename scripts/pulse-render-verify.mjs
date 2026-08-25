// Vérité RENDU de la page AGIR (pulse) — le script inline réel + les vrais modules public/
// (action-cards, reco-library…), exécutés en happy-dom sur le payload monitor RÉEL du compte
// owner (handler direct). La règle maison : le harnais EST la page. C'était la pièce manquante
// documentée (« pulse n'en a AUCUN, cause racine des dérives visuelles »).
// Usage : npx tsx scripts/pulse-render-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 140) : ""));
  if (!cond) fails++;
};
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 60));

// 1 · Payload monitor RÉEL (7 jours, light — les mêmes paramètres que la page).
const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const today = new Date();
const dates = [];
for (let i = 0; i < 7; i++) dates.push(new Date(today.getTime() + i * 86_400_000).toISOString().slice(0, 10));
const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
const res = await monitorGET({
  url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${dates.join(",")}&light=1`),
  locals,
});
const monitorPayload = JSON.parse(await res.text());
if (!monitorPayload.ok) throw new Error("payload monitor en erreur");
console.log("payload monitor : " + (monitorPayload.days || []).length + " jours · " + (monitorPayload.action_candidates || []).length + " candidates");

// 2 · Le script inline réel de pulse.astro + les modules public/ qu'il consomme.
const astro = readFileSync(new URL("../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
const inline = [...astro.matchAll(/<script is:inline(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
if (!inline || inline.length < 10000) throw new Error("script inline pulse introuvable");
const MODULES = ["ms-loader.js", "reco-library.js", "commit-form.js", "bp-form.js", "action-cards.js", "draft-workspace.js"];

// 3 · DOM + stubs réseau (chaque route répond sa forme vide sauf monitor/locations).
const win = new Window({ url: "https://app.local/app/insightevent/pulse" });
const doc = win.document;
doc.body.innerHTML = '<div id="pls-root"></div>';
win.localStorage.clear?.();
const locationsPayload = { ok: true, locations: [{ location_id: OWNER, company_name: "Muse Square" }] };
const fetchStub = (url) => {
  const u2 = String(url);
  let body = { ok: true };
  if (u2.includes("/api/insight/monitor")) body = monitorPayload;
  else if (u2.includes("/api/profile/locations")) body = locationsPayload;
  else if (u2.includes("/api/commitments")) body = { ok: true, commitments: [] };
  else if (u2.includes("/api/competitive/competitor-signals")) body = { ok: true, signals: [], followed_count: 0, followed_competitors: [], top_threats: [] };
  else if (u2.includes("/api/channels/config")) body = { ok: true, channels: [] };
  else if (u2.includes("/api/channels/team")) body = { ok: true, members: [] };
  else if (u2.includes("/api/analytics/card-states")) body = { ok: true, states: [] };
  else if (u2.includes("/api/analytics/list-drafts")) body = { ok: true, drafts: [] };
  else if (u2.includes("/api/analytics/pending-feedback")) body = { ok: true, pending: [] };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
};
win.fetch = fetchStub;
for (const m of MODULES) {
  const src = readFileSync(new URL("../public/" + m, import.meta.url), "utf8");
  new Function("window", "document", "fetch", src)(win, doc, fetchStub);
}
// Le script inline lit location_id/… depuis define:vars — on les fournit comme la page.
const boot = new Function("window", "document", "fetch", "location_id", "sessionStorage", "localStorage",
  "var locationId = location_id;\n" + inline);
boot(win, doc, fetchStub, OWNER, win.sessionStorage, win.localStorage);
await tick(600);
await tick(600);

const root = doc.getElementById("pls-root");
const txt = () => root.textContent;

// ── Assertions BASELINE (page actuelle) — étendues à chaque incrément du build. ──
check("rendu : la page peint (plus de racine vide)", root.innerHTML.length > 5000, root.innerHTML.length + " car.");
check("en-tête : « Vos actions du jour »", txt().includes("Vos actions du jour"));
check("bandeau 7 jours présent", root.querySelectorAll(".pls-col, .n7col").length >= 7, root.querySelectorAll(".pls-col, .n7col").length + " colonnes");
check("cartes système rendues", root.querySelectorAll(".ab-card").length >= 3, root.querySelectorAll(".ab-card").length + " cartes");
check("aucun « undefined » visible", !txt().includes("undefined"));
check("aucun « NaN » visible", !/\bNaN\b/.test(txt()));
// Le budget par catégorie (performance ≤ 5) peut légitimement écarter le créneau du rendu
// du jour — le contrat porte sur LA CARTE RENDUE : si elle l'est, son titre est spécifique.
check("titre créneau : format spécifique quand la carte est rendue", (() => {
  const t2 = txt();
  if (!/réneau/.test(t2)) return true;
  return /créneau \d+ h–\d+ h (surperforme|sous-performe|en hausse|en retrait)/i.test(t2)
    && !t2.includes("Bascule d’un créneau") && !/Créneau (sur|sous-)performant/.test(t2);
})());
check("CTA « M’engager » présent sur les cartes", txt().includes("M’engager"));

// ── Build v3.2 · Inc 1-2 : bandeau de FAITS + en-tête épuré. ──
const strip = root.querySelector(".pls-col") ? root : null;
check("bandeau : le SCORE est mort (aucun chiffre /10, aucune barre)", !root.querySelector(".pls-sc, .pls-ba, .pls-bar"));
check("bandeau : colonnes à FAITS (météo courte du payload)", (() => {
  const d0 = (monitorPayload.days || [])[0] || {};
  return d0.weather_label_fr ? txt().includes(d0.weather_label_fr) : true;
})());
// Inc B (owner 25/08 soir, point 1) : icône WMO + t° en gras sur CHAQUE jour porteur de météo.
check("bandeau : icône météo (svg .n7ico) sur chaque jour à weather_code", (() => {
  const withWx = (monitorPayload.days || []).filter((d) => d.weather_code != null).length;
  return root.querySelectorAll(".pls-col svg.n7ico").length >= withWx;
})(), root.querySelectorAll(".pls-col svg.n7ico").length + " icônes");
check("bandeau : température en gras (.n7temp)", (() => {
  const d0 = (monitorPayload.days || [])[0] || {};
  if (d0.temperature_2m_max == null) return true;
  const t0 = root.querySelector(".pls-col .n7temp");
  return !!t0 && t0.textContent.includes(Math.round(d0.temperature_2m_max) + "°");
})());
check("bandeau : période (vacances ≥ 3 j) en ligne unique avec échéance", (() => {
  const vac = (monitorPayload.days || []).filter((d) => d.vacation_name);
  if (vac.length < 3) return true;
  return !!root.querySelector(".n7period") && / jusqu’au |toute la semaine/.test(root.querySelector(".n7period").textContent);
})());
check("bandeau : affluence attendue du jour choisi (ft_* présents)", (() => {
  const d0 = (monitorPayload.days || [])[0] || {};
  if (d0.ft_peak_hour == null) return true;
  const aff = root.querySelector(".n7aff");
  return !!aff && aff.textContent.includes("affluence attendue") && aff.textContent.includes(Number(d0.ft_peak_hour) + " h");
})());
check("en-tête : pic attendu + PLUS de « Piloter → » ni d'« Objectif de la semaine »", (() => {
  const d0 = (monitorPayload.days || [])[0] || {};
  const okPic = d0.ft_peak_hour == null || txt().includes("pic attendu " + Number(d0.ft_peak_hour) + " h");
  return okPic && !txt().includes("Objectif de la semaine") && !/Piloter\s*→/.test(txt());
})());
check("clic-jour : data-pill-date conservé (mécanique de rechargement)", root.querySelectorAll("[data-pill-date]").length === 7);

// ── Build v3.2 · Inc 3-4 : médaillons FAMILLE + pied à deux gestes. ──
check("médaillons : teintes de FAMILLE (≥ 2 fonds distincts, plus le bleu unique)", (() => {
  const discs = [...root.querySelectorAll(".ab-card .ab-disc")];
  const bgs = new Set(discs.map((d) => (d.getAttribute("style") || "").match(/background:(#[0-9A-Fa-f]{6})/)?.[1]).filter(Boolean));
  return discs.length >= 3 && bgs.size >= 2;
})());
check("cartes système : « Pas pour moi » présent, « Communiquer »/« Déjà fait »/« Action menée ? » absents", (() => {
  const card = root.querySelector(".ab-card[data-ab-card-idx]");
  if (!card) return false;
  const t2 = txt();
  return t2.includes("Pas pour moi") && !t2.includes("Déjà fait") && !t2.includes("Action menée ?")
    && ![...root.querySelectorAll(".ab-card[data-ab-card-idx] button")].some((b) => b.textContent.trim() === "Communiquer");
})());

// ── Inc A (owner 25/08 soir, points 3+5) : minis courtes + paragraphe de faits structurel. ──
// 25/08 : la promotion en carte pleine est morte, la copie structurelle vit dans le BANDEAU.
// Le contrat suit le contenu — sans quoi il passerait à VIDE (un vert qui ne teste rien).
check("bandeaux : titre au VERBE sans chiffre, fait = forme C + €/j + jours/an", (() => {
  const bnds = [...root.querySelectorAll("[data-struct-key]")];
  if (!bnds.length) return true;
  const bad = bnds.filter((c) => {
    const title = c.querySelector(".ab-bnd-t")?.textContent || "";
    const fait = c.querySelector(".ab-bnd-f")?.textContent || "";
    return !/^(Mettez en place|Définissez|Identifiez|Ciblez)/.test(title) || /€/.test(title)
      || !/€ par jour/.test(fait) || !/jours par an/.test(fait);
  });
  if (bad.length) console.log("    " + JSON.stringify(bad.slice(0, 2).map((c) => (c.querySelector(".ab-bnd-t")?.textContent || "").slice(0, 50))));
  return bad.length === 0;
})(), root.querySelectorAll("[data-struct-key]").length + " bandeaux");
// ── Audit 2 (owner) : TOUS les titres au verbe — la liste des amorces est FERMÉE, un titre
// hors liste = FAIL (les formes-fait arbitrées 21-22/08 restent : CA supérieur/inférieur,
// trio « surperforme/sous-performe/en hausse/en retrait », comparatifs de note).
check("titres : CHAQUE titre rendu commence par un verbe (ou forme-fait arbitrée)", (() => {
  const VERB = /^(Adaptez|Préparez|Identifiez|Différenciez|Sécurisez|Capitalisez|Mettez|Réagissez|Protégez|Répondez|Renforcez|Contrez|Saisissez|Ciblez|Anticipez|Définissez|Amplifiez|Ajustez|Alertez|Activez|Prévenez|Profitez|Documentez|Analysez|Comparez|Choisissez|Reportez|Sollicitez|Demain)/;
  const FACT = /(surperforme|sous-performe|en hausse|en retrait)$|^CA (supérieur|inférieur)|est (mieux )?noté|êtes mieux noté|à égalité/;
  const titles = [...root.querySelectorAll(".ab-card[data-ab-card-idx] .ab-what, .ab-bnd-t")]
    .map((x) => (x.textContent || "").trim()).filter(Boolean);
  const bad = titles.filter((t) => !VERB.test(t) && !FACT.test(t));
  if (bad.length) console.log("    titres hors grammaire : " + JSON.stringify(bad));
  return bad.length === 0;
})());
check("fil unique : plus d'en-têtes de bloc par site, pilule SITE sur les rangées (vue compte)", (() => {
  if (root.querySelector("[data-t-block-site]")) return false;
  return root.querySelectorAll("[data-t-block]").length <= 1;
})());
check("fin de fil : « Vous êtes à jour — N cartes ce jour. » rendue SANS clic sur le tri", (() => {
  return /Vous êtes à jour — \d+ carte/.test(txt());
})());
check("minis du coin : jamais « chez vous · », jamais « vos jours de », structurelles réduites à perdus/à gagner", (() => {
  const subs = [...root.querySelectorAll(".amt-sub")].map((s) => s.textContent || "");
  if (subs.some((s) => s.includes("chez vous ·") || s.includes("vos jours de"))) return false;
  const structSubs = [];  // la mini structurelle a disparu avec la carte pleine (bandeau : le titre porte le motif)
  return structSubs.every((s) => s === "perdus" || s === "à gagner");
})());
check("rangées structurelles compactes : la métadonnée « N j / M mois » a quitté la sous-ligne", (() => {
  const rows = [...root.querySelectorAll("[data-struct-key]")];
  if (!rows.length) return true;
  return rows.every((r) => !/\d+ j \/ \d+ mois/.test(r.textContent || ""));
})());
// ── Inc E (owner 25/08 soir, point 4) : titres au VERBE, objet nommé (forme du créneau). ──
check("titres trio : « Produit surperformant »/« Famille sous-performante » morts, verbe + objet nommé", (() => {
  const titles = [...root.querySelectorAll(".ab-what")].map((x) => (x.textContent || "").trim());
  if (titles.some((t) => /^(Produit|Famille|Créneau) (sur|sous-)performant/.test(t))) return false;
  return titles.filter((t) => /^(Le produit|La famille) /.test(t))
    .every((t) => /(surperforme|sous-performe|en hausse|en retrait)$/.test(t));
})());
check("corps trio : le verdict ne se répète plus sous le titre (« a surperformé » mort du corps)", (() => {
  const bodies = [...root.querySelectorAll(".ab-card .ab-sowhat")].map((x) => x.textContent || "");
  return !bodies.some((b) => /(a surperformé|a sous-performé)/.test(b));
})());

// ── Inc D (owner 25/08 soir, point 2) : pied à deux gestes AUSSI sur les structurelles. ──
check("structurelles : « Pas pour moi » (data-struct-dispo) sur pleines ET compactes non engagées", (() => {
  const bnds = [...root.querySelectorAll("[data-struct-key]")];
  if (!bnds.length) return false;
  return bnds.every((c) => c.querySelector("[data-struct-dispo]") || c.querySelector("[data-struct-follow]"));
})(), root.querySelectorAll("[data-struct-dispo]").length + " boutons");
check("décomposition funnel structurelle : si présente, vocabulaire du créneau + référentiel nommé", (() => {
  const bodies = [...root.querySelectorAll(".ab-bnd-f")].map((x) => x.textContent || "");
  const withFunnel = bodies.filter((b) => /vient (des|du)/.test(b));
  return withFunnel.every((b) => /(Le manque vient|Le gain vient)/.test(b) && b.includes("vs vos jours comparables"));
})());

// ── Inc B (owner 25/08 soir) : fuite entre sites + pilule de rangée unique. ──
check("fuite entre sites : aucun corps ne nomme un site autre que celui de sa rangée", (() => {
  const labels = [...new Set([...root.querySelectorAll(".ab-card[data-t-site]")].map((c) => c.getAttribute("data-t-site")).filter(Boolean))];
  if (labels.length < 2) return true;
  const bad = [];
  for (const card of root.querySelectorAll(".ab-card[data-t-site]")) {
    const own = card.getAttribute("data-t-site");
    const body = [...card.querySelectorAll(".ab-sowhat, .aline")].map((x) => x.textContent || "").join(" ");
    for (const l of labels) if (l !== own && body.includes(l)) bad.push(own + " ← « " + l + " »");
  }
  if (bad.length) console.log("    " + JSON.stringify(bad.slice(0, 3)));
  return bad.length === 0;
})());
check("pilule de rangée : chaque carte datée porte « JJ/MM » (date toujours visible)", (() => {
  const cards = [...root.querySelectorAll(".ab-card[data-ab-card-idx]")];
  if (!cards.length) return false;
  const sansDate = cards.filter((c) => !/\d{2}\/\d{2}/.test(c.querySelector(".ab-meta")?.textContent || ""));
  if (sansDate.length) console.log("    " + sansDate.length + " carte(s) sans date");
  return sansDate.length === 0;
})());
check("pilule de rangée : les structurelles (pleines ET compactes) la rendent dans .ab-eur", (() => {
  const rows = [...root.querySelectorAll("[data-struct-key]")];
  if (!rows.length) return true;
  return rows.every((r) => !r.querySelector(".ab-eur") || r.querySelector(".ab-eur .ab-meta") || !r.querySelector(".ab-meta"));
})());

// ── Préfixe d'action UNIQUE (owner 25/08 : « Unifie les préfixes », puis « Chantier aussi »). ──
check("préfixe d'action : CHAQUE ligne d'action porte « Action(s) conseillée(s) : »", (() => {
  const lignes = [...root.querySelectorAll(".aline")].map((x) => (x.textContent || "").trim()).filter(Boolean);
  if (!lignes.length) return false;
  const hors = lignes.filter((l) => !/^Actions? conseillées? : /.test(l));
  if (hors.length) console.log("    " + JSON.stringify(hors.slice(0, 3).map((x) => x.slice(0, 60))));
  return hors.length === 0;
})(), root.querySelectorAll(".aline").length + " lignes");
check("préfixe d'action : aucun préfixe historique ne survit (16 + Chantier/Enquête)", (() => {
  const t2 = txt();
  return !/(À (faire|noter|pousser|adapter|capter|défendre|temporiser|réorienter|corriger|vérifier|analyser|consulter|exploiter|transmettre|amplifier|reproduire)|Chantier|Enquête) : /.test(t2);
})());

// ── Alignement des rangées (owner 25/08, 3e demande) : les TROIS familles partagent la
// grille. Contrat structurel (happy-dom ne fait pas de layout, donc on vérifie le SQUELETTE,
// pas les pixels — la mesure au navigateur est dans le commit : 35 rangées, eurRight 999,
// largeur 156, metaRight 999, discLeft 277, à l'unité près).
// DEUX FORMATS, pas un (owner 25/08) : CARTE (.ab-rgrid + .ab-eur) pour le conjoncturel,
// BANDEAU (.ab-bnd) pour les chantiers structurels — une ligne, pas de pied. Le contrat
// vérifie que chaque rangée est dans L'UN des deux, et jamais entre les deux.
check("format : cartes en .ab-rgrid + .ab-eur, chantiers compacts en .ab-bnd (jamais d'hybride)", (() => {
  const cartes = [...root.querySelectorAll(".ab-card[data-ab-card-idx]")];
  const horsCarte = cartes.filter((r) => !r.querySelector(":scope > .ab-rgrid > .ab-eur"));
  const bandeaux = [...root.querySelectorAll("[data-struct-key]")];
  const horsBandeau = bandeaux.filter((r) => !r.querySelector(":scope > .ab-bnd") || r.querySelector(".ab-rfoot"));
  if (horsCarte.length || horsBandeau.length) console.log("    " + horsCarte.length + " carte(s) hors grille · " + horsBandeau.length + " bandeau(x) hybrides");
  return horsCarte.length === 0 && horsBandeau.length === 0;
})(), root.querySelectorAll(".ab-card[data-ab-card-idx]").length + " cartes · " + root.querySelectorAll("[data-struct-key]").length + " bandeaux");
// LOCATION À DROITE (owner 25/08, exigence répétée) : dans les deux formats, l'encre du
// libellé de site tombe sur le bord droit — happy-dom ne fait pas de layout, donc le contrat
// porte sur l'ABSENCE de retrait ; la mesure pixel est au navigateur (35 rangées à 949).
check("location : rendue à droite dans les deux formats, sans retrait", (() => {
  const sites = [...root.querySelectorAll(".ab-eur .ab-meta, .ab-bnd-site")];
  if (!sites.length) return false;
  return sites.every((s) => !/padding-right\s*:\s*[1-9]/.test(s.getAttribute("style") || ""));
})(), root.querySelectorAll(".ab-eur .ab-meta, .ab-bnd-site").length + " libellés");
check("alignement : les chantiers compacts vivent dans le conteneur encadré [data-t-struct]", (() => {
  const compacts = [...root.querySelectorAll("[data-struct-key]")];
  if (!compacts.length) return true;
  return compacts.every((c) => c.closest("[data-t-struct]"));
})());

// ── Fin de la promotion structurelle + pli à quota par site (owner 25/08, options 1 + 3). ──
check("promotion structurelle MORTE : aucun motif de fond en carte pleine dans le fil", (() => {
  return root.querySelectorAll("[data-struct-full]").length === 0;
})());
check("pli : chaque site présent dans le pli avec au moins 2 cartes (multi-sites)", (() => {
  const vis = [...root.querySelectorAll(".ab-card[data-ab-card-idx]")].filter((c) => !c.hasAttribute("data-t-folded"));
  const tous = [...new Set([...root.querySelectorAll(".ab-card[data-ab-card-idx]")].map((c) => c.getAttribute("data-t-site") || ""))];
  if (tous.length < 2) return vis.length > 0;                     // mono-site : pli simple
  const parSite = {};
  vis.forEach((c) => { const s2 = c.getAttribute("data-t-site") || ""; parSite[s2] = (parSite[s2] || 0) + 1; });
  const manquants = tous.filter((s2) => (parSite[s2] || 0) < 2);
  if (manquants.length) console.log("    sites sous quota : " + JSON.stringify(manquants));
  return manquants.length === 0;
})(), root.querySelectorAll(".ab-card[data-ab-card-idx]:not([data-t-folded])").length + " cartes visibles");
check("pli : la carte du PÉRIMÈTRE reste atteignable sans déplier", (() => {
  const q = root.querySelector("[data-catchment-amt]");
  if (!q) return true;
  const card = q.closest(".ab-card");
  return !!card && !card.hasAttribute("data-t-folded");
})());

// ── « Voir plus » des chantiers (owner 25/08 : « n'affiche rien »). Le bouton doit relire le
// DOM au clic : renderStructuralSection() remplace chaque bandeau quand le fetch des
// engagements retombe, et un tableau capturé pointe alors des nœuds détachés.
check("chantiers : « Voir plus » déplie ET replie (le handler relit le DOM)", (() => {
  const rows = [...root.querySelectorAll("[data-struct-key]")];
  const btn = [...root.querySelectorAll("[data-t-more]")].find((b) => /chantier/i.test(b.textContent || ""));
  if (!btn) return rows.length <= 3;                       // pas de pli : rien à déplier
  const vis = () => rows.filter((r) => r.style.display !== "none").length;
  const avant = vis();
  btn.click();
  const ouvert = vis();
  btn.click();
  const referme = vis();
  if (!(ouvert === rows.length && referme === avant)) console.log("    " + avant + " → " + ouvert + " → " + referme + " sur " + rows.length);
  return ouvert === rows.length && referme === avant;
})(), root.querySelectorAll("[data-struct-key]").length + " bandeaux");

// ── Variante 2 (owner 25/08) : un motif = une ligne, sites regroupés, dépliage par site. ──
check("groupes : aucun ne mélange les sens (étendue jamais à cheval sur zéro)", (() => {
  const grps = [...root.querySelectorAll("[data-struct-group]")];
  if (!grps.length) return true;
  const bad = grps.filter((g) => {
    const f = g.querySelector(".ab-bnd-f")?.textContent || "";
    return /−/.test(f) && /\+/.test(f);          // un moins ET un plus dans la même étendue
  });
  if (bad.length) console.log("    " + bad.length + " groupe(s) à cheval sur zéro");
  return bad.length === 0;
})(), root.querySelectorAll("[data-struct-group]").length + " groupes");
check("« Choisir le site » déplie les rangées par site, chacune avec ses gestes", (() => {
  const btn = root.querySelector("[data-struct-expand]");
  if (!btn) return true;                          // mono-site : aucun groupe, rien à déplier
  const gkey = btn.getAttribute("data-struct-expand");
  const sub = root.querySelector('[data-struct-sub="' + gkey + '"]');
  btn.click();
  const rows = [...sub.querySelectorAll("[data-struct-key]")];
  const ok = sub.style.display === "block" && rows.length >= 2
    && rows.every((r) => r.querySelector("[data-struct-commit]") || r.querySelector("[data-struct-follow]"));
  btn.click();                                    // et il replie
  return ok && sub.style.display === "none";
})());

console.log(fails ? "\n" + fails + " ÉCHEC(S)" : "\nTOUT VERT (harnais pulse)");
process.exit(fails ? 1 : 0);
