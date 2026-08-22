import type { CompanyProfile, ComparisonField } from "./types";
import { formatInr } from "./cin-parser";

export function generateCompanySummary(profile: CompanyProfile): string {
  const parts: string[] = [];

  parts.push(
    `${profile.name} (CIN: ${profile.cin})은(는) ${profile.cinParsed.stateName}에 등록된 ${profile.status} 상태의 ${profile.cinParsed.companyType}입니다.`
  );

  parts.push(
    `${profile.dateOfIncorporation || profile.cinParsed.yearOfIncorporation}년 설립(${profile.ageYears}년차), ${profile.listingStatus === "Listed" ? "상장" : "비상장"} 기업입니다.`
  );

  if (profile.industry || profile.cinParsed.industryDescription) {
    parts.push(
      `업종: ${profile.industry || profile.cinParsed.industryDescription} (NIC: ${profile.nicCode || profile.cinParsed.industryCode}).`
    );
  }

  if (profile.registeredOffice.address) {
    parts.push(`등록 사무실: ${profile.registeredOffice.address}.`);
  }

  if (profile.authorizedCapitalInr || profile.paidUpCapitalInr) {
    parts.push(
      `자본금 - 인가자본: ${formatInr(profile.authorizedCapitalInr)}, 납입자본: ${formatInr(profile.paidUpCapitalInr)}.`
    );
  }

  if (profile.directors.length > 0) {
    const currentDirectors = profile.directors.filter((d) => d.status === "Current");
    parts.push(
      `등기이사 ${currentDirectors.length}명: ${currentDirectors.slice(0, 5).map((d) => `${d.name}(${d.designation})`).join(", ")}${currentDirectors.length > 5 ? " 외" : ""}.`
    );
  }

  if (profile.shareholders.length > 0) {
    parts.push(
      `주요 주주: ${profile.shareholders.slice(0, 3).map((s) => `${s.name}${s.holdingPercent ? ` (${s.holdingPercent})` : ""}`).join(", ")}.`
    );
  }

  if (profile.webEnrichment.revenue) {
    parts.push(
      `공개 매출 정보: ${profile.webEnrichment.revenue}${profile.webEnrichment.revenueYear ? ` (${profile.webEnrichment.revenueYear})` : ""}.`
    );
  }

  if (profile.webEnrichment.website) {
    parts.push(`웹사이트: ${profile.webEnrichment.website}.`);
  }

  if (profile.webEnrichment.description) {
    parts.push(profile.webEnrichment.description);
  }

  return parts.join(" ");
}

export function generateComparisonSummary(companies: CompanyProfile[]): string {
  if (companies.length < 2) return "";

  const names = companies.map((c) => c.name);
  const parts: string[] = [
    `${names.join(", ")} — 총 ${companies.length}개 인도 기업 비교 분석입니다.`,
  ];

  const activeCount = companies.filter((c) => c.status.toLowerCase().includes("active")).length;
  parts.push(`${activeCount}/${companies.length}개 기업이 Active 상태입니다.`);

  const listedCount = companies.filter((c) => c.listingStatus === "Listed").length;
  parts.push(`상장 기업: ${listedCount}개, 비상장: ${companies.length - listedCount}개.`);

  const maxCapital = Math.max(...companies.map((c) => c.paidUpCapitalInr));
  const richest = companies.find((c) => c.paidUpCapitalInr === maxCapital);
  if (richest && maxCapital > 0) {
    parts.push(`납입자본 기준 최대: ${richest.name} (${formatInr(maxCapital)}).`);
  }

  const oldest = companies.reduce((a, b) => (a.ageYears > b.ageYears ? a : b));
  const newest = companies.reduce((a, b) => (a.ageYears < b.ageYears ? a : b));
  if (oldest.ageYears !== newest.ageYears) {
    parts.push(`설립 연도: 가장 오래된 ${oldest.name}(${oldest.ageYears}년), 가장 최근 ${newest.name}(${newest.ageYears}년).`);
  }

  const states = [...new Set(companies.map((c) => c.cinParsed.stateName))];
  parts.push(`등록 주(State): ${states.join(", ")}.`);

  const withRevenue = companies.filter((c) => c.webEnrichment.revenue);
  if (withRevenue.length > 0) {
    parts.push(
      `공개 매출 정보 확인: ${withRevenue.map((c) => `${c.name} - ${c.webEnrichment.revenue}`).join("; ")}.`
    );
  }

  return parts.join(" ");
}

export function buildComparisonFields(companies: CompanyProfile[]): ComparisonField[] {
  const fields: ComparisonField[] = [
    {
      label: "회사명",
      key: "name",
      values: companies.map((c) => c.name),
    },
    {
      label: "CIN",
      key: "cin",
      values: companies.map((c) => c.cin),
    },
    {
      label: "상태",
      key: "status",
      values: companies.map((c) => c.status),
    },
    {
      label: "회사 유형",
      key: "type",
      values: companies.map((c) => c.type || c.cinParsed.companyType),
    },
    {
      label: "상장 여부",
      key: "listingStatus",
      values: companies.map((c) => c.listingStatus),
    },
    {
      label: "설립일",
      key: "dateOfIncorporation",
      values: companies.map((c) => c.dateOfIncorporation || String(c.cinParsed.yearOfIncorporation)),
    },
    {
      label: "업종",
      key: "industry",
      values: companies.map((c) => c.industry || c.cinParsed.industryDescription),
    },
    {
      label: "등록 주",
      key: "state",
      values: companies.map((c) => c.cinParsed.stateName),
    },
    {
      label: "등록 사무실",
      key: "address",
      values: companies.map((c) => c.registeredOffice.address || "—"),
    },
    {
      label: "인가자본 (INR)",
      key: "authorizedCapital",
      values: companies.map((c) => c.authorizedCapitalInr),
      highlight: "max",
    },
    {
      label: "납입자본 (INR)",
      key: "paidUpCapital",
      values: companies.map((c) => c.paidUpCapitalInr),
      highlight: "max",
    },
    {
      label: "매출 (공개정보)",
      key: "revenue",
      values: companies.map((c) => c.webEnrichment.revenue || "공개 정보 없음"),
    },
    {
      label: "웹사이트",
      key: "website",
      values: companies.map((c) => c.webEnrichment.website || "—"),
    },
    {
      label: "등기이사",
      key: "directors",
      values: companies.map((c) =>
        c.directors
          .filter((d) => d.status === "Current")
          .map((d) => `${d.name} (${d.designation})`)
          .join(", ") || "—"
      ),
    },
    {
      label: "주주 (공개정보)",
      key: "shareholders",
      values: companies.map((c) =>
        c.shareholders.map((s) => `${s.name}${s.holdingPercent ? ` ${s.holdingPercent}` : ""}`).join(", ") || "—"
      ),
    },
    {
      label: "ROC",
      key: "roc",
      values: companies.map((c) => c.roc || "—"),
    },
    {
      label: "최근 AGM",
      key: "lastAgm",
      values: companies.map((c) => c.lastAgmDate || "—"),
    },
    {
      label: "최근 재무제표",
      key: "lastBalanceSheet",
      values: companies.map((c) => c.lastBalanceSheetDate || "—"),
    },
  ];

  return fields;
}
