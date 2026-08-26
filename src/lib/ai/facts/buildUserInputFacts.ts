// src/lib/ai/facts/buildUserInputFacts.ts
// =====================================================
// Entrées utilisateur → citable facts du chat Consulter (incrément app du chantier
// « entrées utilisateur -> semantic », 27/08). Le chat savait les ventes de l'exploitant
// mais pas ses DÉCISIONS : une règle d'automatisation active, un bilan déclaré après un
// événement — des choses qu'il aurait re-proposées ou ignorées (règle R2 appliquée aux
// gestes de l'exploitant).
//
// Même patron que buildPracticeFacts : client propre, jamais de throw (l'appelant .catch
// vers []), fact_fr surfacés verbatim. claim_type "observed" partout : ce sont des
// DÉCLARATIONS de l'exploitant présentes en base, jamais des mesures — le registre causal
// ne s'y déverrouille pas. Origin « declarations » (Vos déclarations), mot existant du
// catalogue factOrigins — rien d'inventé.
//
// Sources : les surfaces semantic créées par les incréments 2-3 (chaînes en VUES,
// fraîcheur de session) — jamais analytics en direct (frontière warehouseBoundary).
//
// LEXIQUE — tous les libellés sont REPRIS des surfaces qui les affichent déjà :
//   - catégories/canaux d'automatisation : CAT_LABELS + CH_LABELS de profile.astro
//     (l. 2661/2664, la page qui rend les règles) ;
//   - clés de bilan : le bloc « Pour mémoire » d'evenement.astro (l. 1014-1017).
// Une clé hors de ces cartes sort TELLE QUELLE (passthrough, comme profile.astro) —
// jamais un libellé deviné.
// Volontairement ABSENT : la ventilation « Pas pour moi » par type de carte
// (vw_insight_event_card_dispositions) — action_type est une clé technique sans mot
// owner pour la nommer en phrase ; 0 clic en base au 27/08. Concept sans mot => on
// demande LE mot avant d'écrire (décision en attente, voir priorités du chantier).
// =====================================================
import { makeBQClient } from "../../bq";

const PROJECT = "muse-square-open-data";

export type UserInputFact = { fact_fr: string; claim_type: "observed" };

// profile.astro l. 2661/2664 — la surface qui rend les règles. Copies conformes.
const CAT_LABELS: Record<string, string> = {
  weather: "Météo", competition: "Concurrence", mobility: "Mobilité",
  opportunity: "Opportunité", calendar: "Calendrier",
};
const CH_LABELS: Record<string, string> = {
  gbp: "GBP", instagram: "Instagram", email: "Email", sms: "SMS",
  whatsapp: "WhatsApp", slack: "Slack", internal: "Interne", phone: "Téléphone",
};
// evenement.astro l. 1014-1017 (« Pour mémoire ») — copies conformes.
const ATT_LABELS: Record<string, string> = {
  beyond: "fréquentation au-delà des attentes", conforme: "fréquentation conforme",
  endeca: "fréquentation en deçà",
};
const WEATHER_LABELS: Record<string, string> = {
  conforme: "météo conforme", mieux: "météo meilleure que prévu", pire: "météo pire que prévu",
};

const frD = (iso: string) => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};

export async function buildUserInputFacts(location_id: string): Promise<{ facts: UserInputFact[] }> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [autoRows, bilanRows] = await Promise.all([
    bq.query({
      query: `SELECT signal_category, channel, recipient, require_approval
              FROM \`${PROJECT}.semantic.vw_insight_event_automation_rules\`
              WHERE location_id = @location_id AND enabled
              ORDER BY signal_category LIMIT 5`,
      params: { location_id }, location: "EU",
    }).then((r: any[]) => r[0] ?? []).catch(() => []),
    bq.query({
      query: `SELECT b.selected_date, b.satisfaction, b.attendance_vs_expect, b.weather_accuracy,
                     b.free_comment, e.title
              FROM \`${PROJECT}.semantic.vw_insight_event_user_event_bilans\` b
              LEFT JOIN \`${PROJECT}.semantic.vw_insight_event_user_events\` e
                ON e.saved_item_id = b.saved_item_id
              WHERE b.location_id = @location_id
              ORDER BY b.submitted_at DESC LIMIT 3`,
      params: { location_id }, location: "EU",
    }).then((r: any[]) => r[0] ?? []).catch(() => []),
  ]);

  const facts: UserInputFact[] = [];
  for (const r of autoRows as any[]) {
    const cat = CAT_LABELS[String(r.signal_category)] ?? String(r.signal_category ?? "");
    const ch = CH_LABELS[String(r.channel)] ?? String(r.channel ?? "");
    facts.push({
      fact_fr: `Règle d'automatisation active chez vous : les signaux ${cat} partent par ${ch}${r.recipient ? ` à ${r.recipient}` : ""}${r.require_approval ? ", avec votre approbation avant envoi" : ""}.`,
      claim_type: "observed",
    });
  }
  for (const r of bilanRows as any[]) {
    const d = frD(String((r.selected_date && (r.selected_date as any).value) ?? r.selected_date ?? ""));
    const parts: string[] = [];
    const att = r.attendance_vs_expect ? (ATT_LABELS[String(r.attendance_vs_expect)] ?? String(r.attendance_vs_expect)) : "";
    const wx = r.weather_accuracy ? (WEATHER_LABELS[String(r.weather_accuracy)] ?? String(r.weather_accuracy)) : "";
    if (att) parts.push(att);
    if (wx) parts.push(wx);
    if (r.free_comment && String(r.free_comment).trim()) parts.push(`votre note : « ${String(r.free_comment).trim().slice(0, 120)} »`);
    if (!parts.length) continue;
    facts.push({
      fact_fr: `Votre bilan déclaré du ${d}${r.title ? ` sur « ${r.title} »` : ""} : ${parts.join(", ")} — votre ressenti, pas une mesure.`,
      claim_type: "observed",
    });
  }
  return { facts };
}
