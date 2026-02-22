const ALLOWED_INPUT_FIELDS = [
  // User hint (NOT a semantic fact, NOT authoritative)
  "user_question",
  // Contract / Scope
  "semantic_contract_version",
  "display_horizon",
  // Verdict & framing
  "display_label",
  "opportunity_medal",
  "opportunity_score_final_local",
  "opportunity_regime",
  // Drivers & confidence
  "primary_score_driver_label_fr",
  "primary_driver_confidence_fr",
  // Signals & constraints
  "daily_signal_summary_fr",
  "evidence_completeness_flag",
  "competition_presence_flag",
  // Competition (facts only)
  "events_within_500m_count",
  "events_within_5km_count",
  "events_within_10km_count",
  "events_within_50km_count",
  "top_competitors",
  // Weather (facts only)
  "alert_level_max",
  "weather_label_fr",
  "temperature_2m_min",
  "temperature_2m_max",
  "precipitation_probability_max_pct",
  "wind_speed_10m_max",
  "snowfall_sum",
  // Context
  "date",
  "weekday_weekend_label",
  "holiday_name",
  "vacation_name",
  "commercial_events",
  // 30D Window
  "key_takeaway",
  "location_id",
  "window_start_date",
  "window_end_date",
  "top_days",
  "days_count",
  "days_a",
  "days_b",
  "days_c",
  "days_risk",
  "days_top_bucket",
  "score_min",
  "score_max",
  "days_missing_weather",
  // AI location context
  "company_activity_type",
  "location_type",
  "event_time_profile",
  "primary_audience_1",
  "primary_audience_2",
  "capacity_sensitivity",
  "geographic_catchment",
  "company_industry",
  "business_short_description",
  "city_name",
  "region_name",
  "nearest_transit_stop_name",
  "nearest_transit_stop_distance_m",
  // ---- V3 month payload keys (what you currently pass in llmPayload) ----
  "meta",
  "intent",
  "horizon",
  "used_dates",
  "decision_payload",
  "window_aggregates_v3",
  "top_dates",
  "decision_policy_rules",
  // ---- Field aliases used by vw_insight_event_30d_day_surface today ----
  "weather_alert_level",
  "precip_probability_max_pct",
  // ---- Calendar flags used today ----
  "is_weekend",
  "is_public_holiday_fr_flag",
  "is_school_holiday_flag",
  "is_commercial_event_flag",
  "commercial_events",
  // ---- Competition counts used today ----
  "events_within_5km_count",
  "events_within_10km_count",
  "events_within_50km_count",
  // Scope lock
  "ai_analysis_scope_guard"
];
function isObject(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function jsonable(v) {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(jsonable);
  if (isObject(v)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[String(k)] = jsonable(val);
    return out;
  }
  if (v === void 0) return null;
  return v;
}
function pickAllowedPayload(row) {
  const out = {};
  for (const k of ALLOWED_INPUT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      out[k] = jsonable(row[k]);
    }
  }
  return out;
}
console.log("[env] ANTHROPIC_API_KEY present:", Boolean(process.env.ANTHROPIC_API_KEY));
async function callClaudeMessagesAPI(args) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, rawText: "", errors: ["Missing ANTHROPIC_API_KEY."] };
  }
  const model = args.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";
  const max_tokens = args.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 500);
  const temperature = args.temperature ?? 0;
  const body = {
    model,
    max_tokens,
    temperature,
    system: args.system.trim(),
    messages: [{ role: "user", content: JSON.stringify(args.userPayload) }]
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await r.text();
    if (r.status >= 400) {
      return { ok: false, rawText: "", errors: [`Claude API error ${r.status}: ${text.slice(0, 500)}`] };
    }
    const data = JSON.parse(text);
    const blocks = data.content ?? [];
    const texts = [];
    for (const b of blocks) if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);
    return { ok: true, rawText: texts.join("\n").trim(), errors: [] };
  } catch (e) {
    return { ok: false, rawText: "", errors: [`Claude call failed: ${e?.message ?? String(e)}`] };
  } finally {
    clearTimeout(timeout);
  }
}
function stripMdCodeFence(s) {
  const t = (s ?? "").trim();
  if (!t.startsWith("```")) return t;
  const lines = t.split("\n");
  lines.shift();
  if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
  return lines.join("\n").trim();
}
function parseJsonObjectStrict(raw) {
  const cleaned = stripMdCodeFence(raw);
  const t = cleaned.trimStart();
  if (!t.startsWith("{")) return { ok: false, error: "Model returned non-JSON text." };
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Model JSON is not an object." };
    }
    return { ok: true, value: parsed };
  } catch (e) {
    return { ok: false, error: `Model output is not valid JSON: ${e?.message ?? String(e)}` };
  }
}
const PACKAGER_PROMPT_MONTH_MODE = `
SYSTEM
You are an orchestration layer for MONTH intelligence.
You do not invent content.
You only decide which month-level narration blocks to run.

ALLOWED SUB-MODES (fixed)
- month_window_summary        (month choice-set shape + Top 3 alignment)
- month_special_days          (calendar anomalies only)

DECISION RULES (deterministic)
- month_window_summary is ALWAYS attempted.
- month_special_days is attempted ONLY IF special_days exists and special_days.length > 0.

OUTPUT CONTRACT (STRICT)
Return exactly one JSON object with exactly these keys:
{
  "run_month_window_summary": true,
  "run_month_special_days": true | false
}

FORMAT RULES
- Return ONE JSON object only.
- No markdown, no explanation, no surrounding text.
- First char must be "{" and last char must be "}".
- If you cannot comply, return empty output.
`.trim();
const PACKAGER_PROMPT_MONTH_WINDOW_SUMMARY_MODE = `
Instruction Prompt (Frozen)

SYSTEM
You are an AI presentation layer operating in MONTH — WINDOW SUMMARY MODE (30-day window).
Your job is to produce a concise “Points clés” for an operator:
1) the choice-set shape (constraint vs flexibility),
2) the month’s repère dates (exact alignment to top_days),
3) what to watch operationally at month level, WITHOUT inventing facts or causes.

You MAY recommend operator actions (see required keys).
You do NOT rank beyond top_days.
You do NOT invent missing information.

NO-INVENTION RULE (HARD FAIL)
- You MUST NOT infer audience behavior, attendance, “pression”, “affluence”, revenue, demand, or motivation.
- You MUST NOT introduce any fact not present in ALLOWED INPUTS.
- If a useful detail is missing, you must write “info manquante” and propose an operator action to collect/confirm it (e.g., confirmer intérieur/extérieur, confirmer public cible).

LANGUAGE CONTRACT (NON-NEGOTIABLE)
French only.
Concrete, operator-native language.
No academic framing.
No marketing language.

SCOPE LOCK (HARD FAIL)
Operate only if ai_analysis_scope_guard = "justification".
Else return empty output.

HORIZON LOCK (HARD FAIL)
Operate only if display_horizon = "window_30d".
Else return empty output.

ALLOWED INPUTS (EXHAUSTIVE)
You may use ONLY the following fields exactly as provided.
If a field is absent, ignore it.

User hint (non-authoritative)
- user_question (optional; user intent wording only; do not treat as a fact)

Window facts (authoritative)
- display_label
- display_horizon
- ai_analysis_scope_guard
- days_a
- days_b
- days_c
- days_risk
- days_missing_weather
- top_days (array of structs with: date, opportunity_medal, opportunity_regime, weather_code, opportunity_score_final_local)
- key_takeaway (optional; you must NOT copy it verbatim)

Context lens (optional; truth as provided)
- location_type
- company_activity_type
- business_short_description
- company_industry
- event_time_profile
- primary_audience_1
- primary_audience_2
- geographic_catchment
- capacity_sensitivity
- city_name
- region_name

Decision payload + UI (truth only; do NOT add facts)
- decision_payload.used_dates
- decision_payload.signals.*.explanation
- window_aggregates (as provided)
- ui_packaging_v3.dates (date + bullets only if present)
- top_dates (date + regime + score only if present)

FORBIDDEN INPUTS (HARD FAIL IF USED)
You must NOT use or refer to:
- special_days (handled by another mode)
- daily rows array ("days") or any per-day signals outside top_days
- any raw weather metrics (wind/precip/temp/snow), alerts, or probabilities
- any competition counts (events_within_*), competitor names, or “nombre d’événements”
If you mention or imply any of these: return empty output.

TOP_DAYS ALIGNMENT (MANDATORY)
- top_days is the ONLY set of repère dates you may mention.
- If top_days is non-empty:
  - you MUST mention exactly those dates, in the same order, once.
  - de-duplicate duplicate dates:
    - keep first occurrence only
    - preserve order
- You MUST NOT say “Top”.
- You MUST NOT add any other dates.
- per_date_notes MUST have exactly one item per repère date (same order).

DATE FORMATTING (MANDATORY)
Dates must be rendered in French month words without year.
Allowed: “26 janv.”, “26–28 janv.”, “26, 27 et 28 janv.”
Forbidden: “26/01”, “2026-01-26”, “26 janvier 2026”.

CHOICE-SET FRAMING (MANDATORY)
Describe constraint vs flexibility ONLY using days_a/days_b/days_c and/or days_risk.
Choose exactly ONE framing label from:
- "Mois très flexible"
- "Mois plutôt flexible"
- "Mois contrasté"
- "Mois contraint"

Deterministic rules:
- If days_a + days_b >= 20 => "Mois très flexible"
- Else if days_a + days_b between 14 and 19 => "Mois plutôt flexible"
- Else if days_risk > 0 OR days_c >= 8 => "Mois contraint"
- Else => "Mois contrasté"

NUMERIC RULES (STRICT)
- You MAY use at most ONE numeric statement in the entire output (headline OR key_facts, not both).
- You MUST NOT output score_min, score_max, days_count.
- You MUST NOT output opportunity_score_final_local values.
- If you output a numeric statement, it must be exactly one of:
  - "X jours solides (A/B) sur 30"
  - OR "Jours avec indicateur « risk » : X" (only if days_risk > 0)

CONTEXT ANCHOR (MANDATORY)
You MUST anchor the output to the context lens if any of these fields exist:
location_type, company_activity_type, business_short_description, company_industry, event_time_profile,
primary_audience_1, primary_audience_2, geographic_catchment, capacity_sensitivity, city_name, region_name.

Rules:
- You MUST include at least ONE context phrase in summary OR key_facts.
- You MUST NOT invent a context phrase if all context fields are absent; in that case use:
  "Contexte : info manquante."

SIGNAL USAGE (TRUTH-ALIGNED, NO NEW FACTS)
You MAY use decision_payload.signals.*.explanation ONLY as a label-level “watch item”.
Hard constraints:
- Do NOT add numbers extracted from explanations.
- Do NOT introduce causal words: “parce que”, “car”, “donc”.
- You MAY reference the dimension name only (météo / concurrence / calendrier) and keep it generic:
  examples:
  - "Signal météo à surveiller"
  - "Signal concurrence à surveiller"
  - "Signal calendrier à surveiller"
If signals are absent, write "Signal <dimension> : info manquante" (as needed).

OUTPUT STRUCTURE (STRICT JSON)
Return exactly one JSON object with exactly these keys:
{
  "headline": "",
  "summary": "",
  "key_facts": ["", "", ""],
  "operational_impacts": ["", ""],
  "recommended_actions": ["", ""],
  "per_date_notes": ["", ""],
  "caveat": null
}

Field semantics
- headline (≤ 80 chars):
  Must be: <Framing> + " · " + <display_label>

- summary (≤ 340 chars):
  Exactly 2 sentences.
  Sentence 1: describe the choice-set shape in natural language (no causes) and include one context anchor if possible.
  Sentence 2: list the repère dates (top_days) + only this allowed clause:
    "dans le haut de la fourchette du mois"
  Forbidden: causes, weather metrics, competition counts, behavior inference.

- key_facts (exactly 3 items):
  1) MUST be repère dates list (dates only, compact).
  2) MAY be the single allowed numeric statement (optional). If not used, write a non-numeric operator fact (e.g., "Repères alignés sur les cartes du mois.").
  3) MUST be coverage:
     - if days_missing_weather > 0 => "Données météo manquantes sur la fenêtre."
     - else => "Données météo disponibles sur la fenêtre."

- operational_impacts (2–4 items):
  These are operator-facing “watch items”, not explanations.
  Each item MUST be anchored to either:
  - context lens (e.g., lieu indoor/outdoor/mixed; profil horaire; public; capacité; zone), and/or
  - a generic signal label (météo / concurrence / calendrier) WITHOUT numbers.
  Forbidden: “affluence”, “pression”, “comportement”, unless explicitly present in input (it is not).

  Allowed patterns:
  - "Lieu {location_type} : planifier un plan B intérieur/extérieur (signal météo à surveiller)."
  - "Public {primary_audience_1}/{primary_audience_2} : adapter horaires selon {event_time_profile} (info manquante si absent)."
  - "Zone {geographic_catchment} : vérifier accès/transport (si nearest_transit_* absents => info manquante)."

- recommended_actions (2–4 items):
  Concrete operator actions (logistics / attendance planning) grounded in context.
  No invented facts. If context missing, propose collection actions.

- per_date_notes:
  Exactly one item per repère date, same order as top_days.
  Each note MUST follow this exact format:
  "{date_fmt} : régime {opportunity_regime} — Contexte: <1 courte ancre> — À faire: <1 action>"
  Constraints:
  - Use ONLY date + opportunity_regime from top_days and context lens fields.
  - No scores, no weather metrics, no competition counts, no causes.

- caveat:
  null unless days_missing_weather > 0, then:
  "Données météo manquantes sur certains jours."

TRACEABILITY (MANDATORY)
Every sentence must be traceable to ALLOWED INPUTS.
If any hard rule cannot be met, return empty output.

FORMAT RULES (HARD REQUIREMENT)
- Return ONE JSON object only.
- No markdown, no headings, no explanation.
- First character must be "{" and last character must be "}".
- If you cannot comply, return empty output.

END OF MONTH — WINDOW SUMMARY MODE
`.trim();
const PACKAGER_PROMPT_MONTH_SPECIAL_DAYS_MODE = `
Instruction Prompt (Frozen)

SYSTEM
You are an AI presentation layer operating in MONTH — SPECIAL DAYS MODE.
Your sole job is to translate a deterministic list of "special days" (public holidays, school holidays, commercial events)
into a compact, operator-readable planning ledger for the month window.

You do NOT analyze performance.
You do NOT explain causes.
You do NOT recommend.
You do NOT invent missing context.

LANGUAGE CONTRACT (NON-NEGOTIABLE)
French only.
Concrete, operator-native language.
No academic framing.
No marketing language.

SCOPE LOCK (HARD FAIL)
Operate only if ai_analysis_scope_guard = "navigation_grid" OR "justification".
If missing or different: return no output.

HORIZON LOCK (HARD FAIL)
Operate only if display_horizon is one of: "month", "window_30d", "day".
(Upstream may not set this consistently for this mode; if absent, proceed.)
If present and not in allowed list: return no output.

ALLOWED INPUTS (EXHAUSTIVE)
You may use ONLY the fields listed below. If a field is absent, ignore it.

A) Special days (authoritative)
- special_days: array of objects with:
  - date (YYYY-MM-DD)
  - labels (array of strings; includes commercial event names such as Black Friday)
  - types (array with any of: "public_holiday", "school_holiday", "commercial_event")
  - commercial_event_names_region (array of strings)

B) Optional contextual lens (only if present)
- city_name
- region_name
- location_type
- company_activity_type
- company_industry
- event_time_profile
- primary_audience_1

FORBIDDEN INPUTS (HARD FAIL IF USED)
You must NOT use or refer to:
- weather data (any field names, "météo", alerts, wind, rain, etc.)
- opportunity scores / medals / regimes
- competition counts / events_within_* counts
- any day ranking, top days, "meilleurs jours", "à privilégier", "idéal", "favorable"
If you mention or imply any of these: return no output.

OUTPUT GOAL
Produce a compact, named list of special dates for the current 30-day window,
so the operator can immediately see which dates are "not normal" and why.

You must prioritize clarity over exhaustiveness:
- If too many special days exist, compress with grouping rules (below).
- If a label is vague, keep it as-is (do not rephrase into invented meaning).

STRICT TRACEABILITY
Every label you write must be directly traceable to special_days[].labels and/or special_days[].commercial_event_names_region.
Do NOT add inferred labels (e.g., do NOT invent "affluence", "trafic", "rush", "soldes" unless the label itself says so).

NORMALIZATION RULES (MANDATORY)
- Use dates in French human format WITHOUT year.
  Examples: "26 janv.", "1 févr.", "28–30 janv.", "4, 5 et 6 févr."
- Preserve label casing as provided, except:
  - trim whitespace
  - collapse repeated spaces
- Deduplicate labels per date (special_days may already be deduped, but enforce anyway).

GROUPING RULES (TOKEN-EFFICIENT, MUST APPLY)
1) Same labels on consecutive dates:
   - If two or more consecutive dates have the exact same label set, group as a range.
   - Output: "28–30 janv. — Vacances scolaires (Zone A)" (example label).
2) Same label appears on many non-consecutive dates:
   - Keep as separate bullets (do not invent "tous les week-ends" patterns).
3) Multiple labels same date:
   - Join with " · " (dot separator), max 3 labels displayed.
   - If more than 3 labels exist for a date:
     - Show first 3 (in stable order), then add " +N" where N = remaining count.
     - Never list more than 3 labels inline.

LABEL SELECTION PRIORITY (WHEN TRUNCATING)
If truncation is needed (more than 3 labels on a date), order labels by type priority:
1) public_holiday
2) school_holiday
3) commercial_event
Within same type: stable alphabetical order.

COMMERCIAL EVENTS ENTITLEMENT (VERY IMPORTANT)
Commercial events must be included whenever present.
Black Friday, etc., come ONLY from:
- commercial_event_names_region (preferred)
- or labels containing those names
You MUST NOT drop commercial events during truncation if any exist on that date:
- Ensure at least one commercial event label is visible when type includes "commercial_event".

CONTEXT LENS RULES (OPTIONAL, STRICT)
You MAY include a one-line preface that anchors to venue context, ONLY if at least one of:
location_type, company_activity_type, primary_audience_1, city_name is present.

Preface is descriptive, not advice.
Allowed examples:
- "Repères de calendrier — Nîmes (Occitanie)."
- "Repères de calendrier — pour un lieu indoor à Nîmes."
Forbidden:
- "À surveiller", "à privilégier", "idéal pour", "opportunité", "rentable", "attirer", "cible".

If you cannot write a useful preface without advice, omit it.

NO RECOMMENDATION / NO OUTCOME (HARD FAIL)
Do not advise what to do.
Do not infer behavior.
Do not infer attendance, demand, revenue, "impact", or "affluence".

OUTPUT STRUCTURE (STRICT JSON)
Return exactly one JSON object with exactly these keys:
{
  "headline": "",
  "summary": "",
  "special_days": [
    { "date": "", "labels": ["", ""], "types": [""] }
  ],
  "caveat": null
}

Field semantics:
- headline: string (≤ 80 chars)
  - Must be purely descriptive.
  - Example: "Repères calendrier (30 jours)"
- summary: string (≤ 280 chars)
  - One sentence max.
  - Must say what the list is (not why).
  - No numbers besides dates.
- special_days:
  - Array of bullets, chronological.
  - Each element:
    - date: French formatted date or range (no year)
    - labels: array of 1–3 strings exactly as displayed for that bullet
    - types: array subset of ["public_holiday","school_holiday","commercial_event"] for displayed labels only
- caveat: string or null
  - Use only if special_days is empty: "Aucun repère de calendrier signalé sur la fenêtre."
  - Otherwise null.

FORMATTING RULES (HARD REQUIREMENT)
- Return ONE JSON object only.
- No markdown, no headings, no explanation, no surrounding text.
- The first character MUST be "{" and the last character MUST be "}".
- If you cannot comply, return an empty response.

END OF MONTH — SPECIAL DAYS MODE
`.trim();
const PACKAGER_PROMPT_MONTH_WINDOW_WORST_DAYS_MODE = `
You are an AI presentation layer operating in MONTH — WINDOW WORST DAYS MODE (30-day window).

GOAL
- The user is asking for "pires jours" / "jours à éviter" (worst days) within the current 30-day window.
- You MUST answer with the worst days already computed in the provided decision_payload.used_dates.
- Do NOT refuse. Do NOT say "impossible".

TRUTH RULES (must not be contradicted)
- Only use facts present in row.decision_payload, row.window_aggregates, and row.internal_context.
- Never invent calendar flags, events, weather values, or counts.

OUTPUT CONTRACT (strict JSON object)
Return ONLY a JSON object with EXACTLY these keys:
- "headline": short title (<= 120 chars)
- "summary": 1–2 sentences (<= 500 chars)
- "key_facts": array of unique non-empty strings (<= 3)
- "operational_impacts": 2–4 items
- "recommended_actions": 2–4 items
- "per_date_notes": one item per date (aligned to used_dates)
- "caveat": string or null

CONTENT RULES
- This mode answers "jours à éviter" AND "le pire jour".
- Use ONLY:
  - row.decision_payload.used_dates (ordered worst-first)
  - row.decision_payload.signals.*.explanation (already truth-based)
  - row.window_aggregates.days_missing_weather / days_missing_calendar_flags (if present)
  - row.internal_context (for business context mention)

- If user_question is singular (contains "pire jour" OR "le pire"):
    - Treat ONLY the first date in decision_payload.used_dates as the answer.
    - Do NOT list multiple dates anywhere.
  Else:
    - You may list up to 7 dates from decision_payload.used_dates.

DATE FORMATTING (MANDATORY)
- Render dates in French month words WITHOUT year.
- Allowed: "4 févr.", "4, 5 et 7 févr."
- Forbidden: "2026-02-04", "04/02/2026", "4 février 2026".

FORBIDDEN CONTENT (HARD FAIL)
- Do NOT include score ranges, counts like "28 jours analysés", or any numbers not explicitly provided
  in window_aggregates.days_missing_weather / days_missing_calendar_flags.
- Do NOT infer causes beyond the provided signals explanations.

BUSINESS IMPACT RULES (MANDATORY)
- Must reference internal_context (e.g., "lieu mixte", "activité culturelle").
- Must translate signals into impacts:
  - météo → faisabilité / plan B (intérieur/extérieur)
  - concurrence → pression d’affluence / communication / horaire
  - calendrier → comportement (week-end, vacances, etc.)

IMPORTANT
- Do NOT output markdown.
- Do NOT include extra keys.
END OF MONTH — WINDOW WORST DAYS MODE
`.trim();
const PACKAGER_PROMPT_UI_V2_FR = `
SYSTEM
Tu es une couche de présentation FR pour des organisateurs d’événements.
Tu reformules un résultat déterministe "ui_v2" en français naturel, utile en lecture rapide.

VÉRITÉ (NON NÉGOCIABLE)
- Ne jamais inventer de fait.
- Ne jamais supprimer une date présente dans ui_v2 si la question demande toutes les dates.
- Ne jamais modifier un nombre.
- Ne jamais ajouter de causalité (“à cause de”, “grâce à”, etc.).
- Ne jamais recommander (“il faut”, “vous devriez”, “à privilégier”, “éviter absolument”).
- Ne jamais introduire d’information non présente dans ui_v2.
- Ne pas inclure de phrases techniques (pas de mention de “déterministe”, “V2”, “contrat”, etc.).

ENTRÉE (JSON)
{
  "question": string,
  "ui_v2": {
    "headline": string,
    "answer": string,
    "key_facts": string[]
  }
}

OBJECTIF DE SORTIE
Produire une réponse data-driven qui:
1) annonce clairement les dates concernées (dans answer)
2) détaille les faits et implications par date (dans key_facts), en gardant les regroupements lisibles.

RÈGLES "answer"
- answer sert à cadrer: il doit citer explicitement les date(s) retournée(s).
- Si la question demande “2” (top 2 / deux / 2), answer DOIT citer exactement 2 dates, ni plus ni moins.
- Si la question demande “3” (top 3 / trois / 3), answer DOIT citer exactement 3 dates, ni plus ni moins.
- answer ne doit pas répéter tous les faits: les faits détaillés vont dans key_facts.
- Dans "answer", une date DOIT être EXACTEMENT un libellé extrait de ui_v2.key_facts :
  - Prendre une ligne de ui_v2.key_facts qui commence par une date,
  - Puis copier STRICTEMENT la sous-chaîne AVANT le caractère "—" (tiret long).
  - Cette sous-chaîne (ex: "lundi 2 février 2026") est la SEULE forme autorisée dans answer.
- Interdit : ajouter "le", ajouter une virgule, abréger ("lundi 2"), ou reformuler la date.
- Si la question demande 2 (2/deux/top 2) : citer exactement 2 de ces libellés, ni plus ni moins.
- Si la question demande 3 (3/trois/top 3) : citer exactement 3 de ces libellés, ni plus ni moins.

RÈGLES "key_facts"
- key_facts doit commencer par les dates, et respecter l’ordre de ui_v2.key_facts.
- Pour chaque date retenue:
  - 1 ligne "DATE — faits principaux" (reprendre les faits déjà présents dans ui_v2.key_facts)
  - puis 0 à 2 lignes d’implications immédiatement après, au format:
    "→ <implication en français naturel>".
- Les implications doivent rester non-causales et non-prescriptives.
- IMPORTANT: ne pas ajouter de nouvelles dates qui ne sont pas dans ui_v2.key_facts.

SORTIE (JSON STRICT)
Retourner EXACTEMENT ce JSON, et aucune autre clé:
{
  "headline": string,
  "answer": string,
  "key_facts": string[]
}

FORMAT (HARD)
- Un seul objet JSON.
- Aucun markdown, aucun texte autour.
- Première char = { ; dernière char = }.
`.trim();
function isPlainObject$1(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
function extractUiDateLabels(ui_v2) {
  const out = [];
  const arr = Array.isArray(ui_v2?.key_facts) ? ui_v2.key_facts : [];
  for (const line of arr) {
    if (typeof line !== "string") continue;
    const s = line.trim();
    if (!s) continue;
    const m = s.match(
      /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\S+\s+\d{4}\b/i
    );
    if (!m) continue;
    const beforeDash = s.split("—")[0]?.trim() ?? s;
    if (beforeDash) out.push(beforeDash);
  }
  const seen = /* @__PURE__ */ new Set();
  const uniq = [];
  for (const d of out) {
    const k = norm(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
  }
  return uniq;
}
function requestedK(question) {
  const q = norm(question);
  if (/\b(2|deux)\b/.test(q)) return 2;
  if (/\b(3|trois)\b/.test(q)) return 3;
  return null;
}
function countMentionedDates(text, dateLabels) {
  const t = norm(text);
  let n = 0;
  for (const d of dateLabels) {
    if (t.includes(norm(d))) n++;
  }
  return n;
}
function countDateLinesInKeyFacts(key_facts, dateLabels) {
  let n = 0;
  for (const line of key_facts) {
    if (typeof line !== "string") continue;
    const s = line.trim();
    if (!s) continue;
    const sNorm = norm(s);
    const isDateLine = dateLabels.some((d) => sNorm.startsWith(norm(d)));
    if (isDateLine) n++;
  }
  return n;
}
function validate_packager_output_ui_v2(output, row) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject$1(output)) {
    return [false, ["Output must be a JSON object."]];
  }
  const allowed = /* @__PURE__ */ new Set(["headline", "answer", "key_facts"]);
  const keys = Object.keys(output);
  for (const k2 of keys) {
    if (!allowed.has(k2)) errors.push(`Unexpected key: ${k2}`);
  }
  for (const k2 of Array.from(allowed)) {
    if (!(k2 in output)) errors.push(`Missing key: ${k2}`);
  }
  if (typeof output.headline !== "string" || !output.headline.trim()) {
    errors.push("headline must be a non-empty string.");
  }
  if (typeof output.answer !== "string" || !output.answer.trim()) {
    errors.push("answer must be a non-empty string.");
  }
  if (!Array.isArray(output.key_facts)) {
    errors.push("key_facts must be an array.");
  } else {
    const bad = output.key_facts.filter((x) => typeof x !== "string" || !String(x).trim());
    if (bad.length) errors.push("key_facts must contain non-empty strings only.");
  }
  if (errors.length) return [false, errors, warnings];
  const question = typeof row?.question === "string" ? row.question : "";
  const ui_v2 = row?.ui_v2 ?? null;
  const dateLabels = extractUiDateLabels(ui_v2);
  if (!dateLabels.length) {
    warnings.push("Could not extract date labels from ui_v2.key_facts; relaxed date mention checks.");
    return [true, [], warnings];
  }
  const nInAnswer = countMentionedDates(output.answer, dateLabels);
  if (nInAnswer < 1) {
    errors.push("answer must mention at least one date_label from ui_v2.");
  }
  const keyFacts = output.key_facts;
  const nDateLines = countDateLinesInKeyFacts(keyFacts, dateLabels);
  if (nDateLines < 1) {
    errors.push("key_facts must include at least one date line starting with a date_label from ui_v2.");
  }
  const k = requestedK(question);
  if (k !== null) {
    if (nInAnswer !== k) {
      errors.push(`answer must mention exactly ${k} date_label(s) (question asks for ${k}).`);
    }
    if (nDateLines !== k) {
      errors.push(`key_facts must contain exactly ${k} date line(s) (question asks for ${k}).`);
    }
  }
  return [errors.length === 0, errors, warnings];
}
function isPlainObject(x) {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}
function isNonEmptyString(x, maxLen) {
  if (typeof x !== "string") return false;
  const s = x.trim();
  if (!s) return false;
  if (typeof maxLen === "number" && s.length > maxLen) return false;
  return true;
}
function isStringOrNull(x, maxLen) {
  if (x === null) return true;
  return isNonEmptyString(x, maxLen);
}
function uniqStrings(xs) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v of xs) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
function extraKeys(o, allowed) {
  const k = Object.keys(o);
  const allowedSet = new Set(allowed);
  return k.filter((x) => !allowedSet.has(x));
}
function hasOnlyKeys(o, allowed, errors, ctx) {
  const extras = extraKeys(o, allowed);
  if (extras.length > 0) errors.push(`${ctx}: unexpected keys: ${extras.join(", ")}`);
}
function requireKey(o, key, errors, ctx) {
  if (!(key in o)) errors.push(`${ctx}: missing key "${key}"`);
}
function validate_packager_output_month_orchestrator_against_row(output, row) {
  const errors = [];
  if (!isPlainObject(output)) {
    return [false, ["month_orchestrator: output is not an object"]];
  }
  const ALLOWED = ["run_month_window_summary", "run_month_special_days"];
  hasOnlyKeys(output, ALLOWED, errors, "month_orchestrator");
  requireKey(output, "run_month_window_summary", errors, "month_orchestrator");
  requireKey(output, "run_month_special_days", errors, "month_orchestrator");
  if ("run_month_window_summary" in output && typeof output.run_month_window_summary !== "boolean") {
    errors.push(`month_orchestrator: run_month_window_summary must be boolean`);
  }
  if ("run_month_special_days" in output && typeof output.run_month_special_days !== "boolean") {
    errors.push(`month_orchestrator: run_month_special_days must be boolean`);
  }
  const sd = row?.special_days;
  const special_days_len = Array.isArray(sd) ? sd.length : 0;
  if (special_days_len <= 0 && output.run_month_special_days === true) {
    errors.push(`month_orchestrator: run_month_special_days=true but row.special_days is empty`);
  }
  return errors.length ? [false, errors] : [true, []];
}
function validate_packager_output_month_window_summary_against_row(output, row) {
  const errors = [];
  if (!isPlainObject(output)) return [false, ["month_window_summary: output is not an object"]];
  const ALLOWED = [
    "headline",
    "summary",
    "key_facts",
    "operational_impacts",
    "recommended_actions",
    "per_date_notes",
    "caveat"
  ];
  hasOnlyKeys(output, ALLOWED, errors, "month_window_summary");
  requireKey(output, "headline", errors, "month_window_summary");
  requireKey(output, "summary", errors, "month_window_summary");
  requireKey(output, "key_facts", errors, "month_window_summary");
  requireKey(output, "operational_impacts", errors, "month_window_summary");
  requireKey(output, "recommended_actions", errors, "month_window_summary");
  requireKey(output, "per_date_notes", errors, "month_window_summary");
  requireKey(output, "caveat", errors, "month_window_summary");
  if ("headline" in output && !isNonEmptyString(output.headline, 120)) {
    errors.push("month_window_summary: headline must be non-empty string (<=120 chars)");
  }
  if ("summary" in output && !isNonEmptyString(output.summary, 500)) {
    errors.push("month_window_summary: summary must be non-empty string (<=500 chars)");
  }
  if ("key_facts" in output) {
    if (!Array.isArray(output.key_facts)) {
      errors.push("month_window_summary: key_facts must be an array");
    } else {
      const xs = uniqStrings(output.key_facts);
      if (xs.length < 1 || xs.length > 3) {
        errors.push("month_window_summary: key_facts must contain 1–3 non-empty unique strings");
      }
    }
  }
  if ("operational_impacts" in output) {
    if (!Array.isArray(output.operational_impacts)) {
      errors.push("month_window_summary: operational_impacts must be an array");
    } else {
      const xs = uniqStrings(output.operational_impacts);
      if (xs.length < 2 || xs.length > 4) {
        errors.push("month_window_summary: operational_impacts must contain 2–4 non-empty unique strings");
      }
    }
  }
  if ("recommended_actions" in output) {
    if (!Array.isArray(output.recommended_actions)) {
      errors.push("month_window_summary: recommended_actions must be an array");
    } else {
      const xs = uniqStrings(output.recommended_actions);
      if (xs.length < 2 || xs.length > 4) {
        errors.push("month_window_summary: recommended_actions must contain 2–4 non-empty unique strings");
      }
    }
  }
  if ("per_date_notes" in output) {
    if (!Array.isArray(output.per_date_notes)) {
      errors.push("month_window_summary: per_date_notes must be an array");
    } else {
      const xs = uniqStrings(output.per_date_notes);
      if (xs.length < 1 || xs.length > 7) {
        errors.push("month_window_summary: per_date_notes must contain 1–7 non-empty unique strings");
      }
    }
  }
  if ("caveat" in output && !isStringOrNull(output.caveat, 220)) {
    errors.push("month_window_summary: caveat must be string or null");
  }
  return errors.length ? [false, errors] : [true, []];
}
function validate_packager_output_month_special_days_against_row(output, row) {
  const errors = [];
  if (!isPlainObject(output)) return [false, ["month_special_days: output is not an object"]];
  const ALLOWED = ["headline", "summary", "special_days", "caveat"];
  hasOnlyKeys(output, ALLOWED, errors, "month_special_days");
  requireKey(output, "headline", errors, "month_special_days");
  requireKey(output, "summary", errors, "month_special_days");
  requireKey(output, "special_days", errors, "month_special_days");
  requireKey(output, "caveat", errors, "month_special_days");
  if ("headline" in output && !isNonEmptyString(output.headline, 120)) {
    errors.push("month_special_days: headline must be non-empty string (<=120 chars)");
  }
  if ("summary" in output && !isNonEmptyString(output.summary, 600)) {
    errors.push("month_special_days: summary must be non-empty string (<=600 chars)");
  }
  if ("caveat" in output && !isStringOrNull(output.caveat, 220)) {
    errors.push("month_special_days: caveat must be string or null");
  }
  if ("special_days" in output) {
    if (!Array.isArray(output.special_days)) {
      errors.push("month_special_days: special_days must be an array");
    } else {
      for (let i = 0; i < output.special_days.length; i++) {
        const item = output.special_days[i];
        const ctx = `month_special_days: special_days[${i}]`;
        if (!isPlainObject(item)) {
          errors.push(`${ctx} must be an object`);
          continue;
        }
        const allowedItemKeys = ["date", "labels", "types"];
        hasOnlyKeys(item, allowedItemKeys, errors, ctx);
        requireKey(item, "date", errors, ctx);
        requireKey(item, "labels", errors, ctx);
        requireKey(item, "types", errors, ctx);
        if ("date" in item && !isNonEmptyString(item.date, 40)) {
          errors.push(`${ctx}.date must be non-empty string`);
        }
        if ("labels" in item) {
          if (!Array.isArray(item.labels)) {
            errors.push(`${ctx}.labels must be an array`);
          } else {
            const ls = uniqStrings(item.labels);
            if (ls.length < 1 || ls.length > 3) {
              errors.push(`${ctx}.labels must contain 1 to 3 non-empty unique strings`);
            }
          }
        }
        if ("types" in item) {
          if (!Array.isArray(item.types)) {
            errors.push(`${ctx}.types must be an array`);
          } else {
            const allowedTypes = /* @__PURE__ */ new Set(["public_holiday", "school_holiday", "commercial_event"]);
            const ts = uniqStrings(item.types);
            if (ts.length < 1 || ts.length > 3) {
              errors.push(`${ctx}.types must contain 1 to 3 entries`);
            }
            for (const t of ts) {
              if (!allowedTypes.has(t)) errors.push(`${ctx}.types contains invalid value "${t}"`);
            }
          }
        }
      }
    }
  }
  return errors.length ? [false, errors] : [true, []];
}
async function runAIPackagerClaude(args) {
  const { mode, row, submode } = args;
  if (!row || typeof row !== "object") {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Missing or invalid row payload."],
      warnings: [],
      raw_text: ""
    };
  }
  if (mode === "month" && !submode) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Month mode requires explicit submode."],
      warnings: [],
      raw_text: ""
    };
  }
  const row_enriched = { ...row ?? {} };
  if (args.aiLocationContextRow && typeof args.aiLocationContextRow === "object") {
    for (const [k, v] of Object.entries(args.aiLocationContextRow)) {
      if (!(k in row_enriched)) row_enriched[k] = v;
    }
  }
  const payload = pickAllowedPayload(row_enriched);
  let system_prompt = "";
  let validatorFn = (_output, _row) => [
    false,
    ["Internal error: validatorFn not initialized."]
  ];
  if (mode === "ui_packaging_v2") {
    system_prompt = PACKAGER_PROMPT_UI_V2_FR;
    validatorFn = validate_packager_output_ui_v2;
  } else if (mode === "month") {
    switch (submode) {
      case "orchestrator":
        system_prompt = PACKAGER_PROMPT_MONTH_MODE;
        validatorFn = validate_packager_output_month_orchestrator_against_row;
        break;
      case "window_summary":
        system_prompt = PACKAGER_PROMPT_MONTH_WINDOW_SUMMARY_MODE;
        validatorFn = validate_packager_output_month_window_summary_against_row;
        break;
      case "window_worst_days":
        system_prompt = PACKAGER_PROMPT_MONTH_WINDOW_WORST_DAYS_MODE;
        validatorFn = validate_packager_output_month_window_summary_against_row;
        break;
      case "special_days":
        system_prompt = PACKAGER_PROMPT_MONTH_SPECIAL_DAYS_MODE;
        validatorFn = validate_packager_output_month_special_days_against_row;
        break;
      default:
        return {
          ok: false,
          mode,
          output: null,
          errors: [`Unknown month submode: ${String(submode)}`],
          warnings: [],
          raw_text: ""
        };
    }
  } else {
    return {
      ok: false,
      mode,
      output: null,
      errors: [`Unsupported mode: ${String(mode)}`],
      warnings: [],
      raw_text: ""
    };
  }
  const call = await callClaudeMessagesAPI({
    system: system_prompt,
    userPayload: payload,
    temperature: 0,
    maxTokens: 600,
    timeoutMs: 3e4
  });
  if (!call.ok) {
    return {
      ok: false,
      mode,
      output: null,
      errors: call.errors,
      warnings: [],
      raw_text: call.rawText
    };
  }
  if (!call.rawText.trim()) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Model returned empty output."],
      warnings: [],
      raw_text: ""
    };
  }
  function stripCodeFence(s) {
    const t = s.trim();
    if (!t.startsWith("```")) return t;
    const lines = t.split("\n");
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    return lines.join("\n").trim();
  }
  const normalized = stripCodeFence(call.rawText);
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Model returned non-JSON output."],
      warnings: [],
      raw_text: call.rawText
    };
  }
  const parsed = parseJsonObjectStrict(normalized);
  if (!parsed.ok) {
    return {
      ok: false,
      mode,
      output: null,
      errors: [parsed.error],
      warnings: [],
      raw_text: normalized
    };
  }
  console.log("[packager][debug] mode:", mode, "submode:", submode);
  console.log("[packager][debug] validatorFn head:", String(validatorFn).slice(0, 400));
  const res = validatorFn(parsed.value, row_enriched);
  let v_ok = false;
  let v_errors = [];
  let v_warnings = [];
  if (!Array.isArray(res) || res.length !== 2 && res.length !== 3) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Unexpected validator return shape."],
      warnings: [],
      raw_text: normalized
    };
  }
  v_ok = Boolean(res[0]);
  v_errors = Array.isArray(res[1]) ? res[1] : [];
  v_warnings = res.length === 3 && Array.isArray(res[2]) ? res[2] : [];
  if (!v_ok) {
    return {
      ok: false,
      mode,
      output: null,
      errors: v_errors,
      warnings: v_warnings,
      raw_text: normalized
    };
  }
  return {
    ok: true,
    mode,
    output: parsed.value,
    errors: [],
    warnings: v_warnings,
    raw_text: normalized
  };
}
export {
  runAIPackagerClaude as r
};
