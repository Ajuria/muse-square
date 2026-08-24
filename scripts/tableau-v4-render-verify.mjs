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
// v11 : le compte d'objectifs a SA tuile (« Objectifs atteints ») — couvert par le bloc héros v11.

// ── HÉROS v11 (spec 24/08, docs/piloter-redesign-spec.md) : segments SITE + PÉRIODE,
// rangée santé = carte CA (chiffre/%/courbe sur UNE série ca_daily, référentiel dow+tendance),
// rangée pilotage = 4 tuiles (Impact · Objectifs · Signaux traités · Connaissances créées),
// répartition par site sous chaque chiffre. Assertions pilotées par le payload réel.
const g = payload.glance || {};
const oc = payload.occasions || {};
const vLieux = (g.veille || {}).lieux || [];
const frInt2 = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString("fr-FR");
check("v11 : segments SITE (Tous les sites + 1/site) et PÉRIODE (3)",
  body.querySelectorAll("[data-tb-site]").length === (payload.sites || []).length + 1
  && body.querySelectorAll("[data-tb-period]").length === 3,
  body.querySelectorAll("[data-tb-site]").length + " sites · " + body.querySelectorAll("[data-tb-period]").length + " périodes");
const T2 = Array.from(body.querySelectorAll(".tb-hero2 .tb-t2"));
const v11Titles = ["Impact mesuré de vos opérations", "Objectifs atteints", "Signaux traités", "Connaissances créées"];
check("v11 : rangée pilotage = 4 tuiles, titres arbitrés dans l'ordre",
  T2.length === 4 && v11Titles.every((t2, i2) => T2[i2] && T2[i2].textContent.indexOf(t2) >= 0),
  T2.length + " tuiles : " + T2.map((x) => x.querySelector(".tb-eb")?.textContent).join(" | "));
