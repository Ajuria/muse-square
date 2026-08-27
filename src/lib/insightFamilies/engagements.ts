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
import { commitmentEffect } from "../commitmentEffect";
import { buildPoleReading } from "../poleReading";

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
    // L'effet se lit sur le KPI CHOISI du test, jamais d'office sur le résidu de CA
    // (correctif owner 27/08 — le foyer unique est commitmentEffect).
    const z = commitmentEffect(r).z;
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
        SELECT commitment_id, dispositif_id, version_no, status, verdict, action_done_status, measured_metric,
               committed_action_text, origin_action_type, adjustment_move,
               dispositif_nature, pole_families, attached_pole_id, owner_person_name,
               dispositif_plus, dispositif_why, dispositif_resources,
               window_start, window_end, window_residual_pct, window_residual_z,
               kpi_baseline, kpi_window_value, kpi_delta_pct, kpi_noise_se,
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

  // ── PÔLES / DISPOSITIFS PERMANENTS (spec 27/08) — séparés AVANT tout : un pôle est `open`
  // par construction et polluerait les groupes datés (il n'a ni fenêtre ni verdict — sa mesure
  // est la lecture en continu, jamais un mot de verdict). Le rendu retenu (proto v2, owner
  // 27/08) : une CARTE par pôle, pill = les RÉSULTATS (CA 30 j · poids du CA · écart vs les
  // 90 j précédents), « Données insuffisantes » + infobulle sous les planchers.
  const poleRows = rows.filter((r) => String(r.dispositif_nature ?? "") === "permanent");
  rows = rows.filter((r) => String(r.dispositif_nature ?? "") !== "permanent");

  // « fait par défaut » (arbitrage owner 05/08, repris du mart) : un engagement résolu compte
  // comme mené SAUF si l'exploitant a déclaré « pas menée » (valeur legacy 'pas_encore').
  const resolved = rows.filter(
    (r) => String(r.status) === "resolved" && String(r.action_done_status ?? "") !== "pas_encore",
  );
  const optedOut = rows.filter(
    (r) => String(r.status) === "resolved" && String(r.action_done_status ?? "") === "pas_encore",
  );
  const open = rows.filter((r) => String(r.status) === "open");

  if (!resolved.length && !open.length && !optedOut.length && !poleRows.length) {
    return { found: false, data: { found: false }, facts: [], sources: [] };
  }

  const met = resolved.filter((r) => String(r.verdict) === "met").length;
  const missed = resolved.filter((r) => String(r.verdict) === "missed").length;
  const confounded = resolved.filter((r) => String(r.verdict) === "confounded").length;

  const facts: FamilyFact[] = [];
  const advice: string[] = [];
  const adviceTexts: string[] = [];
  let adjustId: string | null = null;
  const F = (fact_fr: string): FamilyFact => ({ fact_fr, claim_type: "observed", origin: "engagements" });

  // ── Les cartes de pôle (rendu retenu proto v2) + leurs faits citables. Les faits rendus en
  // carte sont listés dans cardFactTexts pour que la réponse déterministe ne les redise pas
  // en prose (même mécanique que advice_texts).
  const s = (v: any): string | null => (v == null ? null : String((v as any)?.value ?? v) || null);
  const frPct1 = (v: number): string => `${v >= 0 ? "+" : "−"}${String(Math.abs(v)).replace(".", ",")} %`;
  const frEur0 = (v: number): string => Math.round(v).toLocaleString("fr-FR");
  const pole_cards: any[] = [];
  const cardFactTexts: string[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const poleReadings = await Promise.all(poleRows.map(async (r) => {
    let fams: string[] = [];
    try { fams = JSON.parse(String(s(r.pole_families) || "[]")); } catch { /* périmètre illisible → lecture vide */ }
    const reading = await buildPoleReading(bq, location_id, String(s(r.dispositif_id) || s(r.commitment_id)), fams, todayIso);
    return { r, fams, reading };
  }));
  for (const { r, fams, reading } of poleReadings) {
    const parts = String(s(r.committed_action_text) || "").split(" — ");
    const name = parts[0] || "Pôle";
    const lever = parts.slice(1).join(" — ") || null;
    const resp = s(r.owner_person_name);
    const t = reading.totals;
    const measurable = t.rev30_eur != null && t.share_pct != null;
    const famLine = reading.families
      .map((f) => f.delta_pct != null ? `${f.family} ${frPct1(f.delta_pct)}` : f.family)
      .join(" · ");
    const openOps = reading.operations.filter((o) => o.status === "open");
    const rowsCard: any[] = [];
    if (famLine) rowsCard.push({ k: "Familles", v: famLine });
    if (resp) rowsCard.push({ k: "Responsable(s)", v: resp });
    if (lever) rowsCard.push({ k: "Levier", v: lever });
    if (openOps.length) rowsCard.push({
      k: "Opérations en cours",
      v: openOps.map((o) => `${String(o.committed_action_text || "").split(" — ")[0]} (${frDate(o.window_start)}, en cours)`).join(" · "),
    });
    const card: any = { label: name, rows: rowsCard };
    if (measurable) {
      card.pill = `${frEur0(t.rev30_eur!)} € sur 30 j · ${String(t.share_pct).replace(".", ",")} % du CA`
        + (t.delta_pct != null ? ` · ${frPct1(t.delta_pct)} vs les 90 jours précédents` : "");
    } else {
      card.pill = "Données insuffisantes ⓘ";
      card.tip = `${t.n30} jour${t.n30 > 1 ? "s" : ""} vendu${t.n30 > 1 ? "s" : ""} sur les 30 derniers — la comparaison demande au moins 5 jours vendus de chaque côté.`;
    }
    pole_cards.push(card);
    // Le FAIT citable (mêmes chiffres que la carte — jamais deux vérités).
    const head = `Pôle « ${name} »${fams.length ? ` (familles ${fams.join(", ")}${resp ? ` — responsable ${resp}` : ""})` : resp ? ` (responsable ${resp})` : ""}`;
    const factTxt = measurable
      ? `${head} : ${frEur0(t.rev30_eur!)} € sur les 30 derniers jours vendus, soit ${String(t.share_pct).replace(".", ",")} % du CA du site${t.delta_pct != null ? `, ${frPct1(t.delta_pct)} vs les 90 jours précédents` : ""}.`
      : `${head} : données insuffisantes pour comparer (${t.n30} jour${t.n30 > 1 ? "s" : ""} vendu${t.n30 > 1 ? "s" : ""} sur les 30 derniers).`;
    facts.push(F(factTxt));
    cardFactTexts.push(factTxt);
    if (openOps.length) {
      const opsTxt = `Sur le pôle « ${name} », ${openOps.length > 1 ? `${openOps.length} opérations en cours` : "1 opération en cours"} : ${openOps.map((o) => `${String(o.committed_action_text || "").split(" — ")[0]} (${frDate(o.window_start)})`).join(", ")}.`;
      facts.push(F(opsTxt));
      cardFactTexts.push(opsTxt);
    }
    // L2 — la mémoire du dispositif, citable telle que saisie (jamais reformulée en verdict).
    const mem: string[] = [];
    if (s(r.dispositif_why)) mem.push(`pourquoi ça va marcher : « ${s(r.dispositif_why)} »`);
    if (s(r.dispositif_plus)) mem.push(`le plus du dispositif : « ${s(r.dispositif_plus)} »`);
    if (s(r.dispositif_resources)) mem.push(`ressource(s) : « ${s(r.dispositif_resources)} »`);
    if (mem.length) {
      const memTxt = `Pôle « ${name} » — ${mem.join(" ; ")}.`;
      facts.push(F(memTxt));
      cardFactTexts.push(memTxt);
    }
  }

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
      const sorted = g.resolved
        .slice()
        .sort((a, b) => String(ymd(a.window_start) ?? "").localeCompare(String(ymd(b.window_start) ?? "")));
      const tests = sorted
        .map((r) => {
          const eff = commitmentEffect(r);
          // Seul l'effet PROUVÉ se qualifie : sous le seuil, on n'affirme rien — on ne dit pas
          // non plus la mécanique (« dans le bruit » retiré sur retour owner 27/08).
          const reg = eff.z != null && Math.abs(eff.z) >= PROOF_Z ? " (effet prouvé)" : "";
          return `${frPct(eff.pct)} le ${frDate(ymd(r.window_start))}${reg}`;
        })
        .join(" et ");
      // Le RÉFÉRENTIEL du chiffre (règle 2 du lexique) : quand le test porte un KPI qui n'est
      // pas le CA, le groupe l'annonce une fois (« 2 tests sur le CA famille : … »).
      const kpiMention = commitmentEffect(sorted[0]).kpi_mention_fr;
      const dir = effectDirection(g.resolved);
      const verdictFr =
        dir === "negative"
          ? "il a prouvé ne pas être adapté"
          : dir === "positive"
            ? "effet positif prouvé"
            : "testé, non concluant";
      facts.push(
        F(`Dispositif « ${name} » — ${g.resolved.length} test${g.resolved.length > 1 ? "s" : ""}${kpiMention ? ` ${kpiMention}` : ""} : ${tests}, vs votre résultat habituel. Effet mesuré : ${verdictFr}.`),
      );

      // L'OBJECTIF est un axe SÉPARÉ : il se dit après l'effet, et jamais comme le verdict du
      // dispositif (une cible surestimée fabrique un faux échec).
      const obj = g.resolved.find((r) => String(r.threshold_basis ?? "") === "pct" && num(r.threshold_value) != null);
      if (obj) {
        facts.push(
          F(`Objectif de +${String(num(obj.threshold_value)).replace(".", ",")} % manqué.`),
        );
      }

      // Contre-indication (lexique l.17) : un effet négatif prouvé ne se re-propose pas.
      if (dir === "negative") {
        const _openV = g.open.length ? Number((g.open[0].version_no as any)?.value ?? g.open[0].version_no) || 1 : 1;
        const encore = g.open.length
          ? ` Or un test de ce dispositif${_openV > 1 ? ` (version ${_openV})` : ""} est en cours jusqu'au ${frDate(ymd(g.open[0].window_end))}.`
          : "";
        // Le FAIT porte la doctrine (citable par la composition grounded) ; l'ACTION porte le
        // geste. `advice_texts` dit lequel des deux est de l'action, pour que la réponse
        // déterministe ne le rende pas deux fois.
        const contre = `Un dispositif à effet négatif prouvé ne se rejoue pas sur le même signal.${encore}`;
        facts.push(F(contre));
        adviceTexts.push(contre);
        // Le rejeu EN COURS est ce qui rend le geste urgent : il vit dans l'action, pas seulement
        // dans un fait qu'on pourrait lire distraitement.
        const missedObj = g.resolved.some((r) => String(r.verdict) === "missed");
        // J2.3 — le geste porte sur l'engagement OUVERT de ce dispositif : c'est LUI qu'on
        // interrompt ou qu'on ajuste. « Ajuster » est le mot du lexique (l.38) pour un
        // engagement ouvert ; la page engagement porte déjà les deux gestes.
        if (g.open.length && !adjustId) adjustId = String(g.open[0].commitment_id ?? "") || null;
        advice.push(
          `interrompre ou modifier le dispositif « ${name} »`
          + (g.open.length ? " en cours" : "")
          + (missedObj ? " et ajuster l'objectif" : ""),
        );
      }
    } else if (g.open.length) {
      const vNo = Number((g.open[0].version_no as any)?.value ?? g.open[0].version_no) || 1;
      facts.push(
        F(`Dispositif « ${name} » — test en cours${vNo > 1 ? ` (version ${vNo})` : ""} jusqu'au ${frDate(ymd(g.open[0].window_end))}, le verdict tombe à cette date.`),
      );
    }

    // L2 — mémoire du dispositif daté (version la plus récente : ouverte d'abord, sinon la
    // dernière résolue), citable telle que saisie.
    const memRow = g.open[0] ?? g.resolved[g.resolved.length - 1];
    if (memRow) {
      const memD: string[] = [];
      if (s(memRow.dispositif_why)) memD.push(`pourquoi ça va marcher : « ${s(memRow.dispositif_why)} »`);
      if (s(memRow.dispositif_plus)) memD.push(`le plus du dispositif : « ${s(memRow.dispositif_plus)} »`);
      if (s(memRow.dispositif_resources)) memD.push(`ressource(s) : « ${s(memRow.dispositif_resources)} »`);
      if (s(memRow.owner_person_name)) memD.push(`responsable : ${s(memRow.owner_person_name)}`);
      if (memD.length) facts.push(F(`Dispositif « ${name} » — ${memD.join(" ; ")}.`));
    }
  }

  // ── Cartes ambre des opérations datées au VERDICT IMMINENT (proto v2 : ambre = verdict
  // d'ici demain au plus). La ligne de la carte reprend le fait de groupe déjà écrit — jamais
  // deux formulations des mêmes chiffres.
  const dated_cards: any[] = [];
  for (const [name, g] of byDispositif) {
    const o = g.open[0];
    if (!o) continue;
    const we = ymd(o.window_end);
    if (!we) continue;
    const dTo = Math.round((new Date(we + "T00:00:00Z").getTime() - new Date(todayIso + "T00:00:00Z").getTime()) / 86400000);
    if (dTo > 1) continue;
    const vNo = Number((o.version_no as any)?.value ?? o.version_no) || 1;
    const move = s(o.adjustment_move);
    const histFact = facts.find((f) => f.fact_fr.startsWith(`Dispositif « ${name} » — ${g.resolved.length} test`));
    dated_cards.push({
      label: name, tone: "amber",
      pill: `Version ${vNo} en cours${move ? ` (${move})` : ""} — verdict d'ici le ${frDate(we)}`,
      rows: histFact ? [{ k: "Historique", v: histFact.fact_fr.replace(`Dispositif « ${name} » — `, "") }] : [],
    });
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
      adjust_commitment_id: adjustId,
      resolved_count: resolved.length,
      open_count: open.length,
      opted_out_count: optedOut.length,
      met,
      missed,
      confounded,
      // Journal nature-aware (27/08, proto v2) : les cartes serveur — pôles (résultats en pill)
      // et opérations datées au verdict imminent (ambre). card_fact_texts = les faits déjà
      // rendus en carte, que la réponse déterministe ne redit pas en prose.
      poles_count: poleRows.length,
      pole_cards,
      dated_cards,
      card_fact_texts: cardFactTexts,
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
