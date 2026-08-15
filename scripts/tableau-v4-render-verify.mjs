// Vérité RENDU tableau V4 (NON COMMITTÉ) — le script inline réel de tableau.astro, exécuté dans
// happy-dom sur le payload RÉEL du compte owner (handler direct). La règle maison : le harnais
// EST la page. Usage : npx tsx scripts/tableau-v4-render-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as dashGET } from "../src/pages/api/insight/dashboard";

const PROJECT = "muse-square-open-data";
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 140) : ""));
  if (!cond) fails++;
};
const tick = () => new Promise((r) => setTimeout(r, 30));

// 1. Payload réel (365) via le handler direct.
const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`, params: { loc: OWNER_LOC }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
const locals = { clerk_user_id: uid, all_location_ids: locRows.map((r) => String(flat(r.location_id))) };
const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error("payload en erreur : " + payload.error);

// 2. Le script inline RÉEL de la page (2e <script is:inline>, celui sans src).
const astro = readFileSync(new URL("../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
const m = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/);
if (!m) throw new Error("script inline introuvable dans tableau.astro");
const src = m[1];

// 3. DOM + stubs.
const win = new Window({ url: "https://app.local/app/insightevent/tableau" });
const doc = win.document;
doc.body.innerHTML = '<div id="tb-root" data-loc=""><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
const fetchStub = (url) => Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("/api/insight/dashboard") >= 0 ? payload : { ok: false }) });
const fn = new Function("window", "document", "fetch", "alert", src);
fn(win, doc, fetchStub, () => {});
await tick();

const body = doc.getElementById("tb-body");
const txt = () => body.textContent;

// Dérivations attendues, calculées du payload lui-même (indépendant du jour de run).
const today = new Date();
const pad = (n) => (n < 10 ? "0" : "") + n;
const TODAY = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
const cutFor = (p) => new Date(Date.parse(TODAY + "T12:00:00Z") - p * 86_400_000).toISOString().slice(0, 10);
const gapFor = (p) => {
  const kept = payload.impact_rows.filter((r) => String(r.resolved_date || "") >= cutFor(p) && r.verdict !== "confounded");
  return kept.length ? kept.reduce((a, r) => a + (r.gap_eur || 0), 0) : null;
};
const eurTxt = (n) => (n >= 0 ? "+" : "−") + Math.abs(Math.round(n)).toLocaleString("fr-FR") + " €";

check("rendu sans « Chargement »", txt().indexOf("Chargement") < 0);
check("impact 30 j dérivé affiché", gapFor(30) == null ? txt().indexOf("— €") >= 0 : txt().indexOf(eurTxt(gapFor(30))) >= 0, eurTxt(gapFor(30) ?? 0));
check("cibles tenues (tuile impact)", txt().indexOf("cibles tenues") >= 0);

// ── Héros : 4 tuiles (refonte 13/08). ──
const g = payload.glance || {};
const oc = payload.occasions || {};
// Tuile 3 = PROCHAINE OCCASION (prospectif, € gated) — le rétrospectif 10/25 a disparu du héros.
check("tuile prochaine occasion (prospectif)", oc.next_hot
  ? (oc.heat_range ? txt().indexOf("jusqu’à") >= 0 && txt().indexOf("à récupérer — jour chaud") >= 0 : txt().indexOf("jour chaud annoncé") >= 0)
  : txt().indexOf("aucun jour d’environnement annoncé") >= 0);
check("plus de compteur rétrospectif au héros", txt().indexOf("occasions jouées") < 0);
// Tuile 4 = VEILLE en TROUVAILLES ; l'absence est dite.
const vLieux = (g.veille || {}).lieux || [];
const nTrv = (g.offres || []).length;
check("tuile veille = trouvailles (absence dite)", nTrv
  ? txt().indexOf("changement") >= 0
  : txt().indexOf("rien n’a bougé chez vos " + vLieux.length + " suivis") >= 0);
check("couverture PAR SITE (résumé Ma couverture)", (g.par_site || []).every((c) => txt().indexOf(c.n_suivis + "/" + c.n_total) >= 0));
check("jours en entier dans l'enjeu (jamais « votre jeu »)", txt().indexOf("votre jeu ") < 0);

// ── À FAIRE : verbe d'abord, seul bloc ouvert. ──
check("bloc À faire présent", txt().indexOf("À faire") >= 0);
const verbes = ["Documentez", "Préparez", "Ajustez", "Rendez", "Suivez", "Fixez", "Précisez", "Faire le bilan", "Importer", "Déclarer", "Engagez"];
check("rangées verbe d'abord", verbes.some((v) => txt().indexOf(v) >= 0));
if ((g.trous || []).length) check("trou de veille nommé (Suivez X)", txt().indexOf("Suivez " + g.trous[0].nom.slice(0, 20)) >= 0, g.trous[0].nom);
if ((g.savoir || {}).evts_sans_objectif) check("Fixez un objectif à N événements", txt().indexOf("Fixez un objectif à " + g.savoir.evts_sans_objectif) >= 0);
check("règle CTA : au plus UN bouton plein", body.querySelectorAll(".tb-btnp").length <= 1, body.querySelectorAll(".tb-btnp").length + " plein(s)");
check("radar = UNE surface (6 rangées .tb-rv)", body.querySelectorAll(".tb-rv").length === 6, body.querySelectorAll(".tb-rv").length + " rangées");
check("vignette-carte dans Événements concurrents", body.querySelector('[data-tb-body="ev"]') && body.querySelector('[data-tb-body="ev"]').innerHTML.indexOf("Ouvrir la carte") >= 0);

// ── Volets : l'en-tête EST la réponse. ──
["ev", "sv", "sf", "eq", "co"].forEach((id) => {
  check("volet " + id + " présent (fermé, chips en tête)", !!body.querySelector('[data-tb-volet="' + id + '"]') && body.querySelector('[data-tb-body="' + id + '"]').style.display === "none");
});
check("Événements concurrents — N sur 14 j", txt().indexOf("sur 14 j") >= 0);
check("À surveiller — menaces · occasions", /menace/.test(txt()) && /occasions/.test(txt()));
check("zéro donnée de cuisine (niv. N, priorité N, anglais mart)", txt().indexOf("niv.") < 0 && txt().indexOf("priorité ") < 0 && txt().indexOf("detected") < 0);

// ── À surveiller : € chaleur gated registre (règle inchangée). ──
body.querySelector('[data-tb-volet="sv"]').click(); await tick();
check("« à récupérer » SEULEMENT avec un € (registre)", !oc.next_hot ? true
  : oc.heat_range ? txt().indexOf("à récupérer") >= 0 && txt().indexOf("jusqu’à") >= 0
  : txt().indexOf("à récupérer") < 0 && txt().indexOf("pas encore chiffré") >= 0,
  "heat_range=" + JSON.stringify(oc.heat_range));

// ── Savoir-faire : apprentissages + dispositifs fusionnés. ──
body.querySelector('[data-tb-volet="sf"]').click(); await tick();
check("apprentissages (voix maison € d'abord)", payload.learnings.length ? txt().indexOf("Ce que l’app a appris") >= 0 && (txt().indexOf("perdus les ") >= 0 || txt().indexOf("gagnés les ") >= 0) : true);
check("état par ligne (M'engager / joué / en test / à défendre)", payload.learnings.length ? (txt().indexOf("M’engager") >= 0 || txt().indexOf("joué — dispositif") >= 0 || txt().indexOf("en test — verdict") >= 0 || txt().indexOf("à défendre") >= 0) : true);
check("dispositifs dans le même volet", txt().indexOf("Vos dispositifs") >= 0 && txt().indexOf("prouvé") >= 0);
check("provenance (types de jours chiffrés)", payload.learnings.length ? txt().indexOf("types de jours chiffrés") >= 0 : true);

// ── Ma couverture : veille + offres (absence DITE) + automatisations. ──
body.querySelector('[data-tb-volet="co"]').click(); await tick();
// Registre owner 14/08 : trouvailles d'abord, technique SEULEMENT cassé, zéro inventaire de crawl.
check("volet « Ma veille concurrentielle » (jamais « Ma couverture »)", txt().indexOf("Ma veille concurrentielle") >= 0 && txt().indexOf("Ma couverture") < 0);
check("zéro registre crawl (lieux visités / passage)", txt().indexOf("lieux visités") < 0 && txt().indexOf("jamais visité") < 0 && txt().indexOf("passage") < 0);
const vDefaut = vLieux.filter((v) => !(v.age_j != null && v.age_j <= 1)).length + (((g.veille || {}).sans_cle) || []).length;
check("technique seulement CASSÉ", vDefaut ? txt().indexOf("échappe à votre veille") >= 0 || txt().indexOf("suivi incomplet") >= 0 : txt().indexOf("échappe à votre veille") < 0);
if (!(g.offres || []).length && (g.offres_base || {}).n_tarifs) check("offres : absence DITE et chiffrée", txt().indexOf("rien n’a bougé") >= 0 && txt().indexOf(String(g.offres_base.n_tarifs) + " tarifs sous surveillance") >= 0);
check("Automatisations = rangée à part", body.querySelectorAll(".tb-rv").length === 6 && txt().indexOf("Automatisations") >= 0, body.querySelectorAll(".tb-rv").length + " rangées");

// ── Câblages purs (audit owner 15/08) : chaque geste aboutit à sa cible. ──
const rawHtml = body.innerHTML;
check("À surveiller : zéro « Voir » générique vers /pulse", rawHtml.indexOf('href="/app/insightevent/pulse">Voir') < 0);
if ((g.cartes || []).length) check("À surveiller : liens profonds insight?type=", rawHtml.indexOf("/app/insightevent/insight?type=") >= 0);
const trousWithKey = (g.trous || []).filter((t) => t.place_id);
if (trousWithKey.length) check("Suivre = bouton un-clic (clé présente)", rawHtml.indexOf("data-tb-follow=") >= 0);
if ((g.trous || []).some((t) => !t.place_id)) check("Suivre sans clé : repli chat conservé", rawHtml.indexOf("Suivre le concurrent") >= 0);
if (payload.debloquer && payload.debloquer.declared_no_replay) check("Prouver cible SON dispositif (data-tb-goto)", rawHtml.indexOf("data-tb-goto=") >= 0);
check("rangées dispositifs marquées par la clé", (payload.practices || []).some((pp) => pp.tier !== "archivee") ? rawHtml.indexOf("data-tb-prid=") >= 0 : true);

// ── Inc 3-5 (audit 15/08) : veille exploitable, registres purs, zéro soupe de tirets. ──
check("zéro « joués » à l'écran (mot banni)", txt().indexOf(" joués") < 0 && txt().indexOf("jouable") < 0);
if (rawHtml.indexOf("Préparer →") >= 0) check("Préparer porte mode=preparer (vue préparation, pas Évaluer)",
  Array.from(body.querySelectorAll("a")).some((aa) => String(aa.getAttribute("href") || "").indexOf("mode=preparer") >= 0));
check("événement concurrent : l'aléa météo du jour n'y est plus", (() => {
  // la rangée ev ne contient plus « annoncée » (l'aléa) — le mot reste permis ailleurs (occasion).
  const evBody = body.querySelector('[data-tb-body="ev"]');
  return evBody ? evBody.textContent.indexOf("annoncée") < 0 : true;
})());
if ((g.offres || []).length) {
  check("veille : chaque offre porte sa date de constat", txt().indexOf("vu le ") >= 0);
  check("veille : lien source quand l'URL existe", (g.offres || []).some((o) => o.src_url) ? rawHtml.indexOf("leur page →") >= 0 : true);
}
check("dispositifs : un seul statut de dernier test", txt().indexOf("dernier test non mesurable") < 0);
check("équipe : zéro rangée « — » fantôme", (() => {
  const eqBody = body.querySelector('[data-tb-body="eq"]');
  return eqBody ? eqBody.textContent.indexOf("tenue —") < 0 : true;
})());

// ── Interactions : bascule 90 j — dérivation instantanée + volet PRÉSERVÉ. ──
const btn90 = body.querySelector('[data-tb-period="90"]');
btn90.click(); await tick();
check("bascule 90 j : € dérivé", gapFor(90) == null ? txt().indexOf("— €") >= 0 : txt().indexOf(eurTxt(gapFor(90))) >= 0, eurTxt(gapFor(90) ?? 0));
check("bascule 90 j : volet sf TOUJOURS ouvert", body.querySelector('[data-tb-body="sf"]').style.display === "block");
const lect = body.querySelector("[data-tb-lect]");
if (lect) { lect.click(); await tick(); }
check("pli Lecture s'ouvre au clic", lect ? doc.getElementById("tb-lecture").style.display === "block" : true);

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT (" + body.querySelectorAll(".tb-card").length + " cartes rendues)");
process.exit(fails ? 1 : 0);
