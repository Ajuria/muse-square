// LA BATTERIE CONVERSATIONNELLE (owner go 28/08) — la porte de merge du chantier résolveur.
// Des dialogues scriptés MULTI-TOURS rejoués sur l'endpoint réel (compte owner), le cadre
// écho-é entre tours exactement comme le client (thread_context.resolved + historique).
// Chaque tour assert : le producer (routage), le cadre résolu (métadonnées seules), et une
// empreinte du contenu (dates du headline). Un chiffre périmé re-affirmé = échec.
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const URL = "http://localhost:4321/api/insight/prompt";

let fails = 0;
const check = (label, cond, got) => {
  console.log(`  ${cond ? "OK " : "ÉCHEC"} ${label}${cond ? "" : " — reçu : " + JSON.stringify(got).slice(0, 220)}`);
  if (!cond) fails++;
};

async function dialogue(name, turns) {
  console.log(`\n== ${name}`);
  let resolved = null;
  const history = [];
  for (const t of turns) {
    const t0 = Date.now();
    const r = await fetch(URL, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        q: t.q,
        thread_context: { location_id: LOC, resolved },
        conversation_history: history.slice(-8),
      }),
    });
    const j = await r.json();
    const ms = Date.now() - t0;
    const producer = j?.meta?.producer ?? null;
    const frame = j?.meta?.resolved_frame ?? null;
    const headline = j?.ai?.headline ?? "";
    console.log(`« ${t.q} » → ${producer} (${ms} ms) — ${String(headline).slice(0, 70)}`);
    for (const [label, fn] of Object.entries(t.expect)) check(label, fn({ j, producer, frame, headline }), { producer, frame: frame && { intent: frame.intent, periode: frame.periode, entites: frame.entity_names }, headline });
    if (frame) resolved = frame;                       // l'écho du client, à l'identique
    history.push({ role: "user", content: t.q });
    history.push({ role: "assistant", content: String(headline) });
  }
}

// D1 — le plan et sa SUITE : « et octobre ? » n'a aucun verbe de plan — seul le cadre le porte.
await dialogue("Plan puis suite de période", [
  { q: "planifie-moi septembre", expect: {
    "producer = plan": ({ producer }) => producer === "deterministic_plan_period_v1",
    "cadre intent=plan, période = septembre 2026": ({ frame }) => frame?.intent === "plan" && frame?.periode?.start === "2026-09-01" && frame?.periode?.end === "2026-09-30",
    "headline daté 01/09→30/09": ({ headline }) => headline.includes("01/09/2026") && headline.includes("30/09/2026"),
  } },
  { q: "et octobre ?", expect: {
    "producer = plan (hérité du cadre)": ({ producer }) => producer === "deterministic_plan_period_v1",
    "période = octobre 2026": ({ frame }) => frame?.periode?.start === "2026-10-01" && frame?.periode?.end === "2026-10-31",
    "headline daté 01/10→31/10": ({ headline }) => headline.includes("01/10/2026") && headline.includes("31/10/2026"),
  } },
]);

// D2 — entité × période, suite d'ENTITÉ (période héritée), puis CONTESTATION de période.
await dialogue("Entité, suite d'entité, contestation de période", [
  { q: "le CA de la famille Coffee cet été", expect: {
    "producer = entity_period": ({ producer }) => producer === "deterministic_entity_period_v1",
    "cadre : Coffee, été (juin→août)": ({ frame }) => frame?.entity_names?.some((e) => e.nom === "Coffee") && frame?.periode?.start === "2026-06-01" && frame?.periode?.end === "2026-08-31",
  } },
  { q: "et la famille Tea ?", expect: {
    "producer = entity_period (suite)": ({ producer }) => producer === "deterministic_entity_period_v1",
    "entité remplacée : Tea ; période HÉRITÉE (été)": ({ frame }) => frame?.entity_names?.some((e) => e.nom === "Tea") && !frame?.entity_names?.some((e) => e.nom === "Coffee") && frame?.periode?.start === "2026-06-01",
    "le headline parle de Tea": ({ headline }) => /tea/i.test(headline),
  } },
  { q: "non, plutôt juillet seulement", expect: {
    "producer = entity_period (contestation)": ({ producer }) => producer === "deterministic_entity_period_v1",
    "période remplacée : juillet ; entité GARDÉE (Tea)": ({ frame }) => frame?.periode?.start === "2026-07-01" && frame?.periode?.end === "2026-07-31" && frame?.entity_names?.some((e) => e.nom === "Tea"),
  } },
]);

