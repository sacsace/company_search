import { NextRequest, NextResponse } from "next/server";
import { searchIndianCompanies } from "@/lib/company-service";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10), 50);

  try {
    const result = await searchIndianCompanies(query, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { results: [], source: "error", message: "검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
