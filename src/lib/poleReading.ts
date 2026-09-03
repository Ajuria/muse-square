// src/lib/poleReading.ts
// Lecture CONTINUE d'un pôle (spec poles-dispositifs-permanents, owner 27/08) — un dispositif
// permanent n'a ni fenêtre ni verdict : sa mesure est le CA journalier de SES familles vs son
// résultat habituel, en continu. Source = raw.client_transactions (item_category), le MÊME
// référentiel que le KPI family_revenue (kpiRegistry.measureFamilyRevenueMean) — jamais forké.
// Référentiels rendus AVEC leurs fenêtres réelles : 30 derniers jours vs les 90 jours qui les
// précèdent ; < 5 jours vendus d'un côté → pas de comparaison (plancher maison n>=5), jamais
// un % fabriqué. Les opérations rattachées se lisent par attached_pole_id (clé de rattachement,
// jamais parent_commitment_id).

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PoleFamilyReading {
  family: string;
  rev_eur: number | null;         // CA de la famille sur la fenêtre (jours vendus)
  avg30_eur_day: number | null;   // €/j sur les 30 derniers jours (jours VENDUS)
  n30: number;                    // jours vendus dans les 30 derniers jours
  base_eur_day: number | null;    // €/j sur les 90 jours précédant les 30
  n_base: number;
  delta_pct: number | null;       // (avg30 − base) / base, null sous les planchers
}

export interface PoleTotals {
  rev30_eur: number | null;       // CA du pôle sur les 30 derniers jours (jours vendus)
  share_pct: number | null;       // poids du pôle dans le CA TOTAL du site sur la même fenêtre
  avg30_eur_day: number | null;   // €/j agrégé du pôle
  base_eur_day: number | null;    // €/j agrégé sur les 90 jours précédents
  delta_pct: number | null;       // écart agrégé, null sous les planchers (n>=5 des deux côtés)
  n30: number;
}

export interface PoleOperationRow {
  commitment_id: string;
  status: string;
  verdict: string | null;
  committed_action_text: string | null;
  window_start: string | null;
  window_end: string | null;
  version_no: number | null;
}

