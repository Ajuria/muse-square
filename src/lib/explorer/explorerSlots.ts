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
// Nature 2 (décisions) et la note-cause d'un jour arrivent avec leurs mots owner (E2, E3).
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
}

export interface SlotCard {
  nature: "memoire" | "decision" | "question";
  kind: "bilan";
  key: string;                             // clé de marque « consulté » (action_log.change_subtype)
  date: string;                            // YYYY-MM-DD — la date de l'objet (marque consulté + tri)
  objet_id: string;
  score: number;
  enjeu_eur: number | null;
  anciennete_jours: number;
  text: string;
  sub: string;
  cta: string;
  href: string;                            // le rail ouvert par le clic
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (v: any): string | null => { const s = flat(v); return s ? String(s).slice(0, 10) : null; };
const num = (v: any): number | null => { const x = flat(v); if (x == null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const daysBetween = (fromIso: string, toIso: string): number =>
  Math.max(0, Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86400000));

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
    const verdictFr = SLOTS_FR.verdict[String(r.verdict ?? "")] ?? SLOTS_FR.verdict.inconclusive;
    const ecartFr = ecart != null ? `${ecart >= 0 ? "+" : "−"}${frInt(Math.abs(ecart))} €` : "écart non mesuré";
    out.push({
      nature: "memoire", kind: "bilan", key: "explorer_slot_bilan", date: when, objet_id: r.commitment_id,
      score: Math.abs(ecart ?? 0) * jours, enjeu_eur: ecart != null ? Math.abs(ecart) : null, anciennete_jours: jours,
      text: SLOTS_FR.bilan_titre(shortTitle(r), verdictFr, ecartFr, Math.max(1, nDays)),
      sub: SLOTS_FR.bilan_sub,
      cta: SLOTS_FR.bilan_cta,
      href: `/app/insightevent/engagement?id=${encodeURIComponent(r.commitment_id)}`,
    });
  }
  return out;
}

/** Classement (§ 6.1-6.2) : score décroissant ; sans chiffre → dernier, le plus ancien d'abord ;
 *  au plus `max` cartes, jamais trois de la même nature. */
export function rankSlots(cards: SlotCard[], max = 3): SlotCard[] {
  const sorted = [...cards].sort((a, b) => {
    const aHas = a.enjeu_eur != null && a.enjeu_eur > 0, bHas = b.enjeu_eur != null && b.enjeu_eur > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas) return b.score - a.score || b.anciennete_jours - a.anciennete_jours;
    return b.anciennete_jours - a.anciennete_jours;
  });
  const out: SlotCard[] = [];
  for (const c of sorted) {
    if (out.length >= max) break;
    if (out.filter((x) => x.nature === c.nature).length >= 2 && max >= 3) continue;   // jamais 3 de la même nature
    out.push(c);
  }
  return out;
}
