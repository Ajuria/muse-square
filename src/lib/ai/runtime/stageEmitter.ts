// Phase 5 — the ONE stage-event channel between the prompt pipeline and a streaming response.
// AsyncLocalStorage (Node built-in): race-free under concurrent invocations, zero deps, and it
// propagates through await chains — so runPackager.ts can emit generate/verify checkpoints without
// threading a callback through 5,000 lines. When no store is set (non-stream requests, the daily
// briefing cron, tests), emitStage is a no-op: the JSON path is byte-identical by construction.
//
// TRUTH RULE (structural): the payload carries a stage KEY, a STATE and optional numeric/flag extras —
// there is no field for model text. Stage labels are owner-authored French resolved at the wire edge
// (contextCopy.STAGE_FR), never here.

import { AsyncLocalStorage } from "node:async_hooks";

export type StageState = "start" | "done";
export type StageEmit = (k: string, state: StageState, extra?: Record<string, number | boolean>) => void;

const als = new AsyncLocalStorage<StageEmit>();

export function runWithStageEmitter<T>(emit: StageEmit, fn: () => T): T {
  return als.run(emit, fn);
}

export function emitStage(k: string, state: StageState, extra?: Record<string, number | boolean>): void {
  const emit = als.getStore();
  if (!emit) return;
  try { emit(k, state, extra); } catch { /* a broken stream must never break the answer */ }
}
