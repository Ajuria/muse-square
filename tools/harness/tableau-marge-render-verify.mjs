// Vérité RENDU — marge brute mesurée sur le tableau de bord (11/09, docs/catalogue-de-couts-et-marge.md § 4.5).
// Le script inline RÉEL de tableau.astro, exécuté dans happy-dom : (1) sur le payload RÉEL du compte owner
// (aucun prix d'achat : quatre gestes « À faire », aucun bloc de marge) ; (2) sur le MÊME payload avec une
// marge mesurée, un résultat net et un seuil de rentabilité injectés (les blocs de la carte CA) ; (3) les panneaux
// inline s'ouvrent avec leurs champs. Le harnais EST la page. Usage : npx tsx tools/harness/tableau-marge-render-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";

const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
let fails = 0;
const check = (label, cond, detail) => { console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 160) : "")); if (!cond) fails++; };
const tick = () => new Promise((r) => setTimeout(r, 40));
// frInt rend l'espace des milliers en espace fine insécable (fr-FR) : on compare sur les chiffres, pas sur l'espace.
const hasEur = (t, n) => new RegExp(String(n).replace(/ /g, "[\\s\\u202f\\u00a0]") + "[\\s\\u202f\\u00a0]?€").test(t);
const frIntFr = (n) => Math.round(Number(n)).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");

const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365&location_id=" + OWNER_LOC), locals: { clerk_user_id: "harness", all_location_ids: [OWNER_LOC], location_id: OWNER_LOC } });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error("payload en erreur : " + payload.error);

const astro = readFileSync(new URL("../../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
const src = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/)[1];

async function render(p) {
  const win = new Window({ url: "https://app.local/app/insightevent/tableau?location_id=" + OWNER_LOC });
  const doc = win.document;
  doc.body.innerHTML = '<div id="tb-root" data-loc="' + OWNER_LOC + '"><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
  const calls = [];
  const fetchStub = (url, init) => { calls.push({ url: String(url), init }); return Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("/api/insight/dashboard") >= 0 ? p : { ok: true, value: 8500, parameter_id: "x" }) }); };
  new Function("window", "document", "fetch", "alert", "FormData", src)(win, doc, fetchStub, () => {}, win.FormData);
  await tick(); await tick();
  return { doc, body: doc.getElementById("tb-body"), calls };
}

// 1. Payload réel — l'état du compte owner tel qu'il est : sans prix d'achat (mode « aucune », jusqu'au 12/09) les
//    gestes sont là et aucun bloc de marge ; avec des prix d'achat (mode mesure / mixte — depuis le 12/09, prix
//    d'achat vraisemblables seed_test + base HT) le bloc de marge porte le chiffre réel et le geste prix d'achat
//    a disparu. Le harnais lit l'état, il ne le suppose pas.
{
  const { body } = await render(payload);
  const t = body.textContent;
  const mm = payload.marge_mesuree[0] || {};
  const mode = mm.mode;
  check("payload réel : un mode de marge décidé serveur", ["aucune", "estime", "mixte", "mesure"].includes(mode), mode);
  if (mode === "aucune" || mode === "estime") {
    check("geste prix d'achat rendu (mode " + mode + ")", t.indexOf("Importer vos prix d'achat") >= 0 && t.indexOf("débloque la marge brute") >= 0);
    check("aucun bloc « marge brute · 30 derniers jours » sans prix d'achat", t.indexOf("marge brute · 30 derniers jours") < 0);
  } else {
    check("mode " + mode + " : bloc « marge brute · 30 derniers jours » avec le chiffre réel", hasEur(t, frIntFr(mm.gross_margin_ht_30d)) && t.indexOf("marge brute · 30 derniers jours · calculée sur " + Math.round(mm.coverage_pct) + " % de votre CA") >= 0, t.slice(t.indexOf("marge brute"), t.indexOf("marge brute") + 90));
    check("mode " + mode + " : le geste prix d'achat passe en « modifiable à tout moment » (fait, jamais retiré)", t.indexOf("Importer vos prix d'achat — modifiable à tout moment") >= 0 && t.indexOf("débloque la marge brute") < 0);
  }
  const chargesKnown = mm.params && mm.params.fixed_costs_month_eur != null && mm.params.payroll_month_eur != null;
  if (chargesKnown) {
    check("charges déclarées : blocs « résultat net · <mois> » et « seuil de rentabilité du jour » rendus avec les chiffres réels",
      (mm.resultat_net && hasEur(t, frIntFr(mm.resultat_net.net_result_eur)) && t.indexOf("résultat net ·") >= 0) && (!mm.point_mort || t.indexOf("seuil de rentabilité du jour") >= 0),
      t.slice(t.indexOf("résultat net"), t.indexOf("résultat net") + 60));
    check("charges déclarées : plus de geste charges", t.indexOf("Déclarer vos charges fixes et votre masse salariale") < 0);
  } else check("geste charges rendu", t.indexOf("Déclarer vos charges fixes et votre masse salariale") >= 0 && t.indexOf("résultat net et le seuil de rentabilité") >= 0);
  check("geste surface rendu", t.indexOf("Déclarer votre surface de vente") >= 0 && t.indexOf("marge par m²") >= 0);
  const baseKnown = mm.params && mm.params.revenue_basis;
  check(baseKnown ? "base du CA connue (" + mm.params.revenue_basis + ") : geste base absent" : "geste base rendu", baseKnown ? t.indexOf("exporte le CA en HT ou en TTC") < 0 : t.indexOf("exporte le CA en HT ou en TTC") >= 0);
  if (!chargesKnown) check("aucun bloc résultat net / seuil de rentabilité sans paramètres", t.indexOf("résultat net ·") < 0 && t.indexOf("seuil de rentabilité du jour") < 0);
  check("le geste marge déclarée existant est toujours là (ADD, don't REPLACE)", t.indexOf("Déclarer votre marge") >= 0);
  // 3. Panneaux inline.
  const btnC = [...body.querySelectorAll("[data-tb-param]")].find((b) => b.getAttribute("data-tb-param") === "charges");
  if (btnC) { btnC.click(); await tick(); }
  const panC = body.querySelector('[data-tb-param-panel="charges"]');
  if (btnC) check("panneau charges : 2 montants + date d'effet", panC && panC.querySelectorAll("input").length === 3 && panC.textContent.indexOf("Charges fixes") >= 0 && panC.textContent.indexOf("Masse salariale") >= 0 && panC.textContent.indexOf("à partir du") >= 0);
  else check("panneau charges : absent parce que les charges sont déclarées", chargesKnown);
  const btnB = [...body.querySelectorAll("[data-tb-param]")].find((b) => b.getAttribute("data-tb-param") === "base");
  if (btnB) {
    btnB.click(); await tick();
    const panB = body.querySelector('[data-tb-param-panel="base"]');
    check("panneau base : HT / TTC", panB && panB.querySelectorAll('input[type="radio"]').length === 2);
  } else check("panneau base : absent parce que la base est connue", !!(mm.params && mm.params.revenue_basis));
  const btnP = [...body.querySelectorAll("[data-tb-param]")].find((b) => b.getAttribute("data-tb-param") === "prix");
  check("le geste prix d'achat garde son panneau (fait ou à faire)", !!btnP);
  if (btnP) {
    btnP.click(); await tick();
    const panP = body.querySelector('[data-tb-param-panel="prix"]');
    check("panneau prix d'achat : un champ fichier + Importer", panP && panP.querySelector('input[type="file"]') && panP.textContent.indexOf("Importer") >= 0);
  }
  if (panC) {
    panC.querySelector("[data-tb-param-save]").click(); await tick();
    check("charges sans chiffre : « Entrez un chiffre. »", panC.querySelector("[data-tb-param-msg]").textContent === "Entrez un chiffre.");
  }
}