// Carte CA : mêmes calculs que la page (30 j par défaut) — chiffre, %, courbe, rapport.
{
  const cut30 = new Date(Date.parse(new Date().toISOString().slice(0, 10) + "T12:00:00Z") - 30 * 86_400_000).toISOString().slice(0, 10);
  const cad = (payload.ca_daily || []).filter((r) => r.d >= cut30);
  const byDay = {};
  let caSum = 0;
  cad.forEach((r) => { const e = byDay[r.d] = byDay[r.d] || { ca: 0, exp: 0, has: false }; e.ca += r.ca; if (r.exp != null) { e.exp += r.exp; e.has = true; } caSum += r.ca; });
  let pca = 0, pexp = 0;
  Object.values(byDay).forEach((e) => { if (e.has) { pca += e.ca; pexp += e.exp; } });
  const caPct = pexp > 0 ? Math.round((pca - pexp) / pexp * 1000) / 10 : null;
  check("carte CA : chiffre = Σ série de la période (encre, niveau non signé)",
    caSum > 0 ? txt().indexOf(frInt2(caSum) + " €") >= 0 : true, frInt2(caSum) + " €");
  if (caPct != null) check("carte CA : % signé avec son référentiel entier",
    txt().indexOf(String(Math.abs(caPct)).replace(".", ",") + " % vs votre résultat habituel") >= 0, caPct + " %");
  check("carte CA : mini-courbe réel + habituel pointillé (2 polylines)",
    body.querySelectorAll(".tb-card svg polyline").length >= 2);
  check("carte CA : Générer un rapport → (lien profond Consulter, q= pré-rempli)",
    !!Array.from(body.querySelectorAll("a.tb-link")).find((a) => /rapport/.test(a.textContent) && /prompt\?q=/.test(a.getAttribute("href") || "")));
  // N-1 : absence honnête DATÉE tant que < 12 mois de ventes.
  let firstSale = null;
  (payload.sales_depth || []).forEach((x) => { const f = String(x.first_sale || ""); if (f && (!firstSale || f < firstSale)) firstSale = f; });
  if (firstSale && new Date(firstSale) > new Date(Date.now() - 365 * 86_400_000))
    check("carte CA : N-1 en absence honnête datée", txt().indexOf("12 mois de ventes requis") >= 0);
  // Répartition PAR SITE (ordre fixe) sous le chiffre CA.
  if ((payload.sites || []).length > 1) {
    const bySite = {};
    cad.forEach((r) => { bySite[r.l] = (bySite[r.l] || 0) + r.ca; });
    check("carte CA : répartition par site présente (attribution, ordre fixe)",
      (payload.sites || []).every((s) => bySite[s.location_id] == null || txt().indexOf(frInt2(bySite[s.location_id]) + " €") >= 0));
  }
}
// Tuile Impact : delta signé coloré + « sur N fenêtres mesurées ».
{
  const gap30 = gapFor(30);
  if (gap30 != null) check("tuile Impact : € signé + fenêtres mesurées",
    txt().indexOf((gap30 >= 0 ? "+" : "−") + frInt2(gap30) + " €") >= 0 && / sur \d+ fenêtres? mesurées?/.test(txt()), gap30 + " €");
}
// Tuile Objectifs : k/n + chip « Seuils trop hauts ? » SEULEMENT dans le cas divergent.
{
  const objTile = T2.find((x) => x.textContent.indexOf("Objectifs atteints") >= 0);
  const gap30 = gapFor(30);
  const cut30 = new Date(Date.parse(new Date().toISOString().slice(0, 10) + "T12:00:00Z") - 30 * 86_400_000).toISOString().slice(0, 10);
  const jm = (payload.judged_meta || []).filter((m) => m.verdict !== "confounded" && String(m.created_d || "") >= cut30);
  const met = jm.filter((m) => /met|beat/i.test(String(m.verdict))).length;
  check("tuile Objectifs : k/n de la période", objTile && objTile.textContent.indexOf(met + "/" + jm.length) >= 0, met + "/" + jm.length);
  const divergent = gap30 != null && gap30 > 0 && jm.length > 0 && met === 0;
  check("chip « Seuils trop hauts ? » ssi € > 0 et 0 atteint", divergent === !!(objTile && objTile.textContent.indexOf("Seuils trop hauts ?") >= 0), "divergent=" + divergent);
}
// Tuile Signaux traités : % couvert/total du payload + jauge.
{
  const ls = payload.learnings || [];
  const tot = ls.reduce((a, l) => a + Math.abs(l.eur_year || 0), 0);
  const cov = ls.filter((l) => l.covered).reduce((a, l) => a + Math.abs(l.eur_year || 0), 0);
  if (tot > 0) check("tuile Signaux : % couvert/total + montants dits",
    txt().indexOf(Math.round(cov / tot * 100) + " %") >= 0 && txt().indexOf(frInt2(cov) + " € couverts sur " + frInt2(tot) + " €/an") >= 0, Math.round(cov / tot * 100) + " %");
}
// Tuile Connaissances créées (mot owner 24/08) : motifs + échelle des dispositifs.
{
  const ls = payload.learnings || [];
  const pc = payload.practice_counts || {};
  check("tuile Connaissances créées : N motifs chiffrés + prouvé/en test",
    txt().indexOf("Connaissances créées") >= 0
    && new RegExp(ls.length + "\\s*motifs? chiffrés?").test(txt())
    && new RegExp((pc.proven || 0) + " prouvés? · \\d+ en test").test(txt()));
}
check("couverture PAR SITE (résumé Ma couverture)", (g.par_site || []).every((c) => txt().indexOf(c.n_suivis + "/" + c.n_total) >= 0));
check("jours en entier dans l'enjeu (jamais « votre jeu »)", txt().indexOf("votre jeu ") < 0);

// ── À FAIRE : verbe d'abord, seul bloc ouvert. ──
check("bloc À faire présent", txt().indexOf("À faire") >= 0);
const verbes = ["Documentez", "Préparez", "Ajustez", "Rendez", "Suivez", "Fixez", "Précisez", "Faire le bilan", "Importer", "Déclarer", "Engagez"];
check("rangées verbe d'abord", verbes.some((v) => txt().indexOf(v) >= 0));
if ((g.trous || []).length) check("trou de veille nommé (Suivez X)", txt().indexOf("Suivez " + g.trous[0].nom.slice(0, 20)) >= 0, g.trous[0].nom);
if ((g.savoir || {}).evts_sans_objectif) check("Fixez un objectif à N événements → liste FILTRÉE (owner 18/08)", txt().indexOf("Fixez un objectif à " + g.savoir.evts_sans_objectif) >= 0
  && body.innerHTML.indexOf("/app/insightevent/evenement?filtre=sans_objectif") >= 0);
