"use client";

import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { CompanyDetail } from "@/components/CompanyDetail";
import { CompareForm } from "@/components/CompareForm";
import { ComparisonTable } from "@/components/ComparisonTable";
import { RightsBanner } from "@/components/RightsBanner";
import type { CompanyProfile, CompanySearchResult, ComparisonField } from "@/lib/types";

export default function Home() {
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [detailProfile, setDetailProfile] = useState<CompanyProfile | null>(null);
  const [compareFields, setCompareFields] = useState<ComparisonField[]>([]);
  const [compareSummary, setCompareSummary] = useState("");
  const [compareNames, setCompareNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "compare">("search");

  const handleSearch = async (query: string) => {
    setSearchLoading(true);
    setError(null);
    setMessage(null);
    setDetailProfile(null);
    setActiveTab("search");

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.message && data.results.length === 0) {
        setMessage(data.message);
        setResults([]);
      } else {
        setResults(data.results);
        if (data.results.length === 0) {
          setMessage("검색 결과가 없습니다.");
        }
      }
    } catch {
      setError("검색 중 오류가 발생했습니다.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleViewDetail = async (cin: string) => {
    setDetailLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/company/${encodeURIComponent(cin)}`);
      if (!res.ok) throw new Error("Failed");
      const profile = await res.json();
      setDetailProfile(profile);
    } catch {
      setError("상세 정보를 불러올 수 없습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCompare = async (cins: string[]) => {
    setCompareLoading(true);
    setError(null);
    setMessage(null);
    setCompareFields([]);
    setCompareSummary("");
    setCompareNames([]);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cins }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "비교 분석 중 오류가 발생했습니다.");
        return;
      }

      setCompareFields(data.comparedFields);
      setCompareSummary(data.comparisonSummary);
      setCompareNames(data.companies.map((c: CompanyProfile) => c.name));
    } catch {
      setError("비교 분석 중 오류가 발생했습니다.");
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <div className="app-shell min-h-screen w-full max-w-full">
      <header className="app-header w-full border-b border-neutral-200 bg-white">
        <div className="page-container flex w-full max-w-full items-center justify-between py-4">
          <div>
            <RightsBanner />
            <h1 className="mt-1 text-base font-bold tracking-tight text-neutral-900">
              India Company Search
            </h1>
            <p className="mt-0.5 text-xs font-semibold text-neutral-500">인도 기업 웹 검색 · 비교</p>
          </div>
          <span className="hidden text-[11px] font-semibold text-neutral-400 sm:block">India only</span>
        </div>
      </header>

      <main className="app-main page-container w-full max-w-full py-8">
        <div className="content-panel w-full max-w-full border-b border-neutral-200">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("search")}
              className={`px-4 py-2 text-xs font-bold transition ${
                activeTab === "search"
                  ? "border-b-2 border-neutral-900 font-bold text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              검색
            </button>
            <button
              onClick={() => setActiveTab("compare")}
              className={`px-4 py-2 text-xs font-bold transition ${
                activeTab === "compare"
                  ? "border-b-2 border-neutral-900 font-bold text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              비교 검색
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}
        {message && !error && (
          <p className="mt-4 text-xs font-semibold text-neutral-500">{message}</p>
        )}

        <div className="content-panel mt-8 w-full max-w-full">
          {activeTab === "search" && (
            <div className="w-full max-w-full space-y-6">
              <SearchBar onSearch={handleSearch} loading={searchLoading} />

              <SearchResults results={results} onViewDetail={handleViewDetail} />

              {detailLoading && (
                <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>
              )}

              {detailProfile && !detailLoading && (
                <CompanyDetail profile={detailProfile} onClose={() => setDetailProfile(null)} />
              )}
            </div>
          )}

          {activeTab === "compare" && (
            <div className="w-full max-w-full space-y-6">
              <CompareForm onCompare={handleCompare} loading={compareLoading} />

              {(compareLoading || compareFields.length > 0) && (
                <ComparisonTable
                  fields={compareFields}
                  companyNames={compareNames}
                  summary={compareSummary}
                  loading={compareLoading}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
