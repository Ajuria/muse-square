// POST /api/explorer/agent — L'AGENT EXPLORER (docs/explorer-agentique-spec.md, owner 11/09).
//
// Un endpoint agentique À CÔTÉ de /api/insight/prompt (jamais dedans) : une conversation à outils, un
// fichier en entrée (photo, plan PDF), une mémoire de travail par site. Le SDK Anthropic fait la boucle
// (client.beta.messages.toolRunner + betaZodTool) ; le modèle est celui du rôle « agent » (models.ts).
//
// Sans état : le client renvoie l'historique complet ; chaque tour reçu et rendu s'écrit dans
// raw.explorer_agent_turns (app-write). Les outils ne lisent que la couche semantic ou une lib existante
// (agentTools.ts) et n'écrivent que dans raw.explorer_site_memory (siteMemory.ts).
//
// Auth (comme insight/prompt.ts) : Clerk en prod (requireLocationAccess — owner ET membre lisent) ; en
// `astro dev` avec MS_AUTH_BYPASS=1, le middleware laisse passer sans session et le site vient du corps.
// Le corps : { location_id, messages: [{role, content}], files?: [{kind, media_type, data_base64, name}],
//              thread_id?, stream? }. Les images vont au modèle en blocs image, les PDF en blocs document.
// La réponse : le tour de l'assistant + la liste des appels d'outils (ce que le proto affiche) ; en
// stream (SSE, comme prompt.ts) : un événement `tool` par appel, puis UN événement `result`.
import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { GET as photosGET } from "../dispositifs/photos";
import type { PhotoBytes, PhotoInfo, ToolCallRecord } from "../../../lib/explorer/agentTools";
import type { AuthorRole } from "../../../lib/explorer/siteMemory";
import { OUTILS_FR } from "../../../lib/explorer/agentSystem.fr";
import { IMAGE_TYPES, runAgentTurn, type AgentTurnResult, type FileIn, type ImageType, type MsgIn } from "../../../lib/explorer/agentTurn";
import { newReportDocumentRow, readReportDocument, writeReportDocument } from "../../../lib/rapport/documents";
import { approfondirPrompt, approfondirSection } from "../../../lib/rapport/gestes";
// 13/09 (§ 7) : la boucle vit dans lib/explorer/agentTurn.ts — la route garde l'HTTP ; toApiMessages y est re-exporté.
export { toApiMessages } from "../../../lib/explorer/agentTurn";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const DEV_BYPASS = import.meta.env.DEV && process.env.MS_AUTH_BYPASS === "1";

const MAX_MESSAGES = 40;
const MAX_TEXT = 20_000;
const MAX_FILES = 4;
const MAX_FILE_BYTES = 32 * 1024 * 1024;   // la limite de l'API par requête

// En bypass dev, le proto tourne sur 4173 (npm run harness) et appelle 4321 : CORS ouvert, en dev seulement.
const corsHeaders = (): Record<string, string> =>
  DEV_BYPASS ? { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" } : {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders() } });
}

// ── Le corps de la requête ─────────────────────────────────────────────────────────────────────────
function parseMessages(raw: unknown): { messages: MsgIn[] } | { error: string } {
  if (!Array.isArray(raw) || !raw.length) return { error: "messages requis" };
  if (raw.length > MAX_MESSAGES) return { error: `messages : ${MAX_MESSAGES} tours au plus` };
  const messages: MsgIn[] = [];
  for (const m of raw) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    const content = typeof m?.content === "string" ? m.content.trim() : "";
    if (!role) return { error: "messages : role user | assistant" };
    if (content.length > MAX_TEXT) return { error: `messages : ${MAX_TEXT} caractères au plus par tour` };
    messages.push({ role, content });
  }
  const last = messages[messages.length - 1];
  if (last.role !== "user" || !last.content) return { error: "messages : le dernier tour est une question de l'utilisateur" };
  return { messages };
}

