import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_MAX_TOKENS = 500;
const ANTHROPIC_TEMPERATURE = 0.7;

const BQ_PROJECT_ID = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
const BQ_SEMANTIC_PROJECT = "muse-square-open-data";

type Channel = "gbp" | "instagram" | "email" | "sms" | "internal" | "phone";

const CHANNEL_CONFIG: Record<
  string,
  { label: string; maxChars: number; rules: string }
> = {
  gbp: {
    label: "post Google Business Profile",
    maxChars: 1500,
    rules:
      "Commence par un titre court (1 ligne, avec 1 émoji pertinent). Puis le corps (3-6 phrases). Termine par un appel à l'action avec lien si disponible.",
  },
  instagram: {
    label: "légende Instagram",
    maxChars: 2200,
    rules:
      "Première phrase = accroche (visible avant 'voir plus'). Corps : 3-5 phrases. Termine par 3-5 hashtags pertinents et locaux. Pas de lien (non cliquable sur Instagram).",
  },
  email: {
    label: "email court",
    maxChars: 800,
    rules:
      "Première ligne = objet de l'email (max 60 caractères, préfixé par 'Objet : '). Ligne vide. Corps : 3-5 phrases. Termine par un CTA clair. Signe avec le nom du lieu.",
  },
  sms: {
    label: "SMS",
    maxChars: 160,
    rules:
      "Maximum 160 caractères tout compris. Pas de lien. Identifie l'expéditeur en début. Va droit au but.",
  },
};

const AUD_FR: Record<string, string> = {
  local: "résidents locaux",
  professionals: "professionnels",
  tourists: "touristes",
  students: "étudiants",
  families: "familles",
  seniors: "seniors",
  general_public: "grand public",
  art_lovers: "amateurs d'art",
  mixed: "public mixte",
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function effectiveActivity(p: any): string {
  const desc = safeStr(p?.business_short_description);
  if (desc) return desc;
  try {
    const auto = JSON.parse(safeStr(p?.auto_enriched_description) || "{}");
    if (auto?.business_description) return String(auto.business_description).trim();
  } catch {}
  return safeStr(p?.company_activity_type);
}

function distLabel(m: unknown): string {
  const d = safeNum(m);
  if (d === null || d <= 0) return "";
  return d < 1000
    ? `${Math.round(d)} m`
    : `${(d / 1000).toFixed(1)} km`;
}

function fmtDateFr(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dt);
}

function weatherType(signal: any): string {
  const r = safeNum(signal?.lvl_rain) ?? 0;
  const w = safeNum(signal?.lvl_wind) ?? 0;
  const s = safeNum(signal?.lvl_snow) ?? 0;
  const h = safeNum(signal?.lvl_heat) ?? 0;
  const c = safeNum(signal?.lvl_cold) ?? 0;
  const max = Math.max(r, w, s, h, c);
  if (max === 0) return "météo";
  if (r === max) return "pluie";
  if (s === max) return "neige";
  if (w === max) return "vent";
  if (h === max) return "chaleur";
  return "froid";
}

