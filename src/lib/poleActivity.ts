// src/lib/poleActivity.ts
// L'HISTORIQUE d'un pôle (proto Piloter validé owner 28/08) — PREMIER lecteur des traces
// équipe : `action_log event='member_gesture'` et `analytics.card_forwards` étaient écrits
// sans aucun lecteur en production. Fusion en fil daté PAR PÔLE de quatre sources :
//   verdict  — opération rattachée jugée (journal des engagements, attached_pole_id)
//   version  — ajustement du pôle ou d'une opération (version_no >= 2 de la chaîne)
//   geste    — disposition / retro d'un membre (action_log, auteur réel)
//   envoi    — message parti vers le canal Slack du pôle (card_forwards, sent_ok)
// Le rattachement opération→pôle est `attached_pole_id`, JAMAIS `parent_commitment_id`
// (filiation de versions — spec pôles 27/08). Requêtes AMORCÉES tôt, attendues ensemble.

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const s = (v: any): string | null => (v == null ? null : String(flat(v)) || null);

export interface PoleActivityRow {
  ts: string;                       // timestamp ISO de l'événement (tri)
  d: string;                        // date ISO (affichage JJ/MM côté client)
  kind: "verdict" | "version" | "geste" | "envoi";
  text: string | null;              // titre de l'opération / du pôle (texte user verbatim, tronqué au rendu)
  // verdict
  verdict?: string | null;          // met | missed | confounded | beat
  delta_pct?: number | null;        // kpi_delta_pct de l'occurrence jugée
  // version
  version_no?: number | null;
  // geste
  author_id?: string | null;        // clerk_user_id ou slack:<id> — à résoudre en NOM avant affichage
  gesture?: string | null;          // disposition | retro
  note?: string | null;             // note du membre, verbatim
  // envoi
  forward_kind?: string | null;     // card | fiche | underperf3 | …
}

