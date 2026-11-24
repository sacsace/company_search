import type { WebEnrichment, WebInsight, WebLink } from "./types";
import { fetchAmbitionBoxReviews } from "./ambitionbox-scraper";
import { fetchGlassdoorReviews } from "./glassdoor-scraper";
import { fetchGoogleMapsRating } from "./google-maps-scraper";
import { fetchWebsiteReviews, fetchSnsComments, fetchWebReviewSnippets, commentsFromReviewSearch } from "./reviews-scraper";
import { parseBusinessActivity, parseDirectorsFromText } from "./registry-scraper";
import { buildGoogleSearchUrl, searchWeb, type WebSearchResult } from "./search-engine";
import { isSafeOutboundUrl } from "./security-utils";
import {
  isCompanyRelevantResult,
  isSameCompany,
  isValidCreditRatingSnippet,
  textMentionsCompany,
} from "./company-match";
import { hasCjkText, isForeignSiteUrl, isReadableLatinText, isRelevantSearchResult, isUsableBusinessText, isUsefulCommentText, sanitizeWebText } from "./text-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const URL_BLACKLIST = [
  "google", "facebook", "twitter", "linkedin", "youtube", "wikipedia",
  "zaubacorp", "tofler", "mca.gov", "data.gov", "duckduckgo", "instagram.com/p/",
  "instafinancials", "crunchbase", "bloomberg", "baidu", "baike", "zhihu", "weibo",
];

const AGGREGATOR_DOMAINS = [
  "infyner.com",
  "qorpiq.com",
  "indiafilings.com",
  "zaubacorp.com",
  "tofler.in",
  "instafinancials.com",
  "thecompanycheck.com",
  "companiesinn.com",
];

function isAggregatorUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return AGGREGATOR_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function isRegistryBoilerplate(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(mca profile|cin u\d|directors?|filings?|registered office|roc\b|vendor checks?|gst)\b/i.test(lower) &&
    !/\b(manufactur|provid|offer|develop|export|import|trading|service)\b/i.test(lower)
  );
}

function isShareOrIntentUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("/sharer") ||
    lower.includes("/share?") ||
    lower.includes("intent/tweet") ||
    lower.includes("intent/post") ||
    lower.includes("shareArticle")
  );
}

function filterSocialLinks(links: WebLink[], companyName: string): WebLink[] {
  const nameTokens = companyName
    .toLowerCase()
    .replace(/\b(private|limited|ltd|pvt|llp|inc|corp)\b/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  return links.filter((link) => {
    if (isShareOrIntentUrl(link.url)) return false;
    const lower = link.url.toLowerCase();
    if (/infyner|qorpiq|indiafilings|zaubacorp|tofler/.test(lower)) return false;
    if (nameTokens.length > 0) {
      const slug = lower.replace(/[^a-z0-9]/g, "");
      const matchesCompany = nameTokens.some((token) => slug.includes(token.replace(/[^a-z0-9]/g, "")));
      if (!matchesCompany && /linkedin\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com/.test(lower)) {
        return false;
      }
    }
    return true;
  });
}

const SOCIAL_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "LinkedIn", pattern: /https?:\/\/(?:www\.)?linkedin\.com\/company\/[^\s"'<>]+/gi },
  { label: "Twitter/X", pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>]+/gi },
  { label: "Facebook", pattern: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi },
  { label: "Instagram", pattern: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi },
  { label: "YouTube", pattern: /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi },
];

async function fetchText(url: string): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return sanitizeWebText(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
  );
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.filter((e) => !e.endsWith(".png") && !e.endsWith(".jpg")))].slice(0, 5);
}

function extractPhones(text: string): string[] {
  const patterns = [
    /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g,
    /(?:\+91[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{6,8}/g,
    /\d{3,4}[\s-]\d{6,8}/g,
  ];
  const phones = new Set<string>();
  for (const p of patterns) {
    for (const m of text.match(p) ?? []) {
      const cleaned = m.replace(/\s+/g, " ").trim();
      if (cleaned.length >= 8 && cleaned.length <= 20) phones.add(cleaned);
    }
  }
  return [...phones].slice(0, 5);
}

function isBlacklisted(url: string): boolean {
  const lower = url.toLowerCase();
  return URL_BLACKLIST.some((b) => lower.includes(b)) || isForeignSiteUrl(url);
}

function normalizeUrl(url: string, base?: string): string | null {
  try {
    const resolved = base ? new URL(url, base) : new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!["http:", "https:"].includes(resolved.protocol)) return null;
    if (!isSafeOutboundUrl(resolved.href)) return null;
    if (isBlacklisted(resolved.href)) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const pattern = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = normalizeUrl(match[1], baseUrl);
    if (url) links.add(url);
  }
  return [...links];
}

function findInternalPages(links: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const keywords: { kw: string; score: number }[] = [
    { kw: "about", score: 3 },
    { kw: "service", score: 4 },
    { kw: "product", score: 3 },
    { kw: "client", score: 5 },
    { kw: "customer", score: 5 },
    { kw: "portfolio", score: 4 },
    { kw: "project", score: 3 },
    { kw: "case", score: 3 },
    { kw: "team", score: 4 },
    { kw: "leadership", score: 3 },
    { kw: "people", score: 2 },
    { kw: "contact", score: 3 },
    { kw: "company", score: 2 },
    { kw: "who-we-are", score: 3 },
    { kw: "testimonial", score: 3 },
    { kw: "download", score: 2 },
    { kw: "brochure", score: 2 },
    { kw: "pdf", score: 1 },
    { kw: "news", score: 2 },
  ];
  const scored: { url: string; score: number }[] = [];

  for (const link of links) {
    try {
      const u = new URL(link);
      if (u.hostname !== base.hostname) continue;
      const path = u.pathname.toLowerCase();
      let score = 0;
      for (const { kw, score: points } of keywords) {
        if (path.includes(kw)) score += points;
      }
      if (score > 0) scored.push({ url: link.split("#")[0], score });
    } catch {
      // skip
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.url)
    .filter((url, i, arr) => arr.indexOf(url) === i)
    .slice(0, 8);
}

function normalizeClientAlt(raw: string): string | null {
  const name = raw
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\s*(로고|logo)\s*$/i, "")
    .trim();
  if (name.length < 2 || name.length > 50) return null;
  if (/minsub|msv\b|our (?:logo|brand)|favicon|icon/i.test(name)) return null;
  return name;
}

function extractClientNamesFromHtml(html: string, text: string): string[] {
  const clients: string[] = [];

  // SPA 고객 로고: <img src=".../uploads/clients/..." alt="GS건설 로고">
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/uploads\/clients|\/clients\//i.test(tag)) continue;
    const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1];
    const name = alt ? normalizeClientAlt(alt) : null;
    if (name) clients.push(name);
  }

  for (const match of html.matchAll(/\balt=["']([^"']{2,80})["']/gi)) {
    const raw = match[1];
    if (!/로고|logo/i.test(raw)) continue;
    const nearby = html.slice(Math.max(0, match.index! - 120), match.index! + raw.length + 80);
    if (!/uploads\/clients|\/clients\//i.test(nearby)) continue;
    const name = normalizeClientAlt(raw);
    if (name) clients.push(name);
  }

  const section = text.match(
    /(?:our clients?|clientele|customers?|partners?)[:\s]+([\s\S]{40,800}?)(?:(?:our |contact|service|about)|$)/i
  );
  const blob = section?.[1] ?? "";
  const patterns = [
    /\b([A-Z][A-Za-z0-9&.\- ]{2,40}(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|LLP))\b/g,
    /\b([A-Z][A-Za-z0-9&.\- ]{2,30})\s*\((?:IT|Manufacturing|Finance|Healthcare|Retail|Logistics|Education|Automotive|Hospitality)[^)]*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(blob)) !== null) {
      const name = match[1].replace(/\s+/g, " ").trim();
      if (name.length < 3 || name.length > 60) continue;
      if (/cookie|privacy|terms|contact us|learn more/i.test(name)) continue;
      clients.push(name);
      if (clients.length >= 20) break;
    }
  }

  return [...new Set(clients)].slice(0, 15);
}

