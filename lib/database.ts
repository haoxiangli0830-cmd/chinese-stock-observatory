import { env } from "cloudflare:workers";
import { seedAnnualRanges, seedInstruments } from "./seed-data";
import type {
  ActivityItem,
  AnnualRange,
  InvestmentLot,
  PortfolioPosition,
  PortfolioSummary,
  PricePoint,
  StockRecord,
  SyncStatus,
} from "./types";

export interface InvestmentLotInput {
  symbol: string;
  investedAmount: number;
  entryPrice: number;
  fees: number;
  investedAt: string;
  note: string | null;
}

export interface PortfolioSnapshot {
  lots: InvestmentLot[];
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
}

function getDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("数据库暂时不可用");
  return database;
}

const createStatements = [
  `CREATE TABLE IF NOT EXISTS stocks (
    symbol TEXT PRIMARY KEY,
    exchange TEXT NOT NULL,
    name_zh TEXT NOT NULL,
    name_en TEXT,
    currency TEXT NOT NULL DEFAULT 'CNY',
    category TEXT NOT NULL DEFAULT '自选股',
    instrument_type TEXT NOT NULL DEFAULT 'stock',
    active INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT '东方财富',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_success_at TEXT,
    last_attempt_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    adjustment TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (symbol, trade_date, adjustment)
  )`,
  `CREATE INDEX IF NOT EXISTS prices_symbol_date_idx
    ON prices (symbol, trade_date)`,
  `CREATE INDEX IF NOT EXISTS prices_symbol_adjustment_date_idx
    ON prices (symbol, adjustment, trade_date)`,
  `CREATE TABLE IF NOT EXISTS annual_ranges (
    symbol TEXT NOT NULL,
    year INTEGER NOT NULL,
    low REAL NOT NULL,
    high REAL NOT NULL,
    low_date TEXT,
    high_date TEXT,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (symbol, year)
  )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    symbol TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS investment_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    invested_amount REAL NOT NULL,
    entry_price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    invested_at TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS investment_lots_user_date_idx
    ON investment_lots (user_id, invested_at)`,
  `CREATE INDEX IF NOT EXISTS investment_lots_user_symbol_idx
    ON investment_lots (user_id, symbol)`,
];

let initialized = false;

async function ensureStockSyncColumns(db: D1Database) {
  const result = await db.prepare("PRAGMA table_info(stocks)").all();
  const columns = new Set(result.results.map((row) => String(row.name)));
  const additions = [
    ["last_attempt_at", "ALTER TABLE stocks ADD COLUMN last_attempt_at TEXT"],
    [
      "sync_status",
      "ALTER TABLE stocks ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'",
    ],
    ["error_message", "ALTER TABLE stocks ADD COLUMN error_message TEXT"],
    [
      "instrument_type",
      "ALTER TABLE stocks ADD COLUMN instrument_type TEXT NOT NULL DEFAULT 'stock'",
    ],
  ] as const;
  for (const [column, statement] of additions) {
    if (columns.has(column)) continue;
    try {
      await db.prepare(statement).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column name")) {
        throw error;
      }
    }
  }
  await db
    .prepare(
      `UPDATE stocks
       SET sync_status = 'ready'
       WHERE last_success_at IS NOT NULL AND sync_status = 'pending'`,
    )
    .run();
}

export async function ensureDatabase() {
  if (initialized) return;
  const db = getDatabase();
  await db.batch(createStatements.map((statement) => db.prepare(statement)));
  await ensureStockSyncColumns(db);

  await db.batch(
    seedInstruments.map((stock) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO stocks
          (symbol, exchange, name_zh, name_en, currency, category, instrument_type, active, source,
           created_at, updated_at, last_success_at, last_attempt_at, sync_status,
           error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          stock.symbol,
          stock.exchange,
          stock.nameZh,
          stock.nameEn,
          stock.currency,
          stock.category,
          stock.instrumentType,
          1,
          stock.source,
          stock.createdAt,
          stock.updatedAt,
          stock.lastSuccessAt,
          stock.lastAttemptAt,
          stock.syncStatus,
          stock.errorMessage,
        ),
    ),
  );

  await db.batch(
    seedAnnualRanges.map((row) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO annual_ranges
          (symbol, year, low, high, low_date, high_date, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.symbol,
          row.year,
          row.low,
          row.high,
          row.lowDate,
          row.highDate,
          row.source,
          row.updatedAt,
        ),
    ),
  );
  initialized = true;
}

export async function listStocks(): Promise<StockRecord[]> {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare(
      `SELECT s.symbol, s.exchange, s.name_zh, s.name_en, s.currency, s.category,
              s.instrument_type,
              s.active, s.source, s.created_at, s.updated_at, s.last_success_at,
              s.last_attempt_at, s.sync_status, s.error_message,
              (SELECT MAX(p.trade_date) FROM prices p
               WHERE p.symbol = s.symbol AND p.adjustment = 'raw') AS last_price_date_raw,
              (SELECT MAX(p.trade_date) FROM prices p
               WHERE p.symbol = s.symbol AND p.adjustment = 'qfq') AS last_price_date_qfq
       FROM stocks s
       ORDER BY active DESC, category ASC, symbol ASC`,
    )
    .all();

  return result.results.map((row) => ({
    symbol: String(row.symbol),
    exchange: String(row.exchange),
    nameZh: String(row.name_zh),
    nameEn: row.name_en ? String(row.name_en) : null,
    currency: String(row.currency),
    category: String(row.category),
    instrumentType: String(
      row.instrument_type ?? "stock",
    ) as StockRecord["instrumentType"],
    active: Number(row.active) === 1,
    source: String(row.source),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    syncStatus: String(row.sync_status ?? "pending") as SyncStatus,
    errorMessage: row.error_message ? String(row.error_message) : null,
    lastPriceDateRaw: row.last_price_date_raw
      ? String(row.last_price_date_raw)
      : null,
    lastPriceDateQfq: row.last_price_date_qfq
      ? String(row.last_price_date_qfq)
      : null,
  }));
}

export async function listAnnualRanges(): Promise<AnnualRange[]> {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare(
      `SELECT symbol, year, low, high, low_date, high_date, source, updated_at
       FROM annual_ranges
       ORDER BY year DESC, symbol ASC`,
    )
    .all();
  return result.results.map((row) => ({
    symbol: String(row.symbol),
    year: Number(row.year),
    low: Number(row.low),
    high: Number(row.high),
    lowDate: row.low_date ? String(row.low_date) : null,
    highDate: row.high_date ? String(row.high_date) : null,
    source: String(row.source),
    updatedAt: String(row.updated_at),
  }));
}

