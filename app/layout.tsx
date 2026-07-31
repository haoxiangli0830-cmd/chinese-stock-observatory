import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "中国股票与ETF价格观察台",
  description:
    "面向中国A股与交易所ETF的每日价格观察、年度高低点统计与可下载Excel报告。",
  openGraph: {
    title: "中国股票与ETF价格观察台",
    description: "A股与ETF价格 · 年度高低点 · 每日更新",
    locale: "zh_CN",
    type: "website",
    images: [
      {
        url: "/og-share.png",
        width: 1200,
        height: 630,
        alt: "中国股票与ETF价格观察台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "中国股票与ETF价格观察台",
    description: "A股与ETF价格 · 年度高低点 · 每日更新",
    images: ["/og-share.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
