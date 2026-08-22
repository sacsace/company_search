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
  discoveredDirectors: Director[];
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
  nicCode: string;
  industry: string;
  cinParsed: CinInfo;
  directors: Director[];
  shareholders: Shareholder[];
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
