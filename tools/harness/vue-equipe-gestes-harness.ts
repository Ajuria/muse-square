// Harnais incrément 5 (vue équipe) — gestes membres v1 sur les VRAIS endpoints.
// Sonde : un engagement PROBE inséré en DML (nettoyé en fin), rattaché à un pôle fictif ;
// le refus hors périmètre se teste sur l'engagement RÉEL (rien n'y est écrit : 403).
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const REAL_OUT = "2d99694a-17fa-4486-92e1-548ce588e1f5"; // engagement réel, dispositif hors pôles membre
const PROBE_POLE = "probe-inc5-pole";
const PROBE_C = "probe-inc5-c1";
const MEMBER_ID = "user_member_harness_inc5";
const P = "muse-square-open-data";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 200) : ""));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = raw ? new BigQuery({ projectId: P, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: P });
  const ownerLocals = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, all_location_ids: [LOC], member_location_ids: [], member_poles: {}, role: "owner" };
  const memberLocals = { clerk_user_id: MEMBER_ID, real_clerk_user_id: MEMBER_ID, all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [PROBE_POLE] }, role: "member" };

  // ── Sonde : engagement PROBE (DML, ouvert, rattaché au pôle fictif) ──
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
            (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type, dispositif_id, committed_action_text,
             measured_metric, window_kind, window_start, window_end, window_days_expected, threshold_level, threshold_basis, threshold_value, owner_person_name)
            VALUES (@c, @u, @l, 'open', 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), 'create', @d, 'PROBE inc5 — à supprimer',
             'revenue_residual', '7d', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), 7, 'modeste', 'pct', 5, 'Probe')`,
    params: { c: PROBE_C, u: OWNER, l: LOC, d: PROBE_POLE }, location: "EU",
  });

  const { GET, POST: CREATE } = await import("../../src/pages/api/commitments/index");
  const { POST: DISPO } = await import("../../src/pages/api/commitments/disposition");
  const { POST: RETRO } = await import("../../src/pages/api/commitments/retro");
  void CREATE;
  async function get(locals: any, qs: string) {
    const r: Response = await (GET as any)({ url: new URL("http://localhost/api/commitments" + qs), locals });
    return { status: r.status, body: await r.json() };
  }
  async function post(fn: any, locals: any, body: any) {
    const r: Response = await fn({ request: new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), locals });
    return { status: r.status, body: await r.json() };
  }

  // ── LISTE ──
  const ownList = await get(ownerLocals, "?location_id=" + LOC);
  assert("owner liste 200, sans champ role", ownList.status === 200 && !("role" in ownList.body));
  assert("owner voit la sonde ET les réels", ownList.body.items.some((i: any) => i.commitment_id === PROBE_C) && ownList.body.items.some((i: any) => i.commitment_id === REAL_OUT));
  const memList = await get(memberLocals, "?location_id=" + LOC);
  assert("membre liste 200 + role", memList.status === 200 && memList.body.role === "member");
  const memIds = memList.body.items.map((i: any) => i.commitment_id);
  assert("membre voit SA sonde seulement", memIds.includes(PROBE_C) && !memIds.includes(REAL_OUT), { memIds });
  const item = memList.body.items.find((i: any) => i.commitment_id === PROBE_C);
  assert("projection membre : pas de kpi_baseline ni user_id", !("kpi_baseline" in item) && !("user_id" in item), Object.keys(item));
  const gc = await get(memberLocals, "?location_id=" + LOC + "&goal_context=1");
  assert("goal_context refusé au membre (403)", gc.status === 403);

  // Seconde sonde HORS pôle — cible du refus (jamais l'engagement réel : une mutation du
  // périmètre ne doit pas pouvoir écrire sur des données réelles).
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
            (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type, dispositif_id, committed_action_text,
             measured_metric, window_kind, window_start, window_end, window_days_expected, threshold_level, threshold_basis, threshold_value, owner_person_name)
            VALUES ('probe-inc5-out', @u, @l, 'open', 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), 'create', 'probe-inc5-otherpole', 'PROBE inc5 out — à supprimer',
             'revenue_residual', '7d', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), 7, 'modeste', 'pct', 5, 'Probe')`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });

  // ── DISPOSITION ──
  const dOut = await post(DISPO, memberLocals, { commitment_id: "probe-inc5-out", location_id: LOC, action_done_status: "fait" });
  assert("disposition HORS périmètre refusée (403), rien d'écrit", dOut.status === 403);
  const dIn = await post(DISPO, memberLocals, { commitment_id: PROBE_C, location_id: LOC, action_done_status: "fait", dispositif_note: "note membre inc5" });
  assert("disposition DU périmètre acceptée", dIn.status === 200 && dIn.body.ok === true, dIn.body);
  const [snap] = await bq.query({
    query: `SELECT action_done_status, dispositif_note FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn FROM \`${P}.analytics.action_commitments\` WHERE commitment_id = @c) WHERE rn = 1`,
    params: { c: PROBE_C }, location: "EU",
  });
  assert("journal : fait + note écrits", (snap as any[])[0]?.action_done_status === "fait" && (snap as any[])[0]?.dispositif_note === "note membre inc5", (snap as any[])[0]);
  const [alog] = await bq.query({
    query: `SELECT user_id, action_key, action_text FROM \`${P}.analytics.action_log\` WHERE event = 'member_gesture' AND user_id = @u AND action_key = @k`,
    params: { u: MEMBER_ID, k: "disposition:" + PROBE_C }, location: "EU",
  });
  assert("auteur membre tracé dans action_log", (alog as any[]).length === 1 && String((alog as any[])[0].action_text).includes("note membre inc5"), (alog as any[])[0]);

  // ── RETRO ──
  const rOpen = await post(RETRO, memberLocals, { commitment_id: PROBE_C, location_id: LOC, retro_note: "trop tôt" });
  assert("retro sur engagement ouvert → 409 (règle du rail intacte)", rOpen.status === 409);
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
            (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type, dispositif_id, committed_action_text,
             measured_metric, window_kind, window_start, window_end, window_days_expected, threshold_level, threshold_basis, threshold_value, owner_person_name)
            VALUES (@c, @u, @l, 'resolved', 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 SECOND), MILLISECOND), 'resolve', @d, 'PROBE inc5 — à supprimer',
             'revenue_residual', '7d', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), 7, 'modeste', 'pct', 5, 'Probe')`,
    params: { c: PROBE_C, u: OWNER, l: LOC, d: PROBE_POLE }, location: "EU",
  });
  const rIn = await post(RETRO, memberLocals, { commitment_id: PROBE_C, location_id: LOC, retro_worked: "le coin dégustation", retro_repeat: true });
  assert("retro membre acceptée après résolution", rIn.status === 200 && rIn.body.ok === true, rIn.body);
  const [alog2] = await bq.query({
    query: `SELECT user_id FROM \`${P}.analytics.action_log\` WHERE event = 'member_gesture' AND user_id = @u AND action_key = @k`,
    params: { u: MEMBER_ID, k: "retro:" + PROBE_C }, location: "EU",
  });
  assert("auteur retro tracé", (alog2 as any[]).length === 1);

  // ── Owner intact : disposition owner sur la sonde passe toujours ──
  const dOwn = await post(DISPO, ownerLocals, { commitment_id: PROBE_C, location_id: LOC, action_done_status: "pas_encore" });
  assert("owner disposition inchangée", dOwn.status === 200 && dOwn.body.ok === true);

  // ── Rangée d'actions des cartes (vm, action-cards réel) ──
  const src = readFileSync("public/js/action-cards.js", "utf8");
  function actionsWith(memberFlag: boolean): string[] {
    const ctx: any = { console };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    ctx._msMemberView = memberFlag;
    const cand = { action_type: "weather_hazard_onset", date: "2026-08-28", action_priority: 2, action_category: "context", data_payload: { weather_alert_type: "heat", alert_level: 3 } };
    const entries = ctx.renderActionCandidates([cand], {}, null, "2026-08-28", "pulse", null, "2026-08-28") || [];
    return entries.length ? entries[0].tmpl.actions.map((a: any) => a.text) : [];
  }
  const aOwner = actionsWith(false);
  const aMember = actionsWith(true);
  assert("rangée owner complète (témoin)", aOwner.includes("Consulter") && aOwner.includes("Sauvegarder") && aOwner.includes("Signaler"), aOwner);
  assert("rangée membre = Consulter seul", JSON.stringify(aMember) === JSON.stringify(["Consulter"]), aMember);

  // ── Nettoyage ──
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc5-%'`, location: "EU" });
  const [cnt] = await bq.query({ query: `SELECT COUNT(*) n FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc5-%'`, location: "EU" });
  assert("sondes engagement nettoyées", Number((cnt as any[])[0].n) === 0);
  try {
    await bq.query({ query: `DELETE FROM \`${P}.analytics.action_log\` WHERE event = 'member_gesture' AND user_id = @u`, params: { u: MEMBER_ID }, location: "EU" });
    console.log("• action_log probes nettoyées");
  } catch { console.log("• action_log : buffer streaming, probes laissées (télémétrie, inoffensif)"); }
}

main().catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });
