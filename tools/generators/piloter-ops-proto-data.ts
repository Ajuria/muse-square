// Harnais proto « Piloter — Opérations en cours » (16/08). LECTURE SEULE.
// Capture le glance RÉEL (dashboard direct, 3 sites owner) → tools/proto/piloter-ops-proto-data.js.
// La maquette montre >1 opération : la réelle + des états SIMULÉS étiquetés « simulation »
// (demande owner — il n'existe qu'un engagement ouvert réel ce jour).
// Usage : npx tsx tools/generators/piloter-ops-proto-data.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET } from "../../src/pages/api/insight/dashboard";

const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`muse-square-open-data.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`muse-square-open-data.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
  const locs = (locRows as any[]).map((r) => String(flat(r.location_id)));
  const res = await GET({ url: new URL(`http://l/api/insight/dashboard?location_id=${OWNER}`), locals: { clerk_user_id: uid, location_id: OWNER, all_location_ids: locs } } as any);
  const j = JSON.parse(await (res as any).text());
  const g = j.glance || {};
  const out = {
    captured_at: new Date().toISOString(),
    // impact vit à la RACINE du payload ; occasions aussi (relu sur les vrais chemins).
    impact: j.impact || null, mesures: g.mesures || [], afaire_n: null,
    veille: { n: ((g.veille || {}).lieux || []).length, offres: (g.offres || []).length },
    oc: j.occasions || null, trous: g.trous || [],
  };
  writeFileSync(new URL("../proto/piloter-ops-proto-data.js", import.meta.url).pathname,
    "window.PILOTER_OPS = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("mesures réelles:", (out.mesures || []).length, "· écrit tools/proto/piloter-ops-proto-data.js");
  (out.mesures || []).forEach((m: any) => console.log("  ", (m.texte || "").slice(0, 50), "| metric:", m.metric, "| réalisé:", m.realized, "| base:", m.baseline, "| fenêtre:", m.ws, "→", m.we));
})();
