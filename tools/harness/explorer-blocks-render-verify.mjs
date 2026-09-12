// Vérité RENDU — les blocs des outils de l'agent Explorer (12/09, docs/explorer-outil-spec.md § 5, § 8 « un harnais
// par type de bloc »). Le VRAI public/js/card-kit.js (renderAnswerBlocks) exécuté dans happy-dom sur les blocs que
// LES libs rendent depuis le compte de test owner (f10c3e58) : lire_ventes (deux tableaux), lire_resultat (tableau des
// mois + fait du seuil), lire_poles_classement (tableau par CA, tableau par m²), et l'absence sur une période sans
// vente. Le harnais EST la surface : mêmes blocs que la réponse de /api/explorer/agent, même kit que le proto.
// Usage : npm run harness:explorer-blocks
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { computeSalesReport, composeVentesFacts, resolvePeriode } from "../../src/lib/rapport/ventes";
import { readResultat, composeResultatFacts } from "../../src/lib/kpi/resultat";
import { readPoleClassement, composePoleClassement } from "../../src/lib/dispositifs/poleClassement";
import { assembleAnswerBlocks, groundAgentText } from "../../src/lib/explorer/blocks";

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
let fails = 0;
const check = (label, cond, detail) => { console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 160) : "")); if (!cond) fails++; };
const nb = (s) => String(s).replace(/[  ]/g, " ");
const frInt = (n) => nb(Math.round(Math.abs(Number(n) || 0)).toLocaleString("fr-FR"));

// Le kit, tel qu'il est servi : l'IIFE pose window.MSCardKit.
const win = new Window({ url: "https://app.local/app/insightevent/prompt" });
new Function("window", "document", readFileSync(new URL("../../public/js/card-kit.js", import.meta.url), "utf8"))(win, win.document);
const kit = win.MSCardKit;
check("le kit expose renderAnswerBlocks", typeof kit?.renderAnswerBlocks === "function");
function render(blocks) {
  const el = win.document.createElement("div");
  el.innerHTML = kit.renderAnswerBlocks(blocks);
  return el;
}
const tables = (el) => [...el.querySelectorAll("table")].map((t) => ({
  cols: [...t.querySelectorAll("th")].map((x) => nb(x.textContent)),
  rows: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => nb(td.textContent))),
}));

const bq = makeBQClient("muse-square-open-data");
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

