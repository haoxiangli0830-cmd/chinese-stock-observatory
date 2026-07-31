import { env } from "cloudflare:workers";
import { seedAnnualRanges, seedStocks } from "./seed-data";
import type {
  ActivityItem,
  AnnualRange,
  PricePoint,
  StockRecord,
  SyncStatus,
} from "./types";

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
    seedStocks.map((stock) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO stocks
          (symbol, exchange, name_zh, name_en, currency, category, active, source,
           created_at, updated_at, last_success_at, last_attempt_at, sync_status,
           error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          stock.symbol,
          stock.exchange,
          stock.nameZh,
          stock.nameEn,
          stock.currency,
          stock.category,
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
  source: string;
}) {
  await ensureDatabase();
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.batch([
    db
      .prepare(
        `INSERT INTO stocks
        (symbol, exchange, name_zh, name_en, currency, category, active, source,
         created_at, updated_at, last_success_at, last_attempt_at, sync_status,
         error_message)
        VALUES (?, ?, ?, ?, 'CNY', '自选股', 1, ?, ?, ?, NULL, NULL, 'pending', NULL)
        ON CONFLICT(symbol) DO UPDATE SET
          name_zh = excluded.name_zh,
          exchange = excluded.exchange,
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
  if (!row) throw new Error("未找到该股票");
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
          : `已完成 ${successCount} 只股票的日线更新`,
        now,
      ),
  );
  await db.batch(statements);
}
