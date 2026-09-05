// Harnais maquette « Profil stratégique » (refonte competitor.astro dans la grammaire de la
// page engagement — owner 17/08 soir). Capture la VRAIE réponse de competitor-profile pour
// GL Events (analyse déjà cachée) + l'actu commerciale de la fiche → competitor-proto-data.js.
// Usage : npx tsx tools/generators/competitor-proto-data.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as profileGET } from "../../src/pages/api/competitive/competitor-profile";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [[row]] = await bq.query({
    query: `SELECT cd.competitor_id cid, cd.commercial_news_json news, CAST(cd.commercial_news_at AS STRING) news_at,
                   (SELECT ANY_VALUE(clerk_user_id) FROM \`${P}.raw.insight_event_user_location_profile\` p WHERE p.location_id = @l) uid
            FROM \`${P}.raw.competitor_directory\` cd
            WHERE cd.competitor_name = 'GL Events' AND cd.deleted_at IS NULL LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const locals = { clerk_user_id: String(flat(row.uid)), location_id: OWNER };
  const res = await profileGET({ url: new URL("http://l/api/competitive/competitor-profile?id=" + encodeURIComponent(String(flat(row.cid)))), locals } as any);
  const prof = JSON.parse(await (res as any).text());
  if (!prof.ok) throw new Error("profil KO : " + prof.error);
  let actu: any = null;
  try { actu = JSON.parse(String(flat(row.news) || "null")); } catch { /* absente */ }
  const out = { captured_at: new Date().toISOString(), profil: prof, actu, actu_lu_le: flat(row.news_at) || null };
  writeFileSync(new URL("../proto/competitor-proto-data.js", import.meta.url).pathname,
    "window.COMPETITOR_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("OK — clés payload :", Object.keys(prof).join(", "), "· actu:", actu ? "oui" : "non");
})();
