"use client";

import { useMemo, useState } from "react";
import type { CompanyProfile, FactConfidence, ReportFact } from "@/lib/types";
import { buildCompanyReport } from "@/lib/company-report";

const CONFIDENCE_LABEL: Record<FactConfidence, string> = {
  confirmed: "확인됨",
  estimated: "추정",
  conflict: "출처 차이",
  missing: "정보 없음",
};

const CONFIDENCE_CLASS: Record<FactConfidence, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  estimated: "bg-amber-50 text-amber-700 border-amber-200",
  conflict: "bg-orange-50 text-orange-700 border-orange-200",
  missing: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

const SCOPE_LABEL: Record<ReportFact["entityScope"], string> = {
  "india-entity": "인도 법인",
  parent: "모회사",
  group: "그룹",
  unknown: "법인 미확정",
};

function FactRow({ item }: { item: ReportFact }) {
  return (
    <div className="border-b border-neutral-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">{item.label}</p>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_CLASS[item.confidence]}`}>
          {CONFIDENCE_LABEL[item.confidence]}
        </span>
        <span className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
          {SCOPE_LABEL[item.entityScope]}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-line text-sm font-semibold leading-relaxed text-neutral-800">
        {item.value}
      </p>
      {item.notes && <p className="mt-1 text-[11px] text-neutral-500">{item.notes}</p>}
      {item.sources.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {item.sources.slice(0, 3).map((source) =>
            source.url ? (
              <a
                key={`${source.label}-${source.url}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-blue-700 underline"
              >
                {source.label.slice(0, 40)}
              </a>
            ) : (
              <span key={source.label} className="text-[11px] font-semibold text-neutral-500">
                {source.label}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  profile: CompanyProfile;
  onClose: () => void;
  onResearch?: () => void;
  researching?: boolean;
}

