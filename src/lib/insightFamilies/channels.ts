// Famille CHANNELS — « d'où vient l'argent, qui achète » (spec docs/rapport-canaux-spec.md).
// UN cœur (channelsData, période libre) + UNE enveloppe au contrat FamilyProvider (période
// canonique = les 90 derniers jours de DONNÉES du site, ancrage data_end jamais current_date).
// Trois consommateurs : la section « Vos canaux » du rapport ventes (scope groupe/site),
// les rapports spécifiques par canal (family-report / sélecteur), les facts du Q&A groundé.
//
// Décision 10 (owner, proto v5) : TOUT agrégat sort d'une requête — ce module additionne en
// SQL, ne recalcule jamais un total en JS, et n'orne jamais un chiffre d'une cause non mesurée.
// Présentation : hiérarchie Groupe → Site → Canal ; un site à flux unique est présenté au
// niveau SITE (libellé = nom du site), jamais comme un pseudo-canal.
import type { FamilyProvider, FamilyResult, FamilyFact } from "./types";
import {
  CHANNEL_DEFAULT_LABELS,
  ETAT,
  etatFor,
  QUATRE_QUESTIONS,
  PIED_DOCUMENT,
  type EtatKey,
  type QQInput,
} from "../fr/rapportCanaux.fr";

const PROJECT = "muse-square-open-data";

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const r0 = (n: unknown) => Math.round(Number(n) || 0);
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const asIso = (v: any): string => (typeof v === "string" ? v : v?.value ?? String(v ?? "")).slice(0, 10);

// Rôles éligibles à la cadence — MIROIR EXACT du filtre de la carte client_dormant
// (fct_location_daily_action_candidates § R) : jamais une 2e définition.
const DORMANT_ROLES = ["pro_recurring", "consumer_recurring", "unknown"];

export interface ChannelsData {
  found: boolean;
  period: { start: string; end: string; prev_start: string; prev_end: string };
  sites: Array<{
    location_id: string;
    site_name: string;
    ca: number;
    prev_ca: number | null;
    evol_pct: number | null;
    share_pct: number;
    invoices: number;
    days: number;
    single_flow: boolean;
    etat: EtatKey;
    etat_label: string;
    channels: Array<{
      channel_key: string;
      label: string;
      ca: number;
      prev_ca: number | null;
      evol_pct: number | null;
      share_pct: number;
      invoices: number;
      days: number;
      etat: EtatKey;
      etat_label: string;
    }>;
  }>;
  total: { ca: number; prev_ca: number | null; evol_pct: number | null; invoices: number };
  quatre_questions: { argent: string; marche: string; marche_pas: string; a_faire: string };
  weekly: Array<{
    location_id: string;
    channel_key: string;
    label: string;
    typical: number | null;
    weeks: Array<{ week_start: string; ca: number; state: string; baseline: number | null }>;
  }>;
  monthly: Array<{
    location_id: string;
    channel_key: string;
    label: string;
    months: Array<{ month_start: string; ca: number; invoices: number; top_parties: string | null; partial: boolean }>;
    total: { ca: number; invoices: number };
  }>;
  accounts: Array<{
    location_id: string;
    channel_key: string;
    label: string;
    mode: "top" | "full";
    rows: Array<{ label: string; ca: number; share_pct: number; invoices: number; first_order: string | null }>;
    others: { count: number; ca: number; share_pct: number } | null;
    total: { ca: number; invoices: number; count: number };
  }>;
  dormants: Array<{ party_label: string; silence_days: number; median_interval_days: number; location_id: string }>;
  new_accounts: Array<{ party_label: string; ca: number; first_order: string; location_id: string }>;
  pied: string;
}

