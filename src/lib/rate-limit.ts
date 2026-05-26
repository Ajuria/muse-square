// Simple in-memory per-user rate limiter.
// Not shared across Vercel instances — catches aggressive refresh / scripting,
// not distributed attacks. Good enough for pre-launch B2B.

const buckets = new Map<string, number[]>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, timestamps] of buckets) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) buckets.delete(key);
    else buckets.set(key, filtered);
  }
}

export function rateLimit(
  userId: string,
  route: string,
  maxRequests: number,
  windowMs: number
): boolean {
  cleanup(windowMs);
  const key = `${userId}:${route}`;
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (buckets.get(key) || []).filter(t => t > cutoff);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Too many requests. Please wait a moment." }),
    { status: 429, headers: { "content-type": "application/json" } }
  );
}