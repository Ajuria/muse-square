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
import { listIndustryPlays, type BestInClassPlay } from "./bestInClassStore";

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
  entangled: boolean;          // base marginale — le rendu NOMME les facteurs mêlés
  entangled_with: Array<{ mot_fr: string; n: number }>;  // co-occurrences RÉELLES sur l'historique de la mesure
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
  web_plays: BestInClassPlay[];   // références crawlées (même industrie) quand rien de prouvé n'est plaçable
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
      query: `SELECT class_key, basis, med_gap_eur, n_days, span_days FROM \`${PROJECT}.analytics.day_class_impacts\`
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
  const impactByClass = new Map<string, { med: number; n: number; span: number; entangled: boolean }>();
  for (const r of impactRows as any[]) {
    const ckey = String(flat(r.class_key));
    const cand = { med: Number(flat(r.med_gap_eur)), n: Number(flat(r.n_days)) || 0, span: Number(flat(r.span_days)) || 180, entangled: String(flat(r.basis)) === "marginal" };
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
        entangled_with: [],
        _span: cls ? cls.span : 0,
      } as any;
    })
    .filter((m): m is PlanMotif => m != null)
    .sort((a, b) => Math.abs(b.med_gap_eur ?? 0) - Math.abs(a.med_gap_eur ?? 0));

  // « Facteurs mêlés → LESQUELS » (owner 27/08 soir) : les co-occurrences RÉELLES sur
  // l'historique de la mesure (listDayFactors sur le span du magasin, borné hier) — la donnée
  // ne se cache pas derrière une étiquette.
  const entangledMotifs = motifs.filter((m) => m.entangled);
  if (entangledMotifs.length) {
    const maxSpan = Math.min(400, Math.max(...entangledMotifs.map((m: any) => m._span || 180)));
    const histStart = new Date(Date.parse(todayIso) - maxSpan * 86400000).toISOString().slice(0, 10);
    const histEnd = new Date(Date.parse(todayIso) - 86400000).toISOString().slice(0, 10);
    const histRows = await listDayFactors(bq, location_id, { start: histStart, end: histEnd }).catch(() => []);
    for (const m of entangledMotifs) {
      // Chaque chiffre porte SA fenêtre : la co-occurrence se compte sur le span de LA mesure
      // de CE motif (jamais sur la fenêtre d'un autre — 35 j de vacances sur 30 j d'historique
      // était le symptôme, attrapé à l'E2E).
      const mSpan = (m as any)._span || 180;
      const mStart = new Date(Date.parse(todayIso) - mSpan * 86400000).toISOString().slice(0, 10);
      // En % des jours DU FACTEUR (auto-référentiel : le facteur « chaleur » et la classe
      // mesurée n'ont pas le même périmètre de jours — des comptes absolus croisés mentaient,
      // attrapé à l'E2E : « 35 j de vacances » sur « 30 j d'historique »).
      const co = new Map<string, number>();
      let factorDays = 0;
      for (const d of histRows as any[]) {
        const dDate = String(flat(d.date) ?? "").slice(0, 10);
        if (dDate < mStart) continue;
        const keys = dayFactorKeys(d);
        if (!keys.includes(m.key)) continue;
        factorDays++;
        for (const k of keys) { if (k !== m.key) co.set(k, (co.get(k) ?? 0) + 1); }
      }
      m.entangled_with = factorDays >= 5 ? [...co.entries()]
        .map(([k, n2]) => ({ mot_fr: factorFr(k) ?? "", n: Math.round((n2 / factorDays) * 100) }))
        .filter((x) => x.mot_fr && x.n >= 20)
        .sort((a, b) => b.n - a.n)
        .slice(0, 2) : [];
    }
  }
  for (const m of motifs as any[]) delete m._span;

  // « À placer » ne hausse jamais les épaules (owner 27/08 soir) : rien de prouvé plaçable →
  // les références CRAWLÉES de la même industrie (bestInClassStore — des PREUVES « X a fait
  // Y », registre WEB au rendu, jamais mêlées au vérifié).
  let web_plays: BestInClassPlay[] = [];
  if (!replay.length && !series_due.length) {
    const [profR] = await bq.query({
      query: `SELECT company_activity_type FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`,
      params: { loc: location_id }, location: "EU",
    }).catch(() => [[]] as any);
    const industry = String(flat((profR?.[0] as any)?.company_activity_type) ?? "").trim();
    if (industry) web_plays = await listIndustryPlays(bq, industry, 3).catch(() => []);
  }

  // Semaines calmes limitées à la période demandée (et la limite d'horizon se dit au rendu).
  const calm_weeks = (calmAll as CalmWeek[]).filter((w) => w.wk >= start.slice(0, 10) && w.wk <= end);

  return { start, end, inventory, open_count: openRows, calm_weeks, motifs, replay: replay as PlanItem[], series_due, web_plays };
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
  register?: "web";   // section en registre WEB (références crawlées) — rendue en segments ambre
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
              sub: `${m.hist_days} jours d'historique${m.entangled ? ` — mêlés à : ${m.entangled_with.length ? m.entangled_with.map((x) => `${x.mot_fr} (${x.n} % de ses jours)`).join(", ") : "autres facteurs des mêmes jours"}` : ""}` }
          : { v: "—", color: "#9CA3AF" },
      ] })),
    } : undefined,
  });

  // 3) À placer — UNIQUEMENT le prouvé (rejeu conditions réunies), les contre-indications,
  // les séries à cadence non tenue. Vide → dit vide.
  const placeFacts: string[] = [];
  for (const p of r.replay.slice(0, 4)) placeFacts.push(p.say_fr);
  for (const sdue of r.series_due) placeFacts.push(`« ${sdue.title} » (série) — rien de daté sur la période.`);
  if (!placeFacts.length) placeFacts.push("Aucun dispositif prouvé n'est rejouable sur les conditions de la période, et aucune série n'attend de date.");
  sections.push({ title: "À placer", facts: placeFacts });
  if (r.web_plays.length) {
    sections.push({
      title: "Des lieux comparables ont fait",
      register: "web",
      facts: r.web_plays.map((pl) => `**${pl.title}** — ${pl.move} Résultat : ${pl.outcome} (${pl.source_name}${pl.published_at ? `, ${pl.published_at}` : ""}).`),
    });
  }

  return {
    headline: `Votre plan — ${per}`,
    sections,
    sources: [
      "Vos engagements (dispositifs prouvés et en cours)",
      "Vos événements et leurs occurrences",
      "Calendrier et météo par jour (mêmes règles que les verdicts)",
      "Veille concurrence (scores ~6 semaines devant)",
      "Motifs mesurés sur votre historique (classes de jours)",
      ...(r.web_plays.length ? ["Références web de votre secteur (crawl, sources citées)"] : []),
    ],
    replay_prefill: r.replay.find((p) => p.direction === "positive" && p.prefill) ?? null,
  };
}
