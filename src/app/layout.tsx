import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "India Company Search | 인도 기업 정보 검색",
  description:
    "인도 MCA 등록 기업 정보 검색 및 2-4개 기업 비교 분석. 매출, 주주, 등기이사, 업종, 사무실 위치 등 공개/비공개 정보 통합 검색.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