/** 공식 사이트 h2/h3 + 설명문에서 서비스 추출 (한·영 SPA 대응) */
function extractWebsiteServices(html: string, text: string): string[] {
  const services: string[] = [];
  const serviceHint =
    /accounting|tax|bookkeep|incorporat|frro|erp|hr\b|payroll|visa|trade|export|import|hotel|real estate|부동산|회계|세무|법인|인허가|무역|채용|비자|설립|서비스/i;

  for (const match of html.matchAll(
    /<h([23])[^>]*>\s*([^<]{2,70})\s*<\/h\1>\s*(?:<p[^>]*>\s*([^<]{15,220})\s*<\/p>)?/gi
  )) {
    const title = match[2].replace(/\s+/g, " ").trim();
    const body = (match[3] || "").replace(/\s+/g, " ").trim();
    if (!serviceHint.test(`${title} ${body}`)) continue;
    if (/cookie|privacy|terms|contact us|follow us/i.test(title)) continue;
    services.push(body ? `${title} — ${body}`.slice(0, 200) : title);
  }

  // 짧은 서비스 라벨 (탭/카드)
  for (const match of html.matchAll(
    /<(?:span|div|li|button)[^>]*>\s*((?:Accounting|Tax|Bookkeeping|Incorporation|FRRO|ERP|HR|Trade|Hotel|Real Estate|회계|세무|법인설립|무역)[^<]{0,40})\s*<\/(?:span|div|li|button)>/gi
  )) {
    const label = match[1].replace(/\s+/g, " ").trim();
    if (label.length >= 2 && label.length <= 60) services.push(label);
  }

  if (services.length === 0) {
    return summarizeOfferingLines(text, [
      "services",
      "our services",
      "solutions",
      "offerings",
      "what we do",
      "서비스",
    ]);
  }
  return [...new Set(services)].slice(0, 8);
}

function extractTeamNamesFromHtml(html: string): string[] {
  const names: string[] = [];
  for (const match of html.matchAll(/\/team\/([a-z0-9\-]+)\.(?:png|jpe?g|webp)/gi)) {
    const slug = match[1].replace(/-hero$/i, "");
    if (/logo|icon|banner|og-image/i.test(slug)) continue;
    const name = slug
      .split("-")
      .filter(Boolean)
      .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(" ");
    if (name.length >= 3) names.push(name);
  }
  for (const match of html.matchAll(
    /<(?:h[23]|p|span)[^>]*>\s*((?:CA|Mr|Ms|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s*<\/(?:h[23]|p|span)>/g
  )) {
    names.push(match[1].replace(/\s+/g, " ").trim());
  }
  return [...new Set(names)].slice(0, 8);
}

function extractSocialLinks(html: string): WebLink[] {
  const links: WebLink[] = [];
  const seen = new Set<string>();

  for (const { label, pattern } of SOCIAL_PATTERNS) {
    const matches = html.match(pattern) ?? [];
    for (const raw of matches) {
      const url = raw.replace(/[.,;)]+$/, "");
      if (!seen.has(url) && !isShareOrIntentUrl(url)) {
        seen.add(url);
        links.push({ label, url, type: "social" });
      }
    }
  }
  return links;
}

function extractListItems(text: string, keywords: string[]): string[] {
  const items: string[] = [];
  for (const kw of keywords) {
    const section = text.match(new RegExp(`${kw}[:\\s]+([^.]{20,300})`, "i"));
    if (section?.[1]) {
      const parts = section[1].split(/[,;|•·\n]/).map((s) => s.trim()).filter((s) => s.length > 3 && s.length < 80);
      items.push(...parts);
    }
  }
  return [...new Set(items)].slice(0, 8);
}

/** 문장 단위로 잘라 사업·서비스 소개가 중간에서 끊기지 않게 정리 */
function summarizeOfferingLines(text: string, keywords: string[]): string[] {
  const sentences: string[] = [];
  for (const kw of keywords) {
    const section = text.match(
      new RegExp(`${kw}[:\\s]+([A-Za-z0-9][\\s\\S]{30,420}?(?:\\.|\\n|$))`, "i")
    );
    if (!section?.[1]) continue;
    const chunk = section[1].replace(/\s+/g, " ").trim();
    const parts = chunk
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 24 && s.length <= 220 && /[A-Za-z]{4,}/.test(s));
    sentences.push(...parts.slice(0, 2));
  }
  if (sentences.length === 0) {
    return extractListItems(text, keywords);
  }
  return [...new Set(sentences)].slice(0, 5);
}

