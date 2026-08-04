// src/lib/ai/facts/buildEventFacts.ts
// =====================================================
// Événements de l'utilisateur → citable facts du chat Consulter (incrément 6, spec
// evenement-dossier § 7.6). Même patron que buildPracticeFacts : client propre, jamais de
// throw (l'appelant .catch vers []), fact_fr surfacés verbatim — la date, le type et la
// dernière mesure voyagent DANS la phrase. claim_type "observed" pour la fiche d'événement,
// "measured" quand la phrase porte l'écart € mesuré (residual — jamais recalculé ici).
// Borné à 5 événements.
// =====================================================
import { makeBQClient } from "../../bq";
import { listUserEvenements } from "../../insightFamilies/evenement";

const PROJECT = "muse-square-open-data";

export type EventFact = { fact_fr: string; claim_type: "observed" | "measured" };

const frD = (iso: string) => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};

export async function buildEventFacts(location_id: string, clerk_user_id: string | null): Promise<{ facts: EventFact[] }> {
  if (!clerk_user_id) return { facts: [] };
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const rows = await listUserEvenements(bq, location_id, clerk_user_id, 5);
  const facts: EventFact[] = [];
  for (const e of rows) {
    facts.push({
      fact_fr: `Votre événement « ${e.title} » (${e.type_label_fr || "type non renseigné"}${e.recurring ? `, récurrent — ${e.n_occurrences} occurrences` : ""})${e.next_date ? ` : prochaine occurrence le ${frD(e.next_date)}` : " : aucune occurrence à venir"}.`,
      claim_type: "observed",
    });
    if (e.last_measured) {
      facts.push({
        fact_fr: `Dernière occurrence mesurée de « ${e.title} » (${frD(e.last_measured.date)}) : CA ${e.last_measured.revenue} € contre ${e.last_measured.expected} € attendu du jour (écart ${e.last_measured.gap_eur >= 0 ? "+" : "-"}${Math.abs(e.last_measured.gap_eur)} €).`,
        claim_type: "measured",
      });
    }
  }
  return { facts };
}