check("règle CTA : au plus UN bouton plein", body.querySelectorAll(".tb-btnp").length <= 1, body.querySelectorAll(".tb-btnp").length + " plein(s)");
check("grille des volets (24/08) : 7 cartes + panneau · Mon environnement APRÈS Processus métiers · Opportunités", (() => {
  const ok7 = body.querySelectorAll(".tb-rb").length === 7 && !!doc.getElementById("tb-rpanel");
  const iProc = txt().indexOf("Processus métiers"), iEnv = txt().indexOf("Mon environnement");
  return ok7 && iProc >= 0 && iEnv > iProc && txt().indexOf("Opportunités") >= 0
    && txt().indexOf("Compétitivité") < 0 && txt().indexOf("Vos prochaines occasions") < 0
    && !!Array.from(body.querySelectorAll(".tb-rb")).find((b) => b.textContent.indexOf("Veille") >= 0);
})(), body.querySelectorAll(".tb-rb").length + " cartes");
check("renommages : Activité dans votre périmètre · Mon positionnement · Mes dispositifs", txt().indexOf("Activité dans votre périmètre") >= 0 && txt().indexOf("Mon positionnement") >= 0 && txt().indexOf("Mes dispositifs") >= 0 && txt().indexOf("Vos dispositifs") < 0 && txt().indexOf("À surveiller") < 0 && txt().indexOf("Ma veille concurrentielle") < 0);
check("vignette-carte dans Événements concurrents", body.querySelector('[data-tb-body="ev"]') && body.querySelector('[data-tb-body="ev"]').innerHTML.indexOf("Ouvrir la carte") >= 0);

// ── Volets : l'en-tête EST la réponse. ──
["ev", "sv", "sf", "eq", "co"].forEach((id) => {
  // sv = panneau de la tuile Prochaine occasion (caché de la grille, corps présent).
  check("volet " + id + " : carte-résumé présente, fermé", !!body.querySelector('[data-tb-rb="' + id + '"]') && body.querySelector('[data-tb-body="' + id + '"]').style.display === "none");
});
check("Événements concurrents — N sur 14 j", txt().indexOf("sur 14 j") >= 0);
// Opportunités (24/08) : le résumé dit la prospective + couverture — les comptes
// menaces/occasions sont morts avec les rangées de cartes (renvoi Agir à la place).
check("Opportunités — prospective + couverture + renvoi Agir", (oc.total ? /couverts par une action/.test(txt()) : true)
  && txt().indexOf("les cartes des 7 prochains jours") >= 0);
check("zéro donnée de cuisine (niv. N, priorité N, anglais mart)", txt().indexOf("niv.") < 0 && txt().indexOf("priorité ") < 0 && txt().indexOf("detected") < 0);

// ── À surveiller : € chaleur gated registre (règle inchangée). ──
body.querySelector('[data-tb-rb="sv"]').click(); await tick();
check("« à récupérer » SEULEMENT avec un € (registre)", !oc.next_hot ? true
  : oc.heat_range ? txt().indexOf("à récupérer") >= 0 && txt().indexOf("jusqu’à") >= 0
  : txt().indexOf("à récupérer") < 0 && txt().indexOf("pas encore chiffré") >= 0,
  "heat_range=" + JSON.stringify(oc.heat_range));

// ── Savoir-faire : apprentissages + dispositifs fusionnés. ──
body.querySelector('[data-tb-rb="sf"]').click(); await tick();
check("apprentissages (voix maison € d'abord)", payload.learnings.length ? txt().indexOf("Ce que l’app a appris") >= 0 && (txt().indexOf("perdus les ") >= 0 || txt().indexOf("gagnés les ") >= 0) : true);
check("état par ligne (M'engager / joué / en test / à défendre)", payload.learnings.length ? (txt().indexOf("M’engager") >= 0 || txt().indexOf("couvert — dispositif en place") >= 0 || txt().indexOf("en test — verdict") >= 0 || txt().indexOf("à défendre") >= 0) : true);
check("dispositifs dans le même volet", txt().indexOf("Mes dispositifs") >= 0 && txt().indexOf("prouvé") >= 0);
check("provenance (types de jours chiffrés)", payload.learnings.length ? txt().indexOf("types de jours chiffrés") >= 0 : true);

// ── Ma couverture : veille + offres (absence DITE) + automatisations. ──
body.querySelector('[data-tb-rb="co"]').click(); await tick();
// Registre owner 14/08 : trouvailles d'abord, technique SEULEMENT cassé, zéro inventaire de crawl.
check("volet « Mon positionnement » (jamais « Ma couverture » ni « Ma veille »)", txt().indexOf("Mon positionnement") >= 0 && txt().indexOf("Ma couverture") < 0);
check("zéro registre crawl (lieux visités / passage)", txt().indexOf("lieux visités") < 0 && txt().indexOf("jamais visité") < 0 && txt().indexOf("passage") < 0);
const vDefaut = vLieux.filter((v) => !(v.age_j != null && v.age_j <= 1)).length + (((g.veille || {}).sans_cle) || []).length;
check("technique seulement CASSÉ", vDefaut ? txt().indexOf("échappe à votre veille") >= 0 || txt().indexOf("suivi incomplet") >= 0 : txt().indexOf("échappe à votre veille") < 0);
if (!(g.offres || []).length && (g.offres_base || {}).n_tarifs) check("offres : absence DITE et chiffrée", txt().indexOf("rien n’a bougé") >= 0 && txt().indexOf(String(g.offres_base.n_tarifs) + " tarifs sous surveillance") >= 0);
check("Automatisations = carte à part", !!body.querySelector('[data-tb-rb="au"]') && txt().indexOf("Automatisations") >= 0);

