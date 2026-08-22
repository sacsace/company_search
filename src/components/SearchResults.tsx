"use client";

import type { CompanySearchResult } from "@/lib/types";
import Link from "next/link";

interface SearchResultsProps {
  results: CompanySearchResult[];
  onViewDetail: (cin: string) => void;
}

export function SearchResults({ results, onViewDetail }: SearchResultsProps) {
  if (results.length === 0) return null;

  return (
    <div className="w-full border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold text-neutral-500">
        {results.length}건
      </div>
      <ul className="divide-y divide-neutral-200">
        {results.map((result) => (
          <li key={result.cin} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50">
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onViewDetail(result.cin)}
                className="text-left text-xs font-bold text-neutral-900 hover:underline"
              >
                {result.name}
              </button>
              <p className="mt-0.5 font-mono text-xs text-neutral-500">{result.cin}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {[result.status, result.type, result.state, result.listingStatus]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Link
              href={`/company/${result.cin}`}
              className="shrink-0 border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:border-neutral-900"
            >
              전체 보기
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
