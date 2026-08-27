import "dotenv/config";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import crypto from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { generateOccurrences } from "../../../lib/eventOccurrences";

export const prerender = false;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(400, `Missing or invalid field: ${name}`);
  }
  return v.trim();
}

function requireUserIdFromLocals(locals: any): string {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(401, "Unauthorized");
  return v.trim();
}

function requireLocationIdFromLocals(locals: any): string {
  const v = locals?.location_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, "Missing location context");
  return v.trim();
}

function normalizeDateOptional(s: unknown, name: string): string | null {
  if (s == null || s === "") return null;
  if (typeof s !== "string") throw new HttpError(400, `Invalid field: ${name}`);
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date format for ${name}: ${v}`);
  return v;
}

function normalizeDateYMD(s: string): string {
  // Strict YYYY-MM-DD; BigQuery DATE accepts this format safely.
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date: ${v}`);
  return v;
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function uuid(): string {
  // Node 18+ has crypto.randomUUID()
  return crypto.randomUUID();
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // ---- Content-Type guard (JSON) ----
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- AUTH + CONTEXT (truth) ----
    const clerk_user_id = requireUserIdFromLocals(locals);
    const location_id = requireLocationIdFromLocals(locals);

    // ---- Body ----
    const body = await request.json().catch(() => null);
    const title = requireString(body?.title, "title");
    const description =
      typeof body?.description === "string" && body.description.trim().length
        ? body.description.trim().slice(0, 240)
        : null;
    
    const decision_date = normalizeDateOptional(body?.decision_date, "decision_date");
    const event_end_date = normalizeDateOptional(body?.event_end_date, "event_end_date");
    const event_type = typeof body?.event_type === "string" && body.event_type.trim() ? body.event_type.trim() : null;
    const launch_hour = typeof body?.launch_hour === "number" ? body.launch_hour : (body?.launch_hour != null && body.launch_hour !== "" ? parseInt(body.launch_hour, 10) : null);

    // ---- Champs événement-dispositif (03/08, spec docs/evenement-dossier-spec.md § 1.1) ----
    // Tous ADDITIFS et nuls par défaut : un client existant qui ne les envoie pas crée
    // exactement le même événement qu'avant.
    const author_person_name = typeof body?.author_person_name === "string" && body.author_person_name.trim()
      ? body.author_person_name.trim().slice(0, 120) : null;
    const event_nature = ["outdoor", "indoor", "both"].includes(String(body?.event_nature)) ? String(body.event_nature) : null;
    const asHour = (v: any): number | null => {
      const n = typeof v === "number" ? v : (v != null && v !== "" ? parseInt(v, 10) : NaN);
      return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
    };
    const hour_start = asHour(body?.hour_start);
    const hour_end = asHour(body?.hour_end);
    const KPI_SET = ["revenue_residual", "family_revenue", "tickets", "basket", "visitors", "conversion", "profit_estimated"];
    const kpi = KPI_SET.includes(String(body?.kpi)) ? String(body.kpi) : null;
    const kpi_family = kpi === "family_revenue" && typeof body?.kpi_family === "string" && body.kpi_family.trim()
      ? body.kpi_family.trim().slice(0, 120) : null;
    const asNum = (v: any): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    const kpi_target_pct = asNum(body?.kpi_target_pct);
    const kpi_target_eur = asNum(body?.kpi_target_eur);
    // Durée en jours (04/08, proto v4) : l'événement peut durer N jours consécutifs — les
    // candidates restent des jours de LANCEMENT ; au Choisir, la fenêtre de mesure et
    // event_end_date se calent sur [lancement, lancement+durée−1]. NULL = 1 jour (historique).
    const duration_days = Number.isInteger(Number(body?.duration_days)) && Number(body.duration_days) >= 1 && Number(body.duration_days) <= 31
      ? Number(body.duration_days) : null;
    const recurrence: "none" | "weekly" | "monthly" =
      body?.recurrence === "weekly" ? "weekly" : body?.recurrence === "monthly" ? "monthly" : "none";
    const recurrence_dow = Number.isInteger(Number(body?.recurrence_dow)) && Number(body.recurrence_dow) >= 0 && Number(body.recurrence_dow) <= 6
      ? Number(body.recurrence_dow) : null;
    const recurrence_start = normalizeDateOptional(body?.recurrence_start, "recurrence_start");
    const recurrence_end = normalizeDateOptional(body?.recurrence_end, "recurrence_end");

    // ---- Dates : candidats (ponctuel, 1-7) OU occurrences générées (récurrent, plafond 52) ----
    let dates: string[];
    if (recurrence !== "none") {
      if (!recurrence_start || !recurrence_end) throw new HttpError(400, "Récurrence sans « Du X au Y »");
      dates = generateOccurrences({ recurrence, dow: recurrence_dow, start: recurrence_start, end: recurrence_end });
      if (dates.length < 1) throw new HttpError(400, "Récurrence sans aucune occurrence dans la période");
    } else {
      const rawDates = Array.isArray(body?.dates) ? body.dates : null;
      if (!rawDates || rawDates.length < 1) throw new HttpError(400, "Missing or invalid field: dates");
      if (rawDates.length > 7) throw new HttpError(400, "Too many dates (max 7)");
      dates = dedupe(
        rawDates
          .map((d: any) => (typeof d === "string" ? normalizeDateYMD(d) : ""))
          .filter((d: string) => d.length > 0)
      );
      if (dates.length < 1) throw new HttpError(400, "Missing or invalid field: dates");
      if (dates.length > 7) throw new HttpError(400, "Too many dates (max 7)");
    }

    const number_of_dates = dates.length;

    // No stage rules needed

    // ---- BigQuery wiring (reuse your pattern) ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);

    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- IMPORTANT: fixed tables in raw ----
    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    const saved_item_id = uuid();

    const script = `
    BEGIN TRANSACTION;

    INSERT INTO ${savedItemsTable} (
        saved_item_id,
        location_id,
        clerk_user_id,
        number_of_dates,
        title,
        description,
        stage,
        decision_date,
        event_end_date,
        event_type,
        launch_hour,
        author_person_name,
        event_nature,
        hour_start,
        hour_end,
        kpi,
        kpi_family,
        kpi_target_pct,
        kpi_target_eur,
        recurrence,
        recurrence_dow,
        recurrence_start,
        recurrence_end,
        duration_days,
        created_at,
        updated_at
    )
    VALUES (
        @saved_item_id,
        @location_id,
        @clerk_user_id,
        @number_of_dates,
        @title,
        @description,
        'option',
        IF(@decision_date = '', NULL, PARSE_DATE('%F', @decision_date)),
        IF(@event_end_date = '', NULL, PARSE_DATE('%F', @event_end_date)),
        @event_type,
        @launch_hour,
        @author_person_name,
        @event_nature,
        @hour_start,
        @hour_end,
        @kpi,
        @kpi_family,
        @kpi_target_pct,
        @kpi_target_eur,
        @recurrence,
        @recurrence_dow,
        IF(@recurrence_start = '', NULL, PARSE_DATE('%F', @recurrence_start)),
        IF(@recurrence_end = '', NULL, PARSE_DATE('%F', @recurrence_end)),
        @duration_days,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
    );

    INSERT INTO ${savedItemDatesTable} (
        saved_item_id,
        location_id,
        clerk_user_id,
        date,
        created_at
    )
    SELECT
        @saved_item_id,
        @location_id,
        @clerk_user_id,
        PARSE_DATE('%F', d),
        CURRENT_TIMESTAMP()
    FROM UNNEST(@dates) AS d;

    COMMIT TRANSACTION;
    `;

    await bigquery.query({
        query: script,
        location: BQ_LOCATION,
        params: {
    saved_item_id,
    location_id,
    clerk_user_id,
    number_of_dates,
    title,
    description,
    decision_date: decision_date ?? "",
    event_end_date: event_end_date ?? "",
    event_type: event_type ?? null,
    launch_hour: launch_hour ?? null,
    author_person_name,
    event_nature,
    hour_start,
    hour_end,
    kpi,
    kpi_family,
    kpi_target_pct,
    kpi_target_eur,
    recurrence,
    recurrence_dow,
    recurrence_start: recurrence_start ?? "",
    recurrence_end: recurrence_end ?? "",
    duration_days,
    dates,
},
types: {
    saved_item_id: "STRING",
    location_id: "STRING",
    clerk_user_id: "STRING",
    number_of_dates: "INT64",
    title: "STRING",
    description: "STRING",
    decision_date: "STRING",
    event_end_date: "STRING",
    event_type: "STRING",
    launch_hour: "INT64",
    author_person_name: "STRING",
    event_nature: "STRING",
    hour_start: "INT64",
    hour_end: "INT64",
    kpi: "STRING",
    kpi_family: "STRING",
    kpi_target_pct: "FLOAT64",
    kpi_target_eur: "FLOAT64",
    recurrence: "STRING",
    recurrence_dow: "INT64",
    duration_days: "INT64",
    recurrence_start: "STRING",
    recurrence_end: "STRING",
    dates: ["STRING"],
},
    });

    return new Response(
      JSON.stringify({
        ok: true,
        saved_item_id,
        location_id,
        number_of_dates,
        decision_date,
        event_end_date,
        recurrence,
        occurrences: recurrence !== "none" ? dates : undefined,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 400;
    const message =
      status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};