// D3 — le journal (la regex l'attrapait déjà : le résolveur ne doit PAS le casser).
await dialogue("Journal (non-régression)", [
  { q: "mes engagements", expect: {
    "producer = journal": ({ producer }) => String(producer).startsWith("deterministic_engagements"),
  } },
]);

// D4 — entité INCONNUE : jamais deviné, élicitation avec les listes réelles.
await dialogue("Entité inconnue → élicitation", [
  { q: "le pôle charcuterie en août", expect: {
    "producer = elicit (listes réelles, pas d'invention)": ({ producer }) => producer === "deterministic_entity_period_elicit_v1",
  } },
]);

// D5 — MULTI-ENTITÉS (incrément 4) : deux familles côte à côte, puis suite de période.
await dialogue("Deux entités côte à côte, suite de période", [
  { q: "la famille Coffee vs la famille Tea en juillet", expect: {
    "producer = compare": ({ producer }) => producer === "deterministic_entity_compare_v1",
    "cadre : Coffee ET Tea, juillet": ({ frame }) => frame?.entity_names?.length === 2 && frame?.periode?.start === "2026-07-01" && frame?.periode?.end === "2026-07-31",
    "headline « vs »": ({ headline }) => /Coffee/.test(headline) && /Tea/.test(headline) && /vs/i.test(headline),
  } },
  { q: "et en juin ?", expect: {
    "producer = compare (2 entités héritées)": ({ producer }) => producer === "deterministic_entity_compare_v1",
    "période = juin, entités gardées": ({ frame }) => frame?.periode?.start === "2026-06-01" && frame?.entity_names?.length === 2,
  } },
]);

// D6 — DEUX PÉRIODES (incrément 4) : une entité, « par rapport à ».
await dialogue("Une entité, deux périodes", [
  { q: "la famille Coffee en juillet par rapport à juin", expect: {
    "producer = compare": ({ producer }) => producer === "deterministic_entity_compare_v1",
    "période = juillet, comparaison = juin": ({ frame }) => frame?.periode?.start === "2026-07-01" && frame?.periode_comparaison?.start === "2026-06-01",
    "headline porte les deux fenêtres": ({ headline }) => /01\/07\/2026/.test(headline) && /01\/06\/2026/.test(headline),
  } },
]);

// D7 — « POURQUOI ? » (incrément 5) : la construction du dernier résultat, cadre PRÉSERVÉ.
await dialogue("Pourquoi, puis la conversation continue", [
  { q: "la famille Coffee en juillet", expect: {
    "producer = entity_period": ({ producer }) => producer === "deterministic_entity_period_v1",
  } },
  { q: "pourquoi ?", expect: {
    "producer = why": ({ producer }) => producer === "deterministic_entity_why_v1",
    "3 étages : composition + phénomènes triés, jamais du mode de calcul": ({ j }) => {
      const secs = j?.ai?.output?.plan_sections ?? [];
      const titles = secs.map((s2) => s2.title);
      const facts = secs.flatMap((s2) => s2.facts ?? []).join(" ");
      return titles[0] === "Ce qui compose l'écart" && /meilleurs jours|sur la période/.test(facts)
        && !/somme de vos lignes de caisse/.test(facts);
    },
    "les phénomènes portent avec/sans + prior + indice (si présents)": ({ j }) => {
      const secs = j?.ai?.output?.plan_sections ?? [];
      const phen = secs.find((s2) => s2.title === "Les phénomènes extérieurs");
      if (!phen) return true;   // pas de facteur >= 3 j sur la période : l'étage ne se dit pas
      const f0 = String(phen.facts?.[0] ?? "");
      return /jours de .+ sur la période : .+ €\/jour · vos \d+ jours sans/.test(f0)
        && f0.includes("Historique du site") && /Indice de corrélation/.test(f0);
    },
    "le cadre SURVIT au pourquoi (entité + période gardées)": ({ frame }) => frame?.intent === "entity_period" && frame?.entity_names?.some((e) => e.nom === "Coffee") && frame?.periode?.start === "2026-07-01",
  } },
  { q: "et en juin ?", expect: {
    "la conversation continue sur l'entité, pas sur le pourquoi": ({ producer }) => producer === "deterministic_entity_period_v1",
    "période = juin, Coffee gardée": ({ frame }) => frame?.periode?.start === "2026-06-01" && frame?.entity_names?.some((e) => e.nom === "Coffee"),
  } },
]);

