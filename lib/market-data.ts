import type { Period, PricePoint } from "./types";
import fallbackData from "./bank-price-fallback.json";

const EASTMONEY_QUOTE = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_LIST = "https://82.push2.eastmoney.com/api/qt/clist/get";
const bundledPriceData = fallbackData as Record<
  string,
  Array<[string, number, number, number, number, number]>
>;

function marketId(symbol: string) {
  return symbol.startsWith("6") ? "1" : "0";
}

function exchangeName(symbol: string) {
  if (symbol.startsWith("6")) return "SSE";
  if (symbol.startsWith("0") || symbol.startsWith("3")) return "SZSE";
  return "BSE";
}

function isAStockSymbol(value: string) {
  return /^\d{6}$/.test(value);
}

export function periodStart(period: Period) {
  const now = new Date();
  const start = new Date(now);
  if (period === "MAX") return "1990-01-01";
  if (period === "YTD") return `${now.getUTCFullYear()}-01-01`;
  const months =
    period === "1M"
      ? 1
      : period === "6M"
        ? 6
        : period === "1Y"
          ? 12
          : 60;
  start.setUTCMonth(start.getUTCMonth() - months);
  return start.toISOString().slice(0, 10);
}

export function getBundledBankHistory(
  symbol: string,
  startDate: string,
): PricePoint[] {
  return (bundledPriceData[symbol] ?? [])
    .filter(([date]) => date >= startDate)
    .map(([date, open, high, low, close, volume]) => ({
      symbol,
      date,
      open,
      high,
      low,
      close,
      volume,
      adjustment: "raw",
      source: "内置历史快照（不复权）",
    }));
}

export async function validateAStock(symbol: string) {
  if (!isAStockSymbol(symbol)) return null;
  const params = new URLSearchParams({
    secid: `${marketId(symbol)}.${symbol}`,
    fields: "f57,f58,f107",
  });
  const response = await fetch(`${EASTMONEY_QUOTE}?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    data?: { f57?: string; f58?: string } | null;
  };
  const code = payload.data?.f57;
  const name = payload.data?.f58;
  if (!code || !name || code !== symbol) return null;
  return {
    symbol: code,
    exchange: exchangeName(code),
    nameZh: name,
    nameEn: null,
    source: "东方财富",
  };
}

export async function searchAStocks(query: string) {
  const normalized = query.trim();
  if (!normalized) return [];
  if (isAStockSymbol(normalized)) {
    const match = await validateAStock(normalized);
    return match ? [match] : [];
  }

  const params = new URLSearchParams({
    pn: "1",
    pz: "10000",
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
    fields: "f12,f13,f14",
  });
  const response = await fetch(`${EASTMONEY_LIST}?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("股票搜索服务暂时不可用");
  const payload = (await response.json()) as {
    data?: {
      diff?: Array<{ f12?: string; f13?: number; f14?: string }>;
    } | null;
  };
  const candidates = payload.data?.diff ?? [];
  return candidates
    .filter(
      (item) =>
        item.f12 &&
        item.f14 &&
        (item.f14.includes(normalized) || item.f12.includes(normalized)),
    )
    .slice(0, 8)
    .map((item) => ({
      symbol: String(item.f12),
      exchange: exchangeName(String(item.f12)),
      nameZh: String(item.f14),
      nameEn: null,
      source: "东方财富",
    }));
}