export async function buildPoleReading(
  bq: any,
  location_id: string,
  dispositif_id: string,
  families: string[],
  asOfIso: string,
  // Horizons libres (C3, 27/08) : fenêtre EXPLICITE [start..end] (bornée à asOf) avec
  // référentiel = la période PRÉCÉDENTE DE MÊME DURÉE (D1 arbitrée). Sans opts : le
  // comportement historique de la page pôle — 30 derniers jours vs les 90 précédents.
  opts?: { start: string; end: string },
): Promise<{ families: PoleFamilyReading[]; operations: PoleOperationRow[]; totals: PoleTotals }> {
  const wEnd = opts ? (opts.end < asOfIso ? opts.end : asOfIso) : asOfIso;
  const wStart = opts ? opts.start : null; // null => fenêtre glissante 30 j (historique)
  const spanDays = wStart ? Math.max(1, Math.round((Date.parse(wEnd) - Date.parse(wStart)) / 86400000) + 1) : 30;
  const baseDays = wStart ? spanDays : 90;
  // UNE requête : lignes par famille + une ligne agrégat pôle (family NULL) + le CA TOTAL du
  // site sur la même fenêtre (site_rev30, répété — poids = pole_rev30 / site_rev30).
  const famsP = families.length
    ? bq.query({
        query: `
          WITH lignes AS (
            SELECT item_category, transaction_date, revenue,
                   item_category IN UNNEST(@fams) AS in_pole,
                   transaction_date >= @winStart AS d30
            FROM \`${PROJECT}.raw.client_transactions\`
            WHERE location_id = @loc
              AND transaction_date >= @baseStart
              AND transaction_date <= @winEnd
          ),
          site AS ( SELECT SUM(IF(d30, revenue, 0)) AS site_rev30 FROM lignes )
          SELECT p.family, p.rev30, p.n30, p.revBase, p.nBase, site.site_rev30
          FROM (
            SELECT item_category AS family,
                   SUM(IF(d30, revenue, 0)) AS rev30,
                   COUNT(DISTINCT IF(d30, transaction_date, NULL)) AS n30,
                   SUM(IF(NOT d30, revenue, 0)) AS revBase,
                   COUNT(DISTINCT IF(NOT d30, transaction_date, NULL)) AS nBase
            FROM lignes WHERE in_pole GROUP BY family
            UNION ALL
            SELECT CAST(NULL AS STRING),
                   SUM(IF(d30, revenue, 0)),
                   COUNT(DISTINCT IF(d30, transaction_date, NULL)),
                   SUM(IF(NOT d30, revenue, 0)),
                   COUNT(DISTINCT IF(NOT d30, transaction_date, NULL))
            FROM lignes WHERE in_pole
          ) p CROSS JOIN site`,
        params: {
          loc: location_id, fams: families,
          winEnd: bq.date(wEnd),
          winStart: bq.date(wStart ?? addDaysIso(wEnd, -(spanDays - 1))),
          baseStart: bq.date(addDaysIso(wStart ?? addDaysIso(wEnd, -(spanDays - 1)), -baseDays)),
        },
        location: "EU",
      }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => [])
    : Promise.resolve([]);
  const opsP = bq.query({
    query: `
      SELECT commitment_id, status, verdict, committed_action_text,
             CAST(window_start AS STRING) AS window_start, CAST(window_end AS STRING) AS window_end,
             version_no
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
          CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
          (verdict IS NOT NULL) DESC, created_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE attached_pole_id = @d AND location_id = @loc
      )
      WHERE rn = 1 AND status != 'cancelled'
      ORDER BY created_at DESC
      LIMIT 12`,
    params: { d: dispositif_id, loc: location_id },
    types: { d: "STRING", loc: "STRING" }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  const [frows, orows] = await Promise.all([famsP, opsP]);
  const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  const byFam = new Map<string, any>();
  let aggRow: any = null;
  for (const r of frows as any[]) {
    if (flat(r.family) == null) aggRow = r;
    else byFam.set(String(flat(r.family)), r);
  }

  const famReadings: PoleFamilyReading[] = families.map((f) => {
    const r = byFam.get(f);
    const n30 = r ? Number(flat(r.n30)) || 0 : 0;
    const nBase = r ? Number(flat(r.nBase)) || 0 : 0;
    const avg30 = n30 >= 1 ? Math.round((Number(flat(r.rev30)) / n30) * 100) / 100 : null;
    const base = nBase >= 1 ? Math.round((Number(flat(r.revBase)) / nBase) * 100) / 100 : null;
    const delta = n30 >= 5 && nBase >= 5 && base && base > 0 && avg30 != null
      ? Math.round(((avg30 - base) / base) * 1000) / 10
      : null;
    return { family: f, rev_eur: n30 >= 1 ? Math.round(Number(flat(r.rev30))) : null, avg30_eur_day: avg30, n30, base_eur_day: base, n_base: nBase, delta_pct: delta };
  });

  const operations: PoleOperationRow[] = (orows as any[]).map((r) => ({
    commitment_id: String(flat(r.commitment_id)),
    status: String(flat(r.status)),
    verdict: r.verdict != null ? String(flat(r.verdict)) : null,
    committed_action_text: r.committed_action_text != null ? String(flat(r.committed_action_text)) : null,
    window_start: r.window_start != null ? String(flat(r.window_start)) : null,
    window_end: r.window_end != null ? String(flat(r.window_end)) : null,
    version_no: r.version_no != null ? Number(flat(r.version_no)) : null,
  }));

  const mkAgg = (): PoleTotals => {
    if (!aggRow) return { rev30_eur: null, share_pct: null, avg30_eur_day: null, base_eur_day: null, delta_pct: null, n30: 0 };
    const n30 = Number(flat(aggRow.n30)) || 0;
    const nBase = Number(flat(aggRow.nBase)) || 0;
    const rev30 = n30 >= 1 ? Math.round(Number(flat(aggRow.rev30))) : null;
    const avg30 = n30 >= 1 ? Math.round((Number(flat(aggRow.rev30)) / n30) * 100) / 100 : null;
    const base = nBase >= 1 ? Math.round((Number(flat(aggRow.revBase)) / nBase) * 100) / 100 : null;
    const siteRev30 = Number(flat(aggRow.site_rev30)) || 0;
    return {
      rev30_eur: rev30,
      share_pct: rev30 != null && siteRev30 > 0 ? Math.round((rev30 / siteRev30) * 1000) / 10 : null,
      avg30_eur_day: avg30,
      base_eur_day: base,
      delta_pct: n30 >= 5 && nBase >= 5 && base && base > 0 && avg30 != null
        ? Math.round(((avg30 - base) / base) * 1000) / 10 : null,
      n30,
    };
  };
  return { families: famReadings, operations, totals: mkAgg() };
}

// Les pôles OUVERTS du site — LE foyer de la liste (extrait de create_context le 27/08,
// consommé par le formulaire, le résolveur d'entités et toute surface à venir).
export interface PoleListRow {
  dispositif_id: string;
  name: string;
  families: string[];
  // Additifs (build Piloter pôles 28/08) — le bloc pôles du tableau a besoin du responsable,
  // du levier et du commitment_id de la VERSION COURANTE (cible des CTA Ajuster/Documenter
  // vers la fiche) sans re-requêter le journal ; les consommateurs existants les ignorent.
  lever: string | null;
  responsable: string | null;
  commitment_id: string | null;
  // Composants de la VERSION COURANTE (03/09, spec dispositifs-typologie § 5.5) — lus dans la
  // couche semantic (vw_insight_event_dispositif_components), jamais dans la table analytics.
  components: PoleComponentRow[];
}

// Un composant d'un dispositif permanent, tel que la couche semantic le libelle. Les libellés
// `provisoire` n'ont pas de mot owner (lexique) : un rendu les OMET, il ne les invente pas.
export interface PoleComponentRow {
  dispositif_id: string;
  component_key: string;
  type: string;
  type_label_fr: string | null;
  type_provisoire: boolean;
  role: string | null;
  role_label_fr: string | null;
  role_provisoire: boolean;
  label: string | null;
  version_no: number | null;
  created_at: string | null;   // ISO — la version courante existe depuis cette date
  pole_name: string;
  pole_families: string[];
}

// LE foyer des composants — la vue semantic de la version courante (statut ouvert), triée par
// pôle puis par ordre de déclaration. Une vue en chaîne de vues : un composant déclaré dans la
// session se lit dans la session.
export async function listPoleComponents(bq: any, location_id: string, limit = 200): Promise<PoleComponentRow[]> {
  const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  const rows = await bq.query({
    query: `SELECT dispositif_id, component_key, component_type, component_type_label_fr, component_type_provisoire,
                   component_role, component_role_label_fr, component_role_provisoire, component_label,
                   version_no, CAST(created_at AS STRING) AS created_at, committed_action_text, pole_families
            FROM \`${PROJECT}.semantic.vw_insight_event_dispositif_components\`
            WHERE location_id = @location_id AND status = 'open'
            ORDER BY committed_action_text, component_order LIMIT ${Math.max(1, Math.min(500, limit))}`,
    params: { location_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => {
    let fams: string[] = [];
    try { fams = JSON.parse(String(flat(r.pole_families) || "[]")); } catch { /* périmètre illisible */ }
    return {
      dispositif_id: String(flat(r.dispositif_id)),
      component_key: String(flat(r.component_key)),
      type: String(flat(r.component_type)),
      type_label_fr: r.component_type_label_fr != null ? String(flat(r.component_type_label_fr)) : null,
      type_provisoire: Boolean(flat(r.component_type_provisoire)),
      role: r.component_role != null ? String(flat(r.component_role)) : null,
      role_label_fr: r.component_role_label_fr != null ? String(flat(r.component_role_label_fr)) : null,
      role_provisoire: Boolean(flat(r.component_role_provisoire)),
      label: r.component_label != null ? String(flat(r.component_label)) || null : null,
      version_no: r.version_no != null ? Number(flat(r.version_no)) : null,
      created_at: r.created_at != null ? String(flat(r.created_at)) : null,
      pole_name: String(flat(r.committed_action_text) || "").split(" — ")[0],
      pole_families: fams,
    };
  });
}
export async function listPoles(bq: any, location_id: string, limit = 12): Promise<PoleListRow[]> {
  const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  // Composants (semantic) amorcés en parallèle de la liste — un aller-retour, pas deux en série.
  const componentsP = listPoleComponents(bq, location_id);
  const rows = await bq.query({
    query: `SELECT commitment_id, dispositif_id, committed_action_text, pole_families, owner_person_name FROM (
              SELECT commitment_id, dispositif_id, committed_action_text, pole_families, owner_person_name, status, verdict,
                     ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
                       CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
                       (verdict IS NOT NULL) DESC, created_at DESC) AS rn
              FROM \`${PROJECT}.analytics.action_commitments\`
              WHERE location_id = @location_id AND dispositif_nature = 'permanent'
            ) WHERE rn = 1 AND status = 'open'
            ORDER BY committed_action_text LIMIT ${Math.max(1, Math.min(50, limit))}`,
    params: { location_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const components = await componentsP;
  return (rows as any[]).map((r) => {
    let fams: string[] = [];
    try { fams = JSON.parse(String(flat(r.pole_families) || "[]")); } catch { /* périmètre illisible */ }
    const parts = String(flat(r.committed_action_text) || "").split(" — ");
    const did = String(flat(r.dispositif_id));
    return {
      dispositif_id: did,
      name: parts[0],
      families: fams,
      lever: parts.slice(1).join(" — ") || null,
      responsable: r.owner_person_name != null ? String(flat(r.owner_person_name)) || null : null,
      commitment_id: r.commitment_id != null ? String(flat(r.commitment_id)) : null,
      components: components.filter((c) => c.dispositif_id === did),
    };
  });
}
