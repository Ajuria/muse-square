// tools/oneoff/2026-09-12-test-prix-achat-vraisemblables.mts — one-shot, COMPTE DE TEST SEULEMENT (owner 12/09 :
// « si pas de cogs dans test, génère dummy content selon données vraisemblables »).
//
// Le compte de test Muse Square (f10c3e58…, ventes Kaggle d'un coffee shop) n'a aucun prix d'achat : la marge brute
// ne se mesure pas, le chat, Piloter, Explorer et le rapport restent en mode « aucune ». Ce one-off écrit un
// catalogue de prix d'achat VRAISEMBLABLE dans analytics.item_cost_catalog (source = 'seed_test', repérable et
// supprimable) : pour chaque article vendu, prix d'achat HT = prix moyen de vente × (1 − taux de marge brute
// usuel de sa famille en coffee shop) × un bruit déterministe de ±5 % par article ; une date d'effet avant la
// première vente (2026-04-01), et une hausse de +6 % sur les grains de café au 2026-08-01 pour exercer la date
// d'effet. Il déclare aussi la base du CA = HT (analytics.declared_parameters, source 'seed_test') : sans base
// connue, dbt ne calcule aucun CA net HT, donc aucune marge (fct_client_sales_lines_margin).
// Owner 12/09 (« mets charges fixes et masse salariale vraisemblables ») : charges fixes 6 500 € par mois (loyer,
// énergie, abonnements, assurance d'un coffee shop à ~55 k€ de CA mensuel, soit ~12 %) et masse salariale
// 17 000 € par mois (~31 % du CA, l'ordre de grandeur de la restauration rapide en France) — pour voir le
// résultat net et le point mort tourner. Repérables (source seed_test), retirables par --rollback.
// Taux usuels retenus (marge brute sur prix de vente) : boissons chaudes 74-80 %, sirops 85 %, viennoiseries 62 %,
// grains 42 %, thé en vrac 55 %, chocolat emballé 50 %, textile et mugs 45 %. Ce sont des ordres de grandeur de
// la profession, pas une mesure : ils ne servent qu'à voir la chaîne marcher sur un compte de test.
// Usage : npx tsx tools/oneoff/2026-09-12-test-prix-achat-vraisemblables.mts            (écrit)
//         npx tsx tools/oneoff/2026-09-12-test-prix-achat-vraisemblables.mts --rollback (retire seed_test)
import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { makeBQClient } from "../../src/lib/bq";
import { appendDeclaredParameter, listDeclaredParameters, parameterSpec, validateValue } from "../../src/lib/kpi/declaredParameters";

const PROJECT = "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";   // Muse Square, compte de test owner (CLAUDE.md)
const SOURCE = "seed_test", SOURCE_FILE = "seed-test-2026-09-12";
const RATE: Record<string, number> = { Coffee: 0.78, Tea: 0.80, "Drinking Chocolate": 0.74, Flavours: 0.85, Bakery: 0.62, "Coffee beans": 0.42, "Loose Tea": 0.55, "Packaged Chocolate": 0.50, Branded: 0.45 };
const bq = makeBQClient(PROJECT);
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

