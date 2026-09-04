// COMPLÉMENT DU RELEVÉ — familles absentes de copy-review.ts : motifs structurels
// (analytics.day_class_impacts → contextCopy.structuralCardCopyFr) et cycle de vie événement
// (src/lib/eventLifecycleCards.ts). LECTURE SEULE. Usage : npx tsx scripts/copy-review-structural.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import * as ctx from "../src/lib/contextCopy";
import { WEATHER_DAY_CLASSES, TERCILE_DAY_CLASSES, OTHER_DAY_CLASSES } from "../src/lib/dayClassRegistry";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  // Le libellé humain vit dans le registre, pas dans contextCopy — sans lui le titre
  // rendrait la clé brute (« Vos rain »), ce qui n'est PAS ce que l'app affiche.
  const LABEL: Record<string, string> = {};
  for (const c of [...WEATHER_DAY_CLASSES, ...TERCILE_DAY_CLASSES, ...OTHER_DAY_CLASSES] as any[]) LABEL[c.key] = c.label_fr;
  const fn = (ctx as any).structuralCardCopyFr;
  if (typeof fn !== "function") { console.error("structuralCardCopyFr introuvable"); process.exit(1); }

  // Toutes les lignes réelles, tous sites — chaque (class_key, signe) donne un texte distinct.
  const [rows] = await bq.query({
    query: `SELECT class_key, family, basis, n_days, med_gap_eur, span_days,
                   COUNT(*) OVER (PARTITION BY class_key) AS n_rows
            FROM \`${PROJECT}.analytics.day_class_impacts\`
            WHERE family != 'card' AND metric = 'revenue_residual'`,
    location: "EU",
  });

  const seen = new Map<string, any>();
  for (const r of rows as any[]) {
    const med = Number(flat(r.med_gap_eur) ?? 0);
    const key = String(flat(r.class_key)) + "|" + (med >= 0 ? "pos" : "neg");
    if (seen.has(key)) continue;
    const i: any = {
      class_key: String(flat(r.class_key)),
      family: String(flat(r.family)),
      label_fr: LABEL[String(flat(r.class_key))] ?? String(flat(r.class_key)),
      n_days: Number(flat(r.n_days) ?? 0),
      med_gap_eur: med,
      avg_gap_eur: med,   // le €/j exposé EST la médiane en régime log (dayClassRegistry:584)
      eur_year: Math.round(med * 60),
    };
    let copy: any = null, err: string | null = null;
    try { copy = fn(i); } catch (e: any) { err = e?.message || String(e); }
    seen.set(key, {
      famille: "structurelle", class_key: i.class_key, motif_family: i.family,
      sens: med >= 0 ? "positif" : "négatif", n_days: i.n_days,
      med_gap_eur: Math.round(med),
      titre: copy?.title_fr ?? "", corps: copy?.sowhat_fr ?? "", geste: copy?.chantier_fr ?? "",
      register: copy?.register ?? null, erreur: err,
    });
  }
  const structural = [...seen.values()].sort((a, b) => a.class_key.localeCompare(b.class_key) || a.sens.localeCompare(b.sens));
  console.log("motifs structurels × sens :", structural.length);
  structural.forEach((s) => {
    console.log(`\n<${s.class_key}/${s.motif_family}> ${s.sens} · n=${s.n_days}${s.erreur ? "  ⚠ " + s.erreur : ""}`);
    console.log(`   T: ${s.titre}`);
    console.log(`   C: ${s.corps}`);
    console.log(`   G: ${s.geste}`);
  });
  writeFileSync(new URL("../data/shots/copy-review-structural.json", import.meta.url).pathname, JSON.stringify(structural, null, 1));
  console.log("\nécrit: data/shots/copy-review-structural.json");
})();