// 1. lire_ventes — 30 derniers jours : deux tableaux, la pastille, les cellules = les chiffres du rapport.
{
  const p = resolvePeriode({}, today);
  const res = await computeSalesReport(bq, { location_id: LOC, owned: [LOC], start: p.start, end: p.end });
  const l = composeVentesFacts(res);
  check("lire_ventes : le compte de test vend sur " + p.libelle_fr, l.found, JSON.stringify(res.body).slice(0, 80));
  const g = groundAgentText(l.facts.join(" "), l.facts);
  const el = render(assembleAnswerBlocks([l.blocks], g));
  const t = tables(el);
  check("pastille « Vérifié · N faits cités »", /Vérifié · \d+ faits? cités?/.test(el.textContent));
  check("deux tableaux rendus (les trois couches ; le mix par famille)", t.length === 2, t.length);
  check("tableau 1 : colonnes « », période, « Période précédente », « Écart »", t[0]?.cols[1]?.startsWith("Du ") && t[0]?.cols[2] === "Période précédente" && t[0]?.cols[3] === "Écart", JSON.stringify(t[0]?.cols));
  const s = res.body.summary;
  check("ligne « Chiffre d’affaires » = le CA du rapport (" + frInt(s.revenue) + " €)", t[0]?.rows[0]?.[0] === "Chiffre d’affaires" && t[0]?.rows[0]?.[1] === frInt(s.revenue) + " €", JSON.stringify(t[0]?.rows[0]));
  check("ligne « Nombre de ventes » = les ventes du rapport (" + frInt(s.transactions) + ")", t[0]?.rows[1]?.[1] === frInt(s.transactions), JSON.stringify(t[0]?.rows[1]));
  check("ligne « Panier moyen » en € à deux décimales", /^\d+,\d{2} €$/.test(t[0]?.rows[2]?.[1] || ""), t[0]?.rows[2]?.[1]);
  check("tableau 2 : « Mix produits & services » avec une ligne par famille (" + res.body.category_mix.length + ")", t[1]?.cols[0] === "Mix produits & services" && t[1]?.rows.length === res.body.category_mix.length, JSON.stringify(t[1]?.cols));
  check("sources dépliables présentes", el.querySelector("details summary")?.textContent === "Sources");
}
// 2. lire_ventes — une période sans vente : l'absence, pas un tableau vide.
{
  const res = await computeSalesReport(bq, { location_id: LOC, owned: [LOC], start: "2019-01-01", end: "2019-01-07" });
  const l = composeVentesFacts(res);
  check("période 2019 : rien à lire", !l.found && res.body.error === "NO_DATA");
  const el = render([{ type: "register", register: "vetted", facts_cited: 0 }, { type: "absence", manque: "Aucune vente du 01/01/2019 au 07/01/2019.", geste: null }]);
  check("absence rendue en clair, aucun tableau", el.textContent.includes("Aucune vente du 01/01/2019 au 07/01/2019.") && !el.querySelector("table"));
}
// 3. lire_resultat — le dernier mois complet : tableau des mois, le fait du seuil.
{
  const r = await readResultat(bq, LOC);
  const l = composeResultatFacts(r);
  check("lire_resultat : un résultat net lisible sur le compte de test (charges déclarées 6 500 € / 17 000 €)", l.found, l.absence);
  const el = render(assembleAnswerBlocks([l.blocks], groundAgentText(l.facts.join(" "), l.facts)));
  const t = tables(el);
  check("tableau des mois : colonnes Mois · CA net HT · Marge brute · Charges fixes · Masse salariale · Résultat net", JSON.stringify(t[0]?.cols) === JSON.stringify(["Mois", "CA net HT", "Marge brute", "Charges fixes", "Masse salariale", "Résultat net"]), JSON.stringify(t[0]?.cols));
  const dernier = r.mois.filter((m) => m.is_complete_month && m.net_result_eur != null)[0];
  check("première ligne = le dernier mois complet, résultat net " + (dernier ? frInt(dernier.net_result_eur) + " €" : "—"), !!dernier && t[0]?.rows[0]?.[5] === (dernier.net_result_eur < 0 ? "−" : "") + frInt(dernier.net_result_eur) + " €", JSON.stringify(t[0]?.rows[0]));
  check("le seuil de rentabilité du jour rendu en fait (« atteint à N h » ou « n'est pas atteint »)", /seuil de rentabilité du jour/.test(el.textContent) && /(atteint à \d+ h|n'est pas atteint|il est atteint)/.test(el.textContent));
}
// 4. lire_poles_classement — par CA sur 30 jours, puis par m² : un tableau, une ligne par pôle, l'ordre décroissant.
{
  const p = resolvePeriode({}, today);
  const d = await readPoleClassement(bq, LOC, p.start, p.end);
  const l = composePoleClassement(d, "ca", "sur " + p.libelle_fr);
  check("lire_poles_classement : des pôles vendus sur le compte de test (7 déclarés le 12/09)", l.found && d.rows.length >= 1, d.rows.length);
  const el = render(assembleAnswerBlocks([l.blocks], groundAgentText(l.facts.join(" "), l.facts)));
  const t = tables(el);
  check("tableau : Pôle · CA · Part du CA · Écart au résultat habituel · Jours vendus", JSON.stringify(t[0]?.cols) === JSON.stringify(["Pôle", "CA", "Part du CA", "Écart au résultat habituel", "Jours vendus"]), JSON.stringify(t[0]?.cols));
  const vendus = d.rows.filter((r) => r.revenue > 0 || r.units > 0);
  check("une ligne par pôle vendu (" + vendus.length + ")", t[0]?.rows.length === vendus.length, t[0]?.rows.length);
  const vals = (t[0]?.rows || []).map((r) => Number(r[1].replace(/[^\d]/g, "")));
  check("classé du plus au moins performant", vals.every((v, i) => i === 0 || v <= vals[i - 1]), vals.join(" ≥ "));
  check("première ligne = le pôle au plus fort CA (" + vendus[0]?.pole_label + ")", t[0]?.rows[0]?.[0] === vendus[0]?.pole_label, t[0]?.rows[0]?.[0]);
  const m2 = composePoleClassement(d, "ca_par_m2", "x");
  check("par m² : lisible quand les surfaces sont mesurées (308,71 m² depuis le 12/09), sinon l'absence dite", m2.found || m2.absence === "aucune_mesure", m2.absence);
  if (m2.found) {
    const t2 = tables(render(assembleAnswerBlocks([m2.blocks], groundAgentText(m2.facts.join(" "), m2.facts))));
    check("tableau par m² : Pôle · CA par m² · Surface de vente · Part du CA · Part de linéaire", JSON.stringify(t2[0]?.cols) === JSON.stringify(["Pôle", "CA par m²", "Surface de vente", "Part du CA", "Part de linéaire"]), JSON.stringify(t2[0]?.cols));
    check("surface en m² sur chaque ligne", t2[0]?.rows.every((r) => / m²$/.test(r[2])), JSON.stringify(t2[0]?.rows[0]));
  }
}
// 12/09 (incrément 6) — le bloc proposition_operation : la carte « Proposition d'opération » et son « Préparer l'opération → »
// vers le formulaire pré-rempli (lib pure composerProposition, sur un fait réel de lire_ventes ci-dessus).
{
  const { composerProposition } = await import("../../src/lib/explorer/proposition");
  const { EVENT_TYPES_ALL } = await import("../../src/lib/events/eventTypes");
  const p = resolvePeriode({ periode: "30_derniers_jours" }, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
  const faits = composeVentesFacts(await computeSalesReport(bq, { location_id: LOC, owned: [LOC], start: p.start, end: p.end })).facts;
  const r = composerProposition({ titre: "Samedi gourmand", dispositif: "Une table de dégustation à l'entrée", type: "degustation", dates: ["2099-01-02"], pourquoi: [faits[0]] },
    { location_id: LOC, today: "2026-09-12", familles_site: [], types: EVENT_TYPES_ALL, faits_du_tour: faits });
  check("composerProposition compose depuis un fait réel de lire_ventes", !("erreur" in r), r.erreur);
  if (!("erreur" in r)) {
    const el = render(assembleAnswerBlocks([[r.block]], groundAgentText("", r.facts)));
    const card = el.querySelector("[data-proposition]");
    check("la carte « Proposition d'opération » se rend : titre, dispositif, dates, objectif, le fait lu", !!card && /Proposition d’opération/.test(card.textContent) && card.textContent.includes("Samedi gourmand") && card.textContent.includes("le 02/01/2099") && card.textContent.includes("CA du jour vs votre résultat habituel") && card.textContent.includes(faits[0]), card?.textContent.slice(0, 200));
    const a = card?.querySelector("a");
    check("« Préparer l'opération → » ouvre le formulaire pré-rempli (evenement?new=1&titre&dispositif&type&dates&kpi&cible)", a?.textContent === "Préparer l’opération →" && /^\/app\/insightevent\/evenement\?location_id=.*&new=1&titre=Samedi\+gourmand&dispositif=.*&type=degustation&dates=2099-01-02&kpi=revenue_residual&cible=15$/.test(a?.getAttribute("href") || ""), a?.getAttribute("href"));
  }
}
console.log(fails ? `\n${fails} échec(s).` : "\nTout vert.");
process.exit(fails ? 1 : 0);
