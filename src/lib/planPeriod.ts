// src/lib/planPeriod.ts
// LE COMPOSEUR du plan de période (27/08) — « planifie-moi septembre ». Il n'invente RIEN :
// il COMPOSE quatre sources réelles du compte, toutes des foyers existants :
//   1. l'inventaire — ce qui est DÉJÀ en place (occurrences datées, engagements ouverts) ;
//   2. les fenêtres — semaines calmes concurrence (events.listCalmWeeks, ~6 sem. devant,
//      limite dite), vacances/fériés/chaleur par jour (journalPlan.listDayFactors — mêmes
//      prédicats que les verdicts) ;
//   3. les candidats — dispositifs PROUVÉS à rejouer (journalPlan sur la plage, règle
//      conservatrice, contre-indication prime), séries à cadence non tenue ;
//   4. les motifs structurels — facteurs présents sur la période × leur impact MESURÉ
//      (analytics.day_class_impacts, med_gap_eur — la mesure robuste, jamais une promesse).
// Jamais un verdict a priori, jamais un chiffre non mesuré : une source vide se dit vide.

import { journalPlan, listDayFactors, dayFactorKeys, factorFr, type PlanItem } from "./journalPlan";
import { listCalmWeeks, type CalmWeek } from "./insightFamilies/events";
import { listUserEvenements } from "./insightFamilies/evenement";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export interface PlanInventoryRow {
  title: string;
  saved_item_id: string | null;
  dates: string[];          // occurrences datées DANS la période
  recurring: boolean;
}

export interface PlanMotif {
  key: string;
  mot_fr: string;           // le mot exploitant du facteur (jamais une clé technique)
  n_days: number;           // jours de la période portant le facteur
  dates: string[];
  med_gap_eur: number | null;  // impact MESURÉ (médiane €/jour vs habituel) — null si non mesuré
  hist_days: number | null;    // taille d'historique de la mesure
  entangled: boolean;          // base marginale (facteurs meles) — le rendu le dit
}

export interface PlanPeriodResult {
  start: string;
  end: string;
  inventory: PlanInventoryRow[];
  open_count: number;          // engagements ouverts chevauchant la période
  calm_weeks: CalmWeek[];      // limite : ~6 semaines de scores devant (dit au rendu)
  motifs: PlanMotif[];
  replay: PlanItem[];          // propositions de rejeu (journalPlan, plage) — contre-indications incluses
  series_due: PlanInventoryRow[]; // séries récurrentes SANS occurrence datée dans la période
}

// Le pont facteur → classe mesurée (day_class_impacts) : exact d'abord, puis préfixe
// (heat → heat_28_plus / heat_25_27, le plus fort d'abord). Aucun pont → pas de chiffre.
const FACTOR_TO_CLASSES: Record<string, string[]> = {
  rain: ["rain"],
  heat: ["heat_28_plus", "heat_25_27"],
  school_holiday: ["school_holiday"],
  public_holiday: ["public_holiday"],
  tourism_peak: ["tourism_peak"],
};

