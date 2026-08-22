"use client";

import { Search, Loader2 } from "lucide-react";
import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  loading = false,
  placeholder = "회사명 또는 CIN 번호로 검색 (예: RELIANCE, L17110MH1973PLC019786)",
}: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-4 h-5 w-5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-32 text-base shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              검색 중
            </span>
          ) : (
            "검색"
          )}
        </button>
      </div>
    </form>
  );
}
