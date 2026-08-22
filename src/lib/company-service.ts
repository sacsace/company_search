import { parseCin } from "./cin-parser";
import { enrichFromWeb, extractShareholdersFromText, isRegistryBoilerplate } from "./enricher";
import { searchCompaniesByName } from "./mca-data";
import { isReadableLatinText } from "./text-utils";
import { fetchRegistryByCin } from "./registry-scraper";
import { generateCompanySummary } from "./summary";
import type { CompanyProfile, CompanySearchResult, Director, WebEnrichment } from "./types";
import { searchCompaniesByWeb } from "./web-search";

function hasDataGovApiKey(): boolean {
  const key = process.env.DATA_GOV_API_KEY;
  return !!key && key !== "REPLACE_WITH_DATA_GOV_KEY";
}

function applyWebFields(
  baseData: {
    name: string;
    status: string;
    type: string;
    listingStatus: string;
    dateOfIncorporation: string;
    industry: string;
    email: string | null;
    registeredOffice: { address: string; city: string; state: string; pincode: string };
  },
  registry: Awaited<ReturnType<typeof fetchRegistryByCin>>,
  web: WebEnrichment
) {
  if (registry?.name && !baseData.name) baseData.name = registry.name;
  if (registry?.status && baseData.status === "Unknown") baseData.status = registry.status;
  if (registry?.type && !baseData.type) baseData.type = registry.type;
  if (registry?.dateOfIncorporation && !baseData.dateOfIncorporation) {
    baseData.dateOfIncorporation = registry.dateOfIncorporation;
  }
  if (registry?.listingStatus) baseData.listingStatus = registry.listingStatus;
  if (web.industry && !baseData.industry) baseData.industry = web.industry;
  if (web.email && !baseData.email) baseData.email = web.email;
  if (web.address && !baseData.registeredOffice.address) {
    baseData.registeredOffice.address = web.address;
  }
}

export async function buildCompanyProfile(cin: string): Promise<CompanyProfile> {
  const normalizedCin = cin.toUpperCase().trim();
  const cinParsed = parseCin(normalizedCin);
  const dataSources: string[] = ["CIN Parser"];

  let baseData = {
    cin: normalizedCin,
    name: "",
    status: "Unknown",
    type: cinParsed?.companyType ?? "",
    category: "",
    subCategory: "",
    listingStatus: cinParsed?.listingStatus ?? "Unlisted",
    dateOfIncorporation: cinParsed ? String(cinParsed.yearOfIncorporation) : "",
    ageYears: cinParsed ? new Date().getFullYear() - cinParsed.yearOfIncorporation : 0,
    roc: "",
    state: cinParsed?.stateName ?? "",
    registeredOffice: { address: "", city: "", state: cinParsed?.stateName ?? "", pincode: "" },
    authorizedCapitalInr: 0,
    paidUpCapitalInr: 0,
    lastAgmDate: null as string | null,
    lastBalanceSheetDate: null as string | null,
    email: null as string | null,
    nicCode: cinParsed?.industryCode ?? "",
    industry: cinParsed?.industryDescription ?? "",
  };

  const [webLookup, registryData] = await Promise.all([
    searchCompaniesByWeb(normalizedCin, 5),
    fetchRegistryByCin(normalizedCin),
  ]);

  const webMatch = webLookup.results.find((r) => r.cin === normalizedCin);
  if (webMatch?.name && !webMatch.name.startsWith("Company (")) {
    baseData.name = webMatch.name;
    if (webMatch.status && webMatch.status !== "Unknown") baseData.status = webMatch.status;
    if (webMatch.type) baseData.type = webMatch.type;
    if (webMatch.dateOfIncorporation) baseData.dateOfIncorporation = webMatch.dateOfIncorporation;
    if (webMatch.registeredOffice) baseData.registeredOffice.address = webMatch.registeredOffice;
    dataSources.push(webLookup.source || "Web Search");
  }

  if (registryData) {
    if (!baseData.name) baseData.name = registryData.name;
    if (registryData.status && baseData.status === "Unknown") baseData.status = registryData.status;
    if (registryData.type && !baseData.type) baseData.type = registryData.type;
    if (registryData.roc) baseData.roc = registryData.roc;
    if (registryData.dateOfIncorporation) {
      baseData.dateOfIncorporation = registryData.dateOfIncorporation;
    }
    if (registryData.email) baseData.email = registryData.email;
    if (registryData.registeredAddress) baseData.registeredOffice.address = registryData.registeredAddress;
    dataSources.push(...registryData.sources);
  }

  const searchName = baseData.name || registryData?.name || normalizedCin;
  const webEnrichment = await enrichFromWeb(
    searchName,
    normalizedCin,
    registryData?.relatedLinks ?? [],
    registryData?.description ?? null,
    registryData?.businessActivity ?? null,
    registryData?.email ?? baseData.email
  );

  if (registryData?.description) {
    if (!webEnrichment.description) webEnrichment.description = registryData.description;
    if (
      !webEnrichment.businessDescription &&
      !isRegistryBoilerplate(registryData.description) &&
      isReadableLatinText(registryData.description)
    ) {
      webEnrichment.businessDescription = registryData.description;
    }
    if (webEnrichment.rawSnippets.length === 0) {
      webEnrichment.rawSnippets.unshift({
        text: registryData.description,
        source: "웹 레지스트리 요약",
        url: registryData.relatedLinks[0]?.url ?? "",
      });
    }
  }

  if (!webEnrichment.foundedDate) {
    webEnrichment.foundedDate =
      baseData.dateOfIncorporation ||
      registryData?.dateOfIncorporation ||
      (cinParsed ? String(cinParsed.yearOfIncorporation) : null);
  }

  if (!webEnrichment.businessDescription && cinParsed?.industryDescription) {
    webEnrichment.businessDescription = `${searchName} — ${cinParsed.industryDescription} (NIC ${cinParsed.industryCode})`;
  }

  if (registryData?.businessActivity) {
    baseData.industry = registryData.businessActivity;
  }

  applyWebFields(baseData, registryData, webEnrichment);

  const directors: Director[] = [...(registryData?.directors ?? [])];
  for (const director of webEnrichment.discoveredDirectors ?? []) {
    const exists = directors.some(
      (d) =>
        (d.din && director.din && d.din === director.din) ||
        d.name.toLowerCase() === director.name.toLowerCase()
    );
    if (!exists) directors.push(director);
  }
  if (webEnrichment.sources.length > 0) {
    dataSources.push(...webEnrichment.sources);
  }

  const webText = [
    webEnrichment.description,
    webEnrichment.rawSnippets.map((s) => s.text).join(" "),
    webEnrichment.products.join(" "),
    webEnrichment.services.join(" "),
  ].join(" ");

  const shareholders = baseData.name
    ? extractShareholdersFromText(`${webText} ${baseData.name}`, baseData.name)
    : [];

  const profile: CompanyProfile = {
    ...baseData,
    cinParsed: cinParsed ?? {
      listingStatus: baseData.listingStatus,
      industryCode: baseData.nicCode,
      industryDescription: baseData.industry,
      stateCode: normalizedCin.substring(6, 8),
      stateName: baseData.state,
      yearOfIncorporation: parseInt(baseData.dateOfIncorporation.substring(0, 4), 10) || 0,
      companyType: baseData.type,
      registrationNumber: normalizedCin.substring(15, 21),
    },
    directors,
    shareholders,
    webEnrichment,
    summary: "",
    dataSources: [...new Set(dataSources)],
  };

  profile.summary = generateCompanySummary(profile);
  return profile;
}