function extractRevenue(text: string): { revenue: string | null; year: string | null } {
  const patterns = [
    /(?:revenue|turnover|net sales|annual revenue)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(crore|cr|lakh|million|billion|bn)/gi,
    /FY\s*(\d{4}[-–]?\d{0,4})[:\s,]*(?:revenue|turnover)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(crore|cr|lakh)/gi,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const amount = match[1]?.match(/\d/) ? match[1] : match[2];
      const unit = match[2]?.match(/crore|cr|lakh|million/i) ? match[2] : match[3] ?? "crore";
      const yearMatch = match[0].match(/20\d{2}/);
      return { revenue: `₹${amount} ${unit}`, year: yearMatch?.[0] ?? null };
    }
  }
  return { revenue: null, year: null };
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "rediffmail.com",
  "indiafilings.com",
  "qorpiq.com",
  "infyner.com",
]);

const UNRELATED_WEBSITE_DOMAINS = [
  "walmart.com",
  "amazon.com",
  "nissanpartsdeal.com",
  "ebay.com",
  "alibaba.com",
  "flipkart.com",
  "justdial.com",
  "mouthshut.com",
  "glassdoor.com",
  "indeed.com",
  "yelp.com",
  "tripadvisor.com",
  "yellowpages.com",
  "crunchbase.com",
  "bloomberg.com",
];

function companyNameTokens(companyName: string): string[] {
  return companyName
    .toLowerCase()
    .replace(/\b(private|limited|ltd|pvt|llp|inc|corp|company|co|india)\b/gi, "")
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3);
}

function websiteFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  if (GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return `https://${domain}`;
}

function scoreWebsiteCandidate(
  url: string,
  companyName: string,
  context = ""
): number {
  if (isAggregatorUrl(url) || isBlacklisted(url) || isForeignSiteUrl(url) || hasCjkText(url)) {
    return -1;
  }

  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return -1;
  }

  if (UNRELATED_WEBSITE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return -1;
  }

  const tokens = companyNameTokens(companyName);
  const hostBase = host.split(".")[0] ?? "";
  const haystack = `${host} ${context}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (host.includes(token)) score += 12;
    if (hostBase.includes(token)) score += 8;
    if (haystack.includes(token)) score += 3;
  }

  if (/\.(in|co\.in)$/.test(host)) score += 4;
  if (/official|homepage|home page|our website/i.test(context)) score += 6;
  if (/review|directory|profile|cin|mca|filings|search|lookup/i.test(context)) score -= 8;
  if (/parts|store-finder|shop|buy|cart|dealer/i.test(`${host} ${context}`)) score -= 10;

  return score;
}

function pickBestWebsite(
  candidates: Array<{ url: string; context?: string }>,
  companyName: string
): string | null {
  const scored = candidates
    .map((candidate) => ({
      url: candidate.url,
      score: scoreWebsiteCandidate(candidate.url, companyName, candidate.context ?? ""),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.url ?? null;
}

async function resolveCompanyWebsite(
  companyName: string,
  cin: string,
  searchResults: WebSearchResult[],
  registryEmail?: string | null
): Promise<string | null> {
  const candidates: Array<{ url: string; context?: string }> = [];

  const emailWebsite = websiteFromEmail(registryEmail);
  if (emailWebsite) {
    candidates.push({ url: emailWebsite, context: "registry email domain" });
  }

  for (const result of searchResults) {
    candidates.push({
      url: result.url,
      context: `${result.title} ${result.snippet}`,
    });
  }

  const websiteSearch = await searchWeb(`"${companyName}" official website India`, 6);
  for (const result of websiteSearch) {
    candidates.push({
      url: result.url,
      context: `${result.title} ${result.snippet} official website`,
    });
  }

  const best = pickBestWebsite(candidates, companyName);
  if (best) return best;

  for (const domain of guessDomain(companyName)) {
    const score = scoreWebsiteCandidate(domain, companyName, "guessed domain");
    if (score <= 0) continue;
    try {
      const res = await fetch(domain, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      if (res.ok) return domain;
    } catch {
      // skip
    }
  }

  return emailWebsite;
}

function guessDomain(companyName: string): string[] {
  const slug = companyName
    .toLowerCase()
    .replace(/\b(private|limited|ltd|pvt|llp|inc|corp|company|co)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  if (!slug) return [];
  return [
    `https://www.${slug}.com`,
    `https://${slug}.com`,
    `https://www.${slug}.in`,
    `https://${slug}.in`,
    `https://www.${slug}.co.in`,
  ];
}

interface SearchSnippet {
  title: string;
  url: string;
  snippet: string;
}

function extractSearchResults(html: string): SearchSnippet[] {
  const results: SearchSnippet[] = [];
  const blocks = html.split('class="result__body"');

  for (const block of blocks.slice(1, 8)) {
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (titleMatch) {
      let url = titleMatch[1];
      if (url.includes("uddg=")) {
        const decoded = url.match(/uddg=([^&]+)/);
        if (decoded) url = decodeURIComponent(decoded[1]);
      }
      if (!isBlacklisted(url)) {
        results.push({
          title: htmlToText(titleMatch[2]),
          url,
          snippet: snippetMatch ? htmlToText(snippetMatch[1]).substring(0, 300) : "",
        });
      }
    }
  }
  return results;
}

