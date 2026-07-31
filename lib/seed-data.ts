import type { AnnualRange, StockRecord } from "./types";

const seedTime = "2026-07-30T12:00:00.000Z";

export const seedStocks: StockRecord[] = [
  ["600036", "SSE", "招商银行", "China Merchants Bank"],
  ["601166", "SSE", "兴业银行", "Industrial Bank"],
  ["601328", "SSE", "交通银行", "Bank of Communications"],
  ["601398", "SSE", "工商银行", "Industrial and Commercial Bank of China"],
  ["601288", "SSE", "农业银行", "Agricultural Bank of China"],
  ["601988", "SSE", "中国银行", "Bank of China"],
  ["601818", "SSE", "光大银行", "China Everbright Bank"],
  ["601939", "SSE", "建设银行", "China Construction Bank"],
  ["601658", "SSE", "邮储银行", "Postal Savings Bank of China"],
].map(([symbol, exchange, nameZh, nameEn]) => ({
  symbol,
  exchange,
  nameZh,
  nameEn,
  currency: "CNY",
  category: "银行股",
  active: true,
  source: "东方财富",
  createdAt: seedTime,
  updatedAt: seedTime,
  lastSuccessAt: seedTime,
  lastAttemptAt: seedTime,
  syncStatus: "ready",
  errorMessage: null,
  lastPriceDateRaw: null,
  lastPriceDateQfq: null,
}));

const values: Record<number, number[][]> = {
  2023: [
    [26.9, 42.63],
    [13.95, 18.47],
    [4.71, 6.49],
    [4.28, 5.47],
    [2.89, 3.97],
    [3.15, 4.77],
    [2.83, 3.72],
    [5.56, 7.28],
    [4.21, 6.15],
  ],
  2024: [
    [27.36, 41.37],
    [14.51, 21.05],
    [5.62, 8.06],
    [4.72, 7.04],
    [3.58, 5.44],
    [3.89, 5.59],
    [2.9, 3.97],
    [6.35, 9.02],
    [4.29, 5.83],
  ],
  2025: [
    [38.13, 48.55],
    [18.7, 25.45],
    [6.65, 8.34],
    [6.4, 8.4],
    [4.9, 8.68],
    [5.13, 6.39],
    [3.28, 4.5],
    [8.14, 10.03],
    [4.94, 6.44],
  ],
  2026: [
    [35.28, 43.02],
    [16.44, 21.58],
    [6.37, 7.32],
    [6.85, 8.16],
    [5.79, 7.7],
    [5.23, 6.29],
    [2.87, 3.52],
    [8.52, 10.98],
    [4.76, 5.52],
  ],
};

export const seedAnnualRanges: AnnualRange[] = Object.entries(values).flatMap(
  ([year, rows]) =>
    rows.map(([low, high], index) => ({
      symbol: seedStocks[index].symbol,
      year: Number(year),
      low,
      high,
      lowDate: null,
      highDate: null,
      source: "东方财富（不复权日线）",
      updatedAt: seedTime,
    })),
);
