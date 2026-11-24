import { parseCin } from "./cin-parser";
import type { CompanySearchResult } from "./types";
import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CIN_PATTERN = /[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/gi;

async function fetchHtml(url: string, timeoutMs = 15000): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain",
        "Accept-Language": "en-IN,en;q=0.9",
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

function normalizeHtml(html: string): string {
  return html.replace(/&amp;/g, "&").replace(/%2f/gi, "/").replace(/%3a/gi, ":");
}

function nameFromSlug(slug: string): string {
  const cleaned = slug.replace(/^[^A-Za-z]+/, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scoreMatch(companyName: string, query: string): number {
  const name = companyName.toLowerCase();
  const q = query.toLowerCase().replace(/\b(private|limited|ltd|pvt|llp)\b/g, "").trim();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);

  if (name === q) return 100;
  if (name.includes(q)) return 80;

  if (qWords.length === 0) return 0;
  const matchedWords = qWords.filter((w) => name.includes(w)).length;
  return (matchedWords / qWords.length) * 60;
}

function pushCompany(
  results: CompanySearchResult[],
  seen: Set<string>,
  cin: string,
  name: string
) {
  const normalizedCin = cin.toUpperCase();
  if (seen.has(normalizedCin)) return;
  const parsed = parseCin(normalizedCin);
  if (!parsed) return;

  seen.add(normalizedCin);
  results.push({
    cin: normalizedCin,
    name,
    status: "Active",
    type: parsed.companyType,
    state: parsed.stateName,
    dateOfIncorporation: String(parsed.yearOfIncorporation),
    registeredOffice: "",
    listingStatus: parsed.listingStatus,
  });
}

function extractCompaniesFromHtml(html: string, query: string): CompanySearchResult[] {
  const results: CompanySearchResult[] = [];
  const seen = new Set<string>();
  const decoded = normalizeHtml(html);

  const patterns: { regex: RegExp; nameIndex: number; cinIndex: number }[] = [
    {
      regex: /indiafilings\.com\/search\/([^/\s"']+)-cin-([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})/gi,
      nameIndex: 1,
      cinIndex: 2,
    },
    {
      regex: /qorpiq\.com\/company\/([^/\s"']+)\/([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})/gi,
      nameIndex: 1,
      cinIndex: 2,
    },
    {
      regex: /thecompanycheck\.com\/company\/([^/\s"']+)\/([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})/gi,
      nameIndex: 1,
      cinIndex: 2,
    },
    {
      regex: /zaubacorp\.com\/+([A-Z][A-Z0-9-]*?)-([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})/gi,
      nameIndex: 1,
      cinIndex: 2,
    },
    {
      regex: /href="\/company\/([^"]+?)\/([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})"/gi,
      nameIndex: 1,
      cinIndex: 2,
    },
  ];

  for (const { regex, nameIndex, cinIndex } of patterns) {
    let match;
    while ((match = regex.exec(decoded)) !== null) {
      pushCompany(results, seen, match[cinIndex], nameFromSlug(match[nameIndex]));
    }
  }

  const cinMatches = decoded.match(CIN_PATTERN) ?? [];
  for (const raw of cinMatches) {
    const cin = raw.toUpperCase();
    if (seen.has(cin)) continue;

    const parsed = parseCin(cin);
    if (!parsed) continue;

    const contextStart = Math.max(0, decoded.indexOf(cin) - 250);
    const context = decoded.slice(contextStart, decoded.indexOf(cin) + 120);

    const slugMatch =
      context.match(/zaubacorp\.com\/([A-Z0-9-]+)-/i) ??
      context.match(/indiafilings\.com\/search\/([^/\s"']+)-cin-/i) ??
      context.match(/qorpiq\.com\/company\/([^/\s"']+)\//i);

    const name = slugMatch
      ? nameFromSlug(slugMatch[1])
      : context.match(/([A-Z][A-Za-z0-9\s&.,'-]+(?:PRIVATE LIMITED|PVT\.?\s*LTD\.?|LIMITED|LLP))/i)?.[1]?.trim() ??
        `Company (${cin})`;

    if (scoreMatch(name, query) < 20) continue;
    pushCompany(results, seen, cin, name);
  }

  return results.sort((a, b) => scoreMatch(b.name, query) - scoreMatch(a.name, query));
}

async function searchYahoo(query: string): Promise<CompanySearchResult[]> {
  const searchQuery = `${query} India private limited CIN`;
  const html = await fetchHtml(`https://search.yahoo.com/search?p=${encodeURIComponent(searchQuery)}`);
  if (!html) return [];
  return extractCompaniesFromHtml(html, query);
}

async function searchBrave(query: string): Promise<CompanySearchResult[]> {
  const searchQuery = `${query} India company CIN zaubacorp indiafilings`;
  const html = await fetchHtml(
    `https://search.brave.com/search?q=${encodeURIComponent(searchQuery)}`
  );
  if (!html) return [];
  return extractCompaniesFromHtml(html, query);
}

async function searchZaubaCorp(query: string): Promise<CompanySearchResult[]> {
  const slug = slugify(query);
  const html = await fetchHtml(`https://www.zaubacorp.com/company-list/search/${slug}`);
  if (!html) return [];
  return extractCompaniesFromHtml(html, query);
}

async function searchDuckDuckGo(query: string): Promise<CompanySearchResult[]> {
  const searchQuery = `"${query}" India company CIN MCA zaubacorp`;
  const html = await fetchHtml(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
    20000
  );
  if (!html) return [];
  return extractCompaniesFromHtml(html, query);
}

async function lookupByCinOnTofler(cin: string): Promise<CompanySearchResult[]> {
  const normalizedCin = cin.toUpperCase();
  const html = await fetchHtml(`https://www.tofler.in/company/${normalizedCin}`);
  if (!html) return [];

  const orgName =
    html.match(/"@type"\s*:\s*"Organization"[\s\S]{0,120}?"name"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/FAQ\s*-\s*([A-Z][A-Z0-9 &.'()-]+PRIVATE LIMITED)/i)?.[1] ||
    html.match(/([A-Z][A-Z0-9 &.'()-]{3,80}PRIVATE LIMITED)/)?.[1];

  if (!orgName) return [];

  const results: CompanySearchResult[] = [];
  const seen = new Set<string>();
  pushCompany(results, seen, normalizedCin, orgName.replace(/\s+/g, " ").trim());

  const address = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .match(/registered address is at\s+((?:(?!\.\s+[A-Z]).){20,260}?\d{6})/i)?.[1]
    ?.trim();
  if (results[0] && address) {
    results[0].registeredOffice = address;
  }

  return results;
}

/** 브랜드·약칭 → 정식 법인명 후보 */
const BRAND_ALIASES: Record<string, string[]> = {
  "samsung india": [
    "Samsung India Electronics Private Limited",
    "Samsung India Electronics",
    "Samsung R&D Institute India",
  ],
  samsung: ["Samsung India Electronics Private Limited", "Samsung India Electronics"],
  "lg india": ["LG Electronics India Private Limited", "LG Soft India"],
  "hyundai india": ["Hyundai Motor India Limited", "Hyundai Motor India"],
  "msv": ["Minsub Ventures Private Limited", "Minsub Ventures"],
  "minsub": ["Minsub Ventures Private Limited"],
};

function expandSearchQueries(query: string): string[] {
  const trimmed = query.trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  const aliases = BRAND_ALIASES[key] ?? [];
  const withIndia =
    /\bindia\b/i.test(trimmed) || /[가-힣]/.test(trimmed)
      ? []
      : [`${trimmed} India`, `${trimmed} Private Limited India`];
  return [...new Set([trimmed, ...aliases, ...withIndia])].slice(0, 5);
}

export async function searchCompaniesByWeb(
  query: string,
  limit = 20
): Promise<{ results: CompanySearchResult[]; source: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], source: "web" };

  const sources: string[] = [];
  const allResults: CompanySearchResult[] = [];
  const seen = new Set<string>();

  const cinOnly = /^[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i.test(trimmed);
  if (cinOnly) {
    const toflerResults = await lookupByCinOnTofler(trimmed.toUpperCase());
    if (toflerResults.length > 0) {
      return { results: toflerResults.slice(0, limit), source: "Tofler" };
    }
  }

  const queries = expandSearchQueries(trimmed);

  for (const q of queries) {
    const searchFns = [
      { fn: () => searchYahoo(q), source: "Yahoo Search" },
      { fn: () => searchBrave(q), source: "Brave Search" },
      { fn: () => searchZaubaCorp(q), source: "ZaubaCorp" },
      { fn: () => searchDuckDuckGo(q), source: "DuckDuckGo" },
    ];

    for (const { fn, source } of searchFns) {
      const results = await fn();
      if (results.length > 0) {
        if (!sources.includes(source)) sources.push(source);
        for (const r of results) {
          const acceptPlaceholder = cinOnly && r.cin.toUpperCase() === trimmed.toUpperCase();
          const score = Math.max(scoreMatch(r.name, trimmed), scoreMatch(r.name, q));
          if (!seen.has(r.cin) && (score >= 12 || acceptPlaceholder)) {
            seen.add(r.cin);
            allResults.push(r);
          }
        }
      }
      if (allResults.length >= limit) break;
    }
    if (allResults.length >= Math.min(5, limit)) break;
  }

  const sorted = allResults
    .sort(
      (a, b) =>
        Math.max(scoreMatch(b.name, trimmed), ...queries.map((q) => scoreMatch(b.name, q))) -
        Math.max(scoreMatch(a.name, trimmed), ...queries.map((q) => scoreMatch(a.name, q)))
    )
    .slice(0, limit);

  return {
    results: sorted,
    source: sources.length > 0 ? sources.join(", ") : "Web Search",
  };
}