export async function planPeriod(
  bq: any,
  location_id: string,
  start: string,
  end: string,
): Promise<PlanPeriodResult> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [evs, dayRows, calmAll, replay, openRows, impactRows] = await Promise.all([
    // 1) Inventaire : les événements du SITE (loi owner : un suivi appartient à un site).
    listUserEvenements(bq, location_id, null, 12).catch(() => []),
    // 2) Facteurs par jour de la période (foyer journalPlan).
    listDayFactors(bq, location_id, { start, end }).catch(() => []),
    // 2bis) Semaines calmes (foyer events — scores ~6 semaines devant).
    listCalmWeeks(bq, location_id, todayIso).catch(() => []),
    // 3) Rejeux prouvés + contre-indications sur LA plage (foyer journalPlan).
    journalPlan(bq, location_id, 14, { start, end }).catch(() => []),
    // Engagements ouverts chevauchant la période.
    bq.query({
      query: `SELECT COUNT(DISTINCT commitment_id) AS n FROM (
                SELECT commitment_id, status, window_start, window_end,
                       ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
                         CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
                         (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                FROM \`${PROJECT}.analytics.action_commitments\`
                WHERE location_id = @loc
              ) WHERE rn = 1 AND status = 'open'
                AND window_start <= @e AND window_end >= @s`,
      params: { loc: location_id, s: bq.date(start), e: bq.date(end) }, location: "EU",
    }).then((r: any) => Number(flat((r?.[0]?.[0] as any)?.n)) || 0).catch(() => 0),
    // 4) Les impacts mesurés par classe (store des motifs structurels).
    bq.query({
      query: `SELECT class_key, basis, med_gap_eur, n_days FROM \`${PROJECT}.analytics.day_class_impacts\`
              WHERE location_id = @loc AND metric = 'revenue_residual' AND basis IN ('pure', 'marginal')`,
      params: { loc: location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
  ]);

  // Inventaire : occurrences datées DANS la période, par événement.
  const inventory: PlanInventoryRow[] = (evs as any[])
    .map((e) => ({
      title: String(e.title),
      saved_item_id: String(e.saved_item_id),
      recurring: Boolean(e.recurring),
      dates: (e.dates as string[]).filter((d) => d >= start && d <= end),
    }))
    .filter((e) => e.dates.length);
  const series_due: PlanInventoryRow[] = (evs as any[])
    .map((e) => ({
      title: String(e.title),
      saved_item_id: String(e.saved_item_id),
      recurring: Boolean(e.recurring),
      dates: [] as string[],
    }))
    .filter((e, i) => (evs as any[])[i].recurring && !((evs as any[])[i].dates as string[]).some((d: string) => d >= start && d <= end));

  // Motifs : facteurs présents sur la période × impact mesuré quand il existe.
  // Regle du registre (dayClassRegistry) : la base PURE prime quand son n tient le plancher ;
  // sinon la MARGINALE (facteurs meles) passe, MARQUEE entangled — le rendu dira « estime,
  // facteurs meles », jamais un chiffre pur fabrique.
  const impactByClass = new Map<string, { med: number; n: number; entangled: boolean }>();
  for (const r of impactRows as any[]) {
    const ckey = String(flat(r.class_key));
    const cand = { med: Number(flat(r.med_gap_eur)), n: Number(flat(r.n_days)) || 0, entangled: String(flat(r.basis)) === "marginal" };
    if (cand.n < 5) continue;
    const cur = impactByClass.get(ckey);
    if (!cur || (cur.entangled && !cand.entangled)) impactByClass.set(ckey, cand);
  }
  const byFactor = new Map<string, string[]>();
  for (const d of dayRows as any[]) {
    const date = String(flat(d.date) ?? "").slice(0, 10);
    for (const k of dayFactorKeys(d)) {
      byFactor.set(k, [...(byFactor.get(k) ?? []), date]);
    }
  }
  const motifs: PlanMotif[] = [...byFactor.entries()]
    .map(([key, dates]) => {
      const mot = factorFr(key);
      if (!mot || dates.length < 2) return null;   // un facteur sans mot ou anecdotique ne se dit pas
      const cls = (FACTOR_TO_CLASSES[key] ?? []).map((c) => impactByClass.get(c)).find((x) => x != null);
      return {
        key, mot_fr: mot, n_days: dates.length, dates,
        med_gap_eur: cls ? Math.round(cls.med) : null,
        hist_days: cls ? cls.n : null,
        entangled: cls ? cls.entangled : false,
      };
    })
    .filter((m): m is PlanMotif => m != null)
    .sort((a, b) => Math.abs(b.med_gap_eur ?? 0) - Math.abs(a.med_gap_eur ?? 0));

  // Semaines calmes limitées à la période demandée (et la limite d'horizon se dit au rendu).
  const calm_weeks = (calmAll as CalmWeek[]).filter((w) => w.wk >= start.slice(0, 10) && w.wk <= end);

  return { start, end, inventory, open_count: openRows, calm_weeks, motifs, replay: replay as PlanItem[], series_due };
}

// ── Les blocs du plan rendu (format owner : tableaux, chiffres avec leurs fenêtres, sources) ──
// Sections : Déjà en place · Les fenêtres · À placer. Une source vide se DIT vide — jamais
// remplie d'idées générées. « estimé, facteurs mêlés » = le vocabulaire du registre des classes.

const frD2 = (iso: string | null): string => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};
const frEur2 = (v: number): string => Math.round(v).toLocaleString("fr-FR");

export interface PlanSection {
  title: string;
  table?: { cols: any[]; rows: any[] };
  facts?: string[];
}

export interface PlanBlocks {
  headline: string;
  sections: PlanSection[];
  sources: string[];
  /** CTA rejeu (commit_prefill) quand un dispositif prouvé est rejouable — sinon null. */
  replay_prefill: PlanItem | null;
}

export function buildPlanBlocks(r: PlanPeriodResult): PlanBlocks {
  const per = `du ${frD2(r.start)} au ${frD2(r.end)}`;
  const sections: PlanSection[] = [];

  // 1) Déjà en place — l'inventaire d'abord : on ne planifie pas par-dessus l'existant.
  const invFacts: string[] = [];
  if (r.open_count) invFacts.push(`${r.open_count} engagement${r.open_count > 1 ? "s" : ""} en cours sur la période.`);
  sections.push({
    title: "Déjà en place",
    table: r.inventory.length ? {
      cols: [{ label: "Opération", align: "left" }, { label: "Occurrences" }, { label: "Dates" }],
      rows: r.inventory.map((i) => ({ cells: [
        { v: i.title, bold: true },
        { v: String(i.dates.length) },
        { v: i.dates.slice(0, 5).map(frD2).join(" · ") + (i.dates.length > 5 ? " …" : ""), color: "#6B7280" },
      ] })),
    } : undefined,
    facts: r.inventory.length ? (invFacts.length ? invFacts : undefined) : ["Rien de daté sur la période.", ...invFacts],
  });

  // 2) Les fenêtres — semaines calmes (limite d'horizon dite) + motifs mesurés.
  const winFacts: string[] = [];
  for (const w of r.calm_weeks.filter((x) => x.state === "quiet")) {
    winFacts.push(`Semaine du ${w.label} : aucun événement concurrent relevé ne vise votre public.`);
  }
  if (!r.calm_weeks.length) winFacts.push("Couverture concurrence : les scores s'arrêtent à ~6 semaines — aucune semaine de la période n'est encore couverte.");
  sections.push({
    title: "Les fenêtres",
    facts: winFacts.length ? winFacts : undefined,
    table: r.motifs.length ? {
      cols: [{ label: "Motif", align: "left" }, { label: "Jours sur la période" }, { label: "Impact mesuré" }],
      rows: r.motifs.map((m) => ({ cells: [
        { v: m.mot_fr, bold: true },
        { v: String(m.n_days) },
        m.med_gap_eur != null
          ? { v: `${m.med_gap_eur >= 0 ? "+" : "−"}${frEur2(Math.abs(m.med_gap_eur))} €/jour`,
              color: m.med_gap_eur >= 0 ? "#0F6E56" : "#B45309", bold: true,
              sub: `${m.hist_days} jours d'historique${m.entangled ? " — estimé, facteurs mêlés" : ""}` }
          : { v: "—", color: "#9CA3AF" },
      ] })),
    } : undefined,
  });

  // 3) À placer — UNIQUEMENT le prouvé (rejeu conditions réunies), les contre-indications,
  // les séries à cadence non tenue. Vide → dit vide.
  const placeFacts: string[] = [];
  for (const p of r.replay.slice(0, 4)) placeFacts.push(p.say_fr);
  for (const sdue of r.series_due) placeFacts.push(`« ${sdue.title} » (série) — rien de daté sur la période.`);
  if (!placeFacts.length) placeFacts.push("Aucun dispositif prouvé n'est rejouable sur les conditions de la période, et aucune série n'attend de date — le plan n'invente pas : testez une opération sur une semaine calme et le verdict nourrira le prochain plan.");
  sections.push({ title: "À placer", facts: placeFacts });

  return {
    headline: `Votre plan — ${per}`,
    sections,
    sources: [
      "Vos engagements (dispositifs prouvés et en cours)",
      "Vos événements et leurs occurrences",
      "Calendrier et météo par jour (mêmes règles que les verdicts)",
      "Veille concurrence (scores ~6 semaines devant)",
      "Motifs mesurés sur votre historique (classes de jours)",
    ],
    replay_prefill: r.replay.find((p) => p.direction === "positive" && p.prefill) ?? null,
  };
}