// ── Correctif 8 points (owner 17/08) — appliqué depuis le proto validé. ──
// Règle couleur streamlinée (owner 18/08) : vert/ambre = DELTAS mesurés (Impact, CA 7 j) ;
// parts et comptes = encre ; zéro = gris. Le signe suit : un delta porte +/-, une part jamais.
const heroNums = Array.from(body.querySelectorAll(".tb-hero2 .n2"));
const greensHero = heroNums.filter((n) => (n.getAttribute("style") || "").indexOf("#059669") >= 0);
// v11 : dans la rangée pilotage, le SEUL delta € est l'Impact — vert ssi positif.
const expectedGreens = (gapFor(30) != null && gapFor(30) >= 0 ? 1 : 0);
check("pilotage : verts = les deltas mesurés positifs, exactement", greensHero.length === expectedGreens, greensHero.length + " vs attendu " + expectedGreens);
check("pilotage : parts et comptes en encre (jamais bleu, jamais signés)", (() => {
  const sig = heroNums.find((n) => n.parentElement.textContent.indexOf("Signaux traités") >= 0);
  const obj = heroNums.find((n) => n.parentElement.textContent.indexOf("Objectifs atteints") >= 0);
  return (!sig || ((sig.getAttribute("style") || "").indexOf("#1D3BB3") < 0 && !/[+\u2212]/.test(sig.textContent)))
    && (!obj || !/[+\u2212]/.test(obj.textContent));
})());
// 2. CTA = verbe + flèche ≤ 14 caractères sur les gestes du correctif.
const ctaTexts = Array.from(body.querySelectorAll("a.tb-link"))
  .map((a) => (a.textContent || "").trim())
  .filter((t) => /→$/.test(t) && ["Dossier", "Ajuster", "Préparer", "Bilan", "Communiquer", "Comparer", "Automatiser", "Régler", "Prouver"].some((v) => t.indexOf(v) === 0));
check("CTA du correctif ≤ 14 caractères", ctaTexts.every((t) => t.replace(/\s*→$/, "").length <= 14), ctaTexts.filter((t) => t.replace(/\s*→$/, "").length > 14).join(" | ") || "tous courts");
// 2 bis. Bénéfice en sous-titre des rangées À faire (jamais la mécanique).
check("À faire : bénéfice sous le geste (réutilisable / consigne part / calibre la mesure)",
  txt().indexOf("réutilisable") >= 0 || txt().indexOf("consigne part") >= 0 || txt().indexOf("calibre la mesure") >= 0);
