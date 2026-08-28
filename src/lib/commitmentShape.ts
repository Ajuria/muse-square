// src/lib/commitmentShape.ts
// « Comprendre le résultat » (page Opération, owner 28/08) — la lecture qui manquait :
// d'où vient l'écart, pour que l'utilisateur puisse pivoter au lieu de subir le verdict.
//
// LA RÈGLE DE CONCEPTION (owner 28/08) : la page tient UN SEUL référentiel, celui de sa
// carte d'origine — « votre résultat habituel » (expected_revenue du modèle jour de semaine
// + tendance), le même que l'en-tête, le verdict, l'objectif et `dayClassRegistry`
// (daily_revenue − expected_revenue).
//   • heures et familles/produits : les jours comparables sont répartis sur le RÉSULTAT
//     HABITUEL du jour — chaque famille, chaque heure se compare donc à ce qu'elle fait un
//     jour ordinaire, et la somme de leurs écarts vaut EXACTEMENT l'écart de l'en-tête.
//   • décomposition en trois facteurs (achats × articles par achat × € par article) : le
//     modèle ne produit qu'un montant en euros — il n'existe aucun « nombre d'achats
//     habituel » à comparer. Ce bloc compare donc à des jours RÉELS (les 4 mêmes jours de
//     semaine précédents) : c'est le seul endroit de la page où le référentiel diffère, et
//     il le dit. Toute tentative de fabriquer un attendu par facteur a déjà produit un
//     mensonge (« 403 achats au lieu de 467 » = 2 204 € ÷ 4,71 €, aucune caisse).
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
export interface ShapeProduct { name: string; rev: number; ref: number; delta: number }
export interface ShapeFamily {
  family: string; rev: number; ref: number; delta: number;
  // Le cran en dessous (owner 28/08) : les produits de la famille, MÊME lecture en part
  // (référence remise à la même échelle) — la somme de leurs écarts vaut celui de la famille.
  products: ShapeProduct[];
  products_total: number;           // produits vendus dans la famille (jour + référence)
  products_hidden_eur: number;      // écart porté par les produits NON listés (jamais tu)
}
export interface ShapeVolumePoint { date: string; tx: number; units: number; basket_eur: number }
// D'OÙ VIENT LA FLUCTUATION (owner 28/08) — la question se décompose EXACTEMENT en trois
// facteurs observés, dont le produit vaut la variation du CA : combien de gens ont acheté,
// combien d'articles chacun a pris, et à quel prix moyen l'article est parti.
//   CA = achats × (articles / achat) × (€ / article)
// Le troisième étage manquait (« la composition du panier moyen — nombre et types de
// produits achetés ») : le NOMBRE d'articles vit ici, les TYPES dans la carte des familles.
export interface ShapeVolume {
  // RIEN QUE DE L'OBSERVÉ (owner 28/08). La version précédente décomposait l'écart de
  // l'en-tête en « contribution des achats » et « contribution du panier » sous une
  // hypothèse de panier constant : elle produisait « 403 achats au lieu de 467 » et
  // « le panier fait +343 € » — deux nombres qui n'existent dans AUCUNE caisse (467 =
  // 2 204 € ÷ 4,71 €) pendant que la journée valait +39 €. Un intermédiaire de calcul
  // affiché comme un fait est un mensonge : la décomposition est SUPPRIMÉE.
  ref: ShapeVolumePoint[];          // jours comparables, chronologiques
  days: ShapeVolumePoint[];         // jours mesurés de l'opération
  tx_avg: number; ref_tx_avg: number;                 // achats par jour
  basket_avg: number; ref_basket_avg: number;         // panier moyen (€ par achat)
  items_avg: number; ref_items_avg: number;           // articles par achat
  price_avg: number; ref_price_avg: number;           // € par article
  tx_pct: number | null;                              // écarts vs jours comparables
  basket_pct: number | null;
  items_pct: number | null;
  price_pct: number | null;
  total_pct: number | null;         // variation du CA — produit exact des trois facteurs
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

