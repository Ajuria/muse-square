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
// DEUX AXES SÉPARÉS — arbitrage owner 27/08, `docs/lexique.md:17`, grammaire de référence
// `bestPractices.dispositifStateFr`. NE JAMAIS LES CONFONDRE :
//   - axe EFFET : ce que le DISPOSITIF a fait au réel. |z| >= 1 vs le résultat habituel =>
//     effet PROUVÉ (positif => « prouvé », négatif => « écarté », contre-indication qui ne se
//     re-propose jamais sur son signal). |z| < 1 => « testé, non concluant », dans le bruit.
//   - axe OBJECTIF : la cible que l'exploitant s'était fixée. Un objectif manqué est un péché
//     d'optimisme sur la cible — il ne dit RIEN de l'effet du dispositif.
// Un effet négatif prouvé EST une preuve, pas une absence de preuve : écrire « vous n'avez pas
// de dispositif prouvé » sur un dispositif à −23 % est faux (défaut owner du 27/08, corrigé ici).
//
// DISPOSITIF ≠ ENGAGEMENT. Le dispositif est le mécanisme ; l'engagement est UN test daté avec
// SON objectif. Un dispositif porte N engagements. Regroupement par le NOM du dispositif = le
// texte avant le premier « — » de committed_action_text (c'est ce que l'exploitant a saisi et ce
// qu'il lit) : heuristique assumée, faute de clé de dispositif sur action_commitments.
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

// Seuil de PREUVE d'effet — arbitrage owner 27/08 (lexique l.17) : |z| >= 1 vs le résultat
// habituel. En dessous, l'effet est dans le bruit du lieu et ne prouve rien, dans aucun sens.
const PROOF_Z = 1;

// Le NOM du dispositif = ce que l'exploitant a saisi avant le premier « — ». Faute de clé de
// dispositif sur action_commitments, c'est la seule clé de regroupement lisible par lui.
function dispositifName(s: string | null): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const cut = t.split(/\s+[—–-]\s+/)[0].trim();
  return (cut || t).slice(0, 60);
}

// Direction d'effet d'un dispositif sur SES tests : un seul test au-delà du seuil de preuve
// suffit à prouver un sens ; les deux sens prouvés à la fois se disent non concluants.
function effectDirection(rows: any[]): "negative" | "positive" | "inconclusive" {
  let neg = false, pos = false;
  for (const r of rows) {
    const z = r.window_residual_z == null ? null : Number(r.window_residual_z?.value ?? r.window_residual_z);
    if (z == null || Math.abs(z) < PROOF_Z) continue;
    if (z < 0) neg = true; else pos = true;
  }
  if (neg && !pos) return "negative";
  if (pos && !neg) return "positive";
  return "inconclusive";
}

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
               window_start, window_end, window_residual_pct, window_residual_z,
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
  const advice: string[] = [];
  const adviceTexts: string[] = [];
  const F = (fact_fr: string): FamilyFact => ({ fact_fr, claim_type: "observed", origin: "engagements" });

  // ── Regroupement par DISPOSITIF (le mécanisme), pas par engagement (le test daté). ──
  const byDispositif = new Map<string, { resolved: any[]; open: any[] }>();
  for (const r of [...resolved, ...open]) {
    const name = dispositifName(r.committed_action_text);
    if (!name) continue;
    const g = byDispositif.get(name) ?? { resolved: [], open: [] };
    (String(r.status) === "open" ? g.open : g.resolved).push(r);
    byDispositif.set(name, g);
  }

  for (const [name, g] of byDispositif) {
    if (g.resolved.length) {
      // Chaque test porte SON effet ET son registre de preuve — jamais une moyenne, qui
      // mélangerait un effet prouvé et du bruit.
      const tests = g.resolved
        .slice()
        .sort((a, b) => String(ymd(a.window_start) ?? "").localeCompare(String(ymd(b.window_start) ?? "")))
        .map((r) => {
          const pct = num(r.window_residual_pct);
          const z = num(r.window_residual_z);
          const reg = z == null ? "" : Math.abs(z) >= PROOF_Z ? " (effet prouvé)" : " (dans le bruit)";
          return `${frPct(pct)} le ${frDate(ymd(r.window_start))}${reg}`;
        })
        .join(" et ");
      const dir = effectDirection(g.resolved);
      const verdictFr =
        dir === "negative"
          ? "il a prouvé ne pas être adapté"
          : dir === "positive"
            ? "effet positif prouvé"
            : "testé, non concluant";
      facts.push(
        F(`Dispositif « ${name} » — ${g.resolved.length} test${g.resolved.length > 1 ? "s" : ""} : ${tests}, vs votre résultat habituel. Effet mesuré : ${verdictFr}.`),
      );

      // L'OBJECTIF est un axe SÉPARÉ : il se dit après l'effet, et jamais comme le verdict du
      // dispositif (une cible surestimée fabrique un faux échec).
      const obj = g.resolved.find((r) => String(r.threshold_basis ?? "") === "pct" && num(r.threshold_value) != null);
      if (obj) {
        facts.push(
          F(`Objectif que vous aviez fixé pour « ${name} » : +${String(num(obj.threshold_value)).replace(".", ",")} %. Un objectif manqué est un réglage de votre part — il ne dit rien de l'effet du dispositif.`),
        );
      }

      // Contre-indication (lexique l.17) : un effet négatif prouvé ne se re-propose pas.
      if (dir === "negative") {
        const encore = g.open.length
          ? ` Or un test de ce dispositif est en cours jusqu'au ${frDate(ymd(g.open[0].window_end))}.`
          : "";
        // Le FAIT porte la doctrine (citable par la composition grounded) ; l'ACTION porte le
        // geste. `advice_texts` dit lequel des deux est de l'action, pour que la réponse
        // déterministe ne le rende pas deux fois.
        const contre = `Un dispositif à effet négatif prouvé ne se rejoue pas sur le même signal.${encore}`;
        facts.push(F(contre));
        adviceTexts.push(contre);
        // Le rejeu EN COURS est ce qui rend le geste urgent : il vit dans l'action, pas seulement
        // dans un fait qu'on pourrait lire distraitement.
        advice.push(
          g.open.length
            ? `interrompre ou modifier le dispositif « ${name} » — un test est pourtant en cours jusqu'au ${frDate(ymd(g.open[0].window_end))}`
            : `interrompre ou modifier le dispositif « ${name} »`,
        );
      }
    } else if (g.open.length) {
      facts.push(
        F(`Dispositif « ${name} » — test en cours jusqu'au ${frDate(ymd(g.open[0].window_end))}, le verdict tombe à cette date.`),
      );
    }
  }

  if (optedOut.length) {
    facts.push(
      F(`${optedOut.length} engagement${optedOut.length > 1 ? "s" : ""} que vous avez déclaré${optedOut.length > 1 ? "s" : ""} non mené${optedOut.length > 1 ? "s" : ""} : ${optedOut.length > 1 ? "ils ne comptent" : "il ne compte"} dans aucun verdict.`),
    );
  }

  return {
    found: true,
    data: {
      found: true,
      advice,
      advice_texts: adviceTexts,
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
