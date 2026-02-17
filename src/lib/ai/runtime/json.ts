export function stripMdCodeFence(s: string): string {
  const t = (s ?? "").trim();
  if (!t.startsWith("```")) return t;

  const lines = t.split("\n");
  // drop first line ``` or ```json
  lines.shift();
  // drop last line if ```
  if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
  return lines.join("\n").trim();
}

export function parseJsonObjectStrict(raw: string): { ok: true; value: any } | { ok: false; error: string } {
  const cleaned = stripMdCodeFence(raw);
  const t = cleaned.trimStart();

  // Fail closed: must start with '{'
  if (!t.startsWith("{")) return { ok: false, error: "Model returned non-JSON text." };

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Model JSON is not an object." };
    }
    return { ok: true, value: parsed };
  } catch (e: any) {
    return { ok: false, error: `Model output is not valid JSON: ${e?.message ?? String(e)}` };
  }
}
