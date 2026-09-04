// La lecture d'une photo de composant (spec docs/dispositifs-typologie-spec.md § 5.3, owner 03/09).
// Une photo, un appel ; la réponse est un FORMULAIRE imposé (output_config.format), jamais de la
// prose : pour chaque question de la check-list du type (et du rôle), oui / non / non_visible ;
// les articles reconnus par leur CODE dans la liste du site ; les prix lisibles ; la couverture ;
// et si une personne est visible — auquel cas l'appelant EFFACE l'image sans rien écrire.
// La consigne et le schéma sont générés depuis le registre (dispositifTypes) : aucune question,
// aucun code n'existe ici en dur. La porte (contracts/photoExtractionChecks) rejette toute clé
// hors registre et tout code hors liste — lie-bait dans le même commit.
import { checklistFor, type ChecklistQuestion } from "../dispositifs/dispositifTypes";

export const PHOTO_PROMPT_VERSION = "photo_extract_v1";

export interface SiteItem { item_code: string; item_description: string }
export interface PhotoExtractionInput { type: string; role: string | null; items: SiteItem[] }
export type PhotoAnswer = "oui" | "non" | "non_visible";
export interface PhotoExtractionOutput {
  person_visible: boolean;
  coverage: "entier" | "partiel" | "non_visible";
  checklist: Record<string, PhotoAnswer>;
  items: Array<{ item_code: string; confidence: "haute" | "moyenne" | "faible" }>;
  prices: Array<{ label: string; price_eur: number; item_code: string | null }>;
}

export function photoQuestions(inp: Pick<PhotoExtractionInput, "type" | "role">): ChecklistQuestion[] {
  return checklistFor(inp.type, inp.role);
}

// Le schéma JSON de la réponse — les clés de la check-list sont ÉNUMÉRÉES (additionalProperties
// false) : le modèle ne peut ni en inventer ni en omettre. Pas de maxItems : output_config.format
// le refuse (400 mesuré le 03/09) — la borne de taille vit dans la porte.
export function photoExtractionSchema(questions: ChecklistQuestion[]): Record<string, any> {
  const answer = { type: "string", enum: ["oui", "non", "non_visible"] };
  const checklistProps: Record<string, any> = {};
  for (const q of questions) checklistProps[q.key] = answer;
  return {
    type: "object",
    properties: {
      person_visible: { type: "boolean" },
      coverage: { type: "string", enum: ["entier", "partiel", "non_visible"] },
      checklist: { type: "object", properties: checklistProps, required: questions.map((q) => q.key), additionalProperties: false },
      items: {
        type: "array",
        items: { type: "object", properties: { item_code: { type: "string" }, confidence: { type: "string", enum: ["haute", "moyenne", "faible"] } }, required: ["item_code", "confidence"], additionalProperties: false },
      },
      prices: {
        type: "array",
        items: { type: "object", properties: { label: { type: "string" }, price_eur: { type: "number" }, item_code: { type: ["string", "null"] } }, required: ["label", "price_eur", "item_code"], additionalProperties: false },
      },
    },
    required: ["person_visible", "coverage", "checklist", "items", "prices"],
    additionalProperties: false,
  };
}

// La consigne système — stable pour un (type, rôle, liste d'articles) donné, donc cachable.
export function photoExtractionSystem(inp: PhotoExtractionInput, questions: ChecklistQuestion[]): string {
  const qs = questions.map((q) => `- ${q.key} : ${q.question_fr}`).join("\n");
  const items = inp.items.length
    ? inp.items.map((i) => `- ${i.item_code} — ${i.item_description}`).join("\n")
    : "(aucun article connu pour ce site)";
  return `Tu lis UNE photo d'un composant de magasin (type : ${inp.type}${inp.role ? `, rôle : ${inp.role}` : ""}) et tu remplis un formulaire. Tu ne décris pas, tu ne conseilles pas, tu n'inventes rien.

RÈGLES
1. Réponds à chaque question par « oui » si la photo le MONTRE, « non » si la photo montre le contraire, « non_visible » si la photo ne permet pas de trancher. Dans le doute : non_visible.
2. Les articles reconnus sont désignés UNIQUEMENT par un code de la liste ci-dessous (recopie exacte). Un produit visible qui n'est dans aucune ligne de la liste n'est PAS reporté. La confiance dit si l'étiquette ou l'emballage est lisible (haute), reconnaissable (moyenne) ou deviné (faible).
3. Les prix : seulement ceux LISIBLES sur une étiquette, en euros, avec le libellé lu tel quel ; item_code seulement si l'étiquette est celle d'un article de la liste, sinon null.
4. coverage : « entier » si tout le composant est dans le cadre, « partiel » s'il déborde, « non_visible » si ce n'est pas un composant de magasin.
5. person_visible : true dès qu'une personne, un visage ou une silhouette est visible, même de dos ou floue.

QUESTIONS (clé : question)
${qs}

ARTICLES DU SITE (code — désignation)
${items}`;
}
