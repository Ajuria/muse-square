// Génération des occurrences d'un événement récurrent (spec docs/evenement-dossier-spec.md § 1.2,
// décisions owner 03/08 : plafond 52 ; « Du X au Y » ; hebdo par jour de semaine ou mensuel au
// jour du mois de la date de début — les mois sans ce jour sont sautés, jamais approximés).
// Fonction PURE (dates en entrée, jamais l'horloge) — consommée par saved-items/create + le cron.

export interface RecurrenceArgs {
  recurrence: "weekly" | "monthly";
  dow?: number | null;       // 0=dimanche … 6=samedi (getUTCDay) — requis pour weekly
  start: string;             // 'YYYY-MM-DD' (interne — l'affichage reste JJ/MM/AAAA)
  end: string;               // 'YYYY-MM-DD'
  cap?: number;              // défaut 52 (décision owner)
}

const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
};

export function generateOccurrences(args: RecurrenceArgs): string[] {
  const start = parse(args.start);
  const end = parse(args.end);
  const cap = Math.max(1, Math.min(Number(args.cap ?? 52), 52));
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const out: string[] = [];
  if (args.recurrence === "weekly") {
    const dow = Number(args.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) return [];
    let d = new Date(start.getTime());
    while (d.getUTCDay() !== dow) d = new Date(d.getTime() + DAY_MS);
    while (d.getTime() <= end.getTime() && out.length < cap) {
      out.push(ymd(d));
      d = new Date(d.getTime() + 7 * DAY_MS);
    }
    return out;
  }
  if (args.recurrence === "monthly") {
    const dom = start.getUTCDate();
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    while (out.length < cap) {
      const d = new Date(Date.UTC(y, m, dom));
      if (d.getTime() > end.getTime()) break;
      // Un mois sans ce jour (31 → février…) déborde sur le mois suivant : on le SAUTE.
      if (d.getUTCDate() === dom && d.getTime() >= start.getTime()) out.push(ymd(d));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }
  return [];
}
