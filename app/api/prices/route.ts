import { queryStoredPrices } from "../../../lib/database";
import {
  fetchEastmoneyHistory,
  periodStart,
} from "../../../lib/market-data";
import type { Adjustment, Period } from "../../../lib/types";

const periods = new Set(["1M", "6M", "YTD", "1Y", "5Y", "MAX"]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbols = (params.get("symbols") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
  const period = periods.has(params.get("period") ?? "")
    ? (params.get("period") as Period)
    : "1Y";
  const adjustment: Adjustment =
    params.get("adjust") === "raw" ? "raw" : "qfq";

  if (!symbols.length) {
    return Response.json({ error: "请选择至少一只股票" }, { status: 400 });
  }

  try {
    const series = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const points = await fetchEastmoneyHistory(
            symbol,
            adjustment,
            period,
          );
          return { symbol, points, source: "东方财富" };
        } catch (externalError) {
          const stored = await queryStoredPrices(
            symbol,
            adjustment,
            periodStart(period),
          );
          if (!stored.length) throw externalError;
          return { symbol, points: stored, source: "本地日终缓存" };
        }
      }),
    );

    return Response.json({
      series,
      period,
      adjustment,
      retrievedAt: new Date().toISOString(),
      delayed: true,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取行情失败" },
      { status: 502 },
    );
  }
}
