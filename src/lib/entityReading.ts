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

import { buildPoleReading, buildPoleItemsReading, type PoleTotals, type PoleFamilyReading, type PoleOperationRow } from "./dispositifs/poleReading";
import { commitmentEffect } from "./commitments/commitmentEffect";
import { personKey, isKeptVerdict } from "./commitments/actionCommitments";
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
  cost_eur: number | null;       // coût saisi de l'occurrence (jamais déduit)
}

export interface SerieOrPersonReading {
  occurrences: OccurrenceReading[];
  judged: number;                // verdicts rendus (hors non concluant)
  kept: number;                  // objectifs atteints (isKeptVerdict)
  open_count: number;
  gap_eur_sum: number | null;    // somme des écarts € des fenêtres MESURÉES en CA ; null si aucune
  cost_sum: number | null;       // somme des coûts SAISIS ; null si aucun
  net_eur: number | null;        // écart CA mesuré − coûts ; null tant qu'un des deux manque
}

// Un composant (03/09, spec dispositifs-typologie § 5.5) : ses faits DÉCLARÉS, lus dans la couche
// semantic (vw_insight_event_dispositif_components). Ses articles ne sont pas encore reconnus
// (étape 4) : sa lecture chiffrée est celle de son pôle, dite comme telle.
export interface ComposantReading {
  label: string | null;
  type_label_fr: string | null;      // null quand le libellé est provisoire (aucun mot owner)
  role_label_fr: string | null;      // idem
  pole_name: string;
  version_no: number | null;
  since: string | null;              // ISO date — la version courante existe depuis
  // Articles vus sur SA photo courante (livrable 2, 03/09) — depuis la couche semantic ; null = aucune photo.
  items?: { seen: string[]; retrait: string[]; confirmed: boolean } | null;
}

export interface EntityPeriodReading {
  entity: SiteEntity;
  start: string;
  end: string;
  composant?: ComposantReading;
  pole?: { families: PoleFamilyReading[]; operations: PoleOperationRow[]; totals: PoleTotals };
  serie?: SerieOrPersonReading;
  funnel?: { steps: FunnelStepReading[]; occ_days: number; base_days: number };
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
             c.window_actual_revenue, c.window_expected_revenue, c.operation_cost_eur,
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
      cost_eur: r.operation_cost_eur != null && Number.isFinite(Number(flat(r.operation_cost_eur))) ? Number(flat(r.operation_cost_eur)) : null,
    };
  });
  const judgedRows = occurrences.filter((o) => o.status === "resolved" && o.verdict && o.verdict !== "confounded");
  const gaps = occurrences.filter((o) => o.status === "resolved" && o.gap_eur != null);
  const costs = occurrences.filter((o) => o.cost_eur != null);
  return {
    occurrences,
    judged: judgedRows.length,
    kept: judgedRows.filter((o) => isKeptVerdict(o.verdict)).length,
    open_count: occurrences.filter((o) => o.status === "open").length,
    gap_eur_sum: gaps.length ? gaps.reduce((s2, o) => s2 + (o.gap_eur as number), 0) : null,
    cost_sum: costs.length ? Math.round(costs.reduce((s2, o) => s2 + (o.cost_eur as number), 0)) : null,
    net_eur: gaps.length && costs.length
      ? Math.round(gaps.reduce((s2, o) => s2 + (o.gap_eur as number), 0) - costs.reduce((s2, o) => s2 + (o.cost_eur as number), 0))
      : null,
  };
}

// ── Échelle du funnel d'une SÉRIE (bilan de série, D3 — 27/08) ─────────────────────────────────
// OBSERVATIONNEL, jamais jugé : sur les jours d'occurrence de la série (raw.saved_item_dates),
// chaque étape de la vente vs les jours COMPARABLES (mêmes jours de semaine, hors occurrences,
// 90 j avant le début de période inclus). Source = la vue SEMANTIC vw_insight_event_client_
// performance (même précédent que le bloc KPI de la page évolution — cliquet frontière intact).
// Planchers : ≥ 2 jours d'occurrence et ≥ 5 comparables, sinon écart null. Repeat-buy : non
// mesurable sans grain client — jamais simulé.
export interface FunnelStepReading {
  step: "visitors" | "conversion" | "transactions" | "basket" | "revenue";
  occ_value: number | null;    // valeur moyenne pendant l'opération
  base_value: number | null;   // votre résultat habituel (jours comparables)
  delta_pct: number | null;    // écart RELATIF en % (règle owner : % ou €, jamais autre chose)
  occ_days: number;
  base_days: number;
}

