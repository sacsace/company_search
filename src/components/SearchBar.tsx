"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
}

export function SearchBar({ onSearch, loading = false }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="search-form flex w-full max-w-full gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        placeholder="회사명 또는 CIN 번호 입력"
        autoComplete="off"
        // Surfshark 등 브라우저 확장이 data-sharkid를 주입해 SSR/CSR 불일치가 날 수 있음
        suppressHydrationWarning
        className="min-w-0 flex-1 border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-900 placeholder:font-medium placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />
      <button
        type="submit"
        disabled={loading}
        className="shrink-0 cursor-pointer border border-neutral-900 bg-neutral-900 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? "검색 중" : "검색"}
      </button>
    </form>
  );
}
