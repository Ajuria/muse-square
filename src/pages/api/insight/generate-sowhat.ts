import type { APIRoute } from "astro";

export const prerender = false;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const signals = body?.signals;
    const profile = body?.profile;
    const day = body?.day;

    if (!Array.isArray(signals) || !signals.length) {
      return json(400, { ok: false, error: "No signals provided" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.CLAUDE_MODEL_ENRICHMENT || "claude-haiku-4-5-20251001";
    if (!apiKey) return json(500, { ok: false, error: "Missing API key" });

    const signalDescriptions = signals.map((s: any, i: number) => {
      return `Signal ${i + 1} (${s.signal_id}):
Données: ${JSON.stringify(s.trigger_data)}`;
    }).join("\n\n");

    const profileContext = profile ? `
Profil du lieu:
- Activité: ${profile.company_activity_type || "non renseigné"}
- Type: ${profile.location_type || "non renseigné"}
- Audience principale: ${profile.primary_audience_1 || "non renseigné"}
- Audience secondaire: ${profile.primary_audience_2 || "non renseigné"}
- Objectif: ${profile.main_event_objective || "non renseigné"}
- Sensibilité météo: ${profile.weather_sensitivity ?? "non renseigné"}
- Horaires: ${profile.operating_hours || "non renseigné"}
- Description: ${profile.auto_enriched_description || profile.business_short_description || "non renseigné"}
- Ville: ${profile.city_name || "non renseigné"}
- Région: ${profile.region_name || "non renseigné"}
- Type BestTime: ${profile.besttime_venue_type || "non renseigné"}
- Note Google: ${profile.besttime_rating || "non renseigné"}
- Durée visite: ${profile.besttime_dwell_time_min || "?"}–${profile.besttime_dwell_time_max || "?"} min` : "";

    const dayContext = day ? `
Contexte du jour:
- Date: ${day.date || ""}
- Score: ${day.opportunity_score ?? ""}
- Régime: ${day.opportunity_regime || ""}
- Météo: ${day.weather_label_fr || ""} (alerte niv. ${day.alert_level_max ?? 0})
- Vacances: ${day.vacation_name || "non"}
- Férié: ${day.holiday_name || "non"}
- Concurrence 5km: ${day.events_within_5km_count ?? "?"} événements
- Pression concurrentielle: ${day.competition_pressure_ratio ?? "?"}
- Tourisme régional: ${day.tourism_index_region ?? "?"}%
- Affluence jour (rang): ${day.ft_day_rank_max ?? "?"}/7 (1=plus chargé)
- Affluence moyenne: ${day.ft_avg_busyness_pct ?? "?"}%
- Heure de pointe: ${day.ft_peak_hour ?? "?"}h (${day.ft_peak_busyness_pct ?? "?"}%)
- Heure creuse: ${day.ft_quiet_hour ?? "?"}h
- Heures chargées: ${day.ft_busy_hours_count ?? "?"}
- Heures creuses: ${day.ft_quiet_hours_count ?? "?"}` : "";

    const systemPrompt = `Tu es l'assistant IA de Muse Square Insight, plateforme d'intelligence opérationnelle pour les lieux physiques en France.

RÈGLES ABSOLUES:
- Une seule phrase par signal. Maximum 120 caractères.
- Utilise UNIQUEMENT les données fournies. N'invente JAMAIS de chiffres, de tendances, ou de faits.
- Ne mentionne jamais de coûts, de revenus, de marges, ou de données financières — tu n'en as pas.
- Parle à un opérateur de terrain, pas à un analyste. Ton = direct, concret, utile.
- Si le profil contient une description du lieu, adapte le vocabulaire au métier.
- N'utilise pas de formules génériques ("optimisez votre stratégie", "maximisez votre potentiel").
- Chaque phrase doit expliquer POURQUOI ce signal compte pour CE lieu spécifique.

FORMAT DE RÉPONSE:
Renvoie un JSON array avec un objet par signal:
[{"signal_id": "FT_C2", "sowhat": "..."}]

Pas de markdown, pas de backticks, pas de texte avant ou après le JSON.`;

    const userPrompt = `${profileContext}
${dayContext}

Génère le "so what" (une phrase d'interprétation) pour chaque signal:

${signalDescriptions}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      }),
    });

    if (!res.ok) {
      return json(502, { ok: false, error: "Claude API error" });
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || "";

    let parsed: any[] = [];
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return json(200, { ok: true, results: signals.map((s: any) => ({ signal_id: s.signal_id, sowhat: null })) });
    }

    return json(200, { ok: true, results: parsed });
  } catch (err: any) {
    return json(500, { ok: false, error: err?.message || "Unknown error" });
  }
};