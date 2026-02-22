// src/lib/ai/render/shared/render_points_cles_v1.ts
//
// Shared deterministic renderer for "Points clés" (V3 contract-safe).
//
// Guarantees:
// - 1 surfaced sentence => ≥1 fact_id
// - hard de-dup with fact_id merge
// - stable order
// - action always last
// - no summary generation here
// - no free-text escape
//

export type PointKind =
  | "verdict"
  | "primary"
  | "secondary"
  | "action";

export type PointInputItem = {
  kind: PointKind;
  text: string | null | undefined;
  fact_ids: string[]; // MUST be non-empty upstream
};

export type PointRenderLineV1 = {
  kind: PointKind;
  text: string;
  fact_ids: string[];
};

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

function cleanLine(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/^[•\-\u2022]\s*/, "")
    .trim();
}

function normKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[•·-]/g, "")
    .trim();
}

function assertValidInput(items: PointInputItem[]): void {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    if (!it) throw new Error(`PointInputItem[${i}] undefined`);

    if (!Array.isArray(it.fact_ids) || it.fact_ids.length < 1) {
      throw new Error(`PointInputItem[${i}] has no fact_ids`);
    }
  }
}

// -----------------------------------------------------
// Public renderer
// -----------------------------------------------------

export function renderPointsClesV1(args: {
  items: PointInputItem[];
  max_points?: number;
}): PointRenderLineV1[] {
  const max = args.max_points ?? 5;

  const raw = args.items ?? [];

  assertValidInput(raw);

  // Step 1 — normalize & clean
  const prepared: PointRenderLineV1[] = [];

  for (const it of raw) {
    if (!it.text) continue;

    const cleaned = cleanLine(it.text);
    if (!cleaned) continue;

    prepared.push({
      kind: it.kind,
      text: cleaned,
      fact_ids: [...new Set(it.fact_ids)],
    });
  }

  // Step 2 — hard de-dup with fact_id merge
  const seen = new Map<string, PointRenderLineV1>();

  for (const line of prepared) {
    const key = normKey(line.text);

    if (!seen.has(key)) {
      seen.set(key, { ...line });
    } else {
      const existing = seen.get(key)!;

      // Merge fact_ids (union)
      const merged = new Set([
        ...existing.fact_ids,
        ...line.fact_ids,
      ]);

      existing.fact_ids = Array.from(merged);
    }
  }

  const deduped = Array.from(seen.values());

  // Step 3 — enforce ordering (action always last)
  const action = deduped.filter((x) => x.kind === "action");
  const nonAction = deduped.filter((x) => x.kind !== "action");

  const ordered = [...nonAction, ...action];

  // Step 4 — limit
  return ordered.slice(0, max);
}
