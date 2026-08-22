import type { WebEnrichment } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
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

function extractWebsite(html: string): string | null {
  const patterns = [
    /https?:\/\/(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9.]+\.[a-z]{2,}(?:\/[^\s"'<>]*)?/g,
  ];
  const blacklist = ["google", "facebook", "twitter", "linkedin", "youtube", "wikipedia", "zaubacorp", "tofler", "mca.gov", "data.gov"];

  for (const pattern of patterns) {
    const matches = html.match(pattern) ?? [];
    for (const match of matches) {
      const lower = match.toLowerCase();
      if (!blacklist.some((b) => lower.includes(b))) {
        return match.replace(/[.,;)]+$/, "");
      }
    }
  }
  return null;
}

function extractRevenue(text: string): { revenue: string | null; year: string | null } {
  const patterns = [
    /(?:revenue|turnover|net sales)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(crore|cr|lakh|million|billion|bn)/gi,
    /(?:revenue|turnover)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:crore|cr)/gi,
    /FY\s*(\d{4}[-–]?\d{2,4})[:\s,]*(?:revenue|turnover)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(crore|cr|lakh)/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const amount = match[1] ?? match[2];
      const unit = match[2] ?? match[3] ?? "crore";
      const year = match[1]?.match(/\d{4}/) ? match[1] : null;
      return {
        revenue: `₹${amount} ${unit}`,
        year,
      };
    }
  }
  return { revenue: null, year: null };
}

function extractDescription(text: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  const relevant = sentences.find(
    (s) =>
      s.length > 40 &&
      s.length < 300 &&
      /company|limited|ltd|india|business|provides|manufactures|services/i.test(s)
  );
  return relevant?.trim() ?? null;
}

export async function enrichFromWeb(
  companyName: string,
  cin: string
): Promise<WebEnrichment> {
  const sources: string[] = [];
  let combinedText = "";
  let website: string | null = null;

  const searchQueries = [
    `"${companyName}" India revenue turnover`,
    `"${companyName}" ${cin} official website`,
    `"${companyName}" India company profile shareholders`,
  ];

  for (const q of searchQueries) {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const html = await fetchText(ddgUrl);
    if (!html) continue;

    sources.push("DuckDuckGo Web Search");
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

    combinedText += " " + textContent;

    if (!website) {
      website = extractWebsite(html);
    }
  }

  const { revenue, year } = extractRevenue(combinedText);
  const description = extractDescription(combinedText);

  const industryMatch = combinedText.match(
    /(?:industry|sector|business)[:\s]+([A-Za-z\s&,]+(?:technology|finance|manufacturing|pharma|retail|energy|telecom|automobile|real estate|IT|software)[A-Za-z\s&,]*)/i
  );

  const employeesMatch = combinedText.match(
    /(?:employees|workforce|staff)[:\s]*([\d,]+(?:\s*[-–]\s*[\d,]+)?)/i
  );

  return {
    website,
    revenue,
    revenueYear: year,
    description,
    industry: industryMatch?.[1]?.trim().substring(0, 100) ?? null,
    employees: employeesMatch?.[1] ?? null,
    sources: [...new Set(sources)],
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