// Fil d'activité par pôle. `poleIds` = dispositif_id des pôles (version courante ouverte).
export async function buildPoleActivity(
  bq: any,
  location_id: string,
  poleIds: string[],
  limit = 20,
): Promise<Record<string, PoleActivityRow[]>> {
  const out: Record<string, PoleActivityRow[]> = {};
  if (!poleIds.length) return out;
  for (const p of poleIds) out[p] = [];

  // Q1 — journal des engagements : versions du pôle + opérations rattachées (verdicts,
  // versions d'opération) + la carte commitment_id→pôle qui sert au join des gestes.
  const comsP = bq.query({
    query: `
      SELECT commitment_id, dispositif_id, attached_pole_id, version_no, status, verdict,
             committed_action_text, kpi_delta_pct, dispositif_nature,
             CAST(DATE(resolved_at) AS STRING) AS resolved_d,
             CAST(resolved_at AS STRING) AS resolved_ts,
             CAST(DATE(created_at) AS STRING) AS created_d,
             CAST(created_at AS STRING) AS created_ts
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
          CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
          (verdict IS NOT NULL) DESC, created_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE location_id = @loc
          AND (dispositif_id IN UNNEST(@poles) OR attached_pole_id IN UNNEST(@poles))
      )
      WHERE rn = 1 AND status != 'cancelled'`,
    params: { loc: location_id, poles: poleIds },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  // Q2 — gestes membres : tout l'événement du site (le rattachement au pôle se fait par la
  // carte commitment_id→pôle de Q1 ; un geste hors périmètre est simplement ignoré).
  const gestesP = bq.query({
    query: `
      SELECT user_id, action_key, action_text,
             CAST(DATE(created_at) AS STRING) AS d, CAST(created_at AS STRING) AS ts
      FROM \`${PROJECT}.analytics.action_log\`
      WHERE location_id = @loc AND event = 'member_gesture'
        AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 120 DAY)`,
    params: { loc: location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  // Q3 — envois Slack routés sur le pôle (succès seulement : l'Historique dit ce qui est parti).
  const envoisP = bq.query({
    query: `
      SELECT kind, action_type,
             CAST(DATE(sent_at) AS STRING) AS d, CAST(sent_at AS STRING) AS ts, dispositif_id
      FROM \`${PROJECT}.analytics.card_forwards\`
      WHERE location_id = @loc AND dispositif_id IN UNNEST(@poles) AND sent_ok = TRUE
        AND sent_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 120 DAY)`,
    params: { loc: location_id, poles: poleIds },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  const [coms, gestes, envois] = await Promise.all([comsP, gestesP, envoisP]);

  const poleSet = new Set(poleIds);
  const poleOfCommitment = new Map<string, string>();
  for (const r of coms as any[]) {
    const cid = s(r.commitment_id);
    const dsp = s(r.dispositif_id);
    const att = s(r.attached_pole_id);
    const pole = att && poleSet.has(att) ? att : dsp && poleSet.has(dsp) ? dsp : null;
    if (!cid || !pole) continue;
    poleOfCommitment.set(cid, pole);
    const text = s(r.committed_action_text);
    const vno = r.version_no != null ? Number(flat(r.version_no)) : null;
    // Ajustement (V2+) : du pôle lui-même ou d'une opération rattachée.
    if (vno != null && vno >= 2 && s(r.created_d)) {
      out[pole].push({ ts: s(r.created_ts)!, d: s(r.created_d)!, kind: "version", text, version_no: vno });
    }
    // Verdict d'une opération rattachée (jamais du pôle : un permanent n'est pas jugé).
    if (att && poleSet.has(att) && s(r.status) === "resolved" && s(r.verdict) && s(r.resolved_d)) {
      out[pole].push({
        ts: s(r.resolved_ts)!, d: s(r.resolved_d)!, kind: "verdict", text,
        verdict: s(r.verdict), delta_pct: r.kpi_delta_pct != null ? Number(flat(r.kpi_delta_pct)) : null,
      });
    }
  }

  for (const r of gestes as any[]) {
    const key = s(r.action_key) || "";
    const i = key.indexOf(":");
    if (i <= 0) continue;
    const gesture = key.slice(0, i);
    const cid = key.slice(i + 1);
    const pole = poleOfCommitment.get(cid);
    if (!pole) continue;
    out[pole].push({
      ts: s(r.ts)!, d: s(r.d)!, kind: "geste", text: null,
      author_id: s(r.user_id), gesture, note: s(r.action_text),
    });
  }

  for (const r of envois as any[]) {
    const pole = s(r.dispositif_id);
    if (!pole || !poleSet.has(pole)) continue;
    out[pole].push({ ts: s(r.ts)!, d: s(r.d)!, kind: "envoi", text: null, forward_kind: s(r.kind) });
  }

  for (const p of poleIds) {
    out[p].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    out[p] = out[p].slice(0, Math.max(1, limit));
  }
  return out;
}

// Résolution IDENTITÉ → NOM affichable (jamais un id brut à l'écran) : les auteurs de gestes
// sont des clerk_user_id ou `slack:<id>` (localsFromSlackUser) ; les noms vivent dans le
// roster `team_members` (first/last + channels_contact.email) et le lien passe par l'email
// de `location_members`. Best-effort : une identité sans nom rend null — l'appelant choisit
// le repli d'affichage, jamais l'id.
export async function resolveMemberNames(
  bq: any,
  location_id: string,
): Promise<Record<string, string>> {
  const membersP = bq.query({
    query: `
      SELECT clerk_user_id, slack_user_id, member_email
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
        FROM \`${PROJECT}.analytics.location_members\`
      )
      WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE AND location_id = @loc`,
    params: { loc: location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const rosterP = bq.query({
    query: `
      SELECT first_name, last_name, channels_contact
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
        FROM \`${PROJECT}.analytics.team_members\`
        WHERE location_id = @loc
      )
      WHERE rn = 1 AND COALESCE(status, 'active') != 'deleted'`,
    params: { loc: location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  const [members, roster] = await Promise.all([membersP, rosterP]);
  const nameByEmail = new Map<string, string>();
  for (const r of roster as any[]) {
    const name = [s(r.first_name), s(r.last_name)].filter(Boolean).join(" ").trim();
    if (!name) continue;
    let email: string | null = null;
    try { email = String(JSON.parse(s(r.channels_contact) || "{}")?.email || "") || null; } catch { /* contact illisible */ }
    if (email) nameByEmail.set(email.toLowerCase(), name);
  }
  const out: Record<string, string> = {};
  for (const r of members as any[]) {
    const email = (s(r.member_email) || "").toLowerCase();
    const name = email ? nameByEmail.get(email) : undefined;
    if (!name) continue;
    const clerk = s(r.clerk_user_id);
    const slack = s(r.slack_user_id);
    if (clerk) out[clerk] = name;
    if (slack) { out[slack] = name; out["slack:" + slack] = name; }
  }
  return out;
}