export async function listActivity(limit = 8): Promise<ActivityItem[]> {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare(
      `SELECT id, action, symbol, message, created_at
       FROM activity_log ORDER BY id DESC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return result.results.map((row) => ({
    id: Number(row.id),
    action: String(row.action),
    symbol: row.symbol ? String(row.symbol) : null,
    message: String(row.message),
    createdAt: String(row.created_at),
  }));
}

export async function getSyncValue(key: string): Promise<string | null> {
  await ensureDatabase();
  const row = await getDatabase()
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function saveStock(stock: {
  symbol: string;
  exchange: string;
  nameZh: string;
  nameEn?: string | null;
  instrumentType: StockRecord["instrumentType"];
  category: string;
  source: string;
}) {
  await ensureDatabase();
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.batch([
    db
      .prepare(
        `INSERT INTO stocks
        (symbol, exchange, name_zh, name_en, currency, category, instrument_type, active, source,
         created_at, updated_at, last_success_at, last_attempt_at, sync_status,
         error_message)
        VALUES (?, ?, ?, ?, 'CNY', ?, ?, 1, ?, ?, ?, NULL, NULL, 'pending', NULL)
        ON CONFLICT(symbol) DO UPDATE SET
          name_zh = excluded.name_zh,
          exchange = excluded.exchange,
          category = excluded.category,
          instrument_type = excluded.instrument_type,
          active = 1,
          source = excluded.source,
          sync_status = CASE
            WHEN stocks.last_success_at IS NULL THEN 'pending'
            ELSE stocks.sync_status
          END,
          error_message = CASE
            WHEN stocks.last_success_at IS NULL THEN NULL
            ELSE stocks.error_message
          END,
          updated_at = excluded.updated_at`,
      )
      .bind(
        stock.symbol,
        stock.exchange,
        stock.nameZh,
        stock.nameEn ?? null,
        stock.category,
        stock.instrumentType,
        stock.source,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO activity_log (action, symbol, message, created_at)
         VALUES ('添加', ?, ?, ?)`,
      )
      .bind(stock.symbol, `已添加 ${stock.nameZh}（${stock.symbol}）`, now),
  ]);
}

