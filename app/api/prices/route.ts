import { listStocks, queryStoredPrices } from "../../../lib/database";
import { getBundledBankHistory, periodStart } from "../../../lib/market-data";
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
    return Response.json({ error: "请选择至少一个股票或ETF品种" }, { status: 400 });
  }

  try {
    const stockLookup = new Map(
      (await listStocks()).map((stock) => [stock.symbol, stock]),
    );
    const startDate = periodStart(period);
    const series = await Promise.all(
      symbols.map(async (symbol) => {
        const stock = stockLookup.get(symbol);
        const requestedCache = await queryStoredPrices(
          symbol,
          adjustment,
          startDate,
        );
        if (requestedCache.length) {
          return {
            symbol,
            points: requestedCache,
            source: "AKShare 日终数据库",
            actualAdjustment: adjustment,
            syncStatus: stock?.syncStatus ?? "ready",
            lastSuccessAt: stock?.lastSuccessAt ?? null,
          };
        }

        if (adjustment === "qfq") {
          const rawCache = await queryStoredPrices(symbol, "raw", startDate);
          if (rawCache.length) {
            return {
              symbol,
              points: rawCache,
              source: "AKShare 日终数据库（不复权回退）",
              actualAdjustment: "raw" as const,
              syncStatus: stock?.syncStatus ?? "ready",
              lastSuccessAt: stock?.lastSuccessAt ?? null,
            };
          }
        }

        const bundled = getBundledBankHistory(symbol, startDate);
        if (bundled.length) {
          return {
            symbol,
            points: bundled,
            source: "内置历史快照（不复权）",
            actualAdjustment: "raw" as const,
            syncStatus: stock?.syncStatus ?? "ready",
            lastSuccessAt: stock?.lastSuccessAt ?? null,
          };
        }

        return {
          symbol,
          points: [],
          source: "AKShare 日终数据库",
          actualAdjustment: adjustment,
          syncStatus: stock?.syncStatus ?? "pending",
          lastSuccessAt: stock?.lastSuccessAt ?? null,
          error: stock?.errorMessage ?? null,
        };
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
