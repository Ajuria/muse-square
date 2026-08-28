// Harnais incrément 2 (Piloter pôles 28/08) — bloc pôles de dashboard.ts sur le VRAI handler
// + BQ réel (compte owner f10c3e58). Sondes chirurgicales sur le compte réel (patron
// vue-equipe-gestes-harness), nettoyées par leurs IDS EXACTS — jamais un delete large.
// Couvre : état sans pôle (poles: []), bloc owner complet (lecture, impact famille calculé
// sur SON KPI, next, connaissances, Historique avec auteur RÉSOLU EN NOM), projection membre
// (balayage récursif : AUCUN niveau €), et l'owner inchangé sur ses blocs existants.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";

const P = "muse-square-open-data";
const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const POLE = "probe-pldash-pole";
const C_POLE = "probe-pldash-c-pole";
const C_RES = "probe-pldash-c-res";
const C_OPEN = "probe-pldash-c-open";
const CLERK = "probe-pldash-clerk";
const M_ID = "probe-pldash-m1";
const T_ID = "probe-pldash-t1";
const MEMBER_LOCALS = { clerk_user_id: CLERK, real_clerk_user_id: CLERK, all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [POLE] }, role: "member" };
const OWNER_LOCALS = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, all_location_ids: [LOC], member_location_ids: [], member_poles: {}, role: "owner" };

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 240) : ""));
  if (!cond) process.exitCode = 1;
}

// Balayage récursif : aucune clé de NIVEAU € dans un objet membre (règle chiffres 28/08 —
// seuls les écarts/cumuls bornés au pôle passent : gap_eur d'impact).
function levelLeaks(o: any, path = ""): string[] {
  const bad = ["rev30_eur", "avg30_eur_day", "base_eur_day", "rev_eur"];
  const out: string[] = [];
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (bad.includes(k)) out.push(path + k);
      out.push(...levelLeaks(o[k], path + k + "."));
    }
  }
  return out;
}

