// src/lib/rapport/composer.ts — COMPOSER UN RAPPORT (docs/explorer-outil-spec.md § 6, outil `composer_rapport`).
//
// PUR : les lectures déjà faites par les outils de l'incrément 1 (ventes, marge, résultat, espace, pôles) et les clés
// de section demandées (registre src/lib/fr/rapport.fr.ts, résolues par alias) → UN bloc `rapport` : une section par
// clé, chacune faite de blocs du kit (les mêmes que les réponses) et de sa PROVENANCE (l'outil, ses paramètres, la
// période, la date de calcul — c'est ce qui rend un bloc recalculable, § 6.1). La Synthèse est le texte vérifié du
// tour : la route la pose après la porte, le composeur laisse la place. Une section sans matière porte un bloc
// `absence` ; une demande qu'aucune section ne couvre est dite dans `non_reconnu`, jamais inventée. Rien n'est
// recalculé ici : les chaînes viennent des lectures, telles quelles.
import type { AnswerBlock, RapportBlock, RapportSection, RapportProvenance } from "../explorer/blocks";
import { ABSENCE_FR, blocksFromFamilyResult } from "../explorer/blocks";
import type { FamilyResult } from "../insightFamilies/types";
import { SECTION_BY_CLE, type SectionCle } from "../fr/rapport.fr";
import type { VentesLecture } from "./ventes";
import type { ResultatLecture } from "../kpi/resultat";
import { POLES_ABSENCE_FR, type PoleClassementLecture, type Indicateur } from "../dispositifs/poleClassement";

export interface Lectures {
  ventes?: VentesLecture | null;
  marge?: FamilyResult | null;
  resultat?: ResultatLecture | null;
  espace?: FamilyResult | null;
  poles?: PoleClassementLecture | null;
}
export interface ComposeInput {
  cles: SectionCle[];
  non_reconnu: string[];
  periode: { du: string; au: string; relative: string | null; libelle_fr: string };
  indicateur: Indicateur;
  titre?: string | null;
  calcule_le: string;   // ISO, injecté (testable)
  lectures: Lectures;
}
export interface ComposeResult { block: RapportBlock; facts: string[]; sources: string[] }

/** Les sections que `lire_ventes` nourrit — la lecture se fait une fois pour toutes. */
export const SECTIONS_VENTES: SectionCle[] = ["chiffre_affaires", "volume", "panier", "mix", "familles", "jours"];
export const SECTIONS_PAS_ENCORE: SectionCle[] = ["contexte", "actions"];

const RAPPORT_VENTES_URL = "/app/insightevent/rapport";

