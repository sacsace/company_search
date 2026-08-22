import { NextRequest, NextResponse } from "next/server";
import { searchIndianCompanies } from "@/lib/company-service";
import type { CompanySearchResult } from "@/lib/types";

const CIN_PATTERN = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const queries: string[] = (body.queries ?? [])
      .map((q: string) => q.trim())
      .filter(Boolean);

    if (!Array.isArray(queries) || queries.length < 2 || queries.length > 4) {
      return NextResponse.json(
        { error: "2개에서 4개의 회사명 또는 CIN을 입력하세요." },
        { status: 400 }
      );
    }

    const slots = await Promise.all(
      queries.map(async (query) => {
        const { results } = await searchIndianCompanies(query, 8);
        let selected: CompanySearchResult | null = null;

        if (CIN_PATTERN.test(query) && results.length > 0) {
          selected = results.find((r) => r.cin.toUpperCase() === query.toUpperCase()) ?? results[0];
        } else if (results.length === 1) {
          selected = results[0];
        } else if (results.length > 1) {
          const q = query.toLowerCase();
          const exact = results.find((r) => r.name.toLowerCase() === q);
          if (exact) selected = exact;
        }

        return { query, results, selected };
      })
    );

    return NextResponse.json({ slots });
  } catch (error) {
    console.error("Resolve error:", error);
    return NextResponse.json({ error: "회사 검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