// 4-6. Positionnement COMPARATIF : badges humains + public vs vous + lignes de valeur NOMMÉES.
{
  const coBody = body.querySelector('[data-tb-body="co"]');
  const coTxt = coBody ? coBody.textContent : "";
  const fiches = payload.glance && (payload.glance.fiches || []);
  if (fiches && fiches.length) {
    check("positionnement : badge réputation humain (mieux notés / moyenne / moins bien noté)",
      /mieux notés|dans la moyenne|le moins bien noté/.test(coTxt));
    check("positionnement : public comparé À VOUS (même public / partiellement commun / différent)",
      /même public que vous|public partiellement commun|public différent du vôtre/.test(coTxt));
    check("positionnement : zéro méta (« chaque suivi est positionné » banni)", coTxt.indexOf("chaque suivi est positionné") < 0);
  }
  const gl = fiches ? fiches.find((f) => /GL Events/i.test(f.nom || "")) : null;
  if (gl) check("ligne de valeur 1 : GL Events nommé + geste (avis clients)", coTxt.indexOf("GL Events") >= 0 && coTxt.indexOf("demandez leurs avis à vos clients") >= 0);
  const gfRow = ((payload.glance && payload.glance.gap_facts) || []).filter((x) => x.item && x.share != null)[0];
  if (gfRow && gfRow.share < 0.1)
    check("ligne de valeur 2 : produit signature (best seller NOMMÉ + % CA)",
      coTxt.indexOf("produit signature") >= 0 && coTxt.indexOf(gfRow.item) >= 0 && coTxt.indexOf(Math.round(gfRow.share * 100) + " % de votre CA") >= 0, gfRow.item);
}
// 7. Dispositifs : le FAIT du dernier test sous chaque nom + UN SEUL geste par état.
{
  const sfBody = body.querySelector('[data-tb-body="sf"]');
  const sfHtml = sfBody ? sfBody.innerHTML : "";
  const sfTxt = sfBody ? sfBody.textContent : "";
  const practs = (payload.practices || []).filter((pp) => pp.tier !== "archivee");
  if (practs.length) {
    check("dispositifs : fait du dernier test (Testé du / Test lancé / Jamais testé)",
      /Testé du|Test lancé|Jamais testé/.test(sfTxt));
    check("dispositifs : phrase lexique (Prouvé = réutilisable)", sfTxt.indexOf("Prouvé = réutilisable") >= 0);
    const rows = Array.from(sfBody.querySelectorAll("[data-tb-prid]"));
    check("dispositifs : au plus UN geste par rangée (hors Désarmer)", rows.every((r) => {
      const links = Array.from(r.querySelectorAll("a.tb-link")).filter((a) => a.textContent.indexOf("Désarmer") < 0);
      return links.length <= 1;
    }), rows.map((r) => r.querySelectorAll("a.tb-link").length).join(","));
    check("dispositifs : zéro « rejouable » (owner : réutilisable)", sfHtml.indexOf("rejouable") < 0 && sfHtml.indexOf("se rejoue") < 0);
    // Multi-sites : chaque rangée dit SON site (pastille — règle de la page).
    if (payload.multi_site) {
      const lblOf = (lid) => ((payload.sites || []).find((sx) => sx.location_id === lid) || {}).label || "";
      const rows2 = Array.from(sfBody.querySelectorAll("[data-tb-prid]"));
      const practs2 = (payload.practices || []).filter((pp) => pp.tier !== "archivee").slice(0, 6);
      check("dispositifs : pastille site sur chaque rangée (multi-sites)",
        practs2.every((pp) => !lblOf(pp.location_id) || rows2.some((r) => r.textContent.indexOf(lblOf(pp.location_id)) >= 0)),
        practs2.map((pp) => lblOf(pp.location_id) || "?").join(","));
    }
  }
}
// 8. Automatisations : rangées QUOI + DÉCLENCHEUR, plus de journal Reçu/Programmé.
{
  const auBody = body.querySelector('[data-tb-body="au"]');
  const auTxt = auBody ? auBody.textContent : "";
  const hasAuto = (payload.automated && ((payload.automated.consignes || []).length || (payload.automated.armed_dispositifs || []).length)) || (payload.glance.mesures || []).some((m) => m.kind === "serie");
  if (hasAuto) {
    check("automatisations : chaque rangée porte son DÉCLENCHEUR", auTxt.indexOf("Déclencheur :") >= 0);
    check("automatisations : type dit (Mesure & verdict / Communication / Dispositif prêt à l’emploi)",
      /Mesure & verdict|Communication|Dispositif prêt à l’emploi/.test(auTxt));
    check("automatisations : le journal est mort (Reçu / Programmé)", auTxt.indexOf("Reçu") < 0 && auTxt.indexOf("Programmé") < 0);
  }
  // Retours owner 17/08 soir : noms de dispositifs CAPITALISÉS coupés AU MOT ; la rangée
  // « possible » porte son CTA Automatiser → vers le rang du dispositif (data-tb-goto).
  const nomSpans = auBody ? Array.from(auBody.querySelectorAll('span[style*="font-weight:600"]')).map((n) => (n.textContent || "").trim()).filter(Boolean) : [];
  check("automatisations : chaque nom commence par une capitale", nomSpans.every((n) => n.charAt(0) === n.charAt(0).toUpperCase()), nomSpans.filter((n) => n.charAt(0) !== n.charAt(0).toUpperCase()).join(" | ") || "tous");
  check("automatisations : zéro nom coupé mi-mot (… seulement après un mot entier)", nomSpans.every((n) => !/[^\s…]…$/.test(n) || / \S+…$/.test(n)), nomSpans.join(" | ").slice(0, 120));
  const hasCandidate = (payload.practices || []).some((pp) => pp.tier !== "archivee" && pp.armable && !pp.arm_enabled);
  if (hasCandidate) check("automatisations : rangée « possible » AVEC CTA Automatiser → (data-tb-goto)",
    auBody && auBody.innerHTML.indexOf("possible") >= 0 && Array.from(auBody.querySelectorAll("a[data-tb-goto]")).length >= 1);
  if (payload.multi_site && hasAuto) {
    const lblOf2 = (lid) => ((payload.sites || []).find((sx) => sx.location_id === lid) || {}).label || "";
    const wanted = ((payload.glance.mesures || []).filter((m) => m.kind === "serie").map((m) => m.site))
      .concat(((payload.automated || {}).consignes || []).map((c) => c.site_label))
      .concat(((payload.automated || {}).armed_dispositifs || []).map((a) => a.site_label))
      .filter(Boolean);
    check("automatisations : pastille site sur les rangées (multi-sites — régression réparée)",
      wanted.every((w) => auTxt.indexOf(w) >= 0), wanted.join(",") || "aucun label — rien à vérifier");
  }
}
// ── Fiche ENRICHIE (validé owner 17/08 soir) : panneau dépliable Offre · Publics · Actualité. ──
{
  const coBody3 = body.querySelector('[data-tb-body="co"]');
  const fAll3 = ((payload.glance || {}).fiches || []);
  if (fAll3.length) {
    const panels = coBody3 ? Array.from(coBody3.querySelectorAll("[data-tb-fiche-panel]")) : [];
    check("fiches : un panneau dépliable par fiche, fermé par défaut",
      panels.length === Math.min(fAll3.length, 8 * new Set(fAll3.map((f) => f.location_id)).size)
      && panels.every((p) => p.style.display === "none"), panels.length + " panneaux");
    const withActu = fAll3.find((f) => f.actu && (f.actu.mises || []).length);
    if (withActu) {
      const pn = coBody3.querySelector('[data-tb-fiche-panel="' + withActu.nom + '"]');
      check("fiche avec actu (" + withActu.nom.slice(0, 20) + "…) : les 3 sections + registre web",
        !!pn && pn.textContent.indexOf("Offre") >= 0 && pn.textContent.indexOf("Publics/Clients visés") >= 0
        && pn.textContent.indexOf("Actualité commerciale") >= 0 && pn.textContent.indexOf("Web — non vérifié") >= 0
        && pn.textContent.indexOf(withActu.actu.mises[0].titre.slice(0, 24)) >= 0);
      check("fiche avec actu : sources cliquables", !!pn && pn.querySelectorAll('a[href^="https://"]').length >= 1);
    }
    const withAna = fAll3.find((f) => f.analyse && f.analyse.value_prop);
    if (withAna) {
      const pn2 = coBody3.querySelector('[data-tb-fiche-panel="' + withAna.nom + '"]');
      check("fiche avec analyse : Proposition de valeur rendue", !!pn2 && pn2.textContent.indexOf("Proposition de valeur") >= 0);
    }
    const without = fAll3.find((f) => !f.actu);
    if (without) {
      const pn3 = coBody3.querySelector('[data-tb-fiche-panel="' + without.nom + '"]');
      check("fiche sans actu : absence DITE (jamais une section vide)", !!pn3 && pn3.textContent.indexOf("Pas encore lue") >= 0);
    }
    // Dépli réel : cliquer le chevron ouvre le panneau.
    const chev = coBody3 ? coBody3.querySelector("[data-tb-fiche]") : null;
    if (chev) {
      chev.click();
      const pn4 = coBody3.querySelector('[data-tb-fiche-panel="' + chev.getAttribute("data-tb-fiche") + '"]');
      check("clic chevron : le panneau s'ouvre", !!pn4 && pn4.style.display === "block");
    }
    check("fiche = UN CTA « Consulter → » vers le profil INTERNE (owner 17/08 : plus de lien externe direct)",
      fAll3.filter((f) => f.cid).every((f) => (coBody3 ? coBody3.innerHTML : "").indexOf("/app/insightevent/competitor?id=" + encodeURIComponent(f.cid)) >= 0)
      && (coBody3 ? coBody3.textContent : "").indexOf("Profil stratégique") < 0
      && !(coBody3 && Array.from(coBody3.querySelectorAll("a")).some((a) => /Consulter/.test(a.textContent) && /^https?:/.test(a.getAttribute("href") || "") && a.closest("[data-tb-fiche-panel]") == null)));
    check("recouvrement mesuré affiché quand le mart le porte", fAll3.some((f) => f.overlap_pct != null)
      ? (coBody3 ? coBody3.textContent : "").indexOf("Recouvrement mesuré") >= 0 : true);
  }
}
// Labels externes STREAMLINÉS (owner 17/08 soir) : lire une page externe = « Consulter → » partout.
check("fiches/offres : « Consulter → » (jamais « Sa page » ni « leur page »)",
  body.innerHTML.indexOf("Sa page \u2192") < 0 && body.innerHTML.indexOf("leur page \u2192") < 0 && body.innerHTML.indexOf("leur page →") < 0
  && (((payload.glance || {}).fiches || []).some((f) => f.url) ? body.innerHTML.indexOf("Consulter →") >= 0 : true));
