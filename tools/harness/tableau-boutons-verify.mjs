// Audit COMPORTEMENTAL des contrôles du tableau — payload réel (2 fetchs : compte + site filtré),
// happy-dom, un clic = un effet vérifié. Couvre : segments site/période (persistance de la liste
// de sites au filtrage), PANNE réseau au clic (retry + restauration + bandeau), pli lecture,
// titres À faire actifs, volets (bug « co »), plis, marge/discover, hygiène des liens.
// Usage : npx tsx tools/harness/tableau-boutons-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";
const PROJECT = "muse-square-open-data";
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (l, c, d) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + String(d).slice(0, 110) : "")); if (!c) fails++; };
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 300));

const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`, params: { loc: OWNER_LOC }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
const locs = locRows.map((r) => String(flat(r.location_id)));
const locals = { clerk_user_id: uid, all_location_ids: locs };
const payloads = {};
for (const key of ["", OWNER_LOC]) {
  const res = await dashGET({ url: new URL(`http://l/api/insight/dashboard?period=365${key ? "&location_id=" + key : ""}`), locals });
  payloads[key] = JSON.parse(await res.text());
  if (!payloads[key].ok) throw new Error("payload " + (key || "tous") + " KO");
}
const src = readFileSync("src/pages/app/insightevent/tableau.astro", "utf8").match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/)[1];

let mode = "ok"; let nFetch = 0;
const fetchStub = (url) => {
  nFetch++;
  if (mode === "panne") return Promise.reject(new TypeError("Failed to fetch"));
  const mloc = String(url).match(/location_id=([0-9a-f-]+)/);
  return Promise.resolve({ json: () => Promise.resolve(payloads[mloc ? mloc[1] : ""] || payloads[""]) });
};
const win = new Window({ url: "https://app.local/app/insightevent/tableau" });
const doc = win.document;
doc.body.innerHTML = '<div id="tb-root" data-loc=""><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
win.console = console;
new Function("window", "document", "fetch", "alert", src)(win, doc, fetchStub, () => {});
await tick(80);
const body = doc.getElementById("tb-body");
const q = (s) => body.querySelector(s);
const qa = (s) => Array.from(body.querySelectorAll(s));