export async function setStockActive(symbol: string, active: boolean) {
  await ensureDatabase();
  const db = getDatabase();
  const now = new Date().toISOString();
  const row = await db
    .prepare("SELECT name_zh FROM stocks WHERE symbol = ?")
    .bind(symbol)
    .first<{ name_zh: string }>();
  if (!row) throw new Error("未找到该品种");
  await db.batch([
    db
      .prepare(
        `UPDATE stocks
         SET active = ?,
             sync_status = CASE
               WHEN ? = 1 AND last_success_at IS NULL THEN 'pending'
               ELSE sync_status
             END,
             error_message = CASE
               WHEN ? = 1 AND last_success_at IS NULL THEN NULL
               ELSE error_message
             END,
             updated_at = ?
         WHERE symbol = ?`,
      )
      .bind(active ? 1 : 0, active ? 1 : 0, active ? 1 : 0, now, symbol),
    db
      .prepare(
        `INSERT INTO activity_log (action, symbol, message, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        active ? "恢复" : "停用",
        symbol,
        `${active ? "已恢复" : "已停用"} ${row.name_zh}（${symbol}）`,
        now,
      ),
  ]);
}

export async function queryStoredPrices(
  symbol: string,
  adjustment: string,
  startDate: string,
): Promise<PricePoint[]> {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare(
      `SELECT symbol, trade_date, open, high, low, close, volume, adjustment,
              source
       FROM prices
       WHERE symbol = ? AND adjustment = ? AND trade_date >= ?
       ORDER BY trade_date ASC`,
    )
    .bind(symbol, adjustment, startDate)
    .all();
  return result.results.map((row) => ({
    symbol: String(row.symbol),
    date: String(row.trade_date),
    open: row.open == null ? null : Number(row.open),
    high: row.high == null ? null : Number(row.high),
    low: row.low == null ? null : Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? null : Number(row.volume),
    adjustment: String(row.adjustment) as "raw" | "qfq",
    source: String(row.source),
  }));
}

export async function queryRecentActivePrices(
  adjustment: string,
  startDate: string,
): Promise<PricePoint[]> {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare(
      `SELECT p.symbol, p.trade_date, p.open, p.high, p.low, p.close, p.volume,
              p.adjustment, p.source
       FROM prices p
       INNER JOIN stocks s ON s.symbol = p.symbol
       WHERE s.active = 1 AND p.adjustment = ? AND p.trade_date >= ?
       ORDER BY p.symbol ASC, p.trade_date ASC`,
    )
    .bind(adjustment, startDate)
    .all();
  return result.results.map((row) => ({
    symbol: String(row.symbol),
    date: String(row.trade_date),
    open: row.open == null ? null : Number(row.open),
    high: row.high == null ? null : Number(row.high),
    low: row.low == null ? null : Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? null : Number(row.volume),
    adjustment: String(row.adjustment) as "raw" | "qfq",
    source: String(row.source),
  }));
}

export async function getPortfolioSnapshot(
  userId: string,
): Promise<PortfolioSnapshot> {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare(
      `SELECT l.id, l.symbol, l.invested_amount, l.entry_price, l.fees,
              l.invested_at, l.note, l.created_at, l.updated_at,
              s.name_zh, s.instrument_type,
              (SELECT p.close FROM prices p
               WHERE p.symbol = l.symbol AND p.adjustment = 'raw'
               ORDER BY p.trade_date DESC LIMIT 1) AS current_price,
              (SELECT p.trade_date FROM prices p
               WHERE p.symbol = l.symbol AND p.adjustment = 'raw'
               ORDER BY p.trade_date DESC LIMIT 1) AS current_price_date
       FROM investment_lots l
       INNER JOIN stocks s ON s.symbol = l.symbol
       WHERE l.user_id = ?
       ORDER BY l.invested_at DESC, l.id DESC`,
    )
    .bind(userId)
    .all();

  const lots: InvestmentLot[] = result.results.map((row) => {
    const investedAmount = Number(row.invested_amount);
    const entryPrice = Number(row.entry_price);
    const fees = Number(row.fees ?? 0);
    const quantity = investedAmount / entryPrice;
    const currentPrice =
      row.current_price == null ? null : Number(row.current_price);
    const currentValue =
      currentPrice == null ? null : quantity * currentPrice;
    const totalCost = investedAmount + fees;
    const unrealizedPnl =
      currentValue == null ? null : currentValue - totalCost;
    return {
      id: Number(row.id),
      symbol: String(row.symbol),
      nameZh: String(row.name_zh),
      instrumentType: String(row.instrument_type) as InvestmentLot["instrumentType"],
      investedAmount,
      entryPrice,
      fees,
      quantity,
      investedAt: String(row.invested_at),
      note: row.note == null ? null : String(row.note),
      currentPrice,
      currentPriceDate:
        row.current_price_date == null
          ? null
          : String(row.current_price_date),
      currentValue,
      unrealizedPnl,
      returnPct:
        unrealizedPnl == null ? null : (unrealizedPnl / totalCost) * 100,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });

  const positionMap = new Map<string, PortfolioPosition>();
  for (const lot of lots) {
    const existing = positionMap.get(lot.symbol);
    if (!existing) {
      positionMap.set(lot.symbol, {
        symbol: lot.symbol,
        nameZh: lot.nameZh,
        instrumentType: lot.instrumentType,
        totalInvested: lot.investedAmount,
        totalFees: lot.fees,
        totalCost: lot.investedAmount + lot.fees,
        totalQuantity: lot.quantity,
        averageEntryPrice: lot.entryPrice,
        currentPrice: lot.currentPrice,
        currentPriceDate: lot.currentPriceDate,
        currentValue: lot.currentValue,
        unrealizedPnl: lot.unrealizedPnl,
        returnPct: lot.returnPct,
        firstInvestedAt: lot.investedAt,
        lotCount: 1,
      });
      continue;
    }
    existing.totalInvested += lot.investedAmount;
    existing.totalFees += lot.fees;
    existing.totalCost += lot.investedAmount + lot.fees;
    existing.totalQuantity += lot.quantity;
    existing.averageEntryPrice =
      existing.totalInvested / existing.totalQuantity;
    existing.firstInvestedAt =
      lot.investedAt < existing.firstInvestedAt
        ? lot.investedAt
        : existing.firstInvestedAt;
    existing.lotCount += 1;
    if (existing.currentPrice != null) {
      existing.currentValue = existing.totalQuantity * existing.currentPrice;
      existing.unrealizedPnl = existing.currentValue - existing.totalCost;
      existing.returnPct =
        (existing.unrealizedPnl / existing.totalCost) * 100;
    }
  }

  const positions = Array.from(positionMap.values()).sort(
    (left, right) => (left.returnPct ?? Infinity) - (right.returnPct ?? Infinity),
  );
  const totalInvested = positions.reduce(
    (sum, position) => sum + position.totalInvested,
    0,
  );
  const totalFees = positions.reduce(
    (sum, position) => sum + position.totalFees,
    0,
  );
  const totalCost = totalInvested + totalFees;
  const currentValue = positions.reduce(
    (sum, position) => sum + (position.currentValue ?? 0),
    0,
  );
  const missingPrices = positions.some(
    (position) => position.currentValue == null,
  );
  const unrealizedPnl = currentValue - totalCost;

  return {
    lots,
    positions,
    summary: {
      totalInvested,
      totalFees,
      totalCost,
      currentValue,
      unrealizedPnl,
      returnPct:
        totalCost === 0 || missingPrices
          ? null
          : (unrealizedPnl / totalCost) * 100,
      positionCount: positions.length,
    },
  };
}

async function assertKnownSymbol(symbol: string) {
  const row = await getDatabase()
    .prepare("SELECT symbol FROM stocks WHERE symbol = ?")
    .bind(symbol)
    .first();
  if (!row) throw new Error("该证券尚未加入观察名单");
}

export async function createInvestmentLot(
  userId: string,
  input: InvestmentLotInput,
) {
  await ensureDatabase();
  await assertKnownSymbol(input.symbol);
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT INTO investment_lots
       (user_id, symbol, invested_amount, entry_price, fees, invested_at, note,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      userId,
      input.symbol,
      input.investedAmount,
      input.entryPrice,
      input.fees,
      input.investedAt,
      input.note,
      now,
      now,
    )
    .run();
}

export async function updateInvestmentLot(
  userId: string,
  id: number,
  input: InvestmentLotInput,
) {
  await ensureDatabase();
  await assertKnownSymbol(input.symbol);
  const result = await getDatabase()
    .prepare(
      `UPDATE investment_lots
       SET symbol = ?, invested_amount = ?, entry_price = ?, fees = ?,
           invested_at = ?, note = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      input.symbol,
      input.investedAmount,
      input.entryPrice,
      input.fees,
      input.investedAt,
      input.note,
      new Date().toISOString(),
      id,
      userId,
    )
    .run();
  if (!Number(result.meta.changes ?? 0)) {
    throw new Error("未找到该投资记录");
  }
}

export async function deleteInvestmentLot(userId: string, id: number) {
  await ensureDatabase();
  const result = await getDatabase()
    .prepare("DELETE FROM investment_lots WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  if (!Number(result.meta.changes ?? 0)) {
    throw new Error("未找到该投资记录");
  }
}

export async function upsertPrices(points: PricePoint[]) {
  if (!points.length) return;
  await ensureDatabase();
  const db = getDatabase();
  const fetchedAt = new Date().toISOString();
  const statements = points.map((point) =>
    db
      .prepare(
        `INSERT INTO prices
        (symbol, trade_date, adjustment, open, high, low, close, volume, source,
         fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, trade_date, adjustment) DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          source = excluded.source,
          fetched_at = excluded.fetched_at`,
      )
      .bind(
        point.symbol,
        point.date,
        point.adjustment,
        point.open,
        point.high,
        point.low,
        point.close,
        point.volume,
        point.source,
        fetchedAt,
      ),
  );
  for (let index = 0; index < statements.length; index += 75) {
    await db.batch(statements.slice(index, index + 75));
  }
}

export async function upsertAnnualRanges(rows: AnnualRange[]) {
  if (!rows.length) return;
  await ensureDatabase();
  const db = getDatabase();
  const statements = rows.map((row) =>
    db
      .prepare(
        `INSERT INTO annual_ranges
        (symbol, year, low, high, low_date, high_date, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, year) DO UPDATE SET
          low = excluded.low,
          high = excluded.high,
          low_date = excluded.low_date,
          high_date = excluded.high_date,
          source = excluded.source,
          updated_at = excluded.updated_at`,
      )
      .bind(
        row.symbol,
        row.year,
        row.low,
        row.high,
        row.lowDate,
        row.highDate,
        row.source,
        row.updatedAt,
      ),
  );
  for (let index = 0; index < statements.length; index += 75) {
    await db.batch(statements.slice(index, index + 75));
  }
}

export async function rebuildAnnualRanges(symbols: string[]) {
  if (!symbols.length) return;
  await ensureDatabase();
  const db = getDatabase();
  const now = new Date().toISOString();
  for (const symbol of symbols) {
    const result = await db
      .prepare(
        `SELECT trade_date, low, high, source
         FROM prices
         WHERE symbol = ? AND adjustment = 'raw'
           AND low IS NOT NULL AND high IS NOT NULL
         ORDER BY trade_date ASC`,
      )
      .bind(symbol)
      .all();
    const grouped = new Map<number, AnnualRange>();
    for (const row of result.results) {
      const tradeDate = String(row.trade_date);
      const year = Number(tradeDate.slice(0, 4));
      const low = Number(row.low);
      const high = Number(row.high);
      const existing = grouped.get(year);
      if (!existing) {
        grouped.set(year, {
          symbol,
          year,
          low,
          high,
          lowDate: tradeDate,
          highDate: tradeDate,
          source: String(row.source),
          updatedAt: now,
        });
        continue;
      }
      if (low < existing.low) {
        existing.low = low;
        existing.lowDate = tradeDate;
      }
      if (high > existing.high) {
        existing.high = high;
        existing.highDate = tradeDate;
      }
      existing.source = String(row.source);
      existing.updatedAt = now;
    }
    await upsertAnnualRanges(Array.from(grouped.values()));
  }
}

export async function markSyncStarted(symbols: string[]) {
  if (!symbols.length) return;
  await ensureDatabase();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.batch(
    symbols.map((symbol) =>
      db
        .prepare(
          `UPDATE stocks
           SET sync_status = 'syncing', last_attempt_at = ?, error_message = NULL,
               updated_at = ?
           WHERE symbol = ?`,
        )
        .bind(now, now, symbol),
    ),
  );
}

export async function markSyncResults(
  results: Array<{
    symbol: string;
    ok: boolean;
    source?: string;
    error?: string;
  }>,
) {
  if (!results.length) return;
  await ensureDatabase();
  const db = getDatabase();
  const now = new Date().toISOString();
  const statements = results.map((result) =>
    result.ok
      ? db
          .prepare(
            `UPDATE stocks
             SET last_success_at = ?, last_attempt_at = ?, sync_status = 'ready',
                 error_message = NULL, source = ?, updated_at = ?
             WHERE symbol = ?`,
          )
          .bind(now, now, result.source ?? "AKShare", now, result.symbol)
      : db
          .prepare(
            `UPDATE stocks
             SET last_attempt_at = ?, sync_status = 'failed', error_message = ?,
                 updated_at = ?
             WHERE symbol = ?`,
          )
          .bind(
            now,
            String(result.error ?? "AKShare 暂时未返回数据").slice(0, 300),
            now,
            result.symbol,
          ),
  );
  const successCount = results.filter((result) => result.ok).length;
  const failureCount = results.length - successCount;
  if (successCount) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sync_state (key, value, updated_at)
           VALUES ('last_complete_sync', ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(now, now),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO activity_log (action, symbol, message, created_at)
         VALUES ('更新', NULL, ?, ?)`,
      )
      .bind(
        failureCount
          ? `同步完成 ${successCount} 只，失败 ${failureCount} 只`
          : `已完成 ${successCount} 个股票或ETF品种的日线更新`,
        now,
      ),
  );
  await db.batch(statements);
}
