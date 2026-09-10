// tools/oneoff/2026-09-10-vacances-scolaires-2026-2027.mts — one-shot, idempotent.
//
// raw.school_vacations_periods : les 8 périodes 2026-2027 chargées à la main le 08/09 depuis le
// calendrier officiel finissaient le LUNDI DE REPRISE (la convention du jeu fr-en-calendrier-scolaire),
// alors que les 552 lignes historiques finissent le DERNIER jour de vacances (le dimanche) — et le
// modèle compte la date de fin : le lundi de reprise était traité comme un jour de vacances.
// Il manquait aussi l'hiver et le printemps 2027 des zones A et B.
//
// Source des dates : data.education.gouv.fr, jeu fr-en-calendrier-scolaire, année 2026-2027, lu le 10/09
// (zone C hiver 06/02→22/02 et printemps 03/04→19/04 : les lignes du 08/09 étaient JUSTES ; c'est le seed
// vacation_zones_france qui se trompe sur 2027). L'été 2027 n'est pas chargé : sa date de fin (rentrée
// 2027) n'est pas publiée.
//
// Sauvegarde AVANT : _archive.school_vacations_periods__2026_09_10_avant_correction (560 lignes, bq cp 10/09).
// Vérification : lire AVANT et APRÈS, refuser de conclure sur le seul « OK » du DML.
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";

const PROJECT = "muse-square-open-data";
const T = `\`${PROJECT}.raw.school_vacations_periods\``;
const bq = makeBQClient(PROJECT);
const q = async (query: string) => (await bq.query({ query, location: "EU" }))[0] as Array<Record<string, unknown>>;

const lire = () =>
  q(`SELECT region_code, vacation_code, CAST(start_date AS STRING) s, FORMAT_DATE("%a", start_date) sd,
            CAST(end_date AS STRING) e, FORMAT_DATE("%a", end_date) ed, _src_system
     FROM ${T} WHERE start_date >= "2026-08-01" ORDER BY start_date, region_code`);

const avant = await lire();
console.log("AVANT :", avant.length, "lignes 2026-27");
for (const r of avant) console.log("  ", Object.values(r).join(" | "));

// 1. fin = dernier jour de vacances (seulement les lignes manuelles qui finissent un lundi → idempotent)
await q(`UPDATE ${T}
  SET end_date = DATE_SUB(end_date, INTERVAL 1 DAY),
      period_id = TO_HEX(SHA1(CONCAT(country_code,"|",region_code,"|",CAST(start_date AS STRING),"|",
                                     CAST(DATE_SUB(end_date, INTERVAL 1 DAY) AS STRING),"|",vacation_code)))
  WHERE _src_system = "manual_load" AND EXTRACT(DAYOFWEEK FROM end_date) = 2`);

// 2. zones A et B, hiver et printemps 2027 (absentes → idempotent par NOT EXISTS)
await q(`INSERT INTO ${T} (_ingested_at, _src_file, _src_loaded_at, _src_system, country_code, end_date, period_id, region_code, start_date, vacation_code, vacation_name)
  SELECT CURRENT_TIMESTAMP(), "manual:calendrier-scolaire-2026-2027 (data.education.gouv.fr, fr-en-calendrier-scolaire, 10/09/2026)",
         CURRENT_TIMESTAMP(), "manual_load", "FR", n.end_date,
         TO_HEX(SHA1(CONCAT("FR","|",n.region_code,"|",CAST(n.start_date AS STRING),"|",CAST(n.end_date AS STRING),"|",n.vacation_code))),
         n.region_code, n.start_date, n.vacation_code, n.vacation_name
  FROM UNNEST([
    STRUCT("Zone A" AS region_code, DATE "2027-02-13" AS start_date, DATE "2027-02-28" AS end_date, "vacances_dhiver" AS vacation_code, "Vacances d'hiver" AS vacation_name),
    ("Zone B", DATE "2027-02-20", DATE "2027-03-07", "vacances_dhiver", "Vacances d'hiver"),
    ("Zone A", DATE "2027-04-10", DATE "2027-04-25", "vacances_de_printemps", "Vacances de printemps"),
    ("Zone B", DATE "2027-04-17", DATE "2027-05-02", "vacances_de_printemps", "Vacances de printemps")]) n
  WHERE NOT EXISTS (SELECT 1 FROM ${T} t WHERE t.region_code = n.region_code AND t.start_date = n.start_date AND t.vacation_code = n.vacation_code)`);

const apres = await lire();
console.log("APRÈS :", apres.length, "lignes 2026-27");
for (const r of apres) console.log("  ", Object.values(r).join(" | "));

const lundis = apres.filter((r) => r.ed === "Mon").length;
const attendu = 12; // 8 corrigées + 4 ajoutées
if (apres.length !== attendu || lundis !== 0) {
  throw new Error(`attendu ${attendu} lignes 2026-27 finissant un dimanche, trouvé ${apres.length} lignes dont ${lundis} finissant un lundi`);
}
const [tot] = await q(`SELECT COUNT(*) n, (SELECT COUNT(*) FROM (SELECT country_code, region_code, start_date, end_date, vacation_code FROM ${T} GROUP BY 1,2,3,4,5 HAVING COUNT(*) > 1)) doublons FROM ${T}`);
console.log("OK :", JSON.stringify(tot), "— 564 lignes attendues, 0 doublon");
