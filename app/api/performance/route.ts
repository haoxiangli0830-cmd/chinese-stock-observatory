import {
  listStocks,
  queryRecentActivePrices,
} from "../../../lib/database";
import {
  calculatePerformance,
  shiftCalendarMonths,
} from "../../../lib/performance";
import type {
  Adjustment,
  PerformanceRow,
  PricePoint,
} from "../../../lib/types";

export const dynamic = "force-dynamic";

function groupBySymbol(points: PricePoint[]) {
  const grouped = new Map<string, PricePoint[]>();
  for (const point of points) {
    grouped.set(point.symbol, [...(grouped.get(point.symbol) ?? []), point]);
  }
  return grouped;
}

function calendarDayDifference(left: string, right: string) {
  const leftTime = Date.parse(`${left}T00:00:00Z`);
  const rightTime = Date.parse(`${right}T00:00:00Z`);
  return Math.round(Math.abs(leftTime - rightTime) / 86_400_000);
}

export async function GET(request: Request) {
  try {
    const requestedAdjustment: Adjustment =
      new URL(request.url).searchParams.get("adjust") === "qfq" ? "qfq" : "raw";
    const today = new Date().toISOString().slice(0, 10);
    const startDate = shiftCalendarMonths(today, 14);
    const [stocks, requestedPoints, rawPoints] = await Promise.all([
      listStocks(),
      queryRecentActivePrices(requestedAdjustment, startDate),
      requestedAdjustment === "qfq"
        ? queryRecentActivePrices("raw", startDate)
        : Promise.resolve([]),
    ]);
    const requestedBySymbol = groupBySymbol(requestedPoints);
    const rawBySymbol = groupBySymbol(rawPoints);
    const draftRows: PerformanceRow[] = [];
    const unavailableSymbols: string[] = [];

    for (const stock of stocks.filter((item) => item.active)) {
      let actualAdjustment = requestedAdjustment;
      let points = requestedBySymbol.get(stock.symbol) ?? [];
      if (requestedAdjustment === "qfq" && points.length < 2) {
        actualAdjustment = "raw";
        points = rawBySymbol.get(stock.symbol) ?? [];
      }
      const performance = calculatePerformance(points);
      if (!performance) {
        unavailableSymbols.push(stock.symbol);
        continue;
      }
      draftRows.push({
        symbol: stock.symbol,
        nameZh: stock.nameZh,
        instrumentType: stock.instrumentType,
        currency: stock.currency,
        actualAdjustment,
        ...performance,
        stale: false,
      });
    }

    const marketDate = draftRows.reduce(
      (latest, row) => (row.latestDate > latest ? row.latestDate : latest),
      "",
    );
    const rows = draftRows.map((row) => ({
      ...row,
      stale:
        marketDate.length > 0 &&
        calendarDayDifference(row.latestDate, marketDate) > 7,
    }));

    return Response.json({
      rows,
      requestedAdjustment,
      marketDate: marketDate || null,
      unavailableSymbols,
      delayed: true,
      methodology:
        "最新收盘价相对于目标日当日或之前最后一个交易日的收盘价；排名仅用于研究筛选。",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取涨跌幅排名失败" },
      { status: 500 },
    );
  }
}
