"use client";

import type { ComparisonField } from "@/lib/types";
import { formatInr } from "@/lib/cin-parser";

interface ComparisonTableProps {
  fields: ComparisonField[];
  companyNames: string[];
  summary: string;
  loading?: boolean;
}

export function ComparisonTable({
  fields,
  companyNames,
  summary,
  loading = false,
}: ComparisonTableProps) {
  if (loading) {
    return (
      <div className="border border-neutral-200 py-12 text-center text-xs text-neutral-500">
        비교 검색 중...
      </div>
    );
  }

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-3">
      <div className="border border-neutral-200 bg-neutral-50 px-3 py-2">
        <h2 className="text-[11px] font-semibold text-neutral-900">비교 요약</h2>
        <p className="mt-1 text-[11px] leading-snug text-neutral-600">{summary}</p>
      </div>

      <div className="w-full overflow-x-auto border border-neutral-200">
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="w-28 bg-neutral-50 px-3 py-2 text-left text-[11px] font-medium text-neutral-500 sm:w-32">
                항목
              </th>
              {companyNames.map((name, i) => (
                <th key={i} className="px-3 py-2 text-left text-[11px] font-medium text-neutral-900 break-words">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b border-neutral-100">
                <td className="bg-white px-3 py-2 text-[11px] text-neutral-500 align-top">
                  {field.label}
                </td>
                {field.values.map((value, i) => {
                  const displayValue =
                    typeof value === "number" && field.key.includes("Capital")
                      ? formatInr(value)
                      : String(value ?? "—");

                  const isLongText = field.key === "summary" || field.key === "business" || field.key === "webAddress";

                  return (
                    <td
                      key={i}
                      className={`px-3 py-2 text-xs text-neutral-800 align-top break-words${isLongText ? " whitespace-pre-line leading-snug" : ""}`}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
