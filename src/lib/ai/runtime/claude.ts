console.log("[env] ANTHROPIC_API_KEY present:", Boolean(process.env.ANTHROPIC_API_KEY));

type ClaudeBlock = { type: string; text?: string };
type ClaudeResponse = { content?: ClaudeBlock[] };

export async function callClaudeMessagesAPI(args: {
  system: string;
  userPayload: Record<string, any>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: boolean; rawText: string; errors: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, rawText: "", errors: ["Missing ANTHROPIC_API_KEY."] };
  }

  const model = args.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";
  const max_tokens = args.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 3000);
  const temperature = args.temperature ?? 0;

  const body = {
    model,
    max_tokens,
    temperature,
    system: args.system.trim(),
    messages: [
      ...((args.userPayload as any)?._conversation_history ?? []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: JSON.stringify(
          Object.fromEntries(
            Object.entries(args.userPayload).filter(([k]) => k !== "_conversation_history")
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
      return { ok: false, rawText: "", errors: [`Claude API error ${r.status}: ${text.slice(0, 3000)}`] };
    }

    const data = JSON.parse(text) as ClaudeResponse;
    const blocks = data.content ?? [];
    const texts: string[] = [];
    for (const b of blocks) if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);

    return { ok: true, rawText: texts.join("\n").trim(), errors: [] };
  } catch (e: any) {
    return { ok: false, rawText: "", errors: [`Claude call failed: ${e?.message ?? String(e)}`] };
  } finally {
    clearTimeout(timeout);
  }
}
