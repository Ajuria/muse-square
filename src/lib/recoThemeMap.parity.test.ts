// Guards against drift between the server theme→action_type map
// (recoThemeMap.ts) and the client window.RECO_TAXONOMY in
// public/action-cards.js. They share the action_type vocabulary for different
// purposes (server: filtering; client: toggle rendering) and must not diverge.
//
// Assumes: Vitest; tests run from repo root; no taxonomy string value contains
// a literal { or } (true today — brace-matching relies on it).

import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECO_THEME_ACTION_TYPES } from "./recoThemeMap";

// Extract the RECO_TAXONOMY object literal by brace-matching, then eval just
// that slice — avoids running the full client script (which touches DOM).
function loadClientTaxonomy(): {
  buckets?: Array<{ themes?: Array<{ action_types?: string[] }> }>;
} {
  const src = readFileSync(resolve("public/action-cards.js"), "utf8");
  const markerIdx = src.indexOf("window.RECO_TAXONOMY");
  if (markerIdx === -1) throw new Error("window.RECO_TAXONOMY not found in public/action-cards.js");
  const start = src.indexOf("{", src.indexOf("=", markerIdx));
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  // new Function (not JSON.parse) so JS-literal syntax — unquoted keys, single
  // quotes, trailing commas — is tolerated.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return Function(`return (${src.slice(start, end)});`)();
}

function clientActionTypes(): Set<string> {
  const tax = loadClientTaxonomy();
  const s = new Set<string>();
  for (const bucket of tax.buckets ?? [])
    for (const theme of bucket.themes ?? [])
      for (const at of theme.action_types ?? []) s.add(at);
  return s;
}

function serverActionTypes(): Set<string> {
  const s = new Set<string>();
  for (const types of Object.values(RECO_THEME_ACTION_TYPES))
    for (const at of types) s.add(at);
  return s;
}

test("client RECO_TAXONOMY and server RECO_THEME_ACTION_TYPES cover the same action_types", () => {
  const client = clientActionTypes();
  const server = serverActionTypes();
  const inClientOnly = [...client].filter((x) => !server.has(x)).sort();
  const inServerOnly = [...server].filter((x) => !client.has(x)).sort();
  // On failure the diff names exactly which action_types drifted, each way.
  expect({ inClientOnly, inServerOnly }).toEqual({ inClientOnly: [], inServerOnly: [] });
});