// ────────────────────────────────────────────────────────────
// System prompt builder
// ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  profile: any,
  channel: string
): string {
  const cfg = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.gbp;
  const siteName = safeStr(profile?.site_name) || safeStr(profile?.location_label) || "notre établissement";
  const desc = safeStr(profile?.business_short_description);
  let autoEnriched: Record<string, string | null> = {};
  try { autoEnriched = JSON.parse(safeStr(profile?.auto_enriched_description) || "{}"); } catch {}
  const autoDesc = safeStr(autoEnriched?.business_description);
  const autoServices = safeStr(autoEnriched?.services);
  const autoTone = safeStr(autoEnriched?.tone_of_voice);
  const autoDiff = safeStr(autoEnriched?.key_differentiators);
  const autoProgramming = safeStr(autoEnriched?.current_programming);
  const effectiveDesc = desc || autoDesc;
  const aud1 = AUD_FR[safeStr(profile?.primary_audience_1)] || safeStr(profile?.primary_audience_1) || "";
  const aud2 = AUD_FR[safeStr(profile?.primary_audience_2)] || safeStr(profile?.primary_audience_2) || "";
  const audLine = [aud1, aud2].filter(Boolean).join(" et ");
  const city = safeStr(profile?.city_name);
  const activity = safeStr(profile?.company_activity_type);

  const eventTypes = [safeStr(profile?.event_type_1), safeStr(profile?.event_type_2), safeStr(profile?.event_type_3)].filter(Boolean);
  const objective = safeStr(profile?.main_event_objective);
  const capacity = safeNum(profile?.venue_capacity);
  const hours = safeStr(profile?.operating_hours);
  const catchment = safeStr(profile?.geographic_catchment);
  const seasonality = safeStr(profile?.seasonality);
  const website = safeStr(profile?.website_url);
  const instagram = safeStr(profile?.instagram_url);

  const identityLines: string[] = [];
  identityLines.push(`Établissement : ${siteName}${city ? ", " + city : ""}`);
  if (effectiveDesc) identityLines.push(`Description : ${effectiveDesc}`);
  if (autoServices && !desc) identityLines.push(`Services : ${autoServices}`);
  if (autoProgramming) identityLines.push(`Programmation actuelle : ${autoProgramming}`);
  if (autoDiff && !desc) identityLines.push(`Différenciants : ${autoDiff}`);
  if (autoTone) identityLines.push(`Ton de la marque : ${autoTone}`);
  if (activity) identityLines.push(`Activité : ${activity}`);
  if (eventTypes.length) identityLines.push(`Types d'événements : ${eventTypes.join(", ")}`);
  if (audLine) identityLines.push(`Public cible : ${audLine}`);
  if (objective) identityLines.push(`Objectif principal : ${objective}`);
  if (capacity) identityLines.push(`Capacité : ${capacity} personnes`);
  if (hours) identityLines.push(`Horaires : ${hours}`);
  if (catchment) identityLines.push(`Zone de chalandise : ${catchment}`);
  if (seasonality) identityLines.push(`Saisonnalité : ${seasonality}`);
  if (channel === "instagram" && instagram) identityLines.push(`Instagram : ${instagram}`);
  if ((channel === "gbp" || channel === "email") && website) identityLines.push(`Site web : ${website}`);

  return `Tu es le rédacteur de contenu de ${siteName}. Tu connais parfaitement cet établissement et tu rédiges en son nom.

IDENTITÉ DE L'ÉTABLISSEMENT :
${identityLines.join("\n")}

Tu rédiges un ${cfg.label} en français, prêt à publier.

Règles :
- Écris comme si tu ÉTAIS l'établissement — utilise "nous", "notre", "chez nous"
- Mentionne des éléments concrets et spécifiques à cet établissement (activité, type d'événements, public cible) — ne reste JAMAIS générique
- Ton professionnel mais accessible — pas de jargon marketing, pas de superlatifs vides
- Maximum ${cfg.maxChars} caractères
- ${cfg.rules}
- Ne mentionne JAMAIS Muse Square, ni le fait que cette information vient d'une plateforme d'intelligence
- Le texte doit pouvoir être publié tel quel sans modification
- Inclus un appel à l'action concret quand pertinent
- Pas d'émoji excessifs — 1 ou 2 maximum, en début de post si pertinent

Réponds UNIQUEMENT avec le texte du post. Pas de commentaire, pas d'explication, pas de guillemets autour du texte.`;
}

// ────────────────────────────────────────────────────────────
// User prompt builders (per signal type)
// ────────────────────────────────────────────────────────────

type PromptContext = {
  profile: any;
  signal: any;
  channel: string;
  card_what: string;
  card_sowhat: string;
  competitor_context: any[] | null;
  day_context: any | null;
  mobility_context: any[] | null;
};

function buildUserPrompt(ctx: PromptContext): string {
  const sub = safeStr(ctx.signal?.change_subtype).toLowerCase();
  const ch = ctx.channel;

  // Try specific template first
  const key = `${sub}__${ch}`;
  const tmpl = TEMPLATES[key];
  if (tmpl) return tmpl(ctx);

  // Fallback: generic per channel
  return buildGenericPrompt(ctx);
}

// ── Template registry ──

const TEMPLATES: Record<string, (ctx: PromptContext) => string> = {};

// ── Mobility disruption ──

