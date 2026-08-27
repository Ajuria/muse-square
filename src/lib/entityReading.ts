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

// ── Blocs de la réponse déterministe (C4) — UNE formulation période, un seul foyer. ────────────
// Cartes pour pôle/famille (le patron datecards du journal, pill = les résultats de LA période) ;
// prose pour série/personne (verdicts l.21, effet par occurrence dans SON KPI, sommes € CA seul).

const frD = (iso: string | null): string => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};
const frEur = (v: number): string => Math.round(v).toLocaleString("fr-FR");
const frPct1 = (v: number): string => `${v >= 0 ? "+" : "−"}${String(Math.abs(v)).replace(".", ",")} %`;

export function periodLabelFr(start: string, end: string): string {
  return `du ${frD(start)} au ${frD(end)}`;
}

export interface EntityPeriodBlocks {
  headline: string;
  prose: string;
  card: any | null; // item datecards (label/pill/tip/rows) — pôle et famille seulement
}

export function buildEntityPeriodBlocks(r: EntityPeriodReading): EntityPeriodBlocks {
  const per = periodLabelFr(r.start, r.end);
  const headline = `${r.entity.kind === "famille" ? `Famille ${r.entity.name}` : r.entity.name} — ${per}`;
  if (r.pole) {
    const t = r.pole.totals;
    const measurable = t.rev30_eur != null && t.share_pct != null;
    const famLine = r.pole.families
      .map((f) => (f.delta_pct != null ? `${f.family} ${frPct1(f.delta_pct)}` : f.family))
      .join(" · ");
    const openOps = r.pole.operations.filter((o) => o.status === "open");
    const rows: any[] = [];
    if (famLine && r.entity.kind === "pole") rows.push({ k: "Familles", v: famLine });
    if (openOps.length) rows.push({
      k: "Opérations en cours",
      v: openOps.map((o) => `${String(o.committed_action_text || "").split(" — ")[0]} (${frD(o.window_start)})`).join(" · "),
    });
    const card: any = { label: headline, rows };
    if (measurable) {
      card.pill = `${frEur(t.rev30_eur!)} € (${t.n30} j vendus) · ${String(t.share_pct).replace(".", ",")} % du CA`
        + (t.delta_pct != null ? ` · ${frPct1(t.delta_pct)} vs la même durée précédente` : "");
    } else {
      card.pill = "Données insuffisantes ⓘ";
      card.tip = `${t.n30} jour${t.n30 > 1 ? "s" : ""} vendu${t.n30 > 1 ? "s" : ""} sur la période — la comparaison demande au moins 5 jours vendus de chaque côté.`;
    }
    return { headline, prose: "", card };
  }
  const s2 = r.serie!;
  const lines = s2.occurrences.map((o) => {
    const when = o.window_start === o.window_end ? `Le ${frD(o.window_start)}` : `Du ${frD(o.window_start)} au ${frD(o.window_end)}`;
    if (o.status === "open") return `${when} : « ${o.name} » — en cours.`;
    const verdictFr = o.verdict === "confounded" ? "non concluant"
      : isKeptVerdict(o.verdict) ? "objectif atteint" : "objectif manqué";
    const eff = o.effect_pct != null
      ? ` ${frPct1(o.effect_pct)}${o.kpi_mention_fr ? ` ${o.kpi_mention_fr}` : ""}${o.effect_proven ? " (effet prouvé)" : ""}.`
      : "";
    return `${when} : « ${o.name} » — ${verdictFr}.${eff}`;
  });
  const totals = s2.occurrences.length
    ? `Sur la période : ${s2.judged} verdict${s2.judged > 1 ? "s" : ""} rendu${s2.judged > 1 ? "s" : ""}, ${s2.kept} objectif${s2.kept > 1 ? "s" : ""} atteint${s2.kept > 1 ? "s" : ""}${s2.open_count ? `, ${s2.open_count} en cours` : ""}${s2.gap_eur_sum != null ? ` · écart CA cumulé des fenêtres mesurées : ${s2.gap_eur_sum >= 0 ? "+" : "−"}${frEur(Math.abs(s2.gap_eur_sum))} €` : ""}.`
    : `Aucune opération sur cette période.`;
  return { headline, prose: [...lines, totals].join("\n\n"), card: null };
}
