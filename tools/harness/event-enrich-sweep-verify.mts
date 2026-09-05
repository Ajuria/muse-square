// Vérité de la passe C5 (enrichissement ciblé des événements) — RÉELLE, cap 1 :
// l'entonnoir rayon+bucket produit des candidats, le rail enrich-event écrit dans
// dims.dim_event_enrichment (audience_profile compris — le critère « publics »).
// L'événement enrichi est un vrai événement public : le cache reste (il sert la prod).
// Usage : npx tsx tools/harness/event-enrich-sweep-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { runEventEnrichment } from "../../src/pages/api/cron/snapshot-competitors";

let fails = 0;
const check = (l: string, c: boolean, d?: string) => { console.log((c ? "  OK " : "  FAIL ") + l + (d ? " — " + d : "")); if (!c) fails++; };
const bq = makeBQClient("muse-square-open-data");

const [beforeRows] = await bq.query({
  query: `SELECT COUNT(*) AS n FROM \`muse-square-open-data.dims.dim_event_enrichment\` WHERE enriched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)`,
  location: "EU",
});
const flat = (v: any) => Number(v && typeof v === "object" && "value" in v ? v.value : v);
const nBefore = flat((beforeRows as any[])[0].n);

const done = await runEventEnrichment(1);
check("un candidat trouvé et enrichi (entonnoir rayon+bucket)", done === 1, `${done} enrichi(s)`);

const [afterRows] = await bq.query({
  query: `SELECT event_label, audience_profile, primary_audience, business_takeaway
          FROM \`muse-square-open-data.dims.dim_event_enrichment\`
          WHERE enriched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 10 MINUTE)
          ORDER BY enriched_at DESC LIMIT 1`,
  location: "EU",
});
const row: any = (afterRows as any[])[0] || null;
check("ligne écrite dans dims.dim_event_enrichment", !!row, row ? String(row.event_label) : "aucune (insert streaming — relancer la lecture dans ~1 min si le reste est vert)");
if (row) {
  check("audience_profile alimenté (ou absence dite : les deux champs nuls ensemble)",
    row.audience_profile != null || row.primary_audience == null,
    JSON.stringify({ audience_profile: row.audience_profile, primary_audience: row.primary_audience }));
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
