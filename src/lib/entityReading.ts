// src/lib/entityReading.ts
// Lectures d'ENTITÉ sur PÉRIODE LIBRE (horizons libres × entités, 27/08) — de fines
// COMPOSITIONS des foyers existants, jamais un moteur nouveau :
//   - pôle / famille → poleReading.buildPoleReading (fenêtre libre, référentiel = même durée
//     précédente, planchers n≥5, poids du CA) — une famille EST un périmètre d'une famille ;
//   - opération / série → les engagements ancrés (saved_item_id) dont la fenêtre CHEVAUCHE la
//     période, dédup canonique, effet par occurrence via commitmentEffect (LE foyer — chaque
//     occurrence parle dans LE KPI que l'utilisateur a choisi, remarque owner 27/08) ; les €
//     ne se somment QUE sur le référentiel CA (window_actual/expected), jamais entre KPI ;
//   - personne → mêmes règles, filtrées par owner_person_name (personKey partagé).
// Règle maison : jamais une moyenne de % entre occurrences — la somme des écarts € mesurés
// et le compte des verdicts (isKeptVerdict partagé), occurrence par occurrence.

import { buildPoleReading, type PoleTotals, type PoleFamilyReading, type PoleOperationRow } from "./poleReading";
import { commitmentEffect } from "./commitmentEffect";
import { personKey, isKeptVerdict } from "./actionCommitments";
import type { SiteEntity } from "./entityResolver";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

export interface OccurrenceReading {
  commitment_id: string;
  name: string;                  // texte de l'action (avant « — »)
  status: string;
  verdict: string | null;
  window_start: string | null;
  window_end: string | null;
  effect_pct: number | null;     // dans le KPI DÉCLARÉ de l'occurrence
  effect_proven: boolean;
  kpi_mention_fr: string;        // « sur le CA famille », vide pour le CA
  gap_eur: number | null;        // window_actual − window_expected (référentiel CA seulement)
}

export interface SerieOrPersonReading {
  occurrences: OccurrenceReading[];
  judged: number;                // verdicts rendus (hors non concluant)
  kept: number;                  // objectifs atteints (isKeptVerdict)
  open_count: number;
  gap_eur_sum: number | null;    // somme des écarts € des fenêtres MESURÉES en CA ; null si aucune
}

export interface EntityPeriodReading {
  entity: SiteEntity;
  start: string;
  end: string;
  pole?: { families: PoleFamilyReading[]; operations: PoleOperationRow[]; totals: PoleTotals };
  serie?: SerieOrPersonReading;
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

async function readOccurrences(
  bq: any,
  location_id: string,
  where: string,
  extraParams: Record<string, any>,
  start: string,
  end: string,
): Promise<SerieOrPersonReading> {
  const rows = await bq.query({
    query: `
      SELECT commitment_id, status, verdict, measured_metric, committed_action_text, owner_person_name,
             window_residual_pct, window_residual_z, kpi_baseline, kpi_window_value, kpi_delta_pct, kpi_noise_se,
             window_actual_revenue, window_expected_revenue,
             CAST(window_start AS STRING) AS window_start, CAST(window_end AS STRING) AS window_end
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
          CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
          (verdict IS NOT NULL) DESC, created_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE location_id = @loc AND ${where}
      )
      WHERE rn = 1 AND status IN ('open', 'resolved')
        AND window_start IS NOT NULL AND window_end IS NOT NULL
        AND window_start <= @pEnd AND window_end >= @pStart
      ORDER BY window_start`,
    params: { loc: location_id, pStart: bq.date(start), pEnd: bq.date(end), ...extraParams },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  const occurrences: OccurrenceReading[] = (rows as any[]).map((r) => {
    const eff = commitmentEffect(r);
    const act = Number(flat(r.window_actual_revenue));
    const exp = Number(flat(r.window_expected_revenue));
    return {
      commitment_id: String(flat(r.commitment_id)),
      name: String(flat(r.committed_action_text) || "").split(" — ")[0],
      status: String(flat(r.status)),
      verdict: r.verdict != null ? String(flat(r.verdict)) : null,
      window_start: r.window_start != null ? String(flat(r.window_start)) : null,
      window_end: r.window_end != null ? String(flat(r.window_end)) : null,
      effect_pct: eff.pct,
      effect_proven: eff.z != null && Math.abs(eff.z) >= 1,
      kpi_mention_fr: eff.kpi_mention_fr ?? "",
      gap_eur: Number.isFinite(act) && Number.isFinite(exp) ? Math.round(act - exp) : null,
    };
  });
  const judgedRows = occurrences.filter((o) => o.status === "resolved" && o.verdict && o.verdict !== "confounded");
  const gaps = occurrences.filter((o) => o.status === "resolved" && o.gap_eur != null);
  return {
    occurrences,
    judged: judgedRows.length,
    kept: judgedRows.filter((o) => isKeptVerdict(o.verdict)).length,
    open_count: occurrences.filter((o) => o.status === "open").length,
    gap_eur_sum: gaps.length ? gaps.reduce((s2, o) => s2 + (o.gap_eur as number), 0) : null,
  };
}

export async function readEntityPeriod(
  bq: any,
  location_id: string,
  entity: SiteEntity,
  start: string,
  end: string,
  todayIso: string,
): Promise<EntityPeriodReading> {
  if (entity.kind === "pole" || entity.kind === "famille") {
    const pole = await buildPoleReading(
      bq, location_id, entity.id ?? "", entity.families, todayIso, { start, end },
    );
    return { entity, start, end, pole };
  }
  if (entity.kind === "operation") {
    const serie = await readOccurrences(bq, location_id, "saved_item_id = @sid", { sid: String(entity.id) }, start, end);
    return { entity, start, end, serie };
  }
  // personne — l'égalité stricte sur la valeur stockée, PLUS la clé courte partagée (le
  // roster écrit « Camille Robin · Vente », un engagement manuel peut porter « Camille »).
  const serie = await readOccurrences(
    bq, location_id,
    "(owner_person_name = @owner OR LOWER(SPLIT(SPLIT(owner_person_name, '·')[OFFSET(0)], ' ')[OFFSET(0)]) = @ownerKey)",
    { owner: entity.name, ownerKey: personKey(entity.name) },
    start, end,
  );
  return { entity, start, end, serie };
}
