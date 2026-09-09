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

// 09/09 après-midi (owner : « Wrong location again in Explorer ») — la résolution ne vivait que sur le
// renvoi rapport : « quels produits je vends le plus sur mon site Sèvres » répondait le mix du site de
// session en l'appelant Sèvres. Désormais UNE résolution en tête de la route, pour toutes les branches.
// Un aller-retour BQ (libellés des sites du compte), seulement sur un compte à plusieurs sites ; le site
// désigné doit être POSSÉDÉ (jamais un site hors compte) ; toute erreur → null = site de la session.
export interface NamedSite { location_id: string; label: string }

export async function resolveNamedSite(opts: {
  question: string;
  sessionLocationId: string;
  ownedLocationIds: string[];
  bq: { query: (o: any) => Promise<any> };
  projectId: string;
}): Promise<NamedSite | null> {
  try {
    const ids = Array.from(new Set([opts.sessionLocationId, ...opts.ownedLocationIds.map(String)].filter(Boolean)));
    if (ids.length < 2) return null;
    const [rows] = await opts.bq.query({
      query: `SELECT location_id, ANY_VALUE(COALESCE(site_name, company_name)) AS label
              FROM \`${opts.projectId}.raw.insight_event_user_location_profile\`
              WHERE location_id IN UNNEST(@ids) GROUP BY 1`,
      params: { ids }, types: { ids: ["STRING"] }, location: "EU",
    });
    const sites: SiteLabel[] = (Array.isArray(rows) ? rows : []).map((r: any) => ({ location_id: String(r.location_id), label: String(r.label || "") }));
    const hit = matchSiteInQuestion(opts.question, sites);
    if (!hit || !ids.includes(hit)) return null;
    return { location_id: hit, label: (sites.find((s) => s.location_id === hit) || { label: "" }).label };
  } catch {
    return null;
  }
}
