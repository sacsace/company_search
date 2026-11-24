"use client";

import { useEffect, useState } from "react";

const MESSAGES = {
  search: [
    "회사 후보를 찾는 중…",
    "공개 기업 자료를 조회하는 중…",
    "브랜드명·정식 법인명을 대조하는 중…",
  ],
  report: [
    "웹·등기 정보를 수집하는 중…",
    "홈페이지·뉴스·관계사 자료를 확인하는 중…",
    "출처를 정리해 요약 보고서를 만드는 중…",
  ],
  deep: [
    "미확인 항목을 추가로 조사하는 중…",
    "신용평가·재무·리뷰 출처를 확장 검색하는 중…",
    "새 근거를 검증해 보고서를 보강하는 중…",
  ],
  compare: [
    "비교 대상 기업 정보를 수집하는 중…",
    "사업·인도 거점·규모 항목을 맞추는 중…",
    "비교표를 정리하는 중…",
  ],
} as const;

export type CollectingMode = keyof typeof MESSAGES;

const TITLES: Record<CollectingMode, string> = {
  search: "기업 검색 중",
  report: "기업 정보 수집 중",
  deep: "심층 조사 중",
  compare: "기업 비교 중",
};

interface Props {
  open: boolean;
  mode?: CollectingMode;
}

export function CollectingOverlay({ open, mode = "report" }: Props) {
  const [index, setIndex] = useState(0);
  const messages = MESSAGES[mode];

  useEffect(() => {
    if (!open) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="collecting-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collecting-title"
      aria-live="polite"
    >
      <div className="collecting-panel">
        <div className="collecting-orbit" aria-hidden="true">
          <span className="collecting-dot collecting-dot-a" />
          <span className="collecting-dot collecting-dot-b" />
          <span className="collecting-dot collecting-dot-c" />
          <span className="collecting-core" />
        </div>

        <h2 id="collecting-title" className="mt-5 text-sm font-bold text-neutral-900">
          {TITLES[mode]}
        </h2>
        <p className="collecting-message mt-2 text-xs font-semibold text-neutral-600">
          {messages[index]}
        </p>
        <div className="collecting-bar mt-5" aria-hidden="true">
          <span className="collecting-bar-fill" />
        </div>
        <p className="mt-3 text-[11px] font-semibold text-neutral-400">
          공개 자료를 모으는 데 수십 초 걸릴 수 있습니다
        </p>
      </div>
    </div>
  );
}
