// Profile + membership context — extracted from middleware.js (incrément 2, vue équipe,
// docs/vue-equipe-slack-spec.md) so the seam is testable outside Astro.
//
// ONE BigQuery round-trip covers both identities (budget perf : jamais une seconde
// requête séquentielle dans le middleware) :
//   - owner rows  : raw.insight_event_user_location_profile (comportement historique intact)
//   - member rows : analytics.location_members, lecture journal latest-wins
//     (ROW_NUMBER par member_id, tombstone deleted=TRUE) — patron saved_item_participants.
//
// SÉCURITÉ : all_location_ids reste POSSÉDÉ SEULEMENT — c'est la liste que vérifie
// requireLocationOwnership. Les sites membres vivent dans member_location_ids, consommés
// uniquement par requireLocationAccess. Ne jamais fusionner les deux listes.

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function getProfileContext(bq, clerk_user_id) {
  const projectId = mustGetEnv("BQ_PROJECT_ID");
  const dataset = mustGetEnv("BQ_DATASET");
  const table = mustGetEnv("BQ_TABLE");

  const sql = `
    WITH owner_rows AS (
      SELECT
        'owner' AS kind,
        location_id,
        first_name,
        is_primary,
        (company_geocode_status = 'geocoded_ok') AS geo_ok,
        created_at,
        CAST(NULL AS STRING) AS poles_json
      FROM \`${projectId}.${dataset}.${table}\`
      WHERE clerk_user_id = @clerk_user_id
    ),
    member_rows AS (
      SELECT
        'member' AS kind,
        location_id,
        CAST(NULL AS STRING) AS first_name,
        FALSE AS is_primary,
        FALSE AS geo_ok,
        created_at,
        pole_dispositif_ids AS poles_json
      FROM (
        -- Latest-wins sur la table ENTIÈRE, filtre APRÈS rn=1 : un tombstone écrit par
        -- l'owner (clé member_id, sans clerk_user_id) doit gagner. Filtrer avant le
        -- ROW_NUMBER le rendrait invisible et la ligne morte compterait encore —
        -- défaut attrapé par le harnais (scripts/vue-equipe-access-harness.ts).
        SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
        FROM \`${projectId}.analytics.location_members\`
      )
      WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE AND clerk_user_id = @clerk_user_id
    )
    SELECT * FROM owner_rows
    UNION ALL
    SELECT * FROM member_rows
    ORDER BY (kind = 'owner') DESC, is_primary DESC, geo_ok DESC, created_at DESC
  `;

  const [rows] = await bq.query({
    query: sql,
    location: "EU",
    params: { clerk_user_id },
  });

  const ownerRows = (rows || []).filter((r) => r.kind === "owner");
  const memberRows = (rows || []).filter((r) => r.kind === "member");

  const all_location_ids = ownerRows.map((r) => r.location_id).filter(Boolean);

  // Un membre ré-invité peut porter 2 member_id pour le même site : dédupliquer par site,
  // en fusionnant les pôles.
  const member_poles = {};
  for (const r of memberRows) {
    if (!r.location_id) continue;
    let poles = [];
    try { poles = JSON.parse(r.poles_json || "[]"); } catch {}
    if (!Array.isArray(poles)) poles = [];
    const prev = member_poles[r.location_id] || [];
    member_poles[r.location_id] = Array.from(new Set(prev.concat(poles.filter(Boolean))));
  }
  const member_location_ids = Object.keys(member_poles);

  const first = ownerRows[0] || {};
  return {
    ok: ownerRows.length > 0,
    location_id: first.location_id ?? null,
    first_name: first.first_name ?? null,
    all_location_ids,
    member_location_ids,
    member_poles,
    is_member: member_location_ids.length > 0,
  };
}

// ── Résolution email → clerk_user_id à la première connexion ──────────────────────────
// L'owner invite par email (ligne location_members SANS clerk_user_id). Au premier accès
// d'un utilisateur qui n'a NI profil NI membership résolu, on lit son email via l'API
// backend Clerk (fetch direct api.clerk.com, CLERK_SECRET_KEY — pas le client lié au
// contexte, pour rester testable hors requête), on cherche les invitations en attente par
// email, et on journalise une ligne de résolution (même member_id, clerk_user_id posé —
// latest-wins fait le reste). INSERT DML, pas streaming : geste rarissime (une fois par
// membre), et le DML reste nettoyable/corrigeable immédiatement.
// Ne jette JAMAIS : un échec de résolution ne doit pas casser un login (repli = flux
// onboarding normal). Retourne true SEULEMENT si une invitation a été résolue (l'appelant
// ne re-lit le contexte que dans ce cas). Tentée UNE fois par utilisateur et par process :
// un utilisateur en cours d'onboarding fait plusieurs requêtes sans profil — sans ce
// garde, chacune paierait l'appel Clerk + la recherche BQ.
const _resolutionAttempted = new Set();

export async function resolvePendingMembership(bq, clerk_user_id) {
  if (_resolutionAttempted.has(clerk_user_id)) return false;
  _resolutionAttempted.add(clerk_user_id);
  try {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return false;
    const res = await fetch(
      "https://api.clerk.com/v1/users/" + encodeURIComponent(clerk_user_id),
      { headers: { authorization: "Bearer " + secret } },
    );
    if (!res.ok) return false;
    const user = await res.json().catch(() => null);
    const emails = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
    const primary = emails.find((e) => e.id === user?.primary_email_address_id) || emails[0];
    const email = String(primary?.email_address || "").trim().toLowerCase();
    if (!email) return false;

    const projectId = mustGetEnv("BQ_PROJECT_ID");
    // Le SELECT du DML redonne les lignes insérées via un THEN RETURN impossible ici ;
    // on lit d'abord s'il existe des invitations en attente, puis on insère. Deux
    // allers-retours, mais UNIQUEMENT sur ce chemin rarissime (première connexion d'un
    // utilisateur sans profil), jamais sur le chemin chaud du middleware.
    const pendingSql = `
      SELECT member_id
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
        FROM \`${projectId}.analytics.location_members\`
      )
      WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE
        AND LOWER(member_email) = @email AND clerk_user_id IS NULL
    `;
    const [pending] = await bq.query({ query: pendingSql, location: "EU", params: { email } });
    if (!pending || pending.length === 0) return false;

    await bq.query({
      query: `
        INSERT INTO \`${projectId}.analytics.location_members\`
          (member_id, location_id, member_email, clerk_user_id, role, pole_dispositif_ids,
           deleted, created_at, updated_at)
        SELECT member_id, location_id, member_email, @clerk_user_id, role,
               pole_dispositif_ids, FALSE, created_at, CURRENT_TIMESTAMP()
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
          FROM \`${projectId}.analytics.location_members\`
        )
        WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE
          AND LOWER(member_email) = @email AND clerk_user_id IS NULL
      `,
      location: "EU",
      params: { clerk_user_id, email },
    });
    return true;
  } catch (e) {
    console.log("[profileContext] resolvePendingMembership failed:", e?.message || e);
    return false;
  }
}