export function composeRapport(inp: ComposeInput): ComposeResult {
  const facts: string[] = [];
  const sources = new Set<string>();
  const sections: RapportSection[] = [];
  const cles: SectionCle[] = inp.cles.filter((c) => c !== "synthese" && c !== "sources");
  const prov = (outil: string, params: Record<string, unknown>): RapportProvenance => ({ outil, params, periode: { du: inp.periode.du, au: inp.periode.au }, calcule_le: inp.calcule_le });
  const push = (cle: SectionCle, blocs: AnswerBlock[], provenance: RapportProvenance | null) => {
    const def = SECTION_BY_CLE[cle];
    sections.push({ cle, titre: def.titre, definition: def.definition, blocs, provenance });
  };
  const addFacts = (...fs: Array<string | undefined>) => { for (const f of fs) if (f && !facts.includes(f)) facts.push(f); };
  const v = inp.lectures.ventes ?? null;
  const ventesOk = !!v && v.found;
  const absenceVentes = (): AnswerBlock => ({ type: "absence", manque: `Aucune vente ${inp.periode.libelle_fr}.`, geste: null });
  // Le tableau des trois couches ne se rend qu'une fois : sous Chiffre d'affaires s'il est demandé, sinon sous la
  // première des sections Volume / Panier demandées ; les autres portent leur fait.
  const porteCouches: SectionCle | null = (["chiffre_affaires", "volume", "panier"] as SectionCle[]).find((c) => cles.includes(c)) ?? null;
  // De même pour le tableau par famille : sous Familles (classé) s'il est demandé, sinon sous Mix.
  const porteMix: SectionCle | null = cles.includes("familles") ? "familles" : cles.includes("mix") ? "mix" : null;

  for (const cle of cles) {
    if (SECTIONS_VENTES.includes(cle)) {
      const p = prov("lire_ventes", { periode: inp.periode.relative ?? null, du: inp.periode.du, au: inp.periode.au });
      if (!ventesOk) { push(cle, [absenceVentes()], p); continue; }
      const lv = v as VentesLecture;
      for (const s of lv.blocks) if (s.type === "sources") s.items.forEach((x) => sources.add(x));
      const blocs: AnswerBlock[] = [];
      const items: string[] = [];
      if (cle === "chiffre_affaires") { items.push(...[lv.parts.ca, lv.parts.an_dernier].filter(Boolean) as string[]); }
      if (cle === "volume") { items.push(...[lv.parts.volume_panier, lv.parts.couches].filter(Boolean) as string[]); }
      if (cle === "panier") { items.push(...[lv.parts.volume_panier].filter(Boolean) as string[]); if (!cles.includes("volume") && lv.parts.couches) items.push(lv.parts.couches); }
      if (cle === "mix" || cle === "familles") { if (lv.parts.repartition) items.push(lv.parts.repartition); }
      if (cle === "jours") { if (lv.parts.jours) items.push(lv.parts.jours); if (lv.parts.journees) items.push(lv.parts.journees); }
      // Le tableau des couches porte le CA : son fait l'accompagne, quelle que soit la section qui le rend (porte verte).
      if (porteCouches === cle && lv.tables.couches) { blocs.push(lv.tables.couches); if (cle !== "chiffre_affaires" && lv.parts.ca && !items.includes(lv.parts.ca)) items.unshift(lv.parts.ca); }
      if (porteMix === cle && lv.tables.mix) blocs.push(lv.tables.mix);
      if (cle === "jours" && lv.tables.jours) blocs.push(lv.tables.jours);
      if (items.length) blocs.push({ type: "facts", items });
      if (!blocs.length) {
        blocs.push({ type: "absence", manque: cle === "jours" ? "Le profil par jour de semaine se lit à partir de quatre semaines : la période demandée est plus courte." : `Rien à lire pour « ${SECTION_BY_CLE[cle].titre} » ${inp.periode.libelle_fr}.`, geste: null });
      }
      addFacts(...items);
      push(cle, blocs, p);
      continue;
    }
    if (cle === "marge_brute") {
      const r = inp.lectures.marge ?? null;
      const blocs = r ? blocksFromFamilyResult("marge", "renderMarge", r) : [{ type: "absence", manque: ABSENCE_FR.marge.manque, geste: ABSENCE_FR.marge.geste ?? null } as AnswerBlock];
      if (r?.found) { addFacts(...r.facts.map((f) => f.fact_fr)); r.sources.forEach((x) => sources.add(x)); }
      push(cle, blocs.filter((b) => b.type !== "sources"), prov("lire_marge", {}));
      continue;
    }
    if (cle === "resultat_net" || cle === "seuil_rentabilite") {
      const r = inp.lectures.resultat ?? null;
      const p = prov("lire_resultat", {});
      if (!r || !r.found) {
        const a = r?.absence === "couverture" ? ABSENCE_FR.resultat_couverture : ABSENCE_FR.resultat;
        push(cle, [{ type: "absence", manque: a.manque, geste: a.geste ?? null }], p);
        continue;
      }
      for (const s of r.blocks) if (s.type === "sources") s.items.forEach((x) => sources.add(x));
      if (cle === "resultat_net") {
        const items = r.facts.filter((f) => f !== r.parts.seuil_fact);
        addFacts(...items);
        push(cle, [...(r.parts.mois ? [r.parts.mois] : []), ...(items.length ? [{ type: "facts", items } as AnswerBlock] : [])], p);
      } else {
        if (r.parts.seuil) { addFacts(r.parts.seuil_fact); push(cle, [r.parts.seuil], p); }
        else push(cle, [{ type: "absence", manque: "Aucun seuil de rentabilité du jour pour l’instant — il demande vos charges fixes, votre masse salariale et une marge brute mesurée.", geste: ABSENCE_FR.resultat.geste ?? null }], p);
      }
      continue;
    }
    if (cle === "espace") {
      const r = inp.lectures.espace ?? null;
      const blocs = r ? blocksFromFamilyResult("espace", "renderEspace", r) : [{ type: "absence", manque: ABSENCE_FR.espace.manque, geste: ABSENCE_FR.espace.geste ?? null } as AnswerBlock];
      if (r?.found) { addFacts(...r.facts.map((f) => f.fact_fr)); r.sources.forEach((x) => sources.add(x)); }
      push(cle, blocs.filter((b) => b.type !== "sources"), prov("lire_espace", {}));
      continue;
    }
    if (cle === "poles") {
      const r = inp.lectures.poles ?? null;
      const p = prov("lire_poles_classement", { indicateur: inp.indicateur, du: inp.periode.du, au: inp.periode.au });
      if (!r || !r.found) {
        const manque = POLES_ABSENCE_FR[r?.absence ?? "aucun_pole"];
        const geste = r?.absence === "aucune_mesure" ? ABSENCE_FR.espace.geste ?? null : r?.absence === "aucune_marge" ? ABSENCE_FR.marge.geste ?? null : null;
        push(cle, [{ type: "absence", manque, geste }], p);
        continue;
      }
      for (const s of r.blocks) if (s.type === "sources") s.items.forEach((x) => sources.add(x));
      addFacts(...r.facts);
      push(cle, r.blocks.filter((b) => b.type !== "sources"), p);
      continue;
    }
    if (SECTIONS_PAS_ENCORE.includes(cle)) {
      push(cle, [{ type: "absence", manque: `La section « ${SECTION_BY_CLE[cle].titre} » n’est pas encore composée par Explorer : elle reste dans le rapport de ventes imprimable.`, geste: { label_fr: "Rapport de ventes", url: RAPPORT_VENTES_URL } }], null);
      continue;
    }
  }
  if (inp.cles.includes("sources") || sources.size) {
    push("sources", [{ type: "sources", items: [...sources] }], null);
  }
  const titre = inp.titre?.trim() || `Rapport — ${inp.periode.libelle_fr}`;
  return {
    block: { type: "rapport", titre, periode: inp.periode, sections, synthese: null, non_reconnu: inp.non_reconnu },
    facts,
    sources: [...sources],
  };
}

/** Le texte rendu AU MODÈLE : les sections composées, puis les faits — la Synthèse s'écrit à partir d'eux, jamais d'ailleurs. */
export function rapportToText(r: ComposeResult): string {
  const lignes = [`Rapport composé, ${r.block.periode.libelle_fr} : ${r.block.sections.map((s) => s.titre).join(" · ") || "aucune section"}.`];
  if (r.block.non_reconnu.length) lignes.push(`Aucune section du Rapport ne correspond à : ${r.block.non_reconnu.map((x) => `« ${x} »`).join(", ")}.`);
  const absentes = r.block.sections.filter((s) => s.blocs.every((b) => b.type === "absence"));
  if (absentes.length) lignes.push(`Sections sans matière (l'absence est dite dans le document) : ${absentes.map((s) => s.titre).join(" · ")}.`);
  if (r.facts.length) lignes.push("Faits du document :", ...r.facts.map((f) => `• ${f}`));
  return lignes.join("\n");
}
