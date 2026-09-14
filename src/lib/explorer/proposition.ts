// src/lib/explorer/proposition.ts — LA PROPOSITION D'OPÉRATION (docs/explorer-outil-spec.md § 4 `proposer_operation`, § 5
// bloc `proposition_operation`, incrément 6 ; lexique l. 127 : « Proposition d'opération », le geste « Préparer l'opération → »).
//
// PUR. L'agent ne crée jamais une opération : il en PRÉPARE une, à partir de faits qu'il a LUS dans le même tour, et
// l'exploitant décide — « Préparer l'opération → » ouvre le formulaire existant (event-form.js) pré-rempli, dont le CTA
// final reste « Créer l'opération — … ». Ce que le module garantit :
//   · le « pourquoi » n'est fait QUE de phrases dont chaque nombre existe dans les faits des outils du tour (la porte
//     de groundAgentText, appliquée ligne par ligne) — une phrase qui invente un chiffre tombe, et c'est dit au modèle ;
//     sans aucun fait retenu, pas de proposition (lire d'abord) ;
//   · le nom et le dispositif passent la relecture mécanique (mots bannis, tournures de machine, commandes/stock) ;
//   · les familles sont celles du site, les dates sont à venir (7 au plus, la limite du formulaire), l'objectif est un
//     KPI que le formulaire connaît, la cible est un nombre positif dans l'unité du KPI.
import { extractNumbers } from "../ai/contracts/groundingChecks";
import { fautesDe } from "../fr/relecture";
import type { EventTypeOption } from "../events/eventTypes";

export type ObjectifKpi = "revenue_residual" | "family_revenue" | "tickets" | "basket";
export const OBJECTIFS: ObjectifKpi[] = ["revenue_residual", "family_revenue", "tickets", "basket"];
/** Les libellés du formulaire (event-form.js, options du KPI), raccourcis pour la carte. */
export const OBJECTIF_FR: Record<ObjectifKpi, string> = {
  revenue_residual: "CA du jour vs votre résultat habituel",
  family_revenue: "CA de ce que le dispositif vend vs votre résultat habituel",
  tickets: "Nombre de ventes vs votre résultat habituel",
  basket: "Panier moyen vs votre résultat habituel",
};
export const DATES_MAX = 7;
export const TITRE_MAX = 120;
export const DISPOSITIF_MAX = 240;

export interface PropositionBlock {
  type: "proposition_operation";
  titre: string;
  dispositif: string;
  event_type: { value: string; label_fr: string };
  familles: string[];
  objectif: { kpi: ObjectifKpi; libelle_fr: string };
  cible: { valeur: number; unite: "%" | "€"; libelle_fr: string };
  dates: string[];
  dates_fr: string;
  /** Les faits lus qui la motivent — chacun vérifié contre les faits du tour. */
  pourquoi: string[];
  /** « Préparer l'opération → » : le formulaire pré-rempli, rien n'est créé. */
  url: string;
}

