// Harnais incrément 8 (vue équipe) — messages par étape du cycle.
// Phase 1 : les gabarits (slackMessagesFr) — texte exact, mots bannis absents, dates
//           JJ/MM/AAAA, boutons conformes aux arbitrages owner 28/08.
// Phase 2 : accusé IMMÉDIAT de slack-interact (ack ≪ travail) + « Pas pour moi » E2E
//           (action_log : user_id = COMPTE, method slack, auteur dans reason).
// Phase 3 : détecteur underperf-watch RÉEL en fumée — aucun canal déclaré en base, donc
//           aucun envoi possible ; on prouve la requête et la forme du résultat.
import "dotenv/config";
import crypto from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";

process.env.SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "probe-secret-inc8";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const P = "muse-square-open-data";
const TEAM = "T03H3QBQEP9";
const SLACK_USER = "U_PROBE8";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 240) : ""));
  if (!cond) process.exitCode = 1;
}
const BANNED = [/attendu/i, /la normale/i, /\bpp\b/];
function bannedIn(s: string): string | null {
  for (const re of BANNED) { const m = s.match(re); if (m) return m[0]; }
  return null;
}

async function main() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = rawKey ? new BigQuery({ projectId: P, credentials: JSON.parse(rawKey) }) : new BigQuery({ projectId: P });

  // ── Phase 1 : gabarits ──
  const { assignmentMessageFr, verdictMessageFr, underperfMessageFr } = await import("../../src/lib/channels/slackMessagesFr");

  const g2 = assignmentMessageFr({ senderName: "Julen", actionText: "Mettre le corner en avant samedi", thresholdBasis: "pct", thresholdValue: 5, thresholdLevel: "modeste", windowKind: "7d", windowEnd: "2026-09-04", commitmentId: "c1", locationId: LOC });
  assert("G2 : phrase d'assignation owner", g2.body.startsWith("Julen vous a assigné une tâche."), { body: g2.body });
  assert("G2 : objectif vs votre résultat habituel + date FR", g2.body.includes("+5 % (CA vs votre résultat habituel) sur 7 jours — verdict le 04/09/2026."), { body: g2.body });
  const g2Btns = (g2.blocks || []).flatMap((b: any) => b.elements || []).map((e: any) => e.text.text);
  assert("G2 : boutons Consulter · Ajuster, jamais Fait", JSON.stringify(g2Btns) === JSON.stringify(["Consulter", "Ajuster"]), g2Btns);
  assert("G2 : aucun mot banni", bannedIn(g2.title + " " + g2.body + " " + g2.emailBody) === null, { hit: bannedIn(g2.title + " " + g2.body + " " + g2.emailBody) });

  const g3 = verdictMessageFr({ actionText: "Corner producteur", verdict: "beat", windowStart: "2026-08-22", windowEnd: "2026-08-28", gapEur: 342.4, commitmentId: "c1", locationId: LOC });
  assert("G3 : titre owner", g3.title === "Votre opération « Corner producteur » vient d'être évaluée.", { title: g3.title });
  assert("G3 : verdict + € + période + dépassé", g3.body === "Verdict : résultat opérationnel +342 € sur la période (du 22/08/2026 au 28/08/2026), objectif dépassé.", { body: g3.body });
  const g3sans = verdictMessageFr({ actionText: "X", verdict: "missed", windowStart: "2026-08-22", windowEnd: "2026-08-28", gapEur: null, commitmentId: "c1", locationId: LOC });
  assert("G3 : sans € mesurable, la clause € disparaît (objectif manqué)", g3sans.body === "Verdict : objectif manqué.", { body: g3sans.body });
  const g3Btns = (g3.blocks || []).flatMap((b: any) => b.elements || []).map((e: any) => e.text.text);
  assert("G3 : boutons Documenter · Ajuster", JSON.stringify(g3Btns) === JSON.stringify(["Documenter", "Ajuster"]), g3Btns);
  assert("G3 : aucun mot banni", bannedIn(g3.title + " " + g3.body) === null);

  const g4 = underperfMessageFr({ actionText: "Corner producteur", days: ["2026-08-24", "2026-08-26", "2026-08-27"], gapEur: -512, commitmentId: "c1", locationId: LOC });
  assert("G4 : titre owner (sous-performé 3ᵉ fois)", g4.title === "Votre opération « Corner producteur » a sous-performé pour la 3ᵉ fois cette semaine.", { title: g4.title });
  assert("G4 : trois journées nommées + résultat habituel + −€", g4.body.includes("nettement sous votre résultat habituel : 24/08/2026, 26/08/2026, 27/08/2026.") && g4.body.includes("−512 € sur ces trois journées."), { body: g4.body });
  const g4Btns = (g4.blocks || []).flatMap((b: any) => b.elements || []).map((e: any) => e.text.text);
  assert("G4 : Ajuster seul (Documenter refusé avant résolution — signalé owner)", JSON.stringify(g4Btns) === JSON.stringify(["Ajuster"]), g4Btns);
  assert("G4 : aucun mot banni", bannedIn(g4.title + " " + g4.body) === null);

  // ── Phase 2 : ack immédiat + Pas pour moi ──
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\`
            (member_id, location_id, member_email, clerk_user_id, role, pole_dispositif_ids, slack_user_id, deleted, created_at, updated_at)
            VALUES ('probe-inc8-m1', @l, 'probe-inc8@example.invalid', NULL, 'member', '["probe-inc8-pole"]', @su, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: { l: LOC, su: SLACK_USER }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
            (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type, dispositif_id, committed_action_text,
             measured_metric, window_kind, window_start, window_end, window_days_expected, threshold_level, threshold_basis, threshold_value, owner_person_name)
            VALUES ('probe-inc8-c1', @u, @l, 'open', 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), 'create', 'probe-inc8-pole', 'PROBE inc8 — à supprimer',
             'revenue_residual', '7d', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), 7, 'modeste', 'pct', 5, 'Probe')`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });

  const si = await import("../../src/pages/api/channels/slack-interact");
  function signed(payload: any): Request {
    const raw = "payload=" + encodeURIComponent(JSON.stringify(payload));
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = "v0=" + crypto.createHmac("sha256", String(process.env.SLACK_SIGNING_SECRET)).update("v0:" + ts + ":" + raw).digest("hex");
    return new Request("http://localhost/x", { method: "POST", body: raw, headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": ts, "x-slack-signature": sig } });
  }

  const t0 = Date.now();
  const ack = await (si.POST as any)({ request: signed({ type: "block_actions", team: { id: TEAM }, user: { id: SLACK_USER }, response_url: "https://slack-response.invalid/h", actions: [{ action_id: "ms_dispo_fait", value: JSON.stringify({ c: "probe-inc8-c1", l: LOC }) }] }) });
  const tAck = Date.now() - t0;
  assert("ack immédiat : 200 en < 1,5 s (le travail court derrière)", ack.status === 200 && tAck < 1500, { tAck });
  await (si as any).__lastInteractTask;
  const tTask = Date.now() - t0;
  assert("le travail finit APRÈS l'ack (asynchrone réel)", tTask > tAck, { tAck, tTask });
  const [snap] = await bq.query({
    query: `SELECT action_done_status FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn FROM \`${P}.analytics.action_commitments\` WHERE commitment_id = 'probe-inc8-c1') WHERE rn = 1`,
    location: "EU",
  });
  assert("le geste est écrit malgré l'ack anticipé", (snap as any[])[0]?.action_done_status === "fait");

  const nf = await (si.POST as any)({ request: signed({ type: "block_actions", team: { id: TEAM }, user: { id: SLACK_USER }, response_url: "https://slack-response.invalid/h", channel: { id: "C0FAKE" }, message: { ts: "1.2" }, actions: [{ action_id: "ms_card_not_for_me", value: JSON.stringify({ l: LOC, t: "weather_hazard_onset", d: "2026-08-27", i: "probe-inst-8", cat: "context" }) }] }) });
  assert("Pas pour moi : ack 200", nf.status === 200);
  await (si as any).__lastInteractTask;
  const [alog] = await bq.query({
    query: `SELECT user_id, event, change_subtype, method, reason, card_instance_id FROM \`${P}.analytics.action_log\` WHERE method = 'slack' AND card_instance_id = 'probe-inst-8'`,
    location: "EU",
  });
  const row: any = (alog as any[])[0] || {};
  assert("Pas pour moi : card_not_done écrit, user_id = COMPTE, auteur dans reason", (alog as any[]).length === 1 && row.user_id === OWNER && row.event === "card_not_done" && row.change_subtype === "weather_hazard_onset" && String(row.reason).includes(SLACK_USER), row);

  // ── Phase 3 : détecteur réel en fumée (aucun canal en base → aucun envoi possible) ──
  const [chCount] = await bq.query({ query: `SELECT COUNT(*) n FROM \`${P}.analytics.dispositif_channels\``, location: "EU" });
  assert("précondition : aucun canal déclaré (envoi impossible)", Number((chCount as any[])[0].n) === 0);
  const { GET: WATCH } = await import("../../src/pages/api/cron/underperf-watch");
  const w = await (WATCH as any)({ request: new Request("http://localhost/x", { headers: { authorization: "Bearer " + (process.env.CRON_SECRET || "") } }) });
  const wb = await w.json();
  assert("underperf-watch : 200 ok + forme du résultat", w.status === 200 && wb.ok === true && Array.isArray(wb.results), { processed: wb.processed, results: wb.results.slice(0, 3) });
  assert("underperf-watch : zéro envoi réel (sent jamais true)", wb.results.every((r: any) => r.sent !== true), wb.results.slice(0, 3));

  // ── Nettoyage ──
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc8-%'`, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.location_members\` WHERE member_id LIKE 'probe-inc8-%'`, location: "EU" });
  try { await bq.query({ query: `DELETE FROM \`${P}.analytics.action_log\` WHERE method = 'slack' AND card_instance_id = 'probe-inst-8'`, location: "EU" }); } catch { console.log("• action_log : buffer streaming, sonde laissée"); }
  const [cnt] = await bq.query({ query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.action_commitments\` WHERE commitment_id LIKE 'probe-inc8-%') + (SELECT COUNT(*) FROM \`${P}.analytics.location_members\`) n`, location: "EU" });
  assert("sondes nettoyées", Number((cnt as any[])[0].n) === 0, (cnt as any[])[0]);
}

main().catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });
