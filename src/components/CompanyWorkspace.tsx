"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CollectingOverlay } from "@/components/CollectingOverlay";
import { CompanyReport } from "@/components/CompanyReport";
import type { CompanyProfile } from "@/lib/types";

type ViewTab = "report" | "reviews";

interface Props {
  cin: string;
  initialTab?: ViewTab;
}

export function CompanyWorkspace({ cin, initialTab = "report" }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [mode, setMode] = useState<"standard" | "deep">("standard");
  const [viewTab, setViewTab] = useState<ViewTab>(initialTab);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextMode: "standard" | "deep", isInitial = false) => {
    setMode(nextMode);
    if (isInitial) setLoading(true);
    else setResearching(true);
    setError(null);

    try {
      const res = await fetch(`/api/company/${encodeURIComponent(cin)}?mode=${nextMode}`);
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as CompanyProfile;
      setProfile(data);
    } catch {
      setError(
        nextMode === "deep"
          ? "심층 조사에 실패했습니다."
          : "기업 정보를 불러올 수 없습니다."
      );
    } finally {
      setLoading(false);
      setResearching(false);
    }
  };

  useEffect(() => {
    void load("standard", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cin]);

  return (
    <div className="space-y-4">
      <CollectingOverlay
        open={loading || researching}
        mode={loading || mode === "standard" ? "report" : "deep"}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <Link href="/" className="text-xs font-semibold text-neutral-500 hover:text-neutral-900">
          ← 검색 목록으로
        </Link>
        <nav className="flex gap-1" aria-label="기업 상세 메뉴">
          <button
            type="button"
            onClick={() => setViewTab("report")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${
              viewTab === "report"
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            기업 요약 보고서
          </button>
          <button
            type="button"
            onClick={() => setViewTab("reviews")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${
              viewTab === "reviews"
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            댓글 및 평가
          </button>
        </nav>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {!loading && !profile && !error && (
        <p className="py-10 text-center text-xs text-neutral-500">표시할 기업 정보가 없습니다.</p>
      )}

      {profile && (
        <CompanyReport
          profile={profile}
          onClose={() => router.push("/")}
          researching={researching}
          onRefresh={() => load("standard")}
          onDeepSearch={() => load("deep")}
          focusTab={viewTab === "reviews" ? "reviews" : "business"}
          hideInternalNav={viewTab === "reviews"}
          reviewsOnly={viewTab === "reviews"}
        />
      )}
    </div>
  );
}
