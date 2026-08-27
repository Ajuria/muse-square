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
      SELECT c.commitment_id, c.status, c.verdict, c.measured_metric, c.committed_action_text, c.owner_person_name,
             c.window_residual_pct, c.window_residual_z, c.kpi_baseline, c.kpi_window_value, c.kpi_delta_pct, c.kpi_noise_se,
             c.window_actual_revenue, c.window_expected_revenue,
             CAST(c.window_start AS STRING) AS window_start, CAST(c.window_end AS STRING) AS window_end,
             si.kpi_family
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
          CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
          (verdict IS NOT NULL) DESC, created_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE location_id = @loc AND ${where}
      ) c
      LEFT JOIN \`${PROJECT}.raw.saved_items\` si ON si.saved_item_id = c.saved_item_id
      WHERE c.rn = 1 AND c.status IN ('open', 'resolved')
        AND c.window_start IS NOT NULL AND c.window_end IS NOT NULL
        AND c.window_start <= @pEnd AND c.window_end >= @pStart
      ORDER BY c.window_start`,
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
  prose: string;            // totaux (série/personne) ou poids du CA (pôle/famille)
  table: { cols: any[]; rows: any[] } | null;   // format msTable — LE tableau du kit
  sources: string[];
}

// « Montre la donnée » (owner 27/08) : un TABLEAU (Produit/Opération · Période · Résultat ·
// Variation), une ligne de contexte chiffrée, des sources dépliables — jamais des phrases
// d'appréciation. Les cellules sous les planchers disent « — » avec le compte de jours en sub.
export function buildEntityPeriodBlocks(r: EntityPeriodReading): EntityPeriodBlocks {
  const per = periodLabelFr(r.start, r.end);
  const headline = `${r.entity.kind === "famille" ? `Famille ${r.entity.name}` : r.entity.name} — ${per}`;
  if (r.pole) {
    const t = r.pole.totals;
    const rows = r.pole.families.map((f) => ({ cells: [
      { v: f.family, bold: true },
      { v: per, color: "#6B7280" },
      { v: f.rev_eur != null ? `${frEur(f.rev_eur)} €` : "—", sub: f.rev_eur != null ? `${f.n30} j vendus` : null },
      f.delta_pct != null
        ? { v: frPct1(f.delta_pct), color: f.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true }
        : { v: "—", sub: `${f.n30} j vendus — plancher 5 j de chaque côté`, color: "#9CA3AF" },
    ] }));
    if (r.entity.kind === "pole" && r.pole.families.length > 1) {
      rows.push({ cells: [
        { v: "Ensemble du pôle", bold: true },
        { v: per, color: "#6B7280" },
        { v: t.rev30_eur != null ? `${frEur(t.rev30_eur)} €` : "—", sub: t.rev30_eur != null ? `${t.n30} j vendus` : null },
        t.delta_pct != null
          ? { v: frPct1(t.delta_pct), color: t.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true }
          : { v: "—", sub: `${t.n30} j vendus — plancher 5 j de chaque côté`, color: "#9CA3AF" },
      ] });
    }
    const openOps = r.pole.operations.filter((o) => o.status === "open");
    const proseParts = [
      t.share_pct != null ? `${String(t.share_pct).replace(".", ",")} % du CA du site sur la période · variation vs la même durée précédente.` : "",
      openOps.length ? `Opérations en cours sur ce pôle : ${openOps.map((o) => `${String(o.committed_action_text || "").split(" — ")[0]} (${frD(o.window_start)})`).join(" · ")}.` : "",
    ].filter(Boolean);
    return {
      headline,
      prose: proseParts.join("\n\n"),
      table: { cols: [{ label: "Produit" }, { label: "Période" }, { label: "Résultat" }, { label: "Variation" }], rows },
      sources: ["Vos ventes par famille (lignes de caisse)"],
    };
  }
  const s2 = r.serie!;
  const rows = s2.occurrences.map((o) => {
    const when = o.window_start === o.window_end ? frD(o.window_start) : `${frD(o.window_start)} → ${frD(o.window_end)}`;
    const verdictFr = o.status === "open" ? "en cours"
      : o.verdict === "confounded" ? "non concluant"
      : isKeptVerdict(o.verdict) ? "objectif atteint" : "objectif manqué";
    return { cells: [
      { v: o.name, bold: true },
      { v: when, color: "#6B7280" },
      { v: verdictFr, color: o.status === "open" ? "#6B7280" : isKeptVerdict(o.verdict) ? "#0F6E56" : "#B45309" },
      o.effect_pct != null
        ? { v: frPct1(o.effect_pct), color: o.effect_pct >= 0 ? "#0F6E56" : "#B45309", bold: true,
            sub: `${o.kpi_mention_fr || "sur le CA"}${o.effect_proven ? " — effet prouvé" : ""}` }
        : { v: "—", color: "#9CA3AF" },
    ] };
  });
  const totals = s2.occurrences.length
    ? `Sur la période : ${s2.judged} verdict${s2.judged > 1 ? "s" : ""} rendu${s2.judged > 1 ? "s" : ""}, ${s2.kept} objectif${s2.kept > 1 ? "s" : ""} atteint${s2.kept > 1 ? "s" : ""}${s2.open_count ? `, ${s2.open_count} en cours` : ""}${s2.gap_eur_sum != null ? ` · écart CA cumulé des fenêtres mesurées : ${s2.gap_eur_sum >= 0 ? "+" : "−"}${frEur(Math.abs(s2.gap_eur_sum))} €` : ""}.`
    : `Aucune opération sur cette période.`;
  return {
    headline,
    prose: totals,
    table: rows.length ? { cols: [{ label: "Opération" }, { label: "Dates" }, { label: "Verdict" }, { label: "Effet — dans son KPI" }], rows } : null,
    sources: ["Vos engagements (verdicts et mesures)"],
  };
}
