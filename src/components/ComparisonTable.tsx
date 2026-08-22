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
      <div className="border border-neutral-200 py-16 text-center text-sm text-neutral-500">
        비교 검색 중...
      </div>
    );
  }

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-4">
      <div className="border border-neutral-200 bg-neutral-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">비교 요약</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600">{summary}</p>
      </div>

      <div className="w-full overflow-x-auto border border-neutral-200">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="w-32 bg-neutral-50 px-4 py-2.5 text-left text-xs font-medium text-neutral-500 sm:w-40">
                항목
              </th>
              {companyNames.map((name, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-medium text-neutral-900 break-words">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b border-neutral-100">
                <td className="bg-white px-4 py-2.5 text-xs text-neutral-500 align-top">
                  {field.label}
                </td>
                {field.values.map((value, i) => {
                  const displayValue =
                    typeof value === "number" && field.key.includes("Capital")
                      ? formatInr(value)
                      : String(value ?? "—");

                  return (
                    <td key={i} className="px-4 py-2.5 text-sm text-neutral-800 align-top break-words">
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
