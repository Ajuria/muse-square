// tools/oneoff/2026-09-13-epices-et-tout-zones-poles.mts — one-shot (docs/explorer-outil-spec.md § 9 incrément 8, § 10
// décision 2) : les CONTOURS des sept zones de pôle d'Épices et Tout (construites le 12/09 depuis le plan vectoriel,
// ~/Documents/Muse_Square/Clients/epices-et-tout/map/zones_poles_epices_et_tout_2026-09-12.json — points du plan, 1:100,
// 28,344 pt/m, aire par polygone) écrits dans analytics.space_zones (grain site × pôle × polygone, append-only) par LE
// foyer lib/dispositifs/spaceZones.ts — sur le site donné (--location=), pôle par pôle apparié par son NOM (listPoles),
// comme le one-off des surfaces du 12/09. La table naît à la première écriture.
// Usage : npx tsx tools/oneoff/2026-09-13-epices-et-tout-zones-poles.mts --location=<id>
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { appendSpaceZones, currentZones, listSpaceZones, newZoneRows, type Point } from "../../src/lib/dispositifs/spaceZones";

const LOCATION_ID = (process.argv.find((a) => a.startsWith("--location=")) || "").slice("--location=".length);
if (!LOCATION_ID) throw new Error("--location=<id> requis");
const ZONES = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/map/zones_poles_epices_et_tout_2026-09-12.json`;
const zones = JSON.parse(readFileSync(ZONES, "utf8")) as { scale_pt_per_m: number; page_pt: [number, number]; total_m2: number; polygons: Record<string, Array<{ area_m2: number; exterior_pt: Point[] }>> };
const bq = makeBQClient("muse-square-open-data");
const poles = await listPoles(bq, LOCATION_ID, 50);
if (poles.length !== 7) throw new Error(`7 pôles attendus sur le site, ${poles.length} lus`);
const rows = poles.flatMap((p) => {
  const pgs = zones.polygons[p.name];
  if (!pgs) throw new Error(`aucune zone pour le pôle « ${p.name} »`);
  console.log(`${p.name.padEnd(16)} ${pgs.length} polygone(s), ${String(Math.round(pgs.reduce((a, g) => a + g.area_m2, 0) * 100) / 100).replace(".", ",")} m²`);
  return newZoneRows({ location_id: LOCATION_ID, dispositif_id: p.dispositif_id, pole_label: p.name, polygons: pgs.map((g) => ({ area_m2: g.area_m2, points: g.exterior_pt })), scale_pt_per_m: zones.scale_pt_per_m, page_pt: zones.page_pt, source: "plan", measured_at: "2026-09-12" });
});
await appendSpaceZones(bq, rows);
const cur = currentZones(await listSpaceZones(bq, LOCATION_ID));
console.log(`écrit ${rows.length} zones ; en vigueur : ${cur.length} polygones pour ${new Set(cur.map((z) => z.dispositif_id)).size} pôles, ${String(Math.round(cur.reduce((a, z) => a + z.area_m2, 0) * 100) / 100).replace(".", ",")} m² (plan : ${String(zones.total_m2).replace(".", ",")} m²)`);
