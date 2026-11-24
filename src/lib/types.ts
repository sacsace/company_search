export interface CompanySearchResult {
  cin: string;
  name: string;
  status: string;
  type: string;
  state: string;
  dateOfIncorporation: string;
  registeredOffice: string;
  listingStatus: string;
}

export interface Director {
  din: string;
  name: string;
  designation: string;
  appointmentDate: string;
  cessationDate: string | null;
  status: "Current" | "Resigned";
}

export interface Shareholder {
  name: string;
  holdingPercent: string | null;
  shares: string | null;
  source: string;
}

export type CompanyRelationType =
  | "common-director"
  | "equity"
  | "parent-subsidiary"
  | "trade"
  | "unknown";

export interface ConnectedCompany {
  name: string;
  cin: string;
  url: string | null;
  relationType: CompanyRelationType;
}

export interface WebLink {
  label: string;
  url: string;
  type: "website" | "social" | "source" | "document";
}

export interface WebInsight {
  key: string;
  value: string;
  source: string;
  sourceUrl?: string;
}

export interface WebSnippet {
  text: string;
  source: string;
  url: string;
}

export interface PublicComment {
  platform: string;
  author: string | null;
  text: string;
  date: string | null;
  url: string;
  rating: string | null;
}

export interface WebsiteReview {
  author: string | null;
  rating: string | null;
  text: string;
  source: string;
  url: string;
}

export interface EmployeeReview {
  platform: string;
  rating: number | null;
  title: string | null;
  jobProfile: string | null;
  location: string | null;
  department: string | null;
  likes: string | null;
  dislikes: string | null;
  workDetails: string | null;
  subRatings: { name: string; rating: number }[];
  date: string | null;
  url: string;
  helpfulCount: number | null;
}

export interface WebEnrichment {
  website: string | null;
  revenue: string | null;
  revenueYear: string | null;
  description: string | null;
  businessDescription: string | null;
  foundedDate: string | null;
  industry: string | null;
  employees: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  linkedInUrl: string | null;
  googleReviewsSummary: string | null;
  products: string[];
  services: string[];
  socialLinks: WebLink[];
  relatedLinks: WebLink[];
  insights: WebInsight[];
  sources: string[];
  rawSnippets: WebSnippet[];
  crawledPages: { url: string; title: string }[];
  snsComments: PublicComment[];
  websiteReviews: WebsiteReview[];
  employeeReviews: EmployeeReview[];
  ambitionBoxUrl: string | null;
  ambitionBoxRating: number | null;
  ambitionBoxReviewCount: number | null;
  googleMapsRating: number | null;
  googleMapsReviewCount: number | null;
  googleMapsUrl: string | null;
  glassdoorRating: number | null;
  glassdoorReviewCount: number | null;
  glassdoorUrl: string | null;
  glassdoorGoogleSearchUrl: string | null;
  glassdoorSnippets: string[];
  discoveredDirectors: Director[];
  newsItems: WebSnippet[];
  indiaOpsSnippets: WebSnippet[];
  relationSnippets: WebSnippet[];
  riskSnippets: WebSnippet[];
  creditRatingSnippets: WebSnippet[];
  customerSnippets: WebSnippet[];
  reviewSearchStatus: ReviewSearchStatus[];
  deepSearchNotes: string[];
}

export interface ReviewSearchStatus {
  platform: string;
  status: "found" | "not_found" | "blocked" | "error";
  detail: string | null;
}

export type FactConfidence = "confirmed" | "estimated" | "conflict" | "missing";
export type EntityScope = "india-entity" | "parent" | "group" | "shared-director" | "unknown";

export interface ReportSource {
  label: string;
  url: string;
  date: string | null;
}

export interface ReportFact {
  label: string;
  value: string;
  confidence: FactConfidence;
  entityScope: EntityScope;
  sources: ReportSource[];
  notes: string | null;
}

export interface ReportSection {
  id: string;
  title: string;
  facts: ReportFact[];
}

export interface ReportAssessment {
  strengths: string[];
  cautions: string[];
  deferred: string[];
  followUps: string[];
  evidenceLevel: "high" | "medium" | "low";
}

export interface DataFreshness {
  collectedAt: string;
  lastAgmDate: string | null;
  lastBalanceSheetDate: string | null;
  agmFreshness: "recent" | "aging" | "stale" | "unknown";
  notes: string[];
}

export interface CompanyReport {
  profile: CompanyProfile;
  generatedAt: string;
  headline: string[];
  assessment: ReportAssessment;
  freshness: DataFreshness;
  identity: {
    name: string;
    cin: string;
    website: string | null;
    status: string;
    type: string;
    listingStatus: string;
  };
  sections: ReportSection[];
  sources: ReportSource[];
  reviews: {
    ambitionBoxRating: number | null;
    ambitionBoxReviewCount: number | null;
    ambitionBoxUrl: string | null;
    googleMapsRating: number | null;
    googleMapsUrl: string | null;
    glassdoorRating: number | null;
    glassdoorUrl: string | null;
    employeeReviews: EmployeeReview[];
    websiteReviews: WebsiteReview[];
    glassdoorSnippets: string[];
    searchStatus: ReviewSearchStatus[];
  };
}

export interface CompanyProfile {
  cin: string;
  name: string;
  status: string;
  type: string;
  category: string;
  subCategory: string;
  listingStatus: string;
  dateOfIncorporation: string;
  ageYears: number;
  roc: string;
  state: string;
  registeredOffice: {
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  authorizedCapitalInr: number;
  paidUpCapitalInr: number;
  lastAgmDate: string | null;
  lastBalanceSheetDate: string | null;
  email: string | null;
  phone: string | null;
  chargesSummary: string | null;
  nicCode: string;
  industry: string;
  cinParsed: CinInfo;
  directors: Director[];
  shareholders: Shareholder[];
  connectedCompanies: ConnectedCompany[];
  webEnrichment: WebEnrichment;
  summary: string;
  dataSources: string[];
}

export interface CinInfo {
  listingStatus: string;
  industryCode: string;
  industryDescription: string;
  stateCode: string;
  stateName: string;
  yearOfIncorporation: number;
  companyType: string;
  registrationNumber: string;
}

export interface CompareResponse {
  companies: CompanyProfile[];
  comparisonSummary: string;
  comparedFields: ComparisonField[];
}

export interface ComparisonField {
  label: string;
  key: string;
  values: (string | number | null)[];
  highlight?: "max" | "min" | null;
}
