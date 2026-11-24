const FOREIGN_SITE_PATTERNS = [
  /baidu\.com/i,
  /baike\./i,
  /zhihu\.com/i,
  /weibo\.com/i,
  /sogou\.com/i,
  /1688\.com/i,
  /taobao\.com/i,
  /jd\.com/i,
  /wikipedia\.org\/zh/i,
];

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff]/;
const BOILERPLATE_PATTERNS =
  /nos gustaría|no lo permite|sitios cercanos|restaurantes|gasolineras|cajeros|google maps$|enjoy the videos and music|keyboard shortcuts|autoplay videos|how to earn money on youtube|sign in to create & share|upload youtube videos|chatgpt castling|github help|pages documentation/i;

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

export function sanitizeWebText(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

export function hasCjkText(text: string): boolean {
  const decoded = sanitizeWebText(text);
  const nonSpace = decoded.replace(/\s/g, "");
  if (nonSpace.length === 0) return false;
  const cjkCount = (decoded.match(CJK_REGEX) ?? []).length;
  return cjkCount / nonSpace.length > 0.1;
}

export function isForeignSiteUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (FOREIGN_SITE_PATTERNS.some((pattern) => pattern.test(host) || pattern.test(url))) {
      return true;
    }
    return /\.(cn|tw|hk|jp|kr|ru|de|fr|es|it|br|mx)(\/|$)/i.test(host);
  } catch {
    return false;
  }
}

export function isReadableLatinText(text: string): boolean {
  const decoded = sanitizeWebText(text);
  if (hasCjkText(decoded)) return false;
  const latin = (decoded.match(/[A-Za-z]/g) ?? []).length;
  const nonSpace = decoded.replace(/\s/g, "");
  if (nonSpace.length < 8) return false;
  return latin / nonSpace.length > 0.45;
}

/** 공식 사이트 소개 등 — 한글 사업 설명도 허용 */
export function isUsableBusinessText(text: string): boolean {
  const decoded = sanitizeWebText(text);
  if (!decoded || decoded.replace(/\s/g, "").length < 12) return false;
  if (isReadableLatinText(decoded)) return true;
  const hangul = (decoded.match(/[가-힣]/g) ?? []).length;
  return hangul >= 8;
}

export function isRelevantSearchResult(result: {
  title: string;
  url: string;
  snippet: string;
}): boolean {
  if (isForeignSiteUrl(result.url)) return false;
  return isReadableLatinText(`${result.title} ${result.snippet}`);
}

export function isUsefulCommentText(text: string, companyName?: string): boolean {
  const decoded = sanitizeWebText(text);
  if (!isReadableLatinText(decoded)) return false;
  if (BOILERPLATE_PATTERNS.test(decoded)) return false;
  if (decoded.length < 25) return false;

  if (companyName) {
    const token = companyName.split(/\s+/)[0]?.toLowerCase();
    if (token && token.length > 2 && decoded.toLowerCase().includes(token)) return true;
  }

  return /review|rating|employee|customer|recommend|experience|service|company|india/i.test(decoded);
}
