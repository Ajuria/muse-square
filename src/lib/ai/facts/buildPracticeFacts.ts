// src/lib/ai/facts/buildPracticeFacts.ts
// =====================================================
// Dispositifs documentés → citable facts du chat Consulter (incrément 2 du 03/08).
// Le Consulter savait citer les ISSUES mesurées d'engagements (track-record, mart
// d'apprentissage) mais pas la couche DÉCLARATIVE : la fiche (analytics.best_practices),
// l'engagement de test lié et leur liaison. « Qu'est-ce que j'avais prévu pour les jours
// chauds ? » n'avait pas de réponse alors que la base la connaît.
//
// Même patron que buildIdentityFacts : le builder crée son client, ne jette jamais (l'appelant
// .catch vers []), et rend des fact_fr prêts pour la liste blanche — le modèle les surface
// verbatim, donc le tier (déclaré/prouvé) et l'état du test voyagent DANS la phrase.
// claim_type "observed" : c'est une déclaration de l'exploitant présente en base, pas une
// mesure — le registre causal étagé ne s'y déverrouille pas.
// Borné à 5 fiches (les plus récentes, tests en cours d'abord) pour ne pas gonfler le prompt.
// =====================================================
import { makeBQClient } from "../../bq";
import { listClassDispositifs, dispositifStateFr, type ClassDispositif } from "../../dispositifs/bestPractices";
import { classNounFr } from "../../insightFamilies/dispositif";
import { themeForActionType, RECO_THEME_LABEL_FR } from "../../recoThemeMap";

const PROJECT = "muse-square-open-data";

export type PracticeFact = { fact_fr: string; claim_type: "observed" };

const frFullDate = (iso: string) => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};

// Wrapper : LA grammaire vit dans bestPractices.dispositifStateFr (source unique, trois
// consommateurs) ; ici on résout juste le noun depuis day_class_key. (arbitrages
// owner 27/08, tableau lexique 8-13 montré avant implémentation). Pure, testée sur fixture.
// Chaque % porte son référentiel (règle 2) ; « prouvé », « manqué », « non concluant » sont
// les mots actés du lexique ; le signal de la contre-indication est nommé par classNounFr
// (les MÊMES noun_fr que l'atelier — zéro copie).
export function practiceStateFr(p: Pick<ClassDispositif, "tier" | "effect_direction" | "effect_residual_pct" | "commitment_verdict" | "replay_threshold_value" | "replay_threshold_basis" | "day_class_key"> & { replay_adjustment_move?: string | null }): string {
  return dispositifStateFr(p, classNounFr(p.day_class_key));
}

// Contre-indication AUTONOME (27/08, owner) : un engagement resolu hors fiche, a effet
// NEGATIF significatif — la memoire de ce qui a ete essaye et n'a pas marche. Pure,
// testee sur fixture (le cas reel : « Corner de vente producteur », −23,2 %).
export function autonomousCounterFactFr(r: {
  created_date: string; practice_text: string; event_title: string | null;
  origin_action_type: string | null; effect_residual_pct: number | null;
}): string {
  const pct = r.effect_residual_pct != null
    ? `${r.effect_residual_pct >= 0 ? "+" : "-"}${String(Math.round(Math.abs(r.effect_residual_pct) * 10) / 10).replace(".", ",")} %`
    : "";
  const theme = themeForActionType(r.origin_action_type ?? undefined);
  const themeLabel = theme ? RECO_THEME_LABEL_FR[theme] : null;
  const signal = themeLabel ? `face aux signaux « ${themeLabel} », elle` : "elle";
  const evt = r.event_title ? ` (événement « ${r.event_title} »)` : "";
  return `Action testée par vous le ${frFullDate(r.created_date)}${evt} : « ${r.practice_text} » — ${signal} a prouvé ne pas être adaptée (${pct} vs votre résultat habituel, 1 test manqué).`;
}

export async function buildPracticeFacts(location_id: string): Promise<{ facts: PracticeFact[] }> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [rows, [negRows]] = await Promise.all([
    listClassDispositifs(bq, location_id, null, 5),
    // les negatifs AUTONOMES (source commitment, tier ecarte) — hors listClassDispositifs
    // (declared only, son contrat) ; meme vue, meme fraicheur.
    bq.query({
      query: `SELECT FORMAT_TIMESTAMP('%Y-%m-%d', created_at) AS created_date, practice_text,
                     event_title, origin_action_type, effect_residual_pct
              FROM \`${PROJECT}.semantic.vw_insight_event_dispositifs\`
              WHERE location_id = @location_id AND source = 'commitment' AND tier = 'ecarte'
              ORDER BY created_at DESC LIMIT 3`,
      params: { location_id }, location: "EU",
    }).catch(() => [[]] as any[]),
  ]);
  const facts: PracticeFact[] = rows.map((p) => ({
    fact_fr: `Dispositif documenté par vous le ${frFullDate(p.created_date)} : « ${p.practice_text} » — ${practiceStateFr(p)}${p.confirmation_test ? ` ; test prévu : « ${p.confirmation_test} »` : ""}${p.commitment_status === "open" ? " ; engagement de test en cours (suivi sur Pulse)" : ""}.`,
    claim_type: "observed" as const,
  }));
  for (const r of (negRows as any[]) ?? []) {
    facts.push({
      fact_fr: autonomousCounterFactFr({
        created_date: String(r.created_date ?? ""),
        practice_text: String(r.practice_text ?? ""),
        event_title: r.event_title != null ? String(r.event_title) : null,
        origin_action_type: r.origin_action_type != null ? String(r.origin_action_type) : null,
        effect_residual_pct: r.effect_residual_pct != null ? Number(r.effect_residual_pct) : null,
      }),
      claim_type: "observed" as const,
    });
  }
  return { facts };
}
