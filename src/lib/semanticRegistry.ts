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
  kind: "pole" | "famille" | "operation" | "personne" | "composant";
  mot_fr: string;
  definition_fr: string;      // la définition business, voix owner (source : lexique/specs)
  relations_fr: string[];     // relations nommées — celles que les composeurs implémentent
}

export const ENTITY_TYPES: EntityTypeDef[] = [
  {
    kind: "pole",
    mot_fr: "pôle",
    definition_fr: "Dispositif PERMANENT du site (ex. pôle traiteur) : un périmètre de familles de produits ou de services, lu en continu, sans verdict. Un responsable est un attribut — le pôle demeure jusqu'à sa fermeture.",
    relations_fr: ["un pôle REGROUPE des familles (produits ou services)", "une opération peut être RATTACHÉE à un pôle"],
  },
  {
    kind: "famille",
    mot_fr: "famille",
    definition_fr: "Catégorie de PRODUITS OU DE SERVICES des ventes du site (item_category des transactions) — un service vendu est une famille au même titre qu'un produit.",
    relations_fr: ["une famille APPARTIENT à au plus un pôle"],
  },
  {
    kind: "operation",
    mot_fr: "opération",
    definition_fr: "Dispositif DATÉ ou récurrent (série) : des occurrences datées, un objectif dans UN KPI déclaré, un verdict par occurrence mesurée.",
    relations_fr: ["une opération A des occurrences datées", "une opération PEUT être rattachée à un pôle", "une occurrence mesurée PORTE un verdict dans le KPI déclaré"],
  },
  {
    kind: "composant",
    mot_fr: "composant",
    definition_fr: "Unité PHYSIQUE d'un dispositif permanent (pôle) : linéaire, gondole, tête de gondole, vitrine, point service / vente avec une personne, dispositif de médiation… Nommé par son libellé (« Linéaire poivres ») ou par son type. Ce qu'on photographie ; sa mémoire suit les versions du dispositif.",
    relations_fr: ["un composant APPARTIENT à un pôle", "un composant PORTE des articles (quand ils sont reconnus)"],
  },
  {
    kind: "personne",
    mot_fr: "responsable",
    definition_fr: "Personne de l'équipe qui mène des opérations (Responsable(s) des engagements, roster des canaux).",
    relations_fr: ["une personne MÈNE des opérations"],
  },
];

// ── Concepts transverses (owner 28/08 : « Dispositif is missing, KPI too ») — des concepts
// SANS instances propres, définis parce qu'ils changent la COMPRÉHENSION d'une question.
// La doctrine de RÉPONSE (corrélation ≠ causation, paliers causaux) ne vit pas ici : elle est
// appliquée par le code des réponses (registre causal, groundingChecks, lie-bait) — la mettre
// dans le résolveur ne changerait aucun routage et ferait dériver deux copies.
export interface ConceptDef { mot_fr: string; definition_fr: string }
export const CONCEPTS: ConceptDef[] = [
  {
    mot_fr: "dispositif",
    definition_fr: "Le mot-parapluie de ce que l'exploitant met en place pour vendre : un dispositif PERMANENT est un pôle, un dispositif DATÉ ou récurrent est une opération. « Mes dispositifs » sans autre précision = le journal.",
  },
  {
    mot_fr: "KPI",
    definition_fr: "L'indicateur qu'une opération DÉCLARE et que son verdict juge : chiffre d'affaires vs résultat habituel (revenue_residual), ventes/jour (transactions), panier moyen (basket), visiteurs (footfall), taux de conversion (conversion), CA d'une famille (family_revenue), profit estimé sur marges déclarées (profit_estimated). Chaque opération a LE sien — une question sans KPI nommé n'en choisit pas un.",
  },
  {
    mot_fr: "concurrent",
    definition_fr: "Un lieu EXTÉRIEUR suivi par la veille (jamais un pôle, une famille ni une opération du site). Une question sur un concurrent, la concurrence ou les événements autour du site = intent \"autre\" (la chaîne existante la porte).",
  },
];

