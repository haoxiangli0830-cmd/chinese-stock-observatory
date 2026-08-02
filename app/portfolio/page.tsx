import type { Metadata } from "next";
import {
  chatGPTSignOutPath,
  requireChatGPTUser,
} from "../chatgpt-auth";
import PortfolioClient from "./portfolio-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我的投资 | 中国股票与ETF价格观察台",
  description: "安全记录个人A股与ETF投资，并按最新日终价格查看未实现盈亏。",
};

export default async function PortfolioPage() {
  const user = await requireChatGPTUser("/portfolio");
  return (
    <PortfolioClient
      signOutHref={chatGPTSignOutPath("/")}
      userName={user.displayName}
    />
  );
}