function mobilityPromptBase(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const mob = ctx.mobility_context?.[0];
  const dist = distLabel(s.distance_m);
  const stopName = safeStr(p.nearest_transit_stop_name);
  const stopDist = safeNum(p.nearest_transit_stop_distance_m);
  const lines = Array.isArray(p.nearest_transit_line_name) ? p.nearest_transit_line_name.join(", ") : "";
  const route = safeStr(mob?.route_long_name) || safeStr(mob?.short_name) || "";
  const begin = safeStr(mob?.disruption_begin_ts);
  const end = safeStr(mob?.disruption_end_ts);
  const category = safeStr(s.mobility_disruption_category) || safeStr(mob?.disruption_category) || "Perturbation";
  const mode = safeStr(s.mobility_mode);
  const label = safeStr(s.event_label) || category;
  const date = fmtDateFr(safeStr(s.affected_date));

  return `Signal : ${label}${dist ? " à " + dist + " de notre site" : ""}.
Mode de transport : ${mode || "non précisé"}.
Catégorie : ${category}.
Date : ${date}.
${route ? "Ligne / route affectée : " + route : ""}
${begin && end ? "Période : " + begin + " → " + end : ""}
${stopName ? "Arrêt le plus proche de notre site : " + stopName + (stopDist ? " (" + Math.round(stopDist) + " m)" : "") : ""}
${lines ? "Lignes desservant notre site : " + lines : ""}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} informant nos visiteurs de cette perturbation et proposant un itinéraire alternatif pour accéder à notre site.
${safeStr(ctx.profile.website_url) ? "Lien vers notre site : " + ctx.profile.website_url : ""}`.trim();
}

TEMPLATES["mobility_disruption__gbp"] = mobilityPromptBase;
TEMPLATES["mobility_disruption__instagram"] = mobilityPromptBase;
TEMPLATES["mobility_disruption__email"] = mobilityPromptBase;
TEMPLATES["mobility_disruption__sms"] = mobilityPromptBase;
TEMPLATES["mobility_disruption_planned__gbp"] = mobilityPromptBase;
TEMPLATES["mobility_disruption_planned__instagram"] = mobilityPromptBase;
TEMPLATES["mobility_disruption_planned__email"] = mobilityPromptBase;

// ── Competitor event launch ──

function competitorLaunchPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const comp = ctx.competitor_context?.[0];
  const compName = safeStr(comp?.competitor_name) || safeStr(s.event_label) || "un concurrent";
  const evName = safeStr(comp?.event_name) || "";
  const compAud = AUD_FR[safeStr(comp?.event_primary_audience)] || safeStr(comp?.event_primary_audience) || "";
  const dist = distLabel(s.distance_m || comp?.distance_from_location_m);
  const aud = AUD_FR[safeStr(p.primary_audience_1)] || safeStr(p.primary_audience_1) || "";

  return `Contexte interne (NE PAS MENTIONNER dans le post) : le concurrent ${compName}${evName ? ' lance "' + evName + '"' : " lance un événement"}${compAud ? " ciblant " + compAud : ""}${dist ? " à " + dist : ""}.

Notre activité : ${effectiveActivity(p)}
Notre public : ${aud || "notre clientèle habituelle"}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} qui met en avant NOTRE offre de manière positive pour ce week-end. Le post doit donner envie à notre public de venir chez nous. Ne mentionne jamais le concurrent, ne critique jamais. Mets en avant ce qui nous rend unique.
${ctx.channel === "instagram" ? "Termine par des hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["competitor_event_launch__gbp"] = competitorLaunchPrompt;
TEMPLATES["competitor_event_launch__instagram"] = competitorLaunchPrompt;
TEMPLATES["competitor_event_launch__email"] = competitorLaunchPrompt;

// ── Competitor audience conflict ──

function competitorConflictPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const comp = ctx.competitor_context?.[0];
  const compName = safeStr(comp?.competitor_name) || "un concurrent";
  const dist = distLabel(s.distance_m || comp?.distance_from_location_m);
  const sharedAud = AUD_FR[safeStr(p.primary_audience_1)] || safeStr(p.primary_audience_1) || "votre public";

  return `Contexte interne (NE PAS MENTIONNER) : conflit direct avec ${compName} — même public (${sharedAud}), même date${dist ? ", à " + dist : ""}.