async function crawlWebsite(websiteUrl: string): Promise<{
  text: string;
  html: string;
  pages: { url: string; title: string }[];
  socialLinks: WebLink[];
  emails: string[];
  phones: string[];
}> {
  const homepage = await fetchText(websiteUrl);
  if (!homepage) {
    return { text: "", html: "", pages: [], socialLinks: [], emails: [], phones: [] };
  }

  let combinedHtml = homepage;
  let combinedText = htmlToText(homepage);
  const pages: { url: string; title: string }[] = [{ url: websiteUrl, title: "Homepage" }];
  const allSocial = extractSocialLinks(homepage);

  const discovered = findInternalPages(extractLinks(homepage, websiteUrl), websiteUrl);
  const guessedPaths = [
    "/about",
    "/about-us",
    "/about/team",
    "/team",
    "/services",
    "/service",
    "/products",
    "/clients",
    "/client",
    "/customers",
    "/portfolio",
    "/contact",
    "/contact-us",
  ];
  const guessed = guessedPaths
    .map((path) => {
      try {
        return new URL(path, websiteUrl).href;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => !!url);

  const internalLinks = [...new Set([...discovered, ...guessed])].slice(0, 12);
  for (const pageUrl of internalLinks) {
    if (pages.some((page) => page.url === pageUrl)) continue;
    const html = await fetchText(pageUrl);
    if (!html) continue;
    // SPA: 경로 GET이 404여도 홈 HTML에 섹션이 임베드된 경우가 많음
    if ((/page not found|404|does not exist/i.test(html) && html.length < 4000) || html.length < 800) {
      continue;
    }
    combinedHtml += " " + html;
    combinedText += " " + htmlToText(html);
    const title =
      extractMeta(html, "og:title") ??
      html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
      pageUrl.split("/").filter(Boolean).pop() ??
      "Page";
    pages.push({ url: pageUrl, title });
    allSocial.push(...extractSocialLinks(html));
  }

  // 홈페이지에 메뉴 링크만 있고 하위 경로가 404인 SPA: 섹션 존재를 페이지 목록에 표시
  const spaSectionHints: { path: RegExp; title: string }[] = [
    { path: /\/about\/?$/i, title: "About (홈 내장)" },
    { path: /\/services/i, title: "Services (홈 내장)" },
    { path: /\/(?:about\/)?clients?/i, title: "Clients (홈 내장)" },
    { path: /\/(?:about\/)?team/i, title: "Team (홈 내장)" },
    { path: /\/contact/i, title: "Contact (홈 내장)" },
  ];
  for (const hint of spaSectionHints) {
    const linked = discovered.find((url) => hint.path.test(url));
    if (!linked) continue;
    if (pages.some((page) => page.url === linked || page.title === hint.title)) continue;
    if (!hint.path.test(linked) && !hint.path.test(homepage)) continue;
    pages.push({ url: linked, title: hint.title });
  }

  const emails = extractEmails(combinedHtml);
  const phones = extractPhones(combinedText);

  const uniqueSocial = allSocial.filter(
    (link, i, arr) => arr.findIndex((l) => l.url === link.url) === i
  );

  return {
    text: combinedText,
    html: combinedHtml,
    pages,
    socialLinks: uniqueSocial,
    emails,
    phones,
  };
}

function extractFoundedDate(text: string): string | null {
  const patterns = [
    /Date of Incorporation[:\s]*(\d{2}[-/]\d{2}[-/]\d{4})/i,
    /(?:incorporated|founded|established|formed)\s+(?:on\s+)?(\d{1,2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})/i,
    /(?:incorporated|founded|established|since)\s+(?:in\s+)?(\d{4})/i,
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*incorporat/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractEmployees(text: string): string | null {
  const patterns = [
    /(\d[\d,]*)\s*(?:employees|employee|staff|team members)/i,
    /(?:employees|workforce|team\s+size|staff)[:\s]*([\d,]+(?:\s*[-–+]\s*[\d,]+)?\+?)/i,
    /team\s+of\s+([\d,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/,/g, "");
  }
  return null;
}

function extractBusinessDescription(
  text: string,
  companyName: string,
  snippets: WebEnrichment["rawSnippets"]
): string | null {
  const rejectPatterns = /\b(NDA|vendor agreement|board resolution|CA-format|sharer|cookie policy)\b/i;

  const aboutMatch = text.match(
    /(?:specializ(?:e|es|ing)|engaged in|provides?|offers?|manufactur(?:e|es|ing)|develops?)\s+([^.]{30,200}\.)/i
  );
  if (aboutMatch?.[1] && !rejectPatterns.test(aboutMatch[1])) return aboutMatch[1].trim();

  const useful = snippets
    .map((s) => s.text.trim())
    .filter(
      (s) =>
        s.length > 50 &&
        !rejectPatterns.test(s) &&
        isReadableLatinText(s) &&
        s.toLowerCase().includes(companyName.split(" ")[0].toLowerCase())
    )
    .slice(0, 2);

  if (useful.length > 0) return useful.join(" ").slice(0, 400);
  return null;
}

function findLinkedInUrl(results: WebSearchResult[]): string | null {
  for (const result of results) {
    const match = result.url.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-z0-9-]+/i);
    if (match) return match[0];
  }
  return null;
}

function extractSocialFromResults(results: WebSearchResult[]): WebLink[] {
  const patterns: { label: string; regex: RegExp }[] = [
    { label: "Facebook", regex: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i },
    { label: "Instagram", regex: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i },
    { label: "Twitter/X", regex: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+/i },
    { label: "YouTube", regex: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/)[a-zA-Z0-9_-]+/i },
  ];

  const links: WebLink[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const { label, regex } of patterns) {
      const match = result.url.match(regex) ?? result.snippet.match(regex);
      if (match && !seen.has(match[0])) {
        seen.add(match[0]);
        links.push({ label, url: match[0], type: "social" });
      }
    }
  }

  return links;
}

function summarizeGoogleReviews(results: WebSearchResult[]): string | null {
  const reviewSnippets = results
    .filter((r) => isRelevantSearchResult(r) && /review|rating|star|recommend|experience|feedback|google/i.test(`${r.title} ${r.snippet}`))
    .map((r) => r.snippet.trim())
    .filter((s) => s.length > 25 && isReadableLatinText(s));

  if (reviewSnippets.length === 0) return null;
  return reviewSnippets.slice(0, 4).join(" ").slice(0, 500);
}

function synthesizeDescription(
  snippets: WebEnrichment["rawSnippets"],
  companyName: string,
  cin: string
): string | null {
  const useful = snippets
    .map((s) => s.text.trim())
    .filter((text) => text.length > 40)
    .slice(0, 4);

  if (useful.length === 0) return null;
  return `${companyName} (${cin}) — ${useful.join(" ")}`.slice(0, 600);
}

export async function enrichFromWeb(
  companyName: string,
  cin: string,
  registryLinks: WebLink[] = [],
  registryDescription: string | null = null,
  registryBusinessActivity: string | null = null,
  registryEmail: string | null = null,
  registryAddress: string | null = null,
  options: { mode?: "standard" | "deep" } = {}
): Promise<WebEnrichment> {
  const mode = options.mode ?? "standard";
  const deepSearchNotes: string[] = [];
  const sources: string[] = [];
  const relatedLinks: WebLink[] = [...registryLinks];
  const insights: WebInsight[] = [];
  const rawSnippets: WebEnrichment["rawSnippets"] = [];
  let combinedText = "";

  const googleQuery = `${companyName} ${cin} India company`;
  relatedLinks.push({
    label: "Google 검색",
    url: buildGoogleSearchUrl(googleQuery),
    type: "source",
  });

  const koreanNameHint = /[가-힣]/.test(companyName) ? companyName : null;
  const shortName = companyName
    .replace(/\b(private|pvt|limited|ltd|llp|inc|corp|company)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const [
    mainResults,
    linkedInResults,
    googleReviewResults,
    snsResults,
    directorResults,
    businessResults,
    productResults,
    indiaResults,
    relationResults,
    newsResults,
    koreanResults,
    creditResults,
    customerResults,
  ] = await Promise.all([
    searchWeb(`"${companyName}" ${cin} India company revenue employees founded`, 6),
    searchWeb(`"${companyName}" site:linkedin.com/company India`, 4),
    searchWeb(`"${companyName}" google reviews ratings India`, 6),
    searchWeb(
      `"${companyName}" site:facebook.com OR site:instagram.com OR site:twitter.com OR site:youtube.com`,
      5
    ),
    searchWeb(`"${companyName}" ${cin} directors DIN India MCA`, 5),
    searchWeb(`"${companyName}" ${cin} business activity what does company do India`, 5),
    searchWeb(`"${companyName}" OR "${shortName}" products services manufacturing official website`, 5),
    searchWeb(`"${companyName}" OR "${shortName}" India factory OR plant OR office OR investment`, 5),
    searchWeb(
      `"${companyName}" OR "${shortName}" parent company OR subsidiary OR joint venture OR customer OR supplier`,
      5
    ),
    searchWeb(`"${companyName}" OR "${shortName}" India investment OR hiring OR expansion OR news`, 5),
    koreanNameHint
      ? searchWeb(`"${koreanNameHint}" 인도 법인 OR 공장 OR 투자 OR 진출`, 4)
      : shortName
        ? searchWeb(`"${shortName}" 인도 법인 OR 인도 공장 OR 인도 진출`, 3)
        : Promise.resolve([]),
    searchWeb(
      `"${companyName}" OR "${shortName}" (CRISIL OR ICRA OR CARE Ratings OR rating rationale) India`,
      5
    ),
    searchWeb(
      `"${companyName}" OR "${shortName}" (client OR customer OR case study OR project OR awarded OR contract) India`,
      5
    ),
  ]);

  for (const result of mainResults) {
    if (isBlacklisted(result.url) || !isRelevantSearchResult(result)) continue;
    if (!isCompanyRelevantResult(result, companyName)) continue;
    combinedText += " " + result.snippet;
    rawSnippets.push({ text: result.snippet, source: result.title, url: result.url });
    relatedLinks.push({ label: result.title, url: result.url, type: "source" });
  }
  if (mainResults.length > 0) sources.push("Web Search");

  const expandedBuckets = [
    ...directorResults,
    ...businessResults,
    ...productResults,
    ...indiaResults,
    ...relationResults,
    ...newsResults,
    ...koreanResults,
    ...creditResults,
    ...customerResults,
  ];

  for (const result of expandedBuckets) {
    if (isBlacklisted(result.url) || !isRelevantSearchResult(result)) continue;
    if (!isCompanyRelevantResult(result, companyName)) continue;
    combinedText += " " + result.snippet;
    rawSnippets.push({ text: result.snippet, source: result.title, url: result.url });
    relatedLinks.push({ label: result.title, url: result.url, type: "source" });
  }
  if (expandedBuckets.length > 0) sources.push("Web Search");

  const toSnippets = (results: typeof mainResults) =>
    results
      .filter(
        (result) =>
          !isBlacklisted(result.url) &&
          isRelevantSearchResult(result) &&
          result.snippet.trim() &&
          isCompanyRelevantResult(result, companyName)
      )
      .map((result) => ({
        text: result.snippet.trim(),
        source: result.title,
        url: result.url,
      }));

  const newsItems = toSnippets(newsResults).slice(0, 6);
  const indiaOpsSnippets = toSnippets([...indiaResults, ...koreanResults]).slice(0, 6);
  const relationSnippets = toSnippets(relationResults).slice(0, 6);
  const creditRatingSnippets = toSnippets(creditResults)
    .filter((item) => isValidCreditRatingSnippet(`${item.source} ${item.text}`, companyName))
    .slice(0, 5);
  const customerSnippets = toSnippets(customerResults).slice(0, 5);
  const riskSnippets = toSnippets(
    [...newsResults, ...mainResults].filter((result) =>
      /lawsuit|dispute|sanction|fraud|strike|closure|shutdown|폐업|분쟁|제재|소송/i.test(
        `${result.title} ${result.snippet}`
      )
    )
  ).slice(0, 4);

  const discoveredDirectors = parseDirectorsFromText(
    [...directorResults, ...mainResults, ...businessResults, ...koreanResults]
      .map((r) => `${r.title} ${r.snippet}`)
      .join(" ")
  );

  const linkedInUrl = findLinkedInUrl(linkedInResults);
  if (linkedInUrl) {
    relatedLinks.push({ label: "LinkedIn", url: linkedInUrl, type: "social" });
    sources.push("LinkedIn");
  }

  const snsFromSearch = extractSocialFromResults(snsResults);
  const googleReviewsSummary = summarizeGoogleReviews(googleReviewResults);

  for (const result of googleReviewResults) {
    if (/google|review|rating|justdial|mouthshut/i.test(result.url)) {
      relatedLinks.push({ label: result.title, url: result.url, type: "source" });
    }
  }

  const websiteFromSearch = relatedLinks.find(
    (link) => link.type === "source" && !isBlacklisted(link.url) && !isAggregatorUrl(link.url)
  )?.url;

  const allSearchResults = [
    ...mainResults,
    ...directorResults,
    ...businessResults,
    ...productResults,
    ...indiaResults,
    ...relationResults,
    ...newsResults,
    ...koreanResults,
    ...creditResults,
    ...customerResults,
  ];
  let website: string | null =
    (await resolveCompanyWebsite(companyName, cin, allSearchResults, registryEmail)) ??
    websiteFromSearch ??
    null;
  if (website && (isAggregatorUrl(website) || isForeignSiteUrl(website) || hasCjkText(website))) {
    website = null;
  }
  let websiteData = {
    text: "",
    html: "",
    pages: [] as { url: string; title: string }[],
    socialLinks: [] as WebLink[],
    emails: [] as string[],
    phones: [] as string[],
  };

  if (website) {
    sources.push("Company Website");
    websiteData = await crawlWebsite(website);
    combinedText += " " + websiteData.text;

    for (const page of websiteData.pages) {
      relatedLinks.push({ label: page.title, url: page.url, type: "website" });
    }
  }

  const description =
    extractMeta(websiteData.html, "og:description") ??
    extractMeta(websiteData.html, "description") ??
    synthesizeDescription(rawSnippets, companyName, cin) ??
    null;

  const { revenue, year } = extractRevenue(combinedText);

  const industryMatch = combinedText.match(
    /(?:industry|sector|business\s+area)[:\s]+([A-Za-z0-9\s&,./-]{5,80})/i
  );

  const employeesMatch = extractEmployees(combinedText);
  const foundedDate = extractFoundedDate(combinedText);
  // 등기 업종(registryBusinessActivity/NIC)은 현재 영위 사업과 분리한다.
  // 공식 사이트 소개(한글 포함)를 우선하고, 등기 디렉터리 업종 문구는 넣지 않는다.
  const websiteIntro =
    description && website && isUsableBusinessText(description) ? description.trim() : null;
  const actualBusinessRaw =
    websiteIntro ||
    extractBusinessDescription(websiteData.text || combinedText, companyName, rawSnippets) ||
    (registryDescription &&
    !isRegistryBoilerplate(registryDescription) &&
    isUsableBusinessText(registryDescription)
      ? registryDescription.trim()
      : null) ||
    parseBusinessActivity(websiteData.text || "") ||
    null;
  const businessDescription =
    actualBusinessRaw && isUsableBusinessText(actualBusinessRaw)
      ? actualBusinessRaw.replace(/\s+/g, " ").trim().slice(0, 420)
      : null;

  const products = summarizeOfferingLines(
    websiteData.text || combinedText,
    ["products", "product range", "our products"]
  );
  const services = extractWebsiteServices(websiteData.html || "", websiteData.text || combinedText);
  const websiteClients = extractClientNamesFromHtml(websiteData.html || "", websiteData.text || "").filter(
    (client) => !isSameCompany(companyName, client, 0.5)
  );
  if (websiteClients.length > 0) {
    const clientPage =
      websiteData.pages.find((page) => /client|customer|portfolio/i.test(page.url))?.url ||
      website ||
      "";
    for (const client of websiteClients.slice(0, 10)) {
      customerSnippets.unshift({
        text: `공식 사이트 공개 고객사: ${client}`,
        source: "공식 웹사이트 고객·실적",
        url: clientPage,
      });
    }
    sources.push("Company Website Clients");
  }

  const websiteTeam = extractTeamNamesFromHtml(websiteData.html || "");
  if (websiteTeam.length > 0) {
    insights.push({
      key: "경영진·팀 (공식 소개)",
      value: websiteTeam.join(", "),
      source: "Company Website",
      sourceUrl: website ?? undefined,
    });
    deepSearchNotes.push(
      `공식 사이트 팀 소개 ${websiteTeam.length}명 확인(회사 공식 소개 기준, 독립 검증과 구분)`
    );
  }

  const addressMatch = combinedText.match(
    /(?:address|registered office|head\s*office|location)[:\s]+([A-Za-z0-9\s,.#/-]{15,150}?(?:India|IN-\d{6}|\d{6}))/i
  );

  if (websiteData.emails.length > 0) {
    insights.push({
      key: "이메일",
      value: websiteData.emails.join(", "),
      source: "Company Website",
      sourceUrl: website ?? undefined,
    });
  }

  if (websiteData.phones.length > 0) {
    insights.push({
      key: "전화번호",
      value: websiteData.phones.join(", "),
      source: "Company Website",
      sourceUrl: website ?? undefined,
    });
  }

  if (addressMatch?.[1]) {
    insights.push({
      key: "주소 (웹)",
      value: addressMatch[1].trim(),
      source: website ? "Company Website" : "Web Search",
      sourceUrl: website ?? undefined,
    });
  }

  if (revenue) {
    insights.push({
      key: "매출",
      value: year ? `${revenue} (${year})` : revenue,
      source: "Web Search",
    });
  }

  if (employeesMatch) {
    insights.push({
      key: "직원 수",
      value: `${employeesMatch}명`,
      source: website ? "Company Website" : "Web Search",
      sourceUrl: website ?? undefined,
    });
  }

  const allSocialLinks = filterSocialLinks(
    [...websiteData.socialLinks, ...snsFromSearch],
    companyName
  );
  const resolvedLinkedIn =
    linkedInUrl ??
    allSocialLinks.find((l) => l.label === "LinkedIn")?.url ??
    null;
  if (resolvedLinkedIn && !allSocialLinks.some((l) => l.url === resolvedLinkedIn)) {
    allSocialLinks.unshift({ label: "LinkedIn", url: resolvedLinkedIn, type: "social" });
  }

  const uniqueSocial = allSocialLinks.filter(
    (link, i, arr) => arr.findIndex((l) => l.url === link.url) === i
  );

  const snsComments: WebEnrichment["snsComments"] = [];
  let websiteReviews: WebEnrichment["websiteReviews"] = [];

  const reviewLikeMain = mainResults.filter((r) =>
    /review|comment|feedback|rating|employee|experience|recommend/i.test(`${r.title} ${r.snippet}`)
  );

  const [snsFetched, webReviewSnippets, siteReviews, ambitionBoxData, googleMapsData, glassdoorData] =
    await Promise.all([
    fetchSnsComments(companyName),
    fetchWebReviewSnippets(companyName),
    website
      ? fetchWebsiteReviews(website, websiteData.pages, websiteData.html)
      : Promise.resolve([] as WebEnrichment["websiteReviews"]),
    fetchAmbitionBoxReviews(companyName),
    fetchGoogleMapsRating(
      companyName,
      addressMatch?.[1]?.trim() ?? registryAddress ?? websiteData.text.match(/\b\d{6}\b[^<\n]{0,120}/)?.[0] ?? null
    ),
    fetchGlassdoorReviews(companyName),
  ]);

  const mergedComments = [
    ...commentsFromReviewSearch(googleReviewResults, companyName),
    ...commentsFromReviewSearch(reviewLikeMain, companyName),
    ...commentsFromReviewSearch(snsResults, companyName),
    ...snsFetched,
  ].filter((c) => !/infyner|qorpiq|indiafilings|zaubacorp|mca\.gov/i.test(c.url))
    .filter((c) => isUsefulCommentText(c.text, companyName))
    .filter((c) => textMentionsCompany(`${c.text} ${c.url}`, companyName));

  const commentSeen = new Set<string>();
  for (const comment of mergedComments) {
    const key = comment.text.substring(0, 80);
    if (commentSeen.has(key)) continue;
    commentSeen.add(key);
    snsComments.push(comment);
    if (snsComments.length >= 15) break;
  }

  if (snsComments.length > 0) sources.push("Online Comments");

  const reviewSeen = new Set<string>();
  for (const review of [...siteReviews, ...webReviewSnippets]) {
    if (!isReadableLatinText(review.text)) continue;
    if (reviewSeen.has(review.text)) continue;
    reviewSeen.add(review.text);
    websiteReviews.push(review);
    if (websiteReviews.length >= 15) break;
  }

  if (siteReviews.length > 0) sources.push("Website Reviews");
  if (webReviewSnippets.length > 0) sources.push("Web Reviews");
  if (ambitionBoxData.reviews.length > 0) {
    sources.push("AmbitionBox");
    relatedLinks.push({
      label: "AmbitionBox Reviews",
      url: ambitionBoxData.pageUrl ?? ambitionBoxData.reviews[0].url,
      type: "source",
    });
  }
  if (googleMapsData) {
    sources.push("Google Maps");
    relatedLinks.push({
      label: "Google Maps",
      url: googleMapsData.mapsUrl,
      type: "source",
    });
  }
  const glassdoorMatched =
    !!glassdoorData.companyName && isSameCompany(companyName, glassdoorData.companyName, 0.55);

  if (glassdoorMatched && (glassdoorData.rating !== null || glassdoorData.snippets.length > 0)) {
    sources.push("Glassdoor");
    if (glassdoorData.pageUrl) {
      relatedLinks.push({
        label: `Glassdoor - ${glassdoorData.companyName}`,
        url: glassdoorData.pageUrl,
        type: "source",
      });
    }
  }

  const employeeReviews = [
    ...ambitionBoxData.reviews.slice(0, 10),
    ...(glassdoorMatched ? glassdoorData.reviews.slice(0, 5) : []),
  ];

  const reviewSearchStatus: WebEnrichment["reviewSearchStatus"] = [
    {
      platform: "AmbitionBox",
      status:
        ambitionBoxData.reviews.length > 0
          ? "found"
          : ambitionBoxData.companyRating !== null
            ? "found"
            : ambitionBoxData.pageUrl
              ? "snippet_only"
              : "not_found",
      detail:
        ambitionBoxData.reviews.length > 0
          ? `원문 확인 · 리뷰 ${ambitionBoxData.reviews.length}건${
              ambitionBoxData.companyRating !== null ? ` · 평점 ${ambitionBoxData.companyRating}/5` : ""
            }`
          : ambitionBoxData.companyRating !== null
            ? `페이지 확인 · 평점 ${ambitionBoxData.companyRating}/5 · 리뷰 본문 없음`
            : ambitionBoxData.pageUrl
              ? "리뷰 존재 언급 확인. 원문 접근 불가로 평점·내용 미검증"
              : "검색했으나 관련 자료를 찾지 못함",
    },
    {
      platform: "Glassdoor",
      status:
        glassdoorMatched && glassdoorData.rating !== null
          ? "found"
          : glassdoorMatched
            ? "snippet_only"
            : glassdoorData.companyName
              ? "not_found"
              : "not_found",
      detail: glassdoorMatched
        ? glassdoorData.rating !== null
          ? `대상 ${glassdoorData.companyName} · 평점 ${glassdoorData.rating}/5${
              glassdoorData.reviewCount !== null ? ` · 리뷰 ${glassdoorData.reviewCount}건` : ""
            }`
          : "동일 회사 후보 확인 · 원문 접근 불가로 평점 미검증"
        : glassdoorData.companyName
          ? `다른 회사 후보(${glassdoorData.companyName})는 제외 · 자동 반영하지 않음`
          : "검색했으나 동일 회사 리뷰 미확인",
    },
    {
      platform: "Google Maps",
      status: googleMapsData?.rating != null ? "found" : "not_found",
      detail:
        googleMapsData?.rating != null
          ? `평점 ${googleMapsData.rating}/5`
          : "검색했으나 사업장 평점 미확인",
    },
  ];

  // 심층 모드: 비어 있는 핵심 항목만 후속 검색
  if (mode === "deep") {
    const followUps: Promise<Awaited<ReturnType<typeof searchWeb>>>[] = [];
    if (!revenue) {
      followUps.push(searchWeb(`"${companyName}" OR "${shortName}" turnover OR revenue OR FY India`, 4));
      deepSearchNotes.push("매출 후속 검색 실행");
    }
    if (!employeesMatch) {
      followUps.push(searchWeb(`"${companyName}" OR "${shortName}" employees OR headcount OR "team size" India`, 4));
      deepSearchNotes.push("직원 수 후속 검색 실행");
    }
    if (creditRatingSnippets.length === 0) {
      followUps.push(searchWeb(`"${shortName}" site:crisilratings.com OR site:icra.in rating`, 4));
      deepSearchNotes.push("신용평가 후속 검색 실행");
    }
    if (employeeReviews.length === 0) {
      followUps.push(searchWeb(`"${companyName}" site:ambitionbox.com OR site:glassdoor.co.in review`, 4));
      deepSearchNotes.push("직원 평가 후속 검색 실행");
    }
    if (followUps.length > 0) {
      const followResults = (await Promise.all(followUps)).flat();
      for (const result of followResults) {
        if (isBlacklisted(result.url) || !isRelevantSearchResult(result)) continue;
        if (!isCompanyRelevantResult(result, companyName)) continue;
        combinedText += " " + result.snippet;
        rawSnippets.push({ text: result.snippet, source: result.title, url: result.url });
        relatedLinks.push({ label: result.title, url: result.url, type: "source" });
      }
      if (!revenue) {
        const retryRevenue = extractRevenue(combinedText);
        if (retryRevenue.revenue) {
          deepSearchNotes.push(`매출 후보 확보: ${retryRevenue.revenue}`);
        } else {
          deepSearchNotes.push("매출은 여전히 미확인");
        }
      }
      if (employeeReviews.length === 0) {
        deepSearchNotes.push(
          followResults.some((r) => /ambitionbox|glassdoor/i.test(r.url))
            ? "직원 평가 관련 출처 추가"
            : "직원 평가는 여전히 미확인"
        );
      }
      deepSearchNotes.push(`새 출처 후보 ${followResults.length}건 수집`);
    } else {
      deepSearchNotes.push("추가 조사가 필요한 핵심 공란이 없어 후속 검색을 생략");
    }
  }

  const retryRevenue = extractRevenue(combinedText);
  const finalRevenue = revenue ?? retryRevenue.revenue;
  const finalYear = year ?? retryRevenue.year;
  const retryEmployees = extractEmployees(combinedText);
  const uniqueLinks = relatedLinks.filter(
    (link, i, arr) =>
      arr.findIndex((l) => l.url === link.url) === i && !isForeignSiteUrl(link.url)
  );

  const discoveredPageCount =
    mainResults.length +
    expandedBuckets.length +
    linkedInResults.length +
    googleReviewResults.length +
    snsResults.length +
    websiteData.pages.length;
  const relevantPageCount = uniqueLinks.length + websiteData.pages.length;
  const verifiedPageCount =
    (website ? 1 : 0) +
    websiteData.pages.filter((page) => !/홈 내장/i.test(page.title)).length +
    (ambitionBoxData.reviews.length > 0 ? 1 : 0) +
    (glassdoorMatched && glassdoorData.pageUrl ? 1 : 0) +
    (googleMapsData ? 1 : 0);
  const usedInReportCount = Math.min(
    relevantPageCount,
    uniqueLinks.slice(0, 20).length + (website ? 1 : 0) + websiteClients.length
  );

  return {
    website,
    revenue: finalRevenue,
    revenueYear: finalYear,
    description: description?.substring(0, 500) ?? businessDescription?.substring(0, 500) ?? null,
    businessDescription: businessDescription?.substring(0, 500) ?? null,
    foundedDate,
    industry: registryBusinessActivity || industryMatch?.[1]?.trim() || null,
    employees: employeesMatch || retryEmployees ? `${employeesMatch || retryEmployees}명` : null,
    phone: websiteData.phones[0] ?? null,
    email: websiteData.emails[0] ?? null,
    address: addressMatch?.[1]?.trim() ?? null,
    linkedInUrl: resolvedLinkedIn,
    googleReviewsSummary,
    products,
    services,
    socialLinks: uniqueSocial,
    relatedLinks: uniqueLinks.slice(0, 20),
    insights,
    sources: [...new Set(sources)],
    rawSnippets: rawSnippets.slice(0, 10),
    crawledPages: websiteData.pages,
    snsComments: snsComments.slice(0, 15),
    websiteReviews: websiteReviews.slice(0, 15),
    employeeReviews,
    ambitionBoxUrl: ambitionBoxData.pageUrl,
    ambitionBoxRating: ambitionBoxData.companyRating,
    ambitionBoxReviewCount: ambitionBoxData.reviewCount,
    googleMapsRating: googleMapsData?.rating ?? null,
    googleMapsReviewCount: googleMapsData?.reviewCount ?? null,
    googleMapsUrl: googleMapsData?.mapsUrl ?? null,
    glassdoorRating: glassdoorMatched ? glassdoorData.rating : null,
    glassdoorReviewCount: glassdoorMatched ? glassdoorData.reviewCount : null,
    glassdoorUrl: glassdoorMatched ? glassdoorData.pageUrl : null,
    glassdoorGoogleSearchUrl: glassdoorData.googleSearchUrl,
    glassdoorSnippets: glassdoorMatched ? glassdoorData.snippets.slice(0, 6) : [],
    discoveredDirectors,
    newsItems,
    indiaOpsSnippets,
    relationSnippets,
    riskSnippets,
    creditRatingSnippets,
    customerSnippets: customerSnippets.slice(0, 12),
    reviewSearchStatus,
    deepSearchNotes,
    sourceStats: {
      discovered: discoveredPageCount,
      relevant: relevantPageCount,
      verified: verifiedPageCount,
      usedInReport: usedInReportCount,
    },
  };
}

export function extractShareholdersFromText(text: string, companyName: string) {
  const shareholders: { name: string; holdingPercent: string | null; shares: string | null; source: string }[] = [];

  const patterns = [
    /([A-Z][A-Za-z\s&.]+(?:Ltd|Limited|LLP|Inc|Corp|Pvt))[\s,:-]+([\d.]+%)/g,
    /shareholder[s]?[:\s]+([A-Z][A-Za-z\s&.]+)[\s,:-]+([\d.]+%)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.toLowerCase().includes(companyName.toLowerCase().split(" ")[0])) continue;
      if (name.length < 4 || name.length > 80) continue;
      shareholders.push({
        name,
        holdingPercent: match[2] ?? null,
        shares: null,
        source: "Public Web Sources",
      });
      if (shareholders.length >= 10) break;
    }
  }

  return shareholders;
}
