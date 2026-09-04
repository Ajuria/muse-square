// src/lib/explorer/journalPlan.ts
// J2.2 — CROISER LE SIGNAL AVEC LE JOURNAL : « ce jour-là réunit les conditions où votre
// dispositif X a été prouvé ». C'est la capacité 2 de la boucle agent (owner 26/08).
//
// CE QUE LA MESURE A IMPOSÉ (27/08, avant d'écrire) : sur TOUT le parc il existe exactement UN
// effet prouvé (|z| >= 1), et il est NÉGATIF. Le seul verdict `met` de la base a |z| < 1 —
// objectif atteint, effet non prouvé. `mart.fct_location_commitment_learning.is_proven_lift` est
// `cast(null as bool)` PAR CONSTRUCTION : la colonne sur laquelle ce plan devait s'appuyer ne dit
// rien. La branche POSITIVE est donc écrite mais MUETTE aujourd'hui — elle s'allumera au premier
// verdict positif au-delà du seuil, sans code de plus. La branche NÉGATIVE, elle, est vivante :
// c'est la CONTRE-INDICATION (lexique l.17 — « un dispositif à effet négatif prouvé ne se rejoue
// jamais sur son signal »).
//
// UNE SEULE DÉFINITION DES CONDITIONS : les prédicats viennent de `sensitivityFeatures.json`, le
// registre que `commitmentResolve` utilise déjà pour écrire `window_active_factors`. « a tourné
// sous chaleur » (au passé) et « ce jour sera sous chaleur » (à venir) sont donc la MÊME règle
// contre la MÊME table — jamais une seconde définition.
import featureRegistry from "../sensitivityFeatures.json";
import { commitmentEffect } from "../commitments/commitmentEffect";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const CTX = `${PROJECT}.${(featureRegistry as any).context_table}`;

// Seuil de preuve d'effet — arbitrage owner 27/08 (lexique l.17), le même que la carte journal.
const PROOF_Z = 1;

const FACTORS = (featureRegistry.revenue as Array<{ key: string; fittable?: boolean; predicate?: string }>)
  .filter((f) => f.fittable && f.predicate && f.predicate !== "FALSE");

// Les mots des conditions, côté exploitant. Un facteur sans mot n'est PAS rendu : on ne montre
// jamais une clé technique en phrase.
const FACTOR_FR: Record<string, string> = {
  heat: "forte chaleur",
  rain: "pluie",
  cold: "froid",
  wind: "vent",
  snow: "neige",
  school_holiday: "vacances scolaires",
  public_holiday: "jour férié",
  tourism_peak: "pic touristique",
  mobility_disruption: "perturbation des transports",
};

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (v: any): string => String(flat(v) ?? "").slice(0, 10);
const frDate = (iso: string): string =>
  iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
const frPct = (n: number): string =>
  `${n >= 0 ? "+" : "−"}${String(Math.round(Math.abs(n) * 10) / 10).replace(".", ",")} %`;

export interface PlanItem {
  date: string;
  date_fr: string;
  conditions: string[];        // les mots des conditions communes
  dispositif: string;
  direction: "negative" | "positive";
  evidence_pct: number;
  evidence_date_fr: string;
  running_until_fr: string | null;
  say_fr: string;
  // J2.3 — de quoi PRÉ-REMPLIR un engagement quand le plan propose un rejeu. Le seuil n'est
  // volontairement PAS pré-rempli : `commit-form.js` calcule son point de départ sur les données
  // réelles du lieu (« Modeste réel »), ce qui vaut mieux qu'une cible que j'inventerais.
  prefill: { committed_action_text: string; window_kind: "day_of" | "7d" | "14d" | "30d" } | null;
}

