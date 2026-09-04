// src/lib/profile/onboardingClaim.ts — C3 : réclamation du profil pré-provisionné au premier login.
// À l'invitation, admin/invite.ts crée la ligne profil sous une clé en attente
// (clerk_user_id = « invite:<uuid> », posée aussi dans publicMetadata.provision_key de
// l'invitation — Clerk la recopie sur l'utilisateur à l'inscription). Au premier chargement
// de /profile (le middleware y force tout compte sans ligne), cette fonction bascule la ligne
// vers le vrai clerk_user_id : l'invité arrive sur un compte où contexte géo, suivis proposés
// et couverture événements ont déjà tourné depuis J0.
// Sûre par construction : le format « invite:<uuid> » ne peut pas être un id Clerk réel ;
// UPDATE exact sur la clé ; idempotente (deuxième appel = 0 ligne touchée).
const PROJECT = "muse-square-open-data";
const TABLE = "raw.insight_event_user_location_profile";

export interface ClaimResult {
  claimed: boolean;
  location_ids: string[];
}

export async function claimProvisionedProfile(
  bq: any,
  opts: { clerk_user_id: string; email: string | null; provision_key: string }
): Promise<ClaimResult> {
  const pk = String(opts.provision_key || "").trim();
  const uid = String(opts.clerk_user_id || "").trim();
  // Garde-fous : jamais de bascule vers/depuis autre chose que le format attendu.
  if (!/^invite:[0-9a-f-]{36}$/.test(pk) || !/^user_\w+$/.test(uid)) {
    return { claimed: false, location_ids: [] };
  }
  await bq.query({
    query: `UPDATE \`${PROJECT}.${TABLE}\`
            SET clerk_user_id = @uid,
                email = IF(@em IS NULL, email, @em),
                updated_at = CURRENT_TIMESTAMP()
            WHERE clerk_user_id = @pk`,
    params: { uid, em: opts.email || null, pk },
    types: { uid: "STRING", em: "STRING", pk: "STRING" },
    location: "EU",
  });
  // C4 : la veille posée par l'admin AVANT l'inscription (concurrents suivis pour ce compte)
  // porte la même clé en attente — elle bascule avec le profil. Non fatal par table : un échec
  // ici ne bloque jamais la réclamation du profil (les lectures de veille passent par location_id).
  for (const t of ["raw.watched_competitors", "raw.competitor_tracking"]) {
    await bq.query({
      query: `UPDATE \`${PROJECT}.${t}\` SET clerk_user_id = @uid WHERE clerk_user_id = @pk`,
      params: { uid, pk },
      types: { uid: "STRING", pk: "STRING" },
      location: "EU",
    }).catch(() => {});
  }
  // Vérité relue : ce que le compte possède APRÈS bascule (0 ligne = rien à réclamer, no-op).
  const [rows] = await bq.query({
    query: `SELECT location_id FROM \`${PROJECT}.${TABLE}\` WHERE clerk_user_id = @uid`,
    params: { uid },
    types: { uid: "STRING" },
    location: "EU",
  });
  const ids = (Array.isArray(rows) ? rows : []).map((r: any) => String(r.location_id || "")).filter(Boolean);
  return { claimed: ids.length > 0, location_ids: ids };
}
