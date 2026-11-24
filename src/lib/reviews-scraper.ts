import type { PublicComment, WebsiteReview } from "./types";
import {
  detectPlatformFromUrl,
  isCompanyRelevantResult,
  textMentionsCompany,
} from "./company-match";
import { searchWeb } from "./search-engine";
import { isReadableLatinText, isRelevantSearchResult, isUsefulCommentText, sanitizeWebText } from "./text-utils";
import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchText(url: string): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
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

function detectPlatform(url: string, context = ""): string {
  const fromUrl = detectPlatformFromUrl(url);
  const blob = `${context} ${url}`;
  // 공유·검색 미러 URL에 리뷰 플랫폼명이 섞여도 원문 도메인 우선
  if (/ambitionbox\.com/i.test(url)) return "AmbitionBox";
  if (/glassdoor\.(com|co\.in)/i.test(url)) return "Glassdoor";
  if (/mouthshut\.com/i.test(url)) return "MouthShut";
  // Twitter/Facebook에 AmbitionBox 설명만 걸린 경우 → 리뷰 원문으로 취급하지 않음
  if (
    /(?:twitter|x)\.com|facebook\.com|t\.co\//i.test(url) &&
    /ambitionbox|glassdoor|mouthshut/i.test(blob)
  ) {
    return fromUrl;
  }
  return fromUrl;
}

function extractRating(text: string): string | null {
  // "1 Reviews" / "리뷰 1개" 를 평점 1.0으로 오인하지 않음 — 척도가 있는 패턴만 허용
  const scale = text.match(/(\d(?:\.\d)?)\s*\/\s*5|(\d(?:\.\d)?)\s*out of\s*5/i);
  if (scale) {
    const num = parseFloat(scale[1] || scale[2]);
    if (num >= 1 && num <= 5) return String(num);
  }
  const glyphs = text.match(/([★⭐]{1,5})/);
  if (glyphs) return String(glyphs[1].length);

  const labeled = text.match(/(?:overall\s+)?(?:rating|rated|score)\s*[:\s]*(\d(?:\.\d)?)/i);
  if (labeled) {
    const num = parseFloat(labeled[1]);
    if (num >= 1 && num <= 5) return String(num);
  }

  const stars = text.match(/(\d(?:\.\d)?)\s*stars?\b/i);
  if (stars && !/\b\d[\d,]*\s*reviews?\b/i.test(text.slice(Math.max(0, stars.index! - 8), stars.index! + 20))) {
    const num = parseFloat(stars[1]);
    if (num >= 1 && num <= 5) return String(num);
  }
  return null;
}

function isReviewAggregatorShare(url: string, text: string): boolean {
  return (
    /(?:twitter|x)\.com|facebook\.com|t\.co\/|linkedin\.com\/posts/i.test(url) &&
    /ambitionbox|glassdoor|mouthshut|indeed\.com\/cmp/i.test(`${url} ${text}`)
  );
}

function extractSearchResults(html: string): { title: string; url: string; snippet: string }[] {
  const results: { title: string; url: string; snippet: string }[] = [];
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
      snippet: snippetMatch ? htmlToText(snippetMatch[1]) : "",
    });
  }
  return results;
}

function snippetToComment(
  result: { title: string; url: string; snippet: string },
  companyName: string
): PublicComment | null {
  const text = result.snippet.trim();
  if (text.length < 20 || text.length > 500) return null;

  if (!isCompanyRelevantResult(result, companyName)) return null;
  if (!isReviewLikeText(`${result.title} ${text}`)) return null;
  if (isReviewAggregatorShare(result.url, `${result.title} ${text}`)) return null;

  const platform = detectPlatform(result.url, `${result.title} ${text}`);
  const rating = extractRating(text);

  let author: string | null = null;
  const authorMatch = text.match(/(?:by|from|@)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (authorMatch) author = authorMatch[1];

  const dateMatch = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b|\b\d{4}[-/]\d{2}[-/]\d{2}\b/);

  return {
    platform,
    author,
    text,
    date: dateMatch?.[0] ?? null,
    url: result.url,
    rating,
  };
}

function isReviewLikeText(text: string): boolean {
  return /review|rating|\d\s*(?:\/\s*5|stars?)|recommend|feedback|comment|testimonial|mouthshut|justdial|glassdoor|trustpilot|google maps|employee.{0,20}review|customer.{0,20}review|(?:good|bad|great|poor|excellent|terrible).{0,30}experience/i.test(
    text
  );
}

export function commentsFromReviewSearch(
  results: { title: string; url: string; snippet: string }[],
  companyName?: string
): PublicComment[] {
  const comments: PublicComment[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const text = result.snippet.trim();
    if (text.length < 20) continue;
    if (companyName && !isCompanyRelevantResult(result, companyName)) continue;
    if (!isReviewLikeText(`${result.title} ${text}`)) continue;
    if (!isUsefulCommentText(text, companyName)) continue;
    if (isReviewAggregatorShare(result.url, `${result.title} ${text}`)) continue;
    const key = text.substring(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);

    comments.push({
      platform: detectPlatform(result.url, `${result.title} ${text}`),
      author: null,
      text,
      date: null,
      url: result.url,
      rating: extractRating(text),
    });
  }

  return comments;
}

