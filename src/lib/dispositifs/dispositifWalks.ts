// src/lib/dispositifs/dispositifWalks.ts — UNE LIGNE PAR MARCHE (spec `docs/marche-guidee-spec.md`
// § 9 point 4 · owner 14/09 : « le contexte de capture, ça ne coûte aucune autorisation »).
//
// POURQUOI. Le 14/09, une photo noire (7 de luminosité) et une photo du sol se sont écrites sur des
// meubles réels de la Cave. Pour répondre à « d'où viennent les mauvaises photos ? » il faut savoir
// quel appareil, quel iOS, quelle taille de flux, et si la vraie photo a réussi — des faits qui
// existaient PENDANT la marche et mouraient avec l'onglet. La photo, elle, porte déjà les colonnes
// `walk_id`, `seq`, `t_offset_s` (vides depuis le début) : remplies, elles rendent l'ordre du
// parcours et les voisinages (composant A → composant B) sans table de plus.
//
// CE QUI N'EST PAS ICI, ET C'EST VOULU : aucune position, aucune adresse, aucun opérateur. La
// position du téléphone demande une autorisation à l'exploitant — c'est sa décision, pas la nôtre —
// et le site a déjà ses coordonnées en base. L'opérateur n'est pas accessible à une page web.
//
// Table app-write `analytics.dispositif_walks`, append-only, née à la première écriture (le patron de
// `spaceZones.ts`). Côté PRODUCTEUR : l'app écrit, et relit ce qu'elle a écrit. La vue
// `semantic.vw_insight_event_dispositif_walks` naîtra par PR dbt pour les autres lecteurs.
const PROJECT = "muse-square-open-data";
const DATASET = "analytics";
const TABLE = "dispositif_walks";

export const SCHEMA_FIELDS = [
  { name: "walk_id", type: "STRING", mode: "REQUIRED" },
  { name: "location_id", type: "STRING", mode: "REQUIRED" },
  { name: "started_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "ended_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "duration_s", type: "FLOAT64", mode: "REQUIRED" },
  { name: "photos_kept", type: "INT64", mode: "REQUIRED" },
  { name: "photos_written", type: "INT64", mode: "REQUIRED" },
  { name: "problems", type: "INT64", mode: "REQUIRED" },
  // La séquence des pôles touchés avec l'heure (spec § 9) : JSON [{pole, t}].
  { name: "pole_sequence", type: "STRING", mode: "NULLABLE" },
  // ── le contexte de capture ──────────────────────────────────────────────────────────────────
  { name: "user_agent", type: "STRING", mode: "NULLABLE" },
  { name: "platform", type: "STRING", mode: "NULLABLE" },
  { name: "os_version", type: "STRING", mode: "NULLABLE" },
  { name: "viewport_w", type: "INT64", mode: "NULLABLE" },
  { name: "viewport_h", type: "INT64", mode: "NULLABLE" },
  { name: "stream_w", type: "INT64", mode: "NULLABLE" },
  { name: "stream_h", type: "INT64", mode: "NULLABLE" },
  { name: "camera_mode", type: "STRING", mode: "NULLABLE" },
  { name: "real_photos", type: "INT64", mode: "NULLABLE" },
  { name: "photo_failures", type: "INT64", mode: "NULLABLE" },
  { name: "app_build", type: "STRING", mode: "NULLABLE" },
  { name: "created_by", type: "STRING", mode: "NULLABLE" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
];

export interface WalkRow {
  walk_id: string; location_id: string;
  started_at: string; ended_at: string; duration_s: number;
  photos_kept: number; photos_written: number; problems: number;
  pole_sequence: string | null;
  user_agent: string | null; platform: string | null; os_version: string | null;
  viewport_w: number | null; viewport_h: number | null;
  stream_w: number | null; stream_h: number | null;
  camera_mode: string | null; real_photos: number | null; photo_failures: number | null;
  app_build: string | null; created_by: string | null; created_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ts = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};
const ent = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : null;
};
const txt = (v: unknown, max: number): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};

// Le modèle d'iPhone n'est PAS dans le user agent d'iOS (Apple ne le donne pas au web) : on en tire
// la plateforme et la version du système, et rien de plus. Écrire « iPhone 17 » serait une invention.
export function contexteDeLUA(ua: string | null): { platform: string | null; os_version: string | null } {
  const s = String(ua || "");
  if (!s) return { platform: null, os_version: null };
  let m = s.match(/\((iPhone|iPad|iPod);[^)]*?OS (\d+[_\d]*)/);
  if (m) return { platform: m[1], os_version: m[2].replace(/_/g, ".") };
  m = s.match(/Android (\d+(?:\.\d+)*)/);
  if (m) return { platform: "Android", os_version: m[1] };
  m = s.match(/Mac OS X (\d+[_.\d]*)/);
  if (m) return { platform: "Mac", os_version: m[1].replace(/_/g, ".") };
  if (/Windows NT ([\d.]+)/.test(s)) return { platform: "Windows", os_version: RegExp.$1 };
  return { platform: null, os_version: null };
}

