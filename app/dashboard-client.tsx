"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ActivityItem,
  Adjustment,
  AnnualRange,
  InstrumentType,
  Period,
  PricePoint,
  StockRecord,
} from "../lib/types";
import PerformanceRanking from "./performance-ranking";

interface DashboardPayload {
  stocks: StockRecord[];
  annualRanges: AnnualRange[];
  activity: ActivityItem[];
  lastSync: string | null;
  marketStatus: string;
}

interface PriceSeries {
  symbol: string;
  points: PricePoint[];
  source: string;
  actualAdjustment?: Adjustment;
  syncStatus?: StockRecord["syncStatus"];
  lastSuccessAt?: string | null;
  error?: string | null;
}

interface SearchResult {
  symbol: string;
  exchange: string;
  nameZh: string;
  nameEn: string | null;
  instrumentType: InstrumentType;
  category: string;
  source: string;
}

interface ExtremeValue {
  date: string;
  value: number;
}

interface YearlyExtreme {
  year: number;
  high: ExtremeValue;
  low: ExtremeValue;
}

const periods: Period[] = ["1M", "6M", "YTD", "1Y", "5Y", "MAX"];
const periodLabels: Record<Period, string> = {
  "1M": "1个月",
  "6M": "6个月",
  YTD: "今年以来",
  "1Y": "1年",
  "5Y": "5年",
  MAX: "全部",
};
const colors = ["#0A5AA8", "#C53C3C", "#18885C", "#8A5AA8", "#D18A13"];
const syncLabels: Record<StockRecord["syncStatus"], string> = {
  pending: "等待同步",
  syncing: "同步中",
  ready: "数据就绪",
  failed: "同步失败",
};
type InstrumentFilter = "all" | InstrumentType;

function highValue(point: PricePoint) {
  return point.high ?? point.close;
}

function lowValue(point: PricePoint) {
  return point.low ?? point.close;
}

function sameExtreme(left: ExtremeValue, right: ExtremeValue) {
  return left.date === right.date && left.value === right.value;
}

