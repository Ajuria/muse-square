// src/lib/commitmentShape.ts
// « Comprendre le résultat » (page Opération, owner 28/08) — la lecture qui manquait :
// d'où vient l'écart, pour que l'utilisateur puisse pivoter au lieu de subir le verdict.
//
// LA RÈGLE DE CONCEPTION, née du défaut relevé par l'owner sur le proto v1 : la page a UN
// SEUL référentiel de NIVEAU, celui de l'en-tête (expected_revenue du modèle = « votre
// résultat habituel »). Une carte qui comparait un niveau à un AUTRE habituel (les 4 derniers
// jeudis bruts) produisait « +543 € le matin » sous un en-tête à « +1,8 % » — dissonant, donc
// faux à la lecture. Ici :
//   • heures et familles sont lues en FORME : la référence (jours comparables) est REMISE À
//     L'ÉCHELLE du total réalisé, donc les écarts se compensent à zéro — c'est la répartition
//     qui bouge, jamais le niveau. Aucune contradiction possible avec le % d'en-tête.
//   • achats/panier est lu en NIVEAU, mais contre LE référentiel de l'en-tête : la somme des
//     deux contributions vaut EXACTEMENT (CA réalisé − CA habituel). Hypothèse explicite et
//     dite à l'écran : le panier « habituel » est celui des jours comparables ; le nombre
//     d'achats habituel s'en déduit (habituel € ÷ panier habituel).
//
// Jours comparables = les 4 mêmes jours de semaine qui précèdent l'opération (jeudi → les 4
// jeudis d'avant), strictement avant window_start : jamais un jour de l'opération dans sa
// propre référence. Moins de 2 jours comparables trouvés → tout est null (absence honnête).
//
// z-HIDDEN AT THE BOUNDARY (même contrat que evolution.ts) : le module LIT residual_z pour
// savoir si la journée sort de la variation ordinaire du lieu, et n'en rend qu'un COMPTE de
// jours — aucun z ne sort d'ici.

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number => Number(flat(v)) || 0;
const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface ShapeHour { h: number; rev: number; ref: number }
export interface ShapeRun { from_hour: number; to_hour: number; shift_eur: number; share_pct: number; ref_share_pct: number }
export interface ShapeFamily { family: string; rev: number; ref: number; delta: number }
export interface ShapeVolume {
  // Décomposition du GAP de l'en-tête : contrib_tx + contrib_basket = actual − expected.
  tx: number; ref_tx: number; contrib_tx_eur: number;
  basket_eur: number; ref_basket_eur: number; contrib_basket_eur: number;
  driver: "tx" | "basket";          // la composante qui pèse le plus (en valeur absolue)
  opposed: boolean;                 // les deux composantes jouent en sens contraire
}
export interface WindowShape {
  ref_days: number;                 // jours comparables réellement trouvés
  measured_days: number;            // jours de l'opération avec des ventes
  notable_days: number;             // jours qui sortent de la variation ordinaire du lieu
  actual_eur: number | null;        // CA réalisé sur les jours mesurés
  expected_eur: number | null;      // « votre résultat habituel » sur les mêmes jours
  hours: ShapeHour[];               // vide si le grain horaire manque
  best_run: ShapeRun | null;        // la tranche horaire qui prend le plus de place
  worst_run: ShapeRun | null;       // celle qui en perd le plus
  families: ShapeFamily[];          // triées par écart décroissant
  volume: ShapeVolume | null;       // null si la caisse ne donne pas achats/panier
}

/** Les 4 mêmes jours de semaine précédant l'opération, pour chaque jour mesuré. */
export function comparableDates(measured: string[], windowStart: string, backWeeks = 4): string[] {
  const out = new Set<string>();
  for (const d of measured) {
    for (let k = 1; k <= backWeeks; k++) {
      const ref = new Date(d + "T00:00:00Z");
      ref.setUTCDate(ref.getUTCDate() - 7 * k);
      const iso = ref.toISOString().slice(0, 10);
      if (iso < windowStart) out.add(iso);
    }
  }
  return [...out].sort();
}