export type PlanDeMarche = { ok: true; row: WalkRow } | { ok: false; error: string };

/** PUR : la ligne d'une marche, depuis le compte rendu que le relevé tient déjà en mémoire. */
export function construireMarche(input: {
  body: Record<string, unknown>;
  location_id: string;
  created_by: string | null;
  now?: string;
}): PlanDeMarche {
  const b = input.body || {};
  const walk_id = String(b.walk_id ?? "").trim();
  if (!UUID.test(walk_id)) return { ok: false, error: "walk_id : un identifiant de marche est attendu" };

  const started_at = ts(b.started_at);
  const ended_at = ts(b.ended_at);
  if (!started_at || !ended_at) return { ok: false, error: "started_at et ended_at sont attendus" };
  if (Date.parse(ended_at) < Date.parse(started_at)) return { ok: false, error: "La marche finit avant de commencer" };
  const duration_s = Math.round((Date.parse(ended_at) - Date.parse(started_at)) / 100) / 10;
  // Une journée : au-delà, c'est un onglet resté ouvert, pas une marche — et la ligne mentirait.
  if (duration_s > 86_400) return { ok: false, error: "Marche trop longue pour être une marche" };

  const seq = Array.isArray(b.pole_sequence)
    ? (b.pole_sequence as any[])
        .filter((x) => x && typeof x === "object" && txt((x as any).pole, 120))
        .slice(0, 200)
        .map((x: any) => ({ pole: txt(x.pole, 120), t: Number.isFinite(Number(x.t)) ? Math.round(Number(x.t) * 10) / 10 : null }))
    : [];

  const ua = txt(b.user_agent, 400);
  const { platform, os_version } = contexteDeLUA(ua);

  return {
    ok: true,
    row: {
      walk_id,
      location_id: input.location_id,
      started_at, ended_at, duration_s,
      photos_kept: ent(b.photos_kept, 10_000) ?? 0,
      photos_written: ent(b.photos_written, 10_000) ?? 0,
      problems: ent(b.problems, 10_000) ?? 0,
      pole_sequence: seq.length ? JSON.stringify(seq) : null,
      user_agent: ua, platform, os_version,
      viewport_w: ent(b.viewport_w, 20_000), viewport_h: ent(b.viewport_h, 20_000),
      stream_w: ent(b.stream_w, 20_000), stream_h: ent(b.stream_h, 20_000),
      camera_mode: txt(b.camera_mode, 60),
      real_photos: ent(b.real_photos, 10_000), photo_failures: ent(b.photo_failures, 10_000),
      app_build: txt(b.app_build, 40),
      created_by: input.created_by,
      created_at: input.now ?? new Date().toISOString(),
    },
  };
}

const isNotFound = (err: any): boolean => err?.code === 404 || String(err?.message || "").includes("Not found");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Insertion en flux ; la table naît à la première écriture (le patron de `spaceZones`). */
export async function appendWalk(bq: any, row: WalkRow, retries = 8, waitMs = 3000): Promise<void> {
  const table = bq.dataset(DATASET).table(TABLE);
  try { await table.insert([row]); return; } catch (err: any) { if (!isNotFound(err)) throw err; }
  await bq.dataset(DATASET).createTable(TABLE, { schema: { fields: SCHEMA_FIELDS } })
    .catch((e: any) => { if (!/Already Exists/i.test(String(e?.message || ""))) throw e; });
  for (let i = 0; ; i++) {
    try { await table.insert([row]); return; }
    catch (err: any) { if (!isNotFound(err) || i >= retries - 1) throw err; await sleep(waitMs * (i + 1)); }
  }
}

/** Relecture producteur (l'app relit ce qu'elle a écrit) — les lecteurs métier passeront par semantic. */
export async function listWalks(bq: any, location_id: string, limit = 50): Promise<WalkRow[]> {
  const [rows] = await bq.query({
    query: `SELECT * FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE location_id = @l ORDER BY started_at DESC LIMIT @n`,
    params: { l: location_id, n: limit }, location: "EU",
  }).catch(() => [[]]);
  const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
  return (rows as any[]).map((r) => {
    const o: any = {};
    for (const k of Object.keys(r)) o[k] = flat(r[k]);
    return o as WalkRow;
  });
}
