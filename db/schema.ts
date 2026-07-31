import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const stocks = sqliteTable("stocks", {
  symbol: text("symbol").primaryKey(),
  exchange: text("exchange").notNull(),
  nameZh: text("name_zh").notNull(),
  nameEn: text("name_en"),
  currency: text("currency").notNull().default("CNY"),
  category: text("category").notNull().default("自选股"),
  instrumentType: text("instrument_type").notNull().default("stock"),
  active: integer("active").notNull().default(1),
  source: text("source").notNull().default("东方财富"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastSuccessAt: text("last_success_at"),
  lastAttemptAt: text("last_attempt_at"),
  syncStatus: text("sync_status").notNull().default("pending"),
  errorMessage: text("error_message"),
});

export const prices = sqliteTable(
  "prices",
  {
    symbol: text("symbol").notNull(),
    tradeDate: text("trade_date").notNull(),
    adjustment: text("adjustment").notNull(),
    open: real("open"),
    high: real("high"),
    low: real("low"),
    close: real("close").notNull(),
    volume: real("volume"),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.symbol, table.tradeDate, table.adjustment],
    }),
    index("prices_symbol_date_idx").on(table.symbol, table.tradeDate),
    index("prices_symbol_adjustment_date_idx").on(
      table.symbol,
      table.adjustment,
      table.tradeDate,
    ),
  ],
);

export const annualRanges = sqliteTable(
  "annual_ranges",
  {
    symbol: text("symbol").notNull(),
    year: integer("year").notNull(),
    low: real("low").notNull(),
    high: real("high").notNull(),
    lowDate: text("low_date"),
    highDate: text("high_date"),
    source: text("source").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.symbol, table.year],
    }),
  ],
);

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  symbol: text("symbol"),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