export async function channelsData(
  bq: any,
  locationIds: string[],
  start: string,
  end: string,
  // R2 (rapports spécifiques) : channel_key → document mono-canal. Le seuil « ≥ 2 flux »
  // ne s'applique qu'au rapport ENRICHI (décision 12) — un rapport DEMANDÉ pour un canal
  // existe dès que le canal a des données. Les 4 questions sont omises (un flux seul n'a
  // pas de « d'où vient l'argent »).
  opts: { channel_key?: string } = {}
): Promise<{ data: ChannelsData; facts: FamilyFact[] }> {
  const lenDays = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  const prevEnd = shiftDays(start, -1);
  const prevStart = shiftDays(prevEnd, -(lenDays - 1));
  const P = { locs: locationIds, s: start, e: end, ps: prevStart, pe: prevEnd };
  const q = (query: string, params: Record<string, unknown> = P, types?: Record<string, unknown>) =>
    bq
      .query({ query, params, location: "EU", ...(types ? { types } : {}) })
      .then((r: any) => (Array.isArray(r?.[0]) ? r[0] : []));

  // Amorcées ensemble, attendues ensemble (règle perf : le total vaut le max, pas la somme).
  const [flowRows, siteRows, labelRows, weeklyRows, monthlyRows, judgeRows, accCur, accPrev, patternRows] =
    await Promise.all([
      // Q1 — agrégats par (site, canal), période + précédente. Les totaux naissent ICI.
      q(`
        SELECT location_id, COALESCE(channel, '__site__') AS channel_key,
               ROUND(SUM(IF(transaction_date BETWEEN @s AND @e, revenue, 0)), 2) AS ca,
               ROUND(SUM(IF(transaction_date BETWEEN @ps AND @pe, revenue, 0)), 2) AS prev_ca,
               COUNT(DISTINCT IF(transaction_date BETWEEN @s AND @e, invoice_number, NULL)) AS invoices,
               COUNT(DISTINCT IF(transaction_date BETWEEN @s AND @e, transaction_date, NULL)) AS days
        FROM \`${PROJECT}.staging.stg_client_transactions\`
        WHERE is_invoiced AND location_id IN UNNEST(@locs)
          AND transaction_date BETWEEN @ps AND @e
        GROUP BY 1, 2
        HAVING ca > 0 OR prev_ca > 0`),
      q(`
        SELECT location_id, site_name
        FROM \`${PROJECT}.dims.dim_client_location\`
        WHERE location_id IN UNNEST(@locs)`),
      q(`
        SELECT source_location_id, channel_key, label
        FROM \`${PROJECT}.analytics.sales_channel_labels\`
        WHERE source_location_id IN UNNEST(@locs)`),
      // Q3 — semaines de la période des canaux hebdo-jugeables (états = ceux des cartes).
      q(`
        SELECT location_id, channel_key, CAST(week_start AS STRING) AS week_start, ca, week_state,
               baseline_median
        FROM \`${PROJECT}.mart.fct_location_channel_weekly\`
        WHERE location_id IN UNNEST(@locs) AND is_weekly_judgeable
          AND week_start BETWEEN DATE_SUB(@s, INTERVAL 6 DAY) AND @e
        ORDER BY week_start`),
      // Q4 — mois de la période des canaux mensuels-jugeables (+ top_parties).
      q(`
        SELECT location_id, channel_key, CAST(month_start AS STRING) AS month_start, ca, invoices,
               top_parties
        FROM \`${PROJECT}.mart.fct_location_channel_monthly\`
        WHERE location_id IN UNNEST(@locs) AND is_monthly_judgeable
          AND month_start BETWEEN DATE_TRUNC(@s, MONTH) AND @e
        ORDER BY month_start`),
      // Jugeabilité par canal (décide top-comptes vs liste complète, et quels blocs existent).
      q(`
        SELECT w.location_id, w.channel_key,
               LOGICAL_OR(w.is_weekly_judgeable) AS weekly_ok,
               LOGICAL_OR(COALESCE(m.is_monthly_judgeable, FALSE)) AS monthly_ok
        FROM \`${PROJECT}.mart.fct_location_channel_weekly\` w
        LEFT JOIN \`${PROJECT}.mart.fct_location_channel_monthly\` m
          USING (location_id, channel_key)
        WHERE w.location_id IN UNNEST(@locs)
        GROUP BY 1, 2`),
      // Q5 — comptes de la période (libellé annuaire, jamais un ID brut).
      q(`
        SELECT t.location_id, COALESCE(t.channel, '__site__') AS channel_key,
               COALESCE(pd.party_name, t.party_code) AS party_label, t.party_code,
               ROUND(SUM(t.revenue), 2) AS ca,
               COUNT(DISTINCT t.invoice_number) AS invoices,
               CAST(MIN(t.transaction_date) AS STRING) AS first_in_period
        FROM \`${PROJECT}.staging.stg_client_transactions\` t
        LEFT JOIN \`${PROJECT}.analytics.party_directory\` pd
          ON pd.source_location_id = t.source_location_id AND pd.party_code = t.party_code
        WHERE t.is_invoiced AND t.location_id IN UNNEST(@locs)
          AND t.transaction_date BETWEEN @s AND @e AND t.party_code IS NOT NULL
          -- Un tiers-canal (caisse COMPTOIR*, futur corner) est le MÉCANISME du canal,
          -- jamais un compte client — il ne figure dans aucune liste de comptes.
          AND COALESCE(pd.channel, '') = ''
        GROUP BY 1, 2, 3, 4
        ORDER BY ca DESC
        LIMIT 1000`),
      // Q6 — comptes de la période PRÉCÉDENTE (pour « le compte qui manque »).
      q(`
        SELECT t.location_id, COALESCE(t.channel, '__site__') AS channel_key,
               COALESCE(pd.party_name, t.party_code) AS party_label, t.party_code,
               ROUND(SUM(t.revenue), 2) AS ca
        FROM \`${PROJECT}.staging.stg_client_transactions\` t
        LEFT JOIN \`${PROJECT}.analytics.party_directory\` pd
          ON pd.source_location_id = t.source_location_id AND pd.party_code = t.party_code
        WHERE t.is_invoiced AND t.location_id IN UNNEST(@locs)
          AND t.transaction_date BETWEEN @ps AND @pe AND t.party_code IS NOT NULL
          AND COALESCE(pd.channel, '') = ''
        GROUP BY 1, 2, 3, 4
        ORDER BY ca DESC
        LIMIT 1000`),
      // Q7 — dormants (MÊME filtre que la carte) + nouveaux de la période.
      q(`
        SELECT location_id, party_label, client_state, silence_days, median_interval_days,
               CAST(first_order AS STRING) AS first_order
        FROM \`${PROJECT}.mart.fct_location_client_patterns\`
        WHERE location_id IN UNNEST(@locs)
          AND (
            (client_state = 'dormant' AND party_role IN UNNEST(@roles))
            OR (client_state = 'new' AND first_order BETWEEN @s AND @e)
          )`, { ...P, roles: DORMANT_ROLES }),
    ]);

  // R2 — mono-canal : on filtre les LIGNES à la source ; les totaux qui suivent deviennent
  // naturellement ceux du canal (jamais un total recalculé à part — décision 10).
  const chFilter = opts.channel_key || null;
  const flowRowsF = chFilter ? flowRows.filter((r: any) => r.channel_key === chFilter) : flowRows;
  const weeklyRowsF = chFilter ? weeklyRows.filter((r: any) => r.channel_key === chFilter) : weeklyRows;
  const monthlyRowsF = chFilter ? monthlyRows.filter((r: any) => r.channel_key === chFilter) : monthlyRows;
  const accCurF = chFilter ? accCur.filter((r: any) => r.channel_key === chFilter) : accCur;
  const accPrevF = chFilter ? accPrev.filter((r: any) => r.channel_key === chFilter) : accPrev;

  const siteName = new Map<string, string>(siteRows.map((r: any) => [r.location_id, r.site_name || "Votre site"]));
  const labelMap = new Map<string, string>(
    labelRows.map((r: any) => [`${r.source_location_id}|${r.channel_key}`, r.label])
  );
  const labelFor = (loc: string, key: string) =>
    labelMap.get(`${loc}|${key}`) ?? CHANNEL_DEFAULT_LABELS[key] ?? key;

  // ── Assemblage Site → Canal (un site mono-flux se présente au niveau site). ──
  const bySite = new Map<string, any[]>();
  for (const r of flowRowsF) {
    if (!bySite.has(r.location_id)) bySite.set(r.location_id, []);
    bySite.get(r.location_id)!.push(r);
  }
  const totalCa = flowRowsF.reduce((a: number, r: any) => a + Number(r.ca), 0);
  const totalPrev = flowRowsF.reduce((a: number, r: any) => a + Number(r.prev_ca), 0);
  const evol = (ca: number, prev: number | null) =>
    prev && prev > 0 ? Math.round(((ca - prev) / prev) * 100) : null;

  const sites: ChannelsData["sites"] = [];
  for (const [loc, rows] of bySite) {
    const sCa = rows.reduce((a, r) => a + Number(r.ca), 0);
    const sPrev = rows.reduce((a, r) => a + Number(r.prev_ca), 0);
    const single = rows.length === 1;
    const channels = rows
      .map((r) => ({
        channel_key: r.channel_key,
        label: labelFor(loc, r.channel_key),
        ca: r2(r.ca),
        prev_ca: Number(r.prev_ca) > 0 ? r2(r.prev_ca) : null,
        evol_pct: evol(Number(r.ca), Number(r.prev_ca)),
        share_pct: totalCa > 0 ? Math.round((Number(r.ca) / totalCa) * 100) : 0,
        invoices: Number(r.invoices),
        days: Number(r.days),
        etat: etatFor(evol(Number(r.ca), Number(r.prev_ca))),
        etat_label: "",
      }))
      .sort((a, b) => b.ca - a.ca);
    channels.forEach((c) => (c.etat_label = ETAT.labels[c.etat]));
    const sEvol = evol(sCa, sPrev);
    sites.push({
      location_id: loc,
      site_name: siteName.get(loc) ?? "Votre site",
      ca: r2(sCa),
      prev_ca: sPrev > 0 ? r2(sPrev) : null,
      evol_pct: sEvol,
      share_pct: totalCa > 0 ? Math.round((sCa / totalCa) * 100) : 0,
      invoices: rows.reduce((a, r) => a + Number(r.invoices), 0),
      days: Math.max(...rows.map((r) => Number(r.days))),
      single_flow: single,
      etat: etatFor(sEvol),
      etat_label: ETAT.labels[etatFor(sEvol)],
      channels: single ? [] : channels,
    });
  }
  sites.sort((a, b) => b.ca - a.ca);

  // Les FLUX (pour les 4 questions et le compte des flux) : canaux des sites multi-flux
  // + les sites mono-flux eux-mêmes.
  const flows: QQInput["flows"] = [];
  for (const s of sites) {
    if (s.single_flow)
      flows.push({ label: s.site_name, ca: s.ca, share_pct: s.share_pct, evol_pct: s.evol_pct, etat: s.etat });
    else
      for (const c of s.channels)
        flows.push({ label: c.label, ca: c.ca, share_pct: c.share_pct, evol_pct: c.evol_pct, etat: c.etat });
  }
  flows.sort((a, b) => b.ca - a.ca);
  // Enrichi : ≥ 2 flux (décision 12). Mono-canal demandé : le canal existe = le rapport existe.
  const found = chFilter ? flows.length >= 1 : flows.length >= 2;

  // ── Jugeabilité par canal → quels blocs et quel mode de liste de comptes. ──
  const judge = new Map<string, { weekly: boolean; monthly: boolean }>(
    judgeRows.map((r: any) => [`${r.location_id}|${r.channel_key}`, { weekly: !!r.weekly_ok, monthly: !!r.monthly_ok }])
  );

  const weeklyByChannel = new Map<string, any[]>();
  for (const r of weeklyRowsF) {
    const k = `${r.location_id}|${r.channel_key}`;
    if (!weeklyByChannel.has(k)) weeklyByChannel.set(k, []);
    weeklyByChannel.get(k)!.push(r);
  }
  const weekly: ChannelsData["weekly"] = [...weeklyByChannel.entries()].map(([k, rows]) => {
    const [loc, key] = k.split("|");
    const last = rows[rows.length - 1];
    return {
      location_id: loc,
      channel_key: key,
      label: labelFor(loc, key),
      typical: last?.baseline_median != null ? r0(last.baseline_median) : null,
      weeks: rows.map((r: any) => ({
        week_start: asIso(r.week_start),
        ca: r2(r.ca),
        state: String(r.week_state),
        baseline: r.baseline_median != null ? r0(r.baseline_median) : null,
      })),
    };
  });

  const monthlyByChannel = new Map<string, any[]>();
  for (const r of monthlyRowsF) {
    const k = `${r.location_id}|${r.channel_key}`;
    if (!monthlyByChannel.has(k)) monthlyByChannel.set(k, []);
    monthlyByChannel.get(k)!.push(r);
  }
  const monthly: ChannelsData["monthly"] = [...monthlyByChannel.entries()].map(([k, rows]) => {
    const [loc, key] = k.split("|");
    // Un mois entamé par la fin de période est marqué partiel — jamais présenté comme complet.
    return {
      location_id: loc,
      channel_key: key,
      label: labelFor(loc, key),
      months: rows.map((r: any) => ({
        month_start: asIso(r.month_start),
        ca: r2(r.ca),
        invoices: Number(r.invoices),
        top_parties: r.top_parties ?? null,
        partial: false,
      })),
      total: {
        ca: r2(rows.reduce((a: number, r: any) => a + Number(r.ca), 0)),
        invoices: rows.reduce((a: number, r: any) => a + Number(r.invoices), 0),
      },
    };
  });

  // ── Comptes de la période par canal à comptes. ──
  const accByChannel = new Map<string, any[]>();
  for (const r of accCurF) {
    const k = `${r.location_id}|${r.channel_key}`;
    if (!accByChannel.has(k)) accByChannel.set(k, []);
    accByChannel.get(k)!.push(r);
  }
  const accounts: ChannelsData["accounts"] = [];
  for (const [k, rows] of accByChannel) {
    const [loc, key] = k.split("|");
    const chCa = rows.reduce((a, r) => a + Number(r.ca), 0);
    const chInv = rows.reduce((a, r) => a + Number(r.invoices), 0);
    const mode: "top" | "full" = rows.length <= 15 ? "full" : "top";
    const kept = mode === "full" ? rows : rows.slice(0, 6);
    const rest = mode === "full" ? [] : rows.slice(6);
    accounts.push({
      location_id: loc,
      channel_key: key,
      label: labelFor(loc, key),
      mode,
      rows: kept.map((r) => ({
        label: String(r.party_label),
        ca: r2(r.ca),
        share_pct: chCa > 0 ? Math.round((Number(r.ca) / chCa) * 100) : 0,
        invoices: Number(r.invoices),
        first_order: r.first_in_period ? asIso(r.first_in_period) : null,
      })),
      others: rest.length
        ? {
            count: rest.length,
            ca: r2(rest.reduce((a, r) => a + Number(r.ca), 0)),
            share_pct: chCa > 0 ? Math.round((rest.reduce((a, r) => a + Number(r.ca), 0) / chCa) * 100) : 0,
          }
        : null,
      total: { ca: r2(chCa), invoices: chInv, count: rows.length },
    });
  }
  accounts.sort((a, b) => b.total.ca - a.total.ca);

  // ── Le compte qui manque : plus gros compte de la période précédente absent de celle-ci,
  //    cherché dans les canaux en écart (▼) d'abord, sinon globalement. ──
  const curParties = new Set(accCurF.map((r: any) => `${r.location_id}|${r.party_code}`));
  const downKeys = new Set(
    flows.filter((f) => f.etat === "down").map((f) => f.label)
  );
  let missing: QQInput["missing_top"] = null;
  for (const r of accPrevF) {
    if (curParties.has(`${r.location_id}|${r.party_code}`)) continue;
    const chLabel = labelFor(r.location_id, r.channel_key);
    if (downKeys.size && !downKeys.has(chLabel)) continue;
    if (!missing || Number(r.ca) > missing.prev_ca)
      missing = { label: String(r.party_label), prev_ca: r2(r.ca), channel_label: chLabel };
  }

  const hasAccountChannels = accounts.length > 0;
  const dormants = (hasAccountChannels ? patternRows : [])
    .filter((r: any) => r.client_state === "dormant")
    .map((r: any) => ({
      party_label: String(r.party_label),
      silence_days: Number(r.silence_days),
      median_interval_days: Number(r.median_interval_days),
      location_id: r.location_id,
    }));
  const newByKey = new Map(
    (hasAccountChannels ? patternRows : []).filter((r: any) => r.client_state === "new").map((r: any) => [String(r.party_label), r])
  );
  const new_accounts = accCurF
    .filter((r: any) => newByKey.has(String(r.party_label)))
    .map((r: any) => ({
      party_label: String(r.party_label),
      ca: r2(r.ca),
      first_order: asIso((newByKey.get(String(r.party_label)) as any).first_order),
      location_id: r.location_id,
    }))
    .sort((a: any, b: any) => b.ca - a.ca);

  const qq: QQInput = {
    flows,
    new_top: new_accounts.slice(0, 2).map((n: any) => ({ label: n.party_label, ca: n.ca })),
    missing_top: missing,
    dormants: dormants.map((d: any) => ({ label: d.party_label })),
  };

  const data: ChannelsData = {
    found,
    period: { start, end, prev_start: prevStart, prev_end: prevEnd },
    sites,
    total: {
      ca: r2(totalCa),
      prev_ca: totalPrev > 0 ? r2(totalPrev) : null,
      evol_pct: evol(totalCa, totalPrev),
      invoices: flowRowsF.reduce((a: number, r: any) => a + Number(r.invoices), 0),
    },
    quatre_questions: chFilter
      ? { argent: "", marche: "", marche_pas: "", a_faire: "" }
      : {
          argent: QUATRE_QUESTIONS.argent(qq),
          marche: QUATRE_QUESTIONS.marche(qq),
          marche_pas: QUATRE_QUESTIONS.marchePas(qq),
          a_faire: QUATRE_QUESTIONS.aFaire(qq),
        },
    weekly,
    monthly,
    accounts,
    dormants,
    new_accounts,
    pied: PIED_DOCUMENT,
  };

  // ── Facts pour le Q&A groundé — une entrée par vérité affichée, jamais au-delà. ──
  const fr = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
  const facts: FamilyFact[] = [];
  const pd = `du ${start.slice(8, 10)}/${start.slice(5, 7)} au ${end.slice(8, 10)}/${end.slice(5, 7)}`;
  for (const f of flows)
    facts.push({
      fact_fr: `${f.label} : ${fr(f.ca)} ${pd} (${f.share_pct} % du total${
        f.evol_pct != null ? `, ${f.evol_pct > 0 ? "+" : ""}${f.evol_pct} % vs période précédente` : ""
      })`,
      claim_type: "observed",
    });
  if (found)
    facts.push({ fact_fr: `Total ${pd} : ${fr(totalCa)}`, claim_type: "observed" });
  for (const a of accounts)
    for (const row of a.rows.slice(0, 6))
      facts.push({
        fact_fr: `${row.label} (${a.label}) : ${fr(row.ca)} ${pd} en ${row.invoices} commande${row.invoices > 1 ? "s" : ""}`,
        claim_type: "observed",
      });
  for (const d of dormants)
    facts.push({
      fact_fr: `${d.party_label} : sans commande depuis ${d.silence_days} jours (rythme habituel ${d.median_interval_days} j)`,
      claim_type: "observed",
    });
  for (const n of new_accounts.slice(0, 4))
    facts.push({
      fact_fr: `${n.party_label} : nouveau compte, première commande le ${n.first_order.slice(8, 10)}/${n.first_order.slice(5, 7)} (${fr(n.ca)})`,
      claim_type: "observed",
    });

  return { data, facts };
}

