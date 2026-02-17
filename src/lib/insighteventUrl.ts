export function getParam(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  return v && v.trim().length ? v.trim() : null;
}

export function parseSelectedDatesCsv(csv: string | null): string[] {
  if (!csv) return [];
  const parts = csv.split(",").map(s => s.trim()).filter(Boolean);

  // strict-ish ISO YYYY-MM-DD filter (keeps deep-link invariant clean)
  const iso = parts.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

  // dedupe preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const d of iso) {
    if (!seen.has(d)) {
      seen.add(d);
      deduped.push(d);
    }
  }

  // cap at 7 per contract
  return deduped.slice(0, 7);
}

export function serializeSelectedDates(dates: string[]): string {
  return dates.join(",");
}

export function buildMonthUrl(opts: {
  locationId: string;
  anchorDate?: string | null;
  selectedDates?: string[];
}): string {
  const u = new URL("http://local/app/insightevent/month");
  u.searchParams.set("location_id", opts.locationId);
  if (opts.anchorDate) u.searchParams.set("anchor_date", opts.anchorDate);
  if (opts.selectedDates && opts.selectedDates.length) {
    u.searchParams.set("selected_dates", serializeSelectedDates(opts.selectedDates));
  }
  return u.pathname + "?" + u.searchParams.toString();
}

export function buildDaysUrl(opts: { locationId: string; selectedDates: string[] }): string {
  const u = new URL("http://local/app/insightevent/days");
  u.searchParams.set("location_id", opts.locationId);
  u.searchParams.set("selected_dates", serializeSelectedDates(opts.selectedDates));
  return u.pathname + "?" + u.searchParams.toString();
}