export async function readSerieFunnel(
  bq: any,
  location_id: string,
  saved_item_id: string,
  start: string,
  end: string,
  todayIso: string,
): Promise<{ steps: FunnelStepReading[]; occ_days: number; base_days: number }> {
  const wEnd = end < todayIso ? end : todayIso;
  const rows = await bq.query({
    query: `
      WITH occ AS (
        SELECT DATE(date) AS d FROM \`${PROJECT}.raw.saved_item_dates\`
        WHERE saved_item_id = @sid AND location_id = @loc
          AND DATE(date) BETWEEN @pStart AND @pEnd
      ),
      perf AS (
        SELECT DATE(p.date) AS d,
               p.daily_visitors, p.daily_conversion_rate, p.daily_transactions, p.daily_avg_basket, p.daily_revenue,
               EXTRACT(DAYOFWEEK FROM p.date) AS dow,
               DATE(p.date) IN (SELECT d FROM occ) AS is_occ
        FROM \`${PROJECT}.semantic.vw_insight_event_client_performance\` p
        WHERE p.location_id = @loc
          AND p.date BETWEEN DATE_SUB(@pStart, INTERVAL 90 DAY) AND @pEnd
      ),
      dows AS (SELECT DISTINCT dow FROM perf WHERE is_occ)
      SELECT
        AVG(IF(is_occ, daily_visitors, NULL)) AS v_occ, COUNTIF(is_occ AND daily_visitors IS NOT NULL) AS v_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), daily_visitors, NULL)) AS v_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows) AND daily_visitors IS NOT NULL) AS v_base_n,
        AVG(IF(is_occ, daily_conversion_rate, NULL)) AS c_occ, COUNTIF(is_occ AND daily_conversion_rate IS NOT NULL) AS c_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), daily_conversion_rate, NULL)) AS c_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows) AND daily_conversion_rate IS NOT NULL) AS c_base_n,
        AVG(IF(is_occ, daily_transactions, NULL)) AS t_occ, COUNTIF(is_occ AND daily_transactions IS NOT NULL) AS t_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), daily_transactions, NULL)) AS t_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows) AND daily_transactions IS NOT NULL) AS t_base_n,
        AVG(IF(is_occ, daily_avg_basket, NULL)) AS b_occ, COUNTIF(is_occ AND daily_avg_basket IS NOT NULL) AS b_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), daily_avg_basket, NULL)) AS b_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows) AND daily_avg_basket IS NOT NULL) AS b_base_n,
        AVG(IF(is_occ, daily_revenue, NULL)) AS r_occ, COUNTIF(is_occ AND daily_revenue IS NOT NULL) AS r_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), daily_revenue, NULL)) AS r_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows) AND daily_revenue IS NOT NULL) AS r_base_n,
        (SELECT COUNT(*) FROM occ) AS occ_total
      FROM perf`,
    params: { loc: location_id, sid: saved_item_id, pStart: bq.date(start), pEnd: bq.date(wEnd) },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const r0: any = (rows as any[])[0] ?? {};
  const g = (k: string): number | null => {
    const raw2 = flat(r0[k]);
    if (raw2 == null) return null; // AVG de NULLs → null, jamais 0 (Number(null) vaudrait 0)
    const v = Number(raw2);
    return Number.isFinite(v) ? v : null;
  };
  const mk = (step: FunnelStepReading["step"], occK: string, baseK: string): FunnelStepReading => {
    const occ_days = Number(flat(r0[occK + "_n"])) || 0;
    const base_days = Number(flat(r0[baseK + "_n"])) || 0;
    const occ = g(occK), base = g(baseK);
    const delta = occ_days >= 2 && base_days >= 5 && base != null && base > 0 && occ != null
      ? Math.round(((occ - base) / base) * 1000) / 10
      : null;
    return { step, occ_value: occ, base_value: base, delta_pct: delta, occ_days, base_days };
  };
  return {
    steps: [
      mk("visitors", "v_occ", "v_base"),
      mk("conversion", "c_occ", "c_base"),
      mk("transactions", "t_occ", "t_base"),
      mk("basket", "b_occ", "b_base"),
      mk("revenue", "r_occ", "r_base"),
    ],
    // Le résumé = le MAX des étapes (les étapes sans capteur comptent 0 jours).
    occ_days: Math.max(...["v", "c", "t", "b", "r"].map((x) => Number(flat(r0[x + "_occ_n"])) || 0)),
    base_days: Math.max(...["v", "c", "t", "b", "r"].map((x) => Number(flat(r0[x + "_base_n"])) || 0)),
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
  if (entity.kind === "composant") {
    // Faits déclarés depuis la couche semantic (jamais la table analytics) + la lecture de SON pôle.
    const rows = await bq.query({
      query: `SELECT component_label, component_type_label_fr, component_type_provisoire,
                     component_role_label_fr, component_role_provisoire, committed_action_text, pole_families,
                     version_no, CAST(created_at AS STRING) AS created_at
              FROM \`${PROJECT}.semantic.vw_insight_event_dispositif_components\`
              WHERE location_id = @location_id AND dispositif_id = @d AND component_key = @k LIMIT 1`,
      params: { location_id, d: String(entity.pole_id ?? ""), k: String(entity.component_key ?? "") }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
    const c: any = rows[0] ?? {};
    let fams: string[] = entity.families;
    try { if (c.pole_families) fams = JSON.parse(String(flat(c.pole_families))); } catch { /* périmètre illisible */ }
    const composant: ComposantReading = {
      label: c.component_label != null ? String(flat(c.component_label)) || null : null,
      type_label_fr: c.component_type_label_fr != null && !flat(c.component_type_provisoire) ? String(flat(c.component_type_label_fr)) : null,
      role_label_fr: c.component_role_label_fr != null && !flat(c.component_role_provisoire) ? String(flat(c.component_role_label_fr)) : null,
      pole_name: String(flat(c.committed_action_text) || "").split(" — ")[0] || "",
      version_no: c.version_no != null ? Number(flat(c.version_no)) : null,
      since: c.created_at != null ? String(flat(c.created_at)).slice(0, 10) : null,
    };
    const [pole, items] = await Promise.all([
      buildPoleReading(bq, location_id, String(entity.pole_id ?? ""), fams, todayIso, { start, end }),
      buildPoleItemsReading(bq, location_id, String(entity.pole_id ?? ""), composant.version_no, fams, todayIso).catch(() => null),
    ]);
    if (items && items.n_photos) {
      const mine = items.seen.filter((x) => x.component_keys.includes(String(entity.component_key ?? "")));
      composant.items = mine.length ? { seen: mine.map((x) => x.item_description), retrait: mine.filter((x) => x.en_retrait).map((x) => x.item_description), confirmed: mine.every((x) => x.confirmed) } : null;
    }
    return { entity, start, end, composant, pole };
  }
  if (entity.kind === "operation") {
    const [serie, funnel] = await Promise.all([
      readOccurrences(bq, location_id, "saved_item_id = @sid", { sid: String(entity.id) }, start, end),
      readSerieFunnel(bq, location_id, String(entity.id), start, end, todayIso),
    ]);
    return { entity, start, end, serie, funnel };
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
  funnel_table: { cols: any[]; rows: any[] } | null; // échelle de la vente (séries seulement)
  sources: string[];
}

// « Montre la donnée » (owner 27/08) : un TABLEAU (Produit/Opération · Période · Résultat ·
// Variation), une ligne de contexte chiffrée, des sources dépliables — jamais des phrases
// d'appréciation. Les cellules sous les planchers disent « — » avec le compte de jours en sub.
// La phrase des faits déclarés d'un composant. Les libellés provisoires (sans mot owner) sont
// omis, jamais inventés ; le rôle ne s'écrit que s'il a un mot.
export function composantProse(c: ComposantReading): string {
  const nature = [c.type_label_fr, c.role_label_fr].filter(Boolean).join(" · ");
  const head = `Composant du pôle ${c.pole_name}${nature ? ` — ${nature}` : ""}.`;
  const version = c.version_no != null && c.since ? ` Version ${c.version_no} depuis le ${frD(c.since)}.` : "";
  if (c.items && c.items.seen.length) {
    const retrait = c.items.retrait.length ? ` En retrait sur votre résultat habituel (30 derniers jours) : ${c.items.retrait.join(", ")}.` : " Aucun en retrait sur les 30 derniers jours.";
    return `${head}${version} Articles ${c.items.confirmed ? "confirmés" : "reconnus"} sur la photo : ${c.items.seen.join(", ")}.${retrait}`;
  }
  return `${head}${version} Articles reconnus : aucun pour l'instant · les chiffres ci-dessous sont ceux du pôle.`;
}

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
      // Composant (03/09) : ses faits déclarés d'abord, puis l'absence dite (règle 7) — la
      // lecture chiffrée est celle du pôle, jamais attribuée au composant.
      r.composant ? composantProse(r.composant) : "",
      t.share_pct != null ? `${String(t.share_pct).replace(".", ",")} % du CA du site sur la période · variation vs la même durée précédente.` : "",
      openOps.length ? `Opérations en cours sur ce pôle : ${openOps.map((o) => `${String(o.committed_action_text || "").split(" — ")[0]} (${frD(o.window_start)})`).join(" · ")}.` : "",
    ].filter(Boolean);
    return {
      headline,
      prose: proseParts.join("\n\n"),
      table: { cols: [{ label: "Produit" }, { label: "Période" }, { label: "Résultat" }, { label: "Variation" }], rows },
      funnel_table: null,
      sources: [...(r.composant ? ["Mes dispositifs (composants déclarés)"] : []), "Vos ventes par famille (lignes de caisse)"],
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
    ? `Sur la période : ${s2.judged} verdict${s2.judged > 1 ? "s" : ""} rendu${s2.judged > 1 ? "s" : ""}, ${s2.kept} objectif${s2.kept > 1 ? "s" : ""} atteint${s2.kept > 1 ? "s" : ""}${s2.open_count ? `, ${s2.open_count} en cours` : ""}${s2.gap_eur_sum != null ? ` · écart CA cumulé des fenêtres mesurées : ${s2.gap_eur_sum >= 0 ? "+" : "−"}${frEur(Math.abs(s2.gap_eur_sum))} €` : ""}${s2.cost_sum != null ? ` · coûts saisis : ${frEur(s2.cost_sum)} €` : ""}${s2.net_eur != null ? ` · net après coûts : ${s2.net_eur >= 0 ? "+" : "−"}${frEur(Math.abs(s2.net_eur))} €` : ""}.`
    : `Aucune opération sur cette période.`;
  // ── Échelle de la vente (bilan de série, format owner : l'unité dans le LIBELLÉ, cellules
  // nues, écarts en % ; « — » sous les planchers). Ligne de décision factuelle à ≥ 3
  // occurrences jugées — jamais Go/No-Go : elle NOMME les étapes, chiffres à l'appui.
  const STEP_FR: Record<string, { label: string; fmt: (v: number) => string }> = {
    visitors: { label: "Visiteurs/jour", fmt: (v) => String(Math.round(v)) },
    conversion: { label: "Taux de conversion", fmt: (v) => `${String(Math.round(v * 1000) / 10).replace(".", ",")} %` },
    transactions: { label: "Ventes/jour", fmt: (v) => String(Math.round(v)) },
    basket: { label: "Panier moyen", fmt: (v) => `${String(Math.round(v * 100) / 100).replace(".", ",")} €` },
    revenue: { label: "CA/jour", fmt: (v) => `${frEur(v)} €` },
  };
  let funnel_table: { cols: any[]; rows: any[] } | null = null;
  let decision = "";
  if (r.funnel && r.funnel.occ_days >= 2) {
    const frows = r.funnel.steps
      .filter((st) => st.occ_value != null || st.base_value != null)
      .map((st) => {
        const f = STEP_FR[st.step];
        return { cells: [
          { v: f.label, bold: true },
          { v: st.occ_value != null ? f.fmt(st.occ_value) : "—" },
          { v: st.base_value != null ? f.fmt(st.base_value) : "—", color: "#6B7280" },
          st.delta_pct != null
            ? { v: frPct1(st.delta_pct), color: st.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true }
            : { v: "—", color: "#9CA3AF" },
        ] };
      });
    if (frows.length) {
      funnel_table = { cols: [{ label: "Étape de la vente", align: "left" }, { label: "Pendant l'opération" }, { label: "Votre résultat habituel" }, { label: "Écart" }], rows: frows };
    }
    if (s2.judged >= 3) {
      const measured = r.funnel.steps.filter((st) => st.delta_pct != null);
      const up = measured.filter((st) => st.delta_pct! > 0);
      const down = measured.filter((st) => st.delta_pct! < 0);
      const nameOf = (st: FunnelStepReading) => STEP_FR[st.step].label;
      const parts: string[] = [];
      if (up.length) parts.push(`Ce qui bouge pendant l'opération : ${up.map((st) => `${nameOf(st)} ${frPct1(st.delta_pct!)}`).join(", ")}`);
      if (down.length) parts.push(`ce qui ne suit pas : ${down.map((st) => `${nameOf(st)} ${frPct1(st.delta_pct!)}`).join(", ")}`);
      if (parts.length) decision = parts.join(" · ") + ".";
    }
  }
  return {
    headline,
    prose: [totals, decision].filter(Boolean).join("\n\n"),
    table: rows.length ? { cols: [{ label: "Opération" }, { label: "Dates" }, { label: "Verdict" }, { label: "Effet — dans son KPI" }], rows } : null,
    funnel_table,
    sources: [
      "Vos engagements (verdicts et mesures)",
      ...(r.funnel && r.funnel.occ_days >= 2 ? [`Échelle de la vente : ${r.funnel.occ_days} jours d'opération vs ${r.funnel.base_days} jours comparables (mêmes jours de semaine, hors opérations).`] : []),
    ],
  };
}

// ── COMPARAISONS (incrément 4 du résolveur, owner go 28/08) — N entités côte à côte et/ou
// deux périodes. Toujours les MÊMES lectures (readEntityPeriod, foyer par foyer), jamais un
// moteur nouveau : le comparatif est une MISE EN TABLE de lectures unitaires — cellules nues,
// « — » sous les planchers, aucun verdict fabriqué entre entités. Le seul chiffre composé est
// l'écart €/jour d'UNE entité CA entre SES deux périodes (division de sommes mesurées).
export interface CompareSection { title: string; table?: { cols: any[]; rows: any[] }; facts?: string[]; register?: "web" }
export interface EntityCompareBlocks { headline: string; sections: CompareSection[]; sources: string[] }

export async function readEntitiesCompared(
  bq: any,
  location_id: string,
  entities: SiteEntity[],
  periods: Array<{ start: string; end: string }>,   // 1 ou 2 (la comparaison)
  todayIso: string,
): Promise<EntityPeriodReading[][]> {
  const ents = entities.slice(0, 3);
  return Promise.all(ents.map((e) =>
    Promise.all(periods.map((p) => readEntityPeriod(bq, location_id, e, p.start, p.end, todayIso))),
  ));
}

export function buildEntityCompareBlocks(grid: EntityPeriodReading[][]): EntityCompareBlocks {
  const grey = "#9CA3AF";
  const entLabel = (e: SiteEntity) => (e.kind === "famille" ? `Famille ${e.name}` : e.name);
  const periods = grid[0].map((r) => ({ start: r.start, end: r.end }));
  const perLabels = periods.map((p) => periodLabelFr(p.start, p.end));
  const caRows: any[] = [];
  const opRows: any[] = [];
  for (const line of grid) {
    for (let k = 0; k < line.length; k++) {
      const r = line[k];
      if (r.pole) {
        const t = r.pole.totals;
        const eurDay = t.rev30_eur != null && t.n30 > 0 ? Math.round(t.rev30_eur / t.n30) : null;
        caRows.push({ cells: [
          { v: entLabel(r.entity), bold: true },
          { v: perLabels[k], color: "#6B7280" },
          t.rev30_eur != null ? { v: `${frEur(t.rev30_eur)} €`, sub: `${t.n30} j vendus` } : { v: "—", color: grey },
          eurDay != null ? { v: `${frEur(eurDay)} €/jour` } : { v: "—", color: grey },
          t.delta_pct != null
            ? { v: frPct1(t.delta_pct), color: t.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true, sub: "vs la même durée précédente" }
            : { v: "—", color: grey, sub: `${t.n30} j vendus — plancher 5 j de chaque côté` },
        ] });
      } else if (r.serie) {
        const s2 = r.serie;
        opRows.push({ cells: [
          { v: entLabel(r.entity), bold: true },
          { v: perLabels[k], color: "#6B7280" },
          { v: String(s2.occurrences.length) },
          { v: s2.judged ? `${s2.kept}/${s2.judged} objectifs atteints${s2.open_count ? ` · ${s2.open_count} en cours` : ""}` : (s2.open_count ? `${s2.open_count} en cours` : "—"), color: s2.judged || s2.open_count ? undefined : grey },
          s2.gap_eur_sum != null
            ? { v: `${s2.gap_eur_sum >= 0 ? "+" : "−"}${frEur(Math.abs(s2.gap_eur_sum))} €`, color: s2.gap_eur_sum >= 0 ? "#0F6E56" : "#B45309", bold: true, sub: "écart CA des fenêtres mesurées" }
            : { v: "—", color: grey },
        ] });
      }
    }
  }
  const sections: CompareSection[] = [];
  if (caRows.length) {
    // L'écart entre les DEUX périodes d'une même entité CA — division de sommes mesurées.
    const facts: string[] = [];
    if (periods.length === 2) {
      for (const line of grid) {
        const [a, b] = line;
        if (!a.pole || !b.pole) continue;
        const dA = a.pole.totals.rev30_eur != null && a.pole.totals.n30 > 0 ? a.pole.totals.rev30_eur / a.pole.totals.n30 : null;
        const dB = b.pole.totals.rev30_eur != null && b.pole.totals.n30 > 0 ? b.pole.totals.rev30_eur / b.pole.totals.n30 : null;
        if (dA != null && dB != null && dB > 0 && a.pole.totals.n30 >= 5 && b.pole.totals.n30 >= 5) {
          const d = Math.round(((dA - dB) / dB) * 1000) / 10;
          facts.push(`${entLabel(a.entity)} : ${frEur(Math.round(dA))} €/jour (${perLabels[0]}) vs ${frEur(Math.round(dB))} €/jour (${perLabels[1]}) — ${frPct1(d)}.`);
        }
      }
    }
    sections.push({
      title: "Côte à côte",
      table: { cols: [{ label: "Entité", align: "left" }, { label: "Période", align: "left" }, { label: "Résultat" }, { label: "CA/jour" }, { label: "Variation" }], rows: caRows },
      facts: facts.length ? facts : undefined,
    });
  }
  if (opRows.length) {
    sections.push({
      title: caRows.length ? "Les opérations" : "Côte à côte",
      table: { cols: [{ label: "Entité", align: "left" }, { label: "Période", align: "left" }, { label: "Occurrences" }, { label: "Verdicts" }, { label: "Écart CA" }], rows: opRows },
    });
  }
  const ents = grid.map((line) => entLabel(line[0].entity));
  const headline = periods.length === 2 && grid.length === 1
    ? `${ents[0]} — ${perLabels[0]} vs ${perLabels[1]}`
    : `${ents.join(" vs ")} — ${perLabels[0]}`;
  return {
    headline,
    sections,
    sources: [
      ...(caRows.length ? ["Vos ventes par famille (lignes de caisse)"] : []),
      ...(opRows.length ? ["Vos engagements (verdicts et mesures)"] : []),
      "Variation : chaque période se compare à la même durée qui la précède.",
    ],
  };
}

// ── « POURQUOI ? » (incrément 5 du résolveur, 28/08) — la CONSTRUCTION du dernier résultat,
// jamais une cause inventée : d'où vient chaque nombre (lignes de caisse, fenêtre, planchers,
// KPI déclaré), avec les CHIFFRES RÉELS de la lecture re-jouée. Le registre causal reste
// intouché — expliquer un calcul n'est pas affirmer une cause.
export function buildEntityWhyBlocks(r: EntityPeriodReading): EntityCompareBlocks {
  const per = periodLabelFr(r.start, r.end);
  const label = r.entity.kind === "famille" ? `Famille ${r.entity.name}` : r.entity.name;
  const sections: CompareSection[] = [];
  if (r.pole) {
    const t = r.pole.totals;
    const facts: string[] = [];
    if (t.rev30_eur != null && t.n30 > 0) {
      facts.push(`Le résultat est la somme de vos lignes de caisse (${label}) ${per} : ${frEur(t.rev30_eur)} € sur ${t.n30} j vendus, soit ${frEur(Math.round(t.rev30_eur / t.n30))} €/jour.`);
    }
    if (t.delta_pct != null && t.avg30_eur_day != null && t.base_eur_day != null) {
      facts.push(`La variation compare ${frEur(Math.round(t.avg30_eur_day))} €/jour (la période) à ${frEur(Math.round(t.base_eur_day))} €/jour (la même durée qui la précède) : ${frPct1(t.delta_pct)}. Plancher : 5 j vendus de chaque côté, sinon « — ».`);
    } else if (t.delta_pct == null) {
      facts.push(`${t.n30} j vendus sur la période — sous le plancher de 5 j de chaque côté, aucune variation ne s'affiche.`);
    }
    if (t.share_pct != null) facts.push(`Le poids (${String(t.share_pct).replace(".", ",")} % du CA) divise ce résultat par le CA TOTAL du site sur la même période.`);
    if (r.composant) facts.unshift(`${r.entity.name} est un composant déclaré du pôle ${r.composant.pole_name}${r.composant.version_no != null ? ` (version ${r.composant.version_no})` : ""} ; ses articles ne sont pas reconnus pour l'instant — les chiffres sont ceux du pôle.`);
    sections.push({ title: "D'où viennent ces chiffres", facts });
    if (r.entity.kind === "pole" && r.pole.families.length > 1) {
      sections.push({
        title: "Ce qui compose le pôle",
        table: { cols: [{ label: "Famille", align: "left" }, { label: "Résultat" }, { label: "Variation" }], rows: r.pole.families.map((f) => ({ cells: [
          { v: f.family, bold: true },
          f.rev_eur != null ? { v: `${frEur(f.rev_eur)} €`, sub: `${f.n30} j vendus` } : { v: "—", color: "#9CA3AF" },
          f.delta_pct != null ? { v: frPct1(f.delta_pct), color: f.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true } : { v: "—", color: "#9CA3AF" },
        ] })) },
      });
    }
  }
  if (r.serie) {
    const s2 = r.serie;
    const facts: string[] = [];
    facts.push(`${s2.occurrences.length} occurrence${s2.occurrences.length > 1 ? "s" : ""} sur la période — chacune est jugée dans SON KPI déclaré (l'effet % de la ligne), jamais dans un autre.`);
    if (s2.gap_eur_sum != null) facts.push(`L'écart CA cumulé (${s2.gap_eur_sum >= 0 ? "+" : "−"}${frEur(Math.abs(s2.gap_eur_sum))} €) ne somme que les fenêtres MESURÉES en CA : réalisé moins attendu, fenêtre par fenêtre.`);
    if (s2.cost_sum != null) facts.push(`Les coûts (${frEur(s2.cost_sum)} €) sont ceux que vous avez saisis — jamais déduits.`);
    sections.push({ title: "D'où viennent ces chiffres", facts });
  }
  if (r.funnel && r.funnel.occ_days >= 2) {
    sections.push({ title: "Le référentiel de l'échelle de la vente", facts: [
      `${r.funnel.occ_days} jours d'opération comparés à ${r.funnel.base_days} jours comparables : mêmes jours de semaine, hors opérations.`,
    ] });
  }
  return {
    headline: `${label} — ${per} : d'où viennent les chiffres`,
    sections,
    sources: r.pole ? [...(r.composant ? ["Mes dispositifs (composants déclarés)"] : []), "Vos ventes par famille (lignes de caisse)"] : ["Vos engagements (verdicts et mesures)"],
  };
}

// ── LE KPI PILOTE LES LECTURES (owner go 28/08) — « mon panier moyen en juillet » : une
// question KPI × période SANS entité lit LE foyer kpiRegistry (measureKpiMean — la même
// moyenne que les verdicts, jamais recopiée) sur la période ET la même durée précédente ;
// profit estimé via measureProfitEstimatedStats (marges déclarées, jamais un profit inventé).
// KPI non mesurables sur le site (visiteurs/conversion sans capteur) → « — » avec le compte.
import { measureKpiMean, measureProfitEstimatedStats, KPI_NOM_FR, isKpiMeasurable, type KpiKey } from "./kpiRegistry";

const kpiFmt = (key: KpiKey, v: number): string => {
  if (key === "conversion") return `${(Math.round(v * 1000) / 10).toLocaleString("fr-FR")} %`;
  // Un panier moyen se dit avec ses centimes — « 5 € » cacherait la vraie valeur (5,43 €).
  if (key === "basket") return `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  if (key === "discount" || key === "profit_estimated") return `${frEur(v)} €`;
  return Math.round(v).toLocaleString("fr-FR");
};

export async function readKpiPeriod(
  bq: any,
  location_id: string,
  kpi: KpiKey,
  periods: Array<{ start: string; end: string }>,
): Promise<EntityCompareBlocks | null> {
  const label = KPI_NOM_FR[kpi]?.nom ?? kpi;
  const spanDays = (p: { start: string; end: string }) => Math.max(1, Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000) + 1);
  const prevOf = (p: { start: string; end: string }) => {
    const n = spanDays(p);
    const end = new Date(Date.parse(p.start) - 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.parse(end) - (n - 1) * 86400000).toISOString().slice(0, 10);
    return { start, end };
  };
  const read = async (p: { start: string; end: string }) => {
    if (kpi === "profit_estimated") {
      const st = await measureProfitEstimatedStats(bq, location_id, p.start, p.end).catch(() => null);
      return st ? { value: st.mean, n_days: st.n_days } : null;
    }
    if (!isKpiMeasurable(kpi)) return null;
    return measureKpiMean(bq, location_id, kpi, p.start, p.end).catch(() => null);
  };
  const rows: any[] = [];
  const facts: string[] = [];
  const grey = "#9CA3AF";
  const readings = await Promise.all(periods.map(async (p) => ({
    p, cur: await read(p), prev: await read(prevOf(p)),
  })));
  if (readings.every((x) => !x.cur)) return null;   // rien de mesurable → la chaîne legacy répond
  for (const { p, cur, prev } of readings) {
    const delta = cur && prev && cur.n_days >= 5 && prev.n_days >= 5 && prev.value > 0
      ? Math.round(((cur.value - prev.value) / prev.value) * 1000) / 10 : null;
    rows.push({ cells: [
      { v: label, bold: true },
      { v: periodLabelFr(p.start, p.end), color: "#6B7280" },
      cur ? { v: kpiFmt(kpi, cur.value), sub: `moyenne/jour · ${cur.n_days} j` } : { v: "—", color: grey },
      delta != null
        ? { v: frPct1(delta), color: delta >= 0 ? "#0F6E56" : "#B45309", bold: true, sub: "vs la même durée précédente" }
        : { v: "—", color: grey, sub: cur ? "plancher 5 j de chaque côté" : undefined },
    ] });
  }
  if (periods.length === 2) {
    const [a, b] = readings;
    if (a.cur && b.cur && a.cur.n_days >= 5 && b.cur.n_days >= 5 && b.cur.value > 0) {
      const d = Math.round(((a.cur.value - b.cur.value) / b.cur.value) * 1000) / 10;
      facts.push(`${label} : ${kpiFmt(kpi, a.cur.value)} (${periodLabelFr(a.p.start, a.p.end)}) vs ${kpiFmt(kpi, b.cur.value)} (${periodLabelFr(b.p.start, b.p.end)}) — ${frPct1(d)}.`);
    }
  }
  return {
    headline: periods.length === 2
      ? `${label.charAt(0).toUpperCase() + label.slice(1)} — ${periodLabelFr(periods[0].start, periods[0].end)} vs ${periodLabelFr(periods[1].start, periods[1].end)}`
      : `${label.charAt(0).toUpperCase() + label.slice(1)} — ${periodLabelFr(periods[0].start, periods[0].end)}`,
    sections: [{ title: "Côte à côte", table: { cols: [{ label: "KPI", align: "left" }, { label: "Période", align: "left" }, { label: "Résultat" }, { label: "Variation" }], rows }, facts: facts.length ? facts : undefined }],
    sources: [
      kpi === "profit_estimated" ? "Vos ventes × vos marges déclarées (profit estimé)" : "Vos ventes quotidiennes (mesures par jour)",
      "Variation : chaque période se compare à la même durée qui la précède.",
    ],
  };
}

// ── « POURQUOI ? » AUX 3 ÉTAGES (owner 28/08 — « la valeur des éléments, le lien avec des
// phénomènes extérieurs, le profil de jour ; jamais tout balancer sans hiérarchie ») :
//   1. Ce qui compose l'écart — pôle : les familles triées par contribution ; famille : les
//      jours qui ont porté/plombé la période (concentration mesurée).
//   2. Les phénomènes extérieurs — les jours de la période croisés avec les facteurs
//      (journalPlan, mêmes prédicats que les verdicts) : €/jour AVEC vs SANS le facteur
//      (arithmétique de sommes mesurées, dans la période), l'historique du SITE en prior
//      (day_class_impacts, médiane), l'indice de corrélation — triés par |r|, plafond 3.
//   3. Le profil de jour — week-end vs semaine, seulement si le contraste passe les planchers.
// Règle anti-bruit : un étage qui n'isole rien ne s'affiche pas. Les relations utilisées se
// listent au pied « Indices de corrélation » (une section Sources existe → il se liste).
import { listDayFactors, dayFactorKeys, factorFr } from "./journalPlan";
import { corrIndexFr, signalAConfirmer } from "./dayClassRegistry";

export interface WhyFactorInput {
  key: string; mot_fr: string;
  med_hist_eur: number | null;   // médiane historique SITE (day_class_impacts)
  corr_r: number | null;
  a_confirmer: boolean;
  hist_days: number | null;
}
export interface EntityWhyInputs {
  reading: EntityPeriodReading;                       // totaux (contexte du headline)
  daily: Array<{ date: string; eur: number }>;        // CA/jour de L'ENTITÉ sur la période (jours vendus)
  factorsByDate: Map<string, string[]>;               // date → clés de facteurs (journalPlan)
  factors: WhyFactorInput[];                          // les facteurs MESURÉS du site
}

export function buildEntityWhy3Blocks(inp: EntityWhyInputs): EntityCompareBlocks {
  const r = inp.reading;
  const per = periodLabelFr(r.start, r.end);
  const label = r.entity.kind === "famille" ? `Famille ${r.entity.name}` : r.entity.name;
  const sections: CompareSection[] = [];
  const frD3 = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const days = [...inp.daily].filter((d) => Number.isFinite(d.eur));
  const total = days.reduce((a, d) => a + d.eur, 0);

  // ── 1. Ce qui compose l'écart ──
  if (r.pole && r.entity.kind === "pole" && r.pole.families.length > 1) {
    const fams = [...r.pole.families]
      .filter((f) => f.rev_eur != null)
      .sort((a, b) => Math.abs((b.delta_pct ?? 0) * (b.rev_eur ?? 0)) - Math.abs((a.delta_pct ?? 0) * (a.rev_eur ?? 0)))
      .slice(0, 3);
    if (fams.length) {
      sections.push({ title: "Ce qui compose l'écart", facts: fams.map((f) =>
        `${f.family} : ${frEur(f.rev_eur as number)} € sur la période${f.delta_pct != null ? ` — ${frPct1(f.delta_pct)} vs la même durée précédente` : ""}.`) });
    }
  } else if (days.length >= 6 && total > 0) {
    const sorted = [...days].sort((a, b) => b.eur - a.eur);
    const top3 = sorted.slice(0, 3);
    const topShare = Math.round((top3.reduce((a, d) => a + d.eur, 0) / total) * 100);
    const bot = sorted[sorted.length - 1];
    const facts = [
      `Vos 3 meilleurs jours (${top3.map((d) => frD3(d.date)).join(", ")}) portent ${topShare} % du CA de la période (${top3.map((d) => `${frEur(d.eur)} €`).join(" · ")}).`,
      `Le jour le plus bas : ${frD3(bot.date)}, ${frEur(bot.eur)} €.`,
    ];
    sections.push({ title: "Ce qui compose l'écart", facts });
  }

  // ── 2. Les phénomènes extérieurs — AVEC vs SANS, dans la période ; prior site ; tri par |r| ──
  const corrFoot: string[] = [];
  {
    const facts: string[] = [];
    const cand = inp.factors
      .filter((f) => f.med_hist_eur != null && f.corr_r != null)
      .sort((a, b) => Math.abs(b.corr_r as number) - Math.abs(a.corr_r as number));
    for (const f of cand) {
      const withD = days.filter((d) => (inp.factorsByDate.get(d.date) ?? []).includes(f.key));
      const without = days.filter((d) => !(inp.factorsByDate.get(d.date) ?? []).includes(f.key));
      if (withD.length < 3 || without.length < 3) continue;   // plancher : un contraste se mesure
      if (facts.length >= 3) break;                           // plafond anti-bruit
      const mWith = withD.reduce((a, d) => a + d.eur, 0) / withD.length;
      const mWithout = without.reduce((a, d) => a + d.eur, 0) / without.length;
      const idx = corrIndexFr(f.corr_r, f.hist_days);
      facts.push(
        `Vos ${withD.length} jours de ${f.mot_fr} sur la période : ${frEur(Math.round(mWith))} €/jour · vos ${without.length} jours sans : ${frEur(Math.round(mWithout))} €/jour. Historique du site : ${(f.med_hist_eur as number) >= 0 ? "+" : "−"}${frEur(Math.abs(f.med_hist_eur as number))} €/jour (médiane).${idx ? ` ${idx}.` : ""}${f.a_confirmer ? " Signal à confirmer." : ""}`,
      );
      if (idx) corrFoot.push(`${f.mot_fr} ↔ CA : ${idx.charAt(0).toLowerCase() + idx.slice(1)}${f.a_confirmer ? " — signal à confirmer" : ""}.`);
    }
    if (facts.length) sections.push({ title: "Les phénomènes extérieurs", facts });
  }

  // ── 3. Le profil de jour — week-end vs semaine, planchers tenus, contraste exigé ──
  {
    const isWe = (iso: string) => { const dw = new Date(iso + "T12:00:00Z").getUTCDay(); return dw === 0 || dw === 6; };
    const we = days.filter((d) => isWe(d.date));
    const wk = days.filter((d) => !isWe(d.date));
    if (we.length >= 3 && wk.length >= 3) {
      const mWe = we.reduce((a, d) => a + d.eur, 0) / we.length;
      const mWk = wk.reduce((a, d) => a + d.eur, 0) / wk.length;
      const base = Math.min(mWe, mWk);
      if (base > 0 && Math.abs(mWe - mWk) / base >= 0.15) {
        sections.push({ title: "Le profil de jour", facts: [
          `Vos week-ends : ${frEur(Math.round(mWe))} €/jour (${we.length} j) · vos jours de semaine : ${frEur(Math.round(mWk))} €/jour (${wk.length} j).`,
        ] });
      }
    }
  }

  if (corrFoot.length) sections.push({ title: "Indices de corrélation", facts: corrFoot });
  if (!sections.length) sections.push({ title: "Ce qui compose l'écart", facts: ["Pas assez de jours vendus sur la période pour isoler quoi que ce soit — les totaux de la lecture restent la seule matière."] });
  return {
    headline: `${label} — ${per} : ce qui l'explique`,
    sections,
    sources: [
      "Vos ventes par jour (lignes de caisse de la période)",
      "Facteurs par jour (mêmes prédicats que les verdicts)",
      "Motifs mesurés sur votre historique (classes de jours, médiane vs résultat habituel)",
    ],
  };
}

// Le lecteur du pourquoi 3 étages : 4 lectures en parallèle, composition PURE ensuite.
// Le CA/jour est celui de L'ENTITÉ (famille ou pôle = ses familles) ; fin bornée à hier
// (un jour futur n'a pas de ventes). opération/personne gardent buildEntityWhyBlocks.
const FACTOR_TO_CLASSES_WHY: Record<string, string[]> = {
  rain: ["rain"], heat: ["heat_28_plus", "heat_25_27"],
  school_holiday: ["school_holiday"], public_holiday: ["public_holiday"], tourism_peak: ["tourism_peak"],
};

export async function readEntityWhy(
  bq: any,
  location_id: string,
  entity: SiteEntity,
  start: string,
  end: string,
  todayIso: string,
): Promise<EntityCompareBlocks> {
  if (entity.kind === "operation" || entity.kind === "personne") {
    const r = await readEntityPeriod(bq, location_id, entity, start, end, todayIso);
    return buildEntityWhyBlocks(r);
  }
  const endB = end < todayIso ? end : new Date(Date.parse(todayIso) - 86400000).toISOString().slice(0, 10);
  const [reading, dailyRows, factorRows, impactRows] = await Promise.all([
    readEntityPeriod(bq, location_id, entity, start, end, todayIso),
    bq.query({
      query: `SELECT CAST(transaction_date AS STRING) AS d, ROUND(SUM(revenue), 0) AS eur
              FROM \`${PROJECT}.raw.client_transactions\`
              WHERE location_id = @loc AND item_category IN UNNEST(@fams)
                AND transaction_date BETWEEN @s AND @e
              GROUP BY 1 ORDER BY 1`,
      params: { loc: location_id, fams: entity.families, s: bq.date(start), e: bq.date(endB) },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    listDayFactors(bq, location_id, { start, end: endB }).catch(() => []),
    bq.query({
      query: `SELECT class_key, basis, med_gap_eur, n_days, corr_r, avg_log, sd_log, n_log
              FROM \`${PROJECT}.analytics.day_class_impacts\`
              WHERE location_id = @loc AND metric = 'revenue_residual' AND basis IN ('pure', 'marginal')`,
      params: { loc: location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
  ]);
  const daily = (dailyRows as any[]).map((r) => ({ date: String(flat(r.d)), eur: Number(flat(r.eur)) || 0 }));
  const factorsByDate = new Map<string, string[]>();
  for (const d of factorRows as any[]) factorsByDate.set(String(flat(d.date) ?? "").slice(0, 10), dayFactorKeys(d));
  // Le pont facteur → classe mesurée : pure d'abord (n>=5), marginale sinon — même règle que le plan.
  const byClass = new Map<string, any>();
  for (const row of impactRows as any[]) {
    const k = String(flat(row.class_key));
    const cand = row;
    const cur = byClass.get(k);
    if (Number(flat(cand.n_days)) < 5) continue;
    if (!cur || (String(flat(cur.basis)) === "marginal" && String(flat(cand.basis)) === "pure")) byClass.set(k, cand);
  }
  const factors: WhyFactorInput[] = Object.entries(FACTOR_TO_CLASSES_WHY)
    .map(([key, classes]) => {
      const mot = factorFr(key);
      const row = classes.map((c) => byClass.get(c)).find((x) => x != null);
      if (!mot || !row) return null;
      const med = Number(flat(row.med_gap_eur));
      const rv = Number.isFinite(Number(flat(row.corr_r))) ? Number(flat(row.corr_r)) : null;
      const al = Number(flat(row.avg_log)), sl = Number(flat(row.sd_log)), nl = Number(flat(row.n_log));
      const t = Number.isFinite(al) && Number.isFinite(sl) && sl > 0 && nl >= 2 ? Math.abs(al) / (sl / Math.sqrt(nl)) : 0;
      return { key, mot_fr: mot, med_hist_eur: Number.isFinite(med) ? Math.round(med) : null, corr_r: rv, a_confirmer: signalAConfirmer(med, rv, t), hist_days: Number(flat(row.n_days)) || null } as WhyFactorInput;
    })
    .filter((f): f is WhyFactorInput => f != null);
  return buildEntityWhy3Blocks({ reading, daily, factorsByDate, factors });
}
