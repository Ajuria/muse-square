import type { APIRoute } from "astro";
import { modelFor } from "../../../lib/ai/models";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { makeBQClient } from "../../../lib/bq";
import { assembleDayContext } from "../../../lib/dayContext";
import { toGroundedDayPayload, type GroundedDayPayload } from "../../../lib/ai/groundedPayload";
import { callClaudeMessagesAPI } from "../../../lib/ai/runtime/claude";
import { validate_grounded_draft } from "../../../lib/ai/contracts/packagerGroundedDraftValidator";

export const prerender = false;

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = modelFor("drafting");
const ANTHROPIC_MAX_TOKENS = 500;
const ANTHROPIC_TEMPERATURE = 0.7;

const BQ_PROJECT_ID = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
const BQ_SEMANTIC_PROJECT = "muse-square-open-data";

type Channel = "gbp" | "instagram" | "email" | "sms" | "note_interne" | "slack" | "whatsapp";

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
  note_interne: {
    label: "note interne",
    maxChars: 800,
    rules:
      "Note opérationnelle destinée à l'équipe, jamais au public. Aucun émoji. Pas d'appel à l'action commercial, pas de lien de réservation, pas de formule promotionnelle. Ton factuel et direct : ce qui se passe, pourquoi c'est important, ce que l'équipe doit faire (effectif, horaires, accueil, signalétique).",
  },
  slack: {
    label: "message Slack",
    maxChars: 700,
    rules:
      "Message court destiné à l'équipe sur Slack, jamais au public. Aucun émoji. Pas d'appel à l'action commercial ni de lien de réservation. Ton factuel et direct, 1 à 3 phrases. Indiquer le lieu concerné et les chiffres clés, puis l'action à traiter.",
  },
  whatsapp: {
    label: "message WhatsApp",
    maxChars: 1000,
    rules:
      "Message direct WhatsApp, court et personnel. Identifie l'expéditeur (le lieu) en début. Une seule idée claire, ton chaleureux mais concis. Un lien est possible en fin de message.",
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

function parseCompetitorEnriched(comp: any): Record<string, string> {
  if (!comp?.competitor_enriched_description) return {};
  try {
    const raw = typeof comp.competitor_enriched_description === 'string'
      ? JSON.parse(comp.competitor_enriched_description)
      : comp.competitor_enriched_description;
    return raw || {};
  } catch { return {}; }
}

function competitorIntelBlock(comps: any[] | null): string {
  if (!comps || comps.length === 0) return '';
  const top = comps[0];
  const enriched = parseCompetitorEnriched(top);
  if (!enriched.business_description && !enriched.current_offering && !enriched.pricing_info) return '';
  const lines: string[] = [];
  lines.push(`\nINTELLIGENCE CONCURRENTIELLE (données crawlées — NE PAS CITER comme source) :`);
  lines.push(`Concurrent : ${safeStr(top.competitor_name)}`);
  if (enriched.business_description) lines.push(`Description : ${enriched.business_description}`);
  if (enriched.current_offering) lines.push(`Offre : ${enriched.current_offering}`);
  if (enriched.pricing_info) lines.push(`Tarifs : ${enriched.pricing_info}`);
  if (enriched.key_differentiators) lines.push(`Différenciants : ${enriched.key_differentiators}`);
  if (enriched.target_audience) lines.push(`Public cible concurrent : ${enriched.target_audience}`);
  if (enriched.opening_hours_mentioned) lines.push(`Horaires concurrent : ${enriched.opening_hours_mentioned}`);
  lines.push(`Utilise ces données pour positionner NOTRE offre face à ce concurrent. Ne mentionne JAMAIS le nom du concurrent dans le post.`);
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────
// The "CONTEXTE VÉRIFIÉ" block — the brain's claim-typed citable_facts (engines already excluded).
// The ONLY external facts the copy may assert. Honest-absence when nothing external is notable.
export function buildGroundedFactsBlock(g: GroundedDayPayload): string {
  const lines = g.citable_facts.map((f) => `- ${f.fact_fr}`);
  return lines.length
    ? `\n\nCONTEXTE VÉRIFIÉ (les SEULS faits externes que tu peux affirmer) :\n${lines.join("\n")}`
    : `\n\nCONTEXTE VÉRIFIÉ : aucun signal externe notable aujourd'hui — appuie-toi sur l'identité de l'établissement et la consigne utilisateur, n'invente aucun fait externe.`;
}

// The venue's own identity as a whitelist string for the validator (self-reference is a legal source):
// name / city / offerings / differentiators / event types / channels.
export function buildIdentityWhitelist(profile: any): string {
  let ae: any = {};
  try { ae = JSON.parse(safeStr(profile?.auto_enriched_description) || "{}"); } catch {}
  return [
    safeStr(profile?.site_name), safeStr(profile?.location_label), safeStr(profile?.city_name),
    safeStr(profile?.region_name), safeStr(profile?.business_short_description),
    safeStr(ae?.business_description), safeStr(ae?.services_and_amenities), safeStr(ae?.current_offering),
    safeStr(ae?.key_differentiators), safeStr(profile?.company_activity_type),
    safeStr(profile?.event_type_1), safeStr(profile?.event_type_2), safeStr(profile?.event_type_3),
    safeStr(profile?.main_event_objective), safeStr(profile?.website_url), safeStr(profile?.instagram_url),
  ].filter(Boolean).join("  ");
}

// ────────────────────────────────────────────────────────────
// System prompt builder
// ────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  profile: any,
  channel: string,
  artifactMode: string,
  facts: string
): string {
  const cfg = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.gbp;
  const siteName = safeStr(profile?.site_name) || safeStr(profile?.location_label) || "notre établissement";
  const desc = safeStr(profile?.business_short_description);
  let autoEnriched: Record<string, string | null> = {};
  try { autoEnriched = JSON.parse(safeStr(profile?.auto_enriched_description) || "{}"); } catch {}
  const autoDesc = safeStr(autoEnriched?.business_description);
  const autoServices = safeStr(autoEnriched?.services_and_amenities);
  const autoTone = safeStr(autoEnriched?.tone_of_voice);
  const autoDiff = safeStr(autoEnriched?.key_differentiators);
  const autoProgramming = safeStr(autoEnriched?.current_offering);
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
  if (autoServices) identityLines.push(`Services : ${autoServices}`);
  if (autoProgramming) identityLines.push(`Programmation actuelle : ${autoProgramming}`);
  if (autoDiff) identityLines.push(`Différenciants : ${autoDiff}`);
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

  const hasRealIdentity = Boolean(effectiveDesc || autoServices || autoProgramming || autoDiff || eventTypes.length || audLine || objective);

  const offerStructure = artifactMode === "offer"
    ? `

MODE OFFRE — structure le texte comme une offre commerciale concrète, dans cet ordre :
1. Accroche courte qui pose le contexte ou l'occasion
2. L'offre elle-même, explicite (ce qui est proposé, pour qui)
3. Validité — période ou échéance claire (le rédacteur la précisera)
4. Appel à l'action sans ambiguïté (réserver, venir, profiter)
5. Code ou condition si pertinent
N'invente ni montant, ni pourcentage, ni date précise : laisse des formulations que l'établissement complétera. L'offre doit rester crédible et alignée sur l'établissement, jamais du remplissage promotionnel.`
    : "";

  return `Tu es le rédacteur de contenu de ${siteName}. Tu connais parfaitement cet établissement et tu rédiges en son nom.

IDENTITÉ DE L'ÉTABLISSEMENT :
${identityLines.join("\n")}

Tu rédiges un ${cfg.label} en français, prêt à publier.

Règles :
- Écris comme si tu ÉTAIS l'établissement — utilise "nous", "notre", "chez nous"
${hasRealIdentity
  ? `- Mentionne des éléments concrets et spécifiques à cet établissement (activité, type d'événements, public cible) — ne reste JAMAIS générique`
  : `- Tu ne disposes d'AUCUNE information sur l'identité, l'activité réelle, le positionnement ou le modèle de cet établissement. N'INVENTE RIEN : aucune description d'activité, aucun avantage concurrentiel, aucun produit ou service, aucune équipe, aucun prospect, aucune stratégie commerciale. Rédige une note strictement opérationnelle fondée UNIQUEMENT sur les faits fournis ci-dessous. Toute action recommandée doit rester générique et sûre (surveiller la situation, adapter les effectifs, vérifier la signalétique) — jamais une initiative commerciale ou marketing inventée`}
- Ton professionnel mais accessible — pas de jargon marketing, pas de superlatifs vides
- Maximum ${cfg.maxChars} caractères
- ${cfg.rules}
- Ne mentionne JAMAIS Muse Square, ni le fait que cette information vient d'une plateforme d'intelligence
- Le texte doit pouvoir être publié tel quel sans modification
- GROUNDING — pour tout élément EXTERNE (concurrent, événement voisin, météo, chiffre d'affluence), appuie-toi UNIQUEMENT sur le CONTEXTE VÉRIFIÉ ci-dessous : n'invente AUCUN concurrent, événement, température ni statistique absent de ce contexte. Les prix, remises, horaires et offres que tu annonces viennent de la consigne de l'utilisateur (message ci-dessous), jamais d'une invention. Ne promets AUCUN résultat chiffré ni superlatif d'affluence (« +X % de visites », « à guichets fermés », « record d'affluence »)
- Inclus un appel à l'action concret quand pertinent
- Pas d'émoji excessifs — 1 ou 2 maximum, en début de post si pertinent${offerStructure}${facts}

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
  user_instruction: string;
};

export function buildUserPrompt(ctx: PromptContext): string {
  const sub = safeStr(ctx.signal?.change_subtype).toLowerCase();
  const ch = ctx.channel;
  // Try specific template first
  const key = `${sub}__${ch}`;
  const tmpl = TEMPLATES[key];
  let prompt = tmpl ? tmpl(ctx) : buildGenericPrompt(ctx);
  if (ctx.user_instruction) {
    prompt += "\n\n---\nInstruction utilisateur : " + ctx.user_instruction;
  }
  return prompt;
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
${competitorIntelBlock(ctx.competitor_context)}
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
${competitorIntelBlock(ctx.competitor_context)}
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
${competitorIntelBlock(ctx.competitor_context)}
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

    if (!rateLimit(userId, "action-draft", 15, 60_000)) return rateLimitResponse();

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
    const userInstruction = safeStr(body.user_instruction);
    const bodyStyleReference = safeStr(body.style_reference);
    const draftSeed = safeStr(body.draft_seed);
    const artifactMode = safeStr(body.artifact_mode);
    const dataPayload = body.data_payload && typeof body.data_payload === "object" ? body.data_payload : {};

    if (!actionKey || !channel || !changeSubtype) {
      return new Response(
        JSON.stringify({ ok: false, error: "Champs requis : action_key, channel, change_subtype" }),
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

    // ── Phase 3b: the brain (brief slice) is the ONE source of context. Engines EXCLUDED — a measured
    //    revenue sensitivity is operator intel, NEVER customer copy. Profile comes from the brain's
    //    profile_raw (no separate fetch); external facts come from citable_facts (no conditional forks).
    const affectedDate = safeStr(signal.affected_date) || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const dc = await assembleDayContext(bq, locationId, affectedDate, { slice: "brief" });
    const grounded: GroundedDayPayload = toGroundedDayPayload(dc, {
      question: `Rédige un contenu ${channel} : ${cardWhat || changeSubtype}`,
      date: affectedDate,
      excludeEngines: true,
    });
    const profile = dc.profile_raw;

    if (!profile) {
      return new Response(
        JSON.stringify({ ok: false, error: "Profil introuvable" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // ── Fetch saved draft as style reference ──
    let styleReference: string | null = null;
    let isStyled = false;
    if (bodyStyleReference) {
      // Explicit style reference from library picker
      isStyled = true;
      styleReference = bodyStyleReference;
    } else if (!userInstruction) {
      // Auto-detect most recent saved draft
      const savedDraft = await bqOne(
        `SELECT body, title, tone, key_phrases
         FROM \`muse-square-open-data.analytics.saved_drafts\`
         WHERE location_id = @location_id
           AND signal_type = @signal_type
           AND channel = @channel
           AND status = 'active'
         ORDER BY updated_at DESC
         LIMIT 1`,
        { location_id: locationId, signal_type: changeSubtype, channel }
      );
      if (savedDraft && safeStr(savedDraft.body)) {
        isStyled = true;
        styleReference = safeStr(savedDraft.body);
      }
    }

    // Conditional competitor/day/mobility fetches DELETED — external facts now come from the brain's
    // citable_facts (the CONTEXTE VÉRIFIÉ block). The per-signal templates keep their framing; the facts
    // they used to inject are grounded in the system prompt instead.
    const competitorContext = null;
    const dayContext = null;
    const mobilityContext = null;

    // ── Build prompts ──
    const facts = buildGroundedFactsBlock(grounded);
    let systemPrompt = buildSystemPrompt(profile, channel, artifactMode, facts);
    if (styleReference) {
      systemPrompt += "\n\n---\nR\u00c9F\u00c9RENCE DE STYLE (brouillon pr\u00e9c\u00e9dent de l'utilisateur) :\n\"\"\"\n" + styleReference + "\n\"\"\"\nReprends le ton, la structure et le style de ce brouillon. Adapte le contenu aux nouvelles donn\u00e9es fournies dans le message utilisateur. Ne copie pas le texte mot pour mot \u2014 r\u00e9\u00e9cris avec les informations actuelles tout en conservant la voix de l'utilisateur.";
    }

    const promptCtx: PromptContext = {
      profile,
      signal: { ...signal, change_subtype: changeSubtype },
      channel,
      card_what: cardWhat,
      card_sowhat: cardSowhat,
      competitor_context: competitorContext,
      day_context: dayContext,
      mobility_context: mobilityContext,
      user_instruction: userInstruction,
    };
    const userPrompt = draftSeed
      ? `CONSIGNE DE RÉDACTION (générée par le système) :\n${draftSeed}\n\n${userInstruction ? 'INSTRUCTION UTILISATEUR :\n' + userInstruction : ''}`
      : buildUserPrompt(promptCtx);

    const templateId = (() => {
      const key = `${changeSubtype}__${channel}`;
      return TEMPLATES[key] ? key : `generic__${channel}`;
    })();

    // ── Generate via the one client (registry model + prompt caching), then GROUND-VALIDATE. ──
    //    Regenerate once on a grounding failure; never hand back ungrounded copy for a publishable draft.
    const identityText = buildIdentityWhitelist(profile);
    const genDraft = async (): Promise<string> => {
      const call = await callClaudeMessagesAPI({
        system: systemPrompt,
        userText: userPrompt,
        model: ANTHROPIC_MODEL,
        maxTokens: ANTHROPIC_MAX_TOKENS,
        temperature: ANTHROPIC_TEMPERATURE,
        cacheSystem: false,
      });
      return call.ok ? safeStr(call.rawText) : "";
    };

    let draftText = await genDraft();
    let [gok, gerrs] = validate_grounded_draft(draftText, { grounded, identityText, userInstruction });
    if (draftText && !gok) {
      console.warn("[generate-action-draft] grounding rejected, regenerating:", gerrs);
      draftText = await genDraft();
      [gok, gerrs] = validate_grounded_draft(draftText, { grounded, identityText, userInstruction });
    }
    if (draftText && !gok) {
      console.error("[generate-action-draft] grounding failed twice:", gerrs);
      return new Response(
        JSON.stringify({ ok: false, error: "Brouillon non fondé : un fait externe n'est pas vérifiable. Réessayez ou précisez votre consigne.", grounding_errors: gerrs }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (!draftText) {
      console.error("[generate-action-draft] empty draft (model returned no text)");
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
        is_styled: isStyled,
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