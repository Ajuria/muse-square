// Cartes de CYCLE DE VIE des événements utilisateur (spec docs/evenement-dossier-spec.md § 5,
// proto v2.1 §③ validé owner). Générateur ADDITIF consommé par api/insight/monitor.ts (partagé
// avec pulse — ce module s'ajoute au Promise.all existant, ne touche AUCUN chemin existant).
//
// Contrat de sortie = le même que les candidates de la vue (date/action_type/data_payload/
// suppression_key/…) : le client (action-cards.js SPECS event_*) rend sans changement de
// tuyauterie. Règles :
//  - `date` = AUJOURD'HUI (le jour d'AGIR — le client ne rend une candidate que sur son jour) ;
//    l'occurrence visée vit dans le payload (`occurrence_date`) ;
//  - suppression_key = `<type>:<location>:<date de l'occurrence>` — STABLE d'un jour à l'autre :
//    une carte reprise (M'engager) reste supprimée même quand elle se ré-émet le lendemain ;
//  - menace météo : mêmes niveaux que l'état Avant du dossier (lvl_* >= 3 × nature extérieure,
//    colonnes vérifiées du day_surface) — jamais un seuil réinventé ;
//  - mesure : l'écart € du residual (référentiel attendu du jour) — jamais recalculé ici ;
//  - échéance : decision_date posée (case cochée), sans selected_date, à <= 3 jours ;
//  - échec soft → [] : les cartes événement ne cassent JAMAIS le feed de pulse.

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const DAY_MS = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);

