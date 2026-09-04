// src/lib/topFamilles.ts
// I7 (04/09) — « top 3 produits août » : les familles de produits & services d'une PÉRIODE, classées
// par CA. La question tombait en « Aucun événement trouvé » (matcher offering raté sur le « 3 »),
// puis, matcher corrigé, en 400 (« août » = jeton de date non parsé sur le chemin jour) : la famille
// offering est un PROFIL 30 j (fetchIdentityAggregates), elle ne sait pas répondre sur un mois nommé.
// Ici : une lecture déterministe sur la période résolue — CA, part, CA/jour par famille, les K
// premières (resolveTopKFromText) puis « Autres familles » (patron de la table mix, I8).
// Source : raw.client_transactions (même table que measureFamilyRevenueMean / listSiteFamilies —
// hors cliquet mart ; is_invoiced non appliqué, dette notée). Aucun LLM.

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number => { const x = Number(flat(v)); return Number.isFinite(x) ? x : 0; };
const frEur = (v: number): string => Math.round(v).toLocaleString("fr-FR");
const frShare = (s: number): string => `${(Math.round(s * 1000) / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const frD = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export interface FamilleCA { famille: string; ca: number; share: number; ca_jour: number; n_days: number }
export interface TopFamillesReading { start: string; end: string; familles: FamilleCA[]; n_days_total: number }

export async function readTopFamilles(bq: any, location_id: string, start: string, end: string): Promise<TopFamillesReading> {
  const rows = await bq.query({
    query: `
      WITH l AS (
        SELECT item_category, transaction_date, revenue
        FROM \`${PROJECT}.raw.client_transactions\`
        WHERE location_id = @loc AND transaction_date BETWEEN @start AND @end AND item_category IS NOT NULL
      ),
      tot AS (SELECT SUM(revenue) AS ca_total, COUNT(DISTINCT transaction_date) AS n_days_total FROM l)
      SELECT item_category, SUM(revenue) AS ca, SAFE_DIVIDE(SUM(revenue), (SELECT ca_total FROM tot)) AS share,
             COUNT(DISTINCT transaction_date) AS n_days, (SELECT n_days_total FROM tot) AS n_days_total
      FROM l GROUP BY 1 ORDER BY ca DESC`,
    params: { loc: location_id, start: bq.date(start), end: bq.date(end) }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch((e: any) => { console.error("[top-familles]", e?.message); return []; });
  const n_days_total = rows.length ? num(rows[0].n_days_total) : 0;
  const familles: FamilleCA[] = (rows as any[]).map((r) => {
    const ca = num(r.ca), n = num(r.n_days);
    return { famille: String(flat(r.item_category)), ca, share: num(r.share), ca_jour: n_days_total > 0 ? ca / n_days_total : 0, n_days: n };
  });
  return { start, end, familles, n_days_total };
}

export function buildTopFamillesBlocks(r: TopFamillesReading, k: number): { headline: string; sections: any[]; sources: string[] } {
  const headline = `Vos familles de produits & services — du ${frD(r.start)} au ${frD(r.end)}`;
  if (!r.familles.length) {
    return { headline, sections: [{ facts: [`Aucune vente sur la période, du ${frD(r.start)} au ${frD(r.end)}.`] }], sources: ["Vos ventes quotidiennes (mesures par jour)"] };
  }
  const kk = Math.max(1, Math.min(k, r.familles.length));
  const top = r.familles.slice(0, kk), rest = r.familles.slice(kk);
  const rows = top.map((f, i) => ({ cells: [
    { v: f.famille, bold: true },
    { v: `${frEur(f.ca)} €` },
    { v: frShare(f.share) },
    { v: `${frEur(f.ca_jour)} €`, color: "#6B7280" },
  ] }));
  if (rest.length) {
    const ca = rest.reduce((a, f) => a + f.ca, 0), sh = rest.reduce((a, f) => a + f.share, 0);
    rows.push({ cells: [{ v: `Autres familles (${rest.length})`, bold: false, color: "#6B7280" } as any, { v: `${frEur(ca)} €` }, { v: frShare(sh) }, { v: `${frEur(r.n_days_total > 0 ? ca / r.n_days_total : 0)} €`, color: "#6B7280" }] });
  }
  const lead = top[0];
  return {
    headline,
    sections: [{
      title: `Les ${kk} premières au CA`,
      table: { cols: [{ label: "Famille", align: "left" }, { label: "CA" }, { label: "Part du CA" }, { label: "CA/jour" }], rows },
      facts: [`${r.familles.length} familles vendues sur ${r.n_days_total} jour${r.n_days_total > 1 ? "s" : ""} mesuré${r.n_days_total > 1 ? "s" : ""} · ${lead.famille} en tête : ${frEur(lead.ca)} €, ${frShare(lead.share)} du CA.`],
    }],
    sources: ["Vos ventes quotidiennes (mesures par jour)", "CA/jour = CA de la famille sur la période / jours mesurés de la période."],
  };
}
