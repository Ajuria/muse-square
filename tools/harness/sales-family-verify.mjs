// Vérité de la famille SALES (journée dédiée 18/08) — provider réel sur données réelles,
// renderSales réel (extrait de card-kit), routage du registre. Le harnais EST la page.
// Usage : npx tsx tools/harness/sales-family-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { salesFamily } from "../../src/lib/insightFamilies/sales.ts";
import { familyForQuestion } from "../../src/lib/insightFamilies/index.ts";

const P = "muse-square-open-data";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (l, c, d) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + String(d).slice(0, 130) : "")); if (!c) fails++; };

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
// Un jour RÉEL où sales_revenue_down_wow a tiré, avec du mix produit le même jour.
const [[sig]] = await bq.query({
  query: `SELECT c.location_id, CAST(c.date AS STRING) d
          FROM \`${P}.mart.fct_location_daily_action_candidates\` c
          WHERE c.action_type = 'sales_revenue_down_wow'
            AND EXISTS (SELECT 1 FROM \`${P}.mart.fct_client_offering_daily\` o
                        WHERE o.location_id = c.location_id AND o.transaction_date = c.date)
          ORDER BY c.date DESC LIMIT 1`, location: "EU",
});
if (!sig) throw new Error("aucun jour down_wow avec mix — test impossible");
const loc = String(flat(sig.location_id)), dDown = String(flat(sig.d));
console.log("jour signal réel :", dDown, "· site", loc.slice(0, 8));

// 1 · Provider sur le jour SIGNAL : is_down = LA définition du moteur.
const fDown = await salesFamily(bq, loc, dDown);
check("jour signal : found + is_down === true (défini par la carte tirée, jamais re-dérivé)", fDown.found && fDown.data.is_down === true, JSON.stringify(fDown.data.signal_types));
check("jour signal : fact signal présent (registre observé)", fDown.facts.some((f) => f.fact_fr.indexOf("Signal CA") >= 0 && f.claim_type === "observed"));
check("jour signal : mix produit ou absence honnête", fDown.data.found === true ? Array.isArray(fDown.data.movers) && fDown.data.movers.length > 0 : true);

// 2 · Un jour SANS signal : neutre, absence dite.
const [[quiet]] = await bq.query({
  query: `SELECT CAST(o.transaction_date AS STRING) d
          FROM \`${P}.mart.fct_client_offering_daily\` o
          WHERE o.location_id = @l
            AND NOT EXISTS (SELECT 1 FROM \`${P}.mart.fct_location_daily_action_candidates\` c
                            WHERE c.location_id = o.location_id AND c.date = o.transaction_date
                              AND c.action_type LIKE 'sales%')
          ORDER BY o.transaction_date DESC LIMIT 1`, params: { l: loc }, location: "EU",
});
const dQuiet = String(flat(quiet.d));
const fQuiet = await salesFamily(bq, loc, dQuiet);
check("jour sans signal : is_down === null + absence DITE dans les facts", fQuiet.data.is_down === null && fQuiet.facts.some((f) => f.fact_fr.indexOf("Aucun signal CA") >= 0), dQuiet);

// 3 · renderSales RÉEL : extrait de card-kit, mode neutre vs mode baisse.
const kit = readFileSync(new URL("../../public/js/card-kit.js", import.meta.url), "utf8");
const mFn = kit.match(/(function salesLevier[\s\S]*?\n  \})\n\n/) || kit.match(/(function salesLevier[\s\S]*?\n  \})\n/);
const mRs = kit.match(/(function renderSales\(j, isDown, date\) \{[\s\S]*?\n  \})\n/);
if (!mFn || !mRs) throw new Error("renderSales/salesLevier introuvables");
const helpers = `
  var WS_DOW_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  function frInt(n){ return Math.round(n).toLocaleString('fr-FR'); }
  function esc(s){ return String(s==null?'':s); }
  function msPct(p){ return (p>=0?'+':'') + p + ' %'; }
  function msSortTable(){ return '<table/>'; }
  function msDecision(t, lines){ return lines.map(function(l){ return l.body; }).join(' | '); }
`;
const render = new Function(helpers + mFn[1] + "\n" + mRs[1] + "\nreturn renderSales;")();
if (fDown.data.found) {
  const outDown = render({ ok: true, ...fDown.data }, undefined, dDown);
  check("renderSales (repli j.is_down) : registre BAISSE (« La baisse vient ») sans passer isDown", outDown.indexOf("La baisse vient") >= 0 || !fDown.data.movers.some((m) => m.delta_eur < 0), outDown.slice(-120));
}
if (fQuiet.data.found) {
  const outQuiet = render({ ok: true, ...fQuiet.data }, undefined, dQuiet);
  check("renderSales neutre : décrit sans prescrire + absence du signal dite",
    outQuiet.indexOf("Aucun signal CA tiré ce jour-là") >= 0 && outQuiet.indexOf("Vérifiez") < 0 && outQuiet.indexOf("Sécurisez") < 0, outQuiet.slice(-140));
  check("renderSales carte (isDown explicite) : INCHANGÉ (le paramètre prime)", render({ ok: true, ...fQuiet.data }, true, dQuiet).indexOf("Aucun signal CA tiré") < 0);
}

// 4 · Routage : sales matche, sans voler discount/decomp.
const r1 = familyForQuestion("pourquoi mon CA a baissé samedi ?");
const r2 = familyForQuestion("est-ce que mes remises rapportent ?");
const r3 = familyForQuestion("c'est le trafic ou le panier moyen ?");
const r4 = familyForQuestion("quels sont mes best sellers ?");
check("routage : « pourquoi mon CA a baissé » → sales", r1 && r1.key === "sales", r1 && r1.key);
check("routage : remises → salesdiscount (pas volé)", r2 && r2.key === "salesdiscount", r2 && r2.key);
check("routage : trafic/panier → salesdecomp (pas volé)", r3 && r3.key === "salesdecomp", r3 && r3.key);
check("routage : best sellers → offering (famille EXISTANTE — sales ne vole pas)", r4 && r4.key === "offering", r4 && r4.key);

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
