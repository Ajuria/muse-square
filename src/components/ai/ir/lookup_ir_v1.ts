// src/lib/ai/ir/lookup_ir_v1.ts
import type { FactV1, LineItemV1 } from "../../../lib/ai/contracts/facts_v1";

export type LookupIRV1 = {
  kind: "lookup";
  facts_by_date: Record<string, FactV1[]>;
  line_items: LineItemV1[];
};

type BqDate = string | { value?: string | null } | null | undefined;

type LookupRow = {
  // ✅ truth fields (current semantic view)
  event_name?: string | null;
  event_start_date?: BqDate; // DATE can arrive as string or {value:"YYYY-MM-DD"}
  event_end_date?: BqDate;

  // legacy fields (keep ONLY to avoid compile breaks; do not depend on them)
  event_uid?: string | null;
  event_label?: string | null;
  event_date?: string | null;
  city_name?: string | null;

  // optional
  source_system?: string | null;

  // nested STRUCT shape (SELECT e.* AS event)
  event?: {
    event_name?: string | null;
    event_start_date?: BqDate;
    event_end_date?: BqDate;

    event_uid?: string | null;
    event_label?: string | null;
    event_date?: string | null;
    city_name?: string | null;

    source_system?: string | null;
  } | null;
};

function safeStr(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function safeNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function factId(eventUid: string, field: string): string {
  return `F.lookup.${field}.${eventUid}`;
}

function ymdFromBqDate(v: BqDate): string | null {
  if (!v) return null;
  if (typeof v === "string") return safeStr(v)?.slice(0, 10) ?? null;
  if (typeof v === "object" && typeof v.value === "string") {
    return safeStr(v.value)?.slice(0, 10) ?? null;
  }
  return null;
}

function formatDateFr(ymd: string | null): string | null {
  if (!ymd) return null;
  const d = new Date(ymd + "T00:00:00");
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function buildLookupIRV1FromRow(
  row: LookupRow | null | undefined
): LookupIRV1 {

  // Normalize shape (STRUCT or flat)
  const r: any = row?.event ?? row ?? null;
  const uid =
  r
    ? safeStr(r.event_uid) ?? safeStr(r.event_name) ?? safeStr(r.event_label)
    : null;
  
  // ---------------------------
  // NOT FOUND
  // ---------------------------
  if (!r || !uid) {
    const facts: FactV1[] = [
      {
        fact_id: "F.lookup.not_found",
        date: "",
        dimension: "governance",
        label_fr: "Aucun événement correspondant n’a été trouvé.",
        source_fields: [],
      },
    ];

    return {
      kind: "lookup",
      facts_by_date: { _lookup: facts },
      line_items: [
        {
          kind: "headline",
          template_id: "LOOKUP_EVENT_NOT_FOUND",
          fact_ids: ["F.lookup.not_found"],
          params: {},
        },
      ],
    };
  }

  const eventUid: string = uid;
  const facts: FactV1[] = [];

  const eventStart = ymdFromBqDate(r.event_start_date);
  const eventEnd = ymdFromBqDate(r.event_end_date);
  const eventDate = eventStart; // legacy single-date slot for UI/templates
  const factDate = eventDate ?? "";

  function formatDateFr(ymd: string | null): string | null {
  if (!ymd) return null;
  const d = new Date(ymd + "T00:00:00");
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

  function pushFact(
    field: string,
    label_fr: string,
    source_fields: string[]
  ): void {
    facts.push({
      fact_id: factId(eventUid, field),
      date: factDate,
      dimension: "governance",
      label_fr,
      source_fields,
    });
  }

  // CRITICAL: guarantee at least one fact for FOUND
  pushFact("event_uid", `Identifiant : ${eventUid}`, ["event_uid"]);

  // ---------------------------
  // CORE FIELDS
  // ---------------------------
  const eventName = safeStr(r.event_name);
  const eventLabel = eventName; // legacy slot expected by templates
  if (eventLabel) {
    pushFact("event_label", `Nom : ${eventLabel}`, ["event_label"]);
  }

  const eventDateFr = formatDateFr(eventDate);

  if (eventDateFr) {
    pushFact("event_date", `Date : ${eventDateFr}`, ["event_date"]);
  }

  const startFr = formatDateFr(eventStart);
  if (startFr) {
    pushFact("event_start_date", `Début : ${startFr}`, ["event_start_date"]);
  }

  const endFr = formatDateFr(eventEnd);
  if (endFr) {
    pushFact("event_end_date", `Fin : ${endFr}`, ["event_end_date"]);
  }

  const cityName: string | null = null;
  if (cityName) {
    pushFact("city_name", `Ville : ${cityName}`, ["city_name"]);
  }

  // ---------------------------
  // DISTANCE (robust handling)
  // ---------------------------
  let distanceM: number | null = null;
  let distanceSource: string[] = [];

  if (safeNum(r.distance_m) !== null) {
    distanceM = safeNum(r.distance_m);
    distanceSource = ["distance_m"];
  } else if (safeNum(r.distance_meters) !== null) {
    distanceM = safeNum(r.distance_meters);
    distanceSource = ["distance_meters"];
  } else if (safeNum(r.distance_km) !== null) {
    distanceM = safeNum(r.distance_km)! * 1000;
    distanceSource = ["distance_km"];
  }

  if (distanceM !== null) {
    pushFact("distance_m", `Distance : ${Math.round(distanceM)} m`, distanceSource);
  }
  
  const sourceSystem = safeStr(r.source_system);
  if (sourceSystem) {
    pushFact("source_system", `Source : ${sourceSystem}`, ["source_system"]);
  }

  const fact_ids = facts.map((f) => f.fact_id);

  return {
    kind: "lookup",
    facts_by_date: { _lookup: facts },
    line_items: [
      {
        kind: "headline",
        template_id: "LOOKUP_EVENT_FOUND",
        fact_ids,
        params: {
          event_uid: eventUid,

          // legacy keys kept for renderer/template compatibility
          event_label: eventName ?? "Événement",
          event_date: eventDateFr ?? "",
          city_name: "",

          // optional extras
          event_start_date: startFr ?? "",
          event_end_date: endFr ?? "",

          distance_m: distanceM,
          source_system: sourceSystem ?? "",
        },
      },
    ],
  };
}