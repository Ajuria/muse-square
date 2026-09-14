// src/lib/explorer/journeesComparees.ts — COMPARER DES JOURNÉES, en outil (docs/explorer-outil-spec.md § 7,
// dernière couche de prompt.ts ; owner 12/09 : « une capacité est un OUTIL, jamais une couche »).
//
// CE FICHIER NE CALCULE RIEN ET NE RÉDIGE RIEN. Le calcul est `compareDatesDeterministicV1` et la prose
// française est `renderLineItemsFrV1` — le pipeline v3, en place et testé, que la couche
// `deterministic_missing_dates_v1` de prompt.ts enveloppait. Ici, une seule chose : traduire ses
// `render_lines` en faits citables et en blocs du vocabulaire d'Explorer. Une copie du calcul serait une
// seconde vérité ; il n'y en a qu'une.
//
// L'ÉLICITATION DEVIENT UN BLOC. Sous deux dates, la couche rendait une question fabriquée à la main avec
// ses pastilles. C'est `composeJourneesElicitation` : le même geste, rendu par l'outil, donc soumis aux
// mêmes portes que le reste (la batterie le voit, la relecture le voit).
import type { AnswerBlock } from "./blocks";
import type { FactV1, RenderLineV1 } from "../ai/contracts/facts_v1";

export interface JourneesLecture {
  found: boolean;
  titre: string;
  facts: string[];
  blocks: AnswerBlock[];
}

/** PUR — la date en français ; l'ISO reste la valeur interne (CLAUDE.md § Localization). */
export const frJour = (ymd: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ymd || "");
};

const AUCUNE_MATIERE = "Aucune mesure sur ces journées — il n’y a rien à comparer.";

/**
 * PUR — les lignes rendues par le pipeline v3 deviennent des faits et des blocs.
 *
 * Ce qui compte ici et nulle part ailleurs : une ligne du v3 porte ses `fact_ids`, et une ligne SANS
 * ancrage est refusée en amont (`assertNoSentenceWithoutFactIdV1`). On garde cette propriété : chaque
 * ligne devient un fait citable, donc la porte de restitution d'Explorer peut la retrouver. Une ligne
 * qu'on résumerait ou reformulerait perdrait son ancre — on ne touche pas au texte.
 */
export function composeJourneesComparees(args: {
  dates: string[];
  render_lines: RenderLineV1[];
  facts_by_date: Record<string, FactV1[]>;
}): JourneesLecture {
  const dates = args.dates.map((d) => String(d).slice(0, 10)).filter(Boolean);
  const lignes = (args.render_lines ?? []).filter((l) => l && typeof l.text_fr === "string" && l.text_fr.trim());
  const titre = `Journées comparées : ${dates.map(frJour).join(", ")}`;
  if (!lignes.length) {
    return { found: false, titre, facts: [], blocks: [{ type: "absence", manque: AUCUNE_MATIERE, geste: null }] };
  }
  // Le texte du v3 part TEL QUEL : c'est lui qui porte les nombres et leur référentiel.
  const facts = lignes.map((l) => l.text_fr.trim());
  const tete = lignes.find((l) => l.kind === "headline") ?? null;
  const corps = lignes.filter((l) => l !== tete);
  const blocks: AnswerBlock[] = [];
  if (tete) blocks.push({ type: "headline", text: tete.text_fr.trim() });
  if (corps.length) blocks.push({ type: "facts", items: corps.map((l) => l.text_fr.trim()) });
  // Le compte des journées RÉELLEMENT mesurées — une date demandée sans ligne n'est pas une journée lue.
  const mesurees = dates.filter((d) => (args.facts_by_date?.[d] ?? []).length > 0);
  blocks.push({
    type: "sources",
    items: [`Vos journées mesurées (caisse, météo, calendrier, concurrence) — ${mesurees.length} journée${mesurees.length > 1 ? "s" : ""} sur ${dates.length} demandée${dates.length > 1 ? "s" : ""}`],
  });
  return { found: true, titre, facts, blocks };
}

/**
 * PUR — SOUS DEUX DATES, LA QUESTION. Ex-`deterministic_missing_dates_v1`. Les pastilles ne portent que des
 * dates que l'exploitant a DÉJÀ VUES (les jours saillants du fil) ou le week-end qui vient : on ne propose
 * jamais une date qu'on vient d'inventer. Aucun chiffre, aucune entité dans la question elle-même.
 */
export function composeJourneesElicitation(args: {
  jours_du_fil?: string[];
  aujourdhui: string;
}): JourneesLecture {
  const chips: Array<{ label_fr: string; send: string }> = [];
  const fil = (args.jours_du_fil ?? []).map((d) => String(d).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (fil.length >= 2) {
    const [d1, d2] = fil.slice(0, 2);
    chips.push({ label_fr: `Comparer le ${frJour(d1)} et le ${frJour(d2)}`, send: `Compare le ${frJour(d1)} et le ${frJour(d2)}` });
  }
  const sam = prochainJourDeSemaine(args.aujourdhui, 6);
  const dim = prochainJourDeSemaine(sam, 0);
  chips.push({ label_fr: `Comparer samedi ${frJour(sam)} et dimanche ${frJour(dim)}`, send: `Compare le ${frJour(sam)} et le ${frJour(dim)}` });
  const question = "Quelles journées voulez-vous comparer ?";
  return {
    found: false, titre: question,
    facts: [],
    blocks: [
      { type: "prose", md: `${question} Donnez deux dates au moins — dans le calendrier, en toutes lettres, ou en touchant une suggestion.` },
      { type: "clarification", chips },
    ],
  };
}

/** PUR — le prochain jour de semaine STRICTEMENT après `ymd` (0 = dimanche … 6 = samedi). */
export function prochainJourDeSemaine(ymd: string, cible: number): string {
  const d = new Date(String(ymd).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return String(ymd).slice(0, 10);
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== cible);
  return d.toISOString().slice(0, 10);
}

/** Le texte de repli, quand une surface n'affiche pas les blocs. */
export function journeesToText(l: JourneesLecture): string {
  return l.facts.length ? l.facts.join("\n") : (l.found ? l.titre : AUCUNE_MATIERE);
}
