import { NextRequest, NextResponse } from "next/server";
import { buildCompanyProfile } from "@/lib/company-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cin: string }> }
) {
  const { cin } = await params;

  if (!cin) {
    return NextResponse.json({ error: "CIN이 필요합니다." }, { status: 400 });
  }

  try {
    const profile = await buildCompanyProfile(cin);
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Company fetch error:", error);
    return NextResponse.json(
      { error: "회사 정보를 가져오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