function parseFiles(raw: unknown): { files: FileIn[] } | { error: string } {
  if (raw == null) return { files: [] };
  if (!Array.isArray(raw)) return { error: "files : une liste" };
  if (raw.length > MAX_FILES) return { error: `files : ${MAX_FILES} fichiers au plus` };
  const files: FileIn[] = [];
  for (const f of raw) {
    const media_type = String(f?.media_type || "").toLowerCase();
    const kind = media_type === "application/pdf" ? "pdf" : IMAGE_TYPES.has(media_type) ? "image" : null;
    if (!kind) return { error: "fichier : image (jpeg, png, webp, gif) ou PDF" };
    if (f?.kind && f.kind !== kind) return { error: "fichier : kind et media_type ne concordent pas" };
    const data_base64 = String(f?.data_base64 || "").replace(/\s+/g, "");
    if (!data_base64) return { error: "fichier : data_base64 requis" };
    if (Math.floor((data_base64.length * 3) / 4) > MAX_FILE_BYTES) return { error: "fichier : 32 Mo au plus" };
    files.push({ kind, media_type, data_base64, name: String(f?.name || (kind === "pdf" ? "plan.pdf" : "photo")).slice(0, 200) });
  }
  return { files };
}

// ── Les photos : le contrat GET de /api/dispositifs/photos, appelé en interne (comme admin/invite.ts
//    appelle profile/save.ts) — jamais réécrit ici.
const photosUrl = (q: string) => new URL(`http://internal/api/dispositifs/photos?${q}`);
async function readPhotos(locals: any, dispositif_id: string): Promise<PhotoInfo[]> {
  const res: Response = await (photosGET as any)({ url: photosUrl(`dispositif_id=${encodeURIComponent(dispositif_id)}`), locals });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.ok) throw new Error(out?.error || `photos : ${res.status}`);
  return Array.isArray(out.photos) ? out.photos : [];
}
async function readPhotoBytes(locals: any, dispositif_id: string, photo_id: string): Promise<PhotoBytes | null> {
  const res: Response = await (photosGET as any)({ url: photosUrl(`dispositif_id=${encodeURIComponent(dispositif_id)}&file=${encodeURIComponent(photo_id)}`), locals });
  if (!res.ok) return null;
  const ct = String(res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  return { media_type: (IMAGE_TYPES.has(ct) ? ct : "image/jpeg") as ImageType, base64: buf.toString("base64"), bytes: buf.length };
}

// ── Le cœur ────────────────────────────────────────────────────────────────────────────────────────
async function handle(ctx: Parameters<APIRoute>[0], onTool?: (r: ToolCallRecord & { label_fr: string }) => void): Promise<Response> {
  const { request, locals } = ctx;
  const l = locals as any;
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);

  // Qui parle, sur quel site.
  const location_id = String(body.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  let user_id: string;
  let role: AuthorRole;
  let internalLocals: any;
  let ownedIds: string[] = [location_id];
  if (DEV_BYPASS && !l?.clerk_user_id) {
    user_id = String(body.dev_user_id || "dev-bypass").slice(0, 80);
    role = "owner";
    internalLocals = { clerk_user_id: user_id, all_location_ids: [location_id] };
  } else {
    user_id = String(l?.clerk_user_id || "").trim();
    if (!user_id) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
    requireLocationAccess(locals, location_id);
    const owned: string[] = Array.isArray(l?.all_location_ids) ? l.all_location_ids.map(String) : [];
    role = owned.includes(location_id) ? "owner" : "member";
    ownedIds = owned;
    internalLocals = locals;
  }
  if (!rateLimit(user_id, "explorer-agent", 10, 60_000)) return rateLimitResponse();

  // 12/09 (spec § 6.2, incrément 3) — APPROFONDIR : { document_id, section, question } ; le message de la boucle est bâti
  // depuis le document (la section, ses dates en du/au, la question) ; après le tour, le résultat s'insère après la
  // section, vérifié, et la version suivante s'écrit — la réponse porte le document.
  const bq = makeBQClient(BQ_PROJECT);
  let approfondir: { document_id: string; section: number; question: string; prev: NonNullable<Awaited<ReturnType<typeof readReportDocument>>> } | null = null;
  let messagesIn: unknown = body.messages;
  if (body.approfondir && typeof body.approfondir === "object") {
    const a = body.approfondir;
    const document_id = String(a.document_id || "").trim();
    const prev = document_id ? await readReportDocument(bq, location_id, document_id) : null;
    if (!prev) return json({ ok: false, error: "Rapport introuvable sur ce site" }, 404);
    const prompt = approfondirPrompt(prev.rapport, Number(a.section), String(a.question || ""));
    if (typeof prompt !== "string") return json({ ok: false, error: prompt.erreur }, 400);
    approfondir = { document_id, section: Number(a.section), question: String(a.question).trim(), prev };
    messagesIn = [...(Array.isArray(body.messages) ? body.messages : []), { role: "user", content: prompt }];
  }
  const pm = parseMessages(messagesIn);
  if ("error" in pm) return json({ ok: false, error: pm.error }, 400);
  const pf = parseFiles(body.files);
  if ("error" in pf) return json({ ok: false, error: pf.error }, 400);
  const thread_id = /^[A-Za-z0-9_-]{1,80}$/.test(String(body.thread_id || "")) ? String(body.thread_id) : randomUUID();

  // 13/09 (§ 7) — LE tour, dans lib/explorer/agentTurn.ts : mêmes outils, même porte, même relecture, même trace que
  // l'aiguillage par capacité de insight/prompt.ts.
  let turn: AgentTurnResult;
  try {
    turn = await runAgentTurn(bq, {
      location_id, user_id, role, ownedIds, messages: pm.messages, files: pf.files, thread_id,
      readPhotos: (d) => readPhotos(internalLocals, d), readPhotoBytes: (d, p) => readPhotoBytes(internalLocals, d, p), onTool,
    });
  } catch (e: any) {
    const status = e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500;
    return json({ ok: false, error: String(e?.message || e), thread_id, tool_calls: [] }, status);
  }
  const { text, blocks, grounding, relecture, tool_calls, final, refused } = turn;

  // Approfondir : le résultat du tour entre dans le document, la version suivante s'écrit.
  let document: unknown = undefined;
  if (approfondir) {
    const out = approfondirSection(approfondir.prev.rapport, approfondir.section, { blocks, text, register: grounding.register, question: approfondir.question });
    if ("erreur" in out) return json({ ok: false, error: out.erreur }, 400);
    const row = newReportDocumentRow({ location_id, author: { user_id, role }, rapport: out, document_id: approfondir.document_id, version: approfondir.prev.version + 1, modele_id: approfondir.prev.modele_id });
    await writeReportDocument(bq, row);
    document = { ...approfondir.prev, version: row.version, created_at: row.created_at, rapport: out };
  }

  return json({
    ok: true,
    thread_id,
    ...(document ? { document } : {}),
    assistant: { text, stop_reason: final.stop_reason ?? null, refused, register: grounding.register, ungrounded_numbers: grounding.ungrounded_numbers, relecture: { phrases_retirees: relecture.phrases_retirees, fautes: relecture.fautes.map((f) => ({ motif: f.motif, faute: f.faute })) } },
    blocks,
    tool_calls: tool_calls.map((r) => ({ name: r.name, input: r.input, ok: r.ok, summary: r.summary, ms: r.ms, label_fr: OUTILS_FR[r.name] ?? r.name })),
    usage: {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
    },
    model: final.model,
  });
}

export const OPTIONS: APIRoute = async () =>
  DEV_BYPASS ? new Response(null, { status: 204, headers: corsHeaders() }) : new Response(null, { status: 404 });

export const POST: APIRoute = async (ctx) => {
  let wantStream = false;
  try { wantStream = (await ctx.request.clone().json())?.stream === true; } catch { /* le cœur rendra l'erreur */ }
  const safe = async (fn: () => Promise<Response>): Promise<Response> => {
    try { return await fn(); } catch (e: any) {
      const msg = String(e?.message || e);
      return json({ ok: false, error: msg }, msg.startsWith("FORBIDDEN") ? 403 : 500);
    }
  };
  if (!wantStream) return safe(() => handle(ctx));

  // SSE, le contrat de prompt.ts : une fois le flux ouvert, HTTP est 200 ; `result` porte {status, body}.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (event: string, data: unknown) => writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  (async () => {
    try {
      const res = await safe(() => handle(ctx, (r) => { void send("tool", r); }));
      const txt = await res.text();
      let out: unknown = null;
      try { out = JSON.parse(txt); } catch { /* le client lit le statut */ }
      await send("result", { status: res.status, body: out });
    } catch (e: any) {
      await send("result", { status: 500, body: { ok: false, error: e?.message ?? "Unknown error" } });
    } finally {
      try { await writer.close(); } catch { /* client parti */ }
    }
  })();
  return new Response(readable, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", ...corsHeaders() },
  });
};