// La fenêtre du rejeu est celle du test PROUVÉ — on ne réinvente pas une durée. Les valeurs sont
// celles que `public/commit-form.js` accepte (`opts.prefill.window_kind`).
function windowKind(start: string, end: string): "day_of" | "7d" | "14d" | "30d" {
  const a = Date.parse(start + "T00:00:00Z"), b = Date.parse(end + "T00:00:00Z");
  const days = Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) + 1 : 1;
  if (days <= 1) return "day_of";
  if (days <= 7) return "7d";
  if (days <= 14) return "14d";
  return "30d";
}

function dispositifName(s: string | null): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return (t.split(/\s+[—–-]\s+/)[0].trim() || t).slice(0, 60);
}

// Le lecteur des FACTEURS PAR JOUR — LA définition des conditions (sensitivityFeatures ×
// fct_location_context_daily), extraite du croisement pour être partagée avec le plan de
// période. Une plage explicite {start,end} OU l'horizon {horizonDays} depuis aujourd'hui.
export async function listDayFactors(
  bq: any,
  location_id: string,
  win: { start: string; end: string } | { horizonDays: number },
): Promise<Array<{ date: any } & Record<string, any>>> {
  const cols = FACTORS.map((f) => `(${f.predicate}) AS f_${f.key}`).join(",\n             ");
  const byRange = "start" in win;
  const [days] = await bq.query({
    query: `
      SELECT date, ${cols}
      FROM \`${CTX}\`
      WHERE location_id = @location_id
        AND date BETWEEN ${byRange ? "@s" : "CURRENT_DATE()"} AND ${byRange ? "@e" : "DATE_ADD(CURRENT_DATE(), INTERVAL @h DAY)"}
      ORDER BY date`,
    params: byRange
      ? { location_id, s: bq.date((win as any).start), e: bq.date((win as any).end) }
      : { location_id, h: (win as any).horizonDays },
    types: byRange ? { location_id: "STRING" } : { location_id: "STRING", h: "INT64" },
    location: "EU",
  });
  return Array.isArray(days) ? (days as any[]) : [];
}

// Les clés de facteurs actives d'une ligne listDayFactors, et leur mot exploitant.
export function dayFactorKeys(d: any): string[] {
  return FACTORS.filter((f) => {
    const v = (d as any)[`f_${f.key}`];
    return (v && typeof v === "object" && "value" in v ? v.value : v) === true;
  }).map((f) => f.key);
}
export function factorFr(key: string): string | null {
  return FACTOR_FR[key] ?? null;
}

