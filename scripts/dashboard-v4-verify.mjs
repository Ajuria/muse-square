// Vérité endpoint V4 — compte owner réel, handler direct. Exécuter depuis la racine du repo :
//   npx tsx <ce fichier>
import "dotenv/config";
import { makeBQClient } from "../src/lib/bq.ts";
import { GET as dashGET } from "../src/pages/api/insight/dashboard.ts";

const PROJECT = "muse-square-open-data";
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + detail : ""));
  if (!cond) fails++;
};

const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`, params: { loc: OWNER_LOC }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
const locals = { clerk_user_id: uid, all_location_ids: locRows.map((r) => String(flat(r.location_id))) };

const get = async (p) => {
  const t0 = Date.now();
  const res = await dashGET({ url: new URL(`http://l/api/insight/dashboard?period=${p}`), locals });
  const j = JSON.parse(await res.text());
  return { j, ms: Date.now() - t0 };
};

const { j: j365, ms } = await get(365);
check("ok=true", j365.ok === true);
check("budget < 3000 ms", ms < 3000, ms + " ms");

// Dérivation : impact 30/90 dérivés des impact_rows 365 == réponses serveur par période.
const today = new Date().toISOString().slice(0, 10);
for (const p of [30, 90]) {
  const { j: jp } = await get(p);
  const cut = new Date(Date.parse(today + "T12:00:00Z") - p * 86_400_000).toISOString().slice(0, 10);
  const rows = j365.impact_rows.filter((r) => String(r.resolved_date || "") >= cut);
  const kept = rows.filter((r) => r.verdict !== "confounded");
  const derived = kept.length ? kept.reduce((a, r) => a + (r.gap_eur ?? 0), 0) : null;
  check(`dérivation € ${p} j`, derived === jp.impact.gap_eur && kept.length === jp.impact.eur_windows,
    `dérivé ${derived}/${kept.length} vs serveur ${jp.impact.gap_eur}/${jp.impact.eur_windows}`);
  const jm = j365.judged_meta.filter((m) => m.verdict !== "confounded" && String(m.created_d || "") >= cut);
  check(`dérivation jugées ${p} j`, jm.length === jp.impact.windows_judged, `${jm.length} vs ${jp.impact.windows_judged}`);
}

check("practice_counts présent", j365.practice_counts && typeof j365.practice_counts.proven === "number", JSON.stringify(j365.practice_counts));
check("tier sur chaque pratique", (j365.practices || []).every((p) => ["prouvee", "en_test", "declaree", "ecartee", "archivee"].includes(p.tier)),
  (j365.practices || []).map((p) => p.tier).join(","));
check("occasions cohérentes", j365.occasions && j365.occasions.total >= j365.occasions.played && j365.occasions.by_site.length >= 1,
  `joués ${j365.occasions?.played}/${j365.occasions?.total} · next_hot ${j365.occasions?.next_hot}`);
check("learnings ≤ 3, registre (label_fr + €/an + tier)", Array.isArray(j365.learnings) && j365.learnings.length <= 3
  && j365.learnings.every((l) => l.label_fr && typeof l.eur_year === "number" && l.n_days >= 5 && l.tier_label_fr),
  j365.learnings.map((l) => `${l.label_fr} ${l.avg_gap_eur}€/j ≈${l.eur_year}€/an [${l.tier_label_fr}]${l.covered ? " couvert" : ""}${l.in_test ? " en-test" : ""}`).join(" · "));
check("last_verdict présent", !!(j365.last_verdict && j365.last_verdict.verdict), JSON.stringify(j365.last_verdict));
check("met_recipe présent", !!(j365.met_recipe && j365.met_recipe.text), (j365.met_recipe?.text || "").slice(0, 50) + " gap=" + j365.met_recipe?.gap_eur);
const serie = (j365.operations || []).filter((o) => o.prev_occ);
check("prev_occ sur la série", serie.length >= 1, serie.map((o) => o.title + ":" + (o.prev_occ?.verdict ?? "attente")).join(" · "));
check("sales_depth 3 sites", (j365.sales_depth || []).length === 3, JSON.stringify((j365.sales_depth || []).map((x) => x.n_days)));
// verdicts_scheduled retiré du payload (audit 24/08 : aucun consommateur) — le check devenait vacuellement vert.
const firstNames = (j365.equipe || []).map((e) => String(e.who).trim().split(/[\s·]+/)[0].toLowerCase());
check("équipe : prénoms uniques (fusion)", new Set(firstNames).size === firstNames.length, (j365.equipe || []).map((e) => e.who).join(" | "));
// Rétro-compat e2e : les champs debloquer historiques existent toujours.
check("debloquer rétro-compat", j365.debloquer && "first_test" in j365.debloquer && "sales_stale" in j365.debloquer && "margin_declared" in j365.debloquer);

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
