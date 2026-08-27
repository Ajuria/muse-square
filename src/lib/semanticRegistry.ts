// src/lib/semanticRegistry.ts
// LE REGISTRE SÉMANTIQUE (ontologie légère, owner go 28/08) — l'assemblage machine-lisible
// de ce qui existait en pièces détachées : les MOTS (docs/lexique.md), les KPI (kpiRegistry),
// les instances (entityResolver — lues en base, jamais codées en dur), les périodes (frPeriod),
// les relations (implicites dans les composeurs, nommées ici).
// C'est la SEULE source du formulaire que remplit le résolveur LLM (ai/resolver.ts) : les
// définitions business du prompt système ET le schéma JSON en sont générés. Le LLM ne calcule
// jamais — il remplit ce formulaire ; les composeurs déterministes font tout le reste.
// Patron « semantic layer » (Cortex Analyst / Genie) : le modèle traduit la question en
// requête structurée contre des définitions gouvernées, l'exécution est déterministe.

import type { SiteEntities } from "./entityResolver";
import { KPI_NOM_FR, type KpiKey } from "./kpiRegistry";

// ── Types d'entités (les MOTS sont ceux du lexique — jamais réécrits ici) ──────────────────
export interface EntityTypeDef {
  kind: "pole" | "famille" | "operation" | "personne";
  mot_fr: string;
  definition_fr: string;      // la définition business, voix owner (source : lexique/specs)
  relations_fr: string[];     // relations nommées — celles que les composeurs implémentent
}

export const ENTITY_TYPES: EntityTypeDef[] = [
  {
    kind: "pole",
    mot_fr: "pôle",
    definition_fr: "Dispositif PERMANENT du site (ex. pôle traiteur) : un périmètre de familles produit, lu en continu, sans verdict. Un responsable est un attribut — le pôle demeure jusqu'à sa fermeture.",
    relations_fr: ["un pôle REGROUPE des familles produit", "une opération peut être RATTACHÉE à un pôle"],
  },
  {
    kind: "famille",
    mot_fr: "famille produit",
    definition_fr: "Catégorie de produits des ventes du site (item_category des transactions).",
    relations_fr: ["une famille APPARTIENT à au plus un pôle"],
  },
  {
    kind: "operation",
    mot_fr: "opération",
    definition_fr: "Dispositif DATÉ ou récurrent (série) : des occurrences datées, un objectif dans UN KPI déclaré, un verdict par occurrence mesurée.",
    relations_fr: ["une opération A des occurrences datées", "une opération PEUT être rattachée à un pôle", "une occurrence mesurée PORTE un verdict dans le KPI déclaré"],
  },
  {
    kind: "personne",
    mot_fr: "responsable",
    definition_fr: "Personne de l'équipe qui mène des opérations (Responsable(s) des engagements, roster des canaux).",
    relations_fr: ["une personne MÈNE des opérations"],
  },
];

// ── Intentions routables (v1) — chaque intention nomme SON composeur et SON producer ───────
export interface IntentDef {
  intent: "plan" | "entity_period" | "journal" | "autre";
  definition_fr: string;
  composer: string;   // le foyer déterministe qui calcule
  producer: string;   // le producer de la réponse (traçabilité)
}

export const INTENTS: IntentDef[] = [
  {
    intent: "plan",
    definition_fr: "Planifier/préparer/organiser une période À VENIR (« planifie-moi septembre », « et octobre ? » en suite d'un plan). Rend le diagnostic puis le plan semaine par semaine.",
    composer: "planPeriod.planPeriod + buildPlanBlocks",
    producer: "deterministic_plan_period_v1",
  },
  {
    intent: "entity_period",
    definition_fr: "Lire les RÉSULTATS d'une ou plusieurs entités nommées (pôle, famille, opération, personne) sur une période (« le pôle traiteur depuis juin », « bilan du corner cet été », « les opérations de Julen en août »).",
    composer: "entityReading.readEntityPeriod + buildEntityPeriodBlocks",
    producer: "deterministic_entity_period_v1",
  },
  {
    intent: "journal",
    definition_fr: "Le journal des dispositifs/engagements du site sans entité précise (« mes engagements », « mes pôles », « qu'est-ce qui a marché ? »).",
    composer: "branche JOURNAL_Q (engagementsFamily/journalPlan)",
    producer: "deterministic_engagements_v1",
  },
  {
    intent: "autre",
    definition_fr: "Tout le reste (cartes, jours, météo, concurrence, recherche, questions ouvertes) — routé par la chaîne existante.",
    composer: "chaîne legacy de prompt.ts",
    producer: "(inchangé)",
  },
];