export function CompanyReport({ profile, onClose, onResearch, researching }: Props) {
  const report = useMemo(() => buildCompanyReport(profile), [profile]);
  const [activeTab, setActiveTab] = useState<"business" | "relations" | "news" | "contact" | "reviews">("business");

  const cardSections = report.sections.filter((section) =>
    ["overview", "products", "india", "scale"].includes(section.id)
  );
  const detailMap = {
    business: report.sections.filter((s) => ["overview", "products", "india", "scale"].includes(s.id)),
    relations: report.sections.filter((s) => ["relations", "people"].includes(s.id)),
    news: report.sections.filter((s) => ["news", "risks"].includes(s.id)),
    contact: report.sections.filter((s) => s.id === "contact"),
    reviews: [],
  } as const;

  const downloadReport = () => {
    const lines = [
      `# ${report.identity.name}`,
      `CIN: ${report.identity.cin}`,
      `생성 시각: ${new Date(report.generatedAt).toLocaleString("ko-KR")}`,
      "",
      "## 핵심 요약",
      ...report.headline.map((line) => `- ${line}`),
      "",
    ];

    for (const section of report.sections) {
      lines.push(`## ${section.title}`);
      for (const item of section.facts) {
        lines.push(
          `- ${item.label}: ${item.value} [${CONFIDENCE_LABEL[item.confidence]} / ${SCOPE_LABEL[item.entityScope]}]`
        );
        if (item.notes) lines.push(`  참고: ${item.notes}`);
      }
      lines.push("");
    }

    lines.push("## 출처");
    for (const source of report.sources) {
      lines.push(`- ${source.label}${source.url ? ` — ${source.url}` : ""}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.identity.name || report.identity.cin}-report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="w-full max-w-full space-y-5 rounded border border-neutral-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">기업 요약 보고서</p>
          <h2 className="mt-1 text-xl font-bold text-neutral-900">{report.identity.name}</h2>
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            CIN {report.identity.cin}
            {report.identity.status && report.identity.status !== "Unknown"
              ? ` · ${report.identity.status}`
              : ""}
            {report.identity.type ? ` · ${report.identity.type}` : ""}
          </p>
          {report.identity.website && (
            <a
              href={report.identity.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-blue-700 underline"
            >
              {report.identity.website}
            </a>
          )}
          <p className="mt-2 text-[11px] text-neutral-400">
            마지막 검색: {new Date(report.generatedAt).toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onResearch && (
            <button
              type="button"
              onClick={onResearch}
              disabled={researching}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {researching ? "심층 검색 중..." : "심층·다시 검색"}
            </button>
          )}
          <button
            type="button"
            onClick={downloadReport}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            보고서 다운로드
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            닫기
          </button>
        </div>
      </div>

      <div className="rounded border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">핵심 요약</p>
        <ul className="mt-2 space-y-1.5">
          {report.headline.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-neutral-800">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cardSections.map((section) => {
          const topFacts = section.facts.filter((f) => f.confidence !== "missing").slice(0, 2);
          const display = topFacts.length > 0 ? topFacts : section.facts.slice(0, 1);
          return (
            <div key={section.id} className="rounded border border-neutral-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">{section.title}</p>
              {display.map((item) => (
                <div key={item.label} className="mt-2">
                  <p className="text-[11px] font-semibold text-neutral-500">{item.label}</p>
                  <p className="mt-0.5 line-clamp-3 text-sm font-semibold text-neutral-800">{item.value}</p>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div>
        <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
          {(
            [
              ["business", "사업 현황"],
              ["relations", "관계사·인물"],
              ["news", "최근 소식"],
              ["contact", "연락처"],
              ["reviews", "온라인 평가"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`rounded px-3 py-1.5 text-xs font-semibold ${
                activeTab === id
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {activeTab !== "reviews" &&
            detailMap[activeTab].map((section) => (
              <div key={section.id} className="mb-4">
                <h3 className="text-sm font-bold text-neutral-800">{section.title}</h3>
                {section.facts.map((item) => (
                  <FactRow key={`${section.id}-${item.label}`} item={item} />
                ))}
              </div>
            ))}

          {activeTab === "reviews" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs font-semibold text-neutral-600">
                {report.reviews.ambitionBoxRating !== null && (
                  <span>
                    AmbitionBox {report.reviews.ambitionBoxRating.toFixed(1)}
                    {report.reviews.ambitionBoxReviewCount
                      ? ` (${report.reviews.ambitionBoxReviewCount}건)`
                      : ""}
                  </span>
                )}
                {report.reviews.googleMapsRating !== null && (
                  <span>Google Maps {report.reviews.googleMapsRating.toFixed(1)}</span>
                )}
                {report.reviews.glassdoorRating !== null && (
                  <span>Glassdoor {report.reviews.glassdoorRating.toFixed(1)}</span>
                )}
                {report.reviews.ambitionBoxRating === null &&
                  report.reviews.googleMapsRating === null &&
                  report.reviews.glassdoorRating === null && <span>공개 평점 정보 없음</span>}
              </div>

              {report.reviews.employeeReviews.slice(0, 5).map((review, index) => {
                const body = [review.likes, review.dislikes, review.workDetails].filter(Boolean).join(" · ");
                return (
                  <div key={`${review.platform}-${index}`} className="rounded border border-neutral-100 p-3">
                    <p className="text-[11px] font-semibold text-neutral-400">
                      {review.platform}
                      {review.rating !== null ? ` · ${review.rating}` : ""}
                      {review.jobProfile ? ` · ${review.jobProfile}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-neutral-800">{review.title || body || "리뷰"}</p>
                    {review.title && body && (
                      <p className="mt-1 text-xs text-neutral-600">{body.slice(0, 220)}</p>
                    )}
                  </div>
                );
              })}

              {report.reviews.glassdoorSnippets.map((snippet) => (
                <p key={snippet} className="text-xs text-neutral-600">
                  {snippet}
                </p>
              ))}

              {report.reviews.employeeReviews.length === 0 &&
                report.reviews.glassdoorSnippets.length === 0 && (
                  <p className="text-xs text-neutral-500">수집된 온라인 평가가 없습니다.</p>
                )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded border border-neutral-200 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">출처 목록</p>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {report.sources.map((source) => (
            <li key={`${source.label}-${source.url}`} className="text-xs text-neutral-600">
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {source.label}
                </a>
              ) : (
                source.label
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
