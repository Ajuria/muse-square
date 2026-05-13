import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

export const prerender = false;

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
const TIMEOUT_MS = 55_000;

const INSTITUTION_PROMPT = `You are a strict public sector intelligence extractor. You read the homepage of a local institution (office de tourisme, mairie, CCI, pr\u00e9fecture) and extract structured signals relevant to nearby businesses.

Extract the following fields. If a field is not explicitly visible on the page, return null. Never infer, never guess.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

{
  "has_promo": false,
  "promo_summary": null,
  "has_sold_out": false,
  "sold_out_summary": null,
  "featured_offer": null,
  "blog_post_count": null,
  "blog_latest_title": null,
  "blog_latest_date": null
}

RULES:
- has_promo: true if any upcoming campaign, promoted theme/season, grant announcement, call for applications, subsidized event program, or infrastructure project affecting local businesses is visible. Otherwise false.
- promo_summary: one-sentence French summary of the campaign, grant, or promoted theme. Null if has_promo is false.
- has_sold_out: true if any registration closed, capacity reached, deadline passed, or program discontinued mention is visible. Otherwise false.
- sold_out_summary: one-sentence French summary. Null if has_sold_out is false.
- featured_offer: the main highlighted initiative, infrastructure project, tourism campaign, or public event promoted by the institution. One sentence, French. Null if nothing prominent.
- blog_post_count: number of visible actualit\u00e9s/news/communiqu\u00e9s posts on the page. Null if no news section visible.
- blog_latest_title: title of the most recent news post. Null if no news section.
- blog_latest_date: date of the most recent news post in YYYY-MM-DD format. Null if not visible.`;

const MEDIA_PROMPT = `You are a strict local media intelligence extractor. You read the homepage of a local media outlet (blog, journal, magazine, guide sortir) and extract structured signals about local venue, event, and business coverage.

Extract the following fields. If a field is not explicitly visible on the page, return null. Never infer, never guess.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

{
  "has_promo": false,
  "promo_summary": null,
  "has_sold_out": false,
  "sold_out_summary": null,
  "featured_offer": null,
  "blog_post_count": null,
  "blog_latest_title": null,
  "blog_latest_date": null
}

RULES:
- has_promo: true if any sponsored content, advertising partnership, promoted event listing, or editorial selection ("coups de coeur", "s\u00e9lection de la r\u00e9daction") is visible. Otherwise false.
- promo_summary: one-sentence French summary. Null if has_promo is false.
- has_sold_out: false. Always false for media.
- sold_out_summary: null. Always null for media.
- featured_offer: the main headline article or featured event/venue/business review on the homepage. One sentence, French. Null if nothing prominent.
- blog_post_count: number of visible articles on the homepage. Null if unclear.
- blog_latest_title: title of the most recent article. Null if unclear.
- blog_latest_date: date of the most recent article in YYYY-MM-DD format. Null if not visible.`;

const AGGREGATOR_PROMPT = `You are a strict listing platform intelligence extractor. You read the homepage of an event/venue aggregator (Sortir \u00e0 Paris, TripAdvisor, L'Officiel des Spectacles, Fnac Spectacles) and extract structured signals about trending events and featured listings.

Extract the following fields. If a field is not explicitly visible on the page, return null. Never infer, never guess.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

{
  "has_promo": false,
  "promo_summary": null,
  "has_sold_out": false,
  "sold_out_summary": null,
  "featured_offer": null,
  "blog_post_count": null,
  "blog_latest_title": null,
  "blog_latest_date": null
}

RULES:
- has_promo: true if any promoted listing, sponsored event, featured partner, or editorial pick is visible on the homepage. Otherwise false.
- promo_summary: one-sentence French summary of the promoted listing or partner. Null if has_promo is false.
- has_sold_out: true if any "complet", "sold out", "plus de places", "\u00e9puis\u00e9", "guichet ferm\u00e9" mention is visible for a trending event. Otherwise false.
- sold_out_summary: one-sentence French summary of what is sold out. Null if has_sold_out is false.
- featured_offer: the main highlighted event, experience, or trending listing on the homepage with price if visible. One sentence, French. Null if nothing prominent.
- blog_post_count: number of visible editorial articles or guides on the page. Null if no editorial section.
- blog_latest_title: title of the most recent editorial article or guide. Null if none.
- blog_latest_date: date of the most recent article in YYYY-MM-DD format. Null if not visible.`;

