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
import { listPoles, buildPoleReading } from "./poleReading";
import { getDeclaredFamilyMargins, familySlug } from "./ai/corrections";
import { corrIndexFr, signalAConfirmer } from "./dayClassRegistry";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export interface PlanInventoryRow {
  title: string;
  saved_item_id: string | null;
  dates: string[];          // occurrences datées DANS la période
  recurring: boolean;
  author: string | null;    // author_person_name (colonne « Qui » du plan)
}

// ── Le DIAGNOSTIC (owner 27/08 : « si c'est un plan, il faut un diagnostic ») ──────────────
export interface PlanHealth {
  eur_day_win: number | null;   // CA/jour des 30 derniers jours VENDUS (borné à aujourd'hui)
  eur_day_base: number | null;  // CA/jour des 90 jours précédents
  delta_pct: number | null;     // null sous les planchers (n >= 5 des deux côtés — même règle que les pôles)
  n_win: number;
  n_base: number;
}

export interface PlanPole {
  name: string;
  rev_eur: number | null;       // CA du pôle, 30 derniers jours (jours vendus)
  share_pct: number | null;     // poids dans le CA total du site (même fenêtre)
  delta_pct: number | null;     // écart €/j 30 j vs les 90 précédents (mêmes planchers que la page pôle)
  n_win: number;
  margin_eur: number | null;    // ≈ profit 30 j = Σ CA famille × marge DÉCLARÉE (familles déclarées seulement)
  margin_cov_pct: number | null; // % du CA du pôle couvert par des marges déclarées — toujours dit
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
  corr_r: number | null;       // indice de corrélation (r point-bisériel du store) — mots owner 28/08
  a_confirmer: boolean;        // porte de concordance (owner go 28/08) : hors surfaces d'action
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
  web_plays: BestInClassPlay[];   // références crawlées (même industrie) — chantiers de fond candidats
  health: PlanHealth;             // où en est l'entreprise (CA/j 30 j vs 90 précédents)
  poles: PlanPole[];              // vos pôles : CA · poids · écart · marge estimée
  roster: string[];               // prénoms de l'équipe (résolution site d'abord, sinon compte)
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
  // userId (clerk) : ouvre la lecture du roster équipe (résolution « site d'abord, sinon
  // compte », même règle que /api/channels/team). Absent → roster vide, jamais un throw.
  opts?: { userId?: string | null },
): Promise<PlanPeriodResult> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [evs, dayRows, calmAll, replay, openRows, impactRows, healthRow, poleList, famMargins, rosterRows] = await Promise.all([
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
      query: `SELECT class_key, basis, med_gap_eur, n_days, span_days, corr_r, avg_log, sd_log, n_log FROM \`${PROJECT}.analytics.day_class_impacts\`
              WHERE location_id = @loc AND metric = 'revenue_residual' AND basis IN ('pure', 'marginal')`,
      params: { loc: location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    // 5) Santé : CA/j 30 derniers jours VENDUS vs les 90 précédents — borné à AUJOURD'HUI
    // (la graine porte des dates futures, mesuré 24/08) ; mêmes maths que la page pôle.
    bq.query({
      query: `SELECT SUM(IF(w, revenue, 0)) AS rev_w, COUNT(DISTINCT IF(w, transaction_date, NULL)) AS n_w,
                     SUM(IF(NOT w, revenue, 0)) AS rev_b, COUNT(DISTINCT IF(NOT w, transaction_date, NULL)) AS n_b
              FROM (SELECT transaction_date, revenue, transaction_date >= @winStart AS w
                    FROM \`${PROJECT}.raw.client_transactions\`
                    WHERE location_id = @loc AND transaction_date BETWEEN @baseStart AND @today)`,
      params: { loc: location_id, today: bq.date(todayIso),
                winStart: bq.date(new Date(Date.parse(todayIso) - 29 * 86400000).toISOString().slice(0, 10)),
                baseStart: bq.date(new Date(Date.parse(todayIso) - 119 * 86400000).toISOString().slice(0, 10)) },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0][0] : null)).catch(() => null),
    // 6) Les pôles du site (foyer poleReading) — leurs lectures suivent en 2e étage.
    listPoles(bq, location_id).catch(() => []),
    // 7) Marges déclarées par famille (foyer lib/ai/corrections — le même que K9).
    getDeclaredFamilyMargins(location_id).catch(() => []),
    // 8) Roster équipe (« confiez-le à… ») — même résolution que /api/channels/team.
    opts?.userId ? bq.query({
      query: `SELECT first_name FROM (
                SELECT first_name, ROW_NUMBER() OVER (PARTITION BY member_id
                  ORDER BY (location_id = @loc) DESC, updated_at DESC) AS rn
                FROM \`${PROJECT}.analytics.team_members\` WHERE user_id = @uid
              ) WHERE rn = 1 ORDER BY first_name`,
      params: { loc: location_id, uid: opts.userId }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []) : Promise.resolve([]),
  ]);

  // Santé — planchers de la page pôle (n >= 5 des deux côtés), jamais un % sur 2 jours.
  const hN = (v: any): number => Number(flat(v)) || 0;
  const health: PlanHealth = (() => {
    const nW = hN((healthRow as any)?.n_w), nB = hN((healthRow as any)?.n_b);
    const dW = nW ? hN((healthRow as any)?.rev_w) / nW : null;
    const dB = nB ? hN((healthRow as any)?.rev_b) / nB : null;
    return {
      eur_day_win: dW != null ? Math.round(dW) : null,
      eur_day_base: dB != null ? Math.round(dB) : null,
      delta_pct: dW != null && dB != null && nW >= 5 && nB >= 5 && dB > 0 ? Math.round(((dW - dB) / dB) * 1000) / 10 : null,
      n_win: nW, n_base: nB,
    };
  })();

  // Pôles — la MÊME lecture que la page pôle (30 j vs 90 précédents, byte-identique), plus la
  // marge estimée : Σ CA famille × marge DÉCLARÉE sur les familles déclarées, couverture dite.
  const pctBySlug = new Map<string, number>();
  for (const m of famMargins as Array<{ slug: string; pct: number }>) pctBySlug.set(m.slug, m.pct);
  const poles: PlanPole[] = (await Promise.all((poleList as any[]).slice(0, 6).map(async (p) => {
    const rd = await buildPoleReading(bq, location_id, p.dispositif_id, p.families ?? [], todayIso).catch(() => null);
    if (!rd) return null;
    let covered = 0, marginEur = 0, total = 0;
    for (const f of rd.families) {
      const rev = f.rev_eur ?? 0;
      total += rev;
      const pct = pctBySlug.get(familySlug(f.family));
      if (pct != null) { covered += rev; marginEur += rev * (pct / 100); }
    }
    return {
      name: String(p.name),
      rev_eur: rd.totals.rev30_eur,
      share_pct: rd.totals.share_pct,
      delta_pct: rd.totals.delta_pct,
      n_win: rd.totals.n30,
      margin_eur: covered > 0 ? Math.round(marginEur) : null,
      margin_cov_pct: total > 0 && covered > 0 ? Math.min(100, Math.round((covered / total) * 100)) : null,
    } as PlanPole;
  }))).filter((p): p is PlanPole => p != null);

  const roster = (rosterRows as any[]).map((r) => String(flat(r.first_name) ?? "").trim()).filter(Boolean);

  // Inventaire : occurrences datées DANS la période, par événement.
  const inventory: PlanInventoryRow[] = (evs as any[])
    .map((e) => ({
      title: String(e.title),
      saved_item_id: String(e.saved_item_id),
      recurring: Boolean(e.recurring),
      author: e.author != null ? String(e.author) : null,
      dates: (e.dates as string[]).filter((d) => d >= start && d <= end),
    }))
    .filter((e) => e.dates.length);
  const series_due: PlanInventoryRow[] = (evs as any[])
    .map((e) => ({
      title: String(e.title),
      saved_item_id: String(e.saved_item_id),
      recurring: Boolean(e.recurring),
      author: e.author != null ? String(e.author) : null,
      dates: [] as string[],
    }))
    .filter((e, i) => (evs as any[])[i].recurring && !((evs as any[])[i].dates as string[]).some((d: string) => d >= start && d <= end));

  // Motifs : facteurs présents sur la période × impact mesuré quand il existe.
  // Regle du registre (dayClassRegistry) : la base PURE prime quand son n tient le plancher ;
  // sinon la MARGINALE (facteurs meles) passe, MARQUEE entangled — le rendu dira « estime,
  // facteurs meles », jamais un chiffre pur fabrique.
  const impactByClass = new Map<string, { med: number; n: number; span: number; entangled: boolean; corr_r: number | null; a_confirmer: boolean }>();
  for (const r of impactRows as any[]) {
    const ckey = String(flat(r.class_key));
    const _rv = Number.isFinite(Number(flat(r.corr_r))) ? Number(flat(r.corr_r)) : null;
    const _al = Number(flat(r.avg_log)), _sl = Number(flat(r.sd_log)), _nl = Number(flat(r.n_log));
    const _t = Number.isFinite(_al) && Number.isFinite(_sl) && _sl > 0 && _nl >= 2 ? Math.abs(_al) / (_sl / Math.sqrt(_nl)) : 0;
    const cand = { med: Number(flat(r.med_gap_eur)), n: Number(flat(r.n_days)) || 0, span: Number(flat(r.span_days)) || 180, entangled: String(flat(r.basis)) === "marginal", corr_r: _rv, a_confirmer: signalAConfirmer(Number(flat(r.med_gap_eur)), _rv, _t) };
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
        corr_r: cls ? cls.corr_r : null,
        a_confirmer: cls ? cls.a_confirmer : false,
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

  // Références CRAWLÉES de la même industrie (bestInClassStore — des PREUVES « X a fait Y »,
  // registre WEB au rendu, jamais mêlées au vérifié). Depuis le diagnostic (27/08) elles
  // nourrissent les CHANTIERS DE FOND — lues dès que l'industrie du profil est connue.
  let web_plays: BestInClassPlay[] = [];
  {
    const [profR] = await bq.query({
      query: `SELECT company_activity_type FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`,
      params: { loc: location_id }, location: "EU",
    }).catch(() => [[]] as any);
    const industry = String(flat((profR?.[0] as any)?.company_activity_type) ?? "").trim();
    if (industry) web_plays = await listIndustryPlays(bq, industry, 3).catch(() => []);
  }

  // Semaines calmes limitées à la période demandée (et la limite d'horizon se dit au rendu).
  const calm_weeks = (calmAll as CalmWeek[]).filter((w) => w.wk >= start.slice(0, 10) && w.wk <= end);

  return { start, end, inventory, open_count: openRows, calm_weeks, motifs, replay: replay as PlanItem[], series_due, web_plays, health, poles, roster };
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

// Lundi ISO de la semaine d'une date (le même repère que les semaines calmes — wk = lundi).
const mondayOf = (iso: string): string => {
  const t = Date.parse(iso + "T12:00:00Z");
  const dow = new Date(t).getUTCDay(); // 0=dimanche
  return new Date(t - ((dow + 6) % 7) * 86400000).toISOString().slice(0, 10);
};

// ── DIAGNOSTIC D'ABORD, PLAN ENSUITE (owner 27/08 : « si c'est un plan, il faut un
// diagnostic ») : où en est l'entreprise · vos pôles · le coût de la période · menaces ·
// à gagner vite · chantiers de fond · puis le plan semaine par semaine, avec les personnes.
export function buildPlanBlocks(r: PlanPeriodResult): PlanBlocks {
  const per = `du ${frD2(r.start)} au ${frD2(r.end)}`;
  const sections: PlanSection[] = [];
  const grey = "#9CA3AF";
  const pctFr = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

  // 1) La santé de l'entreprise (mot owner du cadrage 27/08) — CA/jour 30 derniers jours vs les 90 précédents.
  const h = r.health;
  sections.push({
    title: "La santé de l'entreprise",
    table: {
      cols: [{ label: "KPI", align: "left" }, { label: "30 derniers jours" }, { label: "Les 90 précédents" }, { label: "Écart" }],
      rows: [{ cells: [
        { v: "CA/jour", bold: true },
        h.eur_day_win != null ? { v: `${frEur2(h.eur_day_win)} €`, sub: `${h.n_win} j vendus` } : { v: "—", color: grey },
        h.eur_day_base != null ? { v: `${frEur2(h.eur_day_base)} €`, sub: `${h.n_base} j vendus` } : { v: "—", color: grey },
        h.delta_pct != null
          ? { v: pctFr(h.delta_pct), color: h.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true }
          : { v: "Données insuffisantes", color: grey, tip: `${h.n_win} j vendus sur la fenêtre, ${h.n_base} j sur la précédente — plancher : 5 des deux côtés.` },
      ] }],
    },
  });

  // 2) Vos pôles — CA · poids · écart · marge estimée (couverture toujours dite).
  sections.push({
    title: "Vos pôles",
    table: r.poles.length ? {
      cols: [{ label: "Pôle", align: "left" }, { label: "CA 30 j" }, { label: "Poids" }, { label: "Écart" }, { label: "Marge estimée" }],
      rows: r.poles.map((p) => ({ cells: [
        { v: p.name, bold: true },
        p.rev_eur != null ? { v: `${frEur2(p.rev_eur)} €` } : { v: "—", color: grey },
        p.share_pct != null ? { v: `${Math.round(p.share_pct)} % du CA` } : { v: "—", color: grey },
        p.delta_pct != null
          ? { v: pctFr(p.delta_pct), color: p.delta_pct >= 0 ? "#0F6E56" : "#B45309", bold: true, sub: "30 j vs les 90 précédents" }
          : { v: "Données insuffisantes", color: grey, tip: `${p.n_win} j vendus sur la fenêtre — plancher : 5 des deux côtés.` },
        p.margin_eur != null
          ? { v: `≈ ${frEur2(p.margin_eur)} €`, sub: p.margin_cov_pct != null && p.margin_cov_pct < 100 ? `sur ${p.margin_cov_pct} % du CA du pôle` : undefined }
          : { v: "—", color: grey, tip: "Se débloque en déclarant vos marges par famille produits & services — le geste est dans Piloter › À faire." },
      ] })),
    } : undefined,
    facts: r.poles.length ? undefined : ["Aucun pôle déclaré sur ce site."],
  });

  // 3) Ce que la période va vous coûter — motifs mesurés × jours prévus, total honnête.
  // Porte de concordance (owner 28/08) : un motif « Signal à confirmer » reste LISIBLE dans la
  // table mais sort de tout ce qui pousse à l'action — coût projeté, colonne « À faire ».
  const negMotifs = r.motifs.filter((m) => m.med_gap_eur != null && m.med_gap_eur < 0 && !m.a_confirmer);
  const costTotal = negMotifs.reduce((a, m) => a + (m.med_gap_eur as number) * m.n_days, 0);
  const costDays = negMotifs.reduce((a, m) => a + m.n_days, 0);
  sections.push({
    title: "Ce que la période va vous coûter",
    table: r.motifs.length ? {
      cols: [{ label: "Motif", align: "left" }, { label: "Jours sur la période" }, { label: "Impact mesuré" }],
      rows: r.motifs.map((m) => ({ cells: [
        { v: m.mot_fr, bold: true },
        { v: String(m.n_days) },
        m.med_gap_eur != null
          ? (m.a_confirmer
            ? { v: "Signal à confirmer", color: grey,
                sub: `${m.hist_days} j d'historique`,
                tip: `L'effet mesuré (${m.med_gap_eur >= 0 ? "+" : "−"}${frEur2(Math.abs(m.med_gap_eur))} €/jour) et le lien brut (${corrIndexFr(m.corr_r, m.hist_days) ?? "r non mesuré"}) pointent en sens opposés — mis à l'écart des surfaces d'action tant qu'un test ne l'a pas confirmé.` }
            : { v: `${m.med_gap_eur >= 0 ? "+" : "−"}${frEur2(Math.abs(m.med_gap_eur))} €/jour`,
              color: m.med_gap_eur >= 0 ? "#0F6E56" : "#B45309", bold: true,
              sub: `${m.hist_days} j d'historique${m.entangled ? " — facteurs multiples" : ""}`,
              tip: m.entangled
                ? `Facteurs multiples présents les mêmes jours : ${m.entangled_with.length ? m.entangled_with.map((x) => `${x.mot_fr} (${x.n} % de ses jours)`).join(", ") : "co-occurrences sous le plancher"}.`
                : undefined })
          : { v: "—", color: grey },
      ] })),
    } : undefined,
    facts: negMotifs.length
      ? [`Si la période ressemble à votre historique : ≈ −${frEur2(Math.abs(costTotal))} € sur les ${costDays} jours à motif négatif mesuré.`]
      : ["Aucun motif négatif mesuré sur la période."],
  });

  // 4) Menaces — semaines chargées autour de vous + séries à cadence non tenue.
  const threatFacts: string[] = [];
  for (const w of r.calm_weeks.filter((x) => x.state === "busy")) {
    threatFacts.push(`Semaine du ${w.label} : ${w.count_overlap} événement${w.count_overlap > 1 ? "s" : ""} concurrent${w.count_overlap > 1 ? "s" : ""} vise${w.count_overlap > 1 ? "nt" : ""} votre public.`);
  }
  for (const sdue of r.series_due) threatFacts.push(`« ${sdue.title} » (série) — rien de daté sur la période.`);
  if (!r.calm_weeks.length) threatFacts.push("Couverture concurrence : les scores s'arrêtent à ~6 semaines — aucune semaine de la période n'est encore couverte.");
  if (!threatFacts.length) threatFacts.push("Aucun événement concurrent relevé ne vise votre public sur les semaines couvertes, et vos séries sont à jour.");
  sections.push({ title: "Menaces", facts: threatFacts });

  // 5) À portée de main (mot owner 27/08) — la semaine calme + les rejeux PROUVÉS. Vide → dit vide.
  const quickFacts: string[] = [];
  for (const w of r.calm_weeks.filter((x) => x.state === "quiet")) {
    quickFacts.push(`Semaine du ${w.label} : aucun événement concurrent relevé ne vise votre public.`);
  }
  for (const p of r.replay.slice(0, 4)) quickFacts.push(p.say_fr);
  if (!r.replay.length) quickFacts.push("Aucun dispositif prouvé n'est rejouable sur les conditions de la période.");
  sections.push({ title: "À portée de main", facts: quickFacts });

  // 6) Chantiers de fond — pôles en retrait mesuré ; les références crawlées suivent (registre WEB).
  const deepFacts: string[] = [];
  for (const p of r.poles.filter((x) => x.delta_pct != null && (x.delta_pct as number) <= -10)) {
    deepFacts.push(`Pôle ${p.name} : ${pctFr(p.delta_pct as number)} (30 j vs les 90 précédents).`);
  }
  if (!deepFacts.length) deepFacts.push("Aucun pôle en retrait mesuré.");
  sections.push({ title: "Chantiers de fond", facts: deepFacts });
  if (r.web_plays.length) {
    sections.push({
      title: "Des lieux comparables ont fait",
      register: "web",
      facts: r.web_plays.map((pl) => `**${pl.title}** — ${pl.move} Résultat : ${pl.outcome} (${pl.source_name}${pl.published_at ? `, ${pl.published_at}` : ""}).`),
    });
  }

  // 7) Le plan, semaine par semaine — l'existant posé, le geste de la semaine, les personnes.
  const weekRows: any[] = [];
  const calmByWk = new Map(r.calm_weeks.map((w) => [w.wk, w]));
  const negByDate = new Map<string, PlanMotif[]>();
  for (const m of negMotifs) for (const d of m.dates) negByDate.set(d, [...(negByDate.get(d) ?? []), m]);
  let wk = mondayOf(r.start);
  const lastWk = mondayOf(r.end);
  while (wk <= lastWk) {
    const wkEnd = new Date(Date.parse(wk) + 6 * 86400000).toISOString().slice(0, 10);
    const inWeek = (d: string) => d >= wk && d <= wkEnd;
    const placed = r.inventory
      .map((i) => ({ i, ds: i.dates.filter(inWeek) }))
      .filter((x) => x.ds.length);
    const cw = calmByWk.get(wk);
    const doCell: string[] = [];
    if (cw?.state === "quiet") doCell.push("Testez une opération — calme autour de vous");
    if (cw?.state === "busy") doCell.push(`${cw.count_overlap} événement${cw.count_overlap > 1 ? "s" : ""} concurrent${cw.count_overlap > 1 ? "s" : ""} sur votre public`);
    const negDaysInWeek = new Map<string, number>();
    for (const [d, ms] of negByDate) if (inWeek(d)) for (const m of ms) negDaysInWeek.set(m.mot_fr, (negDaysInWeek.get(m.mot_fr) ?? 0) + 1);
    for (const [mot, n] of negDaysInWeek) {
      const m = negMotifs.find((x) => x.mot_fr === mot);
      doCell.push(`${mot} ${n} j (${frEur2(Math.abs(m?.med_gap_eur ?? 0))} €/j de moins, mesuré)`);
    }
    // Prénom d'affichage — même découpe que personKey (actionCommitments : « Julen » et
    // « Julen de Ajuriaguerra · CEO » = la même personne), casse d'origine conservée.
    const firstName = (n: string) => n.split("·")[0].trim().split(/\s+/)[0];
    const authors = [...new Set(placed.map((x) => x.i.author).filter(Boolean).map((n) => firstName(n as string)))] as string[];
    const qui = authors.length
      ? authors.join(" · ")
      : (cw?.state === "quiet" && r.roster.length ? `à confier : ${r.roster.slice(0, 4).join(" · ")}` : "—");
    weekRows.push({ cells: [
      { v: `Semaine du ${frD2(wk)}`, bold: true },
      placed.length
        ? { v: placed.map((x) => `${x.i.title} — ${x.ds.map(frD2).join(", ")}`).join(" · ") }
        : { v: "—", color: grey },
      doCell.length ? { v: doCell.join(" · ") } : { v: "—", color: grey },
      { v: qui, color: authors.length ? undefined : "#6B7280" },
    ] });
    wk = new Date(Date.parse(wk) + 7 * 86400000).toISOString().slice(0, 10);
  }
  const planFacts: string[] = [];
  if (r.open_count) planFacts.push(`${r.open_count} engagement${r.open_count > 1 ? "s" : ""} en cours sur la période.`);
  sections.push({
    title: "Le plan, semaine par semaine",
    table: { cols: [
      { label: "Semaine", align: "left" },
      { label: "Déjà placé", align: "left" },
      { label: "À faire", align: "left" },
      { label: "Qui", align: "left" },
    ], rows: weekRows },
    facts: planFacts.length ? planFacts : undefined,
  });

  // Indices de corrélation (mots owner 28/08) — en bas, une ligne PAR relation utilisée,
  // jamais un chiffre orphelin de sa relation. Seuls les motifs MESURÉS en portent un.
  const corrFacts = r.motifs
    .filter((m) => m.med_gap_eur != null)
    .map((m) => {
      const idx = corrIndexFr(m.corr_r, m.hist_days);
      return idx ? `${m.mot_fr} ↔ CA : ${idx.charAt(0).toLowerCase() + idx.slice(1)} · ${m.hist_days} j d'historique${m.a_confirmer ? " — signal à confirmer" : ""}.` : null;
    })
    .filter((x): x is string => x != null);
  if (corrFacts.length) sections.push({ title: "Indices de corrélation", facts: corrFacts });

  return {
    headline: `Votre plan — ${per}`,
    sections,
    sources: [
      "Vos ventes (CA/jour du site et des pôles, 30 j vs les 90 précédents)",
      ...(r.poles.some((p) => p.margin_eur != null) ? ["Vos marges déclarées par famille"] : []),
      "Vos engagements (dispositifs prouvés et en cours)",
      "Vos événements et leurs occurrences",
      "Calendrier et météo par jour (mêmes règles que les verdicts)",
      "Veille concurrence (scores ~6 semaines devant)",
      "Motifs mesurés sur votre historique (classes de jours)",
      ...(r.roster.length ? ["Votre équipe (canaux de communication)"] : []),
      ...(r.web_plays.length ? ["Références web de votre secteur (crawl, sources citées)"] : []),
    ],
    replay_prefill: r.replay.find((p) => p.direction === "positive" && p.prefill) ?? null,
  };
}

// ── « POURQUOI ? » du PLAN (incrément 5bis, owner go 28/08) — la CONSTRUCTION de chaque
// section du diagnostic, chiffres réels re-joués : d'où vient la santé (somme ÷ jours vendus),
// d'où vient chaque motif (médiane sur SES jours d'historique, mélanges NOMMÉS en clair — plus
// une infobulle), d'où vient la semaine calme (le compte de veille). Jamais une cause inventée.
export interface PlanWhySection { title: string; table?: { cols: any[]; rows: any[] }; facts?: string[] }
export interface PlanWhyBlocks { headline: string; sections: PlanWhySection[]; sources: string[] }

export function buildPlanWhyBlocks(r: PlanPeriodResult): PlanWhyBlocks {
  const sections: PlanWhySection[] = [];

  // 1) Les motifs : leur VALEUR (médiane, historique) et leur LIEN mesuré (indice de
  // corrélation) — mélanges NOMMÉS en clair. Triés par contribution absolue projetée.
  const measured = [...r.motifs.filter((m) => m.med_gap_eur != null && !m.a_confirmer)]
    .sort((a, b) => Math.abs((b.med_gap_eur as number) * b.n_days) - Math.abs((a.med_gap_eur as number) * a.n_days))
    .slice(0, 3);
  if (measured.length) {
    const facts: string[] = [];
    for (const m of measured) {
      const idx = corrIndexFr(m.corr_r, m.hist_days);
      const mel = m.entangled
        ? ` Facteurs multiples : ${m.entangled_with.length ? m.entangled_with.map((x) => `${x.mot_fr} (${x.n} % de ses jours)`).join(", ") : "co-occurrences sous le plancher"}.`
        : "";
      facts.push(`${m.mot_fr} : ${(m.med_gap_eur as number) >= 0 ? "+" : "−"}${frEur2(Math.abs(m.med_gap_eur as number))} €/jour (médiane, ${m.hist_days} j d'historique) × ${m.n_days} j prévus — Enjeu : ${(m.med_gap_eur as number) >= 0 ? "+" : "−"}${frEur2(Math.abs((m.med_gap_eur as number) * m.n_days))} € sur la période.${idx ? ` ${idx}.` : ""}${mel}`);
    }
    sections.push({ title: "Ce qui pèse sur la période", facts });
  }

  // 2) Les semaines : le fait de veille qui les classe (recouvrement d'audience).
  const calmFacts: string[] = [];
  for (const w of r.calm_weeks) {
    if (w.state === "quiet") calmFacts.push(`Semaine du ${w.label} : 0 événement concurrent visant votre public.`);
    if (w.state === "busy") calmFacts.push(`Semaine du ${w.label} : ${w.count_overlap} événement${w.count_overlap > 1 ? "s" : ""} concurrent${w.count_overlap > 1 ? "s" : ""} visant votre public.`);
  }
  if (calmFacts.length) sections.push({ title: "Les semaines", facts: calmFacts });

  // 3) Les pôles en mouvement (diagnostic — seulement s'ils bougent).
  const movers = r.poles.filter((p) => p.delta_pct != null && Math.abs(p.delta_pct as number) >= 10);
  if (movers.length) {
    sections.push({ title: "Les pôles qui bougent", facts: movers.map((p) =>
      `Pôle ${p.name} : ${(p.delta_pct as number) >= 0 ? "+" : "−"}${String(Math.abs(p.delta_pct as number)).replace(".", ",")} % (30 j vs les 90 précédents)${p.rev_eur != null ? ` · ${frEur2(p.rev_eur)} € sur la fenêtre` : ""}.`) });
  }

  // Pied : les indices de corrélation des relations utilisées (mots owner 28/08).
  const corrFacts = r.motifs
    .filter((m) => m.med_gap_eur != null)
    .map((m) => {
      const idx = corrIndexFr(m.corr_r, m.hist_days);
      return idx ? `${m.mot_fr} ↔ CA : ${idx.charAt(0).toLowerCase() + idx.slice(1)} · ${m.hist_days} j d'historique${m.a_confirmer ? " — signal à confirmer" : ""}.` : null;
    })
    .filter((x): x is string => x != null);
  if (corrFacts.length) sections.push({ title: "Indices de corrélation", facts: corrFacts });

  return {
    headline: `Votre plan ${`du ${frD2(r.start)} au ${frD2(r.end)}`} : ce qui l'explique`,
    sections,
    sources: [
      "Vos ventes (lignes de caisse)",
      "Motifs mesurés sur votre historique (classes de jours, médiane vs résultat habituel)",
      "Veille concurrence (recouvrement d'audience, scores ~6 semaines devant)",
    ],
  };
}
