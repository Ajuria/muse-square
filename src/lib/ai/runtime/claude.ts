import { modelFor } from "../models";

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
}): Promise<{ ok: boolean; rawText: string; errors: string[]; usage: ClaudeCallUsage | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, rawText: "", errors: ["Missing ANTHROPIC_API_KEY."], usage: null };
  }

  const model = args.model ?? modelFor("packager");
  const max_tokens = args.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 3000);
  const temperature = args.temperature ?? 0;
  const cacheSystem = args.cacheSystem !== false;

  const body = {
    model,
    max_tokens,
    temperature,
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
      return { ok: false, rawText: "", errors: [`Claude API error ${r.status}: ${text.slice(0, 3000)}`], usage: null };
    }

    const data = JSON.parse(text) as ClaudeResponse;
    const blocks = data.content ?? [];
    const texts: string[] = [];
    for (const b of blocks) if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);

    const u = data.usage ?? {};
    const usage: ClaudeCallUsage = {
      input: u.input_tokens ?? null,
      output: u.output_tokens ?? null,
      cache_read: u.cache_read_input_tokens ?? null,
      cache_creation: u.cache_creation_input_tokens ?? null,
    };
    console.log(`[claude] usage input=${usage.input} output=${usage.output} cache_read=${usage.cache_read} cache_creation=${usage.cache_creation}`);

    return { ok: true, rawText: texts.join("\n").trim(), errors: [], usage };
  } catch (e: any) {
    return { ok: false, rawText: "", errors: [`Claude call failed: ${e?.message ?? String(e)}`], usage: null };
  } finally {
    clearTimeout(timeout);
  }
}
