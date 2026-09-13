// tools/oneoff/2026-09-13-mesure-question-changement.mts — LA QUESTION « A-T-IL CHANGÉ ? » RÉPOND-ELLE
// QUELQUE CHOSE ? (owner 13/09 : « Si photo change, versionning change » — avant de brancher un
// déclencheur dessus, il faut savoir ce qu'elle vaut.)
//
// LE DOUTE : le modèle ne reçoit QU'UNE image (photoExtractionSystem, src/lib/ai/photoExtraction.ts) — il
// n'a jamais la photo précédente sous les yeux. Les trois questions du registre qui demandent un
// changement (`vt_change_depuis`, `il_change_depuis`, `md_change_depuis`) lui demandent donc de comparer
// à quelque chose qu'il ne voit pas ; la règle 1 de la consigne dit « dans le doute : non_visible ».
//
// CE QUI EST MESURÉ, sur les lignes RÉELLES de analytics.dispositif_photos : la distribution des réponses
// à ces trois clés, et — pour les composants qui ont au moins deux photos — ce que les DONNÉES de la
// ligne disent d'un changement (familles reconnues, articles reconnus, exposition, niveaux), qui est
// calculable sans le modèle.
//
// Usage : npx tsx tools/oneoff/2026-09-13-mesure-question-changement.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const bq = makeBQClient(BQ_PROJECT);
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

const [rows] = await bq.query({
  query: `SELECT photo_id, location_id, dispositif_id, version_no, component_key, dispositif_type,
                 checklist, items_matched, exposition, levels, families_present,
                 CAST(created_at AS STRING) AS created_at
          FROM \`${BQ_PROJECT}.analytics.dispositif_photos\`
          WHERE status = 'read'
          ORDER BY dispositif_id, component_key, created_at`,
  location: "EU",
});

type R = {
  photo_id: string; dispositif_id: string; version_no: number; component_key: string; type: string | null;
  checklist: Record<string, string>; items: string[]; exposition: string | null; levels: number | null;
  familles: string[]; created_at: string;
};
const all: R[] = (rows as any[]).map((r) => {
  let cl: Record<string, string> = {}; let it: string[] = [];
  try { cl = JSON.parse(String(flat(r.checklist) ?? "{}")) || {}; } catch { cl = {}; }
  try { it = (JSON.parse(String(flat(r.items_matched) ?? "[]")) || []).map((x: any) => String(x.item_code)); } catch { it = []; }
  return {
    photo_id: String(flat(r.photo_id)), dispositif_id: String(flat(r.dispositif_id)),
    version_no: Number(flat(r.version_no)), component_key: String(flat(r.component_key)),
    type: r.dispositif_type != null ? String(flat(r.dispositif_type)) : null,
    checklist: cl, items: it,
    exposition: r.exposition != null ? String(flat(r.exposition)) : null,
    levels: r.levels != null ? Number(flat(r.levels)) : null,
    familles: Array.isArray(r.families_present) ? r.families_present.map((f: any) => String(flat(f))) : [],
    created_at: String(flat(r.created_at)),
  };
});

console.log(`\nphotos lues en base : ${all.length}`);
if (!all.length) { console.log("Aucune photo — rien à mesurer."); process.exit(0); }

// 1. Les réponses aux trois questions de changement.
const CLES = ["vt_change_depuis", "il_change_depuis", "md_change_depuis"];
console.log(`\n── Les réponses du modèle aux questions « a-t-il changé ? »`);
for (const k of CLES) {
  const avec = all.filter((r) => r.checklist[k] != null);
  if (!avec.length) { console.log(`   ${k} : posée sur 0 photo`); continue; }
  const dist: Record<string, number> = {};
  for (const r of avec) dist[r.checklist[k]] = (dist[r.checklist[k]] ?? 0) + 1;
  console.log(`   ${k} : posée sur ${avec.length} photo(s) — ${Object.entries(dist).map(([v, n]) => `${v} ${n}`).join(" · ")}`);
}
const posee = all.filter((r) => CLES.some((k) => r.checklist[k] != null)).length;
console.log(`   → une question de changement est posée sur ${posee}/${all.length} photos (les autres types n'en ont aucune).`);

// 2. Les composants photographiés PLUSIEURS fois : ce que les données disent du changement.
const parComposant = new Map<string, R[]>();
for (const r of all) {
  const k = `${r.dispositif_id}|${r.component_key}`;
  (parComposant.get(k) ?? parComposant.set(k, []).get(k)!).push(r);
}
const multi = [...parComposant.entries()].filter(([, v]) => v.length > 1);
console.log(`\n── Composants photographiés plus d'une fois : ${multi.length} sur ${parComposant.size}`);
const diff = (a: readonly string[], b: readonly string[]) => {
  const A = new Set(a), B = new Set(b);
  return { partis: [...A].filter((x) => !B.has(x)), venus: [...B].filter((x) => !A.has(x)) };
};
for (const [k, serie] of multi.slice(0, 12)) {
  const tri = [...serie].sort((x, y) => (x.created_at < y.created_at ? -1 : 1));
  console.log(`\n   ${k} (${tri.length} photos, type ${tri[0].type ?? "—"})`);
  for (let i = 1; i < tri.length; i++) {
    const av = tri[i - 1], ap = tri[i];
    const f = diff(av.familles, ap.familles), a = diff(av.items, ap.items);
    const dits = CLES.map((c) => ap.checklist[c]).filter(Boolean);
    const signaux = [
      f.partis.length || f.venus.length ? `familles −${f.partis.length}/+${f.venus.length}` : null,
      a.partis.length || a.venus.length ? `articles −${a.partis.length}/+${a.venus.length}` : null,
      av.exposition !== ap.exposition ? `exposition ${av.exposition} → ${ap.exposition}` : null,
      av.levels !== ap.levels ? `étagères ${av.levels} → ${ap.levels}` : null,
    ].filter(Boolean);
    console.log(`      ${av.created_at.slice(0, 10)} → ${ap.created_at.slice(0, 10)} · v${av.version_no}→v${ap.version_no} · le modèle dit « ${dits.join(", ") || "(question non posée)"} » · les données disent ${signaux.length ? signaux.join(" · ") : "aucun écart"}`);
  }
}
