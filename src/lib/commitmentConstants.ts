// Single-source constants for the Engagement (commitment) feature.
// Shared by the create endpoint (window/threshold mapping) and the resolution
// cron (gate thresholds, grace, autocorrelation floor).

export const WINDOW_DAYS: Record<string, number> = { day_of: 1, "7d": 7, "14d": 14 };
export const THRESHOLD_Z: Record<string, number> = { modeste: 1.0, net: 1.5 };

// Resolution constants (locked in the design):
export const MATERIAL_SHARE = 0.5;   // revenue-weighted school-holiday share that
                                     // flips a PROVISIONAL met -> confounded.
export const GRACE_DAYS = 30;        // incomplete window past window_end + this -> expired.
export const RHO_FLOOR = 0.40;       // floor on measured per-location lag-1 autocorr.
