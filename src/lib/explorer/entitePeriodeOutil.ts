// src/lib/explorer/entitePeriodeOutil.ts — UNE ENTITÉ SUR UNE PÉRIODE, pour l'agent (docs/explorer-outil-spec.md
// § 7, couche 6, 13/09) : ce que les sorties `_entity_period_v1`, `_entity_compare_v1` et
// `_entity_period_elicit_v1` de insight/prompt.ts rendaient — un pôle, une famille, une opération ou une
// personne lu sur une période, et la mise en table quand il y a plusieurs entités ou deux périodes.
//
// PUR : la composition seule. Les lectures restent `readEntityPeriod` / `readEntitiesCompared` et la mise
// en forme reste `buildEntityPeriodBlocks` / `buildEntityCompareBlocks` (entityReading.ts) — aucune
// formulation nouvelle, aucune table réécrite.
//
// CE QUE ÇA AJOUTE, et c'est tout : chaque ligne de table est REDITE comme un fait, pour que la porte
// puisse citer ses nombres (le même geste que `dispositifFamilleToBlocks`, 13/09). Sans cela, le modèle
// lirait des chiffres que le validateur ne trouverait nulle part, et la réponse tomberait en « non vérifié ».
import type { AnswerBlock } from "./blocks";
import type { EntityPeriodBlocks, EntityCompareBlocks } from "./entityReading";

export interface EntitePeriodeCompose {
  found: boolean;
  titre: string;
  blocks: AnswerBlock[];
  facts: string[];
  sources: string[];
}

/** PUR — une ligne de table → un fait : « <1re cellule> : <cellule> · <cellule> ».
 *
 *  DEUX filtres, et le second a été appris à ses dépens le 13/09. (1) Une cellule vide ou « — » est
 *  écartée : une absence n'est pas un chiffre. (2) Une ligne dont il ne reste AUCUN NOMBRE ne devient pas
 *  un fait — « Loose Tea : Période août. » passait le premier filtre et ne mesurait rien, tout en
 *  autorisant la porte à laisser le modèle parler de Loose Tea comme d'une ligne vérifiée. Ces faits
 *  existent pour que les NOMBRES d'une table soient citables ; sans nombre, il n'y a rien à citer. */
export function ligneEnFait(cols: Array<{ label?: string }>, cells: Array<{ v?: string; sub?: string | null }>): string | null {
  if (!cells.length) return null;
  const tete = String(cells[0]?.v ?? "").trim();
  if (!tete) return null;
  const suite: string[] = [];
  for (let i = 1; i < cells.length; i++) {
    const v = String(cells[i]?.v ?? "").trim();
    if (!v || v === "—") continue;
    const label = String(cols[i]?.label ?? "").trim();
    const sub = String(cells[i]?.sub ?? "").trim();
    suite.push(`${label ? `${label} ` : ""}${v}${sub ? ` (${sub})` : ""}`);
  }
  if (!suite.some((s) => /\d/.test(s))) return null;
  return `${tete} : ${suite.join(" · ")}.`;
}

const tableEnBlocs = (t: { cols: any[]; rows: any[] } | null | undefined, blocks: AnswerBlock[], facts: string[]): void => {
  if (!t || !Array.isArray(t.rows) || !t.rows.length) return;
  blocks.push({ type: "table", cols: t.cols, rows: t.rows });
  for (const row of t.rows as Array<{ cells: Array<{ v?: string; sub?: string | null }> }>) {
    const f = ligneEnFait(t.cols as Array<{ label?: string }>, row.cells ?? []);
    if (f) facts.push(f);
  }
};

/** PUR — une entité, une période : l'en-tête, la ligne de contexte, la table (et l'échelle de la vente). */
export function composeEntitePeriode(b: EntityPeriodBlocks): EntitePeriodeCompose {
  const blocks: AnswerBlock[] = [{ type: "prose", md: `**${b.headline}**` }];
  const facts: string[] = [];
  if (b.prose && b.prose.trim()) { blocks.push({ type: "facts", items: [b.prose.trim()] }); facts.push(b.prose.trim()); }
  tableEnBlocs(b.table, blocks, facts);
  tableEnBlocs(b.funnel_table, blocks, facts);
  if (b.sources.length) blocks.push({ type: "sources", items: b.sources });
  return { found: true, titre: b.headline, blocks, facts, sources: b.sources };
}

/** PUR — plusieurs entités, ou deux périodes : les sections de la comparaison, cellules nues. */
export function composeEntitesComparees(c: EntityCompareBlocks): EntitePeriodeCompose {
  const blocks: AnswerBlock[] = [{ type: "prose", md: `**${c.headline}**` }];
  const facts: string[] = [];
  for (const sec of c.sections) {
    if (sec.title) blocks.push({ type: "prose", md: `**${sec.title}**` });
    tableEnBlocs(sec.table, blocks, facts);
    if (Array.isArray(sec.facts) && sec.facts.length) { blocks.push({ type: "facts", items: sec.facts }); facts.push(...sec.facts); }
  }
  if (c.sources.length) blocks.push({ type: "sources", items: c.sources });
  return { found: true, titre: c.headline, blocks, facts, sources: c.sources };
}

/** Le texte rendu AU MODÈLE : l'en-tête, puis une ligne par fait. */
export function entiteToText(x: EntitePeriodeCompose): string {
  return [x.titre, ...x.facts.map((f) => `• ${f}`)].join("\n");
}
