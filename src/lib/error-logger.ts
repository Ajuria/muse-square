/**
 * Fire-and-forget error/event logger to BigQuery analytics tables.
 * Never throws — all failures are swallowed with console.error.
 */
import crypto from "node:crypto";
import { makeBQClient } from "./bq";

const PROJECT_ID = () => (process.env.BQ_PROJECT_ID || "").trim();
const BQ_LOCATION = () => (process.env.BQ_LOCATION || "EU").trim();

export function logCrawl(params: {
  clerk_user_id: string;
  location_id: string;
  website_url: string;
  status: string;
  error_message?: string | null;
  http_status_code?: number | null;
  duration_ms: number;
  pages_extracted?: number | null;
  extraction_model?: string | null;
}): void {
  const projectId = PROJECT_ID();
  if (!projectId) return;

  const bigquery = makeBQClient(projectId);
  const crawl_id = crypto.randomUUID();

  bigquery.query({
    query: `
      INSERT INTO \`${projectId}.analytics.crawl_log\`
        (crawl_id, clerk_user_id, location_id, website_url, status,
         error_message, http_status_code, duration_ms, pages_extracted,
         extraction_model, created_at)
      VALUES
        (@crawl_id, @clerk_user_id, @location_id, @website_url, @status,
         @error_message, @http_status_code, @duration_ms, @pages_extracted,
         @extraction_model, CURRENT_TIMESTAMP())
    `,
    location: BQ_LOCATION(),
    params: {
      crawl_id,
      clerk_user_id: params.clerk_user_id,
      location_id: params.location_id,
      website_url: params.website_url,
      status: params.status,
      error_message: params.error_message ?? null,
      http_status_code: params.http_status_code ?? null,
      duration_ms: params.duration_ms,
      pages_extracted: params.pages_extracted ?? null,
      extraction_model: params.extraction_model ?? null,
    },
    types: {
      crawl_id: "STRING",
      clerk_user_id: "STRING",
      location_id: "STRING",
      website_url: "STRING",
      status: "STRING",
      error_message: "STRING",
      http_status_code: "INT64",
      duration_ms: "INT64",
      pages_extracted: "INT64",
      extraction_model: "STRING",
    },
  }).catch((e) => {
    console.error("[error-logger] crawl_log insert failed:", e?.message);
  });
}

export function logApiError(params: {
  clerk_user_id?: string | null;
  location_id?: string | null;
  endpoint: string;
  error_type: string;
  error_message: string;
  http_status_code?: number | null;
  request_metadata?: Record<string, any> | null;
}): void {
  const projectId = PROJECT_ID();
  if (!projectId) return;

  const bigquery = makeBQClient(projectId);
  const error_id = crypto.randomUUID();

  bigquery.query({
    query: `
      INSERT INTO \`${projectId}.analytics.api_error_log\`
        (error_id, clerk_user_id, location_id, endpoint, error_type,
         error_message, http_status_code, request_metadata, created_at)
      VALUES
        (@error_id, @clerk_user_id, @location_id, @endpoint, @error_type,
         @error_message, @http_status_code, @request_metadata, CURRENT_TIMESTAMP())
    `,
    location: BQ_LOCATION(),
    params: {
      error_id,
      clerk_user_id: params.clerk_user_id ?? null,
      location_id: params.location_id ?? null,
      endpoint: params.endpoint,
      error_type: params.error_type,
      error_message: params.error_message,
      http_status_code: params.http_status_code ?? null,
      request_metadata: params.request_metadata ? JSON.stringify(params.request_metadata) : null,
    },
    types: {
      error_id: "STRING",
      clerk_user_id: "STRING",
      location_id: "STRING",
      endpoint: "STRING",
      error_type: "STRING",
      error_message: "STRING",
      http_status_code: "INT64",
      request_metadata: "STRING",
    },
  }).catch((e) => {
    console.error("[error-logger] api_error_log insert failed:", e?.message);
  });
}