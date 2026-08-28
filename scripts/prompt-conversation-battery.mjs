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
    "la construction est dite avec les chiffres (lignes de caisse, €/jour)": ({ j }) => {
      const facts = (j?.ai?.output?.plan_sections ?? []).flatMap((s2) => s2.facts ?? []).join(" ");
      return facts.includes("lignes de caisse") && facts.includes("€/jour");
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
    "la médiane et les mélanges sont dits en clair": ({ j }) => {
      const facts = (j?.ai?.output?.plan_sections ?? []).flatMap((s2) => s2.facts ?? []).join(" ");
      return facts.includes("médiane") && facts.includes("Mesure mêlée");
    },
    "le coût projeté est décomposé": ({ j }) => {
      const facts = (j?.ai?.output?.plan_sections ?? []).flatMap((s2) => s2.facts ?? []).join(" ");
      return /coût projeté/.test(facts) && /× 4 j/.test(facts);
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

console.log(`\n${fails === 0 ? "BATTERIE VERTE" : fails + " ÉCHEC(S)"}`);
process.exit(fails ? 1 : 0);
