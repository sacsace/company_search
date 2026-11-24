import type {
  CompanyProfile,
  ReportFact,
  CompanyReport,
  ReportSection,
  ReportSource,
} from "./types";

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

function buildHeadline(profile: CompanyProfile): string[] {
  const web = profile.webEnrichment;
  const name = profile.name || profile.cin;
  const lines: string[] = [];

  lines.push(
    `${name}은(는) ${profile.cinParsed.stateName || "인도"}에 등록된 ${profile.type || "기업"}입니다.`
  );

  const business = web.businessDescription || profile.industry || profile.cinParsed.industryDescription;
  if (business) lines.push(`주요 사업: ${business.replace(/\s+/g, " ").trim()}.`);

  const products = [...web.products, ...web.services].slice(0, 4);
  if (products.length > 0) lines.push(`공개된 제품·서비스: ${products.join(", ")}.`);

  const address = web.address || profile.registeredOffice.address;
  if (address) lines.push(`인도 등록 주소: ${address}.`);

  const scale: string[] = [];
  if (web.revenue) scale.push(`매출 ${web.revenue}${web.revenueYear ? ` (${web.revenueYear})` : ""}`);
  if (web.employees) scale.push(`직원 ${web.employees}`);
  if (profile.paidUpCapitalInr > 0) {
    scale.push(`납입자본 ₹${profile.paidUpCapitalInr.toLocaleString("en-IN")}`);
  }
  if (scale.length > 0) lines.push(`공개 규모 정보: ${scale.join(", ")}.`);

  if (profile.connectedCompanies.length > 0) {
    lines.push(
      `이사·네트워크로 연결된 관계사: ${profile.connectedCompanies
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ")}.`
    );
  }

  if (web.newsItems.length > 0) {
    lines.push(`최근 공개 동향: ${web.newsItems[0].text.slice(0, 140)}.`);
  }

  const people = profile.directors.filter((d) => d.status !== "Resigned").slice(0, 3);
  if (people.length > 0) {
    lines.push(`주요 인물: ${people.map((d) => `${d.name}${d.designation ? `(${d.designation})` : ""}`).join(", ")}.`);
  }

  return lines.slice(0, 7);
}