// Multi-sites : toute comparaison se joue À L'INTÉRIEUR d'un site.
{
  const fAll = ((payload.glance || {}).fiches || []);
  const sites = Array.from(new Set(fAll.map((f) => f.location_id)));
  const coBody2 = body.querySelector('[data-tb-body="co"]');
  const coHtml2 = coBody2 ? coBody2.innerHTML : "";
  if (payload.multi_site && fAll.length)
    check("positionnement : sous-titre de SITE (compte multi-sites — on dit de quel site sont les suivis)",
      fAll.every((f) => !f.site || coHtml2.indexOf(f.site) >= 0), sites.length + " site(s)");
  // La ligne « produit signature » nomme les fiches DU MÊME SITE que la carte gap.
  const gfRow2 = ((payload.glance || {}).gap_facts || []).filter((x) => x.item && x.share != null && x.share < 0.1)[0];
  if (gfRow2) {
    const sameSite = fAll.filter((f) => f.location_id === gfRow2.location_id).sort((a, b) => (b.note || 0) - (a.note || 0)).slice(0, 2).map((f) => String(f.nom).split(" - ")[0]);
    check("ligne produit signature : concurrents nommés = suivis du MÊME site que la carte",
      sameSite.every((n) => (coBody2 ? coBody2.textContent : "").indexOf(n) >= 0), sameSite.join(" et "));
  }
}

