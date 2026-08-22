import type { CompanySearchResult } from "./types";

const DATA_GOV_BASE = "https://api.data.gov.in/resource";
const DATA_GOV_RESOURCE_ID = "5c6c25f7-9a5c-4c49-a4ef-2d26a3ea8e27";

type RawRecord = Record<string, string | number | null | undefined>;

const PLACEHOLDER_API_KEYS = new Set([
  "REPLACE_WITH_DATA_GOV_KEY",
  "your_api_key_here",
  "YOUR_API_KEY_HERE",
]);

function getApiKey(): string | undefined {
  return process.env.DATA_GOV_API_KEY?.trim();
}

export function isConfiguredDataGovApiKey(): boolean {
  const key = getApiKey();
  if (!key) return false;
  if (PLACEHOLDER_API_KEYS.has(key)) return false;
  return key.length >= 8;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\s]/g, "");
}

function getField(record: RawRecord, ...candidates: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(record).map(([k, v]) => [normalizeKey(k), v])
  );

  for (const candidate of candidates) {
    const value = normalized[normalizeKey(candidate)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function convertDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.substring(0, 10);
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return dateStr;
}

function mapRecord(record: RawRecord): CompanySearchResult {
  const cin = getField(record, "CIN", "CORPORATE_IDENTIFICATION_NUMBER", "CORPORATEIDENTIFICATIONNUMBER");
  const name = getField(record, "COMPANY_NAME", "COMPANYNAME");
  const address = getField(record, "REGISTERED_ADDRESS", "REGISTEREDADDRESS", "ADDRESS", "REGISTERED_OFFICE_ADDRESS");
  const listing = getField(record, "LISTING_STATUS", "LISTINGSTATUS");

  return {
    cin,
    name,
    status: getField(record, "COMPANY_STATUS", "COMPANYSTATUS", "STATUS"),
    type: getField(record, "COMPANY_TYPE", "COMPANYTYPE", "COMPANY_CLASS", "COMPANYCLASS", "CLASS_OF_COMPANY"),
    state: getField(record, "STATE", "STATE_CODE", "REGISTERED_STATE"),
    dateOfIncorporation: convertDate(getField(record, "DATE_OF_INCORPORATION", "DATEOFINCORPORATION", "DATE_OF_REGISTRATION", "DATEOFREGISTRATION", "REGISTRATION_DATE")),
    registeredOffice: address,
    listingStatus: listing || (cin.startsWith("L") ? "Listed" : "Unlisted"),
  };
}

async function fetchDataGov(params: Record<string, string | number>): Promise<RawRecord[]> {
  if (!isConfiguredDataGovApiKey()) {
    throw new Error("DATA_GOV_API_KEY_REQUIRED");
  }

  const apiKey = getApiKey()!;

  const url = new URL(`${DATA_GOV_BASE}/${DATA_GOV_RESOURCE_ID}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (res.status === 403) throw new Error("API_KEY_INVALID");
    throw new Error(`DATA_GOV_ERROR_${res.status}`);
  }

  const data = await res.json();
  return (data.records ?? data.data ?? []) as RawRecord[];
}

export async function searchCompaniesByName(
  query: string,
  limit = 20
): Promise<{ results: CompanySearchResult[]; source: string }> {
  if (!isConfiguredDataGovApiKey()) {
    return { results: [], source: "none" };
  }

  const normalizedQuery = query.trim().toUpperCase();

  try {
    const exactRecords = await fetchDataGov({
      "filters[COMPANY_NAME]": normalizedQuery,
      limit,
    });
    if (exactRecords.length > 0) {
      return { results: exactRecords.map(mapRecord), source: "data.gov.in" };
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message === "DATA_GOV_API_KEY_REQUIRED" || message === "API_KEY_INVALID") {
      return { results: [], source: "none" };
    }
  }

  const results: CompanySearchResult[] = [];
  const queryLower = query.toLowerCase();
  const maxPages = 15;
  const pageSize = 100;

  try {
    for (let page = 0; page < maxPages && results.length < limit; page++) {
      const records = await fetchDataGov({
        offset: page * pageSize,
        limit: pageSize,
      });

      if (records.length === 0) break;

      for (const record of records) {
        const mapped = mapRecord(record);
        if (
          mapped.name.toLowerCase().includes(queryLower) ||
          mapped.cin.toLowerCase().includes(queryLower)
        ) {
          if (!results.some((r) => r.cin === mapped.cin)) {
            results.push(mapped);
          }
        }
        if (results.length >= limit) break;
      }

      if (records.length < pageSize) break;
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message === "DATA_GOV_API_KEY_REQUIRED" || message === "API_KEY_INVALID") {
      return { results: [], source: "none" };
    }
    throw err;
  }

  return { results, source: "data.gov.in" };
}

export async function getCompanyByCin(cin: string): Promise<{ record: RawRecord | null; source: string }> {
  const normalizedCin = cin.toUpperCase().trim();

  const records = await fetchDataGov({
    "filters[CIN]": normalizedCin,
    limit: 1,
  });

  if (records.length > 0) {
    return { record: records[0], source: "data.gov.in" };
  }

  const recordsAlt = await fetchDataGov({
    "filters[CORPORATE_IDENTIFICATION_NUMBER]": normalizedCin,
    limit: 1,
  });

  return {
    record: recordsAlt[0] ?? null,
    source: "data.gov.in",
  };
}

export function parseRawRecord(record: RawRecord) {
  const cin = getField(record, "CIN", "CORPORATE_IDENTIFICATION_NUMBER");
  const address = getField(record, "REGISTERED_ADDRESS", "REGISTEREDADDRESS", "ADDRESS");
  const pincodeMatch = address.match(/\b(\d{6})\b/);

  const incDate = convertDate(getField(record, "DATE_OF_INCORPORATION", "DATEOFINCORPORATION", "DATE_OF_REGISTRATION"));
  const incYear = incDate ? parseInt(incDate.substring(0, 4), 10) : 0;

  return {
    cin,
    name: getField(record, "COMPANY_NAME", "COMPANYNAME"),
    status: getField(record, "COMPANY_STATUS", "COMPANYSTATUS", "STATUS"),
    type: getField(record, "COMPANY_TYPE", "COMPANYTYPE", "COMPANY_CLASS", "CLASS_OF_COMPANY"),
    category: getField(record, "COMPANY_CATEGORY", "COMPANYCATEGORY", "CATEGORY"),
    subCategory: getField(record, "COMPANY_SUB_CATEGORY", "COMPANYSUBCATEGORY", "SUB_CATEGORY", "SUBCATEGORY"),
    listingStatus: getField(record, "LISTING_STATUS", "LISTINGSTATUS") || (cin.startsWith("L") ? "Listed" : "Unlisted"),
    dateOfIncorporation: incDate,
    ageYears: incYear ? new Date().getFullYear() - incYear : 0,
    roc: getField(record, "REGISTRAR_OF_COMPANIES", "REGISTRAROFCOMPANIES", "ROC_CODE", "ROCCODE"),
    state: getField(record, "STATE", "STATE_CODE", "REGISTERED_STATE"),
    registeredOffice: {
      address,
      city: "",
      state: getField(record, "STATE", "STATE_CODE"),
      pincode: pincodeMatch?.[1] ?? "",
    },
    authorizedCapitalInr: parseInt(getField(record, "AUTHORISED_CAP", "AUTHORIZED_CAPITAL", "AUTHORISEDCAP", "AUTHORIZEDCAPITAL") || "0", 10) || 0,
    paidUpCapitalInr: parseInt(getField(record, "PAIDUP_CAPITAL", "PAIDUPCAPITAL", "PAID_UP_CAPITAL") || "0", 10) || 0,
    lastAgmDate: convertDate(getField(record, "DATE_OF_LAST_AGM", "DATEOFLASTAGM")) || null,
    lastBalanceSheetDate: convertDate(getField(record, "DATE_OF_BALANCE_SHEET", "DATEOFBALANCESHEET")) || null,
    email: getField(record, "EMAIL") || null,
    nicCode: getField(record, "NIC_CODE", "NICCODE", "INDUSTRIAL_CLASSIFICATION_CODE"),
    industry: getField(record, "INDUSTRIAL_CLASSIFICATION", "INDUSTRIALCLASSIFICATION", "INDUSTRY"),
  };
}

export async function searchDirectorDataset(cin: string): Promise<RawRecord[]> {
  const directorResourceId = process.env.DIRECTOR_DATA_GOV_RESOURCE_ID;
  if (!directorResourceId || !getApiKey()) return [];

  try {
    const url = new URL(`${DATA_GOV_BASE}/${directorResourceId}`);
    url.searchParams.set("api-key", getApiKey()!);
    url.searchParams.set("format", "json");
    url.searchParams.set("filters[CIN]", cin.toUpperCase());
    url.searchParams.set("limit", "50");

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.records ?? []) as RawRecord[];
  } catch {
    return [];
  }
}