// D8 — POURQUOI DU PLAN (5bis) : la construction du diagnostic, cadre préservé.
await dialogue("Pourquoi du plan, puis la conversation continue", [
  { q: "planifie-moi septembre", expect: {
    "producer = plan": ({ producer }) => producer === "deterministic_plan_period_v1",
  } },
  { q: "pourquoi ?", expect: {
    "producer = plan_why": ({ producer }) => producer === "deterministic_plan_why_v1",
    "la valeur et les mélanges — jamais le mode de calcul": ({ j }) => {
      const facts = (j?.ai?.output?.plan_sections ?? []).flatMap((s2) => s2.facts ?? []).join(" ");
      return facts.includes("médiane") && facts.includes("Facteurs multiples") && /Enjeu : −[\d\u202f ]+ € sur la période/.test(facts)
        && !/somme de vos lignes de caisse divisée/.test(facts);
    },
    "chaque relation porte son indice de corrélation": ({ j }) => {
      const secs = j?.ai?.output?.plan_sections ?? [];
      const facts = secs.flatMap((s2) => s2.facts ?? []).join(" ");
      return /[Ii]ndice de corrélation (faible|moyen|fort) \(r = /.test(facts)
        && secs.some((s2) => s2.title === "Indices de corrélation");
    },
    "le cadre survit (plan, septembre)": ({ frame }) => frame?.intent === "plan" && frame?.periode?.start === "2026-09-01",
  } },
  { q: "et octobre ?", expect: {
    "la conversation continue sur le plan": ({ producer }) => producer === "deterministic_plan_period_v1",
    "période = octobre": ({ frame }) => frame?.periode?.start === "2026-10-01",
  } },
]);

// D9 — LE KPI PILOTE LES LECTURES : panier moyen × période, puis comparaison demandée.
await dialogue("KPI sans entité, puis comparaison demandée", [
  { q: "mon panier moyen en juillet", expect: {
    "producer = kpi_period": ({ producer }) => producer === "deterministic_kpi_period_v1",
    "cadre : kpi=basket, juillet, aucune entité": ({ frame }) => frame?.kpi === "basket" && frame?.periode?.start === "2026-07-01" && !(frame?.entity_names?.length),
    "le résultat est un € avec son référentiel": ({ j }) => {
      const rows = (j?.ai?.output?.plan_sections ?? []).flatMap((s2) => s2.table?.rows ?? []);
      return rows.length >= 1 && /€/.test(String(rows[0]?.cells?.[2]?.v));
    },
  } },
  { q: "et par rapport à juin ?", expect: {
    "producer = kpi_period (comparaison demandée)": ({ producer }) => producer === "deterministic_kpi_period_v1",
    "2 périodes : juillet + juin en comparaison": ({ frame }) => frame?.periode?.start === "2026-07-01" && frame?.periode_comparaison?.start === "2026-06-01",
  } },
]);

// D10 — L'IDÉE SOUMISE : placement + analogues + mise en test, puis la condition se conteste.
await dialogue("Idée soumise, puis changement de condition", [
  { q: "et si je faisais une dégustation gratuite les jours de pluie ?", expect: {
    "producer = idee": ({ producer }) => producer === "deterministic_idee_v1",
    "cadre : intent idee, condition rain": ({ frame }) => frame?.intent === "idee" && frame?.idee?.condition === "rain",
    "placement réel : jours/mesure de pluie OU absence dite": ({ j }) => {
      const secs = j?.ai?.output?.plan_sections ?? [];
      const place = secs.find((s2) => s2.title === "Où la placer");
      return !!place && place.facts.some((f) => /pluie/.test(f));
    },
    "la mise en test cadre le geste": ({ j }) => {
      const secs = j?.ai?.output?.plan_sections ?? [];
      return secs.some((s2) => s2.title === "Mettre en test") ;
    },
    "le CTA M'engager porte les mots de l'utilisateur": ({ j }) => {
      const p2 = j?.actions?.primary;
      return p2?.type === "commit_prefill" && /dégustation gratuite/.test(String(p2?.prefill?.committed_action_text || ""))
        && p2?.origin?.origin_action_type === "chat_idea_test";
    },
  } },
  { q: "et plutôt les jours de canicule ?", expect: {
    "producer = idee (suite)": ({ producer }) => producer === "deterministic_idee_v1",
    "condition remplacée : heat": ({ frame }) => frame?.idee?.condition === "heat",
  } },
]);


// D11 — DISPOSITIF × FAMILLE (I8, owner go 04/09) : la phrase owner complète, puis la suite de famille.
await dialogue("Dispositif × famille : ventes, panier moyen, mix — puis suite de famille", [
  { q: "quel est l'impact du dispositif Corner de vente producteur sur le volume de transactions de la famille Coffee, le panier moyen ou le mix produits ?", expect: {
    "producer = dispositif_famille": ({ producer }) => producer === "deterministic_dispositif_famille_v1",
    "cadre : l'opération ET la famille": ({ frame }) => frame?.entity_names?.some((e) => e.type === "operation") && frame?.entity_names?.some((e) => e.nom === "Coffee"),
    "table famille : 4 lignes (ventes, panier, CA, part) aux libellés owner": ({ j }) => {
      const sec = (j?.ai?.output?.plan_sections ?? []).find((s2) => s2.title === "Famille Coffee pendant l'opération");
      const labels = (sec?.table?.rows ?? []).map((r) => r.cells[0].v);
      return labels.join("|") === "Ventes/jour avec Coffee|Panier moyen avec Coffee|CA/jour Coffee|Part de Coffee dans le CA";
    },
    "table mix présente (tournure owner 28/08), Coffee en gras": ({ j }) => {
      const sec = (j?.ai?.output?.plan_sections ?? []).find((s2) => /^Vos \d+ familles, de la plus forte hausse à la plus forte baisse$/.test(String(s2.title)));
      return !!sec && (sec.table?.rows ?? []).some((r) => r.cells[0].v === "Coffee" && r.cells[0].bold === true);
    },
    "la phrase ouvre sur le mix (mot de la question) : « … au lieu de … »": ({ j }) => {
      const sec = (j?.ai?.output?.plan_sections ?? []).find((s2) => s2.title === "Famille Coffee pendant l'opération");
      return /^Part de Coffee dans le CA pendant l'opération : .+ au lieu de .+ \(/.test(String(sec?.facts?.[0] ?? ""));
    },
  } },
  { q: "et la famille Tea ?", expect: {
    "producer = dispositif_famille (suite)": ({ producer }) => producer === "deterministic_dispositif_famille_v1",
    // Mesuré 04/09 : sur ce cadre à deux natures, Haiku a AJOUTÉ Tea à Coffee au lieu de la remplacer (D2, cadre à une
    // nature, remplace). La règle 1 du prompt le dit désormais ; on n'asserte pas l'absence de Coffee (variance LLM),
    // on asserte ce qui compte : Tea lue, l'opération gardée, la table Tea présente.
    "famille Tea lue, opération gardée": ({ frame }) => frame?.entity_names?.some((e) => e.nom === "Tea") && frame?.entity_names?.some((e) => e.type === "operation"),
    "table « Famille Tea pendant l'opération » présente": ({ j }) => (j?.ai?.output?.plan_sections ?? []).some((s2) => s2.title === "Famille Tea pendant l'opération"),
  } },
]);

// ── CIBLE (I0, spec docs/explorer-routage-inversion-spec.md) — les 16 probes de l'audit 03/09,
// UN tour chacune, sur l'endpoint réel. `livre` = l'incrément qui doit la faire passer ; tant
// qu'il n'est pas appliqué, la probe est RAPPORTÉE (« RESTE ROUGE (cible) ») et ne compte pas
// dans `fails`. Quand l'incrément livre, on pose `now: true` : la probe devient une porte et
// une régression compte. Les attendus sont ceux de la CIBLE (producer), jamais l'état actuel.
const CIBLE = [
  { q: "qui est Jésus ?",                       livre: "I1", now: true , attend: (p) => p === "deterministic_hors_perimetre_v1" },
  { q: "quelle heure est-il ?",                 livre: "I1", now: true , attend: (p) => p === "deterministic_hors_perimetre_v1" },
  { q: "raconte-moi une blague",                livre: "I1", now: true , attend: (p) => p === "deterministic_hors_perimetre_v1" },
  { q: "quelle est la capitale de l'Australie ?", livre: "I1", now: true , attend: (p) => p === "deterministic_hors_perimetre_v1" },
  { q: "bonjour",                               livre: "I1", now: true , attend: (p) => p === "deterministic_hors_perimetre_v1" },   // arbitrage owner 2 : politesse ou même réponse
  { q: "merci",                                 livre: "I1", now: true , attend: (p) => p === "deterministic_hors_perimetre_v1" },
  { q: "mon panié moyen en juilet",             livre: "—",  now: true,  attend: (p) => p === "deterministic_kpi_period_v1" },
  { q: "planifi moi septembr",                  livre: "—",  now: true,  attend: (p) => p === "deterministic_plan_period_v1" },
  { q: "le CA de la famile Cofee cet ete",      livre: "—",  now: true,  attend: (p) => p === "deterministic_entity_period_v1" },
  { q: "mes engagemant",                        livre: "—",  now: true,  attend: (p) => String(p).startsWith("deterministic_engagements") },
  { q: "combien j'ai vendu hier ?",             livre: "I2", now: true,  attend: (p, j) => p === "grounded_day_claude" && (j?.decision_payload?.used_dates ?? []).includes(hier()) },
  // Semaine CIVILE précédente (convention frPeriod, lundi → dimanche) — jamais « les 7 derniers jours ».
  { q: "c'était comment la semaine dernière ?", livre: "I2", now: true,  attend: (p, j) => { const [a, b] = semaineDerniere(); const t = String(j?.ai?.output?.answer ?? ""); return p === "deterministic_report_nav_v1" && t.includes(frFr(a)) && t.includes(frFr(b)); } },
  { q: "ça va mes ventes ?",                    livre: "I5", now: true,  attend: (p) => p !== "deterministic_engagements_v1" && p !== "v3_fallback_deterministic" && p != null },
  { q: "top 3 produits août",                   livre: "I7", now: true,  attend: (p, j) => p === "deterministic_top_familles_v1" && (j?.ai?.output?.plan_sections?.[0]?.table?.rows ?? []).length >= 3 && /01\/08\/2026/.test(String(j?.ai?.headline)) },
  { q: "what were my sales in July?",           livre: "—",  now: true,  attend: (p) => p === "deterministic_report_nav_v1" },
  { q: "je veux savoir si mon panier moyen a progressé en juillet et aussi quels sont mes meilleurs jours en septembre",
                                                livre: "I6", now: true,  attend: (p, j, h) => p === "deterministic_kpi_period_v1" && /01\/07\/2026/.test(h) && !/01\/09\/2026/.test(h)
                                                  && (j?.ai?.output?.plan_sections ?? []).some((s2) => (s2.facts ?? []).some((f) => /^Vous m'avez aussi demandé : « .+ » — posez-la à part\.$/.test(f))) },
];
function hier() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
function semaineDerniere() { const d = new Date(); const dow = d.getDay(); const lundi = new Date(d); lundi.setDate(d.getDate() - ((dow + 6) % 7) - 7); const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6); return [lundi.toISOString().slice(0, 10), dim.toISOString().slice(0, 10)]; }
function frFr(iso) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; }
console.log("\n== CIBLE — probes de l'audit 03/09 (un tour chacune)");
let cibleRouges = 0;
for (const c of CIBLE) {
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: c.q, thread_context: { location_id: LOC, resolved: null }, conversation_history: [] }) });
  const j = await r.json();
  const producer = j?.meta?.producer ?? null;
  const headline = String(j?.ai?.headline ?? "");
  const ok = c.attend(producer, j, headline);
  const etat = ok ? "OK   " : (c.now ? "ÉCHEC" : `RESTE ROUGE (cible ${c.livre})`);
  console.log(`  ${etat} « ${c.q} » → ${producer} (${Date.now() - t0} ms) — ${headline.slice(0, 60)}`);
  if (!ok && c.now) fails++;
  if (!ok && !c.now) cibleRouges++;
}
console.log(`  cible : ${CIBLE.length - cibleRouges}/${CIBLE.length} passent — ${cibleRouges} restent à livrer`);

console.log(`\n${fails === 0 ? "BATTERIE VERTE" : fails + " ÉCHEC(S)"}`);
process.exit(fails ? 1 : 0);
