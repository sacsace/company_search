import type { CompanyProfile, ComparisonField } from "./types";

function uniqueSnippets(profile: CompanyProfile): string[] {
  const seen = new Set<string>();
  const snippets: string[] = [];

  for (const snippet of profile.webEnrichment.rawSnippets) {
    const key = snippet.text.trim().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    snippets.push(snippet.text.trim());
  }

  return snippets;
}

function formatDirectorNames(profile: CompanyProfile): string {
  const current = profile.directors.filter((d) => d.status !== "Resigned");
  if (current.length === 0) return "";
  return current.map((d) => d.name).join("\n");
}

export function generateCompanySummary(profile: CompanyProfile): string {
  const parts: string[] = [];
  const web = profile.webEnrichment;
  const displayName = profile.name || profile.cin;

  const statusLabel =
    profile.status === "Active"
      ? "정상 영업(Active)"
      : profile.status && profile.status !== "Unknown"
        ? profile.status
        : null;

  parts.push(
    `${displayName}(CIN: ${profile.cin})은(는) 인도에 등록된 ${profile.type || "기업"}으로, 공개 자료를 바탕으로 사업 개요를 정리한 결과입니다.`
  );

  if (statusLabel) {
    parts.push(`현재 등록 상태는 ${statusLabel}입니다.`);
  }

  const business =
    web.businessDescription ||
    (profile.industry && profile.industry !== profile.cinParsed.industryDescription
      ? profile.industry
      : profile.cinParsed.industryDescription);
  if (business) {
    parts.push(`주요 사업은 ${business.replace(/\s+/g, " ").trim()} 쪽으로 소개되고 있습니다.`);
  } else if (web.description) {
    parts.push(web.description);
  }

  if (web.services.length > 0) {
    const labels = web.services
      .slice(0, 4)
      .map((item) => item.split("—")[0].trim())
      .filter(Boolean);
    parts.push(`공식·공개 자료에서 확인되는 서비스: ${labels.join(", ")}.`);
  }

  const officialClients = web.customerSnippets.filter((s) => /공식 사이트/i.test(s.text));
  if (officialClients.length > 0) {
    parts.push(
      `공식 사이트에 고객사 ${officialClients.length}곳이 공개되어 있어, 시장에서의 활동 범위를 가늠하기 좋습니다.`
    );
  }

  const directorNames = formatDirectorNames(profile);
  if (directorNames) {
    parts.push(`등기이사:\n${directorNames}`);
  }

  const locationFacts: string[] = [];
  if (profile.cinParsed.stateName) locationFacts.push(`${profile.cinParsed.stateName} 소재`);
  if (profile.dateOfIncorporation || profile.cinParsed.yearOfIncorporation) {
    locationFacts.push(`설립 ${profile.dateOfIncorporation || profile.cinParsed.yearOfIncorporation}`);
  }
  if (web.address || profile.registeredOffice.address) {
    const addr = (web.address || profile.registeredOffice.address).slice(0, 120);
    locationFacts.push(`등록 주소 ${addr}`);
  }
  if (locationFacts.length > 0) {
    parts.push(locationFacts.join(" · ") + ".");
  }

  const metrics: string[] = [];
  if (web.revenue) metrics.push(`매출 ${web.revenue}${web.revenueYear ? ` (${web.revenueYear})` : ""}`);
  if (web.employees) metrics.push(`직원 ${web.employees}`);
  if (web.website) metrics.push(`웹사이트 ${web.website}`);
  if (metrics.length > 0) {
    parts.push(`공개된 경영 정보: ${metrics.join(", ")}.`);
  }

  const snippets = uniqueSnippets(profile);
  if (snippets.length > 0 && !web.businessDescription) {
    const topSnippet = snippets[0].slice(0, 200);
    if (topSnippet.length > 40) {
      parts.push(`웹 검색 요약: ${topSnippet}${topSnippet.length >= 200 ? "…" : ""}`);
    }
  }

  if (web.snsComments.length > 0 || web.websiteReviews.length > 0 || web.employeeReviews.length > 0 || web.glassdoorRating !== null) {
    const reviewCount = web.snsComments.length + web.websiteReviews.length + web.employeeReviews.length;
    parts.push(`온라인에서 참고할 수 있는 댓글·리뷰 ${reviewCount}건을 함께 모았습니다.`);
    if (web.glassdoorRating !== null) {
      parts.push(
        `Glassdoor 평점 ${web.glassdoorRating.toFixed(1)}점${web.glassdoorReviewCount !== null ? ` (${web.glassdoorReviewCount}건)` : ""} — 표본과 시점을 함께 보시면 좋습니다.`
      );
    }
    if (web.employeeReviews.some((r) => r.platform === "AmbitionBox")) {
      const ambitionCount = web.employeeReviews.filter((r) => r.platform === "AmbitionBox").length;
      parts.push(
        `AmbitionBox 직원 리뷰 ${ambitionCount}건이 포함되어 있으며, 표본이 적을 경우 참고 의견으로 보시면 됩니다.`
      );
    }
  }

  return parts.join("\n");
}