// ── Câblages purs (audit owner 15/08) : chaque geste aboutit à sa cible. ──
const rawHtml = body.innerHTML;
check("À surveiller : zéro « Voir » générique vers /pulse", rawHtml.indexOf('href="/app/insightevent/pulse">Voir') < 0);
if ((g.cartes || []).length) check("À surveiller : liens profonds insight?type=", rawHtml.indexOf("/app/insightevent/insight?type=") >= 0);
const trousWithKey = (g.trous || []).filter((t) => t.place_id);
if (trousWithKey.length) check("Suivre = bouton un-clic (clé présente)", rawHtml.indexOf("data-tb-follow=") >= 0);
if ((g.trous || []).some((t) => !t.place_id)) check("Suivre sans clé : repli chat conservé", rawHtml.indexOf("Suivre le concurrent") >= 0);
if (payload.debloquer && payload.debloquer.declared_no_replay) check("Prouver cible SON dispositif (data-tb-goto)", rawHtml.indexOf("data-tb-goto=") >= 0);
check("rangées dispositifs marquées par la clé", (payload.practices || []).some((pp) => pp.tier !== "archivee") ? rawHtml.indexOf("data-tb-prid=") >= 0 : true);
if ((g.mesures || []).length) {
  check("Opérations en cours : section présente (proto 17/08)", txt().indexOf("Opérations en cours") >= 0 && body.querySelectorAll(".tb-op").length === (g.mesures || []).length, body.querySelectorAll(".tb-op").length + " cartes");
  const mSerie = (g.mesures || []).filter((m) => m.kind === "serie");
  // Grammaire 4 zones (spec 24/08) : la frise à symboles est morte — cases-résultats
  // auto-portantes + zone explication ; le € mène la fenêtre, KPI = ligne de contrat.
  if (mSerie.length) check("série : cases-résultats (verdict nommé, jamais de légende) + Dossier →",
    (txt().indexOf("objectif manqué") >= 0 || txt().indexOf("objectif atteint") >= 0 || txt().indexOf("Dispositif actif") >= 0)
    && rawHtml.indexOf('viewBox="0 0 330 46"') < 0 && txt().indexOf("petits points") < 0 && rawHtml.indexOf("Dossier \u2192") >= 0);
  if (mSerie.length && mSerie.some((m) => (m.occ || []).some((o) => !o.verdict && !o.status && o.d <= new Date().toISOString().slice(0, 10))))
    check("série : occurrence passée sans engagement = « passée sans mesure »", txt().indexOf("passée sans mesure") >= 0);
  const mOcc = (g.mesures || []).filter((m) => m.kind === "occurrence");
  if (mOcc.length) check("occurrence : jauge + Ajuster →", rawHtml.indexOf('viewBox="0 0 140 72"') >= 0);
  const mFen = (g.mesures || []).filter((m) => m.kind === "fenetre" && (m.daily || []).length >= 2);
  if (mFen.length) check("fenêtre : le € mène (écart signé + CA de la fenêtre) + ligne de contrat",
    txt().indexOf("CA de la fenêtre") >= 0 && txt().indexOf("objectif du dispositif") >= 0 && rawHtml.indexOf('viewBox="0 0 180 60"') < 0);
  check("CTA opérations : jamais « Évolution » (geste acté = Ajuster/Dossier)", (() => {
    const ops = Array.from(body.querySelectorAll(".tb-op"));
    return ops.every((o) => o.textContent.indexOf("\u00c9volution") < 0);
  })());
}

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
// Nouveau contrat (17/08) : UN volet ouvert à la fois — le DERNIER ouvert (co) survit à la bascule.
check("bascule 90 j : le volet ouvert (co) survit à la bascule", body.querySelector('[data-tb-body="co"]').style.display === "block" && body.querySelector('[data-tb-body="sf"]').style.display === "none");
const lect = body.querySelector("[data-tb-lect]");
if (lect) { lect.click(); await tick(); }
check("pli Lecture s'ouvre au clic", lect ? doc.getElementById("tb-lecture").style.display === "block" : true);

