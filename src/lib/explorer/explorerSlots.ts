// src/lib/explorer/explorerSlots.ts — LE GUICHET DE LA MÉMOIRE (spec docs/explorer-etat-vide-spec.md,
// décisions owner 07/09). Pur : des lignes du compte → les cartes de l'état vide d'Explorer, classées
// par score = € de l'objet × ancienneté en jours. Aucun appel réseau ici ; l'endpoint
// insight/explorer-slots.ts lit et passe les lignes.
//
// Nature 1 (ce qui manque à la mémoire), sur `analytics.action_commitments` (dernier instantané par
// engagement — la même fenêtre ROW_NUMBER que commitments/index.ts) :
//   - bilan : status resolved, retro_worked nul ; € = |window_actual_revenue − window_expected_revenue|
//     (l'écart de la fenêtre) ; ancienneté = jours depuis resolved_at. Le clic ouvre la page de
//     l'engagement, dont le rail Documenter (POST /api/commitments/retro) ne se câble que sur une
//     opération terminée.
// PAS de carte « fait / pas fait » : doctrine owner 05/08 (pulse.astro, infobulle en prod) — « Si vous
// ne déclarez rien, l'action est considérée comme menée à l'échéance de la fenêtre — le verdict mesure
// alors son effet. » Le silence n'est pas un trou de mémoire ; seule l'exclusion explicite
// (« Pas menée ») compte, et elle ne se réclame pas.
// Décision owner 07/09 (§ 6.2) : creation_enjeu_eur_year vaut 0 sur tout le compte — c'est la FENÊTRE
// qui classe. Sans aucun chiffre : dernier, le plus ancien d'abord.
//   - note d'un jour inexpliqué (E3) : `semantic.vw_insight_event_day_residual`, |residual_z| ≥ 2 sur
//     30 jours, sans ligne dans `analytics.day_notes` ; € = |daily_revenue − expected_revenue| ;
//     ancienneté = jours depuis la date. La carte porte le champ de saisie (POST /api/insight/day-notes),
//     forme owner « Un souvenir ? Notez-le · sinon, laissez » ; une fois notée, la source ne la produit plus.
// Nature 2 (ce qui attend une décision — E2/E4, mots du lexique et du fil Agir, owner 07/09) :
//   - à ajuster : résolu, verdict manqué, aucun adjustment_move, aucune version suivante, ≤ 14 j ;
//   - à reconduire : résolu, verdict atteint, mêmes conditions ; € = |écart de la fenêtre| ;
//   - à préparer : occurrence de `raw.saved_item_dates` sous 7 jours, sans consigne ni engagement lié ;
//     € = kpi_target_eur, à défaut le CA moyen de ses occurrences passées ; ancienneté = 8 − jours restants ;
//   - alerte concurrent : `semantic.vw_insight_event_competitor_alerts` ≤ 7 j, niveau maximal, sans marque
//     « consulté » (= traitée) ; sans € : entity_threat_score classe dans le groupe sans chiffre.
// Un objet = une carte : rankSlots dédoublonne par objet_id (le bilan d'un engagement passe avant sa décision).
// Nature 3 (la question mesurée) reste au client : elle lit le monitor, même référentiel qu'avant.

import { SLOTS_FR } from "./explorerSlotsCopy.fr";

export interface CommitmentSlotRow {
  commitment_id: string;
  status: string | null;
  verdict: string | null;
  committed_action_text: string | null;
  saved_item_title: string | null;         // titre de l'opération liée (raw.saved_items), s'il y en a une
  window_start: string | null;             // YYYY-MM-DD
  window_end: string | null;
  window_days_expected: number | null;
  retro_worked: string | null;
  window_expected_revenue: number | null;
  window_actual_revenue: number | null;
  resolved_at: string | null;              // ISO
  threshold_basis?: string | null;         // 'pct' : l'objectif est un % déclaré (threshold_value)
  threshold_value?: number | null;
  measured_metric?: string | null;         // revenue_residual | family_revenue | transactions | basket | …
  saved_item_family?: string | null;       // raw.saved_items.kpi_family — la famille d'un objectif family_revenue
  action_done_status?: string | null;      // 'pas_encore' = déclarée non menée (owner 07/09 : remplace le verdict)
  adjustment_move?: string | null;         // E2 : le geste choisi (poursuivre/doubler/pivoter/stop)
  has_child?: number | boolean | null;     // E2 : une version suivante existe (parent_commitment_id = cet id)
}

export interface OccurrenceSlotRow {
  saved_item_id: string;
  date: string;                            // YYYY-MM-DD
  title: string | null;
  consigne_enabled: boolean | null;
  engagements_lies: number | null;         // engagements ouverts/en attente dont la fenêtre couvre la date
  kpi_target_eur: number | null;
  ca_moyen_passe: number | null;           // CA moyen des occurrences passées (vw_insight_event_day_residual)
}