export interface PropositionInput {
  titre?: unknown; dispositif?: unknown; type?: unknown; familles?: unknown; objectif?: unknown; cible?: unknown; dates?: unknown; pourquoi?: unknown;
}
export interface PropositionContexte {
  location_id: string;
  today: string;                 // AAAA-MM-JJ, Paris
  familles_site: string[];       // les familles vendues du site (lire_familles)
  types: EventTypeOption[];      // les types d'opération du métier du site
  faits_du_tour: string[];       // les faits rendus par les outils déjà appelés dans ce tour
}
export interface PropositionResultat { block: PropositionBlock; facts: string[]; texte: string; non_retenu: string[] }
export type PropositionErreur = { erreur: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const frDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const cle = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const propre = (x: unknown, max: number): string => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const liste = (x: unknown): string[] => (Array.isArray(x) ? x : typeof x === "string" ? x.split(/[,;\n]/) : []).map((v) => String(v ?? "").trim()).filter(Boolean);

/** Les dates en français : « le samedi 19/09/2026 », « les 19/09/2026 et 20/09/2026 ». */
export function datesFr(dates: string[]): string {
  if (dates.length === 1) return `le ${frDate(dates[0])}`;
  return `les ${dates.slice(0, -1).map(frDate).join(", ")} et ${frDate(dates[dates.length - 1])}`;
}

/**
 * Une ligne de « pourquoi » est retenue si (a) chacun de ses nombres existe dans les faits du tour, et (b) elle porte au
 * moins un nombre OU reprend mot pour mot un fait du tour. Une opinion sans chiffre n'est pas un fait.
 */
export function pourquoiRetenu(lignes: string[], faits: string[]): { retenues: string[]; ecartees: string[] } {
  const permis = new Set<string>();
  for (const f of faits) for (const n of extractNumbers(f)) permis.add(n);
  const faitsCle = new Set(faits.map(cle));
  const retenues: string[] = [], ecartees: string[] = [];
  for (const l of lignes) {
    const nombres = [...extractNumbers(l)];
    const ok = nombres.length ? nombres.every((n) => permis.has(n)) : faitsCle.has(cle(l));
    (ok ? retenues : ecartees).push(l);
  }
  return { retenues, ecartees };
}

export function composerProposition(inp: PropositionInput, ctx: PropositionContexte): PropositionResultat | PropositionErreur {
  const titre = propre(inp.titre, TITRE_MAX);
  if (!titre) return { erreur: "Le nom de l'opération est requis." };
  const dispositif = propre(inp.dispositif, DISPOSITIF_MAX);
  if (!dispositif) return { erreur: "Le dispositif est requis : ce que l'exploitant va faire, en une phrase." };
  const fautes = [...fautesDe(titre), ...fautesDe(dispositif)];
  if (fautes.length) return { erreur: `Le nom ou le dispositif ne passe pas la relecture : ${fautes.map((f) => `${f.motif} — ${f.faute}`).join(" ; ")}. Reformule.` };

  const typeValue = propre(inp.type, 60) || "autre";
  const type = ctx.types.find((t) => t.value === typeValue) ?? ctx.types.find((t) => cle(t.label_fr) === cle(typeValue));
  if (!type) return { erreur: `Type d'opération inconnu « ${typeValue} ». Types de ce métier : ${ctx.types.map((t) => `${t.value} (${t.label_fr})`).join(", ")}.` };

  const famillesDemandees = liste(inp.familles);
  const familles: string[] = [];
  for (const f of famillesDemandees) {
    const hit = ctx.familles_site.find((s) => cle(s) === cle(f));
    if (!hit) return { erreur: `Famille inconnue sur ce site : « ${f} ». Familles vendues : ${ctx.familles_site.join(", ") || "aucune lue — appelle lire_familles"}.` };
    if (!familles.includes(hit)) familles.push(hit);
  }

  const kpi = (propre(inp.objectif, 40) || (familles.length ? "family_revenue" : "revenue_residual")) as ObjectifKpi;
  if (!OBJECTIFS.includes(kpi)) return { erreur: `Objectif inconnu « ${kpi} » : revenue_residual, family_revenue, tickets ou basket.` };
  if (kpi === "family_revenue" && !familles.length) return { erreur: "L'objectif « CA de ce que le dispositif vend » demande au moins une famille." };
  const unite: "%" | "€" = kpi === "family_revenue" ? "€" : "%";
  const cibleN = Number(inp.cible ?? (unite === "%" ? 15 : NaN));
  if (!Number.isFinite(cibleN) || cibleN <= 0) return { erreur: unite === "€" ? "La cible est un montant en euros (le CA visé des familles sur la journée), positif." : "La cible est un pourcentage positif au-dessus du résultat habituel." };
  const cible = { valeur: Math.round(cibleN * 100) / 100, unite, libelle_fr: unite === "€" ? `${Math.round(cibleN).toLocaleString("fr-FR")} € visés sur la journée` : `+${String(Math.round(cibleN * 10) / 10).replace(".", ",")} % vs votre résultat habituel` };

  const dates = [...new Set(liste(inp.dates))].sort();
  if (!dates.length) return { erreur: "Au moins une date, AAAA-MM-JJ, à venir." };
  if (dates.length > DATES_MAX) return { erreur: `${DATES_MAX} dates au plus (la limite du formulaire).` };
  for (const d of dates) {
    if (!ISO.test(d)) return { erreur: `Date invalide « ${d} » : AAAA-MM-JJ.` };
    if (d < ctx.today) return { erreur: `La date ${frDate(d)} est passée : une opération se prépare pour un jour à venir (aujourd'hui : ${frDate(ctx.today)}).` };
  }

  const { retenues, ecartees } = pourquoiRetenu(liste(inp.pourquoi), ctx.faits_du_tour);
  if (!retenues.length) {
    return { erreur: `Aucun fait lu ne motive cette proposition${ecartees.length ? ` (${ecartees.length} phrase(s) écartée(s) : leurs chiffres ne viennent d'aucun outil de ce tour)` : ""}. Lis d'abord (lire_ventes, lire_familles_face_aux_jours, lire_poles_classement…) puis reprends leurs phrases telles quelles dans « pourquoi ».` };
  }

  const p = new URLSearchParams();
  p.set("location_id", ctx.location_id); p.set("new", "1");
  p.set("titre", titre); p.set("dispositif", dispositif); p.set("type", type.value);
  p.set("dates", dates.join(",")); p.set("kpi", kpi); p.set("cible", String(cible.valeur));
  if (familles.length) p.set("familles", familles.join(","));
  const url = `/app/insightevent/evenement?${p.toString()}`;
  const dates_fr = datesFr(dates);
  const block: PropositionBlock = { type: "proposition_operation", titre, dispositif, event_type: { value: type.value, label_fr: type.label_fr }, familles, objectif: { kpi, libelle_fr: OBJECTIF_FR[kpi] }, cible, dates, dates_fr, pourquoi: retenues, url };
  const facts = [
    `Proposition d'opération « ${titre} » (${type.label_fr}) ${dates_fr}${familles.length ? `, sur ${familles.length > 1 ? "les familles" : "la famille"} ${familles.map((f) => `« ${f} »`).join(", ")}` : ""} — objectif : ${OBJECTIF_FR[kpi]}, cible ${cible.libelle_fr}.`,
    ...retenues,
  ];
  const texte = [
    facts[0],
    `Dispositif : ${dispositif}`,
    `Pourquoi (faits lus) :\n${retenues.map((r) => `• ${r}`).join("\n")}`,
    ecartees.length ? `Non retenu (chiffres absents des lectures de ce tour) : ${ecartees.map((e) => `« ${e} »`).join(" ; ")}` : "",
    "Rien n'est créé : l'exploitant voit la carte et « Préparer l'opération → » ouvre le formulaire pré-rempli ; il décide.",
  ].filter(Boolean).join("\n");
  return { block, facts, texte, non_retenu: ecartees };
}