  const [hRows, fpRows, vRows, dRows] = await Promise.all([
    // 1. Grain horaire (mart.fct_client_hourly_sales — colonnes vérifiées 28/08).
    q(`SELECT ${setCase("transaction_date")} AS s, transaction_hour AS h, SUM(revenue) AS rev
        FROM \`${PROJECT}.mart.fct_client_hourly_sales\`
        WHERE location_id = @loc AND transaction_date BETWEEN @lo AND @hi
          AND CAST(transaction_date AS STRING) IN UNNEST(ARRAY_CONCAT(@days, @refs))
        GROUP BY 1, 2`),
    // 2. Familles ET produits en UNE lecture (raw.client_transactions — `item_category` est le
    //    MÊME champ que le KPI family_revenue et que la lecture des pôles ; `item_description`
    //    est le cran en dessous). La famille est la SOMME de ses lignes : un produit sans
    //    libellé compte dans sa famille sans jamais s'afficher comme produit.
    q(`SELECT ${setCase("transaction_date")} AS s, item_category AS f,
              COALESCE(item_description, '') AS p, SUM(revenue) AS rev
        FROM \`${PROJECT}.raw.client_transactions\`
        WHERE location_id = @loc AND transaction_date BETWEEN @lo AND @hi
          AND CAST(transaction_date AS STRING) IN UNNEST(ARRAY_CONCAT(@days, @refs))
        GROUP BY 1, 2, 3`),
    // 3. Achats + CA (mart.fct_client_daily_performance) — le panier se recompose CA/achats,
    //    jamais une moyenne de moyennes.
    q(`SELECT ${setCase("transaction_date")} AS s, CAST(transaction_date AS STRING) AS d,
              SUM(transactions) AS tx, SUM(units) AS units, SUM(revenue) AS rev
        FROM \`${PROJECT}.mart.fct_client_hourly_sales\`
        WHERE location_id = @loc AND transaction_date BETWEEN @lo AND @hi
          AND CAST(transaction_date AS STRING) IN UNNEST(ARRAY_CONCAT(@days, @refs))
        GROUP BY 1, 2`),
    // 4. Le référentiel de l'en-tête + les jours qui sortent de la variation ordinaire.
    q(`SELECT SUM(daily_revenue) AS actual, SUM(expected_revenue) AS expected,
              COUNT(*) AS n, COUNTIF(ABS(residual_z) >= 1) AS notable
        FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
        WHERE location_id = @loc AND date BETWEEN @lo AND @hi
          AND CAST(date AS STRING) IN UNNEST(@days)`),
  ]);

  // ── Le référentiel de l'en-tête. ──
  const d0 = (dRows as any[])[0] || {};
  const measured_days = num(d0.n);
  const actual_eur = d0.actual != null ? Math.round(num(d0.actual)) : null;
  const expected_eur = d0.expected != null ? Math.round(num(d0.expected)) : null;

  // ── UN SEUL RÉFÉRENTIEL DANS LA PAGE (owner 28/08) — heures et familles se comparent
  //    à VOTRE RÉSULTAT HABITUEL, comme l'en-tête, le verdict, l'objectif et la carte
  //    d'origine (`dayClassRegistry` : daily_revenue − expected_revenue). Concrètement, les
  //    jours de référence sont répartis sur le résultat habituel du jour, plus sur son CA
  //    réalisé : chaque famille (chaque heure) se compare donc à ce qu'elle fait un jour
  //    ORDINAIRE, et la somme de leurs écarts vaut EXACTEMENT l'écart de l'en-tête.
  // ── Heures : la référence est REMISE À L'ÉCHELLE du total réalisé (lecture en forme). ──
  const hDay = new Map<number, number>(), hRef = new Map<number, number>();
  for (const r of hRows as any[]) {
    const h = num(r.h);
    const m = String(flat(r.s)) === "w" ? hDay : hRef;
    m.set(h, (m.get(h) ?? 0) + num(r.rev));
  }
  const hTotDay = [...hDay.values()].reduce((s, v) => s + v, 0);
  const hTotRef = [...hRef.values()].reduce((s, v) => s + v, 0);
  const hCible = expected_eur != null ? expected_eur : hTotDay;   // repli : le réalisé
  const hScale = hTotRef > 0 ? hCible / hTotRef : 0;
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

