// scripts/migrate-source-file.mts — P3.1-d (onboarding) : traçabilité des imports.
// raw.client_transactions gagne source_file (nom du fichier déposé, écrit par sales-csv.ts).
// Additif : dbt sélectionne ses colonnes explicitement, rien en aval ne lit ce champ.
import "dotenv/config";
import { makeBQClient } from "../src/lib/bq";

const bq = makeBQClient("muse-square-open-data");
await bq.query({
  query: "ALTER TABLE `muse-square-open-data.raw.client_transactions` ADD COLUMN IF NOT EXISTS source_file STRING",
  location: "EU",
});
const [cols] = await bq.query({
  query: "SELECT column_name FROM `muse-square-open-data.raw.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = 'client_transactions' AND column_name = 'source_file'",
  location: "EU",
});
console.log("source_file:", (cols as any[]).length ? "OK" : "ABSENT");
