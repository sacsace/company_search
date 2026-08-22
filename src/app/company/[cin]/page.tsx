import { CompanyDetail } from "@/components/CompanyDetail";
import { RightsBanner } from "@/components/RightsBanner";
import { buildCompanyProfile } from "@/lib/company-service";
import Link from "next/link";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ cin: string }>;
}) {
  const { cin } = await params;
  const profile = await buildCompanyProfile(cin);

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="page-container py-5">
          <RightsBanner />
          <div className="mt-2 flex items-center justify-between">
            <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
              ← 검색으로 돌아가기
            </Link>
            <span className="text-[11px] font-semibold text-neutral-400">India only</span>
          </div>
        </div>
      </header>

      <main className="page-container py-8">
        <CompanyDetail profile={profile} />
      </main>
    </div>
  );
}
