// src/lib/kpi/pontDeMarge.ts — LE PONT DE MARGE (docs/explorer-outil-spec.md § 4 `pont_de_marge`, § 9 incrément 8, 13/09) :
// d'où vient l'écart de marge brute entre deux périodes — la méthode de conseil « prix-volume-mix », par famille de
// produits & services, sur LA vue de marge par famille (semantic.vw_insight_event_family_margin_daily : unités,
// CA net HT, prix d'achat HT, marge brute, couverture). Quatre effets, dont la somme est EXACTEMENT l'écart :
//   · Volume : la marge de A, grossie du rapport des unités vendues (B/A), à mix et marges unitaires constants ;
//   · Mix : ce que déplace la répartition des unités entre familles, aux marges unitaires de A ;
//   · Prix de vente : les unités de B × (prix net unitaire B − A) ;
//   · Prix d'achat : − les unités de B × (coût unitaire B − A).
// Ne compte que les familles COSTÉES sur les deux périodes (couverture dite, le reste nommé et chiffré, jamais compté
// comme s'il l'était) ; les remises sont dites en mémo (elles sont dans le prix net). PUR : composePontDeMarge.
import type { AnswerBlock } from "../explorer/blocks";

const PROJECT = "muse-square-open-data";

export interface FamillePeriode {
  family: string;
  units: number;
  revenue: number;            // CA brut
  discount: number;           // remises
  revenue_net_ht: number;     // CA net HT (toutes lignes)
  revenue_costed: number;     // CA brut des lignes avec prix d'achat
  revenue_net_ht_costed: number;
  cost_ht: number;            // prix d'achat HT des lignes costées
  gross_margin_ht: number;    // marge brute HT (lignes costées)
  units_costed: number;       // unités des lignes costées (approx. : units × part costée du CA)
}
export interface PeriodeLue { du: string; au: string; libelle_fr: string }
export interface PontEffet { cle: "volume" | "mix" | "prix_vente" | "prix_achat"; libelle_fr: string; montant: number }
export interface PontDeMarge {
  found: boolean;
  a: PeriodeLue; b: PeriodeLue;
  marge_a: number; marge_b: number; ecart: number;
  effets: PontEffet[];
  couverture_a_pct: number; couverture_b_pct: number;
  hors_pont: Array<{ family: string; revenue_a: number; revenue_b: number }>;
  remises_a: number; remises_b: number;
  familles: Array<{ family: string; marge_a: number; marge_b: number; ecart: number }>;
  blocks: AnswerBlock[]; facts: string[]; sources: string[];
}

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const sgn = (n: number): string => `${n < 0 ? "−" : "+"}${frInt(Math.abs(n))} €`;
const pct = (n: number): string => `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;
const frDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

/** Lecture : les familles de chaque période, sommées (vue semantic). `units_costed` ≈ unités × (CA costé / CA). */
export async function readFamillesPeriode(bq: any, location_id: string, du: string, au: string): Promise<FamillePeriode[]> {
  const [rows] = await bq.query({
    query: `SELECT item_category AS family, SUM(units) AS units, SUM(revenue) AS revenue, SUM(discount_amount) AS discount, SUM(revenue_net_ht) AS revenue_net_ht,
                   SUM(revenue_costed) AS revenue_costed, SUM(revenue_net_ht_costed) AS revenue_net_ht_costed, SUM(cost_ht) AS cost_ht, SUM(gross_margin_ht) AS gross_margin_ht
            FROM \`${PROJECT}.semantic.vw_insight_event_family_margin_daily\`
            WHERE location_id = @location_id AND transaction_date BETWEEN DATE(@du) AND DATE(@au)
            GROUP BY 1 ORDER BY 1`,
    params: { location_id, du, au }, types: { location_id: "STRING", du: "STRING", au: "STRING" }, location: "EU",
  });
  const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
  const n = (x: any): number => Number(flat(x)) || 0;
  return (rows as any[]).map((r) => {
    const units = n(r.units), revenue = n(r.revenue), revenue_costed = n(r.revenue_costed);
    return { family: String(flat(r.family) ?? ""), units, revenue, discount: n(r.discount), revenue_net_ht: n(r.revenue_net_ht), revenue_costed, revenue_net_ht_costed: n(r.revenue_net_ht_costed), cost_ht: n(r.cost_ht), gross_margin_ht: n(r.gross_margin_ht), units_costed: revenue > 0 ? units * (revenue_costed / revenue) : 0 };
  });
}