function getPromptForEntityType(entityType: string): string {
  switch (entityType) {
    case "institution": return INSTITUTION_PROMPT;
    case "media": return MEDIA_PROMPT;
    case "aggregator": return AGGREGATOR_PROMPT;
    default: return HOMEPAGE_PROMPT;
  }
}

const HOMEPAGE_PROMPT = `You are a strict business intelligence extractor. You read the homepage content of a competitor website and extract structured marketing signals.

Extract the following fields. If a field is not explicitly visible on the page, return null. Never infer, never guess.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

{
  "has_promo": false,
  "promo_summary": null,
  "has_sold_out": false,
  "sold_out_summary": null,
  "featured_offer": null,
  "blog_post_count": null,
  "blog_latest_title": null,
  "blog_latest_date": null
}

RULES:
- has_promo: true if any promotional banner, sale, discount, special offer, or limited-time deal is visible. Otherwise false.
- promo_summary: one-sentence French summary of the promotion. Null if has_promo is false.
- has_sold_out: true if any "complet", "sold out", "plus de places", "épuisé", "guichet fermé" mention is visible. Otherwise false.
- sold_out_summary: one-sentence French summary of what is sold out. Null if has_sold_out is false.
- featured_offer: the main highlighted product, service, event, or experience on the homepage with price if visible. One sentence, French. Null if nothing is prominently featured.
- blog_post_count: number of visible blog/actualités/news posts on the page. Null if no blog section visible.
- blog_latest_title: title of the most recent blog post. Null if no blog section.
- blog_latest_date: date of the most recent blog post in YYYY-MM-DD format. Null if not visible or cannot determine exact date.`;

function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function deriveHomepageUrl(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return sourceUrl;
  }
}

function prepareContent(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim().slice(0, 10_000);
  return text;
}

