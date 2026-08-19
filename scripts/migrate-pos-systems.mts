// scripts/migrate-pos-systems.mts — P3.1-b migration (one-shot, idempotent).
// ALTER profil (+pos_system) + CREATE analytics.pos_systems + MERGE des 12 caisses.
// import_source = clé PARSEUR de api/import/sales-csv (VALID_SOURCES) — le routage d'import vit ICI.
// Table pré-enregistrée dans docs/bq-catalog.allowlist.json (bq-guard).
import "dotenv/config";
import { makeBQClient } from "../src/lib/bq";

const PROJECT = "muse-square-open-data";
const bq = makeBQClient(PROJECT);
const APOS = String.fromCharCode(39); // apostrophe dans « L'Addition » sans l'écrire en dur

const seed = [
  { pos_key: "sage100", label_fr: "Sage 100", ingestion_mode: "csv", import_source: "sage100", export_note_fr: "Export Ventes (factures) en CSV — 12 mois glissants, une ligne par article vendu, avec le compte tiers si possible.", sort: 10 },
  { pos_key: "ebp", label_fr: "EBP", ingestion_mode: "csv", import_source: "generic", export_note_fr: "Export des ventes en CSV — 12 mois glissants, une ligne par article vendu.", sort: 20 },
  { pos_key: "wavesoft", label_fr: "WaveSoft", ingestion_mode: "csv", import_source: "generic", export_note_fr: "Export des ventes en CSV — 12 mois glissants, une ligne par article vendu.", sort: 30 },
  { pos_key: "square", label_fr: "Square", ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des transactions depuis le tableau de bord Square.", sort: 40 },
  { pos_key: "sumup", label_fr: "SumUp", ingestion_mode: "connector_planned", import_source: "sumup", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes depuis SumUp.", sort: 50 },
  { pos_key: "zettle", label_fr: "Zettle (PayPal)", ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes depuis Zettle.", sort: 60 },
  { pos_key: "lightspeed", label_fr: "Lightspeed", ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes.", sort: 70 },
  { pos_key: "tiller", label_fr: "Tiller", ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes.", sort: 80 },
  { pos_key: "laddition", label_fr: `L${APOS}Addition`, ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes.", sort: 90 },
  { pos_key: "hiboutik", label_fr: "Hiboutik", ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes.", sort: 100 },
  { pos_key: "tactill", label_fr: "Tactill", ingestion_mode: "connector_planned", import_source: "generic", export_note_fr: "Connexion directe prévue — en attendant, export CSV des ventes.", sort: 110 },
  { pos_key: "autre", label_fr: "Autre / aucune caisse", ingestion_mode: "csv", import_source: "generic", export_note_fr: "Tout export CSV des ventes convient — une ligne par article vendu, 12 mois si possible.", sort: 900 },
];

await bq.query({
  query: `ALTER TABLE \`${PROJECT}.raw.insight_event_user_location_profile\` ADD COLUMN IF NOT EXISTS pos_system STRING`,
  location: "EU",
});
console.log("OK: colonne pos_system (profil)");

await bq.query({
  query: `CREATE TABLE IF NOT EXISTS \`${PROJECT}.analytics.pos_systems\` (
    pos_key STRING NOT NULL,
    label_fr STRING NOT NULL,
    ingestion_mode STRING NOT NULL,
    import_source STRING,
    export_note_fr STRING,
    active BOOL NOT NULL,
    sort INT64 NOT NULL
  )`,
  location: "EU",
});
console.log("OK: table analytics.pos_systems");

await bq.query({
  query: `ALTER TABLE \`${PROJECT}.analytics.pos_systems\` ADD COLUMN IF NOT EXISTS import_source STRING`,
  location: "EU",
});
console.log("OK: colonne import_source");

await bq.query({
  query: `MERGE \`${PROJECT}.analytics.pos_systems\` T
    USING (SELECT r.pos_key, r.label_fr, r.ingestion_mode, r.import_source, r.export_note_fr, TRUE AS active, r.sort FROM UNNEST(@rows) AS r) S
    ON T.pos_key = S.pos_key
    WHEN MATCHED THEN UPDATE SET label_fr = S.label_fr, ingestion_mode = S.ingestion_mode, import_source = S.import_source, export_note_fr = S.export_note_fr, active = S.active, sort = S.sort
    WHEN NOT MATCHED THEN INSERT (pos_key, label_fr, ingestion_mode, import_source, export_note_fr, active, sort)
      VALUES (S.pos_key, S.label_fr, S.ingestion_mode, S.import_source, S.export_note_fr, S.active, S.sort)`,
  params: { rows: seed },
  types: { rows: [{ pos_key: "STRING", label_fr: "STRING", ingestion_mode: "STRING", import_source: "STRING", export_note_fr: "STRING", sort: "INT64" }] },
  location: "EU",
});
console.log("OK: MERGE seed");

const [rows] = await bq.query({
  query: `SELECT COUNT(*) AS n FROM \`${PROJECT}.analytics.pos_systems\` WHERE active`,
  location: "EU",
});
const n: any = (rows as any[])[0]?.n;
console.log("caisses actives :", Number(n && typeof n === "object" && "value" in n ? n.value : n));
