// src/lib/fr/relecture.ts — LA RELECTURE MÉCANIQUE d'un texte de modèle (owner 12/09 : « language isn't always precise nor
// proper… how can we efficiently deal with it here and in other pages ? »).
//
// Le lexique fait loi sur toute chaîne visible ; un texte écrit par le modèle (Synthèse d'un Rapport, réponse d'Explorer)
// est une chaîne visible comme une autre. Ce module applique aux phrases du modèle les MÊMES gardes mécaniques que les
// tests appliquent à mes chaînes — MOTS_BANNIS (evenement.fr.ts) et TOURNURES_LLM (tournures.fr.ts) — phrase par
// phrase : une phrase fautive est RETIRÉE du texte montré, et la faute est rendue à l'appelant (la réponse la porte,
// la batterie la compte). Ce que le garde ne voit pas (règles 8-13 du lexique : la nuance) reste à la relecture
// humaine ; ce qu'il voit ne revient plus. Une faute refusée par l'owner s'ajoute à MOTS_BANNIS ou TOURNURES_LLM :
// elle est alors attrapée ICI aussi, sur toutes les surfaces qui relisent — un seul foyer.
import { MOTS_BANNIS } from "./evenement.fr";
import { TOURNURES_LLM } from "./tournures.fr";

export interface Faute { phrase: string; motif: string; faute: string }
export interface Relecture { texte: string; fautes: Faute[]; phrases_retirees: number }

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE_MOTS = Object.keys(MOTS_BANNIS).map((mot) => ({ mot, re: new RegExp(`(^|[^\\p{L}])${esc(mot)}([^\\p{L}]|$)`, "iu") }));

/** Les fautes d'UNE phrase : mots bannis (lexique) et tournures de machine. */
export function fautesDe(phrase: string): Faute[] {
  const out: Faute[] = [];
  const low = phrase.toLowerCase();
  for (const { mot, re } of RE_MOTS) if (re.test(phrase)) out.push({ phrase, motif: `« ${mot} »`, faute: MOTS_BANNIS[mot] });
  for (const t of TOURNURES_LLM) if (t.motif.test(low)) out.push({ phrase, motif: String(t.motif), faute: t.faute });
  return out;
}

/** Découpe en phrases (point, point d'exclamation, point d'interrogation, retour à la ligne) en gardant les séparateurs. */
export function phrasesDe(texte: string): string[] {
  return String(texte ?? "").split(/(?<=[.!?…])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Relit un texte de modèle : chaque phrase fautive est retirée, les autres sont gardées dans l'ordre (les paragraphes
 * se recollent par un retour à la ligne quand le texte en portait). Rend le texte relu et les fautes.
 */
export function relireTexte(texte: string): Relecture {
  const fautes: Faute[] = [];
  const paragraphes = String(texte ?? "").split(/\n{2,}/);
  const relus = paragraphes.map((para) => {
    const gardees: string[] = [];
    for (const ph of para.split(/(?<=[.!?…])\s+|\n+/).map((p) => p.trim()).filter(Boolean)) {
      const f = fautesDe(ph);
      if (f.length) fautes.push(...f); else gardees.push(ph);
    }
    return gardees.join(" ");
  }).filter(Boolean);
  const total = phrasesDe(texte).length;
  const gardees = relus.reduce((n, p) => n + phrasesDe(p).length, 0);
  return { texte: relus.join("\n\n"), fautes, phrases_retirees: Math.max(0, total - gardees) };
}
