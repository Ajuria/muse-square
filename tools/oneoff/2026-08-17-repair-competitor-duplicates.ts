// Fusion des doublons VIVANTS du répertoire concurrent (16/08) — par la CLÉ, réversible.
// Groupes = entrées vivantes partageant un google_place_id, ÉTENDUS aux entrées vivantes
// SANS clé de même nom+ville normalisés (le cas Branly : l'entrée saine — URL, suivie —
// n'avait pas de clé). Canonique = URL d'abord, puis nb de suivis vivants, puis ancienneté.
// Gestes (tous réversibles — soft-delete + updates tracés ici) :
//   1. la canonique ADOPTE la clé du groupe si elle n'en a pas ;
//   2. les suivis vivants des doublons sont REMAPPÉS sur la canonique (sauf si le site la
//      suit déjà → le suivi doublon est soft-delete) ;
//   3. les doublons sont soft-delete ;
//   4. cas particulier documenté : le suivi Occitanie→Branly du 16/08 21:16 est un artefact
//      de MON bug de câblage (loc global) — soft-delete, le site visé (Paris) suit déjà.
// Usage : npx tsx tools/oneoff/2026-08-17-repair-competitor-duplicates.ts            (constat, zéro écriture)
//         npx tsx tools/oneoff/2026-08-17-repair-competitor-duplicates.ts --apply
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";