Notre activité : ${effectiveActivity(p)}
Notre public : ${sharedAud}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} de type "offre flash" ou "événement exclusif" qui donne une raison urgente de venir chez nous. Sans jamais mentionner le concurrent. Ton dynamique et exclusif.
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["competitor_audience_conflict__gbp"] = competitorConflictPrompt;
TEMPLATES["competitor_audience_conflict__instagram"] = competitorConflictPrompt;
TEMPLATES["competitor_audience_conflict__email"] = competitorConflictPrompt;

// ── Competition pressure spike ──

function pressureSpikePrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const newN = safeStr(s.new_value);
  const oldN = safeStr(s.old_value);
  const delta = (safeNum(s.new_value) ?? 0) - (safeNum(s.old_value) ?? 0);

  return `Contexte interne : pression concurrentielle en hausse (${newN} événements à 5 km, +${delta} vs avant).

Notre activité : ${effectiveActivity(p)}
Notre public : ${AUD_FR[safeStr(p.primary_audience_1)] || "notre clientèle"}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} de fidélisation — rappeler à nos clients existants pourquoi revenir cette semaine. Ton personnel, pas marketing. Mentionner un avantage concret (exclusivité, nouveauté, ou simplement "on vous attend").
${ctx.channel === "email" ? "Signe : L'équipe " + (safeStr(p.site_name) || safeStr(p.location_label)) : ""}
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}`.trim();
}

TEMPLATES["competition_pressure_spike__gbp"] = pressureSpikePrompt;
TEMPLATES["competition_pressure_spike__instagram"] = pressureSpikePrompt;
TEMPLATES["competition_pressure_spike__email"] = pressureSpikePrompt;

// ── Weather worsened / hazard onset ──

function weatherWorsenedPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const type = weatherType(s);
  const locType = safeStr(p.cl_location_type) || safeStr(p.location_type) || "non précisé";
  const isOutdoor = locType === "outdoor" || locType === "mixed";
  const wSens = safeNum(p.weather_sensitivity) ?? 0;
  const date = fmtDateFr(safeStr(s.affected_date));

  return `Conditions météo dégradées prévues le ${date} :
- Type : ${type} (niveau ${safeStr(s.old_value) || "?"} → ${safeStr(s.new_value) || "?"})
- Notre lieu est ${locType} (sensibilité météo : ${wSens}/5)

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} rassurant nos visiteurs :
${isOutdoor ? "- Informe des mesures prises (plan B intérieur, équipements adaptés)" : "- Rassure que nous sommes ouverts normalement malgré la météo"}
- Inclure les horaires si pertinent : ${safeStr(p.operating_hours) || "non renseignés"}
${ctx.channel === "email" ? "Signe : L'équipe " + (safeStr(p.site_name) || safeStr(p.location_label)) : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}`.trim();
}

TEMPLATES["weather_worsened__gbp"] = weatherWorsenedPrompt;
TEMPLATES["weather_worsened__instagram"] = weatherWorsenedPrompt;
TEMPLATES["weather_worsened__email"] = weatherWorsenedPrompt;
TEMPLATES["weather_hazard_onset__gbp"] = weatherWorsenedPrompt;
TEMPLATES["weather_hazard_onset__instagram"] = weatherWorsenedPrompt;
TEMPLATES["weather_hazard_onset__email"] = weatherWorsenedPrompt;

// ── Weather improved ──

function weatherImprovedPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const locType = safeStr(p.cl_location_type) || safeStr(p.location_type) || "";
  const isOutdoor = locType === "outdoor" || locType === "mixed";
  const date = fmtDateFr(safeStr(s.affected_date));

  return `La météo s'améliore pour le ${date} (niveau ${safeStr(s.old_value) || "?"} → ${safeStr(s.new_value) || "?"}).
Notre lieu est ${locType || "non précisé"}.

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} annonçant le retour de conditions favorables et invitant à (re)venir.
${isOutdoor ? "Mentionner que la terrasse / les installations extérieures sont de retour." : ""}
Ton optimiste.
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["weather_improved__gbp"] = weatherImprovedPrompt;
TEMPLATES["weather_improved__instagram"] = weatherImprovedPrompt;

// ── Opportunity (day context: regime A) ──

function opportunityPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const d = ctx.day_context;
  const score = safeNum(d?.opportunity_score) ?? safeNum(d?.opportunity_score_final_local);
  const holiday = safeStr(d?.holiday_name);
  const vacation = safeStr(d?.vacation_name);
  const comp5km = safeNum(d?.events_within_5km_count);
  const date = fmtDateFr(safeStr(s.affected_date));
  const contextParts = [holiday, vacation].filter(Boolean);
  if (comp5km !== null && comp5km <= 3) contextParts.push("faible concurrence");

  return `Journée exceptionnelle détectée le ${date} :
