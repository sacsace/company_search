import { isRelevantSearchResult, sanitizeWebText } from "./text-utils";
import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function htmlToText(html: string): string {
  return sanitizeWebText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function filterResults(results: WebSearchResult[]): WebSearchResult[] {
  return results.filter(isRelevantSearchResult);
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseBraveResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.split('class="result-wrapper');

  for (const block of blocks.slice(1, 12)) {
    const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
    if (!urlMatch) continue;

    const url = urlMatch[1];
    const titleMatch =
      block.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
      block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const snippetMatch = block.match(/class="snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    results.push({
      title: titleMatch ? htmlToText(titleMatch[1]) : url,
      url,
      snippet: snippetMatch ? htmlToText(snippetMatch[1]).slice(0, 300) : "",
    });
  }

  return results;
}

function parseDuckDuckGoResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.split('class="result__body"');

  for (const block of blocks.slice(1, 10)) {
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;

    let url = titleMatch[1];
    if (url.includes("uddg=")) {
      const decoded = url.match(/uddg=([^&]+)/);
      if (decoded) url = decodeURIComponent(decoded[1]);
    }

    results.push({
      title: htmlToText(titleMatch[2]),
      url,
      snippet: snippetMatch ? htmlToText(snippetMatch[1]).slice(0, 300) : "",
    });
  }

  return results;
}

function resolveBingUrl(href: string): string {
  const decodedHref = href.replace(/&amp;/g, "&");
  if (!decodedHref.includes("bing.com/ck/a")) return decodedHref;

  const uMatch = decodedHref.match(/[?&]u=([^&]+)/);
  if (!uMatch) return decodedHref;

  try {
    let encoded = decodeURIComponent(uMatch[1]);
    if (encoded.startsWith("a1")) encoded = encoded.slice(2);
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return decodedHref;
  }
}

function parseBingResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.split('class="b_algo"');

  for (const block of blocks.slice(1, 12)) {
    const linkMatch = block.match(
      /<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const url = resolveBingUrl(linkMatch[1]);
    if (/bing\.com|microsoft\.com|\.css/i.test(url)) continue;

    const snippetMatch =
      block.match(/class="b_caption"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ??
      block.match(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

    results.push({
      title: htmlToText(linkMatch[2]),
      url,
      snippet: snippetMatch ? htmlToText(snippetMatch[1]).slice(0, 300) : "",
    });
  }

  return results;
}

export function buildGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export async function searchWeb(query: string, limit = 10): Promise<WebSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const braveHtml = await fetchHtml(
    `https://search.brave.com/search?q=${encodeURIComponent(trimmed)}`,
    10000
  );
  if (braveHtml) {
    const braveResults = parseBraveResults(braveHtml).filter(
      (r) => !r.url.includes("brave.com") && !r.url.includes("search.brave.com")
    );
    if (braveResults.length > 0) {
      return filterResults(braveResults).slice(0, limit);
    }
  }

  const bingHtml = await fetchHtml(
    `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}&cc=IN&setlang=en`,
    12000
  );
  if (bingHtml) {
    const bingResults = filterResults(parseBingResults(bingHtml));
    if (bingResults.length > 0) {
      return bingResults.slice(0, limit);
    }
  }

  const ddgHtml = await fetchHtml(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`,
    12000
  );
  if (ddgHtml) {
    const ddgResults = filterResults(parseDuckDuckGoResults(ddgHtml));
    if (ddgResults.length > 0) {
      return ddgResults.slice(0, limit);
    }
  }

  return [];
}
