import type { ConnectedCompany, Director, WebLink } from "./types";
import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface RegistryCompanyData {
  name: string;
  slug?: string;
  status?: string;
  type?: string;
  roc?: string;
  registrationNumber?: string;
  dateOfIncorporation?: string;
  registeredAddress?: string;
  email?: string;
  listingStatus?: string;
  description?: string;
  businessActivity?: string;
  authorizedCapitalInr?: number;
  paidUpCapitalInr?: number;
  lastAgmDate?: string;
  chargesSummary?: string;
  connectedCompanies?: ConnectedCompany[];
  directors: Director[];
  relatedLinks: WebLink[];
  sources: string[];
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

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractCompanyEmails(html: string): string[] {
  const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(emails)].filter(
    (email) =>
      !email.includes("indiafilings") &&
      !email.includes("infyner") &&
      !email.includes("qorpiq") &&
      !email.includes("example.com")
  );
}

function parseJsonLd(html: string): Record<string, unknown> | null {
  const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractJsonLdOrganization(jsonLd: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!jsonLd) return null;
  if (jsonLd["@type"] === "Organization") return jsonLd;
  const graph = jsonLd["@graph"];
  if (!Array.isArray(graph)) return null;
  return (graph.find((node) => (node as Record<string, unknown>)["@type"] === "Organization") as
    | Record<string, unknown>
    | undefined) ?? null;
}

function parseCapitalAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/,/g, "").replace(/₹/g, "").trim();
  if (!normalized) return null;

  const lacMatch = normalized.match(/([\d.]+)\s*(?:l|lac|lacs|lakh|lakhs)\b/i);
  if (lacMatch) {
    const amount = Math.round(parseFloat(lacMatch[1]) * 100_000);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  const croreMatch = normalized.match(/([\d.]+)\s*(?:cr|crore|crores)\b/i);
  if (croreMatch) {
    const amount = Math.round(parseFloat(croreMatch[1]) * 10_000_000);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  const amount = parseInt(normalized.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseCapitalFromText(text: string): {
  authorizedCapitalInr: number | null;
  paidUpCapitalInr: number | null;
} {
  const authorizedMatch = text.match(
    /(?:authorised|authorized)(?:\s+share)?\s+capital(?:\s+is)?\s*(?:INR|Rs\.?|₹)?\s*([\d,.]+(?:\s*(?:L|Lac|Lacs|Lakh|Lakhs|Cr|Crore))?)/i
  );
  const paidUpMatch = text.match(
    /(?:paid[\s-]*up|paidup)(?:\s+share)?\s+capital(?:\s+is)?\s*(?:INR|Rs\.?|₹)?\s*([\d,.]+(?:\s*(?:L|Lac|Lacs|Lakh|Lakhs|Cr|Crore))?)/i
  );

  return {
    authorizedCapitalInr: parseCapitalAmount(authorizedMatch?.[1] ?? null),
    paidUpCapitalInr: parseCapitalAmount(paidUpMatch?.[1] ?? null),
  };
}

function extractRegisteredDetail(html: string, label: string): string | null {
  const pattern = new RegExp(
    `${label}\\s*<\\/h3>\\s*<span[^>]*>\\s*([^<]+?)\\s*<\\/span>`,
    "i"
  );
  const match = html.match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function parseToflerPage(html: string, cin: string): Partial<RegistryCompanyData> | null {
  if (!html || html.length < 1000) return null;
  if (/just a moment|enable javascript|403 forbidden/i.test(html) && html.length < 10000) {
    return null;
  }

  const organization = extractJsonLdOrganization(parseJsonLd(html));
  const breadcrumbName = [...html.matchAll(/"name"\s*:\s*"([^"]+PRIVATE LIMITED)"/gi)].map(
    (m) => m[1]
  )[0];
  const name =
    (typeof organization?.name === "string" ? organization.name : null) ||
    breadcrumbName ||
    html.match(/FAQ\s*-\s*([A-Z][A-Z0-9 &.'()-]+PRIVATE LIMITED)/i)?.[1] ||
    html.match(/([A-Z][A-Z0-9 &.'()-]{3,80}PRIVATE LIMITED)/)?.[1];

  if (!name) return null;

  const text = htmlToText(html);
  const descriptionMatch = html.match(
    new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,80}?is an unlisted[\\s\\S]{0,500}?CIN[^.]{0,40}${cin}[\\s\\S]{0,220}`, "i")
  );
  const description = descriptionMatch
    ? htmlToText(descriptionMatch[0]).replace(/\s+/g, " ").trim()
    : undefined;

  const address =
    text.match(
      /registered address is at\s+((?:(?!\.\s+[A-Z]).){20,260}?\d{6})/i
    )?.[1]?.trim() ||
    html
      .match(/registered address is at\s+([^<]{20,260})/i)?.[1]
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\.\s*$/, "")
      .trim() ||
    undefined;

  const incorporation =
    text.match(/incorporated on\s+([0-9]{1,2}\s+[A-Za-z]+,?\s+[0-9]{4})/i)?.[1] ||
    text.match(/incorporation date[^\d]{0,40}([0-9]{1,2}\s+[A-Za-z]+,?\s+[0-9]{4})/i)?.[1] ||
    undefined;

  const status =
    text.match(/current status[^\n]{0,80}\b(Active|Inactive|Struck Off)\b/i)?.[1] ||
    text.match(/\bis - (Active|Inactive|Struck Off)\b/i)?.[1] ||
    text.match(/\b(Active|Inactive|Struck Off)\b/i)?.[1];
  const email = extractRegisteredDetail(html, "Company Email");
  const paidUpRaw = extractRegisteredDetail(html, "Paid up Capital");
  const authorisedRaw = extractRegisteredDetail(html, "Authorised Capital");
  const capitalFromText = parseCapitalFromText(text);

  const directors: Director[] = [];
  const seenDin = new Set<string>();
  const directorMatches = [
    ...html.matchAll(/<a[^>]+href="\/[^"]*?\/director\/(\d{8})"[^>]*>([^<]+)<\/a>/gi),
  ];

  for (const match of directorMatches) {
    const din = match[1];
    if (seenDin.has(din)) continue;
    seenDin.add(din);
    directors.push({
      din,
      name: match[2].replace(/\s+/g, " ").trim(),
      designation: "Director",
      appointmentDate: "",
      cessationDate: null,
      status: "Current",
    });
  }

  if (directors.length === 0) {
    const fallback = text.match(/has (?:two|three|four|\d+)\s+directors?\s*-\s*([^.]+)/i)?.[1];
    if (fallback) {
      for (const rawName of fallback.split(/\s+and\s+|,\s*/)) {
        const cleaned = rawName.replace(/\s+/g, " ").trim();
        if (cleaned.length > 2) {
          directors.push({
            din: "",
            name: cleaned,
            designation: "Director",
            appointmentDate: "",
            cessationDate: null,
            status: "Current",
          });
        }
      }
    }
  }

  const slug =
    html.match(new RegExp(`tofler\\.in\\/([a-z0-9-]+)\\/company\\/${cin}`, "i"))?.[1] ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const lastAgmDate =
    text.match(/AGM[^\d]{0,80}?(\d{1,2}\s+[A-Za-z]+,?\s+\d{4})/i)?.[1] ||
    text.match(/held on\s+(\d{1,2}\s+[A-Za-z]+,?\s+\d{4})/i)?.[1] ||
    extractRegisteredDetail(html, "AGM") ||
    undefined;

  const industrySlug = html.match(/companylist\/[a-z-]+\/([a-z0-9-]+)/i)?.[1];
  const businessActivity = industrySlug
    ? industrySlug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : undefined;

  const chargesSummary = /no registered charges/i.test(text)
    ? "등록된 담보(Charges) 없음"
    : text.match(/charges?[^\n.]{0,80}/i)?.[0]?.trim();

  const connectedCompanies: ConnectedCompany[] = [];
  const seenConnected = new Set<string>();
  for (const match of html.matchAll(
    /href="\/([a-z0-9-]+)\/company\/([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})"/gi
  )) {
    const connectedCin = match[2].toUpperCase();
    if (connectedCin === cin.toUpperCase() || seenConnected.has(connectedCin)) continue;
    seenConnected.add(connectedCin);
    connectedCompanies.push({
      name: match[1]
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      cin: connectedCin,
      url: `https://www.tofler.in/${match[1]}/company/${connectedCin}`,
    });
    if (connectedCompanies.length >= 8) break;
  }

  return {
    name: name.replace(/\s+/g, " ").trim(),
    slug,
    status: status || undefined,
    type: /private/i.test(text) ? "Private Limited Company" : undefined,
    listingStatus: /unlisted/i.test(text) ? "Unlisted" : undefined,
    dateOfIncorporation: incorporation,
    registeredAddress: address,
    email: email && !/tofler\.in/i.test(email) ? email : undefined,
    description,
    businessActivity,
    authorizedCapitalInr:
      parseCapitalAmount(authorisedRaw) ?? capitalFromText.authorizedCapitalInr ?? undefined,
    paidUpCapitalInr: parseCapitalAmount(paidUpRaw) ?? capitalFromText.paidUpCapitalInr ?? undefined,
    lastAgmDate,
    chargesSummary,
    connectedCompanies,
    directors,
    relatedLinks: [
      {
        label: `Tofler - ${name}`,
        url: `https://www.tofler.in/${slug}/company/${cin}`,
        type: "source",
      },
    ],
    sources: ["Tofler"],
  };
}

function parseQorpiqEmbeddedProfile(html: string): Partial<RegistryCompanyData> | null {
  const match = html.match(/var _hono_view\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]) as {
      props?: {
        profile?: {
          companyName?: string;
          activityDescription?: string;
          activityCode?: string;
          status?: string;
          dateOfIncorporation?: string;
          registeredAddress?: string;
          rocName?: string;
          registrationNumber?: string;
          authorizedCapital?: string | number;
          paidUpCapital?: string | number;
          directors?: Array<{
            din?: string;
            name?: string;
            designation?: string;
            appointmentDate?: string;
            ceased?: boolean;
          }>;
        };
      };
    };

    const profile = data.props?.profile;
    if (!profile?.companyName) return null;

    const directors: Director[] = (profile.directors ?? [])
      .filter((d) => d.name && !d.ceased)
      .map((d) => ({
        din: d.din ?? "",
        name: d.name!.replace(/^\.+\s*/, "").replace(/\s+/g, " ").trim(),
        designation: d.designation ?? "Director",
        appointmentDate: d.appointmentDate?.split(" ")[0] ?? "",
        cessationDate: null,
        status: "Current" as const,
      }));

    return {
      name: profile.companyName,
      status: profile.status,
      roc: profile.rocName,
      registrationNumber: profile.registrationNumber,
      dateOfIncorporation: profile.dateOfIncorporation,
      registeredAddress: profile.registeredAddress,
      businessActivity: profile.activityDescription,
      authorizedCapitalInr: parseCapitalAmount(profile.authorizedCapital) ?? undefined,
      paidUpCapitalInr: parseCapitalAmount(profile.paidUpCapital) ?? undefined,
      directors,
      sources: ["QorpIQ"],
    };
  } catch {
    return null;
  }
}

export function parseDirectorsFromText(text: string): Director[] {
  const patterns = [
    /Directors of [^.]+ are\s*\.?\s*([^.]+)\./i,
    /directors?[:\s]+([A-Z][A-Za-z\s.]+(?:, [A-Z][A-Za-z\s.]+){1,10})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const names = match[1]
      .split(",")
      .map((name) => name.trim().replace(/^\.+\s*/, "").replace(/\s+/g, " "))
      .filter((name) => name.length > 2 && /^[A-Za-z\s.]+$/.test(name));

    if (names.length > 0) {
      return names.map((name) => ({
        din: "",
        name,
        designation: "Director",
        appointmentDate: "",
        cessationDate: null,
        status: "Current" as const,
      }));
    }
  }

  const dinMatches = [...text.matchAll(/(\d{8})\s*\|\s*([A-Z][A-Z\s]+)\s*\|\s*(\d{2}-\d{2}-\d{4})/g)];
  if (dinMatches.length > 0) {
    return dinMatches.map((m) => ({
      din: m[1],
      name: m[2].trim(),
      designation: "Director",
      appointmentDate: m[3],
      cessationDate: null,
      status: "Current" as const,
    }));
  }

  return [];
}

export function parseBusinessActivity(text: string): string | null {
  const patterns = [
    /principal business activity is\s+([^.]+)/i,
    /primarily engaged in\s+([^.]{5,120})/i,
    /operates in the\s+([^.]{5,120})\s+sector/i,
    /engaged in\s+([^.]{10,120})/i,
    /business activity[:\s]+([^.]{10,120})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = match[1].trim();
    if (/ROC records|NIC classification|vendor checks|MCA profile/i.test(value)) continue;
    return value;
  }
  return null;
}

function parseQorpiqPage(html: string, cin: string): Partial<RegistryCompanyData> | null {
  const title = html.match(/<title>([^<|]+)/i)?.[1]?.trim();
  const name = title?.replace(/\s+MCA Profile.*$/i, "").trim();
  if (!name) return null;

  const text = htmlToText(html);
  const jsonLd = parseJsonLd(html);
  const organization = extractJsonLdOrganization(jsonLd);
  const jsonDescription =
    typeof organization?.description === "string" ? organization.description : "";
  const jsonFounding =
    typeof organization?.foundingDate === "string" ? organization.foundingDate : undefined;

  const jsonMembers = Array.isArray(organization?.member)
    ? (organization.member as Array<{ name?: string; jobTitle?: string }>)
    : [];
  const jsonDirectors: Director[] = jsonMembers
    .filter((m) => m.name)
    .map((m) => ({
      din: "",
      name: m.name!.replace(/^\.+\s*/, "").replace(/\s+/g, " ").trim(),
      designation: m.jobTitle ?? "Director",
      appointmentDate: "",
      cessationDate: null,
      status: "Current" as const,
    }));

  const slug = html.match(new RegExp(`/company/([a-z0-9-]+)/${cin}`, "i"))?.[1];
  const status =
    text.match(/\bStatus\s+(Active|Inactive|Struck Off|Amalgamated)\b/i)?.[1] ??
    jsonDescription.match(/status of [^-]+-\s*(Active|Inactive)/i)?.[1];
  const roc = text.match(/ROC\s+([A-Za-z\s-]+?)\s+Registration/i)?.[1]?.trim();
  const registrationNumber = text.match(/Registration no\.?\s*(\d+)/i)?.[1];
  const incorporated =
    text.match(/Incorporated\s+([0-9a-zA-Z ,]+?)\s+ROC/i)?.[1]?.trim() ?? jsonFounding;
  const address = text.match(/Registered office[^A-Za-z0-9]+([A-Za-z0-9 ,.\/-]{20,180})/i)?.[1]?.trim();
  const businessActivity = parseBusinessActivity(jsonDescription || text);
  const directors =
    jsonDirectors.length > 0 ? jsonDirectors : parseDirectorsFromText(jsonDescription || text);

  const metaDescription = extractMeta(html, "description");
  const description = metaDescription || jsonDescription || undefined;
  const capital = parseCapitalFromText(jsonDescription || text);

  return {
    name,
    slug,
    status: status ?? undefined,
    roc,
    registrationNumber,
    dateOfIncorporation: incorporated,
    registeredAddress: address,
    description,
    businessActivity: businessActivity ?? undefined,
    authorizedCapitalInr: capital.authorizedCapitalInr ?? undefined,
    paidUpCapitalInr: capital.paidUpCapitalInr ?? undefined,
    directors,
    relatedLinks: [
      {
        label: `QorpIQ - ${name}`,
        url: slug
          ? `https://qorpiq.com/company/${slug}/${cin}`
          : `https://qorpiq.com/company/${cin}`,
        type: "source",
      },
    ],
    sources: ["QorpIQ"],
  };
}

function parseIndiaFilingsPage(html: string, cin: string): Partial<RegistryCompanyData> | null {
  const ogTitle = extractMeta(html, "og:title");
  const name =
    ogTitle?.split("|")[0]?.trim() ??
    extractMeta(html, "description")?.match(/company details of ([^.]+)/i)?.[1]?.trim();
  if (!name) return null;

  const slug = html.match(new RegExp(`/search/([a-z0-9-]+)-cin-${cin}`, "i"))?.[1];
  const emails = extractCompanyEmails(html);
  const statusMatch = html.match(/Company Status[^A-Za-z]*(Active|Inactive)/i);
  const incorporation = html.match(/Date of Incorporation[^0-9]*(\d{2}-\d{2}-\d{4})/i)?.[1];
  const address = html.match(/Registered Address[^A-Za-z0-9]+([^<|]{20,180})/i)?.[1]?.trim();
  const capital = parseCapitalFromText(htmlToText(html));

  const directors: Director[] = [];
  const directorMatches = html.matchAll(
    /(\d{8})\s*\|\s*([A-Z][A-Z\s]+)\s*\|\s*(\d{2}-\d{2}-\d{4})/g
  );
  for (const match of directorMatches) {
    directors.push({
      din: match[1],
      name: match[2].trim(),
      designation: "Director",
      appointmentDate: match[3],
      cessationDate: null,
      status: "Current",
    });
  }

  return {
    name,
    slug,
    status: statusMatch?.[1],
    dateOfIncorporation: incorporation,
    registeredAddress: address,
    email: emails[0],
    description: extractMeta(html, "description") ?? undefined,
    authorizedCapitalInr: capital.authorizedCapitalInr ?? undefined,
    paidUpCapitalInr: capital.paidUpCapitalInr ?? undefined,
    directors,
    relatedLinks: slug
      ? [
          {
            label: `IndiaFilings - ${name}`,
            url: `https://www.indiafilings.com/search/${slug}-cin-${cin}`,
            type: "source",
          },
        ]
      : [],
    sources: ["IndiaFilings"],
  };
}

function mergeRegistryData(
  cin: string,
  parts: Array<Partial<RegistryCompanyData> | null>
): RegistryCompanyData | null {
  const valid = parts.filter(Boolean) as Partial<RegistryCompanyData>[];
  if (valid.length === 0) return null;

  const merged: RegistryCompanyData = {
    name: "",
    directors: [],
    connectedCompanies: [],
    relatedLinks: [],
    sources: [],
  };

  for (const part of valid) {
    if (!merged.name && part.name) merged.name = part.name;
    if (!merged.slug && part.slug) merged.slug = part.slug;
    if (!merged.status && part.status) merged.status = part.status;
    if (!merged.type && part.type) merged.type = part.type;
    if (!merged.roc && part.roc) merged.roc = part.roc;
    if (!merged.registrationNumber && part.registrationNumber) {
      merged.registrationNumber = part.registrationNumber;
    }
    if (!merged.dateOfIncorporation && part.dateOfIncorporation) {
      merged.dateOfIncorporation = part.dateOfIncorporation;
    }
    if (!merged.registeredAddress && part.registeredAddress) {
      merged.registeredAddress = part.registeredAddress;
    }
    if (!merged.email && part.email) merged.email = part.email;
    if (!merged.listingStatus && part.listingStatus) merged.listingStatus = part.listingStatus;
    if (!merged.description && part.description) merged.description = part.description;
    if (!merged.businessActivity && part.businessActivity) merged.businessActivity = part.businessActivity;
    if (!merged.authorizedCapitalInr && part.authorizedCapitalInr) {
      merged.authorizedCapitalInr = part.authorizedCapitalInr;
    }
    if (!merged.paidUpCapitalInr && part.paidUpCapitalInr) {
      merged.paidUpCapitalInr = part.paidUpCapitalInr;
    }
    if (!merged.lastAgmDate && part.lastAgmDate) merged.lastAgmDate = part.lastAgmDate;
    if (!merged.chargesSummary && part.chargesSummary) merged.chargesSummary = part.chargesSummary;
    if (!merged.connectedCompanies?.length && part.connectedCompanies?.length) {
      merged.connectedCompanies = part.connectedCompanies;
    }
    if (part.directors?.length) {
      for (const director of part.directors) {
        const existing = merged.directors.find(
          (d) =>
            (d.din && director.din && d.din === director.din) ||
            d.name.toLowerCase() === director.name.toLowerCase()
        );
        if (!existing) {
          merged.directors.push(director);
        } else if (!existing.din && director.din) {
          existing.din = director.din;
          if (director.designation) existing.designation = director.designation;
          if (director.appointmentDate) existing.appointmentDate = director.appointmentDate;
        }
      }
    }
    if (part.relatedLinks?.length) merged.relatedLinks.push(...part.relatedLinks);
    if (part.sources?.length) merged.sources.push(...part.sources);
  }

  if (!merged.name) return null;

  if (merged.slug) {
    merged.relatedLinks.push({
      label: `Infyner - ${merged.name}`,
      url: `https://www.infyner.com/company/${merged.slug}/${cin}`,
      type: "source",
    });
    merged.relatedLinks.push({
      label: `TheCompanyCheck - ${merged.name}`,
      url: `https://www.thecompanycheck.com/company/${merged.slug}/${cin}`,
      type: "source",
    });
  }

  merged.relatedLinks = merged.relatedLinks.filter(
    (link, index, arr) => arr.findIndex((item) => item.url === link.url) === index
  );
  merged.sources = [...new Set(merged.sources)];
  merged.directors = merged.directors.filter(
    (director, index, arr) =>
      arr.findIndex((item) => item.din === director.din || item.name === director.name) === index
  );

  return merged;
}

export async function fetchRegistryByCin(cin: string): Promise<RegistryCompanyData | null> {
  const normalizedCin = cin.toUpperCase().trim();

  const [qorpiqHtml, toflerHtml] = await Promise.all([
    fetchHtml(`https://qorpiq.com/company/${normalizedCin}`),
    fetchHtml(`https://www.tofler.in/company/${normalizedCin}`),
  ]);

  const qorpiqData = qorpiqHtml ? parseQorpiqPage(qorpiqHtml, normalizedCin) : null;
  const qorpiqEmbedded = qorpiqHtml ? parseQorpiqEmbeddedProfile(qorpiqHtml) : null;
  const toflerData = toflerHtml ? parseToflerPage(toflerHtml, normalizedCin) : null;

  let indiaFilingsData: Partial<RegistryCompanyData> | null = null;
  const slug =
    qorpiqData?.slug ??
    toflerData?.slug ??
    qorpiqHtml?.match(new RegExp(`/company/([a-z0-9-]+)/${normalizedCin}`, "i"))?.[1];
  if (slug) {
    const indiaFilingsHtml = await fetchHtml(
      `https://www.indiafilings.com/search/${slug}-cin-${normalizedCin}`
    );
    if (indiaFilingsHtml) {
      indiaFilingsData = parseIndiaFilingsPage(indiaFilingsHtml, normalizedCin);
    }
  }

  return mergeRegistryData(normalizedCin, [
    qorpiqEmbedded,
    qorpiqData,
    toflerData,
    indiaFilingsData,
  ]);
}