${score !== null ? "- Score : " + score + "/10" : ""}
${contextParts.length ? "- Contexte : " + contextParts.join(", ") : ""}

Notre activité : ${effectiveActivity(p)}
Notre public : ${AUD_FR[safeStr(p.primary_audience_1)] || "notre clientèle"}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} ${ctx.channel === "instagram" ? '"événement du jour" / "bon plan"' : "annonçant une offre ou un moment fort"} qui capte le trafic spontané. Mentionne un avantage concret de venir aujourd'hui. Ton enthousiaste mais pas forcé.
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["_day_opportunity__gbp"] = opportunityPrompt;
TEMPLATES["_day_opportunity__instagram"] = opportunityPrompt;
TEMPLATES["score_up__gbp"] = opportunityPrompt;
TEMPLATES["score_up__instagram"] = opportunityPrompt;

// ── Competitor event ending ──

function competitorEndingPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const comp = ctx.competitor_context?.[0];
  const compName = safeStr(comp?.competitor_name) || "un concurrent";
  const compAud = AUD_FR[safeStr(comp?.event_primary_audience)] || AUD_FR[safeStr(comp?.competitor_primary_audience)] || "";
  const aud = AUD_FR[safeStr(p.primary_audience_1)] || "";

  return `Contexte interne (NE PAS MENTIONNER) : le concurrent ${compName} termine sa programmation.${compAud ? " Son public (" + compAud + ") est libéré." : ""}

Notre activité : ${effectiveActivity(p)}
Notre public : ${aud || "notre clientèle"}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} de type "bienvenue" ou "offre de rentrée" ciblant ce public qui cherche une nouvelle activité. Sans mentionner le concurrent. Ton accueillant.
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["competitor_event_ending__gbp"] = competitorEndingPrompt;
TEMPLATES["competitor_event_ending__instagram"] = competitorEndingPrompt;

// ── Mega event activation ──

function megaEventPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;
  const evName = safeStr(s.event_label) || "un méga-événement";

  return `Un méga-événement (${evName}) commence cette semaine dans la zone.
Impact attendu : afflux de visiteurs + perturbations mobilité.