// ── Intentions routables (v1) — chaque intention nomme SON composeur et SON producer ───────
export interface IntentDef {
  intent: "plan" | "entity_period" | "journal" | "pourquoi" | "idee" | "hors_perimetre"
    | "jour" | "bilan_periode" | "dimension" | "fenetre" | "entite_exterieure" | "evenement_lookup" | "mes_evenements" | "rapport"
    | "fiches" | "autre";
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
    definition_fr: "Lire les RÉSULTATS d'une ou plusieurs entités nommées (pôle, famille, opération, personne) sur une période (« le pôle traiteur depuis juin », « bilan du corner cet été », « les opérations de Julen en août »). Une OPÉRATION nommée AVEC une ou plusieurs FAMILLES (« l'impact du corner sur les ventes de la famille Coffee, le panier moyen ou le mix ») = l'effet de l'opération sur ces familles : mets les deux dans entites (l'opération ET chaque famille). Une opération sans période : laisse periode null, le système prend sa vie.",
    composer: "entityReading.readEntityPeriod + buildEntityPeriodBlocks",
    producer: "deterministic_entity_period_v1",
  },
  {
    intent: "journal",
    definition_fr: "Le journal des dispositifs/engagements du site sans entité précise (« mes engagements », « mes pôles », « qu'est-ce qui a marché ? »). Jamais pour « ça va mes ventes ? » ou « comment vont mes ventes ? » (c'est jour : le dernier jour mesuré).",
    composer: "branche JOURNAL_Q (engagementsFamily/journalPlan)",
    producer: "deterministic_engagements_v1",
  },
  {
    intent: "pourquoi",
    definition_fr: "L'utilisateur demande d'où vient le DERNIER résultat (« pourquoi ? », « explique », « d'où ça sort ? », « comment tu le calcules ? », « t'es sûr ? »). Hérite TOUT le cadre — ne change aucun slot.",
    composer: "entityReading.buildEntityWhyBlocks (re-lecture du dernier tuple)",
    producer: "deterministic_entity_why_v1",
  },
  {
    intent: "idee",
    definition_fr: "L'utilisateur SOUMET UNE IDÉE d'opération ou de dispositif et demande si/quand/comment la faire (« et si je faisais un marché nocturne ? », « je pense à un atelier dégustation, ça marcherait ? », « devrais-je proposer un menu du soir ? »). L'idée se place (fenêtres, conditions), s'entoure d'analogues mesurés, et se cadre en mise en test.",
    composer: "ideaPlacement.readIdeaPlacement + buildIdeaBlocks",
    producer: "deterministic_idee_v1",
  },
  {
    intent: "jour",
    definition_fr: "L'état ou l'explication d'UN jour du site : « pourquoi le 28/08 ? », « combien j'ai vendu hier ? », « ça va mes ventes ? » (= le dernier jour mesuré), « demain ? ». Un seul jour, passé, présent ou à venir — pas une période.",
    composer: "chemin jour (grounded day + familles)",
    producer: "grounded_day_claude",
  },
  {
    intent: "bilan_periode",
    definition_fr: "Le bilan CHIFFRÉ d'une période PASSÉE sans entité nommée : « c'était comment la semaine dernière ? », « bilan d'août », « mes ventes du mois dernier », « comment se sont passées mes journées ». Renvoie le rapport de la période avec son verdict.",
    composer: "renvoi rapport (_reportWindowEnd)",
    producer: "deterministic_report_nav_v1",
  },
  {
    intent: "dimension",
    definition_fr: "Une DIMENSION du commerce, sans date : « quand je vends le plus ? » (heures), « quels produits je vends le plus ? » (offre), « la météo pèse-t-elle sur mes ventes ? », « les musées autour me prennent-ils des clients ? » (concurrents suivis), « mon affluence ? », « les touristes ? ». Le système choisit la famille de lecture.",
    composer: "chemin jour, famille en tête (familiesForQuestion)",
    producer: "family_grounded_claude",
  },
  {
    intent: "fenetre",
    definition_fr: "Les JOURS À CHOISIR dans une période à venir ou en cours : « mes meilleurs jours en septembre », « quels jours éviter ce mois-ci », « les jours de forte activité dans mon périmètre », « top 3 dates ». Une fenêtre de jours, pas un plan complet (ça, c'est plan) et pas un bilan passé.",
    composer: "pipeline mois (top / pires / filtre)",
    producer: "v3_claude",
  },
  {
    intent: "entite_exterieure",
    definition_fr: "L'impact ou la découverte d'une entité EXTÉRIEURE au site, nommée mais absente des listes du site : un salon, un festival, un concurrent non suivi, une marque, un lieu (« l'impact de Vinexpo sur mes ventes ? », « c'est quoi le Festival d'Avignon pour moi ? »). Jamais pour une entité du site (ça, c'est entity_period).",
    composer: "branche ENTITY_IMPACT (web)",
    producer: "web_search",
  },
  {
    intent: "evenement_lookup",
    definition_fr: "Trouver DES ÉVÉNEMENTS de l'agenda local : « quels événements ce week-end ? », « quand a lieu la fête des vendanges ? », « y a-t-il un concert samedi près de chez moi ? », « Black Friday c'est quand ? ». Une recherche dans le calendrier, pas un verdict sur les ventes.",
    composer: "lookup événements",
    producer: "deterministic_lookup_event_ir_v1",
  },
  {
    intent: "mes_evenements",
    definition_fr: "LES ÉVÉNEMENTS OU LANCEMENTS DU SITE lui-même, en liste (« mes événements », « nos lancements », « mes opérations à venir ») — la liste, pas la lecture d'une opération nommée (entity_period) ni le journal des engagements (journal).",
    composer: "branche possessive « mes événements »",
    producer: "deterministic_evenements_v1",
  },
  {
    intent: "fiches",
    definition_fr: "Les FICHES de dispositifs documentés du site — les bonnes pratiques mémorisées, ce qui a marché et a été noté : « quelles bonnes pratiques ai-je documentées ? », « qu'est-ce qui a marché chez moi sur les jours de pluie ? », « mes dispositifs documentés ». Pas le journal des engagements (journal), pas une opération nommée (entity_period).",
    composer: "branche « bonnes pratiques » (listClassDispositifs)",
    producer: "deterministic_dispositifs_v1",
  },
  {
    intent: "rapport",
    definition_fr: "Le DOCUMENT rapport de ventes, demandé comme tel : « génère le rapport d'août », « le rapport de la semaine », « what were my sales in July? ». Renvoi vers le rapport imprimable de la période.",
    composer: "renvoi rapport",
    producer: "deterministic_report_nav_v1",
  },
  {
    intent: "hors_perimetre",
    definition_fr: "La question ne porte sur RIEN du site : ni ses ventes, ni ses jours, ni ses familles/pôles/opérations, ni ses suivis, ni la météo, le calendrier ou les événements autour de lui, ni un plan ou une idée pour lui. Culture générale (« qui est Jésus ? », « la capitale de l'Australie ? »), l'heure, une blague, une salutation seule (« bonjour », « merci »), une demande sans rapport avec un commerce. Le système répond par une phrase fixe qui dit ce qu'il sait du site — mais SEULEMENT si aucun signal métier n'est détecté par le code (garde déterministe) — le code protège, tu peux le poser franchement.",
    composer: "ai/horsPerimetre.signalMetier (garde) + horsPerimetreReponse",
    producer: "deterministic_hors_perimetre_v1",
  },
  {
    intent: "autre",
    definition_fr: "Tout le reste d'ordre MÉTIER (cartes, jours, météo, concurrence, recherche, questions ouvertes sur le commerce) — routé par la chaîne existante.",
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
      idee: {
        type: ["object", "null"],
        properties: {
          levier: { type: "string", enum: ["frequentation", "conversion", "panier", "yield", "fidelisation"] },
          condition: { type: "string", enum: ["rain", "heat", "school_holiday", "public_holiday", "tourism_peak", "calme", "aucune"] },
        },
        required: ["levier", "condition"],
        additionalProperties: false,
      },
      suite: { type: "boolean" },
      changements: { type: "array", items: { type: "string" }, maxItems: 6 },
      confiance: { type: "string", enum: ["haute", "basse"] },
      questions_supplementaires: { type: "array", items: { type: "string" }, maxItems: 3 },
    },
    required: ["intent", "entites", "periode", "periode_comparaison", "kpi", "suite", "changements", "confiance", "questions_supplementaires"],
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
    `Composants (unités physiques des pôles) : ${byKind("composant").join(" · ") || "(aucun)"}`,
  ].join("\n");
  const defs = ENTITY_TYPES.map((t) => `- ${t.mot_fr} (${t.kind}) : ${t.definition_fr}`).join("\n");
  const concepts = CONCEPTS.map((c) => `- ${c.mot_fr} : ${c.definition_fr}`).join("\n");
  const intents = INTENTS.map((i) => `- ${i.intent} : ${i.definition_fr}`).join("\n");
  return `Tu es le RÉSOLVEUR d'une plateforme d'intelligence commerciale française. Tu ne réponds JAMAIS à la question : tu remplis un formulaire structuré que le système exécutera de façon déterministe.

Date du jour : ${today}.

CONCEPTS (définitions business) :
${defs}
${concepts}

INTENTIONS :
${intents}

LES ENTITÉS RÉELLES DE CE SITE (seules valeurs légales pour "entites[].nom" — recopie EXACTE, jamais une invention ni une variante) :
${lists}

LE FORMULAIRE (réponds UNIQUEMENT ce JSON, exactement ces clés, sans fence markdown) :
{
  "intent": "plan" | "entity_period" | "journal" | "pourquoi" | "idee" | "jour" | "bilan_periode" | "dimension" | "fenetre" | "entite_exterieure" | "evenement_lookup" | "mes_evenements" | "rapport" | "fiches" | "hors_perimetre" | "autre",
  "entites": [ { "nom": "<recopie exacte d'une entité des listes>", "type": "pole" | "famille" | "operation" | "personne" | "composant" } ],
  "periode": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "expression": "<les mots de l'utilisateur>" } | null,
  "periode_comparaison": <même forme que periode> | null,
  "kpi": "revenue_residual" | "transactions" | "basket" | "footfall" | "conversion" | "family_revenue" | "profit_estimated" | null,
  "idee": null | { "levier": "frequentation" | "conversion" | "panier" | "yield" | "fidelisation", "condition": "rain" | "heat" | "school_holiday" | "public_holiday" | "tourism_peak" | "calme" | "aucune" },
  "suite": true | false,
  "changements": [ "<slots changés par ce tour>" ],
  "confiance": "haute" | "basse",
  "questions_supplementaires": [ "<les autres questions du message, mot pour mot>" ]
}

RÈGLES :
1. Ressors le tuple COMPLET à chaque tour. Si la question est une SUITE (« et octobre ? », « et pour X ? »), hérite du cadre précédent tout ce qu'elle ne change pas, et pose suite=true. « Et la famille X ? » / « et X ? » REMPLACE l'entité de même type du cadre (une famille chasse la famille précédente, l'opération reste) ; « et aussi X », « ajoute X », « X et Y » AJOUTENT.
2. Une CONTESTATION (« non, je parlais de X ») remplace le slot visé, garde le reste.
3. Les périodes : dates ISO exactes (start/end) + l'expression d'origine, recopiée telle quelle (le système la re-lit). « septembre » sans année = le prochain si l'intention est plan, le plus récent passé sinon. Conventions maison (identiques au parseur frPeriod) : « hier » = la veille, un seul jour (start = end) ; « avant-hier » = deux jours avant ; « la semaine dernière » = la semaine CIVILE précédente, du lundi au dimanche (jamais les 7 derniers jours) ; « le mois dernier » = le mois civil précédent ; « ce mois » = du 1er à aujourd'hui ; « les N derniers jours » = N jours finissant hier. Les saisons sont MÉTÉOROLOGIQUES (convention maison, identique au parseur frPeriod) : printemps = 01/03→31/05, été = 01/06→31/08, automne = 01/09→30/11, hiver = 01/12→28-29/02 (à cheval sur deux années).
4. Une entité absente des listes ci-dessus ne se devine pas : ne la mets PAS dans entites (le système demandera).
5. "changements" liste les slots que CE tour a changés par rapport au cadre (ex. ["periode"]). Aucun cadre fourni → tous les slots posés sont des changements.
6. "idee" SEULEMENT quand intent = "idee" : "levier" = ce que l'idée cherche à bouger (attirer du passage = frequentation ; faire acheter ceux qui passent = conversion ; augmenter le ticket = panier ; prix/remises = yield ; faire revenir = fidelisation) ; "condition" = la condition de jours que l'idée VISE si elle en nomme une (jours de pluie → rain, canicule → heat, vacances → school_holiday, féries → public_holiday, saison touristique → tourism_peak, périodes calmes → calme), sinon "aucune".
7. "periode_comparaison" SEULEMENT si la comparaison est DEMANDÉE (« vs », « par rapport à », « contre », « versus ») — un simple changement de période (« et en juin ? ») remplace "periode" et laisse "periode_comparaison" null.
8. Le KPI seulement s'il est NOMMÉ (CA, ventes, panier, visiteurs, conversion, marge/profit, CA famille produits & services) — sinon null.
9. Rien d'autre que le JSON du formulaire — pas de fence, pas de prose, la clé est "intent" (jamais "intention").
10. "confiance" = "basse" quand tu hésites entre deux intentions ou que la question est ambiguë. Le système vérifie de toute façon par le code qu'aucun signal métier n'est présent avant de répondre "hors_perimetre" — pose-le sans crainte quand la question ne parle pas du commerce (une salutation seule, l'heure, la culture générale).
11. UN MESSAGE, PLUSIEURS QUESTIONS (« … et aussi … », « … ; et … ») : remplis le formulaire pour la PREMIÈRE question seulement (son intention, SA période, SON KPI — jamais la période de la seconde), et recopie chaque autre question MOT POUR MOT dans "questions_supplementaires" (le système dira à l'utilisateur de la poser à part). Un seul sujet → [].`;
}