// ── Le formulaire du résolveur : schéma JSON généré depuis le registre ─────────────────────
// Tuple COMPLET à chaque tour (best practice dialogue state tracking) : c'est le LLM qui
// décide de l'héritage/du remplacement — le code VALIDE (listes réelles, dates bornées) et
// TRACE le diff. Le cadre ne porte jamais un fait ni un chiffre.
export function resolverSchema(): Record<string, any> {
  const period = {
    type: ["object", "null"],
    properties: {
      start: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      end: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      expression: { type: "string" },
    },
    required: ["start", "end", "expression"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      intent: { type: "string", enum: INTENTS.map((i) => i.intent) },
      entites: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            nom: { type: "string" },
            type: { type: "string", enum: ENTITY_TYPES.map((t) => t.kind) },
          },
          required: ["nom", "type"],
          additionalProperties: false,
        },
      },
      periode: period,
      periode_comparaison: period,
      kpi: { type: ["string", "null"], enum: [...(Object.keys(KPI_NOM_FR) as KpiKey[]), null] },
      suite: { type: "boolean" },
      changements: { type: "array", items: { type: "string" }, maxItems: 6 },
    },
    required: ["intent", "entites", "periode", "periode_comparaison", "kpi", "suite", "changements"],
    additionalProperties: false,
  };
}

// ── Le prompt système du résolveur — généré : définitions du registre + instances RÉELLES ──
export function resolverSystemPrompt(site: SiteEntities, today: string): string {
  const byKind = (k: string) => site.entities.filter((e) => e.kind === k).map((e) => e.name);
  const lists = [
    `Pôles du site : ${byKind("pole").join(" · ") || "(aucun)"}`,
    `Familles produit : ${byKind("famille").join(" · ") || "(aucune)"}`,
    `Opérations : ${byKind("operation").join(" · ") || "(aucune)"}`,
    `Personnes : ${byKind("personne").join(" · ") || "(aucune)"}`,
  ].join("\n");
  const defs = ENTITY_TYPES.map((t) => `- ${t.mot_fr} (${t.kind}) : ${t.definition_fr}`).join("\n");
  const intents = INTENTS.map((i) => `- ${i.intent} : ${i.definition_fr}`).join("\n");
  return `Tu es le RÉSOLVEUR d'une plateforme d'intelligence commerciale française. Tu ne réponds JAMAIS à la question : tu remplis un formulaire structuré que le système exécutera de façon déterministe.

Date du jour : ${today}.

CONCEPTS (définitions business) :
${defs}

INTENTIONS :
${intents}

LES ENTITÉS RÉELLES DE CE SITE (seules valeurs légales pour "entites[].nom" — recopie EXACTE, jamais une invention ni une variante) :
${lists}

LE FORMULAIRE (réponds UNIQUEMENT ce JSON, exactement ces clés, sans fence markdown) :
{
  "intent": "plan" | "entity_period" | "journal" | "autre",
  "entites": [ { "nom": "<recopie exacte d'une entité des listes>", "type": "pole" | "famille" | "operation" | "personne" } ],
  "periode": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "expression": "<les mots de l'utilisateur>" } | null,
  "periode_comparaison": <même forme que periode> | null,
  "kpi": "revenue_residual" | "transactions" | "basket" | "footfall" | "conversion" | "family_revenue" | "profit_estimated" | null,
  "suite": true | false,
  "changements": [ "<slots changés par ce tour>" ]
}

RÈGLES :
1. Ressors le tuple COMPLET à chaque tour. Si la question est une SUITE (« et octobre ? », « et pour X ? »), hérite du cadre précédent tout ce qu'elle ne change pas, et pose suite=true.
2. Une CONTESTATION (« non, je parlais de X ») remplace le slot visé, garde le reste.
3. Les périodes : dates ISO exactes (start/end) + l'expression d'origine. « septembre » sans année = le prochain si l'intention est plan, le plus récent passé sinon. Les saisons sont MÉTÉOROLOGIQUES (convention maison, identique au parseur frPeriod) : printemps = 01/03→31/05, été = 01/06→31/08, automne = 01/09→30/11, hiver = 01/12→28-29/02 (à cheval sur deux années).
4. Une entité absente des listes ci-dessus ne se devine pas : ne la mets PAS dans entites (le système demandera).
5. "changements" liste les slots que CE tour a changés par rapport au cadre (ex. ["periode"]). Aucun cadre fourni → tous les slots posés sont des changements.
6. Le KPI seulement s'il est NOMMÉ (CA, ventes, panier, visiteurs, conversion, marge/profit, CA famille) — sinon null.
7. Rien d'autre que le JSON du formulaire — pas de fence, pas de prose, la clé est "intent" (jamais "intention").`;
}
