/** 회사명 일치·관련성 검증 — 유사명 타사 자료 혼입 방지 */

const LEGAL_STOP = new Set([
  "private",
  "limited",
  "ltd",
  "pvt",
  "llp",
  "inc",
  "corp",
  "company",
  "co",
  "india",
  "the",
  "and",
  "of",
]);

const WEAK_TOKENS = new Set([
  "ventures",
  "services",
  "solutions",
  "technologies",
  "technology",
  "tech",
  "group",
  "global",
  "international",
  "holdings",
  "enterprise",
  "enterprises",
  "industries",
  "consulting",
  "consultancy",
]);

const PLATFORM_FROM_URL: { pattern: RegExp; name: string }[] = [
  { pattern: /ambitionbox\.com/i, name: "AmbitionBox" },
  { pattern: /glassdoor\.(com|co\.in)/i, name: "Glassdoor" },
  { pattern: /linkedin\.com/i, name: "LinkedIn" },
  { pattern: /(?:twitter|x)\.com/i, name: "Twitter/X" },
  { pattern: /facebook\.com/i, name: "Facebook" },
  { pattern: /instagram\.com/i, name: "Instagram" },
  { pattern: /youtube\.com|youtu\.be/i, name: "YouTube" },
  { pattern: /reddit\.com/i, name: "Reddit" },
  { pattern: /mouthshut\.com/i, name: "MouthShut" },
  { pattern: /justdial\.com/i, name: "JustDial" },
  { pattern: /trustpilot/i, name: "Trustpilot" },
  { pattern: /google\.[^/]+\/maps|maps\.google/i, name: "Google Maps" },
  { pattern: /crisil/i, name: "CRISIL" },
  { pattern: /icra\.in/i, name: "ICRA" },
];

export function companyTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !LEGAL_STOP.has(token));
}

export function strongCompanyTokens(name: string): string[] {
  return companyTokens(name).filter((token) => !WEAK_TOKENS.has(token));
}

/** 0~1, 높을수록 동일 회사 가능성 */
export function companyMatchScore(target: string, candidate: string): number {
  const left = companyTokens(target);
  const right = companyTokens(candidate);
  if (left.length === 0 || right.length === 0) return 0;

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  const base = overlap / left.length;

  const strongLeft = strongCompanyTokens(target);
  const strongRight = new Set(strongCompanyTokens(candidate));
  if (strongLeft.length === 0) return base;

  const strongHit = strongLeft.filter((token) => strongRight.has(token)).length;
  const strongRatio = strongHit / strongLeft.length;

  // 핵심 토큰(예: minsub)이 없으면 약함 — MESINDUS ≠ MINSUB
  if (strongRatio === 0) return Math.min(base, 0.25);
  return Math.min(1, base * 0.45 + strongRatio * 0.55);
}

export function isSameCompany(target: string, candidate: string, minScore = 0.55): boolean {
  if (!target.trim() || !candidate.trim()) return false;
  return companyMatchScore(target, candidate) >= minScore;
}

export function textMentionsCompany(text: string, companyName: string): boolean {
  const hay = text.toLowerCase();
  const strong = strongCompanyTokens(companyName);
  if (strong.length === 0) {
    const tokens = companyTokens(companyName);
    return tokens.length > 0 && tokens.every((token) => hay.includes(token));
  }
  // 핵심 토큰 중 하나 이상 + (가능하면) 약토큰 일부
  if (!strong.some((token) => hay.includes(token))) return false;
  const weak = companyTokens(companyName).filter((token) => WEAK_TOKENS.has(token));
  if (weak.length === 0) return true;
  return weak.some((token) => hay.includes(token)) || strong.length >= 2;
}

export function detectPlatformFromUrl(url: string): string {
  for (const { pattern, name } of PLATFORM_FROM_URL) {
    if (pattern.test(url)) return name;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Web";
  } catch {
    return "Web";
  }
}

const IRRELEVANT_PAGE =
  /\b(cricket|gujarat titans|ipl\b|ticket booking|match ticket|stadium seat|fantasy league|live score|youtube tv|netflix|spotify|player profile|batting average)\b/i;

const DIRECTORY_BOILERPLATE =
  /\b(find company details across|search millions of companies|company search portal|mca data aggregator|download our app|search any indian company|get company information instantly)\b/i;

const GENERIC_RATING_PITCH =
  /\b(we (?:provide|offer).{0,40}(?:crisil|icra|care).{0,40}rating|get (?:your )?company rated|rating services for companies|check crisil(?:\/| or )?icra)\b/i;

const SITE_SELF_PROMO =
  /\b(this (?:website|portal|tool) (?:helps|allows|lets)|our (?:company search|business intelligence) (?:platform|tool|service))\b/i;

export function isCompanyRelevantResult(
  result: { title: string; url: string; snippet: string },
  companyName: string
): boolean {
  const blob = `${result.title} ${result.snippet} ${result.url}`;
  if (IRRELEVANT_PAGE.test(blob)) return false;
  if (DIRECTORY_BOILERPLATE.test(blob) && !textMentionsCompany(blob, companyName)) return false;
  if (GENERIC_RATING_PITCH.test(blob) && !textMentionsCompany(blob, companyName)) return false;
  if (SITE_SELF_PROMO.test(blob) && !textMentionsCompany(blob, companyName)) return false;

  if (isSameCompany(companyName, result.title, 0.5)) return true;
  if (textMentionsCompany(blob, companyName)) return true;

  // URL 슬러그에 핵심 토큰 포함
  const strong = strongCompanyTokens(companyName);
  const path = result.url.toLowerCase();
  if (strong.some((token) => path.includes(token))) return true;

  return false;
}

export function isValidCreditRatingSnippet(text: string, companyName: string): boolean {
  if (!textMentionsCompany(text, companyName)) return false;
  if (GENERIC_RATING_PITCH.test(text)) return false;
  return /(rated|rating|outlook|rationale|assigned|reaffirmed|withdrawn)\b/i.test(text);
}
