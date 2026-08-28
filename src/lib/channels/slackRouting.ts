// Routage Slack par pôle/dispositif (vue équipe inc 6, docs/vue-equipe-slack-spec.md).
//
// L'adresse d'un canal vit dans analytics.dispositif_channels (journal latest-wins,
// grain location_id × dispositif_id — un pôle, un dispositif daté, OU une série
// saved_item_id : la colonne accepte les trois, c'est l'appelant qui sait ce qu'il
// route). Écritures en DML (geste rare, immédiatement visible et corrigeable) —
// même choix que resolvePendingMembership.

const PROJECT = "muse-square-open-data";

// Canal déclaré d'un dispositif/pôle/série — null si aucun (ou tombstone).
export async function readDispositifChannel(bq: any, location_id: string, dispositif_id: string): Promise<string | null> {
  const [rows] = await bq.query({
    query: `
      SELECT slack_channel_id FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY location_id, dispositif_id ORDER BY updated_at DESC) AS rn
        FROM \`${PROJECT}.analytics.dispositif_channels\`
        WHERE location_id = @location_id AND dispositif_id = @dispositif_id
      )
      WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE
    `,
    params: { location_id, dispositif_id },
    location: "EU",
  });
  const v = rows?.[0]?.slack_channel_id;
  return v != null && String(v).trim() !== "" ? String(v).trim() : null;
}

// Pose (ou retire, slack_channel_id null => tombstone) l'adresse du canal.
export async function writeDispositifChannel(
  bq: any,
  args: { location_id: string; dispositif_id: string; slack_channel_id: string | null },
): Promise<void> {
  await bq.query({
    query: `
      INSERT INTO \`${PROJECT}.analytics.dispositif_channels\`
        (location_id, dispositif_id, slack_channel_id, deleted, created_at, updated_at)
      VALUES (@l, @d, @c, @del, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `,
    params: { l: args.location_id, d: args.dispositif_id, c: args.slack_channel_id ?? "", del: args.slack_channel_id == null },
    location: "EU",
  });
}

// Résolution du canal d'un envoi : dispositif explicite d'abord ; sinon la famille de la
// carte → le pôle courant qui la porte (pole_families, version courante = dernière ligne
// journal du dispositif_id, pôle fermé exclu) → son canal ; sinon null (l'appelant
// replie sur le default_channel de la config Slack du compte).
export async function resolveForwardChannel(
  bq: any,
  args: { location_id: string; dispositif_id?: string | null; item_category?: string | null },
): Promise<{ channel: string | null; dispositif_id: string | null }> {
  if (args.dispositif_id) {
    const ch = await readDispositifChannel(bq, args.location_id, args.dispositif_id);
    return { channel: ch, dispositif_id: args.dispositif_id };
  }
  const fam = String(args.item_category || "").trim();
  if (!fam) return { channel: null, dispositif_id: null };
  const [rows] = await bq.query({
    query: `
      SELECT dispositif_id, pole_families FROM (
        SELECT dispositif_id, pole_families, status,
               ROW_NUMBER() OVER (PARTITION BY dispositif_id ORDER BY updated_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE location_id = @location_id AND dispositif_nature = 'permanent'
      )
      WHERE rn = 1 AND status != 'cancelled'
    `,
    params: { location_id: args.location_id },
    location: "EU",
  });
  for (const r of (rows as any[]) || []) {
    try {
      const fams = JSON.parse(String(r.pole_families || "[]"));
      if (Array.isArray(fams) && fams.map(String).includes(fam)) {
        const ch = await readDispositifChannel(bq, args.location_id, String(r.dispositif_id));
        if (ch) return { channel: ch, dispositif_id: String(r.dispositif_id) };
      }
    } catch { /* familles illisibles → pôle ignoré */ }
  }
  return { channel: null, dispositif_id: null };
}

// Trace append-only d'un envoi (patron consigne_sends) — un fait vérifiable par envoi.
export async function traceForward(
  bq: any,
  row: { location_id: string; user_id: string | null; kind: string; action_type: string | null; affected_date: string | null; dispositif_id: string | null; slack_channel: string | null; sent_ok: boolean },
): Promise<void> {
  await bq.query({
    query: `
      INSERT INTO \`${PROJECT}.analytics.card_forwards\`
        (forward_id, location_id, user_id, kind, action_type, affected_date, dispositif_id, slack_channel, sent_ok, sent_at)
      VALUES (GENERATE_UUID(), @l, @u, @k, @t, ${row.affected_date ? "DATE(@d)" : "NULL"}, @disp, @ch, @ok, CURRENT_TIMESTAMP())
    `,
    params: {
      l: row.location_id, u: row.user_id ?? "", k: row.kind, t: row.action_type ?? "",
      ...(row.affected_date ? { d: row.affected_date } : {}),
      disp: row.dispositif_id ?? "", ch: row.slack_channel ?? "", ok: row.sent_ok,
    },
    location: "EU",
  });
}
