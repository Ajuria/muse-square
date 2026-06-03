// Canonical operational scope resolver (multi-site).
//
// Operational scope = which site(s) the OPERATIONAL views (pulse) show:
//   'single' -> one specific site is active (user selected it, or owns only one)
//   'all'    -> aggregate across all owned sites (no explicit selection)
//
// Days (planning, user-picked) and monitor (entity-derived from the saved item)
// do NOT use this — they resolve their own location.

export interface OperationalScope {
  /** 'single' = one active site; 'all' = aggregate across owned sites. */
  mode: "single" | "all";
  /** Single site to use when one id is needed. In 'all' mode = primary. */
  locationId: string;
  /** Every owned site, primary first (as returned by getProfileContext). */
  allLocationIds: string[];
}

export interface ResolveScopeInput {
  /** Owned location ids, primary first (profile.all_location_ids). */
  ownedLocationIds: string[];
  /** The primary/default single id (profile.location_id). */
  primaryLocationId: string;
  /** Raw value of the ms_active_location cookie, if present. */
  activeCookieId: string | null;
}

export function resolveOperationalScope(input: ResolveScopeInput): OperationalScope {
  const owned = Array.isArray(input.ownedLocationIds) ? input.ownedLocationIds : [];
  const primary = input.primaryLocationId;
  const active =
    input.activeCookieId && owned.includes(input.activeCookieId)
      ? input.activeCookieId
      : null;

  // Explicit selection -> that single site.
  if (active) return { mode: "single", locationId: active, allLocationIds: owned };
  // Nothing to aggregate -> single.
  if (owned.length <= 1) return { mode: "single", locationId: primary, allLocationIds: owned };
  // Multiple sites, no explicit selection -> aggregate.
  return { mode: "all", locationId: primary, allLocationIds: owned };
}