export function buildCompanyReport(profile: CompanyProfile): CompanyReport {
  const web = profile.webEnrichment;
  const registrySources = uniqSources(
    profile.dataSources.map((label) => ({ label, url: "", date: null }))
  );
  const websiteSources = web.website
    ? [{ label: "공식 웹사이트", url: web.website, date: null as string | null }]
    : [];

  const overviewFacts: ReportFact[] = [
    fact("회사명", profile.name || profile.cin, {
      sources: registrySources,
      entityScope: "india-entity",
    }),
    fact("CIN", profile.cin, { sources: registrySources }),
    fact("상태", profile.status !== "Unknown" ? profile.status : null, {
      sources: registrySources,
    }),
    fact("본사·등록 위치", web.address || profile.registeredOffice.address, {
      sources: [...registrySources, ...websiteSources],
      notes: web.address && profile.registeredOffice.address && web.address !== profile.registeredOffice.address
        ? "웹 주소와 등기 주소가 다를 수 있음"
        : null,
      confidence:
        web.address && profile.registeredOffice.address && web.address !== profile.registeredOffice.address
          ? "conflict"
          : web.address || profile.registeredOffice.address
            ? "confirmed"
            : "missing",
    }),
    fact(
      "설립연도",
      profile.dateOfIncorporation ||
        (profile.cinParsed.yearOfIncorporation ? String(profile.cinParsed.yearOfIncorporation) : null),
      { sources: registrySources }
    ),
    fact("주요 사업", web.businessDescription || profile.industry || profile.cinParsed.industryDescription, {
      sources: [...registrySources, ...websiteSources],
      confidence: web.businessDescription ? "confirmed" : profile.industry ? "estimated" : "missing",
    }),
  ];

  const productFacts: ReportFact[] = [
    fact(
      "제품",
      web.products.length ? web.products.slice(0, 8).map((item) => `· ${item}`).join("\n") : null,
      {
        sources: websiteSources,
        confidence: web.products.length ? "estimated" : "missing",
        notes: web.products.length ? "웹사이트·검색 결과 기반 추출" : null,
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
  ];

  const indiaFacts: ReportFact[] = [
    fact("인도 법인 상태", profile.status !== "Unknown" ? profile.status : null, {
      sources: registrySources,
      entityScope: "india-entity",
    }),
    fact("인도 등록 주소", profile.registeredOffice.address || web.address, {
      sources: registrySources,
      entityScope: "india-entity",
    }),
    fact(
      "인도 거점·사업 언급",
      web.indiaOpsSnippets[0]?.text || null,
      {
        sources: web.indiaOpsSnippets[0]
          ? [{ label: web.indiaOpsSnippets[0].source, url: web.indiaOpsSnippets[0].url, date: null }]
          : [],
        confidence: web.indiaOpsSnippets.length ? "estimated" : "missing",
        entityScope: "india-entity",
        notes: web.indiaOpsSnippets.length > 1 ? `관련 언급 ${web.indiaOpsSnippets.length}건` : null,
      }
    ),
  ];

  const scaleFacts: ReportFact[] = [
    fact("매출", web.revenue ? `${web.revenue}${web.revenueYear ? ` (${web.revenueYear})` : ""}` : null, {
      confidence: web.revenue ? "estimated" : "missing",
      notes: web.revenue ? "웹 공개 수치 · 법인 귀속 여부 재확인 필요" : null,
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
      { sources: registrySources, entityScope: "india-entity" }
    ),
    fact(
      "납입 자본금",
      profile.paidUpCapitalInr > 0 ? `₹${profile.paidUpCapitalInr.toLocaleString("en-IN")}` : null,
      { sources: registrySources, entityScope: "india-entity" }
    ),
  ];

  const relationFacts: ReportFact[] = [
    fact(
      "관계사(이사 네트워크)",
      profile.connectedCompanies.length
        ? profile.connectedCompanies.map((c) => `· ${c.name}\n  (${c.cin})`).join("\n")
        : null,
      {
        sources: registrySources,
        confidence: profile.connectedCompanies.length ? "confirmed" : "missing",
        entityScope: "group",
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
      { sources: registrySources, entityScope: "india-entity" }
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
    fact("웹사이트", web.website, { sources: websiteSources }),
    fact("이메일", profile.email || web.email, {
      sources: profile.email ? registrySources : websiteSources,
    }),
    fact("전화", profile.phone || web.phone, { sources: websiteSources, confidence: web.phone ? "estimated" : "missing" }),
    fact("주소", web.address || profile.registeredOffice.address, {
      sources: [...registrySources, ...websiteSources],
    }),
  ];

  const riskFacts: ReportFact[] = [
    fact("담보(Charges)", profile.chargesSummary, {
      sources: registrySources,
      entityScope: "india-entity",
    }),
    fact(
      "분쟁·제재·리스크 언급",
      web.riskSnippets[0]?.text || null,
      {
        sources: web.riskSnippets[0]
          ? [{ label: web.riskSnippets[0].source, url: web.riskSnippets[0].url, date: null }]
          : [],
        confidence: web.riskSnippets.length ? "estimated" : "missing",
        notes: web.riskSnippets.length ? "보도 기반 · 사실 여부 추가 확인 필요" : null,
      }
    ),
  ];

  const sections: ReportSection[] = [
    { id: "overview", title: "기업 개요", facts: overviewFacts },
    { id: "products", title: "주요 제품·서비스", facts: productFacts },
    { id: "india", title: "인도 사업", facts: indiaFacts },
    { id: "scale", title: "규모", facts: scaleFacts },
    { id: "relations", title: "관계사·거래/협력", facts: relationFacts },
    { id: "people", title: "주요 인물", facts: peopleFacts },
    { id: "news", title: "최근 동향", facts: newsFacts },
    { id: "contact", title: "연락처", facts: contactFacts },
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
    generatedAt: new Date().toISOString(),
    headline: buildHeadline(profile),
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
    },
  };
}
