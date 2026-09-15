// tools/oneoff/2026-09-15-deposer-plan-numerote.mts — one-shot (owner 15/09 : « dépose plan sans app »).
//
// Dépose le plan numéroté à la place de l'exploitant, par LE MÊME chemin d'écriture que le bandeau
// (`lib/dispositifs/spacePlans.ts` : refusDeDepot → putPlanObject → appendPlan), jamais un INSERT à
// part. La table est append-only : le plan déposé le 15/09 reste, et le nouveau fait foi — les photos
// prises avant ont été numérotées d'après le plan d'alors.
//
// Usage : npx tsx tools/oneoff/2026-09-15-deposer-plan-numerote.mts              (constat seul)
//         … --appliquer                                                          (dépose)
//         … --location=<uuid> --fichier=<chemin.pdf>
import "dotenv/config";
import { readFileSync, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { makeBQClient } from "../../src/lib/bq";
import { makeStorageClient } from "../../src/lib/dispositifs/dispositifPhotos";
import {
  appendPlan, listPlans, planEnVigueur, planObjectPath, planGcsUri, putPlanObject,
  refusDeDepot, ensurePlanTable, PLAN_MAX_BYTES, getPlanObject, cheminDepuisUri,
} from "../../src/lib/dispositifs/spacePlans";

const HOME = process.env.HOME || "";
const arg = (n: string, d: string) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=");
const LOCATION = arg("location", "f10c3e58-326e-4e38-947c-d59fcbe51df5");
const FICHIER = arg("fichier", `${HOME}/Documents/Muse_Square/Clients/epices-et-tout/map/Plan_Poles_Epices_et_Tout_numerote_2026-09-15.pdf`);
const APPLIQUER = process.argv.includes("--appliquer");
const fr = (n: number) => n.toLocaleString("fr-FR");

async function main() {
  if (!existsSync(FICHIER)) { console.error(`Fichier introuvable : ${FICHIER}`); process.exit(1); }
  const bytes = readFileSync(FICHIER);
  const content_type = "application/pdf";
  console.log(`${basename(FICHIER)} — ${fr(bytes.length)} octets (plafond ${fr(PLAN_MAX_BYTES)}).`);

  const refus = refusDeDepot({ content_type, bytes: bytes.length });
  if (refus) { console.error(`REFUS : ${refus}`); process.exit(1); }

  const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
  await ensurePlanTable(bq);
  const avant = await listPlans(bq, LOCATION);
  const courant = planEnVigueur(avant);
  console.log(`Plans déjà déposés : ${avant.length}${courant ? ` — en vigueur : ${courant.original_name ?? courant.plan_id} (${fr(courant.bytes)} octets, ${courant.created_at.slice(0, 10)})` : ""}`);

  // Le plan en vigueur se RELIT par le chemin de la route (getPlanObject) : déposé ne veut pas dire servi.
  if (courant) {
    const relu = await getPlanObject(makeStorageClient(), cheminDepuisUri(courant.gcs_uri));
    console.log(`Relu depuis le stockage : ${fr(relu.length)} octets — ${relu.length === courant.bytes ? "identique à la fiche" : "ÉCART avec la fiche"}`);
    if (relu.length !== courant.bytes) process.exit(1);
  }

  if (!APPLIQUER) { console.log("\nConstat seul. Relancer avec --appliquer pour déposer."); return; }

  const plan_id = randomUUID();
  const chemin = planObjectPath(LOCATION, plan_id, content_type);
  await putPlanObject(makeStorageClient(), chemin, bytes, content_type);
  await appendPlan(bq, {
    plan_id, location_id: LOCATION, gcs_uri: planGcsUri(chemin), content_type, bytes: bytes.length,
    original_name: basename(FICHIER), created_by: "depot-owner-2026-09-15",
  });

  // Relu EN BASE : c'est bien celui-là qui fait foi.
  const apres = await listPlans(bq, LOCATION);
  const v = planEnVigueur(apres);
  console.log(`\nPlans déposés : ${avant.length} → ${apres.length}`);
  console.log(`En vigueur : ${v?.original_name} — ${fr(v?.bytes ?? 0)} octets`);
  if (!v || v.plan_id !== plan_id) { console.error("ÉCART : le plan en vigueur n'est pas celui qu'on vient de déposer."); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
