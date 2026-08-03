// Porte chiffrée du mode ENQUÊTE « Reproduire le dispositif gagnant » (pièce 2b, spec
// docs/atelier-mecanismes-spec.md § Hiérarchie de l'enquête). Le contrat est plus simple que le
// grounded_day (pas de cited_fact_ids : la conversation est libre), mais la règle de fond est la
// même : AUCUN nombre qui ne vienne ni des FAITS du provider ni des mots de l'exploitant.
//
// Exemption bornée : les petits entiers SANS unité (« les 3 prochains pics annoncés », « une
// question à la fois ») — un test daté a besoin de compter sans que chaque compte soit un fait.
// Un nombre porteur d'unité (€, %, °C, km, min…) n'est JAMAIS exempté, quelle que soit sa taille :
// « une remise de 5 % » inventée doit tomber.
import { extractNumbers, extractNumbersWithUnits } from "./groundingChecks";

export type EnqueteFiche = { fact_fr: string; evidence_fr: string; test_fr: string };
export type EnqueteOutput = { say_fr: string; fiche: EnqueteFiche | null };

const SMALL_BARE_INT_MAX = 12;

export function validateEnqueteOutput(
  out: EnqueteOutput,
  factsText: string,
  userText: string,
): { ok: boolean; errors: string[] } {
  const allowed = new Set<string>([...extractNumbers(factsText), ...extractNumbers(userText)]);
  const surfaced = [out?.say_fr, out?.fiche?.fact_fr, out?.fiche?.evidence_fr, out?.fiche?.test_fr]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n");
  const errors: string[] = [];
  for (const n of extractNumbersWithUnits(surfaced)) {
    const key = String(n.v);
    if (allowed.has(key)) continue;
    if (n.unit === "" && Number.isInteger(n.v) && n.v <= SMALL_BARE_INT_MAX) continue;
    errors.push(`nombre non fondé : ${n.v}${n.unit ? " " + n.unit : ""}`);
  }
  return { ok: errors.length === 0, errors };
}
