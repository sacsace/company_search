import { parseCin } from "./cin-parser";
import { enrichFromWeb, extractShareholdersFromText } from "./enricher";
import {
  getCompanyByCin,
  parseRawRecord,
  searchCompaniesByName,
  searchDirectorDataset,
} from "./mca-data";
import { generateCompanySummary } from "./summary";
import type { CompanyProfile, CompanySearchResult, Director } from "./types";

function mapDirectors(records: Record<string, string | number | null | undefined>[]): Director[] {
  return records.map((r) => {
    const cessation = String(r.DATE_OF_CESSATION ?? r.DATEOFCESSATION ?? r.CESSATION_DATE ?? "");
    return {
      din: String(r.DIN ?? r.DIN_PAN ?? ""),
      name: String(r.DIRECTOR_NAME ?? r.DIRECTORNAME ?? r.NAME ?? ""),
      designation: String(r.DESIGNATION ?? "Director"),
      appointmentDate: String(r.DATE_OF_APPOINTMENT ?? r.DATEOFAPPOINTMENT ?? ""),
      cessationDate: cessation || null,
      status: cessation ? "Resigned" : "Current",
    };
  });
}

export async function buildCompanyProfile(cin: string): Promise<CompanyProfile> {
  const normalizedCin = cin.toUpperCase().trim();
  const cinParsed = parseCin(normalizedCin);
  const dataSources: string[] = [];

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

  try {
    const { record, source } = await getCompanyByCin(normalizedCin);
    if (record) {
      const parsed = parseRawRecord(record);
      baseData = { ...baseData, ...parsed };
      dataSources.push(source);
    }
  } catch (err) {
    if ((err as Error).message === "DATA_GOV_API_KEY_REQUIRED") {
      dataSources.push("CIN Parser (API 키 미설정)");
    }
  }

  if (!baseData.name && cinParsed) {
    dataSources.push("CIN Parser");
  }

  const directorRecords = await searchDirectorDataset(normalizedCin);
  let directors = mapDirectors(directorRecords);
  if (directors.length > 0) {
    dataSources.push("data.gov.in (Directors)");
  }

  let webEnrichment = {
    website: null as string | null,
    revenue: null as string | null,
    revenueYear: null as string | null,
    description: null as string | null,
    industry: null as string | null,
    employees: null as string | null,
    sources: [] as string[],
  };

  if (baseData.name) {
    webEnrichment = await enrichFromWeb(baseData.name, normalizedCin);
    if (webEnrichment.sources.length > 0) {
      dataSources.push(...webEnrichment.sources);
    }
  }

  const shareholders = baseData.name
    ? extractShareholdersFromText(
        `${webEnrichment.description ?? ""} ${baseData.name}`,
        baseData.name
      )
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

  if (!profile.industry && webEnrichment.industry) {
    profile.industry = webEnrichment.industry;
  }

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
        source: profile.dataSources.join(", ") || "CIN Lookup",
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

  try {
    const { results, source } = await searchCompaniesByName(trimmed, limit);
    return { results, source };
  } catch (err) {
    const message = (err as Error).message;
    if (message === "DATA_GOV_API_KEY_REQUIRED") {
      return {
        results: [],
        source: "none",
        message:
          "data.gov.in API 키가 필요합니다. .env.local 파일에 DATA_GOV_API_KEY를 설정하세요. (https://data.gov.in 에서 무료 발급)",
      };
    }
    if (message === "API_KEY_INVALID") {
      return {
        results: [],
        source: "none",
        message: "API 키가 유효하지 않습니다. DATA_GOV_API_KEY를 확인해주세요.",
      };
    }
    if (message === "RATE_LIMITED") {
      return {
        results: [],
        source: "none",
        message: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
      };
    }
    throw err;
  }
}
