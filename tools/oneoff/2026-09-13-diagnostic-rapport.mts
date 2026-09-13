// tools/oneoff/2026-09-13-diagnostic-rapport.mts — LES INCOHÉRENCES DU RAPPORT, MESURÉES (owner 13/09 :
// « les contenus sont incohérents… toutes les sources ne sont pas mentionnées »).
//
// Compose le rapport d'août par LE chemin réel de la page (`composerSurPeriode`, gestes.ts) sur le compte
// de test, et imprime ce que l'owner a vu : les sources collectées, la taille de la section Contexte, et
// le texte BRUT des actions recommandées. Aucune supposition — ce que la page rend, en clair.
// Usage : npx tsx tools/oneoff/2026-09-13-diagnostic-rapport.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { composerSurPeriode } from "../../src/lib/rapport/gestes";
import type { SectionCle } from "../../src/lib/fr/rapport.fr";

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const CLES: SectionCle[] = ["synthese", "chiffre_affaires", "volume", "panier", "mix", "jours", "marge_brute", "contexte", "actions", "sources"];
const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");

const r = await composerSurPeriode(bq, LOC, [LOC], {
  cles: CLES, indicateur: "ca" as any, titre: null,
  periode: { du: "2026-08-01", au: "2026-08-31", relative: "mois_dernier", libelle_fr: "le mois dernier, du 01/08/2026 au 31/08/2026" },
}, "2026-09-13");

console.log(`\nSECTIONS : ${r.block.sections.map((s) => s.cle).join(" · ")}`);
console.log(`\nSOURCES collectées : ${r.sources.length}`);
for (const s of r.sources) console.log(`   · ${s}`);

for (const sec of r.block.sections) {
  const faits = sec.blocs.filter((b: any) => b.type === "facts").flatMap((b: any) => b.items as string[]);
  const autres = sec.blocs.filter((b: any) => b.type !== "facts").map((b: any) => b.type);
  console.log(`\n── ${sec.titre} (${sec.cle}) : ${faits.length} fait(s)${autres.length ? ", blocs " + autres.join("/") : ""}`);
  for (const f of faits.slice(0, 4)) console.log(`   « ${String(f).slice(0, 180)}${String(f).length > 180 ? "…" : ""} »`);
  if (faits.length > 4) console.log(`   … et ${faits.length - 4} autres faits`);
}

// Le détail qui a fait tiquer l'owner : le texte des actions, recopié des cartes.
const acts = r.block.sections.find((s) => s.cle === "actions");
if (acts) {
  const items = acts.blocs.filter((b: any) => b.type === "facts").flatMap((b: any) => b.items as string[]);
  console.log(`\nACTIONS — texte brut (${items.length}) :`);
  for (const a of items) {
    const sansAccent = /\b(ecart|ecarts|reexaminez|genere|a genere|intensite|habituel le|donnees)\b/i.test(a);
    const pctAbsurde = /\b[1-9]\d{2,}\s?%/.test(a);
    console.log(`   ${sansAccent ? "SANS ACCENTS " : ""}${pctAbsurde ? "% ABSURDE " : ""}« ${a.slice(0, 200)} »`);
  }
}
