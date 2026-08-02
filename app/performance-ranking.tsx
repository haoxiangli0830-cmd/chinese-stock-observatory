"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Adjustment,
  InstrumentType,
  PerformanceRow,
} from "../lib/types";

type InstrumentFilter = "all" | InstrumentType;
type RankKey = "oneMonthReturn" | "sixMonthReturn" | "oneYearReturn";

const rankLabels: Record<RankKey, string> = {
  oneMonthReturn: "1个月",
  sixMonthReturn: "6个月",
  oneYearReturn: "1年",
};

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function valueClass(value: number | null) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

export default function PerformanceRanking() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [instrumentFilter, setInstrumentFilter] =
    useState<InstrumentFilter>("all");
  const [adjustment, setAdjustment] = useState<Adjustment>("raw");
  const [rankKey, setRankKey] = useState<RankKey>("oneMonthReturn");
  const [ascending, setAscending] = useState(true);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/performance?adjust=${adjustment}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          rows?: PerformanceRow[];
          marketDate?: string | null;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "读取涨跌幅排名失败");
        }
        setRows(payload.rows ?? []);
        setMarketDate(payload.marketDate ?? null);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "读取涨跌幅排名失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [adjustment]);

  const rankedRows = useMemo(() => {
    const filtered =
      instrumentFilter === "all"
        ? rows
        : rows.filter((row) => row.instrumentType === instrumentFilter);
    return [...filtered].sort((left, right) => {
      const leftValue = left[rankKey];
      const rightValue = right[rankKey];
      if (left.stale !== right.stale) return left.stale ? 1 : -1;
      if (leftValue == null && rightValue == null) {
        return left.symbol.localeCompare(right.symbol);
      }
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      return ascending ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [ascending, instrumentFilter, rankKey, rows]);

  return (
    <article className="panel performance-panel">
      <div className="panel-heading performance-heading">
        <div>
          <p className="section-kicker">区间涨跌</p>
          <h3>证券表现排名</h3>
          <p className="panel-description">
            按最新日终收盘价计算，可从表现最差排到最好；结果是研究筛选，不是买卖建议。
          </p>
        </div>
        <div className="performance-controls">
          <div className="segmented" aria-label="排名品种类型">
            {(["all", "stock", "etf"] as InstrumentFilter[]).map((item) => (
              <button
                className={instrumentFilter === item ? "active" : ""}
                key={item}
                onClick={() => setInstrumentFilter(item)}
                type="button"
              >
                {item === "all" ? "全部" : item === "stock" ? "A股" : "ETF"}
              </button>
            ))}
          </div>
          <div className="segmented" aria-label="价格口径">
            {(["raw", "qfq"] as Adjustment[]).map((item) => (
              <button
                className={adjustment === item ? "active" : ""}
                key={item}
                onClick={() => setAdjustment(item)}
                type="button"
              >
                {item === "raw" ? "不复权" : "前复权"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ranking-toolbar">
        <div className="periods" aria-label="排名周期">
          {(Object.keys(rankLabels) as RankKey[]).map((key) => (
            <button
              className={rankKey === key ? "active" : ""}
              key={key}
              onClick={() => setRankKey(key)}
              type="button"
            >
              按{rankLabels[key]}排名
            </button>
          ))}
        </div>
        <button
          className="sort-direction"
          onClick={() => setAscending((current) => !current)}
          type="button"
        >
          {ascending ? "最差 → 最好" : "最好 → 最差"}
        </button>
      </div>

      {error ? (
        <div className="empty-state error-state">{error}</div>
      ) : loading ? (
        <div className="empty-state">正在计算全部证券的区间涨跌幅…</div>
      ) : (
        <div className="table-scroll performance-table-scroll">
          <table className="data-table performance-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>证券</th>
                <th>最新价</th>
                <th className={rankKey === "oneMonthReturn" ? "active-rank" : ""}>1个月</th>
                <th className={rankKey === "sixMonthReturn" ? "active-rank" : ""}>6个月</th>
                <th className={rankKey === "oneYearReturn" ? "active-rank" : ""}>1年</th>
                <th>距1年高点</th>
                <th>数据日期</th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((row, index) => (
                <tr className={row.stale ? "stale-row" : ""} key={row.symbol}>
                  <td className="rank-cell">{row.stale ? "—" : index + 1}</td>
                  <td>
                    <strong>{row.nameZh}</strong>
                    <small>
                      {row.symbol} · {row.instrumentType === "etf" ? "ETF" : "A股"}
                    </small>
                  </td>
                  <td>¥{row.latestPrice.toFixed(3)}</td>
                  <td className={valueClass(row.oneMonthReturn)}>{formatPercent(row.oneMonthReturn)}</td>
                  <td className={valueClass(row.sixMonthReturn)}>{formatPercent(row.sixMonthReturn)}</td>
                  <td className={valueClass(row.oneYearReturn)}>{formatPercent(row.oneYearReturn)}</td>
                  <td className={valueClass(row.distanceFromOneYearHigh)}>
                    {formatPercent(row.distanceFromOneYearHigh)}
                  </td>
                  <td>
                    {row.latestDate}
                    <small>
                      {row.actualAdjustment === "qfq" ? "前复权" : "不复权"}
                      {row.stale ? " · 数据较旧" : ""}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="table-note">
        截至 {marketDate ?? "待更新"}。目标日无交易时使用该日或之前最后一个交易日；前复权不可用时会明确显示不复权口径。
      </p>
    </article>
  );
}