// 2. Payload injecté : marge mesurée à 92 %, résultat net d'août, seuil de rentabilité atteint à 15 h.
{
  const p2 = JSON.parse(JSON.stringify(payload));
  p2.marge_mesuree = [{ location_id: OWNER_LOC, site_label: "Muse Square", revenue_30d: 53461, revenue_costed_30d: 49184, coverage_pct: 92, mode: "mesure", gross_margin_ht_30d: 19845.4, margin_rate_pct: 40,
    point_mort: { date: "2026-09-11", charges_day_eur: 661.3, break_even_revenue_ht: 1653, break_even_hour: 15, is_reached: true, gross_margin_ht: 720, coverage_pct: 92, opening_days_ref: 31 },
    resultat_net: { month: "2026-08-01", net_result_eur: 1234.6, coverage_pct: 92, gross_margin_ht: 21734, revenue_net_ht: 54000, fixed_costs_month_eur: 8500, payroll_month_eur: 12000, payroll_to_revenue_pct: 22 },
    params: { revenue_basis: "HT", revenue_basis_source: "declare", fixed_costs_month_eur: 8500, payroll_month_eur: 12000, sales_area_m2: 120 } }];
  p2.debloquer.prix_achat_missing = null; p2.debloquer.charges_missing = []; p2.debloquer.surface_missing = []; p2.debloquer.base_ca_missing = [];
  const { body } = await render(p2);
  const t = body.textContent;
  check("bloc marge brute mesurée : montant + « calculée sur 92 % de votre CA »", hasEur(t, "19 845") && t.indexOf("marge brute · 30 derniers jours · calculée sur 92 % de votre CA") >= 0);
  check("mode mesure : l'estimation « profit · 30 derniers jours » ne s'affiche plus", t.indexOf("profit · 30 derniers jours") < 0);
  check("bloc résultat net · août 2026", hasEur(t, "1 235") && t.indexOf("résultat net · août 2026") >= 0);
  check("bloc seuil de rentabilité du jour · atteint à 15 h", hasEur(t, "1 653") && t.indexOf("seuil de rentabilité du jour · atteint à 15 h") >= 0);
  check("geste prix d'achat à l'état d'entretien", t.indexOf("Importer vos prix d'achat — modifiable à tout moment") >= 0);
  check("plus de geste charges / surface / base quand tout est déclaré", t.indexOf("Déclarer vos charges fixes") < 0 && t.indexOf("Déclarer votre surface de vente") < 0 && t.indexOf("exporte le CA") < 0);
  // mixte : 70 % → les deux blocs, nommés
  const p3 = JSON.parse(JSON.stringify(p2)); p3.marge_mesuree[0].coverage_pct = 70; p3.marge_mesuree[0].mode = "mixte"; p3.marge_mesuree[0].revenue_costed_30d = 37423;
  const r3 = await render(p3); const t3 = r3.body.textContent;
  check("mode mixte : « prix d'achat manquants sur 30 % » + l'estimation déclarée reste", t3.indexOf("calculée sur 70 % de votre CA · prix d’achat manquants sur 30 %") >= 0 && t3.indexOf("profit · 30 derniers jours") >= 0);
}
console.log(fails ? `\n${fails} échec(s)` : "\nTout vert."); process.exit(fails ? 1 : 0);
