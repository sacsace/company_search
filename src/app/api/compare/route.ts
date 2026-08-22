import { NextRequest, NextResponse } from "next/server";
import { buildCompanyProfile } from "@/lib/company-service";
import { buildComparisonFields, generateComparisonSummary } from "@/lib/summary";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cins: string[] = (body.cins ?? [])
      .map((c: string) => c.trim().toUpperCase())
      .filter(Boolean);

    if (!Array.isArray(cins) || cins.length < 2 || cins.length > 4) {
      return NextResponse.json(
        { error: "비교하려면 2개에서 4개의 회사를 선택하세요." },
        { status: 400 }
      );
    }

    const companies = await Promise.all(cins.map((cin) => buildCompanyProfile(cin)));

    const comparedFields = buildComparisonFields(companies);
    const comparisonSummary = generateComparisonSummary(companies);

    return NextResponse.json({
      companies,
      comparedFields,
      comparisonSummary,
    });
  } catch (error) {
    console.error("Compare error:", error);
    return NextResponse.json(
      { error: "비교 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
