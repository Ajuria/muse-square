// src/lib/ai/safeMarkdown.ts
// Server-side twin of the chat renderer (public/scripts/ie-prompt.js → mdInlineToSafeHtml).
// Used wherever the SERVER prints model-authored prose into HTML — today the daily-briefing and alert
// emails, which otherwise deliver literal **asterisks** to the operator's inbox.
//
// SAFETY MODEL — the ORDERING is the entire guarantee:
//   1. escape FIRST  → every byte the model emitted becomes inert text
//   2. re-introduce ONLY whitelisted tags on the already-escaped string
// NEVER the reverse. No raw HTML passthrough, no sanitizer dependency.
//
// Whitelist: **gras** → <strong>, *italique* → <em>. Nothing else.
// <strong>/<em> are universally supported by email clients and need no CSS/classes — deliberately no
// block tags, no links (nothing validates a model-emitted URL), no headings/tables/code/images.
//
// It is a TWIN, not a shared module, on purpose: the chat renderer is a static browser script that
// cannot import TS. KEEP THE TWO IN SYNC — same whitelist, same ordering.

export function escapeHtmlSafe(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mdInline(t: string): string {
  return t
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")        // **gras** — before *italique*
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");   // *italique*
}

// Drop-in for an escape helper on any model-authored prose printed into HTML.
export function mdInlineToSafeHtml(text: any): string {
  return mdInline(escapeHtmlSafe(text));
}
