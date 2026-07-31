import type { Metadata } from "next";
import DashboardClient from "./dashboard-client";

export const metadata: Metadata = {
  title: "中国股票与ETF价格观察台",
  description:
    "查看中国A股与ETF价格走势、成交量、年度高低点，并管理公开观察名单。",
};

export default function Home() {
  return <DashboardClient />;
}
