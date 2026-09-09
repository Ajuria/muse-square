// Le SITE nommé dans une question d'Explorer (« génère le rapport pour Sèvres ») — 09/09 (owner :
// « the wrong location report »). Le renvoi rapport prenait toujours le site courant de la session ;
// un compte à plusieurs sites ne pouvait pas en désigner un par son nom.
//
// Règle : on cherche dans la question les mots DISTINCTIFS du libellé de chaque site (≥ 4 lettres,
// accents et casse ignorés, mots génériques exclus : « muse », « square », « maison », « site »…).
// Un seul site avec le meilleur score → il est désigné ; égalité ou aucun mot → null, l'appelant
// garde le site de la session. Jamais une devinette : « Muse Square » seul ne départage pas
// « Muse Square » de « Muse Square Occitanie ».

export interface SiteLabel { location_id: string; label: string }

const GENERIC = new Set(["muse", "square", "maison", "site", "boutique", "magasin", "epicerie", "épicerie", "test", "demo", "démo"]);

function norm(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchSiteInQuestion(question: string, sites: SiteLabel[]): string | null {
  const q = " " + norm(question) + " ";
  if (!q.trim() || !Array.isArray(sites) || sites.length < 2) return null;
  let best: { id: string; score: number }[] = [];
  for (const s of sites) {
    const tokens = norm(s.label).split(" ").filter((t) => t.length >= 4 && !GENERIC.has(t));
    const score = tokens.filter((t) => q.indexOf(" " + t + " ") >= 0).length;
    if (score > 0) best.push({ id: String(s.location_id), score });
  }
  if (!best.length) return null;
  const top = Math.max(...best.map((b) => b.score));
  const winners = best.filter((b) => b.score === top);
  return winners.length === 1 ? winners[0].id : null;
}
