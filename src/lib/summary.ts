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

  parts.push(
    `${displayName}(CIN: ${profile.cin})은(는) 인도에 등록된 ${profile.type || "기업"}입니다.`
  );

  if (profile.status && profile.status !== "Unknown") {
    parts.push(`현재 등록 상태는 ${profile.status}입니다.`);
  }

  const business =
    web.businessDescription ||
    (profile.industry && profile.industry !== profile.cinParsed.industryDescription
      ? profile.industry
      : profile.cinParsed.industryDescription);
  if (business) {
    parts.push(`주요 사업: ${business.replace(/\s+/g, " ").trim()}.`);
  } else if (web.description) {
    parts.push(web.description);
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

  if (web.snsComments.length > 0 || web.websiteReviews.length > 0) {
    parts.push(
      `온라인 댓글·리뷰 ${web.snsComments.length + web.websiteReviews.length}건을 수집했습니다.`
    );
  }

  return parts.join("\n");
}

export function generateComparisonSummary(companies: CompanyProfile[]): string {
  if (companies.length < 2) return "";

  const names = companies.map((c) => c.name || c.cin);
  const parts: string[] = [
    `${names.join(", ")} — 공개 웹 정보 기반 ${companies.length}개 기업 비교입니다.`,
  ];

  const withWeb = companies.filter((c) => c.webEnrichment.rawSnippets.length > 0).length;
  parts.push(`${withWeb}/${companies.length}개 기업에서 웹 검색 결과를 확보했습니다.`);

  const withWebsite = companies.filter((c) => c.webEnrichment.website);
  if (withWebsite.length > 0) {
    parts.push(`웹사이트 확인: ${withWebsite.map((c) => c.name).join(", ")}.`);
  }

  const withRevenue = companies.filter((c) => c.webEnrichment.revenue);
  if (withRevenue.length > 0) {
    parts.push(
      `공개 매출 정보: ${withRevenue.map((c) => `${c.name} - ${c.webEnrichment.revenue}`).join("; ")}.`
    );
  }

  const states = [...new Set(companies.map((c) => c.cinParsed.stateName).filter(Boolean))];
  if (states.length > 0) {
    parts.push(`관련 주(State): ${states.join(", ")}.`);
  }

  return parts.join(" ");
}

export function buildComparisonFields(companies: CompanyProfile[]): ComparisonField[] {
  return [
    { label: "회사명", key: "name", values: companies.map((c) => c.name || c.cin) },
    { label: "CIN", key: "cin", values: companies.map((c) => c.cin) },
    { label: "요약", key: "summary", values: companies.map((c) => c.summary || "—") },
    { label: "사업 내용", key: "business", values: companies.map((c) => c.webEnrichment.businessDescription || c.industry || "—") },
    { label: "상태 (웹)", key: "status", values: companies.map((c) => c.status) },
    { label: "업종", key: "industry", values: companies.map((c) => c.industry || c.cinParsed.industryDescription || "—") },
    { label: "등록 주", key: "state", values: companies.map((c) => c.cinParsed.stateName || "—") },
    { label: "설립일", key: "dateOfIncorporation", values: companies.map((c) => c.dateOfIncorporation || String(c.cinParsed.yearOfIncorporation) || "—") },
    { label: "웹사이트", key: "website", values: companies.map((c) => c.webEnrichment.website || "—") },
    { label: "이메일", key: "webEmail", values: companies.map((c) => c.webEnrichment.email || c.email || "—") },
    { label: "전화번호", key: "phone", values: companies.map((c) => c.webEnrichment.phone || "—") },
    { label: "주소", key: "webAddress", values: companies.map((c) => c.webEnrichment.address || c.registeredOffice.address || "—") },
    { label: "매출 (웹)", key: "revenue", values: companies.map((c) => c.webEnrichment.revenue || "—") },
    { label: "직원 수", key: "employees", values: companies.map((c) => c.webEnrichment.employees || "—") },
    { label: "등기이사", key: "directors", values: companies.map((c) => c.directors.map((d) => d.name).join(", ") || "—") },
    { label: "웹 검색 결과", key: "snippets", values: companies.map((c) => `${c.webEnrichment.rawSnippets.length}건`) },
    { label: "관련 링크", key: "links", values: companies.map((c) => `${c.webEnrichment.relatedLinks.length}건`) },
  ];
}
