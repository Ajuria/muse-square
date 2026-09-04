// src/lib/ai/horsPerimetre.ts
// I1 (spec docs/explorer-routage-inversion-spec.md § 3.4) — LA GARDE DÉTERMINISTE avant tout refus,
// et la réponse « hors périmètre » (option A, owner 03/09).
//
// Le résolveur (Haiku) dit `hors_perimetre` ; le code VÉRIFIE avant de refuser : si un seul signal
// déterministe tire — famille, date, période, lookup événement, entité du site, mot de KPI, journal,
// verbe de plan — la question est métier mal lue, et elle repart dans la chaîne (`autre`). Un refus
// sur une question métier coûte plus qu'une réponse approximative (audit 03/09 : « qui est Jésus ? »
// rendait un théâtre à Figeac ; « ça va mes ventes ? » DOIT rester métier).
//
// Pur et testé par mutation (horsPerimetre.test.ts) : aucun appel réseau ici — les détecteurs sont
// passés en paramètres, le foyer de chaque signal reste son fichier (insightFamilies, frPeriod,
// entityResolver, prompt.ts pour les regex legacy).

import { KPI_NOM_FR, KPI_LABEL_FR } from "../kpiRegistry";
import type { SiteEntities } from "../entityResolver";

export interface GardeDetecteurs {
  familles: (q: string) => number;              // familiesForQuestion(q).length
  dateToken: (q: string) => boolean;            // extractDateMentions(q).hasDateToken
  periode: (q: string) => boolean;              // resolveFrPeriod(q, {today}) != null
  lookupEvenement: (q: string) => boolean;      // isEventLookupQuestion(q)
  entites: (q: string) => number;               // matchEntities(q, site).length
  journal: (q: string) => boolean;              // JOURNAL_Q.test(q)
  plan: (q: string) => boolean;                 // verbes de plan (prompt.ts)
}

const norm = (s: string): string =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Les MOTS des KPI (kpiRegistry, LE foyer) + les mots métier qui les nomment en langue courante.
// Une question qui en porte un est une question métier, quoi qu'en dise le résolveur.
const MOTS_METIER = [
  ...Object.values(KPI_NOM_FR).map((k) => norm(k.nom)),
  ...Object.values(KPI_LABEL_FR).map(norm),
  "ca", "chiffre d'affaires", "chiffre d affaires", "vente", "ventes", "vendu", "vendre", "vends",
  "panier", "client", "clients", "visiteur", "visiteurs", "marge", "profit", "remise", "remises",
  "produit", "produits", "famille", "familles", "pole", "poles", "operation", "operations",
  "dispositif", "dispositifs", "engagement", "engagements", "concurrent", "concurrents", "concurrence",
  "suivi", "suivis", "veille", "meteo", "pluie", "chaleur", "canicule", "vacances", "ferie", "feries",
  "evenement", "evenements", "affluence", "frequentation", "rapport", "bilan", "journee", "journees",
  "jour", "jours", "semaine", "mois", "saison", "ete", "hiver", "printemps", "automne",
];

export function motMetierDans(q: string): string | null {
  const n = " " + norm(q) + " ";
  for (const m of MOTS_METIER) {
    if (!m) continue;
    if (n.includes(" " + m + " ") || n.includes(" " + m + "s ") || n.includes(" " + m + "?") || n.includes(" " + m + " ?")) return m;
  }
  return null;
}

/** null = aucun signal ⇒ le refus est permis ; sinon le nom du signal qui interdit le refus. */
export function signalMetier(q: string, d: GardeDetecteurs): string | null {
  if (d.familles(q) > 0) return "famille";
  if (d.entites(q) > 0) return "entite";
  if (d.dateToken(q)) return "date";
  if (d.periode(q)) return "periode";
  if (d.lookupEvenement(q)) return "lookup";
  if (d.journal(q)) return "journal";
  if (d.plan(q)) return "plan";
  const m = motMetierDans(q);
  if (m) return "mot:" + m;
  return null;
}

// ── La réponse (option A, owner 03/09) — miroir de l'élicitation approuvée sur cette surface
// (« Je ne trouve ni pôle ni famille de ce nom sur ce site. Vos pôles : … ») : un refus qui redit
// ce que CE compte contient (familles réelles) et la question de l'utilisateur, verbatim, puis une
// question que la page propose déjà (« Pourquoi le JJ/MM ? », slot état A de ie-prompt.js).
export const HORS_PERIMETRE_TITRE = "Aucune donnée pour cette question";

export function horsPerimetreReponse(opts: {
  qRaw: string;
  site: SiteEntities | null;
  /** « JJ/MM » du dernier jour mesuré, ou null → l'exemple météo (état C, approuvé). */
  dernierJourMesure: string | null;
}): { headline: string; answer: string } {
  const familles = (opts.site?.entities ?? []).filter((e) => e.kind === "famille").map((e) => e.name).slice(0, 3);
  const paren = familles.length ? ` (${familles.join(", ")}…)` : "";
  const q = String(opts.qRaw ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const exemple = opts.dernierJourMesure
    ? `Pourquoi le ${opts.dernierJourMesure} ?`
    : "Quel est l’effet de la météo sur mes ventes ?";
  return {
    headline: HORS_PERIMETRE_TITRE,
    answer: `Je réponds sur vos ventes par jour, vos familles de produits${paren}, vos pôles, vos opérations et vos suivis. Rien ici ne répond à « ${q} ». Par exemple : « ${exemple} »`,
  };
}