const P = "muse-square-open-data";
const APPLY = process.argv.includes("--apply");
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const norm = (x: any) => String(x || "").toLowerCase().trim();

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [dirs] = await bq.query({ query: `
    SELECT cd.competitor_id, cd.competitor_name, cd.city, cd.google_place_id, cd.source_url,
           CAST(cd.created_at AS STRING) created_at,
           (SELECT COUNT(*) FROM \`${P}.raw.competitor_tracking\` ct
             WHERE ct.competitor_id = cd.competitor_id AND ct.deleted_at IS NULL) n_tracks
    FROM \`${P}.raw.competitor_directory\` cd WHERE cd.deleted_at IS NULL`, location: "EU" });
  const rows = (dirs as any[]).map((r) => ({
    id: String(flat(r.competitor_id)), nom: String(flat(r.competitor_name) || ""), city: String(flat(r.city) || ""),
    key: flat(r.google_place_id) ? String(flat(r.google_place_id)) : null,
    url: flat(r.source_url) ? String(flat(r.source_url)) : null,
    created: String(flat(r.created_at)), tracks: Number(flat(r.n_tracks)) || 0,
  }));

  // Pré-étape documentée (16/08) : l'entrée saine de Branly (62602eed…, URL officielle
  // quaibranly.fr, suivie par 12 comptes) porte city='Puteaux' — faux (musée du 7e arr.),
  // et c'est CE défaut qui l'excluait du groupe nom+ville. Correction ciblée, tracée ici.
  const fix = rows.find((r) => !r.key && norm(r.nom).includes("branly") && norm(r.city) === "puteaux" && (r.url || "").includes("quaibranly.fr"));
  if (fix) {
    console.log("pré-étape : city Puteaux→Paris sur", fix.id.slice(0, 8), "(preuve : URL officielle quaibranly.fr)");
    if (APPLY) await bq.query({ query: `UPDATE \`${P}.raw.competitor_directory\` SET city = 'Paris' WHERE competitor_id = @c AND deleted_at IS NULL AND city = 'Puteaux'`, params: { c: fix.id }, location: "EU" });
    fix.city = "Paris";
  }

  // Groupes par clé, étendus aux sans-clé de même nom+ville.
  const byKey: Record<string, typeof rows> = {};
  for (const r of rows) if (r.key) (byKey[r.key] = byKey[r.key] || []).push(r);
  for (const key of Object.keys(byKey)) {
    const names = new Set(byKey[key].map((r) => norm(r.nom) + "|" + norm(r.city)));
    for (const r of rows) if (!r.key && names.has(norm(r.nom) + "|" + norm(r.city))) byKey[key].push(r);
  }
  const groups = Object.entries(byKey).filter(([, g]) => g.length > 1);
  console.log("groupes de doublons vivants:", groups.length, APPLY ? "(APPLY)" : "(constat)");

  for (const [key, g] of groups) {
    g.sort((a, b) => (b.url ? 1 : 0) - (a.url ? 1 : 0) || b.tracks - a.tracks || a.created.localeCompare(b.created));
    const canon = g[0], dupes = g.slice(1);
    console.log("\n—", canon.nom, "| clé", key.slice(0, 22), "| canonique:", canon.id.slice(0, 8),
      "(url:", !!canon.url, "· suivis:", canon.tracks + ")", "| doublons:", dupes.map((d) => d.id.slice(0, 8) + (d.tracks ? "(" + d.tracks + " suivis)" : "")).join(", "));
    if (!APPLY) continue;
    if (!canon.key) {
      await bq.query({ query: `UPDATE \`${P}.raw.competitor_directory\` SET google_place_id = @k WHERE competitor_id = @c AND deleted_at IS NULL AND google_place_id IS NULL`,
        params: { k: key, c: canon.id }, location: "EU" });
      console.log("  clé adoptée par la canonique");
    }
    for (const d of dupes) {
      // Remap des suivis vivants ; si le site suit déjà la canonique → soft-delete du doublon.
      await bq.query({ query: `
        UPDATE \`${P}.raw.competitor_tracking\` ct SET competitor_id = @canon
        WHERE ct.competitor_id = @dupe AND ct.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM \`${P}.raw.competitor_tracking\` ct2
            WHERE ct2.competitor_id = @canon AND ct2.location_id = ct.location_id AND ct2.deleted_at IS NULL)`,
        params: { canon: canon.id, dupe: d.id }, location: "EU" });
      await bq.query({ query: `UPDATE \`${P}.raw.competitor_tracking\` SET deleted_at = CURRENT_TIMESTAMP() WHERE competitor_id = @dupe AND deleted_at IS NULL`,
        params: { dupe: d.id }, location: "EU" });
      await bq.query({ query: `UPDATE \`${P}.raw.competitor_directory\` SET deleted_at = CURRENT_TIMESTAMP() WHERE competitor_id = @dupe AND deleted_at IS NULL`,
        params: { dupe: d.id }, location: "EU" });
      console.log("  fusionné + soft-delete:", d.id.slice(0, 8));
    }
  }

  // 4. Artefact du bug de câblage : Occitanie (ff2aeb35…) suivant Branly (Paris, 600 km) — 16/08.
  const [art] = await bq.query({ query: `
    SELECT ct.competitor_id, CAST(ct.created_at AS STRING) tca
    FROM \`${P}.raw.competitor_tracking\` ct
    JOIN \`${P}.raw.competitor_directory\` cd ON cd.competitor_id = ct.competitor_id
    WHERE ct.location_id = 'ff2aeb35-084f-4bbf-915c-94faf7be8785' AND ct.deleted_at IS NULL
      AND LOWER(cd.competitor_name) LIKE '%branly%' AND DATE(ct.created_at) = '2026-08-16'`, location: "EU" });
  if ((art as any[]).length) {
    console.log("\nartefact Occitanie→Branly du 16/08:", (art as any[]).length, "suivi(s)");
    if (APPLY) {
      await bq.query({ query: `
        UPDATE \`${P}.raw.competitor_tracking\` ct SET deleted_at = CURRENT_TIMESTAMP()
        WHERE ct.location_id = 'ff2aeb35-084f-4bbf-915c-94faf7be8785' AND ct.deleted_at IS NULL
          AND DATE(ct.created_at) = '2026-08-16'
          AND ct.competitor_id IN (SELECT competitor_id FROM \`${P}.raw.competitor_directory\` WHERE LOWER(competitor_name) LIKE '%branly%')`, location: "EU" });
      console.log("  soft-delete fait (le site visé — Paris — suit déjà la canonique)");
    }
  } else console.log("\naucun artefact Occitanie→Branly restant");
})();
