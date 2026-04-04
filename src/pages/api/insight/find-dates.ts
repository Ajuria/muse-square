import type { APIRoute } from "astro";
import { findDates } from "../../../lib/ai/find_dates/find-dates";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const location_id =
    ((locals as any)?.location_id ? String((locals as any).location_id).trim() : null);

  if (!location_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "location_id manquant" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response(
      JSON.stringify({ ok: false, error: "Body JSON invalide" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    date_start,
    date_end,
    allow_weekday,
    allow_weekend,
    exclude_school_holidays,
    exclude_public_holidays,
    event_type,
    primary_audience_1,
    primary_audience_2,
    business_short_description,
  } = body;

  // ----------------------------------------------------------------
  // Validation
  // ----------------------------------------------------------------
  if (!date_start || !ISO_DATE_RE.test(date_start)) {
    return new Response(
      JSON.stringify({ ok: false, error: "date_start invalide (YYYY-MM-DD requis)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!date_end || !ISO_DATE_RE.test(date_end)) {
    return new Response(
      JSON.stringify({ ok: false, error: "date_end invalide (YYYY-MM-DD requis)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (typeof allow_weekday !== "boolean" || typeof allow_weekend !== "boolean") {
    return new Response(
      JSON.stringify({ ok: false, error: "allow_weekday et allow_weekend sont requis (boolean)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!allow_weekday && !allow_weekend) {
    return new Response(
      JSON.stringify({ ok: false, error: "Au moins allow_weekday ou allow_weekend doit être true" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ----------------------------------------------------------------
  // Call lib
  // ----------------------------------------------------------------
  try {
    const result = await findDates({
      location_id,
      date_start,
      date_end,
      allow_weekday,
      allow_weekend,
      exclude_school_holidays: exclude_school_holidays === true,
      exclude_public_holidays: exclude_public_holidays === true,
      event_type: event_type ?? null,
      primary_audience_1: primary_audience_1 ?? null,
      primary_audience_2: primary_audience_2 ?? null,
      business_short_description: business_short_description ?? null,
    });

    const dates_csv = result.dates
      .map(r =>
        typeof r.date === "object" && (r.date as any).value
          ? (r.date as any).value
          : String(r.date)
      )
      .join(",");

    return new Response(
      JSON.stringify({
        ok: true,
        dates_csv,
        dates: result.dates,
        narrative: result.narrative,
        is_least_worst: result.is_least_worst,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[api/insight/find-dates] Error", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? "Erreur interne" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};