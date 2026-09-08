// tools/harness/engagement-shape-harness.ts — harnais du module « Comprendre le résultat ».
// Tire les VRAIS engagements du compte owner (f10c3e58) et vérifie les invariants qui
// font la valeur de la lecture. Le premier est le contrat de non-dissonance relevé par
// l'owner : la somme des écarts de forme vaut ZÉRO, la somme des contributions
// achats/panier vaut EXACTEMENT le gap de l'en-tête.
//   npx tsx tools/harness/engagement-shape-harness.ts
import { makeBQClient } from "../../src/lib/bq";
import { readLatestSnapshot } from "../../src/lib/commitments/actionCommitments";
import { buildWindowShape, comparableDates } from "../../src/lib/commitments/commitmentShape";
import { parseScope, scopeFromFamily } from "../../src/lib/commitments/measuredScope";

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OPEN_ID = "2d99694a-17fa-4486-92e1-548ce588e1f5";   // vacances scolaires, 7 j ouverts
const DONE_ID = "49a325dd-b06f-4cbc-982f-7ab71af70b12";   // Corner producteur, jour même résolu

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

function measuredDatesOf(bq: any, snap: any): Promise<string[]> {
  const ws = String((snap.window_start as any)?.value ?? snap.window_start).slice(0, 10);
  const we = String((snap.window_end as any)?.value ?? snap.window_end).slice(0, 10);
  return bq.query({
    query: `SELECT CAST(date AS STRING) d FROM \`muse-square-open-data.semantic.vw_insight_event_day_residual\`
            WHERE location_id=@l AND date BETWEEN @a AND @b ORDER BY 1`,
    params: { l: snap.location_id, a: bq.date(ws), b: bq.date(we) }, location: "EU",
  }).then((r: any) => (r[0] || []).map((x: any) => String(x.d?.value ?? x.d)));
}

