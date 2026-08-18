// Harnais maquette « tuile capital de savoir » (earn & learn, owner 17/08 soir).
// Capture le payload dashboard réel → les chiffres VRAIS de la tuile : N dispositifs prouvés,
// motifs d'environnement appris + leur enjeu annualisé cumulé (registre existant — rien
// d'inventé, mêmes valeurs que les cartes Occasions/Appris). Écrit savoir-tile-proto-data.js.
// Usage : npx tsx scripts/savoir-tile-proto-harness.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { GET as dashGET } from "../src/pages/api/insight/dashboard";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
  const locals = { clerk_user_id: uid, all_location_ids: (locRows as any[]).map((r) => String(flat(r.location_id))) };
  const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals } as any);
  const j = JSON.parse(await (res as any).text());
  if (!j.ok) throw new Error(j.error);

  const practices = (j.practices || []).filter((p: any) => p.tier !== "archivee");
  const nProuves = practices.filter((p: any) => p.tier === "prouvee").length;
  const nTest = practices.filter((p: any) => p.tier !== "prouvee" && p.tier !== "ecartee").length;
  const learnings = j.learnings || [];
  // Enjeu annualisé cumulé des motifs appris — le registre a déjà tout jugé (portes n/matérialité).
  const eurYear = learnings.reduce((a: number, l: any) => a + Math.abs(Number(l.eur_year) || 0), 0);
  const out = {
    captured_at: new Date().toISOString(),
    savoir: {
      n_prouves: nProuves, n_test: nTest,
      n_motifs: learnings.length,
      eur_year: Math.round(eurYear),
      motifs: learnings.map((l: any) => ({ label: l.label_fr, eur_year: l.eur_year, site: l.site_label, covered: l.covered })),
      prouves: practices.filter((p: any) => p.tier === "prouvee").map((p: any) => ({ text: String(p.text || "").slice(0, 70) })),
    },
    // Les 4 tuiles actuelles, pour poser la 5e à côté (chiffres réels du payload).
    tiles: {
      impact: j.impact_rows ? j.impact_rows.filter((r: any) => r.verdict !== "confounded").reduce((a: number, r: any) => a + (r.gap_eur || 0), 0) : null,
      afaire: j.met_recipe ? j.met_recipe.gap_eur : null,
      occasions: j.occasions || {},
      veille_n: ((j.glance || {}).offres || []).length,
    },
  };
  writeFileSync(new URL("../public/savoir-tile-proto-data.js", import.meta.url).pathname,
    "window.SAVOIR_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("OK — prouvés:", nProuves, "· en test:", nTest, "· motifs:", learnings.length, "· enjeu cumulé:", Math.round(eurYear), "€/an");
})();
