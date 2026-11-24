import type { EmployeeReview } from "./types";
import { searchWeb } from "./search-engine";
import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BASE_URL = "https://www.ambitionbox.com";

interface AmbitionBoxReviewRaw {
  id?: number;
  reviewTitle?: string;
  overallCompanyRating?: number;
  likesText?: string;
  disLikesText?: string;
  division?: string;
  modifiedHumanReadable?: string;
  created?: string;
  url?: string;
  helpfulCount?: number;
  workPolicy?: string;
  jobProfile?: { name?: string };
  jobLocation?: { name?: string };
  workLabels?: {
    workDays?: string[];
    workTimeMonitor?: string[];
    travelTags?: string[];
  };
  ratingDistribution?: Array<{ name?: string; rating?: number }>;
}

function companyToSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/\b(private|limited|ltd|pvt|llp|inc|corp|company|co|india)\b/gi, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchHtml(url: string): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
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

export async function findAmbitionBoxReviewsUrl(companyName: string): Promise<string | null> {
  const results = await searchWeb(`"${companyName}" site:ambitionbox.com/reviews`, 5);
  for (const result of results) {
    const match = result.url.match(/ambitionbox\.com\/reviews\/[a-z0-9-]+-reviews/i);
    if (match) return result.url.split("?")[0];
  }

  const slug = companyToSlug(companyName);
  if (!slug) return null;
  return `${BASE_URL}/reviews/${slug}-reviews`;
}

function mapReview(raw: AmbitionBoxReviewRaw, pageUrl: string): EmployeeReview {
  const workDays = raw.workLabels?.workDays?.join(", ") ?? null;
  const workTiming = raw.workLabels?.workTimeMonitor?.join(", ") ?? null;
  const travel = raw.workLabels?.travelTags?.join(", ") ?? null;
  const workDetails = [
    workDays ? `근무일: ${workDays}` : null,
    workTiming ? `근무 시간: ${workTiming}` : null,
    raw.workPolicy ? `근무 형태: ${raw.workPolicy}` : null,
    travel ? `출장: ${travel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const likes = raw.likesText?.trim() || null;
  const dislikes = raw.disLikesText?.trim() || null;
  const subRatings = (raw.ratingDistribution ?? [])
    .filter((item) => item.name && typeof item.rating === "number")
    .map((item) => ({ name: item.name!, rating: item.rating! }));

  const ratingSummary =
    !likes && !dislikes && subRatings.length > 0
      ? `세부 평가: ${subRatings.map((item) => `${item.name} ${item.rating}/5`).join(", ")}`
      : null;

  return {
    platform: "AmbitionBox",
    rating: typeof raw.overallCompanyRating === "number" ? raw.overallCompanyRating : null,
    title: raw.reviewTitle?.trim() || null,
    jobProfile: raw.jobProfile?.name?.trim() || null,
    location: raw.jobLocation?.name?.trim() || null,
    department: raw.division?.trim() || null,
    likes,
    dislikes,
    workDetails: [workDetails, ratingSummary].filter(Boolean).join("\n") || null,
    subRatings,
    date: raw.modifiedHumanReadable || raw.created?.split(" ")[0] || null,
    url: raw.url ? `${BASE_URL}${raw.url}` : pageUrl,
    helpfulCount: raw.helpfulCount ?? null,
  };
}

function parseReviewsFromHtml(html: string, pageUrl: string): {
  reviews: EmployeeReview[];
  companyRating: number | null;
  reviewCount: number | null;
} {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return { reviews: [], companyRating: null, reviewCount: null };

  try {
    const data = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          reviewsData?: AmbitionBoxReviewRaw[];
          companyHeaderData?: { rating?: number; reviewsCount?: number };
          reviewCount?: number;
        };
      };
    };

    const pageProps = data.props?.pageProps;
    const rawReviews = pageProps?.reviewsData ?? [];
    const companyRating = pageProps?.companyHeaderData?.rating ?? null;
    const reviewCount = pageProps?.reviewCount ?? pageProps?.companyHeaderData?.reviewsCount ?? null;

    const reviews = rawReviews
      .map((raw) => mapReview(raw, pageUrl))
      .filter((review) => review.likes || review.dislikes || review.rating !== null);

    return { reviews, companyRating, reviewCount };
  } catch {
    return { reviews: [], companyRating: null, reviewCount: null };
  }
}

export async function fetchAmbitionBoxReviews(companyName: string): Promise<{
  reviews: EmployeeReview[];
  pageUrl: string | null;
  companyRating: number | null;
  reviewCount: number | null;
}> {
  const pageUrl = await findAmbitionBoxReviewsUrl(companyName);
  if (!pageUrl) {
    return { reviews: [], pageUrl: null, companyRating: null, reviewCount: null };
  }

  const html = await fetchHtml(pageUrl);
  if (!html) {
    return { reviews: [], pageUrl, companyRating: null, reviewCount: null };
  }

  const parsed = parseReviewsFromHtml(html, pageUrl);
  return { ...parsed, pageUrl };
}