if (process.argv.includes("--rollback")) {
  await bq.query({ query: `DELETE FROM \`${PROJECT}.analytics.item_cost_catalog\` WHERE location_id = @l AND source = @s`, params: { l: LOC, s: SOURCE }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${PROJECT}.analytics.declared_parameters\` WHERE location_id = @l AND source = @s`, params: { l: LOC, s: SOURCE }, location: "EU" });
  console.log("seed_test retiré (prix d'achat + base du CA)");
  process.exit(0);
}
const [items] = await bq.query({
  query: `SELECT item_code, ANY_VALUE(item_description) AS description, ANY_VALUE(item_category) AS family,
                 SAFE_DIVIDE(SUM(revenue), SUM(quantity_decimal)) AS avg_price
          FROM \`${PROJECT}.semantic.vw_insight_event_client_sales_lines\` WHERE location_id = @l AND item_code IS NOT NULL
          GROUP BY 1 HAVING avg_price > 0 ORDER BY 1`,
  params: { l: LOC }, location: "EU",
});
const [[existing]] = await bq.query({ query: `SELECT COUNT(*) AS n FROM \`${PROJECT}.analytics.item_cost_catalog\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" });
const rows: any[] = [];
if (Number(flat((existing as any).n)) > 0) { console.log(`prix d'achat déjà présents (${flat((existing as any).n)} lignes) — non réécrits`); (items as any[]).length = 0; }
for (const r of items as any[]) {
  const code = String(flat(r.item_code)), fam = String(flat(r.family) ?? ""), price = Number(flat(r.avg_price));
  const rate = RATE[fam]; if (rate == null) throw new Error(`famille sans taux : ${fam}`);
  const h = parseInt(createHash("sha1").update(code).digest("hex").slice(0, 6), 16) / 0xffffff;   // 0..1 déterministe
  const noise = 0.95 + 0.10 * h;
  const cost = Math.round(price * (1 - rate) * noise * 100) / 100;
  rows.push({ code, description: String(flat(r.description) ?? ""), cost, effective_from: "2026-04-01" });
  if (fam === "Coffee beans") rows.push({ code, description: String(flat(r.description) ?? ""), cost: Math.round(cost * 1.06 * 100) / 100, effective_from: "2026-08-01" });
}
const values = rows.map((_, i) => `(@id${i}, @l, @c${i}, @d${i}, @u${i}, 'piece', DATE(@e${i}), NULL, @s, @f, NULL, CURRENT_TIMESTAMP())`).join(",\n");
const params: Record<string, unknown> = { l: LOC, s: SOURCE, f: SOURCE_FILE };
const types: Record<string, string> = { l: "STRING", s: "STRING", f: "STRING" };
rows.forEach((r, i) => { params[`id${i}`] = randomUUID(); params[`c${i}`] = r.code; params[`d${i}`] = r.description; params[`u${i}`] = r.cost; params[`e${i}`] = r.effective_from;
  types[`id${i}`] = "STRING"; types[`c${i}`] = "STRING"; types[`d${i}`] = "STRING"; types[`u${i}`] = "FLOAT64"; types[`e${i}`] = "STRING"; });
if (rows.length) await bq.query({ query: `INSERT INTO \`${PROJECT}.analytics.item_cost_catalog\` (cost_id, location_id, item_code, item_description, unit_cost_ht, cost_unit, effective_from, supplier, source, source_file, declarant_user_id, created_at) VALUES ${values}`, params, types, location: "EU" });
console.log(`prix d'achat écrits : ${rows.length} lignes pour ${(items as any[]).length} articles (dont ${rows.length - (items as any[]).length} hausses au 01/08)`);
// Base du CA = HT (sans elle, aucun CA net HT, donc aucune marge)
const cur = (await listDeclaredParameters(LOC)).filter((p) => p.param_key === "revenue_basis");
if (!cur.length) {
  const spec = parameterSpec("revenue_basis")!;
  await appendDeclaredParameter({ location_id: LOC, key: "revenue_basis", value: validateValue(spec, "HT"), effective_from: "2026-04-01", declarant_user_id: null, source: SOURCE });
  console.log("base du CA déclarée : HT (seed_test, effet 01/04/2026)");
} else console.log("base du CA déjà déclarée :", cur.map((c) => c.value_text).join(","));
// Charges fixes et masse salariale mensuelles (owner 12/09), à date d'effet 01/04/2026
for (const [key, value] of [["fixed_costs_month_eur", "6500"], ["payroll_month_eur", "17000"]] as const) {
  const have = (await listDeclaredParameters(LOC)).filter((p) => p.param_key === key);
  if (have.length) { console.log(`${key} déjà déclaré :`, have.map((h) => h.value_num).join(",")); continue; }
  const spec = parameterSpec(key)!;
  await appendDeclaredParameter({ location_id: LOC, key, value: validateValue(spec, value), effective_from: "2026-04-01", declarant_user_id: null, source: SOURCE });
  console.log(`${spec.label_fr} déclarée : ${value} € par mois (seed_test, effet 01/04/2026)`);
}
const [[chk]] = await bq.query({ query: `SELECT COUNT(*) AS n, COUNT(DISTINCT item_code) AS codes, ROUND(MIN(unit_cost_ht),2) AS mn, ROUND(MAX(unit_cost_ht),2) AS mx FROM \`${PROJECT}.analytics.item_cost_catalog\` WHERE location_id = @l AND source = @s`, params: { l: LOC, s: SOURCE }, location: "EU" });
console.log("relu :", JSON.stringify(chk));
