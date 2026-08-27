// src/lib/insightFamilies/engagements.ts
// Famille ENGAGEMENTS — « qu'est-ce qui a marché chez moi ? » (J2.1 du chantier Explorer).
// Jusqu'ici le chat ne savait RIEN du journal : zéro occurrence de commitment dans prompt.ts.
//
// POURQUOI LA SOURCE LIVE ET PAS LE MART (mesuré le 27/08, avant d'écrire une ligne) :
//   - `mart.fct_client_commitment_outcomes` : 4 lignes, 2 sites, dernier resolved_date = 04/08 —
//     alors que le compte de test f10c3e58 a des engagements résolus les 08/08 et 22/08. Le mart
//     est en retard de trois semaines et dbt est GELÉ depuis le 27/08 (décision owner) : une
//     famille bâtie dessus serait MUETTE là où l'owner la teste.
//   - `mart.fct_location_commitment_learning` : 8 lignes, `is_proven_lift` = cast(null as bool)
//     PAR CONSTRUCTION (toujours NULL) et `has_sufficient_sample` faux sur les 8. Rien à en tirer.
//     Elle est en outre FACTEUR-EXPLOSÉE : on ne SOMME jamais à travers `factor`.
// On lit donc `analytics.action_commitments`, la table que l'app POSSÈDE, avec le TIEBREAK
// CANONIQUE (updated_at desc, terminal desc, verdict non-null desc, created_at desc) — la même
// règle que le mart et que trackRecordCore, jamais une seconde définition du « dernier état ».
//
// PÉRIMÈTRE VOLONTAIRE : le journal DE L'EXPLOITANT (ses engagements et leur verdict). Le track
// record d'UN type de carte reste `trackRecordCore.trackRecordFor`, consommé par la famille SALES
// depuis le signal tiré — on ne le forke pas.
//
// Mots : `docs/lexique.md` — « engagement » (l.18), « cible/objectif : atteint · manqué · non
// concluant » (l.21), « votre résultat habituel » (l.24), dates JJ/MM/AAAA.
import type { FamilyProvider, FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";

const num = (v: any): number | null =>
  v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (v: any): string | null =>
  v == null ? null : String(typeof v === "object" && "value" in v ? v.value : v).slice(0, 10);
const frDate = (iso: string | null): string =>
  iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
const frPct = (n: number | null): string =>
  n == null ? "" : `${n >= 0 ? "+" : "−"}${String(Math.round(Math.abs(n) * 10) / 10).replace(".", ",")} %`;

// Le mot de l'owner pour le jugement sur la cible (lexique l.21) — jamais « validé », jamais « échec ».
const VERDICT_FR: Record<string, string> = {
  met: "objectif atteint",
  missed: "objectif manqué",
  confounded: "objectif non concluant",
};

// Un texte d'action peut être long (il vient d'un formulaire libre) : on le cite court et entier
// jusqu'à la première coupure propre, jamais tronqué en plein mot.
function shortAction(s: string | null): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= 64) return t;
  const cut = t.slice(0, 64);
  const sp = cut.lastIndexOf(" ");
  return (sp > 24 ? cut.slice(0, sp) : cut) + "…";
}

