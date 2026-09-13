// tools/oneoff/2026-09-13-seed-paniers-multi-lignes.mts — LE PANIER DANS LA GRAINE (owner 13/09 :
// « corrige seed pour panier »).
//
// LE DÉFAUT MESURÉ le 13/09 : sur les quatre comptes de démonstration, `raw.client_transactions` porte
// UN ticket par ligne (Muse Square : 41 330 lignes pour 41 330 `invoice_number`, soit 1,00 ligne par
// ticket). Aucune analyse de panier n'y est possible — « quels articles sont achetés ensemble »,
// l'entraînement d'une référence déplacée, le taux de présence au ticket : tout rend vide. Le seul
// panier réel en base est celui des clients (Les Olivades 7,86 lignes/ticket, Esprit de Fabrique 3,82).
//
// CE QUE FAIT CE SCRIPT : il REGROUPE les lignes existantes en tickets, et rien d'autre — seule la
// colonne `invoice_number` change. Aucune ligne créée, aucune supprimée, aucun euro déplacé, aucune
// famille modifiée. Les comptes CLIENTS ne sont PAS touchés (liste explicite ci-dessous).
//
// LA RÈGLE DE REGROUPEMENT : les lignes d'un même (site, jour, HEURE) — un ticket ne traverse jamais
// une heure, sinon `fct_client_hourly_sales` (transactions = COUNT DISTINCT invoice_number) compterait
// le même ticket deux fois. Taille de ticket tirée au sort de façon DÉTERMINISTE (FARM_FINGERPRINT +
// sel), loi géométrique de moyenne ~1,8 ligne : la forme d'un café (une boisson, souvent une
// viennoiserie avec, rarement plus). Aucune affinité entre familles n'est fabriquée : regrouper au
// hasard donne des paires proportionnelles aux fréquences réelles — une graine ne doit JAMAIS
// contenir un « signal » qu'on risquerait de lire comme une découverte.
//
// CE QUE ÇA CHANGE EN AVAL (voulu, et c'est tout) : `int_client_daily_performance` compte les achats
// par COUNT(DISTINCT invoice_number) — le nombre d'achats du jour baisse d'environ 1,8× et le panier
// moyen monte d'autant. Le CA du jour, les unités, les familles, les heures : identiques.
// `transaction_count` reste le REPLI (utilisé seulement quand `invoice_number` est nul) : intact.
//
// APRÈS ce script, les modèles dbt en aval sont périmés tant qu'ils ne sont pas reconstruits
// (stg_client_transactions → int_client_daily_performance, fct_client_tickets, fct_client_sales_lines,
// fct_client_hourly_sales, …) — l'historique entier change, donc il faut un `--full-refresh` du
// sous-arbre. Je ne lance jamais dbt : la commande est donnée à l'owner en fin d'exécution.
//
// Usage :
//   npx tsx tools/oneoff/2026-09-13-seed-paniers-multi-lignes.mts              → ESSAI (n'écrit rien)
//   npx tsx tools/oneoff/2026-09-13-seed-paniers-multi-lignes.mts --write      → sauvegarde + écrit
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const TABLE = `${PROJECT}.raw.client_transactions`;
const BACKUP = `${PROJECT}.raw.client_transactions_backup_2026_09_13_paniers`;
const WRITE = process.argv.includes("--write");