export function generateComparisonSummary(companies: CompanyProfile[]): string {
  if (companies.length < 2) return "";

  const names = companies.map((c) => c.name || c.cin);
  const parts: string[] = [
    `${names.join(", ")} — 주력 제품·인도 거점·규모·최근 투자를 중심으로 한 공개 정보 비교입니다.`,
  ];

  const withProducts = companies.filter(
    (c) => c.webEnrichment.products.length + c.webEnrichment.services.length > 0 || c.webEnrichment.businessDescription
  );
  if (withProducts.length > 0) {
    parts.push(`사업 내용 확인: ${withProducts.map((c) => c.name || c.cin).join(", ")}.`);
  }

  const withIndia = companies.filter(
    (c) => c.webEnrichment.indiaOpsSnippets.length > 0 || c.registeredOffice.address
  );
  if (withIndia.length > 0) {
    parts.push(`인도 거점 언급: ${withIndia.map((c) => c.name || c.cin).join(", ")}.`);
  }

  const withScale = companies.filter(
    (c) => c.webEnrichment.revenue || c.webEnrichment.employees || c.paidUpCapitalInr > 0
  );
  if (withScale.length > 0) {
    parts.push(`규모 정보 확인: ${withScale.map((c) => c.name || c.cin).join(", ")}.`);
  }

  const missing = companies.filter(
    (c) =>
      !c.webEnrichment.businessDescription &&
      c.webEnrichment.products.length === 0 &&
      !c.webEnrichment.revenue &&
      !c.webEnrichment.employees
  );
  if (missing.length > 0) {
    parts.push(`확인 불가 항목이 많은 기업: ${missing.map((c) => c.name || c.cin).join(", ")}.`);
  }

  return parts.join(" ");
}

export function buildComparisonFields(companies: CompanyProfile[]): ComparisonField[] {
  const orMissing = (value: string | null | undefined) => value?.trim() || "확인 불가";

  return [
    { label: "회사명", key: "name", values: companies.map((c) => c.name || c.cin) },
    { label: "CIN", key: "cin", values: companies.map((c) => c.cin) },
    {
      label: "주력 제품·서비스",
      key: "products",
      values: companies.map((c) => {
        const items = [...c.webEnrichment.products, ...c.webEnrichment.services].slice(0, 5);
        return items.length > 0
          ? items.join(", ")
          : orMissing(c.webEnrichment.businessDescription || c.industry);
      }),
    },
    {
      label: "인도 거점",
      key: "indiaFootprint",
      values: companies.map((c) =>
        orMissing(
          c.webEnrichment.indiaOpsSnippets[0]?.text ||
            c.registeredOffice.address ||
            c.webEnrichment.address ||
            c.cinParsed.stateName
        )
      ),
    },
    {
      label: "생산·공장 언급",
      key: "factory",
      values: companies.map((c) => {
        const hit = c.webEnrichment.indiaOpsSnippets.find((s) =>
          /factory|plant|manufactur|공장|생산/i.test(s.text)
        );
        return orMissing(hit?.text);
      }),
    },
    {
      label: "고객·산업",
      key: "customers",
      values: companies.map((c) =>
        orMissing(
          c.webEnrichment.relationSnippets.find((s) => /customer|client|supplier|partner/i.test(s.text))
            ?.text || c.webEnrichment.businessDescription
        )
      ),
    },
    {
      label: "공개 기업 규모",
      key: "scale",
      values: companies.map((c) => {
        const parts: string[] = [];
        if (c.webEnrichment.revenue) {
          parts.push(`매출 ${c.webEnrichment.revenue}${c.webEnrichment.revenueYear ? ` (${c.webEnrichment.revenueYear})` : ""}`);
        }
        if (c.webEnrichment.employees) parts.push(`직원 ${c.webEnrichment.employees}`);
        if (c.paidUpCapitalInr > 0) parts.push(`납입자본 ₹${c.paidUpCapitalInr.toLocaleString("en-IN")}`);
        return parts.length > 0 ? parts.join(" · ") : "확인 불가";
      }),
    },
    {
      label: "최근 투자·동향",
      key: "investment",
      values: companies.map((c) => orMissing(c.webEnrichment.newsItems[0]?.text)),
    },
    {
      label: "관계사",
      key: "connected",
      values: companies.map((c) =>
        c.connectedCompanies.length > 0
          ? c.connectedCompanies.map((item) => item.name).join(", ")
          : "확인 불가"
      ),
    },
    { label: "웹사이트", key: "website", values: companies.map((c) => c.webEnrichment.website || "확인 불가") },
    { label: "상태", key: "status", values: companies.map((c) => (c.status !== "Unknown" ? c.status : "확인 불가")) },
    {
      label: "등기이사",
      key: "directors",
      values: companies.map((c) => c.directors.map((d) => d.name).join(", ") || "확인 불가"),
    },
  ];
}
