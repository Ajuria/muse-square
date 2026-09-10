// tools/oneoff/2026-09-10-crisalid-import-source.mts — one-shot, idempotent.
//
// Crisalid devient une source d'import NOMMÉE. La clé parseur vit dans
// api/import/sales-csv (VALID_SOURCES) ; le ROUTAGE vit dans analytics.pos_systems.import_source
// (api/import/locations le sert, ie-prompt.js le poste tel quel). La ligne crisalid pointait sur
// 'generic' : le profil du site Épices et Tout dit pos_system = 'crisalid' (vérifié 10/09), et
// l'import s'écrivait quand même source_system = 'csv_manual' — le seau partagé de TOUS les dépôts
// manuels, dont la clé de delete-supersede est (location_id, 'csv_manual', dates).
//
// Vérification : lire la ligne AVANT et APRÈS, et refuser de conclure sur le seul « OK » de l'UPDATE.
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";

const PROJECT = "muse-square-open-data";
const bq = makeBQClient(PROJECT);
const read = async () => {
  const [rows] = await bq.query({
    query: `SELECT pos_key, label_fr, ingestion_mode, import_source, active, sort
            FROM \`${PROJECT}.analytics.pos_systems\` WHERE pos_key = 'crisalid'`,
    location: "EU",
  });
  return rows as Array<Record<string, unknown>>;
};

const before = await read();
console.log("AVANT :", JSON.stringify(before));
if (before.length !== 1) throw new Error(`attendu 1 ligne crisalid, trouvé ${before.length}`);

await bq.query({
  query: `UPDATE \`${PROJECT}.analytics.pos_systems\`
          SET import_source = 'crisalid'
          WHERE pos_key = 'crisalid'`,
  location: "EU",
});

const after = await read();
console.log("APRÈS :", JSON.stringify(after));
if (String(after[0]?.import_source) !== "crisalid") {
  throw new Error(`import_source vaut ${String(after[0]?.import_source)}, attendu 'crisalid'`);
}
console.log("OK: analytics.pos_systems.crisalid.import_source = 'crisalid'");
