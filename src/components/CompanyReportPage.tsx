"use client";

import { useRouter } from "next/navigation";
import { CompanyReport } from "@/components/CompanyReport";
import type { CompanyProfile } from "@/lib/types";

export function CompanyReportPage({ profile }: { profile: CompanyProfile }) {
  const router = useRouter();

  return (
    <CompanyReport
      profile={profile}
      onClose={() => router.push("/")}
      onResearch={() => router.refresh()}
    />
  );
}