  // ── Familles et produits : même remise à l'échelle — la part de chacun dans la journée. ──
  const fDay = new Map<string, number>(), fRef = new Map<string, number>();
  const pDay = new Map<string, Map<string, number>>(), pRef = new Map<string, Map<string, number>>();
  for (const r of fpRows as any[]) {
    const f = String(flat(r.f) ?? "").trim(); if (!f) continue;
    const rev = num(r.rev);
    const isDay = String(flat(r.s)) === "w";
    const fm = isDay ? fDay : fRef;
    fm.set(f, (fm.get(f) ?? 0) + rev);
    const name = String(flat(r.p) ?? "").trim(); if (!name) continue;
    const pm = isDay ? pDay : pRef;
    if (!pm.has(f)) pm.set(f, new Map());
    const inner = pm.get(f) as Map<string, number>;
    inner.set(name, (inner.get(name) ?? 0) + rev);
  }
  const fTotDay = [...fDay.values()].reduce((s, v) => s + v, 0);
  const fTotRef = [...fRef.values()].reduce((s, v) => s + v, 0);
  const fCible = expected_eur != null ? expected_eur : fTotDay;   // repli : le réalisé
  const fScale = fTotRef > 0 ? fCible / fTotRef : 0;
  // Au plus 6 produits listés par famille — les autres ne disparaissent pas : leur écart
  // cumulé est rendu dans products_hidden_eur, que la page DIT (jamais de troncature muette).
  const PRODUCTS_PER_FAMILY = 6;
  const families: ShapeFamily[] = fScale > 0
    ? [...new Set([...fDay.keys(), ...fRef.keys()])].map((f) => {
        const rev = Math.round(fDay.get(f) ?? 0), ref = Math.round((fRef.get(f) ?? 0) * fScale);
        const dm = pDay.get(f) ?? new Map<string, number>(), rm = pRef.get(f) ?? new Map<string, number>();
        const all: ShapeProduct[] = [...new Set([...dm.keys(), ...rm.keys()])].map((name) => {
          const pr = Math.round(dm.get(name) ?? 0), pf = Math.round((rm.get(name) ?? 0) * fScale);
          return { name, rev: pr, ref: pf, delta: pr - pf };
        }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        const shown = all.slice(0, PRODUCTS_PER_FAMILY).sort((a, b) => b.delta - a.delta);
        const hidden = all.slice(PRODUCTS_PER_FAMILY).reduce((s, p) => s + p.delta, 0);
        return {
          family: f, rev, ref, delta: rev - ref,
          products: shown, products_total: all.length, products_hidden_eur: Math.round(hidden),
        };
      }).sort((a, b) => b.delta - a.delta)
    : [];

  // ── D'où vient la fluctuation : trois facteurs observés dont le produit EST la
  //    variation du CA (CA = achats × articles/achat × €/article). ──
  let volume: ShapeVolume | null = null;
  const pts = (side: "w" | "r"): ShapeVolumePoint[] => (vRows as any[])
    .filter((r) => String(flat(r.s)) === side && num(r.tx) > 0)
    .map((r) => ({
      date: String(flat(r.d)), tx: Math.round(num(r.tx)), units: Math.round(num(r.units)),
      basket_eur: r2(num(r.rev) / num(r.tx)),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const vDays = pts("w"), vRef = pts("r");
  if (vDays.length && vRef.length) {
    // Les moyennes d'un ensemble se recomposent sur les TOTAUX (jamais une moyenne de
    // moyennes) : c'est ce qui garantit que les trois facteurs se multiplient exactement.
    const agr = (xs: ShapeVolumePoint[]) => {
      const tx = xs.reduce((a, p) => a + p.tx, 0);
      const units = xs.reduce((a, p) => a + p.units, 0);
      const rev = xs.reduce((a, p) => a + p.tx * p.basket_eur, 0);
      return {
        tx_j: tx / xs.length,                       // achats par jour
        basket: tx > 0 ? rev / tx : 0,              // € par achat
        items: tx > 0 ? units / tx : 0,             // articles par achat
        price: units > 0 ? rev / units : 0,         // € par article
      };
    };
    const A = agr(vDays), R = agr(vRef);
    const pct = (a: number, b: number): number | null => (b > 0 ? r1(((a - b) / b) * 100) : null);
    volume = {
      ref: vRef, days: vDays,
      tx_avg: Math.round(A.tx_j), ref_tx_avg: Math.round(R.tx_j),
      basket_avg: r2(A.basket), ref_basket_avg: r2(R.basket),
      items_avg: r2(A.items), ref_items_avg: r2(R.items),
      price_avg: r2(A.price), ref_price_avg: r2(R.price),
      tx_pct: pct(A.tx_j, R.tx_j), basket_pct: pct(A.basket, R.basket),
      items_pct: pct(A.items, R.items), price_pct: pct(A.price, R.price),
      // La variation du CA par jour — le produit des trois facteurs, à l'arrondi près.
      total_pct: pct(A.tx_j * A.basket, R.tx_j * R.basket),
    };
  }

  return {
    ref_days: refs.length, measured_days, notable_days: num(d0.notable),
    actual_eur, expected_eur, hours, best_run, worst_run, families, volume,
  };
}
