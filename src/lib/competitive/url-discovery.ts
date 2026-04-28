// src/lib/competitive/url-discovery.ts
/**
 * Shared URL discovery logic for competitor surveillance.
 *
 * Given a source URL, crawls it via Browserless, extracts all same-origin links,
 * scores them for agenda/programme-like paths, tests the top candidates,
 * and returns the best accessible agenda URL (or null).
 */

const AGENDA_PATTERNS = [
  "agenda", "programme", "events", "calendar", "manifestation",
  "what-s-on", "au-programme", "expositions", "spectacles",
  "calendrier", "evenements", "événements", "saison",
];

export function isHomepagePath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return !path || path === "/" || /^\/(fr|en|de|es|it)\/?$/.test(path);
  } catch {
    return false;
  }
}

export function isAgendaPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return AGENDA_PATTERNS.some((p) => path.includes(p));
  } catch {
    return false;
  }
}

function scoreUrl(url: string): number {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return AGENDA_PATTERNS.filter((p) => path.includes(p)).length;
  } catch {
    return 0;
  }
}

export interface DiscoveryResult {
  discovered_url: string | null;
  discovery_status: "found" | "not_found" | "skipped" | "error";
}

export async function discoverAgendaUrl(
  sourceUrl: string,
  browserlessToken: string,
  timeoutMs = 10_000
): Promise<DiscoveryResult> {
  if (isAgendaPath(sourceUrl)) {
    return { discovered_url: null, discovery_status: "skipped" };
  }

  try {
    const discoverBql = `mutation DiscoverLinks {
      goto(url: "${sourceUrl.replace(/"/g, '\\"')}", waitUntil: domContentLoaded) { status }
      verify(type: cloudflare) { found solved }
      evaluate(content: "JSON.stringify(Array.from(document.querySelectorAll('a[href]')).map(a => a.href).filter(h => h.startsWith('http')).slice(0, 100))") { value }
    }`;

    const discoverRes = await fetch(
      `https://production-sfo.browserless.io/stealth/bql?token=${browserlessToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: discoverBql }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!discoverRes.ok) {
      return { discovered_url: null, discovery_status: "not_found" };
    }

    const discoverResult = await discoverRes.json();
    const raw = discoverResult?.data?.evaluate?.value || "[]";
    const allLinks: string[] = JSON.parse(raw);

    const origin = new URL(sourceUrl).origin;
    const candidates = allLinks
      .filter((h) => {
        try {
          return new URL(h).origin === origin && isAgendaPath(h);
        } catch {
          return false;
        }
      })
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((h) => ({ url: h, score: scoreUrl(h) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (candidates.length === 0) {
      return { discovered_url: null, discovery_status: "not_found" };
    }

    for (const candidate of candidates) {
      try {
        const testBql = `mutation CheckPage {
          goto(url: "${candidate.url.replace(/"/g, '\\"')}", waitUntil: domContentLoaded) { status }
          text { text }
        }`;
        const testRes = await fetch(
          `https://production-sfo.browserless.io/stealth/bql?token=${browserlessToken}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: testBql }),
            signal: AbortSignal.timeout(timeoutMs),
          }
        );
        if (testRes.ok) {
          const testResult = await testRes.json();
          const text = testResult?.data?.text?.text || "";
          if (text.length > 100) {
            return { discovered_url: candidate.url, discovery_status: "found" };
          }
        }
      } catch {
        // Try next candidate
      }
    }

    return { discovered_url: null, discovery_status: "not_found" };
  } catch (err: any) {
    console.error("[url-discovery]", err?.message);
    return { discovered_url: null, discovery_status: "error" };
  }
}