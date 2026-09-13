// src/lib/fr/saisies.fr.guard.test.ts — LE GARDE DES DEMANDES DE SAISIE (CLAUDE.md § copie, règle 8, owner 13/09 :
// « ça n'a aucun intérêt pour l'utilisateur… Back to your llm crap »).
//
// Trois récidives le MÊME jour, même forme : « Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes. »,
// « … la mesure ne le dit pas : votre bilan le garde pour le prochain X », « La photo garde votre agencement : ce qui est
// groupé avec quoi, ce qui est à hauteur d'œil, ce qui a changé depuis la version précédente. » Chacune ÉNUMÈRE ce que
// l'app capte, ou nomme le MÉCANISME ; aucune ne dit ce que l'exploitant y gagne. Une promesse de ne plus recommencer ne
// suffit pas (règle 1) : ce fichier est la porte.
//
// CE QU'IL GARDE : toute chaîne qui DEMANDE une saisie (la sous-ligne d'une carte de bilan, la question d'une note, la
// ligne d'un bloc de photos). Pas les intitulés de champ ni les boutons — un groupe nominal y est à sa place.
import { describe, expect, it } from "vitest";
import { EVOL_COPY, retroGainFr, type RetroEtat } from "../commitments/commitmentCopy";
import { SLOTS_FR } from "../explorer/explorerSlotsCopy.fr";

const LONG = "Corner de vente producteur samedi matin devant la boutique";   // > TITRE_COURT_MAX : les gabarits « _sans »
/** Le REGISTRE : toute demande de saisie visible, avec sa clé. Une demande nouvelle s'ajoute ICI le jour où elle est écrite. */
export const SAISIES_FR: Array<{ cle: string; texte: string }> = [
  ...(["met", "missed", "non_menee", "inconclusive"] as RetroEtat[]).flatMap((etat) => [
    { cle: `retro_gain_${etat}`, texte: retroGainFr(etat, "−394 €", "Corner de vente producteur") },
    { cle: `retro_gain_${etat} (titre long)`, texte: retroGainFr(etat, null, LONG) },
  ]),
  // La MÊME ligne rendue par l'Explorer (état vide) — un seul foyer, mais la porte s'applique aux deux entrées.
  { cle: "bilan_sub", texte: SLOTS_FR.bilan_sub("missed", "−394 €", "Corner de vente producteur") },
  { cle: "note_sub", texte: SLOTS_FR.note_sub },
  // 13/09 — la demande de photo de composant, ratifiée par l'owner APRÈS deux refus et après la livraison de
  // la surface qui tient sa promesse (l'historique du dispositif). Elle passe la même porte que les autres.
  { cle: "pole_components_hint", texte: String(EVOL_COPY.pole_components_hint) },
];
// HORS registre, et c'est voulu : `retro_line_q_*` et `retro_line_ph` sont l'INTITULÉ et le gabarit du champ
// (« Ce qui a marché », « En une ligne ») — un groupe nominal y est à sa place, et « en une ligne » dit la taille du champ,
// pas un argument. La faute de la règle 8 est de mettre ce temps DANS la promesse ; `EVOL_COPY` reste importé pour le jour
// où une demande nouvelle y naît.

// (a) Le MÉCANISME : ce que l'app fait de la saisie n'est jamais l'argument.
const MECANIQUE = [
  { re: /\b(relu|relue|relus|relues|repris|reprise|gard(e|é|ée|er|ons)|attach(é|ée|e)|enregistr(é|ée|e)|conserv(é|ée|e)|aliment(e|er))\b/i, faute: "dit ce que l'app fait de la saisie, pas ce que l'exploitant y gagne" },
  { re: /\b(la mesure ne (voit|le dit) pas|ce que la mesure)\b/i, faute: "décrit le trou de la mesure — l'exploitant s'en moque, il veut ce qu'il pourra faire" },
  { re: /\b(votre mémoire|mémoire opérationnelle|base de connaissance)\b/i, faute: "nomme le magasin de données, pas le gain" },
];
// (b) Le TEMPS comme argument, en tête : il se dit après le gain, jamais à sa place.
const TEMPS_EN_TETE = /^[^.!?]{0,40}\b(\d+\s*(minutes?|min)|en une ligne|rapide)\b/i;
// (c) L'ÉNUMÉRATION de ce qui est capté : trois membres « ce qui … , ce qui … , ce qui … » (le motif des trois fautes).
const ENUMERATION = /(\bce qui\b|\bce que\b)[^,;—]*[,;—][^,;—]*(\bce qui\b|\bce que\b)[^,;—]*[,;—]/i;

/** PUR — les fautes d'UNE demande de saisie (le même patron que fautesDe, sur d'autres motifs). */
export function fautesDeSaisie(texte: string): string[] {
  const out: string[] = [];
  for (const m of MECANIQUE) if (m.re.test(texte)) out.push(m.faute);
  if (TEMPS_EN_TETE.test(texte)) out.push("le temps annoncé avant le gain (« 2 minutes ») — il se dit après, jamais à la place");
  if (ENUMERATION.test(texte)) out.push("énumère ce que l'app capte (trois membres) au lieu de nommer le gain");
  return out;
}

describe("règle 8 — une demande de saisie dit ce que l'exploitant POURRA FAIRE", () => {
  it("le garde attrape les TROIS fautes du 13/09, mot pour mot", () => {
    expect(fautesDeSaisie("Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes.").length).toBeGreaterThan(0);
    expect(fautesDeSaisie("Manqué — ce qui n'a pas marché et ce que vous changeriez, la mesure ne le dit pas : votre bilan le garde pour le prochain « Corner de vente producteur ».").length).toBeGreaterThan(0);
    expect(fautesDeSaisie("La photo garde votre agencement : ce qui est groupé avec quoi, ce qui est à hauteur d'œil, ce qui a changé depuis la version précédente.").length).toBeGreaterThan(0);
    // Et celles que l'owner a refusées comme slogans le 13/09 restent du ressort du lexique (images) — pas de doublon ici.
  });

  it("aucune demande de saisie en vigueur ne porte de mécanique, de temps en tête ni d'énumération", () => {
    const fautives = SAISIES_FR.map((s) => ({ ...s, fautes: fautesDeSaisie(s.texte) })).filter((s) => s.fautes.length);
    expect(fautives.map((f) => `${f.cle} : « ${f.texte} » — ${f.fautes.join(" ; ")}`), "Règle 8 (CLAUDE.md § copie) : dites ce que l'exploitant pourra faire.").toEqual([]);
  });

  it("aucune demande n'a pour SUJET un objet de l'app en train d'agir (« Votre bilan ajoute », « La photo garde »)", () => {
    const APP_SUJET = /(^|[.:;—]\s*)(votre|le|la|les|l['’])\s*(bilan|note|photo|application|app|fiche|historique|mémoire)\s+[a-zà-ÿ]+(e|ent|é|era|ont)\b/i;
    const fautives = SAISIES_FR.filter((s) => APP_SUJET.test(s.texte));
    expect(fautives.map((s) => `${s.cle} : « ${s.texte} »`), "Le sujet d'une demande est l'exploitant ou ce qu'il obtient — jamais l'app qui range.").toEqual([]);
    // Le garde tombe sur les deux formes refusées le 13/09 :
    expect(APP_SUJET.test("Votre bilan ajoute ce que la mesure ne voit pas.")).toBe(true);
    expect(APP_SUJET.test("La photo garde votre agencement : ce qui est groupé avec quoi.")).toBe(true);
  });
});
