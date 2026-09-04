// Harnais incrément 7 (vue équipe) — endpoint d'interactivité Slack.
// Secret de signature SYNTHÉTIQUE injecté en env avant import ; payloads signés comme
// Slack le fait (HMAC v0 du corps brut) ; identité par mappage slack_user_id sonde ;
// les gestes traversent les VRAIS handlers disposition/retro (gardes + périmètre + trace).
import "dotenv/config";
import crypto from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";

process.env.SLACK_SIGNING_SECRET = "probe-secret-inc7";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const P = "muse-square-open-data";
const TEAM = "T03H3QBQEP9"; // team_id réel de la config Slack owner (copié de la config)
const SLACK_USER = "U_PROBE7";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 200) : ""));
  if (!cond) process.exitCode = 1;
}

function signedRequest(payload: any, opts?: { badSig?: boolean; oldTs?: boolean }): Request {
  const raw = "payload=" + encodeURIComponent(JSON.stringify(payload));
  const ts = String(Math.floor(Date.now() / 1000) - (opts?.oldTs ? 3600 : 0));
  const base = "v0:" + ts + ":" + raw;
  let sig = "v0=" + crypto.createHmac("sha256", String(process.env.SLACK_SIGNING_SECRET)).update(base).digest("hex");
  if (opts?.badSig) sig = "v0=" + "0".repeat(64);
  return new Request("http://localhost/api/channels/slack-interact", {
    method: "POST", body: raw,
    headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": ts, "x-slack-signature": sig },
  });
}

const blockAction = (actionId: string, value: any, user = SLACK_USER) => ({
  type: "block_actions", team: { id: TEAM }, user: { id: user },
  response_url: "https://slack-response.invalid/hook",
  actions: [{ action_id: actionId, value: JSON.stringify(value) }],
});

