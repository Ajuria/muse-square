// E2E ONBOARDING SYNTHÉTIQUE — la preuve rejouable du chrono « inscription → service »
// (docs/automatisation-spec.md + mémoire onboarding-chantier).
//
// Ce script rejoue le parcours COMPLET d'un compte neuf sur l'infra RÉELLE, avec un
// tenant jetable, puis purge tout :
//   1. profil : ligne clonée du site owner (adresse réelle geocodable) sous des ids
//      synthétiques + CAISSE DÉCLARÉE sage100 (P3.1-e) + les 4 jobs dbt du sign-up ;
//   1bis. routage (P3.1-c) : /api/import/locations rend la caisse → l'import est routé
//      sur import_source, comme le ferait le flux Explorer ;
//   2. import : CSV frais généré (45 j, creux/pics calibrés pour les portes 70/130),
//      POSTé au VRAI handler import/sales-csv avec la source ROUTÉE → job after-upload ;
//      source_file tracé en base (P3.1-d) ;
//   3. vérité : marts signaux + cartes ventes candidates + geste « premier test » ;
//   4. purge : raw + re-déclenchement des jobs pour nettoyer les marts.
// Chaque étape est CHRONOMÉTRÉE — la sortie est le contrat de service mesuré.
//
// Usage : npx tsx scripts/e2e-onboarding-synth.ts            (durée ~10-15 min, poll dbt)
//         npx tsx scripts/e2e-onboarding-synth.ts --invite   (+ invitation Clerk réelle vers
//                                                             l'adresse taguée owner : création,
//                                                             demande de fichier « sent », révocation)
//         npx tsx scripts/e2e-onboarding-synth.ts --purge    (purge seule, idempotente)
//
// GARDE : toute écriture/suppression est bornée aux ids SYNTH_* ci-dessous.
import "dotenv/config";
import { makeBQClient } from "../src/lib/bq";
import { POST as importPOST } from "../src/pages/api/import/sales-csv";
import { GET as dashGET } from "../src/pages/api/insight/dashboard";
import { GET as locGET } from "../src/pages/api/import/locations";

