// tools/oneoff/2026-08-19-migrate-proposed-follow.mts — P3.1-f : suivis proposés par menace.
// raw.competitor_tracking gagne `proposed` (TRUE = suivi posé par le système à l'onboarding,
// libellé « suivi proposé — ajustez » sur la fiche ; NULL/FALSE = suivi choisi par l'utilisateur).
// Additif : dbt stg_competitor_tracking sélectionne ses colonnes, rien n'exige ce champ.
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
const bq = makeBQClient("muse-square-open-data");
await bq.query({
  query: "ALTER TABLE `muse-square-open-data.raw.competitor_tracking` ADD COLUMN IF NOT EXISTS proposed BOOL",
  location: "EU",
});
const [cols] = await bq.query({
  query: "SELECT column_name FROM `muse-square-open-data.raw.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = 'competitor_tracking' AND column_name = 'proposed'",
  location: "EU",
});
console.log("proposed:", (cols as any[]).length ? "OK" : "ABSENT");