async function fetchHtml(url: string, browserlessToken: string): Promise<{ html: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `https://production-sfo.browserless.io/content?token=${browserlessToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          url,
          waitForTimeout: 3000,
          rejectResourceTypes: ["image", "media", "font"],
        }),
      }
    );
    const html = await res.text();
    return { html, status: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

interface HomepageExtraction {
  has_promo: boolean;
  promo_summary: string | null;
  has_sold_out: boolean;
  sold_out_summary: string | null;
  featured_offer: string | null;
  blog_post_count: number | null;
  blog_latest_title: string | null;
  blog_latest_date: string | null;
}

function validateExtraction(raw: unknown): HomepageExtraction {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Extraction result is not an object");
  }
  const r = raw as Record<string, unknown>;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  return {
    has_promo: r.has_promo === true,
    promo_summary: typeof r.promo_summary === "string" ? r.promo_summary.trim() || null : null,
    has_sold_out: r.has_sold_out === true,
    sold_out_summary: typeof r.sold_out_summary === "string" ? r.sold_out_summary.trim() || null : null,
    featured_offer: typeof r.featured_offer === "string" ? r.featured_offer.trim() || null : null,
    blog_post_count: typeof r.blog_post_count === "number" ? Math.round(r.blog_post_count) : null,
    blog_latest_title: typeof r.blog_latest_title === "string" ? r.blog_latest_title.trim() || null : null,
    blog_latest_date: typeof r.blog_latest_date === "string" && dateRegex.test(r.blog_latest_date) ? r.blog_latest_date : null,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
  const browserlessToken = process.env.BROWSERLESS_TOKEN ?? "";
  const startTime = Date.now();

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const bq = makeBQClient(projectId);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const [rows] = await bq.query({
      query: `
        SELECT DISTINCT
          cd.competitor_id,
          cd.entity_type,
          cd.source_url,
          ct.location_id
        FROM \`${projectId}.raw.competitor_directory\` cd
        INNER JOIN \`${projectId}.raw.competitor_tracking\` ct
          ON cd.competitor_id = ct.competitor_id
          AND ct.deleted_at IS NULL
        WHERE cd.deleted_at IS NULL
          AND cd.source_url IS NOT NULL
          AND cd.source_url != ''
          AND cd.is_user_vetted = TRUE
      `,
      location: BQ_LOCATION,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, ...results, message: "No competitors with source_url" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    const today = new Date().toISOString().slice(0, 10);

    // Deduplicate by homepage URL — multiple competitors may share the same domain
    const seen = new Set<string>();

    for (const row of rows as any[]) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const competitorId = String(row.competitor_id);
      const entityType = row.entity_type ?? "competitor";
      const locationId = row.location_id ?? null;
      const sourceUrl = String(row.source_url);
      const homepageUrl = deriveHomepageUrl(sourceUrl);

      if (seen.has(`${competitorId}:${homepageUrl}`)) {
        results.skipped++;
        continue;
      }
      seen.add(`${competitorId}:${homepageUrl}`);

      results.processed++;

      try {
        const { html, status } = await fetchHtml(homepageUrl, browserlessToken);

        if (status < 200 || status >= 400) {
          throw new Error(`HTTP ${status}`);
        }

        const content = prepareContent(html);
        const pageHash = hashString(content);

        const message = await anthropic.messages.create({
          model: EXTRACTION_MODEL,
          max_tokens: 1024,
          messages: [
            { role: "user", content: `${getPromptForEntityType(entityType)}\n\nHOMEPAGE CONTENT:\n${content}` },
          ],
        });

        const rawText = message.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
        const extraction = validateExtraction(parsed);

        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_snapshots\` (
              snapshot_id, competitor_id, entity_type, location_id,
              snapshot_date, source,
              has_promo, promo_summary,
              has_sold_out, sold_out_summary,
              featured_offer, page_hash,
              blog_post_count, blog_latest_title, blog_latest_date,
              raw_extraction_json, crawl_status, created_at
            ) VALUES (
              @snapshot_id, @competitor_id, @entity_type, @location_id,
              DATE(@snapshot_date), 'homepage',
              @has_promo, @promo_summary,
              @has_sold_out, @sold_out_summary,
              @featured_offer, @page_hash,
              @blog_post_count, @blog_latest_title, @blog_latest_date,
              @raw_extraction_json, 'success', CURRENT_TIMESTAMP()
            )
          `,
          params: {
            snapshot_id: randomUUID(),
            competitor_id: competitorId,
            entity_type: entityType,
            location_id: locationId,
            snapshot_date: today,
            has_promo: extraction.has_promo,
            promo_summary: extraction.promo_summary,
            has_sold_out: extraction.has_sold_out,
            sold_out_summary: extraction.sold_out_summary,
            featured_offer: extraction.featured_offer,
            page_hash: pageHash,
            blog_post_count: extraction.blog_post_count,
            blog_latest_title: extraction.blog_latest_title,
            blog_latest_date: extraction.blog_latest_date,
            raw_extraction_json: rawText,
          },
          types: {
            snapshot_id: "STRING",
            competitor_id: "STRING",
            entity_type: "STRING",
            location_id: "STRING",
            snapshot_date: "STRING",
            has_promo: "BOOL",
            promo_summary: "STRING",
            has_sold_out: "BOOL",
            sold_out_summary: "STRING",
            featured_offer: "STRING",
            page_hash: "STRING",
            blog_post_count: "INT64",
            blog_latest_title: "STRING",
            blog_latest_date: "STRING",
            raw_extraction_json: "STRING",
          },
          location: BQ_LOCATION,
        });

        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`${competitorId}: ${err?.message ?? String(err)}`);

        // Write failure row
        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_snapshots\` (
              snapshot_id, competitor_id, entity_type, location_id,
              snapshot_date, source, crawl_status, created_at
            ) VALUES (
              @snapshot_id, @competitor_id, @entity_type, @location_id,
              DATE(@snapshot_date), 'homepage', 'failed', CURRENT_TIMESTAMP()
            )
          `,
          params: {
            snapshot_id: randomUUID(),
            competitor_id: competitorId,
            entity_type: entityType,
            location_id: locationId,
            snapshot_date: today,
          },
          types: {
            snapshot_id: "STRING",
            competitor_id: "STRING",
            entity_type: "STRING",
            location_id: "STRING",
            snapshot_date: "STRING",
          },
          location: BQ_LOCATION,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[snapshot-homepage]", err?.message);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message, ...results }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};