(async () => {
  const bq: any = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");

  console.log("\n— Phase 1 : jours comparables (pur, sans BQ) —");
  const cmp = comparableDates(["2026-08-27"], "2026-08-27");
  ok("4 jeudis précédents", cmp.length === 4, cmp);
  ok("tous strictement avant l'opération", cmp.every((d) => d < "2026-08-27"), cmp);
  ok("tous un jeudi", cmp.every((d) => new Date(d + "T00:00:00Z").getUTCDay() === 4), cmp);
  ok("aucun jour de l'opération dans sa référence", !cmp.includes("2026-08-27"));

  for (const [label, id] of [["OUVERTE (vacances scolaires)", OPEN_ID], ["TERMINÉE (Corner producteur)", DONE_ID]] as const) {
    console.log(`\n— Phase 2 : ${label} —`);
    const snap: any = await readLatestSnapshot(bq, id);
    if (!snap) { ok("snapshot lu", false, id); continue; }
    const ws = String(snap.window_start?.value ?? snap.window_start).slice(0, 10);
    const measured = await measuredDatesOf(bq, snap);
    const shape = await buildWindowShape(bq, { location_id: LOC, measured_dates: measured, window_start: ws });
    if (!shape) { ok("lecture rendue", false, { measured }); continue; }
    console.log("   " + JSON.stringify({
      ref_days: shape.ref_days, measured_days: shape.measured_days, notable_days: shape.notable_days,
      actual: shape.actual_eur, expected: shape.expected_eur,
      best_run: shape.best_run, worst_run: shape.worst_run,
      families: shape.families.length, volume: shape.volume,
    }));

    ok("jours comparables trouvés", shape.ref_days >= 2, shape.ref_days);
    ok("jours mesurés = jours de la série", shape.measured_days === measured.length, { s: shape.measured_days, m: measured.length });

    // INVARIANT 1 — UN SEUL RÉFÉRENTIEL DANS LA PAGE (owner 28/08) : heures et familles se
    // comparent au RÉSULTAT HABITUEL, comme l'en-tête et le verdict. La somme de leurs
    // écarts vaut donc EXACTEMENT l'écart de l'en-tête (réalisé − habituel) — c'est ce qui
    // rend la page arithmétiquement cohérente de haut en bas.
    const gapEntete = (shape.actual_eur ?? 0) - (shape.expected_eur ?? 0);
    const hSum = shape.hours.reduce((s, x) => s + (x.rev - x.ref), 0);
    ok("heures : somme des écarts = écart de l'en-tête",
      Math.abs(hSum - gapEntete) <= Math.max(3, shape.hours.length), { somme: Math.round(hSum), entete: gapEntete });
    const fSum = shape.families.reduce((s, x) => s + x.delta, 0);
    ok("familles : somme des écarts = écart de l'en-tête",
      Math.abs(fSum - gapEntete) <= Math.max(3, shape.families.length), { somme: Math.round(fSum), entete: gapEntete });

    // INVARIANT 2 — CHAQUE CHIFFRE AFFICHÉ EXISTE DANS LA CAISSE (owner 28/08 : « 403 achats
    // au lieu de 467 » — 467 ne venait d'aucune vente). Les points sont re-interrogés en
    // base, et sur une AUTRE table que celle qui les produit (mart jour vs mart horaire) :
    // si les deux sources divergent, la lecture est fausse quelque part.
    if (shape.volume) {
      const v = shape.volume;
      const rows: any[] = await bq.query({
        query: `SELECT CAST(transaction_date AS STRING) d, daily_transactions tx, daily_avg_basket b
                FROM \`muse-square-open-data.mart.fct_client_daily_performance\`
                WHERE location_id=@l AND CAST(transaction_date AS STRING) IN UNNEST(@ds)`,
        params: { l: LOC, ds: [...v.ref, ...v.days].map((p) => p.date) }, location: "EU",
      }).then((r: any) => r[0] || []);
      const enBase = new Map(rows.map((r: any) => [String(r.d?.value ?? r.d), r]));
      const faux = [...v.ref, ...v.days].filter((p) => {
        const r: any = enBase.get(p.date);
        if (!r) return true;
        const tx = Number(r.tx?.value ?? r.tx), b = Number(r.b?.value ?? r.b);
        return Math.round(tx) !== p.tx || Math.abs(b - p.basket_eur) > 0.02;
      });
      ok("chaque achat/panier affiché est une ligne de caisse (2 sources d'accord)", faux.length === 0, faux);
      ok("aucun nombre contrefactuel dans la charge utile",
        !("ref_tx" in v) && !("contrib_tx_eur" in v) && !("contrib_basket_eur" in v), Object.keys(v));
      // LE contrat de la décomposition : les trois facteurs se MULTIPLIENT pour donner la
      // variation du CA. Si ça ne tombe pas, la carte raconte une histoire fausse.
      const f = (p: number | null) => 1 + (p ?? 0) / 100;
      const produit = (f(v.tx_pct) * f(v.items_pct) * f(v.price_pct) - 1) * 100;
      ok("achats × articles/achat × €/article = variation du CA",
        v.total_pct != null && Math.abs(produit - v.total_pct) <= 0.6,
        { produit: Math.round(produit * 10) / 10, total: v.total_pct,
          facteurs: { achats: v.tx_pct, articles: v.items_pct, prix: v.price_pct } });
      // Le panier moyen n'est pas un 4e facteur indépendant : c'est articles × prix.
      ok("panier moyen = articles par achat × € par article",
        Math.abs(v.items_avg * v.price_avg - v.basket_avg) <= 0.03,
        { items: v.items_avg, price: v.price_avg, basket: v.basket_avg });
      ok("articles par achat >= 1 (un achat contient au moins un article)",
        v.items_avg >= 1 && v.ref_items_avg >= 1, { a: v.items_avg, r: v.ref_items_avg });
    } else ok("achats/panier : absence honnête assumée", shape.volume === null, shape.volume);

    // INVARIANT 3 — la tranche horaire sort des données, jamais d'une heure en dur.
    if (shape.best_run) {
      ok("tranche haute contiguë et positive", shape.best_run.from_hour <= shape.best_run.to_hour && shape.best_run.shift_eur > 0, shape.best_run);
      ok("part de la tranche entre 0 et 100 %", shape.best_run.share_pct > 0 && shape.best_run.share_pct <= 100, shape.best_run);
    }
    ok("aucune famille vide", shape.families.every((f) => f.family.trim().length > 0));

    // ── Le cran PRODUIT : même lecture en part, et rien de tu ──
    const withProd = shape.families.filter((f) => f.products.length);
    ok("des familles portent leurs produits", withProd.length > 0, shape.families.map((f) => [f.family, f.products.length]));
    ok("au plus 6 produits listés par famille", shape.families.every((f) => f.products.length <= 6),
      shape.families.map((f) => f.products.length));
    ok("aucun produit sans libellé", shape.families.every((f) => f.products.every((p) => p.name.trim().length > 0)));
    // L'invariant qui empêche la troncature muette : produits listés + reste caché = la famille.
    ok("produits listés + reste = écart de la famille",
      shape.families.every((f) => {
        if (!f.products.length) return true;
        const sum = f.products.reduce((s, p) => s + p.delta, 0) + f.products_hidden_eur;
        return Math.abs(sum - f.delta) <= Math.max(2, f.products_total);
      }),
      shape.families.map((f) => ({ f: f.family, d: f.delta, s: f.products.reduce((s, p) => s + p.delta, 0) + f.products_hidden_eur })));
    ok("produits triés par écart décroissant",
      shape.families.every((f) => f.products.every((p, i) => i === 0 || f.products[i - 1].delta >= p.delta)));
  }

  console.log(`\n— Phase 3 : absence honnête —`);
  const noRef = await buildWindowShape(bq, { location_id: LOC, measured_dates: ["2026-08-27"], window_start: "1900-01-01" });
  ok("aucun jour comparable → null", noRef === null, noRef);
  const noDay = await buildWindowShape(bq, { location_id: LOC, measured_dates: [], window_start: "2026-08-27" });
  ok("aucun jour mesuré → null", noDay === null, noDay);

  // ── Phase 4 (P3, 08/09) : la lecture RESTREINTE AU PÉRIMÈTRE — le Corner (famille « Branded ») ──
  console.log(`\n— Phase 4 : périmètre (Corner, famille « Branded ») —`);
  {
    const snap: any = await readLatestSnapshot(bq, DONE_ID);
    const ws = String(snap.window_start?.value ?? snap.window_start).slice(0, 10);
    const measured = await measuredDatesOf(bq, snap);
    const scope = parseScope(snap.measured_scope) ?? scopeFromFamily("Branded");
    const base = snap.kpi_baseline != null ? Number(snap.kpi_baseline?.value ?? snap.kpi_baseline) : null;
    const whole = await buildWindowShape(bq, { location_id: LOC, measured_dates: measured, window_start: ws });
    const sc = await buildWindowShape(bq, { location_id: LOC, measured_dates: measured, window_start: ws, scope, scope_label_fr: "de la famille « Branded »", scope_expected_eur: base != null ? base * measured.length : null });
    ok("lecture restreinte rendue", !!sc && !!whole, { sc: !!sc, whole: !!whole });
    if (sc && whole) {
      console.log("   " + JSON.stringify({ actual: sc.actual_eur, expected: sc.expected_eur, families: sc.families.map((f) => f.family), volume: sc.volume && { tx: sc.volume.tx_avg, ref_tx: sc.volume.ref_tx_avg, total: sc.volume.total_pct }, store: sc.store_total_pct, hours: sc.hours.length }));
      ok("le nom du périmètre est porté", sc.scope_label_fr === "de la famille « Branded »", sc.scope_label_fr);
      ok("familles = celles du périmètre seulement", sc.families.length === 1 && sc.families[0].family === "Branded", sc.families.map((f) => f.family));
      ok("le réalisé du périmètre = la somme des lignes Branded des jours mesurés (autre requête)", await (async () => {
        const [r] = await bq.query({ query: `SELECT ROUND(SUM(revenue)) v FROM \`muse-square-open-data.raw.client_transactions\` WHERE location_id=@l AND item_category='Branded' AND CAST(transaction_date AS STRING) IN UNNEST(@ds)`, params: { l: LOC, ds: measured }, location: "EU" });
        return Math.abs(Number(r[0]?.v ?? NaN) - (sc.actual_eur ?? -1)) <= 1;
      })(), sc.actual_eur);
      ok("habituel du périmètre = kpi_baseline × jours (le référentiel du verdict)", base != null && sc.expected_eur === Math.round(base * measured.length), { base, expected: sc.expected_eur });
      const gap = (sc.actual_eur ?? 0) - (sc.expected_eur ?? 0);
      const fSum = sc.families.reduce((s, x) => s + x.delta, 0);
      ok("familles : somme des écarts = écart du périmètre", Math.abs(fSum - gap) <= 3, { somme: Math.round(fSum), gap });
      const hSum = sc.hours.reduce((s, x) => s + (x.rev - x.ref), 0);
      ok("heures : somme des écarts = écart du périmètre", sc.hours.length === 0 || Math.abs(hSum - gap) <= Math.max(3, sc.hours.length), { somme: Math.round(hSum), gap });
      if (sc.volume) {
        const v = sc.volume;
        // 2 sources : les achats CONTENANT Branded par jour = invoice_count de la vue offering (mart offering daily, 07/09)
        const rows: any[] = await bq.query({
          query: `SELECT CAST(transaction_date AS STRING) d, invoice_count tx FROM \`muse-square-open-data.semantic.vw_insight_event_client_offering_daily\`
                  WHERE location_id=@l AND item_category='Branded' AND CAST(transaction_date AS STRING) IN UNNEST(@ds)`,
          params: { l: LOC, ds: [...v.ref, ...v.days].map((p) => p.date) }, location: "EU",
        }).then((r: any) => r[0] || []);
        const enBase = new Map(rows.map((r: any) => [String(r.d?.value ?? r.d), Number(r.tx?.value ?? r.tx)]));
        const faux = [...v.ref, ...v.days].filter((p) => enBase.get(p.date) !== p.tx);
        ok("achats du périmètre = invoice_count de la vue offering, jour par jour (2 sources)", faux.length === 0, faux.map((p) => [p.date, p.tx, enBase.get(p.date)]));
        const f = (p: number | null) => 1 + (p ?? 0) / 100;
        const produit = (f(v.tx_pct) * f(v.items_pct) * f(v.price_pct) - 1) * 100;
        ok("achats × articles/achat × €/article = variation du CA du périmètre", v.total_pct != null && Math.abs(produit - v.total_pct) <= 0.6, { produit: Math.round(produit * 10) / 10, total: v.total_pct });
      } else ok("achats/panier du périmètre : absence honnête", sc.volume === null);
      ok("le lieu entier reste UNE ligne de contexte = la lecture non restreinte", sc.store_total_pct != null && whole.volume != null && sc.store_total_pct === whole.volume.total_pct, { store: sc.store_total_pct, whole: whole.volume && whole.volume.total_pct });
      ok("sans périmètre : aucun nom, aucune ligne de contexte", whole.scope_label_fr === null && whole.store_total_pct === null);
    }
  }

  console.log(`\n${pass} vert · ${fail} rouge`);
  process.exit(fail ? 1 : 0);
})();
