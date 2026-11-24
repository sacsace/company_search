"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CollectingOverlay } from "@/components/CollectingOverlay";
import { CompanyReport } from "@/components/CompanyReport";
import type { CompanyProfile } from "@/lib/types";

export function CompanyReportPage({ profile: initialProfile }: { profile: CompanyProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [researching, setResearching] = useState(false);
  const [mode, setMode] = useState<"standard" | "deep">("standard");
  const [error, setError] = useState<string | null>(null);

  const reload = async (nextMode: "standard" | "deep") => {
    setMode(nextMode);
    setResearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${encodeURIComponent(profile.cin)}?mode=${nextMode}`);
      if (!res.ok) throw new Error("failed");
      const next = await res.json();
      setProfile(next);
    } catch {
      setError(nextMode === "deep" ? "심층 조사에 실패했습니다." : "최신 정보 갱신에 실패했습니다.");
    } finally {
      setResearching(false);
    }
  };

  return (
    <div className="space-y-3">
      <CollectingOverlay open={researching} mode={mode === "deep" ? "deep" : "report"} />
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      <CompanyReport
        profile={profile}
        onClose={() => router.push("/")}
        researching={researching}
        onRefresh={() => reload("standard")}
        onDeepSearch={() => reload("deep")}
      />
    </div>
  );
}
