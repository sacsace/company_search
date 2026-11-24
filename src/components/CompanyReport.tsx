"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompanyProfile, FactConfidence, ReportFact } from "@/lib/types";
import { buildCompanyReport } from "@/lib/company-report";

type DetailTab = "business" | "relations" | "news" | "contact" | "reviews";

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
  "shared-director": "공통 이사",
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

function SourceLink({ href, label = "원문 보기" }: { href?: string | null; label?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex text-[11px] font-semibold text-blue-700 underline"
    >
      {label}
    </a>
  );
}

interface Props {
  profile: CompanyProfile;
  onClose: () => void;
  onRefresh?: () => void;
  onDeepSearch?: () => void;
  researching?: boolean;
  /** @deprecated use onDeepSearch */
  onResearch?: () => void;
  focusTab?: DetailTab;
  reviewsOnly?: boolean;
  hideInternalNav?: boolean;
}

export function CompanyReport({
  profile,
  onClose,
  onRefresh,
  onDeepSearch,
  researching,
  onResearch,
  focusTab = "business",
  reviewsOnly = false,
  hideInternalNav = false,
}: Props) {
  const report = useMemo(() => buildCompanyReport(profile), [profile]);
  const [activeTab, setActiveTab] = useState<DetailTab>(focusTab);
  const deepHandler = onDeepSearch || onResearch;

  useEffect(() => {
    setActiveTab(focusTab);
  }, [focusTab]);

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

  const reviewItems = [
    ...report.reviews.employeeReviews.map((review) => ({
      kind: "직원 평가" as const,
      platform: review.platform,
      meta: [
        review.rating !== null ? String(review.rating) : null,
        review.jobProfile,
        review.date,
      ]
        .filter(Boolean)
        .join(" · "),
      title: review.title,
      body: [review.likes, review.dislikes, review.workDetails].filter(Boolean).join(" · "),
      url: review.url,
    })),
    ...report.reviews.websiteReviews.map((review) => ({
      kind: "웹 리뷰" as const,
      platform: review.source || "웹",
      meta: [review.author, review.rating].filter(Boolean).join(" · "),
      title: null as string | null,
      body: review.text,
      url: review.url,
    })),
    ...profile.webEnrichment.snsComments.map((comment) => ({
      kind: "웹·SNS" as const,
      platform: comment.platform,
      meta: [comment.author, comment.date, comment.rating].filter(Boolean).join(" · "),
      title: null as string | null,
      body: comment.text,
      url: comment.url,
    })),
  ].filter((item) => item.url || (item.body && item.body.length > 20));

  return (
    <section className="w-full max-w-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
            {reviewsOnly ? "댓글 및 평가" : "기업 요약 보고서"}
          </p>
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
            조사 시각: {new Date(report.generatedAt).toLocaleString("ko-KR")}
            {report.freshness.lastAgmDate ? ` · AGM ${report.freshness.lastAgmDate}` : ""}
          </p>
        </div>
        {!reviewsOnly && (
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={researching}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {researching ? "갱신 중..." : "최신 정보 갱신"}
              </button>
            )}
            {deepHandler && (
              <button
                type="button"
                onClick={deepHandler}
                disabled={researching}
                className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {researching ? "심층 조사 중..." : "심층 조사"}
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
        )}
        {reviewsOnly && (
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={researching}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {researching ? "갱신 중..." : "다시 수집"}
              </button>
            )}
          </div>
        )}
      </div>

      {!reviewsOnly && (
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
      )}

      {!reviewsOnly && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-neutral-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">평가 요약</p>
              <p className="mt-1 text-[11px] font-semibold text-neutral-500">
                근거 충분성:{" "}
                {report.assessment.evidenceLevel === "high"
                  ? "높음"
                  : report.assessment.evidenceLevel === "medium"
                    ? "보통"
                    : "낮음"}{" "}
                (점수 아님)
              </p>
              <div className="mt-2 space-y-2 text-xs leading-relaxed text-neutral-700">
                <p className="whitespace-pre-line">
                  <span className="font-bold text-emerald-700">강점</span>
                  {"\n"}
                  {report.assessment.strengths.length
                    ? report.assessment.strengths.map((item) => `· ${item}`).join("\n")
                    : "· 확인된 강점 없음"}
                </p>
                <p className="whitespace-pre-line">
                  <span className="font-bold text-amber-700">주의사항</span>
                  {"\n"}
                  {report.assessment.cautions.length
                    ? report.assessment.cautions.map((item) => `· ${item}`).join("\n")
                    : "· 확인된 주의사항 없음"}
                </p>
                <p className="whitespace-pre-line">
                  <span className="font-bold text-neutral-600">판단 보류</span>
                  {"\n"}
                  {report.assessment.deferred.length
                    ? report.assessment.deferred.map((item) => `· ${item}`).join("\n")
                    : "· 해당 없음"}
                </p>
              </div>
            </div>
            <div className="rounded border border-neutral-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">정보 신뢰도</p>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-700">
                {report.freshness.notes.map((note) => (
                  <li key={note}>· {note}</li>
                ))}
                <li>· 출처 {report.sources.length}건 · 확인됨/추정/충돌/미확인을 항목별로 표시</li>
                {report.assessment.followUps.slice(0, 3).map((item) => (
                  <li key={item}>· 추가 확인: {item}</li>
                ))}
                {profile.webEnrichment.deepSearchNotes?.slice(0, 3).map((note) => (
                  <li key={note}>· {note}</li>
                ))}
              </ul>
            </div>
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
        </>
      )}

      <div>
        {!hideInternalNav && !reviewsOnly && (
          <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
            {(
              [
                ["business", "사업 현황"],
                ["relations", "관계사·인물"],
                ["news", "최근 소식"],
                ["contact", "연락처"],
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
        )}

        <div className="mt-3">
          {!reviewsOnly &&
            activeTab !== "reviews" &&
            detailMap[activeTab].map((section) => (
              <div key={section.id} className="mb-4">
                <h3 className="text-sm font-bold text-neutral-800">{section.title}</h3>
                {section.facts.map((item) => (
                  <FactRow key={`${section.id}-${item.label}`} item={item} />
                ))}
              </div>
            ))}

          {(reviewsOnly || activeTab === "reviews") && (
            <div className="space-y-3">
              <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                  플랫폼 검색 결과
                </p>
                <ul className="mt-2 space-y-2 text-xs text-neutral-700">
                  {(report.reviews.searchStatus.length
                    ? report.reviews.searchStatus
                    : [
                        { platform: "AmbitionBox", status: "not_found" as const, detail: "상태 미기록" },
                        { platform: "Glassdoor", status: "not_found" as const, detail: "상태 미기록" },
                        { platform: "Google Maps", status: "not_found" as const, detail: "상태 미기록" },
                      ]
                  ).map((item) => {
                    const platformUrl =
                      item.platform === "AmbitionBox"
                        ? report.reviews.ambitionBoxUrl
                        : item.platform === "Glassdoor"
                          ? report.reviews.glassdoorUrl
                          : item.platform === "Google Maps"
                            ? report.reviews.googleMapsUrl
                            : null;
                    return (
                      <li key={item.platform} className="flex flex-wrap items-center gap-2">
                        <span>
                          · {item.platform}:{" "}
                          {item.status === "found"
                            ? "수집됨"
                            : item.status === "blocked"
                              ? "접근 제한"
                              : item.status === "error"
                                ? "오류"
                                : "검색했으나 확인 불가"}
                          {item.detail ? ` — ${item.detail}` : ""}
                        </span>
                        <SourceLink href={platformUrl} label="페이지 열기" />
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-neutral-500">
                  웹에서 찾은 항목은 반드시 원문 링크로 확인할 수 있습니다. 리뷰 내용은 작성자 의견입니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-xs font-semibold text-neutral-600">
                {report.reviews.ambitionBoxRating !== null && (
                  <span>
                    직원 · AmbitionBox {report.reviews.ambitionBoxRating.toFixed(1)}
                    {report.reviews.ambitionBoxReviewCount
                      ? ` (${report.reviews.ambitionBoxReviewCount}건)`
                      : ""}
                  </span>
                )}
                {report.reviews.glassdoorRating !== null && (
                  <span>직원 · Glassdoor {report.reviews.glassdoorRating.toFixed(1)}</span>
                )}
                {report.reviews.googleMapsRating !== null && (
                  <span>고객 · Google Maps {report.reviews.googleMapsRating.toFixed(1)}</span>
                )}
              </div>

              {reviewItems.slice(0, 15).map((item, index) => (
                <div key={`${item.platform}-${index}`} className="rounded border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-neutral-400">
                      {item.kind} · {item.platform}
                      {item.meta ? ` · ${item.meta}` : ""}
                    </p>
                    <SourceLink href={item.url} />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-neutral-800">
                    {item.title || item.body.slice(0, 160) || "내용 없음"}
                  </p>
                  {item.title && item.body && (
                    <p className="mt-1 text-xs leading-relaxed text-neutral-600">{item.body.slice(0, 240)}</p>
                  )}
                  {item.url && (
                    <p className="mt-2 break-all text-[11px] text-neutral-400">{item.url}</p>
                  )}
                </div>
              ))}

              {report.reviews.glassdoorSnippets.map((snippet, index) => (
                <div key={`gd-snip-${index}`} className="rounded border border-neutral-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-neutral-400">Glassdoor 스니펫</p>
                    <SourceLink href={report.reviews.glassdoorUrl} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-700">{snippet}</p>
                </div>
              ))}

              {reviewItems.length === 0 && report.reviews.glassdoorSnippets.length === 0 && (
                <p className="text-xs text-neutral-500">
                  평가·댓글 원문은 수집되지 않았습니다. 위 플랫폼 검색 결과에서 접근·미확인 여부를 확인하세요.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {!reviewsOnly && (
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
      )}
    </section>
  );
}
