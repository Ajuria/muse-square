import { modelFor, capsFor } from "../models";

console.log("[env] ANTHROPIC_API_KEY present:", Boolean(process.env.ANTHROPIC_API_KEY));

type ClaudeBlock = { type: string; text?: string };
type ClaudeUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};
type ClaudeResponse = { content?: ClaudeBlock[]; usage?: ClaudeUsage };

export type ClaudeCallUsage = {
  input: number | null;
  output: number | null;
  cache_read: number | null;
  cache_creation: number | null;
};

export async function callClaudeMessagesAPI(args: {
  system: string;
  // Structured payload (packager) — stringified as the user message. Ignored when `userText` is set.
  userPayload?: Record<string, any>;
  // Raw-text user message (classifiers/lookups that want plain text, not JSON). Takes precedence.
  userText?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  // Cache the system prompt as an ephemeral prefix (Anthropic prompt caching). The system prompt is the
  // large, stable per-mode packager instruction — caching it makes repeat day-horizon calls cheaper/faster.
  // Default true; only the stable system is cached (variable payload + history stay uncached).
  cacheSystem?: boolean;
  // JSON Schema constraining the reply (Anthropic structured outputs -> output_config.format). When the
  // model supports it the shape stops being a hope the prompt expresses and a parser reconstructs: the API
  // emits schema-valid JSON with no markdown fence and no prose. Ignored on models without the capability,
  // so a caller can always pass it and the transport decides. Proven to coexist with prompt caching
  // (cache_creation 1920 -> cache_read 1920 on a real packager system prompt).
  outputSchema?: Record<string, any>;
  // `structured` reports whether output_config.format was ACTUALLY applied (schema supplied AND the model
  // supports it) — callers use it to decide whether the reply is guaranteed schema-valid JSON or still
  // needs the legacy fence-strip/repair path. Never infer this from `outputSchema` alone at a call site:
  // the transport, not the caller, resolves the model and therefore the capability.
}): Promise<{ ok: boolean; rawText: string; errors: string[]; usage: ClaudeCallUsage | null; structured: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, rawText: "", errors: ["Missing ANTHROPIC_API_KEY."], usage: null, structured: false };
  }

  const model = args.model ?? modelFor("packager");
  const caps = capsFor(model);
  const max_tokens = args.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 3000);
  const cacheSystem = args.cacheSystem !== false;

  const body: Record<string, any> = {
    model,
    max_tokens,
    // Cache-controlled system block (stable prefix) when enabled; plain string otherwise.
    system: cacheSystem
      ? [{ type: "text", text: args.system.trim(), cache_control: { type: "ephemeral" } }]
      : args.system.trim(),
    messages: [
      ...((args.conversationHistory ?? (args.userPayload as any)?._conversation_history) ?? []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: typeof args.userText === "string"
          ? args.userText
          : JSON.stringify(
              Object.fromEntries(
                Object.entries(args.userPayload ?? {}).filter(([k]) => k !== "_conversation_history")
              )
            ),
      },
    ],
  };

  // ── Per-model request surface (see capsFor in ../models — every branch API-proven) ──────────────────
  // Sampling: Sonnet 5 REMOVED temperature/top_p/top_k and 400s on any of them ("`temperature` is
  // deprecated for this model"). Callers keep passing `temperature: 0` — that stays correct for the Haiku
  // roles (classifier/briefing/corrections) and is dropped here for models that reject it, so no call site
  // has to know which model it got. NOTE: on Sonnet 5 the packager therefore runs at the API default
  // temperature; determinism is no longer purchasable via the parameter, only via the prompt + validator.
  if (caps.sampling) body.temperature = args.temperature ?? 0;

  // Thinking: on Sonnet 5, OMITTING `thinking` silently turns ADAPTIVE thinking on — measured 134 thinking
  // tokens of a 278-token reply, i.e. ~half the output budget diverted before a single word of the answer.
  // The packager runs on a tight max_tokens against a hard validator, so a truncated reply is a rejected
  // reply. Disable explicitly to keep the pre-Sonnet-5 behaviour; enabling it is a separate, measured call.
  if (caps.thinkingDefaultsOn) body.thinking = { type: "disabled" };

  // Structured outputs: the canonical spelling is `output_config.format`. The top-level `output_format`
  // is REJECTED (400: "This field is deprecated. Use 'output_config.format' instead") — do not "simplify".
  const structured = Boolean(args.outputSchema) && caps.structuredOutputs;
  if (structured) {
    body.output_config = { format: { type: "json_schema", schema: args.outputSchema } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 30_000);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await r.text();
    if (r.status >= 400) {
      return { ok: false, rawText: "", errors: [`Claude API error ${r.status}: ${text.slice(0, 3000)}`], usage: null, structured };
    }

    const data = JSON.parse(text) as ClaudeResponse;
    const blocks = data.content ?? [];
    const texts: string[] = [];
    // `thinking` blocks are skipped by the type check below — on a thinking-capable model the answer is
    // still only the text blocks.
    for (const b of blocks) if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);

    const u = data.usage ?? {};
    const usage: ClaudeCallUsage = {
      input: u.input_tokens ?? null,
      output: u.output_tokens ?? null,
      cache_read: u.cache_read_input_tokens ?? null,
      cache_creation: u.cache_creation_input_tokens ?? null,
    };
    console.log(`[claude] model=${model} structured=${structured} usage input=${usage.input} output=${usage.output} cache_read=${usage.cache_read} cache_creation=${usage.cache_creation}`);

    return { ok: true, rawText: texts.join("\n").trim(), errors: [], usage, structured };
  } catch (e: any) {
    return { ok: false, rawText: "", errors: [`Claude call failed: ${e?.message ?? String(e)}`], usage: null, structured };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Web-search transport ──────────────────────────────────────────────────────
// The one Anthropic call for server-side web_search (competitor/event discovery, Consulter web
// fallback). Centralizes model resolution, timeout, usage logging, error handling and — critically —
// block parsing: web_search returns interleaved server_tool_use / web_search_tool_result / text blocks,
// and the final answer is the text AFTER the last tool block (pre-search reasoning is a fragment that
// breaks JSON parsing). `usedWebSearch` reports whether the tool actually fired.
//
// max_tokens defaults to 4096: web_search consumes the budget (tool calls + results + reasoning); at a
// lower cap the final JSON answer truncates -> parse fails -> a valid result is silently lost.
export async function callClaudeWithWebSearch(args: {
  system: string;
  userText: string;
  model?: string;
  maxTokens?: number;
  maxUses?: number;
  timeoutMs?: number;
  // Prior turns (multi-turn memory) prepended before the current userText — lets a web-search answer
  // honor the user's corrections/refinements from earlier in the conversation (e.g. "je suis un café").
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: boolean; usedWebSearch: boolean; text: string; errors: string[]; usage: ClaudeCallUsage | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, usedWebSearch: false, text: "", errors: ["Missing ANTHROPIC_API_KEY."], usage: null };
  }

  const model = args.model ?? modelFor("web_search");
  const max_tokens = args.maxTokens ?? 4096;
  const tool: Record<string, any> = { type: "web_search_20250305", name: "web_search" };
  if (typeof args.maxUses === "number") tool.max_uses = args.maxUses;

  const history = (args.conversationHistory ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  const body = {
    model,
    max_tokens,
    system: args.system.trim(),
    tools: [tool],
    messages: [...history, { role: "user" as const, content: args.userText }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 30_000);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await r.text();
    if (r.status >= 400) {
      return { ok: false, usedWebSearch: false, text: "", errors: [`Claude web-search error ${r.status}: ${raw.slice(0, 3000)}`], usage: null };
    }

    const data = JSON.parse(raw) as ClaudeResponse;
    const blocks: any[] = Array.isArray(data.content) ? data.content : [];
    const usedWebSearch = blocks.some((b) => b?.type === "server_tool_use" && b?.name === "web_search");
    // Final answer = text blocks AFTER the last tool block (server_tool_use / web_search_tool_result).
    const lastToolIdx = blocks.reduce(
      (acc: number, b: any, i: number) =>
        (b?.type === "server_tool_use" || b?.type === "web_search_tool_result") ? i : acc,
      -1
    );
    const text = blocks
      .slice(lastToolIdx + 1)
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("")
      .trim();

    const u = data.usage ?? {};
    const usage: ClaudeCallUsage = {
      input: u.input_tokens ?? null,
      output: u.output_tokens ?? null,
      cache_read: u.cache_read_input_tokens ?? null,
      cache_creation: u.cache_creation_input_tokens ?? null,
    };
    console.log(`[claude:web_search] used=${usedWebSearch} input=${usage.input} output=${usage.output}`);

    return { ok: true, usedWebSearch, text, errors: [], usage };
  } catch (e: any) {
    return { ok: false, usedWebSearch: false, text: "", errors: [`Claude web-search failed: ${e?.message ?? String(e)}`], usage: null };
  } finally {
    clearTimeout(timeout);
  }
}