// ── Événements publics dans le volet « Activité dans votre périmètre » (19/08). ──
// Assertions dérivées du PAYLOAD lui-même (entonnoir serveur) — jamais de valeurs figées.
{
  const ep = (payload.glance || {}).evtpub || {};
  check("payload : evtpub présent (sites + evts)", Array.isArray(ep.sites) && Array.isArray(ep.evts), (ep.sites || []).length + " site(s) géo, " + (ep.evts || []).length + " évt(s)");
  const evVolet = body.querySelector('[data-tb-body="ev"]');
  const openEv = body.querySelector('[data-tb-rb="ev"]') || body.querySelector('[data-tb-volet="ev"]');
  if (openEv) { openEv.click(); await tick(); }
  const evTxt = evVolet ? evVolet.textContent : "";
  check("bloc « Événements publics autour de vous » rendu", evTxt.indexOf("Événements publics autour de vous") >= 0);
  // Comptes VRAIS serveur (n_zone/n14) — les lignes livrées sont plafonnées aux 100 plus proches.
  let zoneTot = 0;
  for (const cv of ep.sites || []) zoneTot += Number(cv.n_zone) || 0;
  // Chaque site géocodé porte son état : liste (zone > 0) OU absence dite (2 registres).
  for (const cv of ep.sites || []) {
    const zone = Number(cv.n_zone) || 0;
    if (zone > 0) continue;
    if (!cv.n30) check("absence dite (zone non couverte) pour un site à 0/30 j", evTxt.indexOf("n’est pas encore couverte") >= 0, cv.location_id.slice(0, 8));
    else check("absence dite (couverte, rien du secteur) pour un site sans zone", evTxt.indexOf("la zone est bien couverte") >= 0, cv.location_id.slice(0, 8) + " n30=" + cv.n30);
  }
  if (zoneTot > 0) {
    check("résumé de tuile : compte des événements publics au référentiel zone", evTxt.length > 0 && body.textContent.indexOf(zoneTot + " événement") >= 0, zoneTot + " attendus");
    check("filtre « Votre zone » affiché avec le rayon maison", /Votre zone · (1 km|20 km|500 m) \(/.test(evTxt));
    const beyondLink = evVolet.querySelector("[data-ep-beyond]");
    const beyondList = evVolet.querySelector("[data-ep-beyond-list]");
    if (beyondLink && beyondList) {
      check("« au-delà » caché d'office", beyondList.style.display === "none");
      beyondLink.click(); await tick();
      check("« au-delà » se déplie au geste", beyondList.style.display === "block" && beyondList.querySelectorAll("[data-ep-row]").length > 0, beyondList.querySelectorAll("[data-ep-row]").length + " rangée(s)");
    }
    const fltCommun = evVolet.querySelector('[data-ep-flt="commun"]');
    if (fltCommun) {
      fltCommun.click(); await tick();
      const list = evVolet.querySelector("[data-ep-list]");
      const shown = Array.from(list.querySelectorAll("[data-ep-row]")).filter((r) => r.style.display !== "none").length;
      const nCommunPayload = Number((fltCommun.textContent.match(/\((\d+)\)/) || [])[1] || 0);
      check("filtre publics : rangées affichées = compte du chip", shown === nCommunPayload, shown + " vs " + nCommunPayload);
      if (!nCommunPayload) check("filtre à zéro : l'absence est dite", list.textContent.indexOf("pas encore lus") >= 0);
    }
    // Un public LU porte sa chip au vocabulaire des fiches ; un public NON lu n'a jamais de chip.
    const anyRead = (ep.evts || []).some((e) => e.pub);
    if (anyRead) check("chip publics présente quand un public est lu", /(même public que vous|public partiellement commun|public différent du vôtre)/.test(evTxt));
    check("l'avancement de la lecture est dit", evTxt.indexOf("public lu") >= 0);
  }
}

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT (" + body.querySelectorAll(".tb-card").length + " cartes rendues)");
process.exit(fails ? 1 : 0);