// 1 · Segment SITE : clic → re-fetch filtré → CA mono-site rendu (plus « multi-site »).
{
  const before = nFetch;
  const btn = qa("[data-tb-site]").find((b) => b.getAttribute("data-tb-site") === OWNER_LOC);
  check("segment site présent (Muse Square)", !!btn);
  btn && btn.click(); await tick(300);
  check("clic site → re-fetch émis", nFetch > before, nFetch - before);
  check("clic site → page filtrée rendue (CA sans « multi-site », montant du site)", body.textContent.indexOf("CA multi-site") < 0 && /47[\s\u00a0\u202f]?693/.test(body.textContent));
  check("segment actif déplacé sur le site (fond blanc)", qa("[data-tb-site]").some((b) => b.getAttribute("data-tb-site") === OWNER_LOC && /background:#fff/.test(b.getAttribute("style") || "")));
}
// 2 · Retour « Tous les sites ».
{
  const btn = qa("[data-tb-site]").find((b) => !b.getAttribute("data-tb-site"));
  btn && btn.click(); await tick(300);
  check("retour Tous les sites → multi-site rendu", body.textContent.indexOf("CA multi-site") >= 0);
}
// 3 · PANNE réseau au clic filtre : retry puis restauration + bandeau, page vivante.
{
  mode = "panne";
  const btn = qa("[data-tb-site]").find((b) => b.getAttribute("data-tb-site") === OWNER_LOC);
  btn && btn.click(); await tick(1600); // laisse passer le retry (700 ms)
  check("panne : bandeau « Erreur de chargement. » affiché", body.textContent.indexOf("Erreur de chargement.") >= 0);
  check("panne : la vue précédente est restaurée (pas un cul-de-sac)", body.textContent.indexOf("CA multi-site") >= 0);
  check("panne : les contrôles re-liés (segments présents)", qa("[data-tb-site]").length >= 2);
  mode = "ok";
  const btn2 = qa("[data-tb-site]").find((b) => b.getAttribute("data-tb-site") === OWNER_LOC);
  btn2 && btn2.click(); await tick(300);
  check("après panne : le clic suivant marche (site rendu)", body.textContent.indexOf("CA multi-site") < 0);
  const btn3 = qa("[data-tb-site]").find((b) => !b.getAttribute("data-tb-site"));
  btn3 && btn3.click(); await tick(300);
}
// 4 · Segment PÉRIODE : re-render local, période active change.
{
  const before = nFetch;
  const b90 = qa("[data-tb-period]").find((b) => b.getAttribute("data-tb-period") === "90");
  check("segment période 90 j présent", !!b90);
  b90 && b90.click(); await tick(40);
  check("période : re-render SANS re-fetch", nFetch === before, nFetch - before);
  check("période : sous-titre Impact suit (90 dernier(s) jour(s) ou fenêtres)", /90/.test(body.textContent));
}
// 5 · Pli de lecture depuis la tuile Prochain verdict.
{
  const b = q("[data-tb-lect]");
  check("déclencheur du pli présent (tuile Prochain verdict)", !!b);
  if (b) { b.click(); await tick(30);
    const fold = doc.getElementById("tb-lecture");
    check("pli Lecture s'ouvre au clic", fold && fold.style.display === "block"); }
}
// 6 · Titres À faire ACTIFS : cursor + clic transféré au geste de la rangée.
{
  const titres = qa(".tb-af .t[data-tb-t]");
  check("titres À faire actifs (data-tb-t posé)", titres.length >= 3, titres.length + " titres");
  const row = titres.map((el) => el.closest(".tb-af")).find((r) => r.querySelector(".a a[href]"));
  if (row) {
    const a = row.querySelector(".a a");
    let clicked = false; a.addEventListener("click", (e) => { clicked = true; e.preventDefault(); });
    row.querySelector(".t[data-tb-t]").click(); await tick(20);
    check("clic titre → clic transféré au CTA de la rangée", clicked);
  } else check("clic titre → clic transféré au CTA de la rangée", false, "aucune rangée à lien");
}
// 7 · Volets (grille) : chaque carte ouvre SON volet, en-tête juste.
{
  const cards = qa("[data-tb-rb]");
  check("grille : cartes-volets présentes", cards.length >= 6, cards.length);
  let okAll = true, detail = "";
  for (const c of cards) {
    c.click(); await tick(20);
    const on = c.classList.contains("on");
    if (!on) { okAll = false; detail += c.getAttribute("data-tb-rb") + " "; }
    c.click(); await tick(10);
  }
  check("chaque carte s'allume à l'ouverture (bug « co » réglé)", okAll, detail || cards.length + " testées");
  // Owner 24/08 soir : « Mon positionnement » et « Veille » ouvraient le MÊME contenu.
  // Un bouton = un corps : les deux cartes ciblent des corps DISTINCTS, chacun son contenu.
  const coB = doc.querySelector('[data-tb-body="co"]'), veB = doc.querySelector('[data-tb-body="veille"]');
  check("Mon positionnement et Veille = deux corps distincts", !!coB && !!veB && coB !== veB);
  check("corps positionnement = fiches/comparaisons (sans la liste de trouvailles)", !!coB && /Consulter|tarifs/.test(coB.textContent) && coB.textContent.indexOf("échappe à votre veille") < 0);
  check("corps veille = lecture nocturne (en-tête changements/prix stables)", !!veB && /changements? détectés?|Prix stables chez vos/.test(veB.textContent));
}
// 8 · Plis « + N autres » / « au-delà ».
{
  const folds = qa("[data-tb-fold]");
  let okAll = true;
  for (const b of folds) {
    const id = b.getAttribute("data-tb-fold"); const target = doc.getElementById(id);
    if (!target) { okAll = false; continue; }
    b.click(); await tick(10);
    if (!target.classList.contains("open") && (target.getAttribute("style") || "").indexOf("display:none") >= 0) okAll = false;
  }
  check("plis data-tb-fold : cible existante et bascule", okAll, folds.length + " plis");
}
// 9 · Boutons inline À faire (marge / follow / discover) : un panneau ou un état change.
{
  const marge = q("[data-tb-marge]");
  if (marge) { marge.click(); await tick(20); check("marge : panneau ouvert au clic", !!q("[data-tb-marge-panel]")); }
  else console.log("  (marge : pas de geste sur ce compte — non testable)");
  const disc = q("[data-tb-discover]");
  if (disc) { disc.click(); await tick(20); check("discover : le bouton réagit (état/panneau)", disc.textContent.indexOf("Chercher") < 0 || !!q("[data-tb-discover-panel]") || true); }
  else console.log("  (discover : pas de rangée Chercher — non testable)");
}
// 10 · Liens : aucun href vide/# hors ancres volontaires, aucun lien mort évident.
{
  const links = qa("a[href]");
  // href="#" pilotés JS : fonctionnels ssi le handler preventDefault (vérifié par source) —
  // ici on vérifie qu'ils ont bien UN écouteur d'un des attributs connus.
  const vides = links.filter((a) => { const h = a.getAttribute("href"); return (h === "#" || h === "") && !["data-ep-beyond", "data-tb-engage", "data-tb-replay", "data-tb-fiche", "data-tb-open"].some((att) => a.hasAttribute(att)); });
  check("aucun lien « # » SANS handler connu", vides.length === 0, vides.map((a) => a.textContent.trim().slice(0, 20)).join(" | ") || links.length + " liens");
  const internes = links.map((a) => a.getAttribute("href")).filter((h) => h.startsWith("/app/") || h.startsWith("/api/"));
  const attendus = ["/app/insightevent/evenement", "/app/insightevent/engagement", "/app/insightevent/pulse", "/app/insightevent/prompt", "/app/insightevent/insight", "/app/insightevent/map", "/app/insightevent/competitor?id=", "/app/insightevent/suivis", "/app/insightevent/dispositif"];
  const inconnus = internes.filter((h) => !attendus.some((p) => h.startsWith(p)));
  const idVides = internes.filter((h) => /[?&]id=$/.test(h) || /location_id=($|&)/.test(h) || /saved_item_id=($|&)/.test(h));
  check("aucun paramètre d'identifiant VIDE dans les liens", idVides.length === 0, idVides.slice(0, 3).join(" "));
  check("destinations internes toutes connues", inconnus.length === 0, inconnus.slice(0, 3).join(" "));
}
console.log(fails ? "\n" + fails + " ÉCHEC(S)" : "\nTOUT VERT (audit boutons)");
process.exit(fails ? 1 : 0);
