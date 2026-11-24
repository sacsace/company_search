import type { EmployeeReview } from "./types";
import { companyMatchScore, isSameCompany, textMentionsCompany } from "./company-match";
import { searchWeb, type WebSearchResult } from "./search-engine";
import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface GlassdoorInsight {
  rating: number | null;
  reviewCount: number | null;
  companyName: string | null;
  pageUrl: string | null;
  searchUrl: string;
  googleSearchUrl: string;
  snippets: string[];
  reviews: EmployeeReview[];
}

interface ParsedGlassdoorCompany {
  name: string;
  rating: number;
  reviewCount: number | null;
  jobs: string | null;
  salaries: string | null;
  url: string;
}

function companyToTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(private|limited|ltd|pvt|llp|inc|corp|company|co|india)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function namesMatch(companyName: string, candidate: string): boolean {
  return isSameCompany(companyName, candidate, 0.55);
}

function parseCompactCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase().replace(/,/g, "");
  const match = normalized.match(/^([\d.]+)\s*([KML])?$/i);
  if (!match) {
    const asInt = parseInt(normalized, 10);
    return Number.isFinite(asInt) ? asInt : null;
  }
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2]?.toUpperCase();
  if (unit === "K") return Math.round(value * 1_000);
  if (unit === "L") return Math.round(value * 100_000);
  if (unit === "M") return Math.round(value * 1_000_000);
  return Math.round(value);
}

function buildGlassdoorSearchUrl(companyName: string): string {
  return `https://www.glassdoor.co.in/Search/results.htm?keyword=${encodeURIComponent(companyName)}`;
}

function buildGoogleSearchUrl(companyName: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${companyName} Glassdoor reviews rating`)}`;
}

function buildReviewsUrlFromOverview(overviewUrl: string, companyName: string): string {
  const idMatch = overviewUrl.match(/EI_IE(\d+)/i);
  if (!idMatch) return overviewUrl;
  const slug = companyName
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://www.glassdoor.co.in/Reviews/${slug}-Reviews-E${idMatch[1]}.htm`;
}

