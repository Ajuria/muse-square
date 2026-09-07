// Explorer — batterie de qualité + juge (R3-5, docs/explorer-attribution-spec.md).
// LA porte de QUALITÉ du chat, pendant de la suite lie-bait (qui garde la VÉRITÉ) : l'owner ne doit
// plus payer de son temps chaque régression d'utilité. Lancement :
//   npx dotenv -e .env -- npx tsx tools/battery/explorer-quality-battery.ts [port]
// (serveur dev démarré avec MS_AUTH_BYPASS=1 ; défaut port 4322)
//
// Pour CHAQUE question : portes DURES (producer attendu, budget de latence, provenance présente sur
// grounded, jamais le plancher IR « catégorie C ») + score du JUGE (Sonnet 5, temp 0) contre la
// RUBRIQUE v1 — chaque règle vient d'un retour owner daté. Sortie : explorer-battery-report.md
// (non versionné) + explorer-battery-baseline.json (le run précédent → colonnes de delta).
//
// RUBRIQUE v1 — STATUT : DRAFT, en attente d'approbation owner (08/08). Une règle = une ligne de
// feedback owner devenue permanente. L'owner édite ICI ; le juge la lit telle quelle.

const RUBRIC_FR = `R1 — Répond à la QUESTION posée, pas une récitation du contexte du jour.
R2 — Ne présente JAMAIS comme information ce que l'exploitant sait déjà (ses concurrents suivis et leurs distances, le jour de la semaine, sa propre adresse).
R3 — Quantifié : aucun « possible / plusieurs / forte » quand un chiffre existe dans les faits cités ; chaque écart porte sa base de mesure dans la même phrase.
R4 — Les événements ACTIFS du jour sont nommés avec leur base de classification (catégorie, audience commune) ; les voisins permanents ne servent jamais de cadre au verdict.
R5 — Repères divergents réconciliés dans le verdict ; « variation ordinaire » / « aucune cause mesurée » sont DITES quand c'est la vérité.
R6 — Plafond honnête : quand la donnée manque, l'answer le dit et s'arrête — zéro bluff, zéro remplissage.
R7 — Chiffre d'abord dans le verdict ; concision (2-4 faits porteurs, pas d'inventaire).
R8 — Une OBJECTION de l'utilisateur (« tu ne réponds pas », « c'est faux ») reçoit un traitement du DÉSACCORD — reconnaissance explicite + hypothèses vérifiables (données incomplètes ? autre date ? estimation erronée ?) — jamais une resucée de la réponse contestée.
R9 — VOIX : registre professionnel d'un analyste qui parle à un exploitant — phrases pleines, termes du métier, zéro remplissage (« il est important de noter », « n'hésitez pas »), zéro conseil 101 (« communiquez sur les réseaux sociaux »), zéro robotisme (listes mécaniques sans verdict). Une réponse creuse polie reste une réponse creuse.`;

// ── TRAÇABILITÉ plainte → porte (le « couvre-t-il toutes mes plaintes ? » se lit ICI, jamais sur parole)
// « very slow » (07/08)                     → budget de latence par cas (porte dure)
// « very dumb / catégorie C » (07/08)       → producer attendu + porte anti-plancher IR (tous les cas)
// « states facts, doesn't answer » (08/08)  → R1 + cas 1-2
// « forte densité inventée » (08/08)        → R3
// « concurrents statiques = useless » (08/08)→ R2 + R4 + cas 7 (verdict mesuré cannibalisation)
// « c'est aussi les vacances » (08/08)      → cas calendrier (porte : « vacances » dans la réponse)
// « quelle proportion de touristes » (08/08) → cas tourisme (porte : un % dans la réponse)
// « samedi dernier = mauvais jour » (08/08)  → cas premise (porte : used_date = samedi précédent CALCULÉ)
// « et le dimanche ? » (héritage de fil)     → cas continuation (porte : used_date = lendemain du frame)
// « tu ne réponds pas / resucée » (08/08)    → R8 + cas objection multi-tours
// « Orsay sans chiffres » (juge R3)          → R3 + règle chiffres-des-pages + cas Orsay
// « jour inexpliqué sans contexte réel »     → cas 14/07 (porte : web_context + source https)
// « no 101 / robotic crap » (08/08)          → R9
// « mes journées de juin-juillet » routées lookup_event → « Aucun événement trouvé » (26/08) → cas bilan (porte : horizon ≠ lookup_event)
// Comportements CLIENT (fil qui survit, Nouvelle conversation, 3 slots, chips) → suite séparée
// tests/client/explorer-ui.test.ts (happy-dom sur les VRAIS card-kit.js + ie-prompt.js).

