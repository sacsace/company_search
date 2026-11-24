import type {
  CompanyProfile,
  ReportFact,
  CompanyReport,
  ReportSection,
  ReportSource,
  ReportAssessment,
  DataFreshness,
  CompanyRelationType,
} from "./types";
import { isValidChargesSummary } from "./registry-scraper";

function uniqSources(items: ReportSource[]): ReportSource[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || item.label;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fact(
  label: string,
  value: string | null | undefined,
  opts: {
    confidence?: ReportFact["confidence"];
    entityScope?: ReportFact["entityScope"];
    sources?: ReportSource[];
    notes?: string | null;
  } = {}
): ReportFact {
  const cleaned = value?.toString().trim() || "";
  return {
    label,
    value: cleaned || "확인 불가",
    confidence: cleaned ? opts.confidence ?? "confirmed" : "missing",
    entityScope: opts.entityScope ?? "india-entity",
    sources: opts.sources ?? [],
    notes: opts.notes ?? null,
  };
}

function sourceFromProfile(profile: CompanyProfile, label: string, url?: string | null): ReportSource[] {
  if (url) return [{ label, url, date: null }];
  const match = profile.webEnrichment.relatedLinks.find((link) =>
    link.label.toLowerCase().includes(label.toLowerCase())
  );
  return match ? [{ label: match.label, url: match.url, date: null }] : [];
}

function relationLabel(type: CompanyRelationType | undefined): string {
  switch (type) {
    case "common-director":
      return "공통 이사";
    case "equity":
      return "지분 관계";
    case "parent-subsidiary":
      return "모·자회사";
    case "trade":
      return "거래 관계";
    default:
      return "관계 미확정";
  }
}

function textsConflict(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right || left === right) return false;
  const leftTokens = new Set(left.split(" ").filter((t) => t.length > 3));
  const rightTokens = right.split(" ").filter((t) => t.length > 3);
  const overlap = rightTokens.filter((t) => leftTokens.has(t)).length;
  return overlap < Math.min(2, rightTokens.length);
}

function parseYearFromDate(value: string | null | undefined): number | null {
  const match = value?.match(/(19|20)\d{2}/);
  return match ? parseInt(match[0], 10) : null;
}

function buildFreshness(profile: CompanyProfile, generatedAt: string): DataFreshness {
  const agmYear = parseYearFromDate(profile.lastAgmDate);
  const currentYear = new Date(generatedAt).getFullYear();
  let agmFreshness: DataFreshness["agmFreshness"] = "unknown";
  const notes: string[] = [];

  if (agmYear) {
    const age = currentYear - agmYear;
    if (age <= 1) agmFreshness = "recent";
    else if (age <= 3) agmFreshness = "aging";
    else agmFreshness = "stale";
    notes.push(
      `최근 AGM 자료 기준연도 ${agmYear} · 수집일 ${new Date(generatedAt).toLocaleDateString("ko-KR")} 기준 ${
        agmFreshness === "recent" ? "비교적 최신" : agmFreshness === "aging" ? "다소 오래됨" : "오래된 자료 가능성"
      }`
    );
  } else {
    notes.push("AGM 기준일을 확인하지 못함");
  }

  if (profile.lastBalanceSheetDate) {
    notes.push(`재무제표 기준일: ${profile.lastBalanceSheetDate}`);
  }

  return {
    collectedAt: generatedAt,
    lastAgmDate: profile.lastAgmDate,
    lastBalanceSheetDate: profile.lastBalanceSheetDate,
    agmFreshness,
    notes,
  };
}

function buildAssessment(profile: CompanyProfile): ReportAssessment {
  const web = profile.webEnrichment;
  const strengths: string[] = [];
  const cautions: string[] = [];
  const deferred: string[] = [];
  const followUps: string[] = [];

  if (web.website) strengths.push("공식 웹사이트가 확인됨");
  if (web.businessDescription) strengths.push("현재 영위 사업 설명이 공개 자료에서 확인됨");
  if (web.customerSnippets.length > 0) strengths.push("고객·프로젝트 관련 공개 언급이 있음");
  if (web.creditRatingSnippets.length > 0) strengths.push("신용평가·등급 관련 공개 자료 후보가 있음");
  if (profile.status === "Active") strengths.push("등기 상태가 Active로 확인됨");
  if (web.indiaOpsSnippets.length > 0) strengths.push("인도 사업·거점 관련 언급이 확인됨");

  const registryIndustry = profile.industry || profile.cinParsed.industryDescription;
  if (
    registryIndustry &&
    web.businessDescription &&
    textsConflict(registryIndustry, web.businessDescription)
  ) {
    cautions.push("등기 업종과 현재 영위 사업 설명이 서로 다름 — 분리해서 확인 필요");
  }
  if (web.riskSnippets.length > 0) {
    cautions.push("분쟁·제재 등 부정적 사건 언급이 있어 원문 확인이 필요함");
  }
  if (profile.connectedCompanies.length > 0) {
    cautions.push("이사 연결 기업은 공통 이사 관계이며 같은 그룹으로 단정할 수 없음");
  }
  if (web.employees) {
    cautions.push("직원 수는 외부 추정치일 수 있어 법인 귀속을 재확인해야 함");
  }

  if (!web.revenue) deferred.push("매출·재무 규모는 공개 자료에서 확인되지 않음");
  if (!web.employees) deferred.push("직원 수는 확인되지 않음");
  if (web.creditRatingSnippets.length === 0) deferred.push("CRISIL/ICRA 등 신용평가 보고서 미확인");
  if (web.employeeReviews.length === 0 && web.ambitionBoxRating === null && web.glassdoorRating === null) {
    deferred.push("직원 평가 원문은 확인되지 않음");
  }
  if (web.websiteReviews.length === 0 && web.googleMapsRating === null) {
    deferred.push("고객·사업장 평가는 확인되지 않음");
  }

  if (!web.revenue) followUps.push("연차보고서·재무공시·신용평가 보고서에서 매출 확인");
  if (web.creditRatingSnippets.length === 0) followUps.push("CRISIL/ICRA 기업·채무 평가 자료 검색");
  if (web.customerSnippets.length === 0) followUps.push("주요 고객·납품 사례 공개 자료 추가 조사");
  if (web.employeeReviews.length === 0) followUps.push("AmbitionBox/Glassdoor 등 직원 리뷰 재검색");
  followUps.push(...web.deepSearchNotes.slice(0, 3));

  const filledSignals = [
    web.website,
    web.businessDescription,
    web.revenue,
    web.employees,
    web.creditRatingSnippets[0],
    web.customerSnippets[0],
    profile.directors[0],
  ].filter(Boolean).length;

  return {
    strengths: strengths.slice(0, 5),
    cautions: cautions.slice(0, 5),
    deferred: deferred.slice(0, 5),
    followUps: [...new Set(followUps)].slice(0, 6),
    evidenceLevel: filledSignals >= 5 ? "high" : filledSignals >= 3 ? "medium" : "low",
  };
}

function buildHeadline(profile: CompanyProfile): string[] {
  const web = profile.webEnrichment;
  const name = profile.name || profile.cin;
  const lines: string[] = [];

  lines.push(
    `${name}은(는) ${profile.cinParsed.stateName || "인도"}에 등록된 ${profile.type || "기업"}입니다.`
  );

  if (web.businessDescription) {
    lines.push(`현재 영위 사업: ${web.businessDescription.replace(/\s+/g, " ").trim()}.`);
  }

  const registryIndustry = profile.industry || profile.cinParsed.industryDescription;
  if (registryIndustry) {
    lines.push(`등기·분류상 업종: ${registryIndustry}.`);
  }

  const products = [...web.products, ...web.services].slice(0, 3);
  if (products.length > 0) lines.push(`공개된 제품·서비스: ${products.join(" / ")}.`);

  const address = web.address || profile.registeredOffice.address;
  if (address) lines.push(`인도 등록 주소: ${address}.`);

  if (profile.connectedCompanies.length > 0) {
    lines.push(
      `공통 이사로 연결된 기업 ${profile.connectedCompanies.length}곳 (그룹 소속 여부는 미확정).`
    );
  }

  if (web.newsItems.length > 0) {
    lines.push(`최근 공개 동향: ${web.newsItems[0].text.slice(0, 140)}.`);
  }

  return lines.slice(0, 7);
}

export function buildCompanyReport(profile: CompanyProfile): CompanyReport {
  const web = profile.webEnrichment;
  const generatedAt = new Date().toISOString();
  const registrySources = uniqSources(
    profile.dataSources.map((label) => ({ label, url: "", date: null }))
  );
  const websiteSources = web.website
    ? [{ label: "공식 웹사이트", url: web.website, date: null as string | null }]
    : [];

  const registryIndustry = profile.industry || profile.cinParsed.industryDescription || null;
  const actualBusiness = web.businessDescription || web.description;
  const industryConflict =
    !!registryIndustry && !!actualBusiness && textsConflict(registryIndustry, actualBusiness);

  const overviewFacts: ReportFact[] = [
    fact("회사명", profile.name || profile.cin, {
      sources: registrySources,
      entityScope: "india-entity",
      confidence: profile.name ? "confirmed" : "estimated",
    }),
    fact("CIN", profile.cin, { sources: registrySources, confidence: "confirmed" }),
    fact("상태", profile.status !== "Unknown" ? profile.status : null, {
      sources: registrySources,
      confidence: profile.status !== "Unknown" ? "confirmed" : "missing",
    }),
    fact("본사·등록 위치", profile.registeredOffice.address || web.address, {
      sources: profile.registeredOffice.address ? registrySources : websiteSources,
      confidence: profile.registeredOffice.address ? "confirmed" : web.address ? "estimated" : "missing",
      notes:
        web.address &&
        profile.registeredOffice.address &&
        web.address !== profile.registeredOffice.address
          ? "웹 주소와 등기 주소가 다를 수 있음"
          : null,
    }),
    fact(
      "설립연도",
      profile.dateOfIncorporation ||
        (profile.cinParsed.yearOfIncorporation ? String(profile.cinParsed.yearOfIncorporation) : null),
      { sources: registrySources, confidence: "confirmed" }
    ),
    fact("등기 업종(분류)", registryIndustry, {
      sources: registrySources,
      confidence: registryIndustry ? "confirmed" : "missing",
      notes: "등기·NIC/디렉터리 분류이며 현재 영위 사업과 다를 수 있음",
    }),
    fact("현재 영위 사업", actualBusiness, {
      sources: websiteSources.length ? websiteSources : sourceFromProfile(profile, "business"),
      confidence: actualBusiness ? (websiteSources.length ? "confirmed" : "estimated") : "missing",
      notes: industryConflict
        ? "등기 업종과 불일치 — 두 정보를 분리해 확인"
        : actualBusiness
          ? "홈페이지·공개 소개 기반"
          : null,
    }),
    ...(industryConflict
      ? [
          fact("업종 불일치", `등기: ${registryIndustry}\n현재: ${actualBusiness}`, {
            confidence: "conflict",
            notes: "어느 쪽이 현재 사업인지 추가 확인 필요",
            sources: [...registrySources, ...websiteSources],
          }),
        ]
      : []),
  ];

  const productFacts: ReportFact[] = [
    fact(
      "제품",
      web.products.length ? web.products.slice(0, 8).map((item) => `· ${item}`).join("\n") : null,
      {
        sources: websiteSources,
        confidence: web.products.length ? "estimated" : "missing",
        notes: web.products.length ? "웹사이트·검색 결과 기반 요약" : null,
      }
    ),
    fact(
      "서비스",
      web.services.length ? web.services.slice(0, 8).map((item) => `· ${item}`).join("\n") : null,
      {
        sources: websiteSources,
        confidence: web.services.length ? "estimated" : "missing",
      }
    ),
    fact(
      "고객·실적 언급",
      web.customerSnippets.length
        ? web.customerSnippets
            .slice(0, 4)
            .map((item) => `· ${item.text.replace(/\s+/g, " ").trim()}`)
            .join("\n")
        : null,
      {
        sources: web.customerSnippets.slice(0, 3).map((item) => ({
          label: item.source,
          url: item.url,
          date: null,
        })),
        confidence: web.customerSnippets.length ? "estimated" : "missing",
        entityScope: "unknown",
      }
    ),
  ];

  const indiaFacts: ReportFact[] = [
    fact("인도 법인 상태", profile.status !== "Unknown" ? profile.status : null, {
      sources: registrySources,
      entityScope: "india-entity",
      confidence: profile.status !== "Unknown" ? "confirmed" : "missing",
    }),
    fact("인도 등록 주소", profile.registeredOffice.address || web.address, {
      sources: registrySources,
      entityScope: "india-entity",
      confidence: profile.registeredOffice.address ? "confirmed" : "missing",
    }),
    fact(
      "인도 거점·사업 언급",
      web.indiaOpsSnippets.length
        ? web.indiaOpsSnippets
            .slice(0, 3)
            .map((item) => `· ${item.text.replace(/\s+/g, " ").trim()}`)
            .join("\n")
        : null,
      {
        sources: web.indiaOpsSnippets.slice(0, 3).map((item) => ({
          label: item.source,
          url: item.url,
          date: null,
        })),
        confidence: web.indiaOpsSnippets.length ? "estimated" : "missing",
        entityScope: "india-entity",
      }
    ),
  ];

  const scaleFacts: ReportFact[] = [
    fact("매출", web.revenue ? `${web.revenue}${web.revenueYear ? ` (${web.revenueYear})` : ""}` : null, {
      confidence: web.revenue ? "estimated" : "missing",
      notes: web.revenue ? "웹 공개 수치 · 법인·기준연도 재확인 필요" : null,
      entityScope: "unknown",
      sources: sourceFromProfile(profile, "revenue"),
    }),
    fact("직원 수", web.employees, {
      confidence: web.employees ? "estimated" : "missing",
      notes: web.employees ? "외부 사이트 추정치일 수 있음" : null,
      entityScope: "unknown",
    }),
    fact(
      "자본금(수권)",
      profile.authorizedCapitalInr > 0
        ? `₹${profile.authorizedCapitalInr.toLocaleString("en-IN")}`
        : null,
      { sources: registrySources, entityScope: "india-entity", confidence: "confirmed" }
    ),
    fact(
      "납입 자본금",
      profile.paidUpCapitalInr > 0 ? `₹${profile.paidUpCapitalInr.toLocaleString("en-IN")}` : null,
      { sources: registrySources, entityScope: "india-entity", confidence: "confirmed" }
    ),
    fact(
      "신용평가 언급",
      web.creditRatingSnippets.length
        ? web.creditRatingSnippets
            .slice(0, 3)
            .map((item) => `· ${item.text.replace(/\s+/g, " ").trim()}`)
            .join("\n")
        : null,
      {
        sources: web.creditRatingSnippets.slice(0, 3).map((item) => ({
          label: item.source,
          url: item.url,
          date: null,
        })),
        confidence: web.creditRatingSnippets.length ? "estimated" : "missing",
        entityScope: "unknown",
        notes: web.creditRatingSnippets.length
          ? "등급 대상 법인·채무를 원문에서 재확인해야 함"
          : "CRISIL/ICRA 등 공개 평가 미확인",
      }
    ),
  ];

  const relationFacts: ReportFact[] = [
    fact(
      "공통 이사 연결 기업",
      profile.connectedCompanies.length
        ? profile.connectedCompanies
            .map(
              (c) =>
                `· ${c.name}\n  (${c.cin}) · ${relationLabel(c.relationType)}`
            )
            .join("\n")
        : null,
      {
        sources: registrySources,
        confidence: profile.connectedCompanies.length ? "confirmed" : "missing",
        entityScope: "shared-director",
        notes: profile.connectedCompanies.length
          ? "등기 자료상 이사가 겹치는 기업 · 지분·그룹 관계는 별도 확인 필요"
          : null,
      }
    ),
    fact(
      "모회사·자회사·협력 언급",
      web.relationSnippets.length
        ? web.relationSnippets
            .slice(0, 4)
            .map((item) => `· ${item.text.replace(/\s+/g, " ").trim()}`)
            .join("\n")
        : null,
      {
        sources: web.relationSnippets.slice(0, 3).map((item) => ({
          label: item.source,
          url: item.url,
          date: null,
        })),
        confidence: web.relationSnippets.length ? "estimated" : "missing",
        entityScope: "unknown",
        notes: "모회사/인도법인 정보가 섞일 수 있어 출처 확인 필요",
      }
    ),
  ];

  const peopleFacts: ReportFact[] = [
    fact(
      "등기이사",
      profile.directors
        .filter((d) => d.status !== "Resigned")
        .map((d) => `${d.name}${d.din ? ` [DIN ${d.din}]` : ""}${d.designation ? ` · ${d.designation}` : ""}`)
        .join("\n") || null,
      { sources: registrySources, entityScope: "india-entity", confidence: "confirmed" }
    ),
  ];

  const newsFacts: ReportFact[] = web.newsItems.slice(0, 5).map((item, index) =>
    fact(`동향 ${index + 1}`, item.text, {
      confidence: "estimated",
      sources: [{ label: item.source, url: item.url, date: null }],
      entityScope: "unknown",
    })
  );
  if (newsFacts.length === 0) {
    newsFacts.push(fact("최근 동향", null));
  }

  const contactFacts: ReportFact[] = [
    fact("웹사이트", web.website, {
      sources: websiteSources,
      confidence: web.website ? "confirmed" : "missing",
    }),
    fact("이메일", profile.email || web.email, {
      sources: profile.email ? registrySources : websiteSources,
      confidence: profile.email ? "confirmed" : web.email ? "estimated" : "missing",
    }),
    fact("전화", profile.phone || web.phone, {
      sources: websiteSources,
      confidence: web.phone || profile.phone ? "estimated" : "missing",
    }),
    fact("주소", profile.registeredOffice.address || web.address, {
      sources: profile.registeredOffice.address ? registrySources : websiteSources,
      confidence: profile.registeredOffice.address ? "confirmed" : "missing",
    }),
    fact("최근 AGM", profile.lastAgmDate, {
      sources: registrySources,
      confidence: profile.lastAgmDate ? "confirmed" : "missing",
      notes: buildFreshness(profile, generatedAt).notes[0] || null,
    }),
  ];

  const validCharges = isValidChargesSummary(profile.chargesSummary)
    ? profile.chargesSummary
    : null;

  const riskFacts: ReportFact[] = [
    fact("담보(Charges)", validCharges, {
      sources: registrySources,
      entityScope: "india-entity",
      confidence: validCharges ? "confirmed" : "missing",
      notes: !validCharges && profile.chargesSummary ? "형식 검증 실패로 제외된 추출값 있음" : null,
    }),
    fact(
      "분쟁·제재·리스크 언급",
      web.riskSnippets.length
        ? web.riskSnippets
            .slice(0, 3)
            .map((item) => `· ${item.text.replace(/\s+/g, " ").trim()}`)
            .join("\n")
        : null,
      {
        sources: web.riskSnippets.slice(0, 3).map((item) => ({
          label: item.source,
          url: item.url,
          date: null,
        })),
        confidence: web.riskSnippets.length ? "estimated" : "missing",
        notes: web.riskSnippets.length ? "보도 기반 · 사실 여부 추가 확인 필요" : null,
      }
    ),
  ];

  const sections: ReportSection[] = [
    { id: "overview", title: "기업 개요", facts: overviewFacts },
    { id: "products", title: "주요 제품·서비스", facts: productFacts },
    { id: "india", title: "인도 사업", facts: indiaFacts },
    { id: "scale", title: "규모·신용평가", facts: scaleFacts },
    { id: "relations", title: "관계사·거래/협력", facts: relationFacts },
    { id: "people", title: "주요 인물", facts: peopleFacts },
    { id: "news", title: "최근 동향", facts: newsFacts },
    { id: "contact", title: "연락처·자료 기준일", facts: contactFacts },
    { id: "risks", title: "참고 사항", facts: riskFacts },
  ];

  const allSources = uniqSources([
    ...websiteSources,
    ...web.relatedLinks.slice(0, 20).map((link) => ({
      label: link.label,
      url: link.url,
      date: null as string | null,
    })),
    ...profile.dataSources.map((label) => ({ label, url: "", date: null as string | null })),
  ]);

  return {
    profile,
    generatedAt,
    headline: buildHeadline(profile),
    assessment: buildAssessment(profile),
    freshness: buildFreshness(profile, generatedAt),
    identity: {
      name: profile.name || profile.cin,
      cin: profile.cin,
      website: web.website,
      status: profile.status,
      type: profile.type,
      listingStatus: profile.listingStatus,
    },
    sections,
    sources: allSources,
    reviews: {
      ambitionBoxRating: web.ambitionBoxRating,
      ambitionBoxReviewCount: web.ambitionBoxReviewCount,
      ambitionBoxUrl: web.ambitionBoxUrl,
      googleMapsRating: web.googleMapsRating,
      googleMapsUrl: web.googleMapsUrl,
      glassdoorRating: web.glassdoorRating,
      glassdoorUrl: web.glassdoorUrl,
      employeeReviews: web.employeeReviews,
      websiteReviews: web.websiteReviews,
      glassdoorSnippets: web.glassdoorSnippets,
      searchStatus: web.reviewSearchStatus ?? [],
    },
  };
}