export async function buildEventLifecycleCards(bq: any, location_id: string, clerk_user_id: string | null, today: string): Promise<any[]> {
  if (!clerk_user_id || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  try {
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const horizon = addDays(today, 7);

    const [items] = await bq.query({
      query: `SELECT si.saved_item_id, si.title, si.description, si.event_type, si.event_nature,
                     si.hour_start, si.hour_end, si.kpi, si.kpi_family, si.recurrence,
                     CAST(si.decision_date AS STRING) AS dd, CAST(si.selected_date AS STRING) AS sd,
                     ARRAY_AGG(CAST(d.date AS STRING) ORDER BY d.date) AS dates
              FROM \`${PROJECT}.raw.saved_items\` si
              JOIN \`${PROJECT}.raw.saved_item_dates\` d
                ON d.saved_item_id = si.saved_item_id AND d.location_id = si.location_id
              WHERE si.location_id = @location_id AND si.clerk_user_id = @clerk_user_id
              GROUP BY si.saved_item_id, si.title, si.description, si.event_type, si.event_nature,
                       si.hour_start, si.hour_end, si.kpi, si.kpi_family, si.recurrence, dd, sd
              LIMIT 100`,
      params: { location_id, clerk_user_id }, location: "EU",
    });
    if (!items?.length) return [];

    type Ev = { sid: string; title: string; dispositif: string | null; type: string | null; nature: string | null;
      h1: number | null; h2: number | null; kpi: string | null; kpi_family: string | null;
      recurring: boolean; dd: string | null; sd: string | null; occ: string[] };
    const evs: Ev[] = (items as any[]).map((r) => {
      const recurring = String(flat(r.recurrence) ?? "none") !== "none";
      const dates: string[] = (r.dates ?? []).map((d: any) => String(flat(d)));
      const sd = flat(r.sd) != null ? String(flat(r.sd)) : null;
      return {
        sid: String(flat(r.saved_item_id)), title: String(flat(r.title) ?? ""),
        dispositif: flat(r.description) != null ? String(flat(r.description)) : null,
        type: flat(r.event_type) != null ? String(flat(r.event_type)) : null,
        nature: flat(r.event_nature) != null ? String(flat(r.event_nature)) : null,
        h1: flat(r.hour_start) != null ? Number(flat(r.hour_start)) : null,
        h2: flat(r.hour_end) != null ? Number(flat(r.hour_end)) : null,
        kpi: flat(r.kpi) != null ? String(flat(r.kpi)) : null,
        kpi_family: flat(r.kpi_family) != null ? String(flat(r.kpi_family)) : null,
        recurring, dd: flat(r.dd) != null ? String(flat(r.dd)) : null, sd,
        // Occurrences RÉELLES : récurrent → toutes les dates ; ponctuel → la date choisie seule
        // (les candidats non choisis ne sont pas des occurrences).
        occ: recurring ? dates : (sd ? [sd] : []),
      };
    });

    // Dates à interroger : surface (menace × nature + préparer) et residual (mesurer).
    const surfDates = new Set<string>();
    const measurePairs: Array<{ ev: Ev; date: string }> = [];
    for (const ev of evs) {
      for (const d of ev.occ) {
        if (d >= today && d <= horizon && (ev.nature === "outdoor" || ev.nature === "both")) surfDates.add(d);
        if (d === tomorrow) surfDates.add(d);
        if (d === yesterday) measurePairs.push({ ev, date: d });
      }
    }

    const empty = Promise.resolve([[] as any[]]);
    const [[surfRows], [resRows]] = await Promise.all([
      surfDates.size ? bq.query({
        query: `SELECT CAST(date AS STRING) AS d, lvl_rain, lvl_wind, lvl_snow, lvl_heat, weather_label_fr
                FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                WHERE location_id = @location_id AND date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
        params: { location_id, dates: [...surfDates] }, types: { dates: ["STRING"] }, location: "EU",
      }) : empty,
      measurePairs.length ? bq.query({
        query: `SELECT CAST(date AS STRING) AS d, ROUND(daily_revenue, 0) AS rev, ROUND(expected_revenue, 0) AS exp
                FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
                WHERE location_id = @location_id AND date = @d0`,
        params: { location_id, d0: bq.date(yesterday) }, location: "EU",
      }) : empty,
    ]);
    const surfBy = new Map((surfRows as any[]).map((s) => [String(flat(s.d)), s]));
    const res0: any = (resRows as any[])[0] ?? null;

    const cards: any[] = [];
    const push = (action_type: string, occurrence_date: string, priority: number, payload: Record<string, unknown>) => {
      cards.push({
        date: today,
        location_id,
        action_type,
        card_instance_id: `${action_type}:${payload.saved_item_id}:${occurrence_date}`,
        action_priority: priority,
        action_category: "evenement",
        confidence_tier: null,
        data_payload: JSON.stringify({ occurrence_date, ...payload }),
        suppression_key: `${action_type}:${location_id}:${occurrence_date}`,
        expires_at: occurrence_date,
      });
    };

    for (const ev of evs) {
      const base = { saved_item_id: ev.sid, event_title: ev.title, event_type: ev.type, dispositif: ev.dispositif,
        event_nature: ev.nature, hour_start: ev.h1, hour_end: ev.h2, kpi: ev.kpi, kpi_family: ev.kpi_family };
      // Échéance de choix (uniquement si la case a été cochée à la création — dd non nul).
      if (!ev.recurring && !ev.sd && ev.dd && ev.dd >= today && ev.dd <= addDays(today, 3)) {
        push("event_decision_due", ev.dd, 85, { ...base, decision_date: ev.dd, n_candidates: (items as any[]).length ? undefined : undefined });
      }
      for (const d of ev.occ) {
        // Menace météo × nature extérieure, occurrences à <= 7 jours.
        if (d >= today && d <= horizon && (ev.nature === "outdoor" || ev.nature === "both")) {
          const s: any = surfBy.get(d);
          const lvlMax = s ? Math.max(Number(flat(s.lvl_rain) ?? 0), Number(flat(s.lvl_wind) ?? 0), Number(flat(s.lvl_snow) ?? 0)) : 0;
          if (lvlMax >= 3) push("event_threat", d, 95, { ...base, weather_label_fr: flat(s.weather_label_fr) != null ? String(flat(s.weather_label_fr)) : null, lvl_max: lvlMax });
        }
        // J-1 : préparer le déclenchement (météo de demain incluse quand la surface la porte).
        if (d === tomorrow) {
          const s: any = surfBy.get(d);
          push("event_prepare", d, 80, { ...base,
            weather_label_fr: s && flat(s.weather_label_fr) != null ? String(flat(s.weather_label_fr)) : null,
            lvl_heat: s ? Number(flat(s.lvl_heat) ?? 0) : null });
        }
        // J+1 : mesurer et documenter (écart € du residual — jamais recalculé).
        if (d === yesterday) {
          push("event_measure", d, 90, { ...base,
            revenue: res0 ? Number(flat(res0.rev)) : null,
            expected: res0 ? Number(flat(res0.exp)) : null,
            gap_eur: res0 && flat(res0.rev) != null && flat(res0.exp) != null ? Number(flat(res0.rev)) - Number(flat(res0.exp)) : null });
        }
      }
    }
    return cards;
  } catch (e) {
    console.warn("[eventLifecycleCards] skipped:", e);
    return [];
  }
}
