import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "India Company Search",
  description: "인도 등록 기업 검색 및 비교",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full w-full">
      <body className={`${inter.variable} h-full w-full max-w-full font-sans antialiased`}>{children}</body>
    </html>
  );
}