// Les comptes de DÉMONSTRATION, nommés un par un (jamais un « tout sauf » : un client nouveau serait
// emporté par erreur). Vérifié le 13/09 sur vw_insight_event_ai_location_context.
const DEMO = [
  { id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", nom: "Muse Square (compte de test owner)" },
  { id: "ff2aeb35-084f-4bbf-915c-94faf7be8785", nom: "Muse Square Occitanie" },
  { id: "2af6eb18-e961-44da-97b4-7b448923b657", nom: "Poeiti test" },
  { id: "29383776-bd7a-4401-ac26-f2e6efe1f58c", nom: "Maison Sèvres (démo fictive)" },
];
// JAMAIS TOUCHÉS — clients réels : 14379e18 (Les Olivades, 7,86 lignes/ticket), 2dc69ea6 (Esprit de Fabrique).

// Le tirage : DÉTERMINISTE (même sel ⇒ même découpage à chaque exécution), jamais RAND().
const SEL = "ms-panier-2026-09-13";
const HASH = (expr: string) =>
  `ABS(FARM_FINGERPRINT(CONCAT('${SEL}|', location_id, '|', CAST(transaction_date AS STRING), '|', CAST(transaction_hour AS STRING), '|', ${expr})))`;
const P_COUPE = 565;   // loi géométrique : ~1,77 ligne par ticket (1 ligne 56 %, 2 lignes 25 %, 3 lignes 11 %, 4+ 8 %)

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const bq = makeBQClient(PROJECT);
const q = async (sql: string, params?: Record<string, unknown>) => {
  const [rows] = await bq.query({ query: sql, ...(params ? { params } : {}), location: "EU" });
  return (rows as any[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, flat(v)])));
};
const fr = (n: number, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

// L'ORDRE EXACT des colonnes, lu en base : la table se réécrit à l'identique, seule `invoice_number` change.
const cols = (await q(
  `SELECT column_name FROM \`${PROJECT}\`.raw.INFORMATION_SCHEMA.COLUMNS
   WHERE table_name = 'client_transactions' ORDER BY ordinal_position`,
)).map((r) => String(r.column_name));
if (!cols.includes("invoice_number")) throw new Error("colonne invoice_number absente — arrêt");
console.log(`Colonnes : ${cols.length}, invoice_number en position ${cols.indexOf("invoice_number") + 1}.`);

// ── L'ÉTAT AVANT, par site ────────────────────────────────────────────────────────────────────────
const avant = await q(
  `SELECT location_id, COUNT(*) AS lignes, COUNT(DISTINCT invoice_number) AS tickets,
          ROUND(SUM(revenue), 2) AS ca, COUNT(DISTINCT item_code) AS articles,
          CAST(MIN(transaction_date) AS STRING) AS du, CAST(MAX(transaction_date) AS STRING) AS au
   FROM \`${TABLE}\` GROUP BY 1`,
);
const parId = (rows: any[]) => Object.fromEntries(rows.map((r) => [String(r.location_id), r]));
const A = parId(avant);

// ── LA GRAINE PROPOSÉE, calculée SANS RIEN ÉCRIRE ────────────────────────────────────────────────
// Un ticket = une suite de lignes d'une même heure ; la coupe est déterministe (même sel ⇒ même
// découpage à chaque exécution). Le numéro est lisible : T<AAAAMMJJ>-<rang du ticket dans la journée>.
const GROUPES = `
  ordonne AS (
    SELECT t.*,
           ROW_NUMBER() OVER (
             PARTITION BY location_id, transaction_date, transaction_hour
             ORDER BY ${HASH("CONCAT(IFNULL(item_code, ''), '|', IFNULL(invoice_number, ''), '|', CAST(ROUND(IFNULL(revenue, 0), 4) AS STRING))")}, item_code, invoice_number
           ) AS rang_heure
    FROM \`${TABLE}\` t
    WHERE location_id IN UNNEST(@demo)
  ),
  coupes AS (
    SELECT o.*,
           CASE WHEN rang_heure = 1 THEN 1
                WHEN MOD(${HASH("CAST(rang_heure AS STRING)")}, 1000) < ${P_COUPE} THEN 1 ELSE 0 END AS coupe
    FROM ordonne o
  ),
  numerotes AS (
    SELECT c.*,
           SUM(coupe) OVER (PARTITION BY location_id, transaction_date
                            ORDER BY transaction_hour, rang_heure
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rang_ticket
    FROM coupes c
  ),
  refaits AS (
    SELECT n.* EXCEPT (rang_heure, coupe, rang_ticket),
           CONCAT('T', FORMAT_DATE('%Y%m%d', transaction_date), '-', LPAD(CAST(rang_ticket AS STRING), 4, '0')) AS nouveau_numero
    FROM numerotes n
  )`;

const apercu = await q(
  `WITH ${GROUPES}
   SELECT location_id,
          COUNT(*) AS lignes, COUNT(DISTINCT nouveau_numero) AS tickets_jour_confondus,
          COUNT(DISTINCT CONCAT(CAST(transaction_date AS STRING), nouveau_numero)) AS tickets,
          ROUND(COUNT(*) / COUNT(DISTINCT CONCAT(CAST(transaction_date AS STRING), nouveau_numero)), 2) AS lignes_par_ticket,
          MAX(taille) AS plus_gros_ticket,
          ROUND(SUM(revenue) / COUNT(DISTINCT CONCAT(CAST(transaction_date AS STRING), nouveau_numero)), 2) AS panier_moyen
   FROM (SELECT r.*, COUNT(*) OVER (PARTITION BY location_id, transaction_date, nouveau_numero) AS taille FROM refaits r)
   GROUP BY 1`,
  { demo: DEMO.map((d) => d.id) },
);
const P = parId(apercu);

console.log("\nAVANT → APRÈS (essai)");
for (const d of DEMO) {
  const a = A[d.id], p = P[d.id];
  if (!a) { console.log(`  ${d.nom} : aucune ligne en base.`); continue; }
  console.log(`  ${d.nom}
    lignes ${fr(Number(a.lignes))} (inchangé) · tickets ${fr(Number(a.tickets))} → ${fr(Number(p.tickets))}
    lignes par ticket ${fr(Number(a.lignes) / Number(a.tickets), 2)} → ${fr(Number(p.lignes_par_ticket), 2)} (le plus gros : ${p.plus_gros_ticket} lignes)
    panier moyen ${fr(Number(a.ca) / Number(a.tickets), 2)} € → ${fr(Number(p.panier_moyen), 2)} €`);
}

// La distribution des tailles — ce qu'un exploitant reconnaîtrait comme des tickets de son commerce.
const tailles = await q(
  `WITH ${GROUPES},
   tickets AS (SELECT location_id, transaction_date, nouveau_numero, COUNT(*) AS taille FROM refaits GROUP BY 1,2,3)
   SELECT taille, COUNT(*) AS n, ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS part_pct
   FROM tickets WHERE location_id = @loc GROUP BY 1 ORDER BY 1 LIMIT 12`,
  { demo: DEMO.map((d) => d.id), loc: DEMO[0].id },
);
console.log(`\nTailles de ticket sur ${DEMO[0].nom} :`);
for (const t of tailles) console.log(`    ${t.taille} ligne(s) : ${fr(Number(t.n))} tickets (${fr(Number(t.part_pct), 1)} %)`);

if (!WRITE) {
  console.log("\nESSAI — rien n'a été écrit. Relancer avec --write pour sauvegarder puis appliquer.");
  process.exit(0);
}

// ── LE GARDE AVANT D'ÉCRIRE : la jointure de réécriture se fait sur (site, jour, heure, numéro).
// Si un numéro portait DEUX lignes, la jointure les dupliquerait et la table serait fausse. On le
// prouve, on ne le suppose pas (les quatre comptes sont à une ligne par ticket, mesuré le 13/09).
const doublons = await q(
  `SELECT COUNT(*) AS n FROM (
     SELECT location_id, transaction_date, transaction_hour, invoice_number
     FROM \`${TABLE}\` WHERE location_id IN UNNEST(@demo)
     GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1)`,
  { demo: DEMO.map((d) => d.id) },
);
if (Number(doublons[0].n) !== 0) {
  console.error(`\nARRÊT : ${doublons[0].n} numéro(s) de ticket portent déjà plusieurs lignes — la réécriture les dupliquerait.`);
  process.exit(1);
}
console.log("\nGarde : un numéro de ticket = une ligne sur les comptes de démonstration (0 doublon). La jointure est sûre.");

// ── ÉCRITURE : sauvegarde d'abord, jamais l'inverse ───────────────────────────────────────────────
console.log(`Sauvegarde → ${BACKUP}`);
await bq.query({ query: `CREATE OR REPLACE TABLE \`${BACKUP}\` AS SELECT * FROM \`${TABLE}\``, location: "EU" });
const [[sauve]] = await bq.query({ query: `SELECT COUNT(*) AS n FROM \`${BACKUP}\``, location: "EU" });
console.log(`  ${fr(Number(flat((sauve as any).n)))} lignes sauvegardées.`);

const liste = cols.map((c) => (c === "invoice_number" ? "COALESCE(f.nouveau_numero, t.invoice_number) AS invoice_number" : `t.${c}`)).join(", ");
console.log("Réécriture de la table (partition et cluster conservés)…");
await bq.query({
  query: `
    CREATE OR REPLACE TABLE \`${TABLE}\`
    PARTITION BY transaction_date CLUSTER BY location_id, client_id AS
    WITH ${GROUPES}
    SELECT ${liste}
    FROM \`${TABLE}\` t
    LEFT JOIN refaits f
      ON f.location_id = t.location_id AND f.transaction_date = t.transaction_date
     AND f.transaction_hour = t.transaction_hour AND f.invoice_number = t.invoice_number`,
  params: { demo: DEMO.map((d) => d.id) },
  location: "EU",
});

// ── LES INVARIANTS : ce qui ne devait pas bouger n'a pas bougé ────────────────────────────────────
const apres = await q(
  `SELECT location_id, COUNT(*) AS lignes, COUNT(DISTINCT invoice_number) AS tickets,
          ROUND(SUM(revenue), 2) AS ca, COUNT(DISTINCT item_code) AS articles,
          CAST(MIN(transaction_date) AS STRING) AS du, CAST(MAX(transaction_date) AS STRING) AS au
   FROM \`${TABLE}\` GROUP BY 1`,
);
const B = parId(apres);
let fautes = 0;
const ok = (l: string, c: boolean, d?: string) => { console.log(`  ${c ? "OK  " : "FAIL"} ${l}${d ? " — " + d : ""}`); if (!c) fautes++; };
console.log("\nInvariants :");
ok("aucun site perdu ni ajouté", Object.keys(A).length === Object.keys(B).length, `${Object.keys(A).length} → ${Object.keys(B).length}`);
for (const id of Object.keys(A)) {
  const a = A[id], b = B[id], nom = DEMO.find((d) => d.id === id)?.nom ?? `client ${id.slice(0, 8)}`;
  ok(`${nom} : lignes, CA, articles, dates intacts`,
    Number(a.lignes) === Number(b.lignes) && Number(a.ca) === Number(b.ca) && Number(a.articles) === Number(b.articles) && a.du === b.du && a.au === b.au,
    `${fr(Number(b.lignes))} lignes · ${fr(Number(b.ca), 2)} €`);
  const estDemo = DEMO.some((d) => d.id === id);
  ok(`${nom} : ${estDemo ? "les tickets regroupent" : "tickets INCHANGÉS (client réel)"}`,
    estDemo ? Number(b.tickets) < Number(a.tickets) : Number(b.tickets) === Number(a.tickets),
    `${fr(Number(a.tickets))} → ${fr(Number(b.tickets))}`);
}
const [[chk]] = await bq.query({
  query: `SELECT COUNTIF(t.invoice_number != s.invoice_number) AS changes
          FROM \`${TABLE}\` t JOIN \`${BACKUP}\` s USING (location_id, transaction_date, transaction_hour, item_code, revenue, invoice_number)
          WHERE t.location_id NOT IN UNNEST(@demo)`,
  params: { demo: DEMO.map((d) => d.id) }, location: "EU",
}).catch(() => [[{ changes: -1 }]] as any);
ok("aucun numéro de ticket d'un client réel modifié", Number(flat((chk as any).changes)) === 0);

console.log(fautes ? `\n${fautes} invariant(s) en échec — restaurer depuis ${BACKUP}.` : `\nTout vert. Sauvegarde gardée : ${BACKUP}`);
console.log(`
À FAIRE ENSUITE (je ne lance jamais dbt) — l'historique entier change, donc reconstruction COMPLÈTE du sous-arbre :
  dbt build --select stg_client_transactions+ --full-refresh
Puis : npm run catalog:refresh, et re-mesurer les lignes par ticket sur la vue semantic.`);
process.exit(fautes ? 1 : 0);
