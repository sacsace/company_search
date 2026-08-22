"use client";

import { Building2, MapPin, Calendar, CheckCircle2, XCircle } from "lucide-react";
import type { CompanySearchResult } from "@/lib/types";
import clsx from "clsx";

interface SearchResultsProps {
  results: CompanySearchResult[];
  selectedCins: string[];
  onSelect: (result: CompanySearchResult) => void;
  onViewDetail: (cin: string) => void;
}

export function SearchResults({
  results,
  selectedCins,
  onSelect,
  onViewDetail,
}: SearchResultsProps) {
  if (results.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{results.length}개 결과</p>
      {results.map((result) => {
        const isSelected = selectedCins.includes(result.cin);
        const isActive = result.status.toLowerCase().includes("active");

        return (
          <div
            key={result.cin}
            className={clsx(
              "animate-fade-in rounded-xl border bg-white p-4 transition hover:shadow-md",
              isSelected ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 shrink-0 text-brand-600" />
                  <h3 className="truncate font-semibold text-slate-900">{result.name}</h3>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{result.cin}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    {isActive ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    {result.status}
                  </span>
                  <span>{result.type}</span>
                  <span>{result.listingStatus}</span>
                  {result.state && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {result.state}
                    </span>
                  )}
                  {result.dateOfIncorporation && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {result.dateOfIncorporation}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  onClick={() => onViewDetail(result.cin)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  상세보기
                </button>
                <button
                  onClick={() => onSelect(result)}
                  disabled={!isSelected && selectedCins.length >= 4}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    isSelected
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                  )}
                >
                  {isSelected ? "선택됨" : "비교 선택"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