async function cleanup(bq: BigQuery) {
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE location_id = @l AND commitment_id IN ('${C_POLE}', '${C_RES}', '${C_OPEN}')`, params: { l: LOC }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_log\` WHERE location_id = @l AND action_key IN ('disposition:${C_RES}')`, params: { l: LOC }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.location_members\` WHERE member_id = '${M_ID}'`, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.analytics.team_members\` WHERE member_id = '${T_ID}'`, location: "EU" });
}

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = raw ? new BigQuery({ projectId: P, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: P });
  const { GET } = await import("../src/pages/api/insight/dashboard");
  const call = async (locals: any) => {
    const r: Response = await (GET as any)({ url: new URL("http://l/api/insight/dashboard?period=365"), locals });
    return await r.json();
  };

  await cleanup(bq);

  // ── 1. État réel SANS pôle : le champ existe, vide, et les blocs owner sont intacts. ──
  const before = await call(OWNER_LOCALS);
  assert("owner sans pôle : ok + poles = []", before.ok === true && Array.isArray(before.poles) && before.poles.length === 0, before.poles);
  assert("owner : blocs existants intacts (impact/operations/glance/practices)", !!before.impact && Array.isArray(before.operations) && !!before.glance && Array.isArray(before.practices));

  // ── 2. Sondes : pôle + op jugée (famille, KPI posés) + op à venir + geste + identités. ──
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
      (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
       dispositif_id, version_no, dispositif_nature, pole_families, committed_action_text, owner_person_name)
      VALUES ('${C_POLE}', @u, @l, 'open', 'user', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 9 DAY), TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 9 DAY), 'create',
              '${POLE}', 1, 'permanent', '["ProbeFam"]', 'Pôle probe PLDASH — levier test', 'Probe Resp')`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
      (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
       dispositif_id, version_no, attached_pole_id, committed_action_text, measured_metric,
       window_start, window_end, kpi_baseline, kpi_window_value, kpi_delta_pct, verdict, resolved_at)
      VALUES ('${C_RES}', @u, @l, 'resolved', 'user', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 8 DAY), TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 6 DAY), 'create',
              '${C_RES}', 1, '${POLE}', 'Op probe jugée', 'family_revenue',
              DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY), DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY), 56.2, 28.0, -50.2, 'missed', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 6 DAY))`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_commitments\`
      (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
       dispositif_id, version_no, attached_pole_id, committed_action_text, measured_metric, window_start, window_end)
      VALUES ('${C_OPEN}', @u, @l, 'open', 'user', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY), TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY), 'create',
              '${C_OPEN}', 1, '${POLE}', 'Op probe à venir', 'family_revenue',
              DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY), DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY))`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.action_log\` (log_id, user_id, location_id, action_key, action_text, event, created_at)
      VALUES (GENERATE_UUID(), '${CLERK}', @l, 'disposition:${C_RES}', 'note probe pldash', 'member_gesture', CURRENT_TIMESTAMP())`,
    params: { l: LOC }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\` (member_id, location_id, member_email, clerk_user_id, role, deleted, created_at, updated_at)
      VALUES ('${M_ID}', @l, 'probe@pldash.test', '${CLERK}', 'member', FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: { l: LOC }, location: "EU",
  });
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.team_members\` (member_id, user_id, location_id, first_name, last_name, role, channels_contact, created_at, updated_at, status)
      VALUES ('${T_ID}', @u, @l, 'Probe', 'Membre', 'Testeur', '{"email":"probe@pldash.test"}', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), 'active')`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });

  // ── 3. Owner : le bloc pôles complet. ──
  const o = await call(OWNER_LOCALS);
  const pole = (o.poles || []).find((x: any) => x.dispositif_id === POLE);
  assert("owner : le pôle sonde est là", !!pole, (o.poles || []).map((x: any) => x.dispositif_id));
  assert("owner : nom + levier + responsable + familles + site", !!pole && pole.name === "Pôle probe PLDASH" && pole.lever === "levier test" && pole.responsable === "Probe Resp" && JSON.stringify(pole.families) === '["ProbeFam"]' && pole.site_label === "Muse Square", pole && { n: pole.name, l: pole.lever, r: pole.responsable });
  assert("owner : lecture honnête (famille sonde sans vente → rev30 null, delta null)", !!pole && pole.reading.rev30_eur == null && pole.reading.delta_pct == null, pole && pole.reading);
  assert("owner : impact famille = (28,0 − 56,2) × 1 j = −28 € sur 1 fenêtre", !!pole && !!pole.impact && pole.impact.gap_eur === -28 && pole.impact.eur_windows === 1, pole && pole.impact);
  assert("owner : prochain verdict = l'op à venir", !!pole && !!pole.next && pole.next.text === "Op probe à venir", pole && pole.next);
  assert("owner : connaissances = 0 prouvé · 2 en test (2 chaînes rattachées)", !!pole && pole.connaissances.prouves === 0 && pole.connaissances.en_test === 2, pole && pole.connaissances);
  assert("owner : commitment_id de la version courante (cible des CTA du volet)", !!pole && pole.commitment_id === C_POLE, pole && pole.commitment_id);
  assert("owner : opérations du volet (2 rattachées, la jugée porte son verdict)", !!pole && Array.isArray(pole.operations) && pole.operations.length === 2
    && pole.operations.some((x: any) => x.commitment_id === C_RES && x.verdict === "missed" && x.text === "Op probe jugée")
    && pole.operations.some((x: any) => x.commitment_id === C_OPEN && x.status === "open"), pole && pole.operations);
  const hVerdict = pole && pole.historique.find((h: any) => h.kind === "verdict");
  const hGeste = pole && pole.historique.find((h: any) => h.kind === "geste");
  assert("owner Historique : verdict (missed −50,2) + texte", !!hVerdict && hVerdict.verdict === "missed" && hVerdict.delta_pct === -50.2 && hVerdict.text === "Op probe jugée", hVerdict);
  assert("owner Historique : geste avec AUTEUR RÉSOLU EN NOM (jamais l'id)", !!hGeste && hGeste.author === "Probe Membre" && hGeste.note === "note probe pldash" && !("author_id" in (hGeste || {})), hGeste);

  // ── 4. Membre : projection sans niveau €. ──
  const m = await call(MEMBER_LOCALS);
  const mp = (m.poles || []).find((x: any) => x.dispositif_id === POLE);
  assert("membre : son pôle est là, role member", m.role === "member" && !!mp, (m.poles || []).length);
  assert("membre : AUCUNE clé de niveau € (balayage récursif)", levelLeaks(m.poles).length === 0, levelLeaks(m.poles));
  assert("membre : impact borné au pôle passe (−28 €)", !!mp && !!mp.impact && mp.impact.gap_eur === -28, mp && mp.impact);
  assert("membre : unités/jour honnêtes (famille sonde sans vente → null)", !!mp && mp.units30_day == null && mp.units_base_day == null, mp && { a: mp.units30_day, b: mp.units_base_day });
  assert("membre : familles en % seulement", !!mp && Array.isArray(mp.families) && mp.families.every((f: any) => Object.keys(f).sort().join(",") === "delta_pct,family"), mp && mp.families);
  assert("membre : l'op à venir passe dans À faire (périmètre existant)", (m.open_commitments || []).some((c: any) => c.commitment_id === C_OPEN));
  assert("membre : le PÔLE lui-même n'est PAS une tâche d'À faire", !(m.open_commitments || []).some((c: any) => c.commitment_id === C_POLE));
  // Owner : le pôle ne devient jamais une carte d'opération (attrapé au dump réel 28/08 —
  // la sélection mesures est nature-aware, comme le cron de résolution).
  assert("owner : le pôle n'est pas une carte « Opérations en cours »", !((o.glance || {}).mesures || []).some((x: any) => x.commitment_id === C_POLE));

  // ── 5. Nettoyage chirurgical + preuve. ──
  await cleanup(bq);
  const [[left]] = await bq.query({
    query: `SELECT (SELECT COUNT(*) FROM \`${P}.analytics.action_commitments\` WHERE commitment_id IN ('${C_POLE}', '${C_RES}', '${C_OPEN}'))
            + (SELECT COUNT(*) FROM \`${P}.analytics.action_log\` WHERE action_key = 'disposition:${C_RES}')
            + (SELECT COUNT(*) FROM \`${P}.analytics.location_members\` WHERE member_id = '${M_ID}')
            + (SELECT COUNT(*) FROM \`${P}.analytics.team_members\` WHERE member_id = '${T_ID}') AS n`,
    location: "EU",
  });
  assert("sondes nettoyées (0 restante)", Number((left as any).n) === 0, left);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