type Expect = {
  producers: string[]; maxSeconds: number; groundedChips?: boolean; webSources?: boolean;
  usedDate?: () => string;      // porte DATE : decision_payload.used_dates[0] doit être EXACTEMENT ceci
  answerMatch?: RegExp;         // porte CONTENU : le texte visible doit matcher (fait attendu présent)
  horizonNot?: string;          // porte ROUTAGE : meta.resolved_horizon ne doit JAMAIS être ceci
  answerHasNot?: string;        // porte CONTENU NÉGATIVE : le texte visible ne doit JAMAIS contenir ceci
};
// Samedi précédent STRICTEMENT avant aujourd'hui (la sémantique « samedi dernier » de R2-4).
function prevSaturdayYmd(): string {
  const d = new Date();
  do { d.setDate(d.getDate() - 1); } while (d.getDay() !== 6);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// `pre` (R8) : un cas MULTI-TOURS — l'historique + le frame du tour précédent partent avec la question,
// comme le client le fait ; le juge voit la question du tour final seulement.
type Pre = { conversation_history: Array<{ role: string; content: string }>; last: any };
const _FULL_BATTERY: Array<{ q: string; expect: Expect; pre?: Pre }> = [
  { q: "Pourquoi le 18/07 ?", expect: { producers: ["grounded_day_claude"], maxSeconds: 35, groundedChips: true } },
  { q: "Pourquoi le 11/07 ?", expect: { producers: ["grounded_day_claude"], maxSeconds: 35, groundedChips: true } },
  { q: "Mon CA a chuté de 40 % samedi dernier, pourquoi ?", expect: { producers: ["grounded_day_claude"], maxSeconds: 40, groundedChips: true, usedDate: prevSaturdayYmd } },
  { q: "Quand il pleut, je vends moins ?", expect: { producers: ["family_grounded_claude", "family_deterministic"], maxSeconds: 35 } },
  { q: "Quels produits je vends le plus ?", expect: { producers: ["family_grounded_claude", "family_deterministic"], maxSeconds: 35 } },
  { q: "À quel moment je vends le plus ?", expect: { producers: ["family_grounded_claude", "family_deterministic"], maxSeconds: 35 } },
  { q: "Les musées autour me prennent-ils des clients ?", expect: { producers: ["family_grounded_claude", "family_deterministic"], maxSeconds: 35 } },
  { q: "Quels sont mes 3 meilleurs jours en septembre ?", expect: { producers: ["v3_claude"], maxSeconds: 35 } },
  { q: "Compare le 18/07 et le 19/07", expect: { producers: ["v3_claude"], maxSeconds: 35 } },
  // 27/08 (K9, owner go) : des marges FAMILLE déclarées font répondre la marge calculée, plus l'élicitation ;
  // 04/09 : la fenêtre honore « week-end » (jours de week-end des 30 derniers jours) et le dit.
  { q: "Quelle est ma marge le week-end ?", expect: { producers: ["deterministic_declared_margin_v1", "deterministic_missing_dimension_elicit_v1"], maxSeconds: 8, answerMatch: /week-end/i } },
  { q: "Pourquoi le 03/01/2024 ?", expect: { producers: ["grounded_day_claude", "v3_fallback_deterministic"], maxSeconds: 40 } },
  { q: "Le musée d'Orsay me prend-il des visiteurs ?", expect: { producers: ["web_search", "llm_only"], maxSeconds: 60 } },
  // Étape 5 — jour PASSÉ inexpliqué : la section « Web — non vérifié » doit arriver avec ≥1 source
  // https (14/07 est en cache 30 j depuis le run E2E — déterministe et rapide ; si le cache expire,
  // le premier run peut la manquer (plafond 12 s) et le second la porte).
  { q: "Pourquoi le 14/07 ?", expect: { producers: ["grounded_day_claude"], maxSeconds: 40, groundedChips: true, webSources: true } },
  // Plainte « c'est aussi les vacances » : la famille calendrier doit nommer les vacances scolaires.
  { q: "Les vacances scolaires changent quoi pour mes ventes ?", expect: { producers: ["family_grounded_claude", "family_deterministic"], maxSeconds: 35, answerMatch: /vacances/i } },
  // Plainte « quelle proportion » : la réponse tourisme porte un POURCENTAGE, plus jamais « possible ».
  { q: "D'où viennent les visiteurs étrangers dans ma région ?", expect: { producers: ["family_grounded_claude", "family_deterministic", "grounded_day_claude"], maxSeconds: 35, answerMatch: /\d+\s?%/ } },
  // Héritage de fil : « et le dimanche ? » après un samedi doit répondre sur LE lendemain du frame.
  {
    q: "et le dimanche ?",
    expect: { producers: ["grounded_day_claude", "family_grounded_claude", "family_deterministic"], maxSeconds: 40, usedDate: () => "2026-07-19" },
    pre: {
      conversation_history: [
        { role: "user", content: "Pourquoi le 18/07 ?" },
        { role: "assistant", content: "Le 18/07/2026, CA 1 150 €, −12 % vs habituel." },
      ],
      last: { horizon: "day", intent: "DAY_WHY", used_dates: ["2026-07-18"] },
    },
  },
  // Détournement du détecteur d'événements (E2E 26/08) : une question de BILAN sur ses propres
  // journées (« mes journées » + noms de mois) partait en lookup_event via la branche MINIMAL
  // TEMPORAL → « Aucun événement trouvé ». La porte garde le ROUTAGE seul : jamais le chemin lookup.
  // FOND (26/08) — le défaut aval est instruit : la période est PASSÉE, et l'instrument du passé est
  // le rapport (207668a). Le producteur attendu inclut donc `deterministic_report_nav_v1`. Le repli
  // Le repli brut est CLOS depuis (arbitrage owner 26/08) : une dimension sur le mois bascule sur
  // le chemin jour/famille. Le producteur rapport porte désormais son verdict chiffré (juge 2,0 → 4,3).
  { q: "comment se sont passées mes journées de juin-juillet ?", expect: { producers: ["deterministic_report_nav_v1", "deterministic", "v3_claude", "v3_fallback_deterministic", "family_grounded_claude", "family_deterministic", "grounded_day_claude"], maxSeconds: 35, horizonNot: "lookup_event" } },
  // Même question, un mot de plus : « meilleures » faisait basculer le biais d'année et juin-juillet
  // résolvait en 2027 (E2E 26/08). Porte : aucune date utilisée ni citée hors de la période demandée.
  { q: "comment se sont passées mes meilleures journées de juin-juillet ?", expect: { producers: ["deterministic_report_nav_v1", "deterministic", "v3_claude", "v3_fallback_deterministic", "family_grounded_claude", "family_deterministic", "grounded_day_claude"], maxSeconds: 35, horizonNot: "lookup_event", answerHasNot: "2027" } },
  // R8 — le cas owner 08/08 : une objection doit produire le tour de DÉSACCORD, jamais une resucée.
  {
    q: "tu ne réponds pas à ma question: pourquoi mon CA a chuté de 40 % samedi dernier?",
    expect: { producers: ["deterministic_objection_v1"], maxSeconds: 8 },
    pre: {
      conversation_history: [
        { role: "user", content: "Mon CA a chuté de 40 % samedi dernier, pourquoi ?" },
        { role: "assistant", content: "Le 01/08/2026, votre CA réalisé est de 1 475 € contre un CA habituel de 1 616 €, soit −9 %." },
      ],
      last: { horizon: "day", intent: "DAY_WHY", used_dates: ["2026-08-01"] },
    },
  },
];

// BATTERY_ONLY=n → run the nth question only (debug); default: full battery.
const BATTERY = process.env.BATTERY_ONLY ? [_FULL_BATTERY[Number(process.env.BATTERY_ONLY) - 1]].filter(Boolean) : _FULL_BATTERY;

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const PORT = process.argv[2] ? Number(process.argv[2]) : 4322;
const JUDGE_MODEL = "claude-sonnet-5";

// Le juge note ce que L'UTILISATEUR voit. Sur les chemins grounded/family, le client rend headline +
// answer (+ carte famille) — PAS key_facts : les inclure faisait noter une « répétition » invisible
// (artefact de juge mesuré au run 1). Les chemins v3/deterministic rendent leurs key_facts → inclus.
function textOfAnswer(o: any): string {
  const out = o?.ai?.output ?? {};
  const producer = o?.meta?.producer ?? "";
  const renderedKeyFacts = /^grounded_day_claude$|^family_/.test(producer) ? [] : (out.key_facts ?? []);
  const parts = [out.headline, typeof out.answer === "string" ? out.answer : JSON.stringify(out.answer ?? ""), ...renderedKeyFacts,
    ...(o?.family_card ? ["(La carte détaillée de la famille est rendue sous la réponse — données complètes visibles.)"] : [])];
  return parts.filter(Boolean).join("\n");
}

async function judge(q: string, answer: string): Promise<{ scores: Record<string, number>; worst: string; note_fr: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.warn("[judge] ANTHROPIC_API_KEY absente — juge sauté"); return null; }
  // max_tokens généreux : Sonnet 5 pense implicitement (adaptive thinking) et la réflexion consomme
  // le budget AVANT le texte — mesuré : 500 tokens → content text VIDE sur la rubrique à 7 règles.
  const body = {
    model: JUDGE_MODEL,
    max_tokens: 3000,
    messages: [{
      role: "user",
      content:
        `Tu es le juge qualité du chat d'un outil B2B pour exploitants de lieux (France). Voici la rubrique (une règle par ligne) :\n\n${RUBRIC_FR}\n\n` +
        `QUESTION de l'exploitant : « ${q} »\n\nRÉPONSE du système :\n---\n${answer}\n---\n\n` +
        `Note CHAQUE règle de 1 (violée) à 5 (exemplaire). Si une règle ne s'applique pas à cette question, note 5 et signale "n/a" dans la note. ` +
        `Réponds en JSON STRICT : {"scores":{"R1":n,...,"R7":n},"worst":"Rx","note_fr":"une phrase sur le principal défaut (ou 'aucun défaut notable')"}`,
    }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { console.warn("[judge] HTTP", r.status); return null; }
  const j: any = await r.json();
  const txt = (j?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = txt.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : (console.warn("[judge] no JSON in:", txt.slice(0, 120)), null); }
  catch (e: any) { console.warn("[judge] parse fail:", e?.message, "|", txt.slice(0, 120)); return null; }
}

(async () => {
  const results: any[] = [];
  for (const item of BATTERY) {
    const t0 = Date.now();
    let out: any = null;
    try {
      const res = await fetch(`http://localhost:${PORT}/api/insight/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: item.q,
          thread_context: { v: 1, location_id: LOC, turn: item.pre ? 1 : 0, last: item.pre?.last ?? null },
          ...(item.pre ? { conversation_history: item.pre.conversation_history } : {}),
        }),
      });
      out = await res.json();
    } catch (e: any) { out = { _error: e?.message }; }
    const seconds = Math.round((Date.now() - t0) / 1000);
    const producer = out?.meta?.producer ?? null;
    const output = out?.ai?.output ?? {};
    const gates: string[] = [];
    if (!item.expect.producers.includes(producer)) gates.push(`producer=${producer} (attendu: ${item.expect.producers.join("|")})`);
    if (seconds > item.expect.maxSeconds) gates.push(`latence ${seconds}s > ${item.expect.maxSeconds}s`);
    if (item.expect.groundedChips && !(Array.isArray(output.sentence_provenance) && Array.isArray(output.facts_catalog))) gates.push("provenance/catalog absents");
    if (item.expect.usedDate) {
      const want = item.expect.usedDate();
      const got = String(out?.decision_payload?.used_dates?.[0] ?? "").slice(0, 10);
      if (got !== want) gates.push(`date résolue ${got || "absente"} (attendu ${want})`);
    }
    if (item.expect.horizonNot) {
      const got = out?.meta?.resolved_horizon ?? null;
      if (got === item.expect.horizonNot) gates.push(`horizon=${got} (routage interdit pour cette question)`);
    }
    if (item.expect.answerHasNot) {
      const full = [output.headline, typeof output.answer === "string" ? output.answer : "", ...(output.key_facts ?? [])].join("\n");
      if (full.includes(item.expect.answerHasNot)) gates.push(`contenu interdit présent (« ${item.expect.answerHasNot} »)`);
    }
    if (item.expect.answerMatch) {
      const full = [output.headline, typeof output.answer === "string" ? output.answer : "", ...(output.key_facts ?? [])].join("\n");
      if (!item.expect.answerMatch.test(full)) gates.push(`contenu attendu absent (${item.expect.answerMatch})`);
    }
    if (item.expect.webSources) {
      const w = out?.web_context;
      const okWeb = w && (w.takeaway || (w.key_factors ?? []).length) && Array.isArray(w.sources) && w.sources.some((u: string) => /^https:\/\//.test(u));
      if (!okWeb) gates.push("section web absente ou sans source https");
    }
    if (String(output.headline ?? "").includes("catégorie C") || String(output.answer ?? "").includes("catégorie C")) gates.push("plancher IR « catégorie C »");
    if (!String(output.headline ?? "").trim() && !String(output.answer ?? "").trim()) gates.push("réponse vide");
    const answerText = textOfAnswer(out);
    const verdict = gates.length ? "FAIL" : "PASS";
    const jj = answerText.trim() ? await judge(item.q, answerText) : null;
    const avg = jj ? (Object.values(jj.scores).reduce((a: number, b: any) => a + Number(b), 0) / Object.keys(jj.scores).length) : null;
    results.push({ q: item.q, producer, seconds, gates, verdict, judge: jj, avg });
    console.log(`${verdict === "PASS" ? "✔" : "✘"} [${seconds}s] ${item.q} → ${producer}${jj ? ` | juge ${avg?.toFixed(1)}/5 (pire: ${jj.worst})` : ""}${gates.length ? ` | GATES: ${gates.join(" ; ")}` : ""}`);
  }

  // Baseline diff + report
  const fs = await import("node:fs");
  let baseline: any[] = [];
  try { baseline = JSON.parse(fs.readFileSync("data/shots/explorer-battery-baseline.json", "utf8")); } catch { /* first run */ }
  const byQ = new Map(baseline.map((r: any) => [r.q, r]));
  const lines: string[] = [
    "# Explorer — rapport de batterie qualité", "",
    `Run local sur le compte de référence. RUBRIQUE v1 : DRAFT (approbation owner en attente).`, "",
    "| # | Question | Producer | s | Portes | Juge /5 | Δ vs run précédent | Pire règle |",
    "|---|---|---|---|---|---|---|---|",
  ];
  results.forEach((r, i) => {
    const prev = byQ.get(r.q);
    const delta = prev?.avg != null && r.avg != null ? (r.avg - prev.avg >= 0 ? "+" : "") + (r.avg - prev.avg).toFixed(1) : "—";
    lines.push(`| ${i + 1} | ${r.q} | ${r.producer} | ${r.seconds} | ${r.verdict} | ${r.avg?.toFixed(1) ?? "—"} | ${delta} | ${r.judge?.worst ?? "—"} |`);
  });
  lines.push("", "## Notes du juge", "");
  results.forEach((r, i) => { if (r.judge?.note_fr) lines.push(`${i + 1}. **${r.q}** — ${r.judge.note_fr}`); });
  const hardFails = results.filter((r) => r.verdict === "FAIL").length;
  const avgAll = results.filter((r) => r.avg != null);
  lines.push("", `**Bilan : ${results.length - hardFails}/${results.length} portes dures ; juge moyen ${avgAll.length ? (avgAll.reduce((a, r) => a + r.avg, 0) / avgAll.length).toFixed(2) : "—"}/5.**`);
  fs.writeFileSync("data/shots/explorer-battery-report.md", lines.join("\n"));
  fs.writeFileSync("data/shots/explorer-battery-baseline.json", JSON.stringify(results.map(({ q, producer, seconds, verdict, avg, judge: j }) => ({ q, producer, seconds, verdict, avg, worst: j?.worst })), null, 1));
  console.log(`\nRapport : explorer-battery-report.md — ${results.length - hardFails}/${results.length} portes dures PASS.`);
  process.exit(hardFails ? 1 : 0);
})();