/** PUR — deux lectures → le pont. Une famille entre au pont si elle a des unités costées et du CA net HT costé sur LES DEUX périodes. */
export function composePontDeMarge(A: FamillePeriode[], B: FamillePeriode[], a: PeriodeLue, b: PeriodeLue): PontDeMarge {
  const mapA = new Map(A.map((f) => [f.family, f])), mapB = new Map(B.map((f) => [f.family, f]));
  const noms = [...new Set([...mapA.keys(), ...mapB.keys()])];
  const ok = (f?: FamillePeriode) => !!f && f.units_costed > 0 && f.revenue_net_ht_costed > 0;
  const dans = noms.filter((k) => ok(mapA.get(k)) && ok(mapB.get(k)));
  const hors = noms.filter((k) => !dans.includes(k)).map((k) => ({ family: k, revenue_a: mapA.get(k)?.revenue ?? 0, revenue_b: mapB.get(k)?.revenue ?? 0 })).filter((h) => h.revenue_a > 0 || h.revenue_b > 0);
  const totalRev = (L: FamillePeriode[]) => L.reduce((s, f) => s + f.revenue, 0);
  const costedRev = (L: FamillePeriode[]) => L.reduce((s, f) => s + f.revenue_costed, 0);
  const couverture_a_pct = totalRev(A) > 0 ? (costedRev(A) / totalRev(A)) * 100 : 0;
  const couverture_b_pct = totalRev(B) > 0 ? (costedRev(B) / totalRev(B)) * 100 : 0;
  const remises_a = A.reduce((s, f) => s + f.discount, 0), remises_b = B.reduce((s, f) => s + f.discount, 0);
  if (!dans.length) {
    const manque = "Aucun pont de marge : aucune famille n'a de prix d'achat sur les deux périodes.";
    return { found: false, a, b, marge_a: 0, marge_b: 0, ecart: 0, effets: [], couverture_a_pct, couverture_b_pct, hors_pont: hors, remises_a, remises_b, familles: [], blocks: [{ type: "absence", manque, geste: { label_fr: "Importer vos prix d'achat", url: "/app/insightevent/tableau" } }], facts: [], sources: [] };
  }
  // Par famille : unités q, prix net unitaire p, coût unitaire c, marge unitaire m = p − c (lignes costées).
  const u = (f: FamillePeriode) => ({ q: f.units_costed, p: f.revenue_net_ht_costed / f.units_costed, c: f.cost_ht / f.units_costed });
  const QA = dans.reduce((s, k) => s + u(mapA.get(k)!).q, 0), QB = dans.reduce((s, k) => s + u(mapB.get(k)!).q, 0);
  const marge_a = dans.reduce((s, k) => { const x = u(mapA.get(k)!); return s + x.q * (x.p - x.c); }, 0);
  const marge_b = dans.reduce((s, k) => { const x = u(mapB.get(k)!); return s + x.q * (x.p - x.c); }, 0);
  const ratio = QA > 0 ? QB / QA : 1;
  let volume = (ratio - 1) * marge_a, mix = 0, prix_vente = 0, prix_achat = 0;
  const familles = dans.map((k) => {
    const xa = u(mapA.get(k)!), xb = u(mapB.get(k)!);
    const ma = xa.p - xa.c;
    mix += (xb.q - xa.q * ratio) * ma;
    prix_vente += xb.q * (xb.p - xa.p);
    prix_achat += -xb.q * (xb.c - xa.c);
    const fa = xa.q * ma, fb = xb.q * (xb.p - xb.c);
    return { family: k, marge_a: fa, marge_b: fb, ecart: fb - fa };
  }).sort((x, y) => Math.abs(y.ecart) - Math.abs(x.ecart));
  const ecart = marge_b - marge_a;
  const effets: PontEffet[] = [
    { cle: "volume", libelle_fr: "Volume (unités vendues, à mix constant)", montant: volume },
    { cle: "mix", libelle_fr: "Mix (répartition entre familles)", montant: mix },
    { cle: "prix_vente", libelle_fr: "Prix de vente (net HT par unité)", montant: prix_vente },
    { cle: "prix_achat", libelle_fr: "Prix d'achat (coût HT par unité)", montant: prix_achat },
  ];
  const facts: string[] = [
    `Marge brute des familles costées : ${frInt(marge_a)} € ${a.libelle_fr} → ${frInt(marge_b)} € ${b.libelle_fr}, soit ${sgn(ecart)}.`,
    ...effets.map((e) => `Effet ${e.libelle_fr.toLowerCase()} : ${sgn(e.montant)}.`),
    `Pont calculé sur ${dans.length} famille${dans.length > 1 ? "s" : ""} avec prix d'achat sur les deux périodes — couverture ${pct(couverture_a_pct)} du CA ${a.libelle_fr}, ${pct(couverture_b_pct)} ${b.libelle_fr}.`,
  ];
  if (hors.length) facts.push(`Hors pont (sans prix d'achat sur l'une des deux périodes) : ${hors.map((h) => `${h.family} (${frInt(h.revenue_a)} € → ${frInt(h.revenue_b)} € de CA)`).join(", ")}.`);
  if (remises_a > 0 || remises_b > 0) facts.push(`Remises : ${frInt(remises_a)} € ${a.libelle_fr}, ${frInt(remises_b)} € ${b.libelle_fr} — comprises dans le prix de vente net.`);
  for (const f of familles.slice(0, 5)) facts.push(`${f.family} : marge brute ${frInt(f.marge_a)} € → ${frInt(f.marge_b)} € (${sgn(f.ecart)}).`);
  const blocks: AnswerBlock[] = [
    { type: "table", cols: [{ label: "Effet", align: "left" }, { label: "Montant" }], rows: [
      { cells: [{ v: `Marge brute ${a.libelle_fr}`, bold: true }, { v: `${frInt(marge_a)} €` }] },
      ...effets.map((e) => ({ cells: [{ v: e.libelle_fr }, { v: sgn(e.montant), color: e.montant >= 0 ? "#0F6E56" : "#B91C1C", bold: true }] })),
      { cells: [{ v: `Marge brute ${b.libelle_fr}`, bold: true }, { v: `${frInt(marge_b)} €`, bold: true }] },
    ] },
    { type: "barres_h", items: effets.map((e) => ({ label: e.libelle_fr.split(" (")[0], value: e.montant, value_fr: sgn(e.montant) })), unite: "€ de marge brute" },
    { type: "table", cols: [{ label: "Famille", align: "left" }, { label: a.libelle_fr }, { label: b.libelle_fr }, { label: "Écart" }], rows: familles.map((f) => ({ cells: [{ v: f.family, bold: true }, { v: `${frInt(f.marge_a)} €` }, { v: `${frInt(f.marge_b)} €` }, { v: sgn(f.ecart), color: f.ecart >= 0 ? "#0F6E56" : "#B91C1C", bold: true }] })) },
    { type: "facts", items: facts.slice(5) },
  ];
  const sources = ["Vos ventes par famille avec leurs prix d'achat (unités, CA net HT, coût HT, marge brute — les mêmes lignes que la marge de Piloter)", "Méthode prix-volume-mix : volume et mix aux marges unitaires de la première période, prix de vente et prix d'achat aux unités de la seconde ; la somme des quatre effets est l'écart."];
  return { found: true, a, b, marge_a, marge_b, ecart, effets, couverture_a_pct, couverture_b_pct, hors_pont: hors, remises_a, remises_b, familles, blocks, facts, sources };
}

export const periodeLue = (du: string, au: string, libelle?: string | null): PeriodeLue => ({ du, au, libelle_fr: libelle ?? `du ${frDate(du)} au ${frDate(au)}` });
