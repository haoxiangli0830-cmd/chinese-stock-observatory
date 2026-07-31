export type Adjustment = "raw" | "qfq";
export type Period = "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";
export type SyncStatus = "pending" | "syncing" | "ready" | "failed";
export type InstrumentType = "stock" | "etf";

export interface StockRecord {
  symbol: string;
  exchange: string;
  nameZh: string;
  nameEn: string | null;
  currency: string;
  category: string;
  instrumentType: InstrumentType;
  active: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  syncStatus: SyncStatus;
  errorMessage: string | null;
  lastPriceDateRaw: string | null;
  lastPriceDateQfq: string | null;
}

export interface AnnualRange {
  symbol: string;
  year: number;
  low: number;
  high: number;
  lowDate: string | null;
  highDate: string | null;
  source: string;
  updatedAt: string;
}

export interface PricePoint {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  adjustment: Adjustment;
  source: string;
}

export interface ActivityItem {
  id: number;
  action: string;
  symbol: string | null;
  message: string;
  createdAt: string;
}