const PROJECT = "muse-square-open-data";
const SYNTH_LOC = "00000000-0000-4000-8000-00000e2e0001";
const SYNTH_USER = "user_e2e_synth_onboarding";
const SYNTH_EMAIL = "e2e-synth@musesquare.test";
const SOURCE_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5"; // gabarit d'adresse : site owner
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ── dbt Cloud API (mêmes creds que dbt-trigger) ──
const DBT_BASE = `https://ym384.us1.dbt.com/api/v2/accounts/${process.env.DBT_ACCOUNT_ID}`;
const DBT_HDR = { Authorization: `Token ${process.env.DBT_API_TOKEN}`, "Content-Type": "application/json" };
const JOBS = {
  address: process.env.DBT_JOB_PROFILE_REFRESH_ID!,
  industry: process.env.DBT_JOB_INDUSTRY_CHANGE!,
  transit: process.env.DBT_JOB_TRANSIT_CHANGE!,
  client_dim: process.env.DBT_JOB_CLIENT_DIM_REFRESH!,
  sales: process.env.DBT_JOB_CLIENT_SALES_REFRESH!,
};
async function dbtRun(jobId: string, cause: string): Promise<number> {
  const res = await fetch(`${DBT_BASE}/jobs/${jobId}/run/`, { method: "POST", headers: DBT_HDR, body: JSON.stringify({ cause }) });
  const j: any = await res.json();
  if (!res.ok || !j?.data?.id) throw new Error(`trigger ${jobId} → ${res.status}`);
  return j.data.id as number;
}
async function dbtWait(runId: number, label: string, timeoutMs = 12 * 60_000): Promise<number> {
  const t0 = Date.now();
  for (;;) {
    const res = await fetch(`${DBT_BASE}/runs/${runId}/`, { headers: DBT_HDR });
    const j: any = await res.json();
    const st = j?.data?.status; // 10 = success, 20 = error, 30 = cancelled
    if (st === 10) return Date.now() - t0;
    if (st === 20 || st === 30) throw new Error(`${label} run ${runId} → statut ${st}`);
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label} run ${runId} → timeout`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

async function purge(bq: any): Promise<void> {
  await bq.query({
    // L'import écrit client_id = clerk_user_id (pas la location) — la garde porte sur le
    // location_id synthétique, unique par construction.
    query: `DELETE FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @loc`,
    params: { loc: SYNTH_LOC }, location: "EU",
  });
  await bq.query({
    query: `DELETE FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc AND clerk_user_id = @u`,
    params: { loc: SYNTH_LOC, u: SYNTH_USER }, location: "EU",
  });
  console.log("purge raw: OK (transactions + profil synthétiques supprimés)");
}

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  if (process.argv.includes("--purge")) {
    await purge(bq);
    // Nettoie les marts du tenant purgé (rebuild depuis raw, sans lui).
    const r = await dbtRun(JOBS.sales, `e2e_synth:purge_rebuild`);
    console.log("rebuild ventes post-purge déclenché (run " + r + ") — dims au prochain passage planifié");
    return;
  }

  const chrono: Array<[string, number]> = [];
  const T = (label: string, t0: number) => { chrono.push([label, Date.now() - t0]); console.log(`  ✔ ${label} — ${((Date.now() - t0) / 1000).toFixed(0)} s`); };

  // ── 0. État net ──
  await purge(bq);

  // ── 0bis (P3.1-e, --invite) : invitation Clerk réelle — le VRAI point de départ du parcours.
  // Création vers l'adresse taguée owner (2 emails réels partent : Clerk + demande de fichier),
  // demande de fichier « sent », révocation immédiate. Sans le flag : sauté (prouvé par invite-verify).
  if (process.argv.includes("--invite")) {
    console.log("\n[0] Invitation réelle…");
    const { POST: invitePOST } = await import("../src/pages/api/admin/invite");
    const { ADMIN_USER_IDS } = await import("../src/lib/admins");
    const adminLocals = { clerk_user_id: ADMIN_USER_IDS[0] };
    const mkReq = (body: any) => new Request("http://l/api/admin/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ir: any = await (invitePOST as any)({ locals: adminLocals, request: mkReq({ email: "julen.deajuriaguerra+e2esynth@gmail.com", activity_hint: "test e2e", pos_hint: "Sage 100" }) });
    const ij = JSON.parse(await ir.text());
    if (ir.status !== 200 || !ij.ok) throw new Error("invitation échouée : " + JSON.stringify(ij));
    if (ij.file_request_email !== "sent") throw new Error("demande de fichier NON envoyée : " + ij.file_request_email);
    console.log("  ✔ invitation créée + demande de fichier « sent » (consigne Sage 100)");
    const rr: any = await (invitePOST as any)({ locals: adminLocals, request: mkReq({ revoke_id: ij.invitation.id }) });
    if (rr.status !== 200) throw new Error("révocation échouée");
    console.log("  ✔ invitation révoquée (aucune trace durable côté Clerk)");
  }

  // ── 1. « Inscription » : profil synthétique (adresse réelle clonée) + les 4 jobs du sign-up ──
  console.log("\n[1] Inscription synthétique…");
  let t0 = Date.now();
  await bq.query({
    query: `INSERT INTO \`${PROJECT}.raw.insight_event_user_location_profile\`
            SELECT * REPLACE(@loc AS location_id, @u AS clerk_user_id, @em AS email,
                             '[E2E] Compte synthétique' AS company_name, '[E2E] Compte synthétique' AS site_name,
                             'sage100' AS pos_system)
            FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
            WHERE location_id = @src ORDER BY created_at DESC LIMIT 1`,
    params: { loc: SYNTH_LOC, u: SYNTH_USER, em: SYNTH_EMAIL, src: SOURCE_LOC }, location: "EU",
  });
  // Les 4 jobs, comme triggerDbtJobs(new_account) — address est le long (~6 min).
  const runs = {
    client_dim: await dbtRun(JOBS.client_dim, `e2e_synth:profile:client_dim:${SYNTH_LOC}`),
    industry: await dbtRun(JOBS.industry, `e2e_synth:profile:industry:${SYNTH_LOC}`),
    transit: await dbtRun(JOBS.transit, `e2e_synth:profile:transit:${SYNTH_LOC}`),
    address: await dbtRun(JOBS.address, `e2e_synth:profile:address:${SYNTH_LOC}`),
  };
  await Promise.all([
    dbtWait(runs.client_dim, "client_dim"),
    dbtWait(runs.industry, "industry"),
    dbtWait(runs.transit, "transit"),
    dbtWait(runs.address, "address"),
  ]);
  T("inscription → contexte géo complet (4 jobs dbt)", t0);
  const [[dimRow]] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM \`${PROJECT}.dims.dim_client_location\` WHERE location_id = @loc`,
    params: { loc: SYNTH_LOC }, location: "EU",
  }).then(([r]: any) => [r]);
  if (Number(flat(dimRow.n)) < 1) throw new Error("dim_client_location ne porte pas le tenant synthétique");
  console.log("  ✔ dim_client_location porte le site synthétique");

  // ── 1bis (P3.1-c). Routage par caisse : l'endpoint rend la caisse déclarée, l'import la suit ──
  const locals: any = { clerk_user_id: SYNTH_USER, location_id: SYNTH_LOC, all_location_ids: [SYNTH_LOC] };
  const lres: any = await (locGET as any)({ locals });
  const lj = JSON.parse(await lres.text());
  const synthLoc = (lj.locations || []).find((x: any) => x.location_id === SYNTH_LOC);
  if (!synthLoc || !synthLoc.pos || synthLoc.pos.import_source !== "sage100") {
    throw new Error("routage caisse absent : " + JSON.stringify(synthLoc && synthLoc.pos));
  }
  console.log(`  ✔ routage : caisse ${synthLoc.pos.label_fr} → source ${synthLoc.pos.import_source} (la question du logiciel saute)`);
  const routedSource = synthLoc.pos.import_source;

  // ── 2. Import d'un CSV FRAIS (45 j jusqu'à hier, creux/pics calibrés) ──
  console.log("\n[2] Import des ventes…");
  const lines = ["date;montant;tickets"];
  for (let i = 45; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    // base 1000 € ± bruit léger ; 5 creux (~55 %) et 3 pics (~165 %) dans les 30 derniers jours
    let m = 1000 + ((i * 37) % 90) - 45;
    if ([4, 9, 14, 19, 24].includes(i)) m = Math.round(m * 0.55);
    if ([6, 16, 26].includes(i)) m = Math.round(m * 1.65);
    lines.push(`${ymd(d)};${m};${20 + (i % 7)}`);
  }
  const csv = new File([lines.join("\n")], "e2e-synth-ventes.csv", { type: "text/csv" });
  const fd = new FormData();
  fd.set("file", csv);
  fd.set("location_id", SYNTH_LOC);
  fd.set("source", routedSource); // la source ROUTÉE (P3.1-c), plus jamais 'generic' en dur
  t0 = Date.now();
  const res: any = await (importPOST as any)({ request: new Request("http://local/api/import/sales-csv", { method: "POST", body: fd }), locals });
  const imp = JSON.parse(await res.text());
  if (imp.status !== "ok") throw new Error("import non propre : " + JSON.stringify(imp).slice(0, 300));
  console.log(`  ✔ import accepté — ${imp.rows_accepted} lignes (${JSON.stringify(imp.date_range)})`);
  if (!imp.refresh_requested) throw new Error("le job after-upload ne s'est PAS déclenché (refresh_requested=false)");
  // P3.1-d : la traçabilité suit — chaque ligne porte le fichier et la source routée.
  const [[trace]] = await bq.query({
    query: `SELECT COUNTIF(source_file = 'e2e-synth-ventes.csv' AND source_system = @s) AS ok_n, COUNT(*) AS n
            FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @loc`,
    params: { loc: SYNTH_LOC, s: routedSource }, location: "EU",
  }).then(([r]: any) => [r]);
  if (Number(flat(trace.ok_n)) !== Number(flat(trace.n)) || Number(flat(trace.n)) < 1) {
    throw new Error(`traçabilité source_file/source_system incomplète : ${flat(trace.ok_n)}/${flat(trace.n)}`);
  }
  console.log(`  ✔ traçabilité : ${flat(trace.n)} lignes portent source_file + source_system=${routedSource}`);

  // ── 3. Attendre le job after-upload (celui que L'IMPORT vient de déclencher) ──
  const list: any = await (await fetch(`${DBT_BASE}/runs/?job_definition_id=${JOBS.sales}&order_by=-id&limit=1`, { headers: DBT_HDR })).json();
  const salesRunId = list.data[0].id;
  await dbtWait(salesRunId, "after-upload");
  T("import → marts ventes reconstruits (job after-upload)", t0);

  // ── 4. Vérités : signaux, cartes ventes, geste premier test ──
  console.log("\n[3] Vérités…");
  const [[sig]] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM \`${PROJECT}.mart.fct_client_sales_signals_daily\` WHERE location_id = @loc`,
    params: { loc: SYNTH_LOC }, location: "EU",
  }).then(([r]: any) => [r]);
  const [cards] = await bq.query({
    query: `SELECT action_type, COUNT(*) AS n FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
            WHERE location_id = @loc AND STARTS_WITH(action_type, 'sales_') GROUP BY 1`,
    params: { loc: SYNTH_LOC }, location: "EU",
  });
  const nCards = (cards as any[]).reduce((s, c) => s + Number(flat(c.n)), 0);
  console.log(`  ✔ signaux quotidiens : ${flat(sig.n)} jours · cartes ventes : ${nCards} (${(cards as any[]).map((c: any) => flat(c.action_type) + "×" + flat(c.n)).join(", ") || "aucune"})`);
  if (Number(flat(sig.n)) < 40) throw new Error("marts signaux incomplets");
  if (nCards < 1) throw new Error("aucune carte vente produite — portes ou jointures à inspecter");

  const dres: any = await (dashGET as any)({ url: new URL("http://l/api/insight/dashboard"), locals });
  const dj = JSON.parse(await dres.text());
  const ft = dj?.debloquer?.first_test;
  if (!ft || ft.location_id !== SYNTH_LOC) throw new Error("geste « premier test » absent : " + JSON.stringify(ft));
  console.log("  ✔ tableau : geste « Engagez votre premier test mesuré » présent (site synthétique)");
  if (dj?.debloquer?.sales_stale) throw new Error("faux « figé » sur données fraîches");
  console.log("  ✔ fraîcheur : aucun faux positif (données jusqu'à hier)");

  // ── 5. Purge + rebuild de nettoyage ──
  console.log("\n[4] Purge…");
  await purge(bq);
  const cleanup = await dbtRun(JOBS.sales, "e2e_synth:purge_rebuild");
  await dbtWait(cleanup, "purge_rebuild");
  const [[left]] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM \`${PROJECT}.mart.fct_client_sales_signals_daily\` WHERE location_id = @loc`,
    params: { loc: SYNTH_LOC }, location: "EU",
  }).then(([r]: any) => [r]);
  if (Number(flat(left.n)) !== 0) throw new Error(`purge incomplète : ${flat(left.n)} ligne(s) de marts restantes pour le tenant`);
  console.log("  ✔ marts nettoyés (0 ligne restante pour le tenant)");
  await dbtRun(JOBS.client_dim, "e2e_synth:purge_dims"); // dims : le job court suffit, pas d'attente

  console.log("\n═══ CHRONO MESURÉ ═══");
  for (const [label, ms] of chrono) console.log(`  ${label} : ${(ms / 60000).toFixed(1)} min`);
  console.log("E2E onboarding synthétique : SUCCÈS");
})().catch((e) => { console.error("E2E ÉCHEC :", e?.message || e); process.exit(1); });
