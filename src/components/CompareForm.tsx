"use client";

import { useState } from "react";
import type { CompanySearchResult } from "@/lib/types";
import clsx from "clsx";

interface CompareSlot {
  query: string;
  results: CompanySearchResult[];
  selected: CompanySearchResult | null;
}

interface CompareFormProps {
  onCompare: (cins: string[]) => void;
  loading?: boolean;
}

export function CompareForm({ onCompare, loading = false }: CompareFormProps) {
  const [inputs, setInputs] = useState(["", ""]);
  const [slots, setSlots] = useState<CompareSlot[] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const filledCount = inputs.filter((v) => v.trim()).length;
  const canAdd = inputs.length < 4;
  const canRemove = inputs.length > 2;

  const handleChange = (index: number, value: string) => {
    setInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setSlots(null);
    setResolveError(null);
  };

  const addInput = () => {
    if (inputs.length < 4) setInputs((prev) => [...prev, ""]);
  };

  const removeInput = (index: number) => {
    if (inputs.length <= 2) return;
    setInputs((prev) => prev.filter((_, i) => i !== index));
    setSlots(null);
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    const queries = inputs.map((v) => v.trim()).filter(Boolean);
    if (queries.length < 2) return;

    setResolving(true);
    setResolveError(null);
    setSlots(null);

    try {
      const res = await fetch("/api/compare/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResolveError(data.error || "회사 검색에 실패했습니다.");
        return;
      }

      const noResults = data.slots.filter(
        (s: CompareSlot) => s.results.length === 0
      );
      if (noResults.length > 0) {
        setResolveError(
          `검색 결과 없음: ${noResults.map((s: CompareSlot) => s.query).join(", ")}`
        );
      }

      setSlots(data.slots);
    } catch {
      setResolveError("회사 검색 중 오류가 발생했습니다.");
    } finally {
      setResolving(false);
    }
  };

  const selectCompany = (slotIndex: number, company: CompanySearchResult) => {
    setSlots((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[slotIndex] = { ...next[slotIndex], selected: company };
      return next;
    });
  };

  const handleCompare = () => {
    if (!slots) return;
    const cins = slots.map((s) => s.selected?.cin).filter(Boolean) as string[];
    if (cins.length >= 2) onCompare(cins);
  };

  const selectedCount = slots?.filter((s) => s.selected).length ?? 0;
  const slotsWithResults = slots?.filter((s) => s.results.length > 0) ?? [];
  const allSelected =
    slotsWithResults.length > 0 && slotsWithResults.every((s) => s.selected);

  return (
    <div className="w-full space-y-4">
      <form onSubmit={handleResolve} className="border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <h2 className="text-xs font-bold text-neutral-900">기업 비교</h2>
          <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
            회사명 또는 CIN을 입력한 뒤 확인하세요
          </p>
        </div>

        <div className="divide-y divide-neutral-200">
          {inputs.map((value, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 shrink-0 text-xs text-neutral-400">{i + 1}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => handleChange(i, e.target.value)}
                placeholder="회사명 또는 CIN"
                className="flex-1 border border-neutral-300 px-3 py-2 text-xs font-semibold focus:border-neutral-900 focus:outline-none"
              />
              {canRemove && (
                <button
                  type="button"
                  onClick={() => removeInput(i)}
                  className="shrink-0 px-2 text-xs text-neutral-400 hover:text-neutral-900"
                  aria-label="입력란 삭제"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
          {canAdd ? (
            <button
              type="button"
              onClick={addInput}
              className="text-xs text-neutral-600 hover:text-neutral-900"
            >
              + 회사 추가
            </button>
          ) : (
            <span className="text-xs text-neutral-400">최대 4개</span>
          )}
          <button
            type="submit"
            disabled={resolving || filledCount < 2}
            className="border border-neutral-900 bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {resolving ? "검색 중..." : "회사 확인하기"}
          </button>
        </div>
      </form>

      {resolveError && (
        <p className="text-xs text-red-600">{resolveError}</p>
      )}

      {slots && (
        <div className="border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <h3 className="text-xs font-semibold text-neutral-900">회사 선택</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              검색 결과에서 맞는 회사를 선택하세요
            </p>
          </div>

          <div className="divide-y divide-neutral-200">
            {slots.map((slot, slotIndex) => (
              <div key={slotIndex} className="px-4 py-4">
                <p className="text-xs text-neutral-500">
                  입력: <span className="text-neutral-700">{slot.query}</span>
                </p>

                {slot.results.length === 0 ? (
                  <p className="mt-2 text-xs text-red-600">검색 결과가 없습니다.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {slot.results.map((result) => {
                      const isSelected = slot.selected?.cin === result.cin;
                      return (
                        <li key={result.cin}>
                          <button
                            type="button"
                            onClick={() => selectCompany(slotIndex, result)}
                            className={clsx(
                              "w-full border px-3 py-2 text-left text-xs transition",
                              isSelected
                                ? "border-neutral-900 bg-neutral-900 text-white"
                                : "border-neutral-200 hover:border-neutral-400"
                            )}
                          >
                            <span className="font-medium">{result.name}</span>
                            <span
                              className={clsx(
                                "mt-0.5 block font-mono text-xs",
                                isSelected ? "text-neutral-300" : "text-neutral-500"
                              )}
                            >
                              {result.cin}
                            </span>
                            <span
                              className={clsx(
                                "mt-0.5 block text-xs",
                                isSelected ? "text-neutral-300" : "text-neutral-500"
                              )}
                            >
                              {[result.status, result.state, result.type]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-200 px-4 py-3">
            <button
              type="button"
              onClick={handleCompare}
              disabled={loading || selectedCount < 2 || !allSelected}
              className="w-full border border-neutral-900 bg-neutral-900 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? "비교 분석 중..."
                : `비교하기 (${selectedCount}개 선택됨)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
