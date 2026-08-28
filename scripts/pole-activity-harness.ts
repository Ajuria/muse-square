// Harnais poleActivity (Historique du pôle, build Piloter pôles 28/08) — BQ RÉEL, sondes
// sur une LOCATION PROBE (aucune lecture/écriture sur un compte réel), nettoyées en fin.
// Couvre : fusion verdict/version/geste/envoi par pôle, join geste→pôle par commitment_id,
// exclusion hors périmètre + envois en échec, tri, résolution identité→nom (roster).
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";

const P = "muse-square-open-data";
const LOC = "probe-poleact-loc";
const POLE = "probe-poleact-pole";
const OP = "probe-poleact-op1";
const CLERK = "probe-poleact-clerk-1";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 200) : ""));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = raw ? new BigQuery({ projectId: P, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: P });

  // ── Nettoyage préalable (une exécution interrompue ne doit pas fausser celle-ci) ──
  await cleanup(bq);

  // ── Sondes ──
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
      (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
       dispositif_id, version_no, dispositif_nature, committed_action_text)
      VALUES
      ('probe-poleact-pole-c1', @u, @l, 'open', 'user', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY), TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY), 'create', @p, 1, 'permanent', 'Pôle probe — familles test'),
      ('probe-poleact-pole-c2', @u, @l, 'open', 'user', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY), TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY), 'create', @p, 2, 'permanent', 'Pôle probe — réorganisé')`,
    params: { u: CLERK, l: LOC, p: POLE }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
      (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
       dispositif_id, version_no, attached_pole_id, committed_action_text, verdict, kpi_delta_pct, resolved_at)
      VALUES ('${OP}', @u, @l, 'resolved', 'user', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY), TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY), 'create',
              '${OP}', 1, @p, 'Op probe — corner', 'missed', -12.3, TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY))`,
    params: { u: CLERK, l: LOC, p: POLE }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_log\` (log_id, user_id, location_id, action_key, action_text, event, created_at)
      VALUES (GENERATE_UUID(), @u, @l, 'disposition:${OP}', 'note probe', 'member_gesture', CURRENT_TIMESTAMP()),
             (GENERATE_UUID(), @u, @l, 'disposition:probe-poleact-ailleurs', 'hors périmètre', 'member_gesture', CURRENT_TIMESTAMP())`,
    params: { u: CLERK, l: LOC }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.card_forwards\` (forward_id, location_id, user_id, kind, dispositif_id, slack_channel, sent_ok, sent_at)
      VALUES ('probe-poleact-f1', @l, @u, 'card', @p, 'C000PROBE', TRUE, CURRENT_TIMESTAMP()),
             ('probe-poleact-f2', @l, @u, 'card', @p, 'C000PROBE', FALSE, CURRENT_TIMESTAMP())`,
    params: { l: LOC, u: CLERK, p: POLE }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\` (member_id, location_id, member_email, clerk_user_id, role, deleted, created_at, updated_at)
      VALUES ('probe-poleact-m1', @l, 'probe@poleact.test', @u, 'member', FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: { l: LOC, u: CLERK }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.team_members\` (member_id, user_id, location_id, first_name, last_name, role, channels_contact, created_at, updated_at, status)
      VALUES ('probe-poleact-t1', @u, @l, 'Probe', 'Pole', 'Testeur', '{"email":"probe@poleact.test"}', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), 'active')`,
    params: { u: CLERK, l: LOC }, location: "EU",
  });

  const { buildPoleActivity, resolveMemberNames } = await import("../src/lib/poleActivity");

  // ── Lecture ──
  const feed = await buildPoleActivity(bq as any, LOC, [POLE]);
  const rows = feed[POLE] || [];
  assert("le pôle porte 4 événements (verdict+version+geste+envoi)", rows.length === 4, rows.map((r) => r.kind));
  const verdict = rows.find((r) => r.kind === "verdict");
  assert("verdict : missed − 12,3 % + texte verbatim", !!verdict && verdict.verdict === "missed" && verdict.delta_pct === -12.3 && verdict.text === "Op probe — corner", verdict);
  const version = rows.find((r) => r.kind === "version");
  assert("version : V2 du pôle + texte verbatim", !!version && version.version_no === 2 && version.text === "Pôle probe — réorganisé", version);
  const geste = rows.find((r) => r.kind === "geste");
  assert("geste : auteur réel + disposition + note", !!geste && geste.author_id === CLERK && geste.gesture === "disposition" && geste.note === "note probe", geste);
  const envoi = rows.filter((r) => r.kind === "envoi");
  assert("envoi : kind card, l'échec sent_ok=FALSE exclu", envoi.length === 1 && envoi[0].forward_kind === "card", envoi);
  assert("le geste hors périmètre est ignoré", !rows.some((r) => r.note === "hors périmètre"));
  const sorted = rows.every((r, i) => i === 0 || rows[i - 1].ts >= r.ts);
  assert("tri décroissant par ts", sorted, rows.map((r) => r.ts));

  const other = await buildPoleActivity(bq as any, LOC, ["probe-poleact-autre-pole"]);
  assert("un autre pôle rend un fil vide", (other["probe-poleact-autre-pole"] || []).length === 0);
  const empty = await buildPoleActivity(bq as any, LOC, []);
  assert("aucun pôle → objet vide, zéro requête", Object.keys(empty).length === 0);

  // ── Noms ──
  const names = await resolveMemberNames(bq as any, LOC);
  assert("identité clerk → nom du roster (par l'email)", names[CLERK] === "Probe Pole", names);
  const namesElsewhere = await resolveMemberNames(bq as any, "probe-poleact-autre-loc");
  assert("aucune fuite de noms hors location", Object.keys(namesElsewhere).length === 0, namesElsewhere);

  // ── Nettoyage ──
  await cleanup(bq);
  const [[left]] = await bq.query({
    query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.action_commitments\` WHERE location_id = @l)
            + (SELECT COUNT(*) FROM \`${P}.analytics.action_log\` WHERE location_id = @l)
            + (SELECT COUNT(*) FROM \`${P}.analytics.card_forwards\` WHERE location_id = @l)
            + (SELECT COUNT(*) FROM \`${P}.analytics.location_members\` WHERE location_id = @l)
            + (SELECT COUNT(*) FROM \`${P}.analytics.team_members\` WHERE location_id = @l) AS n`,
    params: { l: LOC }, location: "EU",
  });
  assert("sondes nettoyées (0 ligne probe restante)", Number((left as any).n) === 0, left);
}

async function cleanup(bq: BigQuery) {
  for (const t of ["action_commitments", "action_log", "card_forwards", "location_members", "team_members"]) {
    await bq.query({ query: `DELETE FROM \`${P}.analytics.${t}\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" });
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