function formatDate(value: string | null) {
  if (!value) return "待首次更新";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatVolume(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
}

function mergeSeries(series: PriceSeries[], comparison: boolean) {
  const byDate = new Map<string, Record<string, number | string>>();
  series.forEach((item) => {
    const firstClose = item.points[0]?.close || 1;
    item.points.forEach((point) => {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[item.symbol] = comparison
        ? Number(((point.close / firstClose) * 100).toFixed(2))
        : point.close;
      if (!comparison && series.length === 1) {
        row.volume = point.volume ?? 0;
        row.high = point.high ?? point.close;
        row.low = point.low ?? point.close;
      }
      byDate.set(point.date, row);
    });
  });
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export default function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["600036"]);
  const [period, setPeriod] = useState<Period>("1Y");
  const [adjustment, setAdjustment] = useState<Adjustment>("raw");
  const [comparison, setComparison] = useState(false);
  const [series, setSeries] = useState<PriceSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [yearStart, setYearStart] = useState(2023);
  const [yearEnd, setYearEnd] = useState(new Date().getFullYear());
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [instrumentFilter, setInstrumentFilter] =
    useState<InstrumentFilter>("all");

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const payload = (await response.json()) as DashboardPayload & {
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "读取观察台失败");
    setDashboard(payload);
  }, []);

  const loadPrices = useCallback(async () => {
    if (!selectedSymbols.length) return;
    setChartLoading(true);
    try {
      const params = new URLSearchParams({
        symbols: selectedSymbols.join(","),
        period,
        adjust: adjustment,
      });
      const response = await fetch(`/api/prices?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        series?: PriceSeries[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "读取行情失败");
      const nextSeries = payload.series ?? [];
      setSeries(nextSeries);
      if (
        adjustment === "qfq" &&
        nextSeries.some((item) => item.actualAdjustment === "raw")
      ) {
        setMessage(
          "前复权日线尚未写入缓存，当前显示不复权历史快照；配置每日同步后会自动切换。",
        );
      } else if (nextSeries.every((item) => item.points.length === 0)) {
        const first = nextSeries[0];
        setMessage(
          first?.syncStatus === "failed"
            ? `历史数据同步失败：${first.error ?? "数据源暂时不可用，将自动重试"}`
            : "历史数据正在排队同步，通常会在30分钟内自动出现。",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取行情失败");
    } finally {
      setChartLoading(false);
    }
  }, [adjustment, period, selectedSymbols]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard()
        .catch((error) =>
          setMessage(error instanceof Error ? error.message : "读取观察台失败"),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPrices();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPrices]);

  useEffect(() => {
    if (!watchlistOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWatchlistOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [watchlistOpen]);

  const activeStocks = useMemo(
    () => dashboard?.stocks.filter((stock) => stock.active) ?? [],
    [dashboard],
  );
  const filteredActiveStocks = useMemo(
    () =>
      instrumentFilter === "all"
        ? activeStocks
        : activeStocks.filter(
            (stock) => stock.instrumentType === instrumentFilter,
          ),
    [activeStocks, instrumentFilter],
  );
  const stockLookup = useMemo(
    () =>
      new Map(
        (dashboard?.stocks ?? []).map((stock) => [stock.symbol, stock]),
      ),
    [dashboard],
  );
  const chartData = useMemo(
    () => mergeSeries(series, comparison),
    [comparison, series],
  );
  const visibleExtremes = useMemo(() => {
    if (comparison || series.length !== 1 || !series[0]?.points.length) {
      return null;
    }
    const points = series[0].points;
    const high = points.reduce((best, point) =>
      highValue(point) > highValue(best) ? point : best,
    );
    const low = points.reduce((best, point) =>
      lowValue(point) < lowValue(best) ? point : best,
    );
    return {
      high: { date: high.date, value: highValue(high) },
      low: { date: low.date, value: lowValue(low) },
    };
  }, [comparison, series]);
  const yearlyExtremes = useMemo<YearlyExtreme[]>(() => {
    if (
      comparison ||
      !["1Y", "5Y", "MAX"].includes(period) ||
      series.length !== 1 ||
      !series[0]?.points.length
    ) {
      return [];
    }
    const grouped = new Map<number, PricePoint[]>();
    series[0].points.forEach((point) => {
      const year = Number(point.date.slice(0, 4));
      if (!Number.isFinite(year)) return;
      grouped.set(year, [...(grouped.get(year) ?? []), point]);
    });
    return Array.from(grouped.entries())
      .map(([year, points]) => {
        const high = points.reduce((best, point) =>
          highValue(point) > highValue(best) ? point : best,
        );
        const low = points.reduce((best, point) =>
          lowValue(point) < lowValue(best) ? point : best,
        );
        return {
          year,
          high: { date: high.date, value: highValue(high) },
          low: { date: low.date, value: lowValue(low) },
        };
      })
      .sort((left, right) => left.year - right.year);
  }, [comparison, period, series]);
  const visibleYears = useMemo(() => {
    const years = new Set(
      (dashboard?.annualRanges ?? [])
        .map((row) => row.year)
        .filter((year) => year >= yearStart && year <= yearEnd),
    );
    return Array.from(years).sort((a, b) => b - a);
  }, [dashboard, yearEnd, yearStart]);

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((current) => {
      if (!comparison) return [symbol];
      if (current.includes(symbol)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== symbol);
      }
      if (current.length >= 5) {
        setMessage("为保持图表清晰，一次最多比较5个品种");
        return current;
      }
      return [...current, symbol];
    });
  }

  async function searchStocks() {
    if (!query.trim()) return;
    setSearching(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
      );
      const payload = (await response.json()) as {
        results?: SearchResult[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "搜索失败");
      setSearchResults(payload.results ?? []);
      if (!payload.results?.length) setMessage("没有找到匹配的股票或ETF");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  async function addStock(result: SearchResult) {
    const response = await fetch("/api/stocks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: result.symbol }),
    });
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setMessage(payload.error ?? "添加失败");
      return;
    }
    setMessage(payload.message ?? "品种已添加");
    setQuery("");
    setSearchResults([]);
    setWatchlistOpen(true);
    await loadDashboard();
  }

  async function setActive(symbol: string, active: boolean) {
    const response = await fetch(`/api/stocks/${symbol}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setMessage(payload.error ?? "操作失败");
      return;
    }
    setMessage(payload.message ?? "操作成功");
    if (!active && selectedSymbols.includes(symbol)) {
      const replacement = activeStocks.find((stock) => stock.symbol !== symbol);
      setSelectedSymbols(replacement ? [replacement.symbol] : []);
    }
    await loadDashboard();
  }

  function switchMode(nextComparison: boolean) {
    setComparison(nextComparison);
    if (!nextComparison) setSelectedSymbols((current) => current.slice(0, 1));
  }

  function switchInstrumentFilter(nextFilter: InstrumentFilter) {
    setInstrumentFilter(nextFilter);
    const candidates =
      nextFilter === "all"
        ? activeStocks
        : activeStocks.filter((stock) => stock.instrumentType === nextFilter);
    if (!selectedSymbols.some((symbol) =>
      candidates.some((stock) => stock.symbol === symbol),
    )) {
      setSelectedSymbols(candidates[0] ? [candidates[0].symbol] : []);
      setComparison(false);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen" role="status">
        <div className="loading-mark">中</div>
        <p>正在加载中国股票与ETF价格观察台…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            中
          </div>
          <div>
            <p className="eyebrow">中国A股与ETF · 日终观察</p>
            <h1>中国股票与ETF价格观察台</h1>
          </div>
        </div>
        <div className="header-actions">
          <a className="button secondary" href="/portfolio">
            我的投资
          </a>
          <button
            className="button secondary watchlist-toggle"
            onClick={() => setWatchlistOpen(true)}
            type="button"
            aria-expanded={watchlistOpen}
          >
            自选品种
          </button>
          <button
            className="button secondary"
            onClick={() => loadPrices()}
            type="button"
          >
            刷新当前图表
          </button>
          <a className="button primary" href="/api/export">
            下载最新Excel报告
          </a>
        </div>
      </header>

      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage("")}>
            关闭
          </button>
        </div>
      )}

      <section className="hero-grid">
        <div className="hero-copy">
          <span className="status-pill">
            <i /> 日终数据正常
          </span>
          <h2>把价格变化放进时间里看。</h2>
          <p>
            在同一处查看股票与ETF价格、成交量和年度高低点。历史图表可切换不复权与前复权，
            比较模式统一从100开始。
          </p>
        </div>
        <div className="metrics">
          <article>
            <span>启用品种</span>
            <strong>{activeStocks.length}</strong>
            <small>A股、ETF与自选品种</small>
          </article>
          <article>
            <span>最后完整更新</span>
            <strong className="date-value">
              {formatDate(dashboard?.lastSync ?? null)}
            </strong>
            <small>北京时间 · 每交易日一次</small>
          </article>
          <article>
            <span>数据口径</span>
            <strong className="date-value">人民币 · 日线</strong>
            <small>年度高低点使用不复权价格</small>
          </article>
        </div>
      </section>

      <section className="content-grid">
        <div className="main-column">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">价格走势</p>
                <h3>
                  {comparison
                    ? "多品种标准化比较"
                    : `${stockLookup.get(selectedSymbols[0])?.nameZh ?? "品种"}价格与成交量`}
                </h3>
              </div>
              <div className="panel-controls">
                <div className="segmented" aria-label="品种类型">
                  {(["all", "stock", "etf"] as InstrumentFilter[]).map(
                    (item) => (
                      <button
                        className={instrumentFilter === item ? "active" : ""}
                        onClick={() => switchInstrumentFilter(item)}
                        type="button"
                        key={item}
                      >
                        {item === "all" ? "全部" : item === "stock" ? "A股" : "ETF"}
                      </button>
                    ),
                  )}
                </div>
                <div className="segmented" aria-label="图表模式">
                  <button
                    className={!comparison ? "active" : ""}
                    onClick={() => switchMode(false)}
                    type="button"
                  >
                    单品种
                  </button>
                  <button
                    className={comparison ? "active" : ""}
                    onClick={() => switchMode(true)}
                    type="button"
                  >
                    比较
                  </button>
                </div>
              </div>
            </div>

            <div className="stock-chips" aria-label="选择股票或ETF">
              {filteredActiveStocks.map((stock) => (
                <button
                  type="button"
                  key={stock.symbol}
                  onClick={() => toggleSymbol(stock.symbol)}
                  className={
                    selectedSymbols.includes(stock.symbol) ? "selected" : ""
                  }
                >
                  <span>{stock.nameZh}</span>
                  <small>
                    {stock.symbol} · {stock.instrumentType === "etf" ? "ETF" : "A股"}
                  </small>
                </button>
              ))}
            </div>

            <div className="chart-toolbar">
              <div className="periods" aria-label="时间范围">
                {periods.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={period === item ? "active" : ""}
                    onClick={() => setPeriod(item)}
                  >
                    {periodLabels[item]}
                  </button>
                ))}
              </div>
              <div className="adjustment-toggle">
                <span>价格口径</span>
                <button
                  type="button"
                  className={adjustment === "qfq" ? "active" : ""}
                  onClick={() => setAdjustment("qfq")}
                >
                  前复权
                </button>
                <button
                  type="button"
                  className={adjustment === "raw" ? "active" : ""}
                  onClick={() => setAdjustment("raw")}
                >
                  不复权
                </button>
              </div>
            </div>

            <div className="chart-wrap" aria-label="股价走势图">
              {chartLoading ? (
                <div className="chart-empty">正在读取日线数据…</div>
              ) : chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  {comparison ? (
                    <LineChart
                      data={chartData}
                      margin={{ top: 16, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#E7EDF3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        minTickGap={42}
                        tick={{ fill: "#6B7785", fontSize: 11 }}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fill: "#6B7785", fontSize: 11 }}
                        width={52}
                      />
                      <Tooltip
                        labelFormatter={(label) => `日期：${label}`}
                        formatter={(value, name) => [
                          Number(value).toFixed(2),
                          stockLookup.get(String(name))?.nameZh ?? String(name),
                        ]}
                      />
                      <Legend
                        formatter={(value) =>
                          stockLookup.get(value)?.nameZh ?? value
                        }
                      />
                      {selectedSymbols.map((symbol, index) => (
                        <Line
                          key={symbol}
                          type="monotone"
                          dataKey={symbol}
                          dot={false}
                          stroke={colors[index % colors.length]}
                          strokeWidth={2.2}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 34, right: 24, left: 0, bottom: 26 }}
                    >
                      <CartesianGrid stroke="#E7EDF3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        minTickGap={42}
                        tick={{ fill: "#6B7785", fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="price"
                        domain={["auto", "auto"]}
                        tick={{ fill: "#6B7785", fontSize: 11 }}
                        width={54}
                      />
                      <YAxis yAxisId="volume" orientation="right" hide />
                      <Tooltip
                        labelFormatter={(label) => `日期：${label}`}
                        formatter={(value, name) =>
                          name === "volume"
                            ? [formatVolume(Number(value)), "成交量"]
                            : [`¥${Number(value).toFixed(2)}`, "收盘价"]
                        }
                      />
                      <Bar
                        yAxisId="volume"
                        dataKey="volume"
                        fill="#D9E6F2"
                        opacity={0.7}
                        name="volume"
                      />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey={selectedSymbols[0]}
                        dot={false}
                        stroke="#0A5AA8"
                        strokeWidth={2.4}
                        connectNulls
                      />
                      {visibleExtremes &&
                        yearlyExtremes.map((item) =>
                          sameExtreme(item.high, visibleExtremes.high) ? null : (
                            <ReferenceDot
                              key={`${item.year}-high`}
                              yAxisId="price"
                              x={item.high.date}
                              y={item.high.value}
                              r={4}
                              fill="#D96A6A"
                              stroke="#FFFFFF"
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={
                                period === "MAX"
                                  ? undefined
                                  : {
                                      value: `${item.year}年高 ${item.high.date.slice(5)}`,
                                      position: "top",
                                      fill: "#A92F2F",
                                      fontSize: 9,
                                      fontWeight: 700,
                                    }
                              }
                            />
                          ),
                        )}
                      {visibleExtremes &&
                        yearlyExtremes.map((item) =>
                          sameExtreme(item.low, visibleExtremes.low) ? null : (
                            <ReferenceDot
                              key={`${item.year}-low`}
                              yAxisId="price"
                              x={item.low.date}
                              y={item.low.value}
                              r={4}
                              fill="#49A985"
                              stroke="#FFFFFF"
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={
                                period === "MAX"
                                  ? undefined
                                  : {
                                      value: `${item.year}年低 ${item.low.date.slice(5)}`,
                                      position: "bottom",
                                      fill: "#126447",
                                      fontSize: 9,
                                      fontWeight: 700,
                                    }
                              }
                            />
                          ),
                        )}
                      {visibleExtremes && (
                        <>
                          <ReferenceDot
                            yAxisId="price"
                            x={visibleExtremes.high.date}
                            y={visibleExtremes.high.value}
                            r={5}
                            fill="#C33C3C"
                            stroke="#FFFFFF"
                            strokeWidth={2}
                            ifOverflow="extendDomain"
                            label={{
                              value: `区间最高 ¥${visibleExtremes.high.value.toFixed(2)} · ${visibleExtremes.high.date}`,
                              position: "top",
                              fill: "#A92F2F",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                          <ReferenceDot
                            yAxisId="price"
                            x={visibleExtremes.low.date}
                            y={visibleExtremes.low.value}
                            r={5}
                            fill="#187A58"
                            stroke="#FFFFFF"
                            strokeWidth={2}
                            ifOverflow="extendDomain"
                            label={{
                              value: `区间最低 ¥${visibleExtremes.low.value.toFixed(2)} · ${visibleExtremes.low.date}`,
                              position: "bottom",
                              fill: "#126447",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                        </>
                      )}
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty chart-pending">
                  <strong>历史数据尚未就绪</strong>
                  <span>新股票会自动进入同步队列，无需重复添加。</span>
                </div>
              )}
            </div>
            {visibleExtremes && (
              <div className="extreme-summary" aria-label="当前区间最高价和最低价">
                <span className="high">
                  <i /> 最高 ¥{visibleExtremes.high.value.toFixed(2)}
                  <small>{visibleExtremes.high.date}</small>
                </span>
                <span className="low">
                  <i /> 最低 ¥{visibleExtremes.low.value.toFixed(2)}
                  <small>{visibleExtremes.low.date}</small>
                </span>
              </div>
            )}
            {yearlyExtremes.length > 0 && (
              <section
                className="year-extreme-strip"
                aria-label="当前图表范围内各年度最高价和最低价"
              >
                <div className="year-extreme-heading">
                  <strong>年度高低点标记</strong>
                  <span>红点为年度最高，绿点为年度最低；日期均在当前图表范围内计算</span>
                </div>
                <div className="year-extreme-grid">
                  {yearlyExtremes.map((item) => (
                    <div className="year-extreme-card" key={item.year}>
                      <strong>{item.year}年</strong>
                      <span className="high">
                        最高 ¥{item.high.value.toFixed(2)}
                        <small>{item.high.date}</small>
                      </span>
                      <span className="low">
                        最低 ¥{item.low.value.toFixed(2)}
                        <small>{item.low.date}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="chart-footnote">
              <span>
                {comparison
                  ? "比较模式：起始值统一为100"
                  : "左轴：价格（CNY）｜浅蓝柱：成交量"}
              </span>
              <span>数据可能延迟，仅供研究参考</span>
            </div>
          </article>

          <PerformanceRanking />

          <article className="panel annual-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">年度区间</p>
                <h3>年度最低价与最高价</h3>
              </div>
              <div className="year-controls">
                <label>
                  起始年
                  <input
                    type="number"
                    min="1990"
                    max={yearEnd}
                    value={yearStart}
                    onChange={(event) =>
                      setYearStart(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  结束年
                  <input
                    type="number"
                    min={yearStart}
                    max={new Date().getFullYear()}
                    value={yearEnd}
                    onChange={(event) =>
                      setYearEnd(Number(event.target.value))
                    }
                  />
                </label>
              </div>
            </div>
            <div className="table-scroll">
              <table className="annual-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>年份</th>
                    {filteredActiveStocks.map((stock) => (
                      <th colSpan={2} key={stock.symbol}>
                        {stock.nameZh}
                        <small>{stock.symbol}</small>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {filteredActiveStocks.map((stock) => (
                      <FragmentPair key={stock.symbol} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleYears.map((year) => (
                    <tr key={year}>
                      <th>{year}</th>
                      {filteredActiveStocks.map((stock) => {
                        const row = dashboard?.annualRanges.find(
                          (item) =>
                            item.year === year && item.symbol === stock.symbol,
                        );
                        return (
                          <FragmentValues
                            key={stock.symbol}
                            low={row?.low}
                            high={row?.high}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-note">
              年度高低点基于不复权日线价格；当前年度会在每日收盘后继续更新。
            </p>
          </article>
        </div>

        {watchlistOpen && (
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="关闭自选品种面板"
            onClick={() => setWatchlistOpen(false)}
          />
        )}

        <aside className={`side-column ${watchlistOpen ? "open" : ""}`}>
          <div className="drawer-heading">
            <div>
              <p className="section-kicker">自选品种管理</p>
              <strong>添加与管理股票、ETF</strong>
            </div>
            <button
              type="button"
              aria-label="关闭自选品种面板"
              onClick={() => setWatchlistOpen(false)}
            >
              关闭
            </button>
          </div>
          <article className="panel add-panel">
            <p className="section-kicker">公开观察名单</p>
            <h3>添加股票或ETF</h3>
            <p className="muted">
              输入6位证券代码或中文名称，确认结果后再添加。
            </p>
            <div className="search-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchStocks();
                }}
                placeholder="例如：510300 或 沪深300ETF"
                aria-label="股票或ETF代码、名称"
              />
              <button
                type="button"
                onClick={searchStocks}
                disabled={searching}
              >
                {searching ? "搜索中" : "搜索"}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result) => (
                  <div key={result.symbol}>
                    <span>
                      <strong>{result.nameZh}</strong>
                      <small>
                        {result.symbol} · {result.exchange} · {result.instrumentType === "etf" ? "ETF" : "A股"}
                      </small>
                    </span>
                    <button type="button" onClick={() => addStock(result)}>
                      添加
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="open-note">
              所有访问者都可以添加经验证的A股或ETF代码。系统不设数量上限，但无效代码不会写入。
            </div>
          </article>

          <article className="panel watchlist-panel">
            <div className="panel-heading compact">
              <div>
                <p className="section-kicker">名单管理</p>
                <h3>当前品种</h3>
              </div>
              <span className="count-badge">
                {dashboard?.stocks.length ?? 0}
              </span>
            </div>
            <div className="watchlist">
              {dashboard?.stocks.map((stock) => (
                <div
                  className={!stock.active ? "inactive" : ""}
                  key={stock.symbol}
                >
                  <span className="stock-avatar">
                    {stock.nameZh.slice(0, 1)}
                  </span>
                  <span className="stock-meta">
                    <strong>{stock.nameZh}</strong>
                    <small>
                      {stock.symbol} · {stock.exchange}
                    </small>
                    <small className={`sync-status ${stock.syncStatus}`}>
                      {syncLabels[stock.syncStatus]}
                    </small>
                  </span>
                  <span
                    className={
                      stock.instrumentType === "etf"
                        ? "tag etf"
                        : stock.category === "银行股"
                          ? "tag bank"
                          : "tag"
                    }
                  >
                    {stock.category}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setActive(stock.symbol, !stock.active)}
                  >
                    {stock.active ? "停用" : "恢复"}
                  </button>
                </div>
              ))}
            </div>
            <p className="soft-delete-note">停用不会删除历史数据，可随时恢复。</p>
          </article>

          <article className="panel activity-panel">
            <p className="section-kicker">活动记录</p>
            <h3>最近变更</h3>
            <div className="activity-list">
              {dashboard?.activity.length ? (
                dashboard.activity.map((item) => (
                  <div key={item.id}>
                    <i className={item.action === "更新" ? "sync" : ""} />
                    <span>
                      <strong>{item.message}</strong>
                      <small>{formatDate(item.createdAt)}</small>
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">
                  添加、停用或恢复品种后，记录会显示在这里。
                </p>
              )}
            </div>
          </article>
        </aside>
      </section>

      <footer>
        <div>
          <strong>数据说明</strong>
          <p>
            日线数据由AKShare在后台定时采集并写入数据库；网页浏览不会重复请求外部行情源。
            新股票或ETF会自动补齐完整历史，当前年份在每个交易日收盘后增量更新。
          </p>
        </div>
        <div className="source-links">
          <a
            href="https://akshare.akfamily.xyz/data/stock/stock.html"
            target="_blank"
            rel="noreferrer"
          >
            AKShare股票与ETF说明
          </a>
          <a href="/中国股票价格观察台.xlsx">下载银行历史样本工作簿</a>
        </div>
        <p className="disclaimer">
          本工具仅用于信息整理与研究，不构成任何投资建议。
        </p>
      </footer>
    </main>
  );
}

function FragmentPair() {
  return (
    <>
      <th>最低</th>
      <th>最高</th>
    </>
  );
}

function FragmentValues({
  low,
  high,
}: {
  low?: number;
  high?: number;
}) {
  return (
    <>
      <td className="low-value">{low == null ? "—" : low.toFixed(2)}</td>
      <td className="high-value">{high == null ? "—" : high.toFixed(2)}</td>
    </>
  );
}
