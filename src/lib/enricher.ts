import type { WebEnrichment, WebInsight, WebLink } from "./types";
import { fetchWebsiteReviews, fetchSnsComments, fetchWebReviewSnippets, commentsFromReviewSearch } from "./reviews-scraper";
import { buildGoogleSearchUrl, searchWeb, type WebSearchResult } from "./search-engine";
import { isSafeOutboundUrl } from "./security-utils";
import { hasCjkText, isForeignSiteUrl, isReadableLatinText, isRelevantSearchResult, isUsefulCommentText, sanitizeWebText } from "./text-utils";

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
  const keywords = ["about", "contact", "team", "leadership", "product", "service", "company", "who-we-are", "testimonial", "review", "feedback", "customer"];
  const scored: { url: string; score: number }[] = [];

  for (const link of links) {
    try {
      const u = new URL(link);
      if (u.hostname !== base.hostname) continue;
      const path = u.pathname.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (path.includes(kw)) score += 2;
      }
      if (score > 0) scored.push({ url: link, score });
    } catch {
      // skip
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.url)
    .filter((url, i, arr) => arr.indexOf(url) === i)
    .slice(0, 4);
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

async function discoverWebsite(companyName: string, cin: string): Promise<string | null> {
  const queries = [`"${companyName}" official website India`, `"${companyName}" ${cin} site`];

  for (const q of queries) {
    const results = await searchWeb(q, 5);
    for (const result of results) {
      if (
        !isBlacklisted(result.url) &&
        !isAggregatorUrl(result.url)
      ) {
        return result.url;
      }
    }
  }

  for (const domain of guessDomain(companyName)) {
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

  return null;
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

  const internalLinks = findInternalPages(extractLinks(homepage, websiteUrl), websiteUrl);
  for (const pageUrl of internalLinks) {
    const html = await fetchText(pageUrl);
    if (!html) continue;
    combinedHtml += " " + html;
    combinedText += " " + htmlToText(html);
    const title = extractMeta(html, "og:title") ?? pageUrl.split("/").pop() ?? "Page";
    pages.push({ url: pageUrl, title });
    allSocial.push(...extractSocialLinks(html));
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
  registryDescription: string | null = null
): Promise<WebEnrichment> {
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

  const [mainResults, linkedInResults, googleReviewResults, snsResults] = await Promise.all([
    searchWeb(`"${companyName}" ${cin} India company revenue employees founded`, 6),
    searchWeb(`"${companyName}" site:linkedin.com/company India`, 4),
    searchWeb(`"${companyName}" google reviews ratings India`, 6),
    searchWeb(
      `"${companyName}" site:facebook.com OR site:instagram.com OR site:twitter.com OR site:youtube.com`,
      5
    ),
  ]);

  for (const result of mainResults) {
    if (isBlacklisted(result.url) || !isRelevantSearchResult(result)) continue;
    combinedText += " " + result.snippet;
    rawSnippets.push({ text: result.snippet, source: result.title, url: result.url });
    relatedLinks.push({ label: result.title, url: result.url, type: "source" });
  }
  if (mainResults.length > 0) sources.push("Web Search");

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

  let website = websiteFromSearch ?? (await discoverWebsite(companyName, cin));
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
  const businessDescriptionRaw =
    (registryDescription && !isRegistryBoilerplate(registryDescription) ? registryDescription.trim() : null) ||
    extractBusinessDescription(combinedText, companyName, rawSnippets) ||
    description ||
    industryMatch?.[1]?.trim() ||
    null;
  const businessDescription =
    businessDescriptionRaw && isReadableLatinText(businessDescriptionRaw) ? businessDescriptionRaw : null;

  const products = extractListItems(combinedText, ["products", "product range", "our products"]);
  const services = extractListItems(combinedText, ["services", "our services", "solutions", "offerings"]);

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

  const uniqueLinks = relatedLinks.filter(
    (link, i, arr) =>
      arr.findIndex((l) => l.url === link.url) === i && !isForeignSiteUrl(link.url)
  );

  const snsComments: WebEnrichment["snsComments"] = [];
  let websiteReviews: WebEnrichment["websiteReviews"] = [];

  const reviewLikeMain = mainResults.filter((r) =>
    /review|comment|feedback|rating|employee|experience|recommend/i.test(`${r.title} ${r.snippet}`)
  );

  const [snsFetched, webReviewSnippets, siteReviews] = await Promise.all([
    fetchSnsComments(companyName),
    fetchWebReviewSnippets(companyName),
    website
      ? fetchWebsiteReviews(website, websiteData.pages, websiteData.html)
      : Promise.resolve([] as WebEnrichment["websiteReviews"]),
  ]);

  const mergedComments = [
    ...commentsFromReviewSearch(googleReviewResults),
    ...commentsFromReviewSearch(reviewLikeMain),
    ...commentsFromReviewSearch(snsResults),
    ...snsFetched,
  ].filter((c) => !/infyner|qorpiq|indiafilings|zaubacorp|mca\.gov/i.test(c.url))
    .filter((c) => isUsefulCommentText(c.text, companyName));

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

  return {
    website,
    revenue,
    revenueYear: year,
    description: description?.substring(0, 500) ?? businessDescription?.substring(0, 500) ?? null,
    businessDescription: businessDescription?.substring(0, 500) ?? null,
    foundedDate,
    industry: industryMatch?.[1]?.trim() ?? null,
    employees: employeesMatch ? `${employeesMatch}명` : null,
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
