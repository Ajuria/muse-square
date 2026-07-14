// Types for bestInClassCrawlCore.mjs (shared crawl contract). Runtime is the .mjs.
export interface RawPlay {
  title?: string; context?: string; move?: string; outcome?: string;
  steps?: string[]; source_name?: string; source_url?: string;
  published_at?: string; confidence?: string; venue_named?: boolean;
}
export interface CrawlPlayRow {
  play_id: string; generated_at: string; industry_code: string; lever: string; intent: string;
  title: string; context: string; move: string; outcome: string; steps: string[];
  source_name: string; source_url: string; published_at: string; confidence: string; venue_named: boolean;
}
export interface BqSchema { fields: Array<{ name: string; type: string; mode?: string }>; }

export const LEVER_LABELS: Record<string, string>;
export const INDUSTRY_LABELS: Record<string, string>;
export const INTENT_LABELS: Record<string, string>;
export const SYSTEM: string;
export function userPrompt(industry: string, lever: string, intent: string): string;
export function callSearch(apiKey: string, model: string, industry: string, lever: string, intent: string): Promise<string>;
export function extractPlays(text: string): RawPlay[];
export function clean(s: any): string;
export function validate(raw: RawPlay, industry: string, lever: string, intent: string, idx: number, nowIso: string): CrawlPlayRow | null;
export const SCHEMA: BqSchema;