async function fetchViaJina(url: string, timeoutMs = 18000): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  const jinaUrl = `https://r.jina.ai/${url}`;
  if (!isSafeOutboundUrl(jinaUrl)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": USER_AGENT,
        "X-Return-Format": "markdown",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    if (/security verification|humans only|captcha|cloudflare/i.test(text) && text.length < 2500) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

function parseGlassdoorSearchMarkdown(markdown: string): ParsedGlassdoorCompany[] {
  const results: ParsedGlassdoorCompany[] = [];
  const seen = new Set<string>();

  // Example:
  // [![Image 1: Infosys](logo.png) Infosys 3.6★ 2.7K jobs 1.3L reviews 4.7L salaries](OverviewURL)
  const cardPattern =
    /(?:!?\[[^\]]*\]\([^)]+\)\s*)?([A-Za-z0-9][A-Za-z0-9 &.'()/-]{1,80}?)\s+(\d(?:\.\d)?)\s*★\s+([\d.]+[KML]?)\s+jobs\s+([\d.]+[KML]?)\s+reviews(?:\s+([\d.]+[KML]?)\s+salaries)?\]\((https?:\/\/www\.glassdoor\.co\.in\/Overview\/[^)\s]+)\)/gi;

  for (const match of markdown.matchAll(cardPattern)) {
    const url = match[6];
    if (seen.has(url)) continue;
    seen.add(url);

    const name = match[1]
      .replace(/^Image\s+\d+:\s*/i, "")
      .replace(/^avatar\s+/i, "")
      .trim();

    results.push({
      name,
      rating: parseFloat(match[2]),
      reviewCount: parseCompactCount(match[4]),
      jobs: match[3] ?? null,
      salaries: match[5] ?? null,
      url,
    });
  }

  return results.filter((item) => item.name.length > 1 && item.rating >= 1 && item.rating <= 5);
}

function pickBestCompany(
  companies: ParsedGlassdoorCompany[],
  companyName: string
): ParsedGlassdoorCompany | null {
  const ranked = companies
    .map((company) => {
      let score = 0;
      if (namesMatch(companyName, company.name)) score += 5;
      if (company.reviewCount && company.reviewCount > 0) score += Math.min(3, Math.log10(company.reviewCount + 1));
      score += company.rating / 5;
      return { company, score };
    })
    .sort((a, b) => b.score - a.score);

  if (ranked[0] && ranked[0].score >= 5) return ranked[0].company;
  return ranked[0]?.company ?? null;
}

function parseRatingFromSnippet(text: string): { rating: number | null; reviewCount: number | null } {
  const patterns = [
    /(\d(?:\.\d)?)\s*★\s*.*?([\d,.]+[KML]?)\s*reviews?/i,
    /(\d(?:\.\d)?)\s*(?:out of|\/)\s*5(?:\s*(?:stars?)?)?(?:[^\d]{0,40}([\d,.]+)\s*reviews?)?/i,
    /rated\s*(\d(?:\.\d)?)(?:[^\d]{0,40}([\d,.]+)\s*reviews?)?/i,
    /glassdoor[^\d]{0,20}(\d(?:\.\d)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const rating = parseFloat(match[1]);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
    return {
      rating,
      reviewCount: parseCompactCount(match[2]?.replace(/,/g, "")),
    };
  }
  return { rating: null, reviewCount: null };
}

function extractGlassdoorUrl(result: WebSearchResult): string | null {
  const fromUrl = result.url.match(/https?:\/\/(?:www\.)?glassdoor\.[a-z.]+\/[^\s?#]+/i);
  if (fromUrl) return fromUrl[0];
  const fromSnippet = `${result.title} ${result.snippet}`.match(
    /https?:\/\/(?:www\.)?glassdoor\.[a-z.]+\/[^\s]+/i
  );
  return fromSnippet?.[0] ?? null;
}

function snippetsFromSearch(results: WebSearchResult[], companyName: string): string[] {
  const tokens = companyToTokens(companyName);
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const text = `${result.title} ${result.snippet}`.replace(/\s+/g, " ").trim();
    if (text.length < 30) continue;
    if (!/glassdoor|review|rating|employee|salary|interview/i.test(text)) continue;
    if (tokens.length > 0 && !tokens.some((token) => text.toLowerCase().includes(token))) continue;
    const key = text.slice(0, 80).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(text.slice(0, 280));
    if (snippets.length >= 6) break;
  }

  return snippets;
}

function reviewsFromSnippets(
  snippets: string[],
  pageUrl: string | null,
  companyName: string
): EmployeeReview[] {
  return snippets.slice(0, 5).map((snippet) => {
    const parsed = parseRatingFromSnippet(snippet);
    return {
      platform: "Glassdoor",
      rating: parsed.rating,
      title: `${companyName} 온라인 평가`,
      jobProfile: null,
      location: null,
      department: null,
      likes: snippet,
      dislikes: null,
      workDetails: null,
      subRatings: [],
      date: null,
      url: pageUrl || buildGoogleSearchUrl(companyName),
      helpfulCount: null,
    };
  });
}

function snippetsFromGlassdoorMarkdown(
  markdown: string,
  company: ParsedGlassdoorCompany | null,
  companyName: string
): string[] {
  const snippets: string[] = [];
  if (company) {
    const parts = [
      `${company.name} Glassdoor 평점 ${company.rating}★`,
      company.reviewCount !== null ? `리뷰 ${company.reviewCount.toLocaleString("en-IN")}건` : null,
      company.jobs ? `채용 ${company.jobs}` : null,
      company.salaries ? `연봉 정보 ${company.salaries}` : null,
    ].filter(Boolean);
    snippets.push(parts.join(" · "));
  }

  const interviewMatch = markdown.match(
    new RegExp(
      `${company?.name ?? companyToTokens(companyName)[0] ?? companyName}[\\s\\S]{0,120}?(\\d+[KML]?)\\s*interviews?[\\s\\S]{0,80}?(\\d+)%Positive[\\s\\S]{0,40}?(\\d(?:\\.\\d)?)/5\\s*Difficulty`,
      "i"
    )
  );
  if (interviewMatch) {
    snippets.push(
      `면접 ${interviewMatch[1]}건 · 긍정 경험 ${interviewMatch[2]}% · 난이도 ${interviewMatch[3]}/5`
    );
  }

  return snippets;
}

async function fetchFromGlassdoorSearch(companyName: string): Promise<{
  company: ParsedGlassdoorCompany | null;
  snippets: string[];
}> {
  const markdown = await fetchViaJina(buildGlassdoorSearchUrl(companyName));
  if (!markdown) return { company: null, snippets: [] };
  const companies = parseGlassdoorSearchMarkdown(markdown);
  const company = pickBestCompany(companies, companyName);
  return {
    company,
    snippets: snippetsFromGlassdoorMarkdown(markdown, company, companyName),
  };
}

async function fetchFromWebSearch(companyName: string): Promise<{
  company: ParsedGlassdoorCompany | null;
  snippets: string[];
}> {
  const queries = [
    `"${companyName}" site:glassdoor.co.in OR site:glassdoor.com reviews`,
    `"${companyName}" Glassdoor reviews rating`,
    `${companyName} Glassdoor employee reviews India`,
  ];

  const allResults: WebSearchResult[] = [];
  for (const query of queries) {
    const results = await searchWeb(query, 6);
    allResults.push(...results);
  }

  const snippets = snippetsFromSearch(allResults, companyName);
  let best: ParsedGlassdoorCompany | null = null;

  for (const result of allResults) {
    const url = extractGlassdoorUrl(result);
    const text = `${result.title} ${result.snippet}`;
    const parsed = parseRatingFromSnippet(text);
    if (!parsed.rating) continue;

    const candidateName = result.title.replace(/\s*[-|].*$/, "").trim() || "";
    // 타사(예: MESINDUS) 평점을 검색 대상에 붙이지 않음
    if (
      candidateName &&
      !namesMatch(companyName, candidateName) &&
      !textMentionsCompany(`${result.title} ${result.snippet} ${result.url}`, companyName)
    ) {
      continue;
    }

    const candidate: ParsedGlassdoorCompany = {
      name: candidateName || companyName,
      rating: parsed.rating,
      reviewCount: parsed.reviewCount,
      jobs: null,
      salaries: null,
      url: url || buildGlassdoorSearchUrl(companyName),
    };

    const better =
      !best ||
      companyMatchScore(companyName, candidate.name) > companyMatchScore(companyName, best.name) ||
      (namesMatch(companyName, candidate.name) &&
        (candidate.reviewCount ?? 0) > (best.reviewCount ?? 0));

    if (better && namesMatch(companyName, candidate.name)) {
      best = candidate;
    }
  }

  return { company: best, snippets };
}

export async function fetchGlassdoorReviews(companyName: string): Promise<GlassdoorInsight> {
  const searchUrl = buildGlassdoorSearchUrl(companyName);
  const googleSearchUrl = buildGoogleSearchUrl(companyName);

  const empty: GlassdoorInsight = {
    rating: null,
    reviewCount: null,
    companyName: null,
    pageUrl: null,
    searchUrl,
    googleSearchUrl,
    snippets: [],
    reviews: [],
  };

  if (!companyName.trim()) return empty;

  const [fromSearch, fromWeb] = await Promise.all([
    fetchFromGlassdoorSearch(companyName),
    fetchFromWebSearch(companyName),
  ]);

  const companyCandidates = [fromSearch.company, fromWeb.company].filter(
    (item): item is ParsedGlassdoorCompany => !!item && namesMatch(companyName, item.name)
  );
  const company =
    companyCandidates.sort(
      (a, b) => companyMatchScore(companyName, b.name) - companyMatchScore(companyName, a.name)
    )[0] ?? null;

  const snippets = [...fromSearch.snippets, ...fromWeb.snippets]
    .filter((text) => textMentionsCompany(text, companyName) || namesMatch(companyName, text.slice(0, 80)))
    .filter((text, index, arr) => arr.findIndex((item) => item.slice(0, 60) === text.slice(0, 60)) === index)
    .slice(0, 6);
  const pageUrl = company
    ? buildReviewsUrlFromOverview(company.url, company.name)
    : null;

  const reviews = company
    ? reviewsFromSnippets(snippets, pageUrl ?? company.url, companyName)
    : [];

  return {
    rating: company?.rating ?? null,
    reviewCount: company?.reviewCount ?? null,
    companyName: company?.name ?? null,
    pageUrl: company ? pageUrl ?? company.url : null,
    searchUrl,
    googleSearchUrl,
    snippets,
    reviews,
  };
}
