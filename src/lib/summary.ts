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

export function generateCompanySummary(profile: CompanyProfile): string {
  const parts: string[] = [];
  const web = profile.webEnrichment;
  const displayName = profile.name || profile.cin;

  parts.push(`${displayName}에 대한 공개 웹 정보를 수집·정리한 결과입니다.`);

  if (web.description) {
    parts.push(web.description);
  }

  const snippets = uniqueSnippets(profile);
  if (snippets.length > 0) {
    const topSnippets = snippets.slice(0, 3).join(" ");
    if (!web.description || !topSnippets.includes(web.description.slice(0, 40))) {
      parts.push(topSnippets);
    }
  }

  const facts: string[] = [];
  if (profile.cin) facts.push(`CIN ${profile.cin}`);
  if (profile.cinParsed.stateName) facts.push(`${profile.cinParsed.stateName} 소재`);
  if (profile.status && profile.status !== "Unknown") facts.push(`상태 ${profile.status}`);
  if (profile.industry || profile.cinParsed.industryDescription) {
    facts.push(`업종 ${profile.industry || profile.cinParsed.industryDescription}`);
  }
  if (profile.dateOfIncorporation || profile.cinParsed.yearOfIncorporation) {
    facts.push(`설립 ${profile.dateOfIncorporation || profile.cinParsed.yearOfIncorporation}`);
  }
  if (facts.length > 0) {
    parts.push(facts.join(" · ") + ".");
  }

  if (web.website) parts.push(`공식 웹사이트: ${web.website}.`);
  if (web.revenue) {
    parts.push(`공개 매출 정보: ${web.revenue}${web.revenueYear ? ` (${web.revenueYear})` : ""}.`);
  }
  if (web.employees) parts.push(`직원 수(웹): ${web.employees}.`);
  if (profile.directors.length > 0) {
    parts.push(
      `관련 인물 ${profile.directors.length}명 확인: ${profile.directors
        .slice(0, 3)
        .map((d) => d.name)
        .join(", ")}${profile.directors.length > 3 ? " 외" : ""}.`
    );
  }
  if (web.rawSnippets.length > 0) {
    parts.push(`웹 검색 결과 ${web.rawSnippets.length}건, 관련 링크 ${web.relatedLinks.length}건 수집.`);
  }

  return parts.join(" ");
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
    { label: "웹 요약", key: "summary", values: companies.map((c) => c.summary || "—") },
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
    { label: "관련 인물", key: "directors", values: companies.map((c) => c.directors.map((d) => d.name).join(", ") || "—") },
    { label: "웹 검색 결과", key: "snippets", values: companies.map((c) => `${c.webEnrichment.rawSnippets.length}건`) },
    { label: "관련 링크", key: "links", values: companies.map((c) => `${c.webEnrichment.relatedLinks.length}건`) },
  ];
}