export function commentsFromSearchResults(
  results: { title: string; url: string; snippet: string }[],
  companyName: string
): PublicComment[] {
  const comments: PublicComment[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const comment = snippetToComment(result, companyName);
    if (!comment) continue;
    const key = comment.text.substring(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    comments.push(comment);
  }

  return comments;
}

export async function fetchSnsComments(companyName: string): Promise<PublicComment[]> {
  const queries = [
    `"${companyName}" employee review OR "worst company" OR "good place to work" India`,
    `"${companyName}" site:ambitionbox.com/reviews OR site:mouthshut.com OR site:glassdoor.co.in`,
    `"${companyName}" "pros" "cons" review rating India`,
  ];

  const comments: PublicComment[] = [];
  const seen = new Set<string>();

  const resultSets = await Promise.all(queries.map((q) => searchWeb(q, 5)));

  for (const results of resultSets) {
    for (const result of results) {
      if (!isRelevantSearchResult(result)) continue;
    }
    for (const comment of commentsFromReviewSearch(results, companyName)) {
      if (!isUsefulCommentText(comment.text, companyName)) continue;
      if (!textMentionsCompany(`${comment.text} ${comment.url}`, companyName)) continue;
      const key = comment.text.substring(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      comments.push(comment);
      if (comments.length >= 15) break;
    }
    if (comments.length >= 15) break;
  }

  return comments;
}

function extractReviewsFromHtml(html: string, pageUrl: string, pageTitle: string): WebsiteReview[] {
  const reviews: WebsiteReview[] = [];
  const seen = new Set<string>();

  const blockPatterns = [
    /<(?:blockquote|div|section|article)[^>]*class=["'][^"']*(?:testimonial|review|feedback|customer-review|client-say|rating)[^"']*["'][^>]*>([\s\S]*?)<\/(?:blockquote|div|section|article)>/gi,
    /<p[^>]*class=["'][^"']*(?:testimonial|review|feedback)[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi,
  ];

  for (const pattern of blockPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const text = htmlToText(match[1]);
      if (text.length < 25 || text.length > 400) continue;
      if (seen.has(text)) continue;
      seen.add(text);

      const rating = extractRating(match[1] + " " + text);
      const authorMatch = text.match(/^[-–—]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      const author = authorMatch?.[1] ?? null;
      const body = author ? text.replace(/^[-–—]?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?[,.]?\s*/, "").trim() : text;

      reviews.push({
        author,
        rating,
        text: body || text,
        source: pageTitle,
        url: pageUrl,
      });
      if (reviews.length >= 10) break;
    }
  }

  const quotePattern = /"([^"]{30,300})"/g;
  let quoteMatch;
  while ((quoteMatch = quotePattern.exec(htmlToText(html))) !== null) {
    const text = quoteMatch[1].trim();
    if (/testimonial|review|customer|client|said|great|excellent|recommend/i.test(text) && !seen.has(text)) {
      seen.add(text);
      reviews.push({
        author: null,
        rating: extractRating(text),
        text,
        source: pageTitle,
        url: pageUrl,
      });
      if (reviews.length >= 12) break;
    }
  }

  return reviews;
}

export async function fetchWebsiteReviews(
  websiteUrl: string,
  pages: { url: string; title: string }[],
  combinedHtml: string
): Promise<WebsiteReview[]> {
  const reviews: WebsiteReview[] = [];
  const seen = new Set<string>();

  const reviewKeywords = ["testimonial", "review", "feedback", "customer", "clients"];

  reviews.push(
    ...extractReviewsFromHtml(combinedHtml, websiteUrl, "Website")
  );

  for (const page of pages) {
    const isReviewPage = reviewKeywords.some(
      (kw) => page.url.toLowerCase().includes(kw) || page.title.toLowerCase().includes(kw)
    );
    if (!isReviewPage && page.title === "Homepage") continue;

    const html = page.url === websiteUrl ? null : await fetchText(page.url);
    if (!html) continue;

    for (const r of extractReviewsFromHtml(html, page.url, page.title)) {
      if (!seen.has(r.text)) {
        seen.add(r.text);
        reviews.push(r);
      }
    }
  }

  return reviews.slice(0, 12);
}

export async function fetchWebReviewSnippets(companyName: string): Promise<WebsiteReview[]> {
  const queries = [
    `"${companyName}" customer reviews OR employee reviews India`,
    `"${companyName}" ratings reviews site:justdial.com OR site:mouthshut.com OR site:ambitionbox.com`,
    `"${companyName}" "I work" OR "worked at" OR "rude" OR "recommend" review`,
  ];

  const reviews: WebsiteReview[] = [];
  const seen = new Set<string>();

  const resultSets = await Promise.all(queries.map((q) => searchWeb(q, 5)));

  for (const results of resultSets) {
    for (const result of results) {
      const text = result.snippet.trim();
      if (text.length < 30) continue;
      if (!isCompanyRelevantResult(result, companyName)) continue;
      if (!/review|rating|star|recommend|experience|feedback|customer/i.test(text)) continue;
      if (seen.has(text)) continue;
      seen.add(text);

      reviews.push({
        author: null,
        rating: extractRating(text),
        text,
        source: detectPlatform(result.url),
        url: result.url,
      });
      if (reviews.length >= 8) break;
    }
    if (reviews.length >= 8) break;
  }

  return reviews;
}