/** Kadane — la tranche d'heures CONTIGUËS qui concentre le plus grand déplacement (aucun seuil d'heure en dur). */
function bestRun(hours: ShapeHour[], sign: 1 | -1): { from: number; to: number; sum: number } | null {
  let best: { from: number; to: number; sum: number } | null = null;
  let cur = 0, start = 0;
  for (let i = 0; i < hours.length; i++) {
    const v = sign * (hours[i].rev - hours[i].ref);
    if (cur <= 0) { cur = v; start = i; } else { cur += v; }
    if (cur > 0 && (!best || cur > best.sum)) best = { from: hours[start].h, to: hours[i].h, sum: cur };
  }
  return best;
}

export async function buildWindowShape(
  bq: any,
  args: { location_id: string; measured_dates: string[]; window_start: string },
): Promise<WindowShape | null> {
  const days = [...new Set(args.measured_dates)].sort();
  if (!days.length) return null;
  const refs = comparableDates(days, args.window_start);
  if (refs.length < 2) return null;                 // pas de référence crédible → pas de lecture

  const all = [...days, ...refs].sort();
  const lo = all[0], hi = all[all.length - 1];
  // Élagage par la partition (BETWEEN sur des DATE), appartenance exacte sur la chaîne :
  // un tableau de DATE en paramètre est le piège DATE/STRING documenté — la comparaison
  // se fait donc sur CAST(... AS STRING), bornée par les dates pour ne pas scanner large.
  const bounds = { lo: bq.date(lo), hi: bq.date(hi) };
  const setCase = (col: string) => `IF(CAST(${col} AS STRING) IN UNNEST(@days), 'w', 'r')`;

  const q = (query: string, extra: Record<string, unknown> = {}) =>
    bq.query({ query, params: { loc: args.location_id, days, refs, ...bounds, ...extra }, location: "EU" })
      .then((r: any) => (Array.isArray(r?.[0]) ? r[0] : []))
      .catch(() => []);

  const [hRows, fRows, vRows, dRows] = await Promise.all([
    // 1. Grain horaire (mart.fct_client_hourly_sales — colonnes vérifiées 28/08).
    q(`SELECT ${setCase("transaction_date")} AS s, transaction_hour AS h, SUM(revenue) AS rev
        FROM \`${PROJECT}.mart.fct_client_hourly_sales\`
        WHERE location_id = @loc AND transaction_date BETWEEN @lo AND @hi
          AND CAST(transaction_date AS STRING) IN UNNEST(ARRAY_CONCAT(@days, @refs))
        GROUP BY 1, 2`),
    // 2. Familles de la caisse (raw.client_transactions.item_category — le MÊME champ que
    //    le KPI family_revenue et que la lecture des pôles : jamais un second vocabulaire).
    q(`SELECT ${setCase("transaction_date")} AS s, item_category AS f, SUM(revenue) AS rev
        FROM \`${PROJECT}.raw.client_transactions\`
        WHERE location_id = @loc AND transaction_date BETWEEN @lo AND @hi
          AND CAST(transaction_date AS STRING) IN UNNEST(ARRAY_CONCAT(@days, @refs))
        GROUP BY 1, 2`),
    // 3. Achats + CA (mart.fct_client_daily_performance) — le panier se recompose CA/achats,
    //    jamais une moyenne de moyennes.
    q(`SELECT ${setCase("transaction_date")} AS s, SUM(daily_transactions) AS tx, SUM(daily_revenue) AS rev,
              COUNT(DISTINCT transaction_date) AS n
        FROM \`${PROJECT}.mart.fct_client_daily_performance\`
        WHERE location_id = @loc AND transaction_date BETWEEN @lo AND @hi
          AND CAST(transaction_date AS STRING) IN UNNEST(ARRAY_CONCAT(@days, @refs))
        GROUP BY 1`),
    // 4. Le référentiel de l'en-tête + les jours qui sortent de la variation ordinaire.
    q(`SELECT SUM(daily_revenue) AS actual, SUM(expected_revenue) AS expected,
              COUNT(*) AS n, COUNTIF(ABS(residual_z) >= 1) AS notable
        FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
        WHERE location_id = @loc AND date BETWEEN @lo AND @hi
          AND CAST(date AS STRING) IN UNNEST(@days)`),
  ]);

  // ── Heures : la référence est REMISE À L'ÉCHELLE du total réalisé (lecture en forme). ──
  const hDay = new Map<number, number>(), hRef = new Map<number, number>();
  for (const r of hRows as any[]) {
    const h = num(r.h);
    const m = String(flat(r.s)) === "w" ? hDay : hRef;
    m.set(h, (m.get(h) ?? 0) + num(r.rev));
  }
  const hTotDay = [...hDay.values()].reduce((s, v) => s + v, 0);
  const hTotRef = [...hRef.values()].reduce((s, v) => s + v, 0);
  const hScale = hTotRef > 0 ? hTotDay / hTotRef : 0;
  const hours: ShapeHour[] = hScale > 0
    ? [...new Set([...hDay.keys(), ...hRef.keys()])].sort((a, b) => a - b)
        .map((h) => ({ h, rev: Math.round(hDay.get(h) ?? 0), ref: Math.round((hRef.get(h) ?? 0) * hScale) }))
    : [];
  const mkRun = (run: { from: number; to: number; sum: number } | null): ShapeRun | null => {
    if (!run || hTotDay <= 0 || hTotRef <= 0) return null;
    let inDay = 0, inRef = 0;
    for (const x of hours) if (x.h >= run.from && x.h <= run.to) { inDay += x.rev; inRef += x.ref; }
    return {
      from_hour: run.from, to_hour: run.to, shift_eur: Math.round(run.sum),
      share_pct: r1((inDay / hTotDay) * 100), ref_share_pct: r1((inRef / hTotDay) * 100),
    };
  };
  const best_run = mkRun(bestRun(hours, 1));
  const worst_run = mkRun(bestRun(hours, -1));

  // ── Familles : même remise à l'échelle — la part de chacune dans la journée. ──
  const fDay = new Map<string, number>(), fRef = new Map<string, number>();
  for (const r of fRows as any[]) {
    const f = String(flat(r.f) ?? "").trim(); if (!f) continue;
    const m = String(flat(r.s)) === "w" ? fDay : fRef;
    m.set(f, (m.get(f) ?? 0) + num(r.rev));
  }
  const fTotDay = [...fDay.values()].reduce((s, v) => s + v, 0);
  const fTotRef = [...fRef.values()].reduce((s, v) => s + v, 0);
  const fScale = fTotRef > 0 ? fTotDay / fTotRef : 0;
  const families: ShapeFamily[] = fScale > 0
    ? [...new Set([...fDay.keys(), ...fRef.keys()])].map((f) => {
        const rev = Math.round(fDay.get(f) ?? 0), ref = Math.round((fRef.get(f) ?? 0) * fScale);
        return { family: f, rev, ref, delta: rev - ref };
      }).sort((a, b) => b.delta - a.delta)
    : [];

  // ── Le référentiel de l'en-tête. ──
  const d0 = (dRows as any[])[0] || {};
  const measured_days = num(d0.n);
  const actual_eur = d0.actual != null ? Math.round(num(d0.actual)) : null;
  const expected_eur = d0.expected != null ? Math.round(num(d0.expected)) : null;

  // ── Achats / panier : la décomposition du gap de l'en-tête. Somme des deux = actual − expected. ──
  let volume: ShapeVolume | null = null;
  const vDay = (vRows as any[]).find((r) => String(flat(r.s)) === "w");
  const vRef = (vRows as any[]).find((r) => String(flat(r.s)) === "r");
  if (vDay && vRef && actual_eur != null && expected_eur != null) {
    const txDay = num(vDay.tx), revDay = num(vDay.rev);
    const txRef = num(vRef.tx), revRef = num(vRef.rev);
    if (txDay > 0 && txRef > 0 && revRef > 0 && expected_eur > 0) {
      const basketDay = revDay / txDay;
      const basketRef = revRef / txRef;                 // panier des jours comparables
      const txExpected = expected_eur / basketRef;      // achats qu'il aurait fallu à ce panier
      const contribTx = (txDay - txExpected) * basketRef;
      const contribBasket = (basketDay - basketRef) * txDay;
      volume = {
        tx: Math.round(txDay), ref_tx: Math.round(txExpected), contrib_tx_eur: Math.round(contribTx),
        basket_eur: r2(basketDay), ref_basket_eur: r2(basketRef), contrib_basket_eur: Math.round(contribBasket),
        driver: Math.abs(contribTx) >= Math.abs(contribBasket) ? "tx" : "basket",
        opposed: contribTx * contribBasket < 0,
      };
    }
  }

  return {
    ref_days: refs.length, measured_days, notable_days: num(d0.notable),
    actual_eur, expected_eur, hours, best_run, worst_run, families, volume,
  };
}
