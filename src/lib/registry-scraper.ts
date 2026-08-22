import type { Director, WebLink } from "./types";
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
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;
  const amount = parseInt(normalized, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseCapitalFromText(text: string): {
  authorizedCapitalInr: number | null;
  paidUpCapitalInr: number | null;
} {
  const authorizedMatch = text.match(
    /(?:authorised|authorized)\s+capital(?:\s+is)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i
  );
  const paidUpMatch = text.match(
    /(?:paid[\s-]*up|paidup)\s+capital(?:\s+is)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i
  );

  return {
    authorizedCapitalInr: parseCapitalAmount(authorizedMatch?.[1] ?? null),
    paidUpCapitalInr: parseCapitalAmount(paidUpMatch?.[1] ?? null),
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
  const qorpiqHtml = await fetchHtml(`https://qorpiq.com/company/${normalizedCin}`);
  const qorpiqData = qorpiqHtml ? parseQorpiqPage(qorpiqHtml, normalizedCin) : null;
  const qorpiqEmbedded = qorpiqHtml ? parseQorpiqEmbeddedProfile(qorpiqHtml) : null;

  let indiaFilingsData: Partial<RegistryCompanyData> | null = null;
  const slug =
    qorpiqData?.slug ??
    qorpiqHtml?.match(new RegExp(`/company/([a-z0-9-]+)/${normalizedCin}`, "i"))?.[1];
  if (slug) {
    const indiaFilingsHtml = await fetchHtml(
      `https://www.indiafilings.com/search/${slug}-cin-${normalizedCin}`
    );
    if (indiaFilingsHtml) {
      indiaFilingsData = parseIndiaFilingsPage(indiaFilingsHtml, normalizedCin);
    }
  }

  return mergeRegistryData(normalizedCin, [qorpiqEmbedded, qorpiqData, indiaFilingsData]);
}
