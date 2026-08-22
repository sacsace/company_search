"use client";

import { GitCompare, Loader2 } from "lucide-react";
import type { ComparisonField } from "@/lib/types";
import { formatInr } from "@/lib/cin-parser";
import clsx from "clsx";

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
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <span className="ml-3 text-slate-600">비교 분석 중...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-india p-6 text-white">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5" />
          <h2 className="text-lg font-bold">기업 비교 분석</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/90">{summary}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700">
                항목
              </th>
              {companyNames.map((name, i) => (
                <th key={i} className="px-4 py-3 text-left font-semibold text-slate-700">
                  <span className="line-clamp-2">{name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-600">
                  {field.label}
                </td>
                {field.values.map((value, i) => {
                  const displayValue =
                    typeof value === "number" && field.key.includes("Capital")
                      ? formatInr(value)
                      : String(value ?? "—");

                  const isHighlight =
                    field.highlight === "max" &&
                    typeof value === "number" &&
                    value === Math.max(...(field.values.filter((v) => typeof v === "number") as number[])) &&
                    value > 0;

                  return (
                    <td
                      key={i}
                      className={clsx(
                        "px-4 py-3 text-slate-800",
                        isHighlight && "bg-green-50 font-semibold text-green-800"
                      )}
                    >
                      <span className="line-clamp-4">{displayValue}</span>
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
