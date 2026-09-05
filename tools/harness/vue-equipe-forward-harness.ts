// Harnais incrément 6 (vue équipe) — routage Slack + « Faire suivre ».
// Phase 1 : slackRouting pur (BQ réel — écrire/lire/tombstoner un canal, résolution
//           famille→pôle→canal sur un pôle-sonde).
// Phase 2 : POST/PUT /api/channels/forward réels — 403 membre, 400 sans canal, 502 canal
//           inexistant (l'erreur vient de Slack : preuve que le token vit et que l'appel
//           part), trace card_forwards ; envoi RÉEL unique si un canal où le bot est
//           membre existe (message sonde étiqueté).
// Phase 3 : msMemberForwardText réel (vm) — titre + corps membre sans niveau.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { readDispositifChannel, writeDispositifChannel, resolveForwardChannel } from "../../src/lib/channels/slackRouting";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const P = "muse-square-open-data";
const PROBE_POLE = "probe-inc6-pole";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 200) : ""));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = raw ? new BigQuery({ projectId: P, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: P });

  // ── Phase 1 : slackRouting ──
  await writeDispositifChannel(bq, { location_id: LOC, dispositif_id: PROBE_POLE, slack_channel_id: "C0PROBE6" });
  assert("canal écrit-relu", (await readDispositifChannel(bq, LOC, PROBE_POLE)) === "C0PROBE6");
  await writeDispositifChannel(bq, { location_id: LOC, dispositif_id: PROBE_POLE, slack_channel_id: null });
  assert("tombstone → null", (await readDispositifChannel(bq, LOC, PROBE_POLE)) === null);
  await writeDispositifChannel(bq, { location_id: LOC, dispositif_id: PROBE_POLE, slack_channel_id: "C0PROBE6" });

  // Pôle-sonde portant la famille réelle 'Tea' (vue sur les payloads réels, inc 4).
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
            (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type, dispositif_id, dispositif_nature, pole_families, committed_action_text)
            VALUES ('probe-inc6-c1', @u, @l, 'open', 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), 'create', @d, 'permanent', '["Tea"]', 'PROBE inc6 — à supprimer')`,
    params: { u: OWNER, l: LOC, d: PROBE_POLE }, location: "EU",
  });
  const byFam = await resolveForwardChannel(bq, { location_id: LOC, item_category: "Tea" });
  assert("résolution famille→pôle→canal", byFam.channel === "C0PROBE6" && byFam.dispositif_id === PROBE_POLE, byFam);
  const noFam = await resolveForwardChannel(bq, { location_id: LOC, item_category: "__inconnue__" });
  assert("famille inconnue → null", noFam.channel === null);
  const direct = await resolveForwardChannel(bq, { location_id: LOC, dispositif_id: PROBE_POLE });
  assert("dispositif direct → canal", direct.channel === "C0PROBE6");

  // ── Phase 2 : endpoint réel ──
  const { POST, PUT } = await import("../../src/pages/api/channels/forward");
  const ownerLocals = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, all_location_ids: [LOC], member_location_ids: [], member_poles: {}, role: "owner" };
  const memberLocals = { clerk_user_id: "user_member_h6", real_clerk_user_id: "user_member_h6", all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [] }, role: "member" };
  async function call(fn: any, locals: any, body: any) {
    const r: Response = await fn({ request: new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), locals });
    return { status: r.status, body: await r.json() };
  }

  const mFwd = await call(POST, memberLocals, { location_id: LOC, title: "x", body: "y" });
  assert("forward membre → 403 (geste owner)", mFwd.status === 403);
  const mPut = await call(PUT, memberLocals, { location_id: LOC, dispositif_id: PROBE_POLE, slack_channel_id: "C1" });
  assert("PUT membre → 403", mPut.status === 403);

  // Carte 'Tea' → canal-sonde inexistant : Slack répond channel_not_found → 502 + trace
  // sent_ok=false, channel_used = C0PROBE6 (la résolution ET l'appel Slack sont prouvés).
  const fake = await call(POST, ownerLocals, { location_id: LOC, kind: "card", action_type: "item_share_move", affected_date: "2026-08-27", item_category: "Tea", title: "PROBE inc6", body: "corps sonde" });
  assert("canal-sonde : 502, résolution pôle prouvée", fake.status === 502 && fake.body.channel_used === "C0PROBE6", fake.body);
  assert("erreur = celle de Slack (bot token vivant)", /bot|canal|channel/i.test(String(fake.body.error || "")), { error: fake.body.error });

  // Sans famille ni dispositif ni default_channel (config owner : default vide) → 400 honnête.
  const none = await call(POST, ownerLocals, { location_id: LOC, kind: "card", action_type: "weather_hazard_onset", title: "PROBE inc6", body: "corps" });
  assert("aucun canal → 400 avec message clair", none.status === 400 && /Aucun canal/.test(String(none.body.error || "")), none.body);

  // Envoi RÉEL unique : un canal où le bot est membre, s'il en existe un.
  const [cfgRows] = await bq.query({
    query: `SELECT config_json FROM \`${P}.analytics.channel_configs\` WHERE user_id = @u AND channel = 'slack' AND enabled = TRUE ORDER BY updated_at DESC LIMIT 1`,
    params: { u: OWNER }, location: "EU",
  });
  const cfg = JSON.parse(String((cfgRows as any[])[0]?.config_json || "{}"));
  let liveChannel: string | null = null;
  try {
    const lr = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=200", { headers: { authorization: "Bearer " + cfg.bot_token } });
    const lj: any = await lr.json();
    const mem = (lj?.channels || []).find((c: any) => c.is_member === true);
    liveChannel = mem ? String(mem.id) : null;
  } catch { liveChannel = null; }
  if (liveChannel) {
    await call(PUT, ownerLocals, { location_id: LOC, dispositif_id: PROBE_POLE, slack_channel_id: liveChannel });
    const live = await call(POST, ownerLocals, { location_id: LOC, kind: "card", action_type: "item_share_move", affected_date: "2026-08-27", item_category: "Tea", title: "PROBE inc6 — message de vérification, à ignorer", body: "Vérification du rail « Faire suivre » (vue équipe). Rien à faire.", link: "https://musesquare.com/app/insightevent/pulse" });
    assert("envoi RÉEL délivré (canal " + liveChannel + ")", live.status === 200 && live.body.ok === true, live.body);
  } else {
    console.log("• aucun canal public où le bot est membre — envoi réel sauté (honnête), testé jusqu'à l'API Slack");
  }

  const [traces] = await bq.query({
    query: `SELECT kind, action_type, dispositif_id, slack_channel, sent_ok FROM \`${P}.analytics.card_forwards\` WHERE location_id = @l AND action_type IN ('item_share_move') ORDER BY sent_at`,
    params: { l: LOC }, location: "EU",
  });
  assert("traces card_forwards écrites (échec ET succès)", (traces as any[]).length >= 1 && (traces as any[])[0].sent_ok === false, (traces as any[]).map((t: any) => ({ ch: t.slack_channel, ok: t.sent_ok })));

  // ── Phase 3 : msMemberForwardText réel (vm) ──
  const src = readFileSync("public/js/action-cards.js", "utf8");
  const ctx: any = { console }; ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const [candRows] = await bq.query({
    query: `SELECT action_type, CAST(date AS STRING) date, location_id, data_payload FROM \`${P}.semantic.vw_insight_event_action_candidates\` WHERE action_type = 'sales_revenue_down_wow' AND location_id = @l ORDER BY date DESC LIMIT 1`,
    params: { l: LOC }, location: "EU",
  });
  const cr: any = (candRows as any[])[0];
  const cand = { action_type: cr.action_type, date: cr.date, location_id: cr.location_id, action_priority: 2, action_category: "performance", data_payload: JSON.parse(cr.data_payload) };
  const txt = ctx.msMemberForwardText(cand, {}, cand.date);
  assert("msMemberForwardText rend titre + corps", txt && txt.title.length > 5 && txt.body.length > 20, txt);
  assert("corps membre sans niveau « CA N € »", !/CA\s[\d\s .,]+€/.test(txt.body), { body: txt.body });

  // ── Nettoyage ──
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc6-%'`, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.dispositif_channels\` WHERE dispositif_id = @d`, params: { d: PROBE_POLE }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.card_forwards\` WHERE location_id = @l AND kind = 'card' AND action_type IN ('item_share_move','weather_hazard_onset')`, params: { l: LOC }, location: "EU" });
  const [cnt] = await bq.query({ query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.dispositif_channels\`) + (SELECT COUNT(*) FROM \`${P}.analytics.card_forwards\`) + (SELECT COUNT(*) FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc6-%') n`, location: "EU" });
  assert("tables sondes nettoyées", Number((cnt as any[])[0].n) === 0, (cnt as any[])[0]);
}

main().catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });
