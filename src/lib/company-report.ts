import type {
  CompanyProfile,
  ReportFact,
  CompanyReport,
  ReportSection,
  ReportSource,
  ReportAssessment,
  DataFreshness,
  CompanyRelationType,
  MissingReason,
} from "./types";
import { isValidChargesSummary } from "./registry-scraper";

const MISSING_REASON_LABEL: Record<MissingReason, string> = {
  not_searched: "아직 조사하지 않음",
  no_relevant_source: "검색했으나 관련 자료를 찾지 못함",
  source_inaccessible: "자료를 찾았지만 원문 접근 불가",
  paywalled: "유료 자료로 추가 접근 필요",
  company_uncertain: "대상 회사가 일치하는지 불확실",
  conflicting_sources: "출처 간 정보가 다름",
  outdated_only: "오래된 자료만 확인됨",
};

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
    missingReason?: MissingReason | null;
  } = {}
): ReportFact {
  const cleaned = value?.toString().trim() || "";
  const missingReason = cleaned ? null : opts.missingReason ?? "no_relevant_source";
  const missingNote = missingReason ? MISSING_REASON_LABEL[missingReason] : null;
  return {
    label,
    value: cleaned || missingNote || "확인 불가",
    confidence: cleaned ? opts.confidence ?? "confirmed" : "missing",
    entityScope: opts.entityScope ?? "india-entity",
    sources: opts.sources ?? [],
    notes: opts.notes ?? (cleaned ? null : missingNote),
    missingReason,
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

function officialClientCount(web: CompanyProfile["webEnrichment"]): number {
  return web.customerSnippets.filter((item) => /공식 사이트/i.test(item.text)).length;
}

function buildAssessment(profile: CompanyProfile): ReportAssessment {
  const web = profile.webEnrichment;
  const strengths: string[] = [];
  const cautions: string[] = [];
  const deferred: string[] = [];
  const followUps: string[] = [];
  const clientCount = officialClientCount(web);

  if (profile.status === "Active") {
    strengths.push("인도 등기 상태가 Active로, 정상 영업 법인의 신호가 확인됨");
  }
  if (web.website) {
    strengths.push("공식 웹사이트를 통해 사업·서비스·연락 정보를 체계적으로 공개하고 있음");
  }
  if (web.services.length > 0) {
    strengths.push(
      `서비스 포트폴리오가 구체적으로 소개됨 (${web.services
        .slice(0, 2)
        .map((s) => s.split("—")[0].trim())
        .join(", ")} 등)`
    );
  } else if (web.businessDescription) {
    strengths.push("현재 영위 사업이 공개 자료에서 비교적 명확히 설명됨");
  }
  if (clientCount > 0) {
    strengths.push(
      `공식 사이트에 고객사 ${clientCount}곳을 공개 — 실적·신뢰 기반을 스스로 제시하고 있음`
    );
  } else if (web.customerSnippets.length > 0) {
    strengths.push("고객·프로젝트 관련 공개 언급이 있어 시장 활동을 가늠할 수 있음");
  }
  if (web.insights.some((item) => /경영진|팀/i.test(item.key))) {
    strengths.push("경영진·팀 소개가 공식 사이트에 공개되어 조직 구성이 투명함");
  }
  if (web.creditRatingSnippets.length > 0) {
    strengths.push("신용평가·등급 관련 공개 자료 후보가 확인됨");
  }
  if (web.indiaOpsSnippets.length > 0) {
    strengths.push("인도 사업·거점 관련 공개 언급이 확인됨");
  }
  if (profile.directors.filter((d) => d.status !== "Resigned").length > 0) {
    strengths.push("등기이사 정보가 공개되어 법인 거버넌스 확인이 가능함");
  }

  const registryIndustry = profile.industry || profile.cinParsed.industryDescription;
  if (
    registryIndustry &&
    web.businessDescription &&
    textsConflict(registryIndustry, web.businessDescription)
  ) {
    cautions.push("등기 업종과 현재 사업 설명은 다를 수 있어, 현재 사업을 우선 참고하는 것이 좋음");
  }
  if (web.riskSnippets.length > 0) {
    cautions.push("분쟁·제재 등 이슈 언급이 있으면 원문으로 사실 여부를 한 번 더 확인하는 것이 좋음");
  }
  if (profile.connectedCompanies.length > 0) {
    cautions.push("공통 이사 기업은 협력·네트워크 신호일 수 있으나, 동일 그룹으로 단정하지는 않음");
  }
  if (web.employees) {
    cautions.push("직원 수는 외부 추정치일 수 있어 법인 귀속을 함께 확인하면 더 정확함");
  }
  if (
    (web.ambitionBoxRating !== null && web.ambitionBoxRating < 3) ||
    (web.glassdoorRating !== null && web.glassdoorRating < 3)
  ) {
    cautions.push(
      "일부 직원 리뷰 평점은 낮게 나타나나 표본이 적을 수 있어, 전체 평가로 단정하기보다 원문 맥락을 함께 보는 것이 좋음"
    );
  }

  if (!web.revenue) deferred.push("매출·재무 규모는 아직 공개 자료에서 충분히 확인되지 않음");
  if (!web.employees) deferred.push("직원 규모는 추가 공개 자료를 기다리면 더 분명해질 수 있음");
  if (web.creditRatingSnippets.length === 0) {
    deferred.push("CRISIL/ICRA 등 전문 신용평가 보고서는 아직 확인되지 않음");
  }
  if (web.employeeReviews.length === 0 && web.ambitionBoxRating === null && web.glassdoorRating === null) {
    deferred.push("직원 평가 원문은 아직 충분히 모이지 않음");
  }
  if (web.websiteReviews.length === 0 && web.googleMapsRating === null) {
    deferred.push("고객·사업장 평점은 추가 조사 여지가 있음");
  }

  if (!web.revenue) followUps.push("연차보고서·재무공시·신용평가 보고서에서 매출 확인");
  if (web.creditRatingSnippets.length === 0) followUps.push("CRISIL/ICRA 기업·채무 평가 자료 검색");
  if (web.customerSnippets.length === 0) followUps.push("주요 고객·납품 사례 공개 자료 추가 조사");
  if (web.employeeReviews.length === 0) followUps.push("AmbitionBox/Glassdoor 등 직원 리뷰 재검색");
  followUps.push(...web.deepSearchNotes.slice(0, 3));

  const filledSignals = [
    web.website,
    web.businessDescription,
    web.services[0],
    web.revenue,
    web.employees,
    web.creditRatingSnippets[0],
    web.customerSnippets[0],
    profile.directors[0],
  ].filter(Boolean).length;

  return {
    strengths: strengths.slice(0, 6),
    cautions: cautions.slice(0, 4),
    deferred: deferred.slice(0, 4),
    followUps: [...new Set(followUps)].slice(0, 6),
    evidenceLevel: filledSignals >= 5 ? "high" : filledSignals >= 3 ? "medium" : "low",
  };
}

function buildHeadline(profile: CompanyProfile): string[] {
  const web = profile.webEnrichment;
  const name = profile.name || profile.cin;
  const lines: string[] = [];
  const state = profile.cinParsed.stateName || "인도";
  const clientCount = officialClientCount(web);
  const statusNote =
    profile.status === "Active"
      ? "정상 영업(Active) 상태의 "
      : profile.status !== "Unknown"
        ? `${profile.status} 상태의 `
        : "";

  lines.push(
    `${name}은(는) ${state}에 등록된 ${statusNote}${profile.type || "기업"}으로, 공개 자료를 통해 사업 내용을 비교적 잘 파악할 수 있습니다.`
  );

  if (web.businessDescription) {
    lines.push(
      `현재 영위 사업은 ${web.businessDescription.replace(/\s+/g, " ").trim()} 방향으로 소개되고 있습니다.`
    );
  }

  const registryIndustry = profile.industry || profile.cinParsed.industryDescription;
  if (
    registryIndustry &&
    (!web.businessDescription || textsConflict(registryIndustry, web.businessDescription))
  ) {
    lines.push(
      `등기·분류상 업종은 ${registryIndustry}이며, 실제 사업과 다를 수 있어 참고용으로 함께 둡니다.`
    );
  }

  if (web.services.length > 0) {
    const serviceLabels = web.services
      .slice(0, 4)
      .map((item) => item.split("—")[0].trim())
      .filter(Boolean);
    lines.push(`공식 사이트에서 강조하는 서비스: ${serviceLabels.join(", ")}.`);
  } else {
    const products = [...web.products, ...web.services].slice(0, 3);
    if (products.length > 0) lines.push(`공개된 제품·서비스: ${products.join(" / ")}.`);
  }

  if (clientCount > 0) {
    lines.push(
      `공식 사이트에 고객사 ${clientCount}곳이 소개되어 있어, 한·인도 기업 지원 실적을 가늠할 수 있습니다.`
    );
  }

  const address = web.address || profile.registeredOffice.address;
  if (address) lines.push(`인도 등록·운영 거점: ${address}.`);

  if (profile.connectedCompanies.length > 0) {
    lines.push(
      `공통 이사로 연결된 기업 ${profile.connectedCompanies.length}곳이 확인되며, 협력·네트워크 관점에서 참고할 수 있습니다.`
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
        confidence: web.services.length ? (web.website ? "confirmed" : "estimated") : "missing",
        notes: web.services.length && web.website ? "공식 사이트 기준" : null,
        missingReason: web.services.length ? null : "no_relevant_source",
      }
    ),
    fact(
      "고객·실적 언급",
      web.customerSnippets.length
        ? web.customerSnippets
            .slice(0, 10)
            .map((item) => `· ${item.text.replace(/\s+/g, " ").trim()}`)
            .join("\n")
        : null,
      {
        sources: uniqSources(
          web.customerSnippets.slice(0, 6).map((item) => ({
            label: item.source,
            url: item.url,
            date: null,
          }))
        ),
        confidence: web.customerSnippets.some((item) => /공식 사이트/i.test(item.text))
          ? "confirmed"
          : web.customerSnippets.length
            ? "estimated"
            : "missing",
        entityScope: "india-entity",
        notes: web.customerSnippets.some((item) => /공식 사이트/i.test(item.text))
          ? "회사 공식 소개 기준 · 독립 검증과는 구분"
          : web.customerSnippets.length
            ? "웹 언급 기반 · 법인·시점 재확인 필요"
            : null,
        missingReason: web.customerSnippets.length ? null : "no_relevant_source",
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
          ? "등급 대상 법인·채무·평가일을 원문에서 재확인해야 함"
          : null,
        missingReason: web.creditRatingSnippets.length ? null : "no_relevant_source",
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

  const websiteTeamInsight = web.insights.find((item) => /경영진|팀/i.test(item.key));
  const peopleFacts: ReportFact[] = [
    fact(
      "등기이사",
      profile.directors
        .filter((d) => d.status !== "Resigned")
        .map((d) => `${d.name}${d.din ? ` [DIN ${d.din}]` : ""}${d.designation ? ` · ${d.designation}` : ""}`)
        .join("\n") || null,
      { sources: registrySources, entityScope: "india-entity", confidence: "confirmed" }
    ),
    fact("경영진·팀 (공식 소개)", websiteTeamInsight?.value ?? null, {
      sources: websiteTeamInsight?.sourceUrl
        ? [{ label: websiteTeamInsight.source, url: websiteTeamInsight.sourceUrl, date: null }]
        : websiteSources,
      confidence: websiteTeamInsight ? "confirmed" : "missing",
      notes: websiteTeamInsight ? "회사 공식 소개 기준 · 독립 검증과 구분" : null,
      missingReason: websiteTeamInsight ? null : "no_relevant_source",
    }),
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
    sourceStats: web.sourceStats ?? {
      discovered: allSources.length,
      relevant: allSources.length,
      verified: websiteSources.length,
      usedInReport: allSources.length,
    },
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
