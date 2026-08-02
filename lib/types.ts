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

export interface PerformanceRow {
  symbol: string;
  nameZh: string;
  instrumentType: InstrumentType;
  currency: string;
  latestPrice: number;
  latestDate: string;
  actualAdjustment: Adjustment;
  oneMonthReturn: number | null;
  sixMonthReturn: number | null;
  oneYearReturn: number | null;
  distanceFromOneYearHigh: number | null;
  stale: boolean;
}

export interface InvestmentLot {
  id: number;
  symbol: string;
  nameZh: string;
  instrumentType: InstrumentType;
  investedAmount: number;
  entryPrice: number;
  fees: number;
  quantity: number;
  investedAt: string;
  note: string | null;
  currentPrice: number | null;
  currentPriceDate: string | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  returnPct: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioPosition {
  symbol: string;
  nameZh: string;
  instrumentType: InstrumentType;
  totalInvested: number;
  totalFees: number;
  totalCost: number;
  totalQuantity: number;
  averageEntryPrice: number;
  currentPrice: number | null;
  currentPriceDate: string | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  returnPct: number | null;
  firstInvestedAt: string;
  lotCount: number;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalFees: number;
  totalCost: number;
  currentValue: number;
  unrealizedPnl: number;
  returnPct: number | null;
  positionCount: number;
}
