import type { CinInfo } from "./types";

const STATE_CODES: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OR: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

const NIC_CODES: Record<string, string> = {
  "01": "Agriculture, hunting and related service activities",
  "02": "Forestry, logging and related service activities",
  "10": "Mining of coal and lignite",
  "15": "Manufacture of food products and beverages",
  "17": "Manufacture of textiles",
  "22": "Publishing, printing and reproduction of recorded media",
  "24": "Manufacture of chemicals and chemical products",
  "25": "Manufacture of rubber and plastics products",
  "26": "Manufacture of other non-metallic mineral products",
  "28": "Manufacture of machinery and equipment",
  "29": "Manufacture of motor vehicles, trailers and semi-trailers",
  "30": "Manufacture of other transport equipment",
  "31": "Manufacture of furniture",
  "32": "Other manufacturing",
  "33": "Manufacture of medical, precision and optical instruments",
  "35": "Electricity, gas, steam and hot water supply",
  "36": "Collection, purification and distribution of water",
  "40": "Construction",
  "45": "Wholesale and retail trade",
  "50": "Sale, maintenance and repair of motor vehicles",
  "51": "Wholesale trade and commission trade",
  "52": "Retail trade",
  "55": "Hotels and restaurants",
  "60": "Land transport",
  "62": "Air transport",
  "63": "Supporting and auxiliary transport activities",
  "64": "Financial intermediation",
  "65": "Insurance and pension funding",
  "66": "Activities auxiliary to financial intermediation",
  "67": "Activities auxiliary to financial intermediation and insurance",
  "70": "Real estate activities",
  "71": "Renting of machinery and equipment",
  "72": "Computer and related activities",
  "73": "Research and development",
  "74": "Other business activities",
  "80": "Education",
  "85": "Health and social work",
  "90": "Sewage and refuse disposal, sanitation",
  "91": "Activities of membership organizations",
  "92": "Recreational, cultural and sporting activities",
  "93": "Other service activities",
};

const COMPANY_TYPE_CODES: Record<string, string> = {
  PLC: "Public Limited Company",
  PTC: "Private Limited Company",
  OPC: "One Person Company",
  GAP: "General Association Public",
  GAT: "General Association Private",
  GOI: "Government of India Company",
  NPL: "Not-for-Profit License Company",
  ULL: "Unlimited Liability Company",
  FLL: "Foreign Limited Liability Partnership",
  FLLP: "Foreign LLP",
  LLP: "Limited Liability Partnership",
};

export function isValidCin(cin: string): boolean {
  return /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(cin.toUpperCase());
}

export function parseCin(cin: string): CinInfo | null {
  const normalized = cin.toUpperCase().trim();
  if (!isValidCin(normalized)) return null;

  const listingCode = normalized[0];
  const industryCode = normalized.substring(1, 6);
  const stateCode = normalized.substring(6, 8);
  const year = parseInt(normalized.substring(8, 12), 10);
  const companyTypeCode = normalized.substring(12, 15);
  const registrationNumber = normalized.substring(15, 21);

  const nicPrefix = industryCode.substring(0, 2);
  const industryDescription =
    NIC_CODES[nicPrefix] ?? `NIC Code ${industryCode}`;

  return {
    listingStatus: listingCode === "L" ? "Listed" : "Unlisted",
    industryCode,
    industryDescription,
    stateCode,
    stateName: STATE_CODES[stateCode] ?? stateCode,
    yearOfIncorporation: year,
    companyType: COMPANY_TYPE_CODES[companyTypeCode] ?? companyTypeCode,
    registrationNumber,
  };
}

export function formatInr(amount: number): string {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
