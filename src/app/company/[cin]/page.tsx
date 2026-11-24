import { CompanyWorkspace } from "@/components/CompanyWorkspace";
import { RightsBanner } from "@/components/RightsBanner";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ cin: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { cin } = await params;
  const { tab } = await searchParams;
  const initialTab = tab === "reviews" ? "reviews" : "report";

  return (
    <div className="app-shell min-h-screen w-full max-w-full">
      <header className="app-header w-full border-b border-neutral-200 bg-white">
        <div className="page-container flex w-full max-w-full items-center justify-between py-4">
          <div>
            <RightsBanner />
            <h1 className="mt-1 text-sm font-bold tracking-tight text-neutral-900">
              India Company Search
            </h1>
            <p className="mt-0.5 text-xs font-semibold text-neutral-500">기업 요약 보고서 · 댓글 및 평가</p>
          </div>
          <span className="hidden text-[11px] font-semibold text-neutral-400 sm:block">India only</span>
        </div>
      </header>

      <main className="app-main page-container w-full max-w-full py-8">
        <div className="content-panel w-full max-w-full">
          <CompanyWorkspace cin={cin} initialTab={initialTab} />
        </div>
      </main>
    </div>
  );
}