export interface AlertSlotRow {
  competitor_alert_id: string;
  competitor_id: string | null;
  competitor_name: string | null;          // vw_insight_event_competitors_followed
  change_subtype: string | null;
  alert_level: number | null;
  event_label: string | null;
  affected_date: string | null;
  distance_m: number | null;
  entity_threat_score: number | null;
  created_at: string | null;
}

export interface DayNoteSlotRow {
  date: string;                            // YYYY-MM-DD
  daily_revenue: number | null;
  expected_revenue: number | null;
  residual_z: number | null;
  residual_pct: number | null;             // (réalisé − habituel) / habituel, en % — celui des faits du jour
}

export interface SlotCard {
  nature: "memoire" | "decision" | "question";
  kind: "bilan" | "note" | "ajuster" | "reconduire" | "preparer" | "alerte";
  key: string;                             // clé de marque « consulté » (action_log.change_subtype)
  date: string;                            // YYYY-MM-DD — la date de l'objet (marque consulté + tri)
  objet_id: string;
  score: number;
  enjeu_eur: number | null;
  anciennete_jours: number;
  text: string;
  sub: string;
  cta: string;
  href: string;                            // le rail ouvert par le clic ; vide quand la carte porte sa propre saisie (note)
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (v: any): string | null => { const s = flat(v); return s ? String(s).slice(0, 10) : null; };
const num = (v: any): number | null => { const x = flat(v); if (x == null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const frDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const jourFr = (iso: string): string => JOURS[new Date(iso + "T00:00:00Z").getUTCDay()];
const frSignedPct = (n: number): string => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))} %`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** « 4,2 km » / « 159 m » — la même forme que distLabel d'action-cards.js. */
const distLabel = (m: number | null): string => {
  if (m == null || !(m > 0)) return "";
  return m >= 1000 ? `${(Math.round(m / 100) / 10).toLocaleString("fr-FR")} km` : `${Math.round(m)} m`;
};
const daysBetween = (fromIso: string, toIso: string): number =>
  Math.max(0, Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86400000));

/** Le mot du verdict (owner 07/09) : « action non menée » quand elle est déclarée telle ; sinon
 *  « objectif de +20 % manqué » quand l'objectif est un % déclaré ; sinon le mot nu du lexique. */
export function verdictFr(r: Pick<CommitmentSlotRow, "verdict" | "threshold_basis" | "threshold_value" | "action_done_status" | "measured_metric" | "saved_item_family">): string {
  if (r.action_done_status === "pas_encore") return SLOTS_FR.action_non_menee;
  const v = String(r.verdict ?? "");
  const pct = num(r.threshold_value);
  const metric = String(r.measured_metric ?? "revenue_residual");
  const famille = (r.saved_item_family && String(r.saved_item_family).trim()) || null;
  if ((v === "met" || v === "missed") && r.threshold_basis === "pct" && pct != null) {
    if (metric === "revenue_residual") return SLOTS_FR.verdict_avec_objectif(frSignedPct(pct), v);
    if (metric === "family_revenue" && famille) return SLOTS_FR.verdict_avec_objectif(frSignedPct(pct), v, famille);
  }
  return SLOTS_FR.verdict[v] ?? SLOTS_FR.verdict.inconclusive;   // KPI sans mot owner : le verdict nu, jamais un % sur un KPI innommé
}

/** Le nom court de l'objet : le titre de l'opération liée, sinon la tête du texte d'engagement. */
export function shortTitle(r: Pick<CommitmentSlotRow, "committed_action_text" | "saved_item_title">): string {
  const t = (r.saved_item_title && String(r.saved_item_title).trim()) || String(r.committed_action_text ?? "").split(" — ")[0].trim();
  return t || "Engagement";
}

export function commitmentCandidates(rows: CommitmentSlotRow[], todayIso: string): SlotCard[] {
  const out: SlotCard[] = [];
  for (const raw of rows) {
    const r: CommitmentSlotRow = {
      ...raw,
      window_start: ymd(raw.window_start), window_end: ymd(raw.window_end), resolved_at: ymd(raw.resolved_at),
      window_expected_revenue: num(raw.window_expected_revenue), window_actual_revenue: num(raw.window_actual_revenue),
      window_days_expected: num(raw.window_days_expected),
    };
    if (r.status !== "resolved" || r.retro_worked != null) continue;
    const when = r.resolved_at || r.window_end || todayIso;
    const jours = daysBetween(when, todayIso);
    const ecart = r.window_actual_revenue != null && r.window_expected_revenue != null ? r.window_actual_revenue - r.window_expected_revenue : null;
    const nDays = r.window_days_expected ?? (r.window_start && r.window_end ? daysBetween(r.window_start, r.window_end) + 1 : 1);
    const ecartFr = ecart != null ? `${ecart >= 0 ? "+" : "−"}${frInt(Math.abs(ecart))} €` : "écart non mesuré";
    out.push({
      nature: "memoire", kind: "bilan", key: "explorer_slot_bilan", date: when, objet_id: r.commitment_id,
      score: Math.abs(ecart ?? 0) * jours, enjeu_eur: ecart != null ? Math.abs(ecart) : null, anciennete_jours: jours,
      text: SLOTS_FR.bilan_titre(shortTitle(r), verdictFr(r), ecartFr, Math.max(1, nDays)),
      sub: SLOTS_FR.bilan_sub,
      cta: SLOTS_FR.bilan_cta,
      href: `/app/insightevent/engagement?id=${encodeURIComponent(r.commitment_id)}`,
    });
  }
  return out;
}

/** E2 — verdict rendu, ni geste ni version suivante (≤ 14 jours) : manqué → à ajuster, atteint → à reconduire. */
export function decisionCandidates(rows: CommitmentSlotRow[], todayIso: string): SlotCard[] {
  const out: SlotCard[] = [];
  for (const raw of rows) {
    const resolvedAt = ymd(raw.resolved_at);
    const verdict = String(raw.verdict ?? "");
    if (raw.status !== "resolved" || !resolvedAt || (verdict !== "met" && verdict !== "missed")) continue;
    if (raw.adjustment_move != null || Number(raw.has_child ?? 0) > 0) continue;
    const jours = daysBetween(resolvedAt, todayIso);
    if (jours > 14) continue;
    const act = num(raw.window_actual_revenue), exp = num(raw.window_expected_revenue);
    const ecart = act != null && exp != null ? act - exp : null;
    const nDays = num(raw.window_days_expected) ?? (ymd(raw.window_start) && ymd(raw.window_end) ? daysBetween(ymd(raw.window_start)!, ymd(raw.window_end)!) + 1 : 1);
    const ecartFr = ecart != null ? `${ecart >= 0 ? "+" : "−"}${frInt(Math.abs(ecart))} €` : "écart non mesuré";
    const met = verdict === "met";
    out.push({
      nature: "decision", kind: met ? "reconduire" : "ajuster", key: met ? "explorer_slot_reconduire" : "explorer_slot_ajuster",
      date: resolvedAt, objet_id: raw.commitment_id,
      score: Math.abs(ecart ?? 0) * jours, enjeu_eur: ecart != null ? Math.abs(ecart) : null, anciennete_jours: jours,
      text: SLOTS_FR.bilan_titre(shortTitle(raw), verdictFr(raw), ecartFr, Math.max(1, nDays)),
      sub: met ? SLOTS_FR.reconduire_sub : SLOTS_FR.ajuster_sub,
      cta: met ? SLOTS_FR.reconduire_cta : SLOTS_FR.ajuster_cta,
      href: `/app/insightevent/engagement?id=${encodeURIComponent(raw.commitment_id)}`,
    });
  }
  return out;
}

/** E2 — occurrence sous 7 jours sans préparation (ni consigne, ni engagement lié). */
export function occurrenceCandidates(rows: OccurrenceSlotRow[], todayIso: string): SlotCard[] {
  const out: SlotCard[] = [];
  for (const raw of rows) {
    const date = ymd(raw.date);
    if (!date || date < todayIso) continue;
    const restants = daysBetween(todayIso, date);
    if (restants > 7) continue;
    if (raw.consigne_enabled === true || Number(raw.engagements_lies ?? 0) > 0) continue;
    const enjeu = num(raw.kpi_target_eur) ?? num(raw.ca_moyen_passe);
    const anciennete = 8 - restants;                       // plus c'est proche, plus ça pèse (1 … 8)
    const titre = (raw.title && String(raw.title).trim()) || "Occurrence";
    out.push({
      nature: "decision", kind: "preparer", key: "explorer_slot_preparer", date, objet_id: raw.saved_item_id,
      score: (enjeu ?? 0) * anciennete, enjeu_eur: enjeu, anciennete_jours: anciennete,
      text: SLOTS_FR.preparer_titre(titre),
      sub: SLOTS_FR.preparer_sub(cap(jourFr(date)), frDate(date)),
      cta: SLOTS_FR.preparer_cta,
      href: `/app/insightevent/evenement?saved_item_id=${encodeURIComponent(raw.saved_item_id)}`,
    });
  }
  return out;
}

/** E4 — l'alerte concurrent non traitée : niveau maximal des 7 derniers jours, jamais celles déjà
 *  consultées (la marque « consulté » vaut « traitée »). Sans € : le score de menace classe. */
export function alertCandidates(rows: AlertSlotRow[], todayIso: string, marks: ReadonlySet<string> = new Set()): SlotCard[] {
  const kept = rows.filter((r) => r.competitor_alert_id && !marks.has(markId(`explorer_slot_alerte:${r.competitor_alert_id}`, ymd(r.affected_date) ?? "")));
  const maxLevel = Math.max(-1, ...kept.map((r) => num(r.alert_level) ?? -1));
  const out: SlotCard[] = [];
  for (const r of kept) {
    if ((num(r.alert_level) ?? -1) < maxLevel) continue;
    const date = ymd(r.affected_date) ?? todayIso;
    const nom = (r.competitor_name && String(r.competitor_name).trim()) || "Concurrent";
    out.push({
      nature: "decision", kind: "alerte", key: `explorer_slot_alerte:${r.competitor_alert_id}`, date, objet_id: r.competitor_alert_id,
      score: num(r.entity_threat_score) ?? 0, enjeu_eur: null, anciennete_jours: r.created_at ? daysBetween(ymd(r.created_at)!, todayIso) : 0,
      text: SLOTS_FR.alerte_titre(nom, String(r.event_label ?? "").trim(), distLabel(num(r.distance_m))),
      sub: SLOTS_FR.alerte_sub(String(r.change_subtype ?? "").toLowerCase()),
      cta: SLOTS_FR.alerte_cta,
      href: r.competitor_id ? `/app/insightevent/competitor?id=${encodeURIComponent(r.competitor_id)}` : "",
    });
  }
  return out;
}

/** E3 — les jours inexpliqués sans note : une carte par jour, la saisie sur la carte. */
export function dayNoteCandidates(rows: DayNoteSlotRow[], todayIso: string): SlotCard[] {
  const out: SlotCard[] = [];
  for (const raw of rows) {
    const date = ymd(raw.date);
    const ca = num(raw.daily_revenue), exp = num(raw.expected_revenue), z = num(raw.residual_z), pct = num(raw.residual_pct);
    if (!date || ca == null || exp == null || z == null || pct == null || Math.abs(z) < 2 || date >= todayIso) continue;
    const jours = daysBetween(date, todayIso);
    const ecart = Math.abs(ca - exp);
    const jour = jourFr(date);
    out.push({
      nature: "memoire", kind: "note", key: "explorer_slot_note", date, objet_id: date,
      score: ecart * jours, enjeu_eur: ecart, anciennete_jours: jours,
      text: SLOTS_FR.note_titre(jour.charAt(0).toUpperCase() + jour.slice(1), frDate(date), frInt(ca), frSignedPct(pct)),
      sub: SLOTS_FR.note_sub,
      cta: SLOTS_FR.note_cta,
      href: "",
    });
  }
  return out;
}

/** La clé d'une marque « consulté » (action_log : change_subtype × affected_date), la même que le client. */
export const markId = (key: string, date: string): string => `${key}|${date}`;

/** Classement (§ 6.1-6.2) : score décroissant ; sans chiffre → dernier (score de menace, puis le plus ancien) ;
 *  au plus `max` cartes, jamais trois de la même nature. E5 (§ 4) : une carte déjà consultée sans
 *  réponse REDESCEND derrière celles qui ne l'ont pas été (sa source la produit encore : la réponse
 *  n'est pas venue) ; répondue, elle a disparu d'elle-même. `marks` = les clés markId consultées. */
export function rankSlots(cards: SlotCard[], max = 3, marks: ReadonlySet<string> = new Set()): SlotCard[] {
  const sorted = [...cards].sort((a, b) => {
    const aSeen = marks.has(markId(a.key, a.date)), bSeen = marks.has(markId(b.key, b.date));
    if (aSeen !== bSeen) return aSeen ? 1 : -1;
    const aHas = a.enjeu_eur != null && a.enjeu_eur > 0, bHas = b.enjeu_eur != null && b.enjeu_eur > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas) return b.score - a.score || b.anciennete_jours - a.anciennete_jours;
    return b.score - a.score || b.anciennete_jours - a.anciennete_jours;   // sans € : le score de menace, puis l'ancienneté
  });
  const out: SlotCard[] = [];
  const objets = new Set<string>();
  for (const c of sorted) {
    if (out.length >= max) break;
    if (objets.has(c.objet_id)) continue;                                               // un objet = une carte
    if (out.filter((x) => x.nature === c.nature).length >= 2 && max >= 3) continue;   // jamais 3 de la même nature
    out.push(c); objets.add(c.objet_id);
  }
  return out;
}