export async function searchIndianCompanies(
  query: string,
  limit = 20
): Promise<{ results: CompanySearchResult[]; source: string; message?: string }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], source: "none", message: "검색어를 입력해주세요." };
  }

  const cinPattern = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/i;
  if (cinPattern.test(trimmed)) {
    try {
      const profile = await buildCompanyProfile(trimmed.toUpperCase());
      return {
        results: [
          {
            cin: profile.cin,
            name: profile.name || `CIN: ${profile.cin}`,
            status: profile.status,
            type: profile.type,
            state: profile.cinParsed.stateName,
            dateOfIncorporation: profile.dateOfIncorporation,
            registeredOffice: profile.registeredOffice.address,
            listingStatus: profile.listingStatus,
          },
        ],
        source: profile.dataSources.join(", ") || "Web Search",
      };
    } catch {
      const parsed = parseCin(trimmed.toUpperCase());
      if (parsed) {
        return {
          results: [
            {
              cin: trimmed.toUpperCase(),
              name: `CIN: ${trimmed.toUpperCase()}`,
              status: "Unknown",
              type: parsed.companyType,
              state: parsed.stateName,
              dateOfIncorporation: String(parsed.yearOfIncorporation),
              registeredOffice: "",
              listingStatus: parsed.listingStatus,
            },
          ],
          source: "CIN Parser",
        };
      }
    }
  }

  if (hasDataGovApiKey()) {
    try {
      const { results, source } = await searchCompaniesByName(trimmed, limit);
      if (results.length > 0) {
        return { results, source };
      }
    } catch (err) {
      if ((err as Error).message === "DATA_GOV_API_KEY_REQUIRED") {
        // fall through to web search
      } else {
        console.error("data.gov.in search error:", err);
      }
    }
  }

  const { results: webResults, source: webSource } = await searchCompaniesByWeb(trimmed, limit);
  if (webResults.length > 0) {
    return { results: webResults, source: webSource };
  }

  return {
    results: [],
    source: "none",
    message: "검색 결과가 없습니다. 회사명을 정확히 입력하거나 CIN 번호로 검색해보세요.",
  };
}

const CIN_PATTERN = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/i;

export async function resolveCompanyFromQuery(query: string): Promise<CompanyProfile | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (CIN_PATTERN.test(trimmed)) {
    return buildCompanyProfile(trimmed.toUpperCase());
  }

  const { results } = await searchIndianCompanies(trimmed, 1);
  if (results.length === 0) return null;

  return buildCompanyProfile(results[0].cin);
}