// ── L'enveloppe au contrat FamilyProvider : période canonique = 90 derniers jours de DONNÉES. ──
export async function channelsFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [endRows] = await bq.query({
    query: `SELECT CAST(MAX(transaction_date) AS STRING) AS data_end
            FROM \`${PROJECT}.staging.stg_client_transactions\`
            WHERE is_invoiced AND location_id = @loc AND transaction_date <= @d`,
    params: { loc: location_id, d: date },
    location: "EU",
  });
  const dataEnd = endRows?.[0]?.data_end ? asIso(endRows[0].data_end) : null;
  if (!dataEnd) return { found: false, data: {}, facts: [], sources: [] };
  const start = shiftDays(dataEnd, -89);
  const { data, facts } = await channelsData(bq, [location_id], start, dataEnd);
  return {
    found: data.found,
    data: data as unknown as Record<string, unknown>,
    facts: data.found ? facts : [],
    sources: [
      "staging.stg_client_transactions (canal par facture)",
      "mart.fct_location_channel_weekly",
      "mart.fct_location_channel_monthly",
      "mart.fct_location_client_patterns",
      "analytics.party_directory / sales_channel_labels",
    ],
  };
}

export const channelsProvider: FamilyProvider = {
  key: "channels",
  title: "Vos canaux · d'où vient l'argent, qui achète",
  render: "renderChannels",
  // Routage Q&A : mots de canal OU questions clients/comptes. Enregistré APRÈS les familles
  // existantes (l'ordre est un comportement) — ces motifs exigent un mot de canal/compte
  // explicite pour ne rien voler aux familles ventes/fréquentation.
  match: [
    /\b(canal|canaux)\b/,
    /\b(comment (va|vont|marche)|ou en est|ou en sont)\b.{0,25}\b(boutique|comptoir|magasin|studio|grossiste|revendeur|professionnel)/,
    /\b(boutique|comptoir|magasin|studio)\b.{0,15}\b(va bien|va mal|marche|se porte)\b/,
    /\b(boutique|comptoir|magasin)\b.{0,30}(\bca\b|chiffre|vente|marche|forme|resultat)/,
    /\b(grossiste|revendeur|professionnel)s?\b.{0,30}(\bca\b|chiffre|vente|command|marche)/,
    /\b(client|compte)s? (pro|professionnel|regulier|dormant|fidele)s?\b/,
    /\bqui (achete|commande|manque)\b/,
    /\bd ?ou vient (l argent|le chiffre|le ca)\b/,
  ],
  run: channelsFamily,
};
