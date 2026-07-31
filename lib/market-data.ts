import type { InstrumentType, Period, PricePoint } from "./types";
import fallbackData from "./bank-price-fallback.json";

const EASTMONEY_QUOTE = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_LIST = "https://82.push2.eastmoney.com/api/qt/clist/get";
const bundledPriceData = fallbackData as Record<
  string,
  Array<[string, number, number, number, number, number]>
>;

function marketId(symbol: string) {
  return symbol.startsWith("5") ||
    symbol.startsWith("6") ||
    symbol.startsWith("9")
    ? "1"
    : "0";
}

function exchangeName(symbol: string) {
  if (
    symbol.startsWith("5") ||
    symbol.startsWith("6") ||
    symbol.startsWith("9")
  )
    return "SSE";
  if (symbol.startsWith("0") || symbol.startsWith("3")) return "SZSE";
  return "BSE";
}

const ETF_PATTERN =
  /^(159|510|511|512|513|515|516|517|518|520|560|561|562|563|588|589)\d{3}$/;

const coreEtfs = [
  {
    symbol: "510300",
    nameZh: "沪深300ETF",
    nameEn: "CSI 300 ETF",
    category: "国内宽基",
  },
  {
    symbol: "512100",
    nameZh: "中证1000ETF",
    nameEn: "CSI 1000 ETF",
    category: "国内宽基",
  },
  {
    symbol: "159915",
    nameZh: "创业板ETF",
    nameEn: "ChiNext ETF",
    category: "国内成长",
  },
  {
    symbol: "588000",
    nameZh: "科创50ETF",
    nameEn: "STAR 50 ETF",
    category: "科创板",
  },
  {
    symbol: "159920",
    nameZh: "恒生ETF",
    nameEn: "Hang Seng ETF",
    category: "港股指数",
  },
  {
    symbol: "513100",
    nameZh: "纳指ETF",
    nameEn: "Nasdaq 100 ETF",
    category: "海外指数",
  },
  {
    symbol: "513880",
    nameZh: "日经225ETF",
    nameEn: "Nikkei 225 ETF",
    category: "海外指数",
  },
  {
    symbol: "513030",
    nameZh: "德国DAX ETF",
    nameEn: "Germany DAX ETF",
    category: "海外指数",
  },
  {
    symbol: "518880",
    nameZh: "黄金ETF",
    nameEn: "Gold ETF",
    category: "商品",
  },
  {
    symbol: "511090",
    nameZh: "30年国债ETF",
    nameEn: "30-Year Treasury Bond ETF",
    category: "债券",
  },
] as const;

const coreEtfBySymbol = new Map<string, (typeof coreEtfs)[number]>(
  coreEtfs.map((item) => [item.symbol, item]),
);

function instrumentType(symbol: string): InstrumentType {
  return ETF_PATTERN.test(symbol) ? "etf" : "stock";
}

function isSupportedSymbol(value: string) {
  return /^\d{6}$/.test(value);
}

function resultMetadata(symbol: string) {
  const type = instrumentType(symbol);
  const knownEtf = coreEtfBySymbol.get(symbol);
  return {
    instrumentType: type,
    category: knownEtf?.category ?? (type === "etf" ? "ETF" : "自选股"),
    source: type === "etf" ? "东方财富ETF" : "东方财富",
  };
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

export async function validateInstrument(symbol: string) {
  if (!isSupportedSymbol(symbol)) return null;
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
    nameEn: coreEtfBySymbol.get(code)?.nameEn ?? null,
    ...resultMetadata(code),
  };
}

async function fetchInstrumentList(fs: string) {
  const params = new URLSearchParams({
    pn: "1",
    pz: "10000",
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs,
    fields: "f12,f13,f14",
  });
  const response = await fetch(`${EASTMONEY_LIST}?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("品种搜索服务暂时不可用");
  const payload = (await response.json()) as {
    data?: { diff?: Array<{ f12?: string; f13?: number; f14?: string }> } | null;
  };
  return payload.data?.diff ?? [];
}

export async function searchInstruments(query: string) {
  const normalized = query.trim();
  if (!normalized) return [];
  if (isSupportedSymbol(normalized)) {
    const match = await validateInstrument(normalized);
    return match ? [match] : [];
  }

  const lists = await Promise.allSettled([
    fetchInstrumentList("m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"),
    fetchInstrumentList("b:MK0021,b:MK0022,b:MK0023,b:MK0024"),
  ]);
  const candidates = lists.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const staticEtfs = coreEtfs.map((item) => ({
    f12: item.symbol,
    f14: item.nameZh,
  }));
  const seen = new Set<string>();
  const matches = [...staticEtfs, ...candidates]
    .filter(
      (item) =>
        item.f12 &&
        item.f14 &&
        (item.f14.includes(normalized) || item.f12.includes(normalized)) &&
        !seen.has(String(item.f12)) &&
        seen.add(String(item.f12)),
    )
    .slice(0, 8)
    .map((item) => ({
      symbol: String(item.f12),
      exchange: exchangeName(String(item.f12)),
      nameZh: String(item.f14),
      nameEn: coreEtfBySymbol.get(String(item.f12))?.nameEn ?? null,
      ...resultMetadata(String(item.f12)),
    }));
  if (!matches.length && lists.every((result) => result.status === "rejected")) {
    throw new Error("股票与ETF搜索服务暂时不可用");
  }
  return matches;
}