Notre activité : ${effectiveActivity(p)}
Notre lieu : ${safeStr(p.site_name) || safeStr(p.location_label)}, ${safeStr(p.city_name)}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} qui surfe sur l'événement pour capter son audience. Exemple de ton : "Vous êtes en ville pour ${evName} ? Passez nous voir !" Ton opportuniste mais authentique.
${ctx.channel === "instagram" ? "Inclure des hashtags liés à l'événement + locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["mega_event_activation__gbp"] = megaEventPrompt;
TEMPLATES["mega_event_activation__instagram"] = megaEventPrompt;

// ── Mega event end ──

function megaEventEndPrompt(ctx: PromptContext): string {
  const s = ctx.signal;
  const p = ctx.profile;

  return `Le méga-événement "${safeStr(s.event_label) || "événement"}" se termine. Le public local revient, la mobilité se normalise.

Notre activité : ${effectiveActivity(p)}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} invitant le public local à revenir. Ton "retour à la normale", chaleureux.
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

TEMPLATES["mega_event_end__gbp"] = megaEventEndPrompt;
TEMPLATES["mega_event_end__instagram"] = megaEventEndPrompt;

// ── Generic fallback ──

function buildGenericPrompt(ctx: PromptContext): string {
  const p = ctx.profile;
  return `Signal détecté : ${ctx.card_what}
Impact pour votre activité : ${ctx.card_sowhat}

Rédige un ${CHANNEL_CONFIG[ctx.channel]?.label || "post"} adapté à cette situation pour ${safeStr(p.site_name) || safeStr(p.location_label) || "notre établissement"}.
${ctx.channel === "instagram" ? "Hashtags locaux (" + safeStr(p.city_name) + ")." : ""}
${ctx.channel === "gbp" && safeStr(p.website_url) ? "Lien : " + p.website_url : ""}`.trim();
}

// ────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // ── Auth ──
    const userId =
      (locals as any)?.auth?.()?.userId ??
      (locals as any)?.userId ??
      null;
    if (!userId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Non authentifié" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const locationId =
      (locals as any)?.location_id ??
      null;
    if (!locationId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Location manquante" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // ── Parse body ──
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(
        JSON.stringify({ ok: false, error: "Corps invalide" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const actionKey = safeStr(body.action_key);
    const channel = safeStr(body.channel) as Channel;
    const changeSubtype = safeStr(body.change_subtype);
    const signal = body.signal || {};
    const cardWhat = safeStr(body.card_what);
    const cardSowhat = safeStr(body.card_sowhat);

    if (!actionKey || !channel || !changeSubtype) {
      return new Response(
        JSON.stringify({ ok: false, error: "Champs requis : action_key, channel, change_subtype" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (channel === "internal" || channel === "phone") {
      return new Response(
        JSON.stringify({ ok: false, error: "Pas de draft pour le canal " + channel }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // ── BigQuery client ──
    const bq = makeBQClient(BQ_PROJECT_ID);

    async function bqOne(query: string, params: Record<string, any>) {
      const [rows] = await bq.query({ query, location: "EU", params });
      return rows?.[0] ?? null;
    }

    async function bqAll(query: string, params: Record<string, any>) {
      const [rows] = await bq.query({ query, location: "EU", params });
      return rows ?? [];
    }

    // ── Fetch profile (always) ──
    const profile = await bqOne(
      `SELECT * FROM \`${BQ_SEMANTIC_PROJECT}.semantic.vw_insight_event_ai_location_context\`
       WHERE location_id = @location_id LIMIT 1`,
      { location_id: locationId }
    );

    if (!profile) {
      return new Response(
        JSON.stringify({ ok: false, error: "Profil introuvable" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // ── Conditional data fetches ──
    const affectedDate = safeStr(signal.affected_date);

    const COMPETITION_SUBTYPES = new Set([
      "competitor_event_launch",
      "competitor_audience_conflict",
      "competition_pressure_spike",
      "competitor_event_ending",
    ]);

    const OPPORTUNITY_SUBTYPES = new Set([
      "score_up",
      "_day_opportunity",
    ]);

    const MOBILITY_SUBTYPES = new Set([
      "mobility_disruption",
      "mobility_disruption_planned",
    ]);

    let competitorContext: any[] | null = null;
    let dayContext: any | null = null;
    let mobilityContext: any[] | null = null;

    if (COMPETITION_SUBTYPES.has(changeSubtype) && affectedDate) {
      competitorContext = await bqAll(
        `SELECT * FROM \`${BQ_SEMANTIC_PROJECT}.semantic.vw_insight_event_competitor_signals\`
         WHERE location_id = @location_id
           AND DATE(event_date) = DATE(@affected_date)
         ORDER BY conflict_score DESC
         LIMIT 5`,
        { location_id: locationId, affected_date: affectedDate }
      );
    }

    if (OPPORTUNITY_SUBTYPES.has(changeSubtype) && affectedDate) {
      dayContext = await bqOne(
        `SELECT * FROM \`${BQ_SEMANTIC_PROJECT}.semantic.vw_insight_event_day_surface\`
         WHERE location_id = @location_id
           AND date = DATE(@affected_date)
         LIMIT 1`,
        { location_id: locationId, affected_date: affectedDate }
      );
    }

    if (MOBILITY_SUBTYPES.has(changeSubtype) && affectedDate) {
      mobilityContext = await bqAll(
        `SELECT * FROM \`${BQ_SEMANTIC_PROJECT}.semantic.vw_insight_event_mobility_disruptions\`
         WHERE location_id = @location_id
           AND disruption_date = DATE(@affected_date)
         ORDER BY perturbation_lvl DESC
         LIMIT 5`,
        { location_id: locationId, affected_date: affectedDate }
      );
    }

    // ── Build prompts ──
    const systemPrompt = buildSystemPrompt(profile, channel);

    const promptCtx: PromptContext = {
      profile,
      signal: { ...signal, change_subtype: changeSubtype },
      channel,
      card_what: cardWhat,
      card_sowhat: cardSowhat,
      competitor_context: competitorContext,
      day_context: dayContext,
      mobility_context: mobilityContext,
    };

    const userPrompt = buildUserPrompt(promptCtx);

    const templateId = (() => {
      const key = `${changeSubtype}__${channel}`;
      return TEMPLATES[key] ? key : `generic__${channel}`;
    })();

    // ── Call Anthropic ──
    const apiKey = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY manquante" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        temperature: ANTHROPIC_TEMPERATURE,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const anthropicJson = await anthropicRes.json().catch(() => null);
    if (!anthropicJson) {
      return new Response(
        JSON.stringify({ ok: false, error: "Réponse Anthropic invalide" }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const textBlock = anthropicJson.content?.find((b: any) => b.type === "text");
    const draftText = safeStr(textBlock?.text);

    if (!draftText) {
      return new Response(
        JSON.stringify({ ok: false, error: "Draft vide" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // ── Parse title/body for GBP ──
    let title: string | null = null;
    let draftBody = draftText;

    if (channel === "gbp") {
      const lines = draftText.split("\n").filter((l: string) => l.trim());
      if (lines.length >= 2) {
        title = lines[0].trim();
        draftBody = lines.slice(1).join("\n").trim();
      }
    }

    // ── Extract hashtags for Instagram ──
    let hashtags: string | null = null;
    if (channel === "instagram") {
      const hashtagMatch = draftText.match(/((?:#\S+\s*){2,})$/);
      if (hashtagMatch) {
        hashtags = hashtagMatch[1].trim();
      }
    }

    // ── Parse subject for email ──
    let emailSubject: string | null = null;
    if (channel === "email") {
      const subjectMatch = draftText.match(/^Objet\s*:\s*(.+)/i);
      if (subjectMatch) {
        emailSubject = subjectMatch[1].trim();
        draftBody = draftText.replace(/^Objet\s*:\s*.+\n?\n?/i, "").trim();
      }
    }

    const cfg = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.gbp;

    // ── Analytics (fire-and-forget) ──
    const draftLogTable = bq
      .dataset("insight_event", { projectId: BQ_SEMANTIC_PROJECT })
      .table("action_draft_log");

    const logRow = {
      draft_id: crypto.randomUUID(),
      user_id: userId,
      location_id: locationId,
      change_subtype: changeSubtype,
      action_key: actionKey,
      channel,
      prompt_template_id: templateId,
      char_count: draftText.length,
      created_at: new Date().toISOString(),
    };

    draftLogTable.insert([logRow]).catch(async (err: any) => {
      if (err?.code === 404 || err?.message?.includes("Not found")) {
        try {
          await bq
            .dataset("insight_event", { projectId: BQ_SEMANTIC_PROJECT })
            .createTable("action_draft_log", {
              schema: {
                fields: [
                  { name: "draft_id", type: "STRING", mode: "REQUIRED" },
                  { name: "user_id", type: "STRING", mode: "REQUIRED" },
                  { name: "location_id", type: "STRING" },
                  { name: "change_subtype", type: "STRING" },
                  { name: "action_key", type: "STRING" },
                  { name: "channel", type: "STRING" },
                  { name: "prompt_template_id", type: "STRING" },
                  { name: "char_count", type: "INT64" },
                  { name: "created_at", type: "TIMESTAMP" },
                ],
              },
            });
          await draftLogTable.insert([logRow]);
        } catch {
          // Silent — analytics should never block the response
        }
      }
    });

    // ── Response ──
    return new Response(
      JSON.stringify({
        ok: true,
        draft: {
          channel,
          title,
          body: draftBody,
          subject: emailSubject,
          cta: null,
          hashtags,
          full_text: draftText,
          char_count: draftText.length,
          channel_constraints: {
            max_chars: cfg.maxChars,
            supports_image: channel === "gbp" || channel === "instagram",
            supports_cta: channel === "gbp" || channel === "email",
          },
        },
        meta: {
          model: ANTHROPIC_MODEL,
          action_key: actionKey,
          channel,
          change_subtype: changeSubtype,
          prompt_template_id: templateId,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[generate-action-draft] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || "Erreur serveur" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};