async function main() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = rawKey ? new BigQuery({ projectId: P, credentials: JSON.parse(rawKey) }) : new BigQuery({ projectId: P });

  // ── Sondes : membre mappé Slack + 3 engagements (dans/hors périmètre, résolu) ──
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\`
            (member_id, location_id, member_email, clerk_user_id, role, pole_dispositif_ids, slack_user_id, deleted, created_at, updated_at)
            VALUES ('probe-inc7-m1', @l, 'probe-inc7@example.invalid', NULL, 'member', '["probe-inc7-pole"]', @su, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: { l: LOC, su: SLACK_USER }, location: "EU",
  });
  const mkCommit = (id: string, status: string, pole: string) => bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
            (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type, dispositif_id, committed_action_text,
             measured_metric, window_kind, window_start, window_end, window_days_expected, threshold_level, threshold_basis, threshold_value, owner_person_name)
            VALUES (@c, @u, @l, @st, 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), 'create', @d, 'PROBE inc7 — à supprimer',
             'revenue_residual', '7d', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), 7, 'modeste', 'pct', 5, 'Probe')`,
    params: { c: id, u: OWNER, l: LOC, st: status, d: pole }, location: "EU",
  });
  await Promise.all([
    mkCommit("probe-inc7-c1", "open", "probe-inc7-pole"),
    mkCommit("probe-inc7-out", "open", "probe-inc7-otherpole"),
    mkCommit("probe-inc7-res", "resolved", "probe-inc7-pole"),
  ]);

  const { POST } = await import("../../src/pages/api/channels/slack-interact");
  const { localsFromSlackUser } = await import("../../src/lib/profileContext.js");
  async function call(req: Request) {
    const r: Response = await (POST as any)({ request: req });
    const txt = await r.text();
    return { status: r.status, body: txt ? JSON.parse(txt) : null };
  }

  // ── Signature ──
  const noSig = await call(new Request("http://localhost/x", { method: "POST", body: "payload=%7B%7D" }));
  assert("sans signature → 401", noSig.status === 401);
  const badSig = await call(signedRequest(blockAction("ms_dispo_fait", { c: "probe-inc7-c1", l: LOC }), { badSig: true }));
  assert("signature fausse → 401", badSig.status === 401);
  const oldTs = await call(signedRequest(blockAction("ms_dispo_fait", { c: "probe-inc7-c1", l: LOC }), { oldTs: true }));
  assert("horodatage vieux (anti-rejeu) → 401", oldTs.status === 401);

  // ── Identité mappée (fonction pure) ──
  const locals = await localsFromSlackUser(bq, SLACK_USER, null);
  assert("mappage slack_user_id → locals membre", locals && locals.role === "member" && locals.member_location_ids.includes(LOC) && locals.clerk_user_id === "slack:" + SLACK_USER, locals);

  // ── Disposition par bouton (signée, dans le périmètre) ──
  const dIn = await call(signedRequest(blockAction("ms_dispo_fait", { c: "probe-inc7-c1", l: LOC })));
  assert("bouton Fait → 200 (ack)", dIn.status === 200);
  const [snap] = await bq.query({
    query: `SELECT action_done_status FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn FROM \`${P}.analytics.action_commitments\` WHERE commitment_id = 'probe-inc7-c1') WHERE rn = 1`,
    location: "EU",
  });
  assert("journal : fait écrit via Slack", (snap as any[])[0]?.action_done_status === "fait", (snap as any[])[0]);
  const [alog] = await bq.query({
    query: `SELECT user_id FROM \`${P}.analytics.action_log\` WHERE event = 'member_gesture' AND user_id = @u AND action_key = 'disposition:probe-inc7-c1'`,
    params: { u: "slack:" + SLACK_USER }, location: "EU",
  });
  assert("auteur = slack:<id> tracé", (alog as any[]).length === 1);

  // ── Hors périmètre : ack 200 mais AUCUNE écriture ──
  await call(signedRequest(blockAction("ms_dispo_fait", { c: "probe-inc7-out", l: LOC })));
  const [snapOut] = await bq.query({
    query: `SELECT action_done_status FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn FROM \`${P}.analytics.action_commitments\` WHERE commitment_id = 'probe-inc7-out') WHERE rn = 1`,
    location: "EU",
  });
  assert("hors périmètre : rien d'écrit", (snapOut as any[])[0]?.action_done_status == null, (snapOut as any[])[0]);

  // ── Utilisateur Slack non mappé : ack, aucune écriture ──
  await call(signedRequest(blockAction("ms_dispo_fait", { c: "probe-inc7-c1", l: LOC }, "U_NOBODY")));
  const [alog2] = await bq.query({
    query: `SELECT COUNT(*) n FROM \`${P}.analytics.action_log\` WHERE event = 'member_gesture' AND user_id = 'slack:U_NOBODY'`,
    location: "EU",
  });
  assert("non mappé : aucune écriture", Number((alog2 as any[])[0].n) === 0);

  // ── Modal Documenter : soumission sur engagement résolu ──
  const viewSubmit = {
    type: "view_submission", team: { id: TEAM }, user: { id: SLACK_USER },
    view: {
      callback_id: "ms_retro", private_metadata: JSON.stringify({ c: "probe-inc7-res", l: LOC }),
      state: { values: { rw: { v: { value: "le coin dégustation" } }, rc: { v: { value: null } }, rr: { v: { selected_option: { value: "oui" } } } } },
    },
  };
  const rOk = await call(signedRequest(viewSubmit));
  assert("modal retro → 200 vide (fermeture)", rOk.status === 200 && rOk.body == null, rOk);
  const [snapR] = await bq.query({
    query: `SELECT retro_worked, retro_repeat FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn FROM \`${P}.analytics.action_commitments\` WHERE commitment_id = 'probe-inc7-res') WHERE rn = 1`,
    location: "EU",
  });
  assert("journal : retro écrit via modal", (snapR as any[])[0]?.retro_worked === "le coin dégustation" && (snapR as any[])[0]?.retro_repeat === true, (snapR as any[])[0]);

  // ── Modal sur engagement OUVERT : la règle du rail répond (erreurs de modal) ──
  const viewOpenCommit = { ...viewSubmit, view: { ...viewSubmit.view, private_metadata: JSON.stringify({ c: "probe-inc7-c1", l: LOC }) } };
  const rKo = await call(signedRequest(viewOpenCommit));
  assert("modal sur engagement ouvert → erreurs (409 du rail)", rKo.status === 200 && rKo.body?.response_action === "errors", rKo.body);

  // ── Nettoyage ──
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc7-%'`, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.location_members\` WHERE member_id LIKE 'probe-inc7-%'`, location: "EU" });
  try { await bq.query({ query: `DELETE FROM \`${P}.analytics.action_log\` WHERE event = 'member_gesture' AND user_id = @u`, params: { u: "slack:" + SLACK_USER }, location: "EU" }); } catch { console.log("• action_log : buffer streaming, sondes laissées"); }
  const [cnt] = await bq.query({ query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc7-%') + (SELECT COUNT(*) FROM \`${P}.analytics.location_members\`) n`, location: "EU" });
  assert("sondes nettoyées", Number((cnt as any[])[0].n) === 0, (cnt as any[])[0]);
}

main().catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });
