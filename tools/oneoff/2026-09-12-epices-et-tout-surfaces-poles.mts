// tools/oneoff/2026-09-12-epices-et-tout-surfaces-poles.mts — one-shot (docs/espace-et-pole.md E4 : la surface de
// vente d'un pôle se MESURE sur le plan). Les sept zones de pôle d'Épices et Tout ont été construites le 12/09 depuis
// le plan vectoriel (sol de vente = intérieur des murs moins les zones non accessibles au public ; chaque pixel va
// au pôle de l'étiquette la plus proche à pied) : ~/Documents/Muse_Square/Clients/epices-et-tout/map/
// zones_poles_epices_et_tout_2026-09-12.json (contours en points du plan, m² par pôle, générateur à côté).
// Ce one-off écrit la surface de chaque pôle dans analytics.space_measures (grain pôle, component_key NULL,
// source = 'plan') par LE foyer lib/dispositifs/spaceMeasures.ts — sur le site donné (--location=), pôle par
// pôle apparié par son NOM (listPoles). Une mesure de plus par pôle : append-only, la dernière est en vigueur.
// Usage : npx tsx tools/oneoff/2026-09-12-epices-et-tout-surfaces-poles.mts --location=<id>
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { readLatestSnapshot } from "../../src/lib/commitments/actionCommitments";
import { appendSpaceMeasures, listSpaceMeasures, currentMeasures } from "../../src/lib/dispositifs/spaceMeasures";

const LOCATION_ID = (process.argv.find((a) => a.startsWith("--location=")) || "").slice("--location=".length);
if (!LOCATION_ID) throw new Error("--location=<id> requis");
const ZONES = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/map/zones_poles_epices_et_tout_2026-09-12.json`;
const zones = JSON.parse(readFileSync(ZONES, "utf8")) as { areas_m2: Record<string, number>; total_m2: number };
const bq = makeBQClient("muse-square-open-data");
const poles = await listPoles(bq, LOCATION_ID, 50);
if (poles.length !== 7) throw new Error(`7 pôles attendus sur le site, ${poles.length} lus`);
let written = 0;
for (const p of poles) {
  const m2 = zones.areas_m2[p.name];
  if (m2 == null) throw new Error(`aucune zone pour le pôle « ${p.name} »`);
  const snap = p.commitment_id ? await readLatestSnapshot(bq, p.commitment_id) : null;
  const version_no = Number((snap as any)?.version_no) || 1;
  const ids = await appendSpaceMeasures({
    location_id: LOCATION_ID, dispositif_id: p.dispositif_id, version_no, components: [], pole: { surface_m2: m2 },
    source: "plan", measured_at: "2026-09-12", declarant_user_id: null,
  });
  written += ids.length;
  console.log(`${p.name.padEnd(16)} ${String(m2).replace(".", ",").padStart(6)} m²  (version ${version_no})`);
}
const cur = currentMeasures(await listSpaceMeasures(LOCATION_ID)).filter((m) => m.component_key == null && m.surface_m2 != null);
console.log(`écrit ${written} mesures ; en vigueur au grain pôle : ${cur.length} ; total ${String(Math.round(cur.reduce((a, m) => a + (m.surface_m2 ?? 0), 0) * 100) / 100).replace(".", ",")} m² (plan : ${String(zones.total_m2).replace(".", ",")})`);
