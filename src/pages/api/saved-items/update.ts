import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

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

function optionalString(v: unknown, name: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new HttpError(400, `Invalid field: ${name}`);
  return v.trim() || null;
}

function normalizeDateOptional(s: unknown, name: string): string | null {
  if (s == null || s === "") return null;
  if (typeof s !== "string") throw new HttpError(400, `Invalid field: ${name}`);
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date format for ${name}: ${v}`);
  return v;
}

function normalizeDatesArray(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => {
      if (typeof x === "string") return x;
      if (x && typeof x.value === "string") return x.value;
      return String(x ?? "");
    })
    .map((s: string) => s.trim())
    .filter(Boolean);
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // ---- Content-Type guard ----
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- AUTH + CONTEXT ----
    const clerk_user_id = requireUserIdFromLocals(locals);
    const location_id = requireLocationIdFromLocals(locals);

    // ---- Body ----
    const body = await request.json().catch(() => null);
    const saved_item_id = requireString(body?.saved_item_id, "saved_item_id");

    // All mutable fields are optional — only provided ones are updated
    const title = optionalString(body?.title, "title");
    const description = optionalString(body?.description, "description");
    const decision_date = normalizeDateOptional(body?.decision_date, "decision_date");
    const event_end_date = normalizeDateOptional(body?.event_end_date, "event_end_date");
    const event_type = typeof body?.event_type === "string" && body.event_type.trim() ? body.event_type.trim() : null;
    const launch_hour = typeof body?.launch_hour === "number" ? body.launch_hour : (body?.launch_hour != null && body.launch_hour !== "" ? parseInt(body.launch_hour, 10) : null);
    // Champs événement-dispositif (03/08, spec § 1.1) — mêmes sémantiques optionnelles.
    // La RÈGLE de récurrence n'est PAS éditable ici (v1) : la changer regénérerait les
    // occurrences — chantier séparé, jamais un effet de bord d'un update de champ.
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
    const kpi_family = typeof body?.kpi_family === "string" && body.kpi_family.trim() ? body.kpi_family.trim().slice(0, 120) : null;
    const kpi_target_pct = body?.kpi_target_pct != null && Number.isFinite(Number(body.kpi_target_pct)) ? Number(body.kpi_target_pct) : null;
    const kpi_target_eur = body?.kpi_target_eur != null && Number.isFinite(Number(body.kpi_target_eur)) ? Number(body.kpi_target_eur) : null;
    // Consigne d'opération (docs/automatisation-spec.md § 3) — textes libres, offset J-1..J-7,
    // enabled = BOOL explicite (absent ≠ false). Sémantique d'EFFACEMENT (inc. 6) : un champ
    // texte FOURNI vide ("") = SET NULL ; absent (undefined) = intact — le formulaire envoie
    // toujours ses 4 champs, vider puis enregistrer efface donc réellement.
    const consigneText = (v: unknown, name: string): string | "CLEAR" | null => {
      if (v === undefined) return null;
      if (v === null) return "CLEAR";
      if (typeof v !== "string") throw new HttpError(400, `Invalid field: ${name}`);
      return v.trim() === "" ? "CLEAR" : v.trim();
    };
    const consigne_arrival = consigneText(body?.consigne_arrival, "consigne_arrival");
    const consigne_store_info = consigneText(body?.consigne_store_info, "consigne_store_info");
    const consigne_interactions = consigneText(body?.consigne_interactions, "consigne_interactions");
    const consigne_deroule = consigneText(body?.consigne_deroule, "consigne_deroule");
    const rawOffset = body?.consigne_send_offset;
    const consigne_send_offset = Number.isInteger(Number(rawOffset)) && Number(rawOffset) >= 1 && Number(rawOffset) <= 7
      ? Number(rawOffset) : null;
    const consigne_enabled: boolean | null = typeof body?.consigne_enabled === "boolean" ? body.consigne_enabled : null;

    // dates: if provided, replaces the full set in saved_item_dates
    const rawDates = body?.dates;
    const dates: string[] | null = rawDates === undefined ? null : normalizeDatesArray(rawDates);
  const selected_date = body?.selected_date === null ? "NULL" : normalizeDateOptional(body?.selected_date, "selected_date");
  
    // dates must not be emptied to zero (breaks JOIN-based reads)
    if (dates !== null && dates.length === 0) {
      throw new HttpError(400, "dates must contain at least one date");
    }

    // At least one field must be provided
    if (title === null && description === null && decision_date === null && event_end_date === null && dates === null && selected_date === null && event_type === null && launch_hour === null
        && author_person_name === null && event_nature === null && hour_start === null && hour_end === null
        && kpi === null && kpi_family === null && kpi_target_pct === null && kpi_target_eur === null
        && consigne_arrival === null && consigne_store_info === null && consigne_interactions === null
        && consigne_deroule === null && consigne_send_offset === null && consigne_enabled === null) {
      throw new HttpError(400, "No fields to update");
    }

    // ---- BigQuery wiring ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);

    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- Tables ----
    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    // ---- Ownership check ----
    const [checkRows] = await bigquery.query({
      query: `
        SELECT saved_item_id
        FROM ${savedItemsTable}
        WHERE saved_item_id = @saved_item_id
          AND clerk_user_id = @clerk_user_id
          AND location_id = @location_id
        LIMIT 1
      `,
      location: BQ_LOCATION,
      params: { saved_item_id, clerk_user_id, location_id },
      types: { saved_item_id: "STRING", clerk_user_id: "STRING", location_id: "STRING" },
    });

    if (!Array.isArray(checkRows) || checkRows.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- Build UPDATE SET clauses ----
    const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP()"];
    const updateParams: Record<string, any> = {};
    const updateTypes: Record<string, any> = {};

    if (title !== null) {
      setClauses.push("title = @title");
      updateParams.title = title;
      updateTypes.title = "STRING";
    }
    if (description !== null) {
      setClauses.push("description = @description");
      updateParams.description = description;
      updateTypes.description = "STRING";
    }
    if (decision_date !== null) {
      setClauses.push("decision_date = PARSE_DATE('%F', @decision_date)");
      updateParams.decision_date = decision_date;
      updateTypes.decision_date = "STRING";
    }
    if (event_end_date !== null) {
      setClauses.push("event_end_date = PARSE_DATE('%F', @event_end_date)");
      updateParams.event_end_date = event_end_date;
      updateTypes.event_end_date = "STRING";
    }
    if (event_type !== null) {
      setClauses.push("event_type = @event_type");
      updateParams.event_type = event_type;
      updateTypes.event_type = "STRING";
    }
    if (launch_hour !== null) {
      setClauses.push("launch_hour = @launch_hour");
      updateParams.launch_hour = launch_hour;
      updateTypes.launch_hour = "INT64";
    }
    if (author_person_name !== null) {
      setClauses.push("author_person_name = @author_person_name");
      updateParams.author_person_name = author_person_name;
      updateTypes.author_person_name = "STRING";
    }
    if (event_nature !== null) {
      setClauses.push("event_nature = @event_nature");
      updateParams.event_nature = event_nature;
      updateTypes.event_nature = "STRING";
    }
    if (hour_start !== null) {
      setClauses.push("hour_start = @hour_start");
      updateParams.hour_start = hour_start;
      updateTypes.hour_start = "INT64";
    }
    if (hour_end !== null) {
      setClauses.push("hour_end = @hour_end");
      updateParams.hour_end = hour_end;
      updateTypes.hour_end = "INT64";
    }
    if (kpi !== null) {
      setClauses.push("kpi = @kpi");
      updateParams.kpi = kpi;
      updateTypes.kpi = "STRING";
    }
    if (kpi_family !== null) {
      setClauses.push("kpi_family = @kpi_family");
      updateParams.kpi_family = kpi_family;
      updateTypes.kpi_family = "STRING";
    }
    if (kpi_target_pct !== null) {
      setClauses.push("kpi_target_pct = @kpi_target_pct");
      updateParams.kpi_target_pct = kpi_target_pct;
      updateTypes.kpi_target_pct = "FLOAT64";
    }
    if (kpi_target_eur !== null) {
      setClauses.push("kpi_target_eur = @kpi_target_eur");
      updateParams.kpi_target_eur = kpi_target_eur;
      updateTypes.kpi_target_eur = "FLOAT64";
    }
    const consigneSet = (name: string, v: string | "CLEAR" | null) => {
      if (v === null) return;
      if (v === "CLEAR") { setClauses.push(`${name} = NULL`); return; }
      setClauses.push(`${name} = @${name}`);
      updateParams[name] = v;
      updateTypes[name] = "STRING";
    };
    consigneSet("consigne_arrival", consigne_arrival);
    consigneSet("consigne_store_info", consigne_store_info);
    consigneSet("consigne_interactions", consigne_interactions);
    consigneSet("consigne_deroule", consigne_deroule);
    if (consigne_send_offset !== null) {
      setClauses.push("consigne_send_offset = @consigne_send_offset");
      updateParams.consigne_send_offset = consigne_send_offset;
      updateTypes.consigne_send_offset = "INT64";
    }
    if (consigne_enabled !== null) {
      setClauses.push("consigne_enabled = @consigne_enabled");
      updateParams.consigne_enabled = consigne_enabled;
      updateTypes.consigne_enabled = "BOOL";
    }
    if (selected_date !== undefined) {
      if (selected_date === "NULL") {
        setClauses.push("selected_date = NULL");
      } else {
        setClauses.push("selected_date = PARSE_DATE('%F', @selected_date)");
        updateParams.selected_date = selected_date;
        updateTypes.selected_date = "STRING";
      }
    }
    if (dates !== null) {
      setClauses.push("number_of_dates = @number_of_dates");
      updateParams.number_of_dates = dates.length;
      updateTypes.number_of_dates = "INT64";
    }

    // ---- Transaction: UPDATE saved_items + replace dates if needed ----
    // BigQuery multi-statement scripts do not support named params —
    // inline the three identity values (already validated + ownership-checked above).
    const sid = saved_item_id.replace(/'/g, "");
    const uid = clerk_user_id.replace(/'/g, "");
    const lid = location_id.replace(/'/g, "");

    const deleteDatesClause = dates !== null
      ? `DELETE FROM ${savedItemDatesTable}
         WHERE saved_item_id = '${sid}'
           AND clerk_user_id = '${uid}'
           AND location_id = '${lid}';`
      : "";

    const insertDatesClause = dates !== null && dates.length > 0
  ? `INSERT INTO ${savedItemDatesTable} (saved_item_id, location_id, clerk_user_id, date, created_at)
     SELECT saved_item_id, location_id, clerk_user_id, date, created_at FROM UNNEST([
       ${dates.map((d) =>
         `STRUCT('${sid}' AS saved_item_id, '${lid}' AS location_id, '${uid}' AS clerk_user_id, DATE '${d}' AS date, CURRENT_TIMESTAMP() AS created_at)`
       ).join(",\n       ")}
     ]);`
  : "";
    
    // UPDATE still uses params safely (single statement, not a script)
    const updateQuery = `
      UPDATE ${savedItemsTable}
      SET ${setClauses.join(", ")}
      WHERE saved_item_id = '${sid}'
        AND clerk_user_id = '${uid}'
        AND location_id = '${lid}'
    `;

    // 05/08 (audit owner) : la TRANSACTION ne sert que quand on remplace les dates (deux
    // tables à tenir cohérentes). L'envelopper autour d'un UPDATE seul faisait avorter deux
    // écritures rapprochées (« Transaction is aborted due to concurrent update ») — un clic
    // de chip pendant une sauvegarde en vol. UPDATE simple = pas de transaction.
    const script = dates !== null
      ? `
      BEGIN TRANSACTION;
      ${updateQuery};
      ${deleteDatesClause}
      ${insertDatesClause}
      COMMIT TRANSACTION;
    `
      : updateQuery;

    await bigquery.query({
      query: script,
      location: BQ_LOCATION,
      params: updateParams,
      types: updateTypes,
    });

    // Snapshot signal levels at PLANIFIER → PILOTER transition
    if (selected_date && selected_date !== "NULL") {
      fetch(`${new URL(request.url).origin}/api/saved-items/snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ saved_item_id, selected_date }),
      }).catch(e => console.error("[snapshot] fire-and-forget failed:", e));
    }

    const responseHeaders: Record<string, string> = { "content-type": "application/json" };
    if (selected_date && selected_date !== "NULL") {
      responseHeaders["Set-Cookie"] = `ms_piloter=${encodeURIComponent(saved_item_id)}|${encodeURIComponent(selected_date)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    } else if (selected_date === "NULL") {
      responseHeaders["Set-Cookie"] = `ms_piloter=; Path=/; SameSite=Lax; Max-Age=0`;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved_item_id,
        updated: {
          ...(title !== null && { title }),
          ...(description !== null && { description }),
          ...(decision_date !== null && { decision_date }),
          ...(event_end_date !== null && { event_end_date }),
          ...(dates !== null && { dates, number_of_dates: dates.length }),
        },
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 400;
    const message = status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};