export async function engagementsFamily(
  bq: any,
  location_id: string,
  _date: string,
): Promise<FamilyResult> {
  let rows: any[] = [];
  try {
    const [r] = await bq.query({
      query: `
        SELECT status, verdict, action_done_status, measured_metric,
               committed_action_text, origin_action_type,
               window_start, window_end, window_residual_pct,
               threshold_value, threshold_basis, DATE(resolved_at) AS resolved_date
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY commitment_id
            ORDER BY updated_at DESC,
                     CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
                     (verdict IS NOT NULL) DESC,
                     created_at DESC
          ) AS rn
          FROM \`${PROJECT}.analytics.action_commitments\`
          WHERE location_id = @location_id
        )
        WHERE rn = 1 AND status IN ('open', 'resolved')
        ORDER BY COALESCE(window_end, window_start) DESC
        LIMIT 40`,
      params: { location_id },
      types: { location_id: "STRING" },
      location: "EU",
    });
    rows = Array.isArray(r) ? r : [];
  } catch {
    return { found: false, data: { found: false }, facts: [], sources: [] };
  }

  // « fait par défaut » (arbitrage owner 05/08, repris du mart) : un engagement résolu compte
  // comme mené SAUF si l'exploitant a déclaré « pas menée » (valeur legacy 'pas_encore').
  const resolved = rows.filter(
    (r) => String(r.status) === "resolved" && String(r.action_done_status ?? "") !== "pas_encore",
  );
  const optedOut = rows.filter(
    (r) => String(r.status) === "resolved" && String(r.action_done_status ?? "") === "pas_encore",
  );
  const open = rows.filter((r) => String(r.status) === "open");

  if (!resolved.length && !open.length && !optedOut.length) {
    return { found: false, data: { found: false }, facts: [], sources: [] };
  }

  const met = resolved.filter((r) => String(r.verdict) === "met").length;
  const missed = resolved.filter((r) => String(r.verdict) === "missed").length;
  const confounded = resolved.filter((r) => String(r.verdict) === "confounded").length;

  const facts: FamilyFact[] = [];
  const F = (fact_fr: string): FamilyFact => ({ fact_fr, claim_type: "observed", origin: "engagements" });

  if (resolved.length) {
    const parts = [
      met ? `${met} avec l'objectif atteint` : "",
      missed ? `${missed} avec l'objectif manqué` : "",
      confounded ? `${confounded} non concluant${confounded > 1 ? "s" : ""}` : "",
    ].filter(Boolean);
    facts.push(F(`Vous avez ${resolved.length} engagement${resolved.length > 1 ? "s" : ""} jugé${resolved.length > 1 ? "s" : ""} : ${parts.join(", ")}.`));
  }

  // Un fait par engagement jugé — c'est ce que le modèle peut citer nommément.
  for (const r of resolved.slice(0, 6)) {
    const v = VERDICT_FR[String(r.verdict)] ?? "sans verdict";
    const a = shortAction(r.committed_action_text);
    const eff = num(r.window_residual_pct);
    const ecart = eff != null ? ` — ${frPct(eff)} vs votre résultat habituel` : "";
    const cible =
      String(r.threshold_basis ?? "") === "pct" && num(r.threshold_value) != null
        ? ` (votre cible : +${String(num(r.threshold_value)).replace(".", ",")} %)`
        : "";
    facts.push(
      F(`Engagement « ${a} », du ${frDate(ymd(r.window_start))} au ${frDate(ymd(r.window_end))} : ${v}${cible}${ecart}.`),
    );
  }

  for (const r of open.slice(0, 4)) {
    const a = shortAction(r.committed_action_text);
    facts.push(
      F(`Engagement « ${a} » en cours jusqu'au ${frDate(ymd(r.window_end))} — le verdict tombe à cette date.`),
    );
  }

  if (optedOut.length) {
    facts.push(
      F(`${optedOut.length} engagement${optedOut.length > 1 ? "s" : ""} que vous avez déclaré${optedOut.length > 1 ? "s" : ""} non mené${optedOut.length > 1 ? "s" : ""} : ${optedOut.length > 1 ? "ils ne comptent" : "il ne compte"} dans aucun verdict.`),
    );
  }

  // L'absence de dispositif prouvé se DIT, elle ne se déduit pas d'un silence.
  if (resolved.length && !met) {
    facts.push(
      F(`Aucun de vos engagements jugés n'a atteint son objectif — vous n'avez donc pas encore de dispositif prouvé sur ce site.`),
    );
  }

  return {
    found: true,
    data: {
      found: true,
      resolved_count: resolved.length,
      open_count: open.length,
      opted_out_count: optedOut.length,
      met,
      missed,
      confounded,
    },
    facts,
    sources: ["Vos engagements"],
  };
}

export const engagementsProvider: FamilyProvider = {
  key: "engagements",
  title: "Vos engagements",
  // Aucun rendu de carte : la famille sert le chat et le rapport. Le client saute un render absent
  // (même parti pris que la famille `calendar`).
  render: "renderEngagements",
  // Motifs TIGHT et POSSESSIFS : « mes engagements », « qu'est-ce qui a marché », « mes tests ».
  // Enregistrée EN DERNIER pour ne rien voler aux familles ventes/fréquentation.
  match: [
    /\b(mes|mon|nos|notre)\s+(engagements?|tests?|dispositifs?\s+test)/i,
    /\bqu(['’]est-ce qui|i)\s+a\s+(march[ée]|fonctionn[ée])\b/i,
    /\bce\s+qui\s+a\s+(march[ée]|fonctionn[ée])\b/i,
    /\b(a-t-il|a-t-elle|est-ce que [çc]a)\s+(a\s+)?march[ée]\b/i,
    /\bobjectifs?\s+(atteints?|manqu[ée]s?)\b/i,
  ],
  run: (bq, location_id, date) => engagementsFamily(bq, location_id, date),
};
