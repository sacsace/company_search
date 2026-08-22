"use client";

import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { CompanyDetail } from "@/components/CompanyDetail";
import { ComparisonTable } from "@/components/ComparisonTable";
import type { CompanyProfile, CompanySearchResult, ComparisonField } from "@/lib/types";
import { Building2, GitCompare, AlertCircle, X, Flag } from "lucide-react";

export default function Home() {
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [selectedCins, setSelectedCins] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<CompanySearchResult[]>([]);
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

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.message && data.results.length === 0) {
        setMessage(data.message);
        setResults([]);
      } else {
        setResults(data.results);
        if (data.results.length === 0) {
          setMessage("검색 결과가 없습니다. 다른 검색어를 시도해보세요.");
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
    setActiveTab("search");

    try {
      const res = await fetch(`/api/company/${encodeURIComponent(cin)}`);
      if (!res.ok) throw new Error("Failed");
      const profile = await res.json();
      setDetailProfile(profile);
    } catch {
      setError("회사 상세 정보를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelect = (result: CompanySearchResult) => {
    setSelectedCins((prev) => {
      if (prev.includes(result.cin)) {
        setSelectedCompanies((companies) => companies.filter((c) => c.cin !== result.cin));
        return prev.filter((c) => c !== result.cin);
      }
      if (prev.length >= 4) return prev;
      setSelectedCompanies((companies) => [...companies, result]);
      return [...prev, result.cin];
    });
  };

  const handleCompare = async () => {
    if (selectedCins.length < 2) return;

    setCompareLoading(true);
    setError(null);
    setActiveTab("compare");

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cins: selectedCins }),
      });

      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCompareFields(data.comparedFields);
      setCompareSummary(data.comparisonSummary);
      setCompareNames(data.companies.map((c: CompanyProfile) => c.name));
    } catch {
      setError("비교 분석 중 오류가 발생했습니다.");
    } finally {
      setCompareLoading(false);
    }
  };

  const removeSelected = (cin: string) => {
    setSelectedCins((prev) => prev.filter((c) => c !== cin));
    setSelectedCompanies((prev) => prev.filter((c) => c.cin !== cin));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-saffron via-white to-india shadow">
              <Flag className="h-5 w-5 text-brand-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">India Company Search</h1>
              <p className="text-sm text-slate-500">인도 기업 정보 검색 · 비교 분석 시스템</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-8">
          <SearchBar onSearch={handleSearch} loading={searchLoading} />
          <p className="mt-3 text-center text-xs text-slate-400">
            인도 MCA 등록 기업만 검색 가능 · 회사명 또는 21자리 CIN으로 검색 · 2~4개 기업 비교 지원
          </p>
        </section>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        {selectedCompanies.length > 0 && (
          <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-brand-600" />
                <span className="text-sm font-semibold text-brand-800">
                  비교 선택됨 ({selectedCompanies.length}/4)
                </span>
              </div>
              <button
                onClick={handleCompare}
                disabled={selectedCins.length < 2 || compareLoading}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {compareLoading ? "분석 중..." : `${selectedCins.length}개 기업 비교하기`}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCompanies.map((c) => (
                <span
                  key={c.cin}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                >
                  <Building2 className="h-3 w-3" />
                  {c.name}
                  <button onClick={() => removeSelected(c.cin)} className="ml-1 text-slate-400 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            {selectedCins.length < 2 && (
              <p className="mt-2 text-xs text-brand-600">비교하려면 최소 2개 기업을 선택하세요.</p>
            )}
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setActiveTab("search")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "search"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            검색 결과
          </button>
          <button
            onClick={() => setActiveTab("compare")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "compare"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            비교 분석
          </button>
        </div>

        {activeTab === "search" && (
          <div className="space-y-6">
            <SearchResults
              results={results}
              selectedCins={selectedCins}
              onSelect={handleSelect}
              onViewDetail={handleViewDetail}
            />

            {detailLoading && (
              <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-slate-500">
                상세 정보를 불러오는 중...
              </div>
            )}

            {detailProfile && !detailLoading && (
              <CompanyDetail profile={detailProfile} onClose={() => setDetailProfile(null)} />
            )}
          </div>
        )}

        {activeTab === "compare" && (
          <ComparisonTable
            fields={compareFields}
            companyNames={compareNames}
            summary={compareSummary}
            loading={compareLoading}
          />
        )}

        {!searchLoading && results.length === 0 && !detailProfile && activeTab === "search" && !message && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16 text-center">
            <Building2 className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-semibold text-slate-600">인도 기업을 검색해보세요</h3>
            <p className="mt-2 text-sm text-slate-400">
              예: TATA, INFOSYS, RELIANCE, WIPRO 또는 CIN 번호
            </p>
            <div className="mx-auto mt-6 max-w-lg text-left text-xs text-slate-400">
              <p className="font-medium text-slate-500">검색 가능 정보:</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>MCA 등록 정보 (CIN, 상태, 유형, 자본금)</li>
                <li>등기이사, 업종, 등록 사무실 위치</li>
                <li>공개 웹 정보 (매출, 웹사이트, 주주 등)</li>
                <li>2~4개 기업 동시 비교 분석</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>데이터 출처: India MCA (data.gov.in), 공개 웹 검색 · 저장 기능 없음</p>
        <p className="mt-1">
          API 키 설정: .env.local에 DATA_GOV_API_KEY 추가 (
          <a href="https://data.gov.in" className="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">
            data.gov.in
          </a>
          에서 무료 발급)
        </p>
      </footer>
    </div>
  );
}