// range (plan de période, 27/08) : borne EXPLICITE [start..end] — le plan d'une période à
// venir croise les mêmes conditions sur SES jours. Sans range : l'horizon 14 j historique.
export async function journalPlan(
  bq: any,
  location_id: string,
  horizonDays = 14,
  range?: { start: string; end: string },
): Promise<PlanItem[]> {
  // 1) Les dispositifs dont l'effet est PROUVÉ, avec les conditions de leur test.
  const [rows] = await bq.query({
    query: `
      SELECT committed_action_text, dispositif_id, window_active_factors, window_residual_pct, window_residual_z,
             measured_metric, kpi_baseline, kpi_window_value, kpi_delta_pct, kpi_noise_se,
             window_start, window_end, status
      FROM (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY commitment_id
          ORDER BY updated_at DESC,
                   CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC,
                   (verdict IS NOT NULL) DESC, created_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE location_id = @location_id
      )
      WHERE rn = 1 AND status IN ('open','resolved')`,
    params: { location_id },
    types: { location_id: "STRING" },
    location: "EU",
  });
  const all = Array.isArray(rows) ? rows : [];

  const proven = all
    .filter((r: any) => {
      // L'effet — et donc la PREUVE — se lit sur le KPI choisi du test, jamais d'office sur le
      // résidu de CA (correctif owner 27/08, foyer unique commitmentEffect).
      const z = commitmentEffect(r).z;
      return String(flat(r.status)) === "resolved" && z != null && Math.abs(z) >= PROOF_Z;
    })
    .map((r: any) => ({
      name: dispositifName(flat(r.committed_action_text)),
      chain: String(flat(r.dispositif_id) ?? "") || null,
      factors: String(flat(r.window_active_factors) ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      pct: commitmentEffect(r).pct as number,
      z: commitmentEffect(r).z as number,
      kpi_mention_fr: commitmentEffect(r).kpi_mention_fr,
      date: ymd(r.window_start),
      window_kind: windowKind(ymd(r.window_start), ymd(r.window_end)),
    }))
    .filter((p) => p.name && p.factors.length);

  if (!proven.length) return [];

  // Un test EN COURS du même dispositif : c'est ce qui rend la contre-indication urgente.
  // Clé = la CHAÎNE (dispositif_id) d'abord — deux dispositifs homonymes ne se contaminent
  // plus ; repli sur le nom pour l'historique sans chaîne.
  const runningUntil = new Map<string, string>();
  for (const r of all) {
    if (String(flat(r.status)) !== "open") continue;
    const until = ymd(r.window_end ?? r.window_start);
    const chain = String(flat(r.dispositif_id) ?? "");
    if (chain) runningUntil.set(chain, until);
    const n = dispositifName(flat(r.committed_action_text));
    if (n) runningUntil.set("name:" + n, until);
  }

  // 2) Les conditions des jours À VENIR — le lecteur partagé (mêmes prédicats, même table).
  // Le croisement ne propose que des jours À VENIR : la plage est bornée à aujourd'hui ICI
  // (listDayFactors reste fidèle — une lecture passée est légitime ailleurs).
  const todayIso = new Date().toISOString().slice(0, 10);
  const days = await listDayFactors(bq, location_id, range ? { start: range.start > todayIso ? range.start : todayIso, end: range.end } : { horizonDays });

  // 3) Le croisement. Règle CONSERVATRICE : le jour à venir doit réunir TOUTES les conditions du
  // test prouvé — « les conditions où il a été prouvé », jamais « une condition qui s'en approche ».
  const out: PlanItem[] = [];
  for (const d of days) {
    const dayFactors = new Set(FACTORS.filter((f) => flat((d as any)[`f_${f.key}`]) === true).map((f) => f.key));
    for (const p of proven) {
      if (!p.factors.every((f) => dayFactors.has(f))) continue;
      const mots = p.factors.map((f) => FACTOR_FR[f]).filter(Boolean);
      if (!mots.length) continue;     // conditions sans mot : on se tait plutôt que d'afficher une clé
      const negative = p.z < 0;
      const until = (p.chain ? runningUntil.get(p.chain) : null) ?? runningUntil.get("name:" + p.name) ?? null;
      const date = ymd(d.date);
      out.push({
        date,
        date_fr: frDate(date),
        conditions: mots,
        dispositif: p.name,
        direction: negative ? "negative" : "positive",
        evidence_pct: p.pct,
        evidence_date_fr: frDate(p.date),
        running_until_fr: until ? frDate(until) : null,
        prefill: negative ? null : { committed_action_text: p.name, window_kind: p.window_kind },
        say_fr: negative
          ? `Le ${frDate(date)} réunit ${mots.join(" et ")} — les conditions où « ${p.name} » a prouvé un effet négatif (${frPct(p.pct)}${p.kpi_mention_fr ? ` ${p.kpi_mention_fr}` : ""} vs votre résultat habituel, le ${frDate(p.date)}). Ne pas le rejouer ce jour-là.${until ? ` Or un test est en cours jusqu'au ${frDate(until)}.` : ""}`
          : `Le ${frDate(date)} réunit ${mots.join(" et ")} — les conditions où « ${p.name} » a prouvé un effet positif (${frPct(p.pct)}${p.kpi_mention_fr ? ` ${p.kpi_mention_fr}` : ""} vs votre résultat habituel, le ${frDate(p.date)}). C'est le jour pour le rejouer.`,
      });
    }
  }
  return out;
}
