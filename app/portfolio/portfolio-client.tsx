"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  InstrumentType,
  InvestmentLot,
  PortfolioPosition,
  PortfolioSummary,
} from "../../lib/types";

interface PortfolioStock {
  symbol: string;
  nameZh: string;
  instrumentType: InstrumentType;
}

interface PortfolioPayload {
  lots: InvestmentLot[];
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
  stocks?: PortfolioStock[];
  message?: string;
  error?: string;
}

interface FormState {
  symbol: string;
  investedAmount: string;
  entryPrice: string;
  fees: string;
  investedAt: string;
  note: string;
}

type InstrumentFilter = "all" | InstrumentType;
type PositionSort = "returnPct" | "unrealizedPnl";

const emptySummary: PortfolioSummary = {
  totalInvested: 0,
  totalFees: 0,
  totalCost: 0,
  currentValue: 0,
  unrealizedPnl: 0,
  returnPct: null,
  positionCount: 0,
};

function localDateTimeInput(value = new Date()) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialForm(symbol = ""): FormState {
  return {
    symbol,
    investedAmount: "",
    entryPrice: "",
    fees: "0",
    investedAt: localDateTimeInput(),
    note: "",
  };
}

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number | null) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : moneyFormatter.format(value);
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function valueClass(value: number | null) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function formatInvestmentTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function holdingDays(value: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
}

export default function PortfolioClient({
  userName,
  signOutHref,
}: {
  userName: string;
  signOutHref: string;
}) {
  const [lots, setLots] = useState<InvestmentLot[]>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>(emptySummary);
  const [stocks, setStocks] = useState<PortfolioStock[]>([]);
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<InstrumentFilter>("all");
  const [sortBy, setSortBy] = useState<PositionSort>("returnPct");
  const [ascending, setAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const applyPayload = useCallback((payload: PortfolioPayload) => {
    setLots(payload.lots);
    setPositions(payload.positions);
    setSummary(payload.summary);
    if (payload.stocks) {
      setStocks(payload.stocks);
      setForm((current) => ({
        ...current,
        symbol: current.symbol || payload.stocks?.[0]?.symbol || "",
      }));
    }
    if (payload.message) setMessage(payload.message);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/portfolio", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as PortfolioPayload;
        if (!response.ok) throw new Error(payload.error ?? "读取投资记录失败");
        return payload;
      })
      .then((payload) => applyPayload(payload))
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "读取投资记录失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applyPayload]);

  const rankedPositions = useMemo(() => {
    const filtered =
      filter === "all"
        ? positions
        : positions.filter((position) => position.instrumentType === filter);
    return [...filtered].sort((left, right) => {
      const leftValue = left[sortBy];
      const rightValue = right[sortBy];
      if (leftValue == null && rightValue == null) {
        return left.symbol.localeCompare(right.symbol);
      }
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      return ascending ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [ascending, filter, positions, sortBy]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm(stocks[0]?.symbol ?? ""));
  }

  async function submitInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const investedAt = new Date(form.investedAt);
      if (Number.isNaN(investedAt.getTime())) {
        throw new Error("请选择有效的投资日期和时间");
      }
      const response = await fetch(
        editingId == null ? "/api/portfolio" : `/api/portfolio/${editingId}`,
        {
          method: editingId == null ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol: form.symbol,
            investedAmount: Number(form.investedAmount),
            entryPrice: Number(form.entryPrice),
            fees: Number(form.fees || 0),
            investedAt: investedAt.toISOString(),
            note: form.note,
          }),
        },
      );
      const payload = (await response.json()) as PortfolioPayload;
      if (!response.ok) throw new Error(payload.error ?? "保存投资记录失败");
      applyPayload(payload);
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存投资记录失败");
    } finally {
      setSaving(false);
    }
  }

  function editLot(lot: InvestmentLot) {
    setEditingId(lot.id);
    setForm({
      symbol: lot.symbol,
      investedAmount: String(lot.investedAmount),
      entryPrice: String(lot.entryPrice),
      fees: String(lot.fees),
      investedAt: localDateTimeInput(new Date(lot.investedAt)),
      note: lot.note ?? "",
    });
    document.getElementById("investment-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function removeLot(lot: InvestmentLot) {
    if (!window.confirm(`确认删除 ${lot.nameZh} 的这笔投资记录吗？`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/portfolio/${lot.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as PortfolioPayload;
      if (!response.ok) throw new Error(payload.error ?? "删除投资记录失败");
      applyPayload(payload);
      if (editingId === lot.id) resetForm();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除投资记录失败");
    }
  }

  return (
    <main className="app-shell portfolio-shell">
      <header className="topbar">
        <Link className="brand brand-link" href="/">
          <div className="brand-mark" aria-hidden="true">投</div>
          <div>
            <p className="eyebrow">私密投资记录 · 日终估值</p>
            <h1>我的投资组合</h1>
          </div>
        </Link>
        <div className="header-actions">
          <span className="signed-in-user">{userName}</span>
          <Link className="button secondary" href="/">返回观察台</Link>
          <a className="button secondary" href={signOutHref}>退出登录</a>
        </div>
      </header>

      {(message || error) && (
        <div className={`notice ${error ? "notice-error" : ""}`} role="status">
          <span>{error || message}</span>
          <button type="button" onClick={() => { setError(""); setMessage(""); }}>
            关闭
          </button>
        </div>
      )}

      <section className="portfolio-hero">
        <div>
          <span className="status-pill"><i /> 仅本人可见</span>
          <h2>记录真实买入，持续看清结果。</h2>
          <p>
            每笔买入单独保存，组合按最新不复权日终价格估值。费用计入成本，现金分红、卖出和税费暂未计入。
          </p>
        </div>
        <div className="portfolio-metrics">
          <article><span>总成本</span><strong>{formatMoney(summary.totalCost)}</strong><small>含交易费用</small></article>
          <article><span>当前市值</span><strong>{formatMoney(summary.currentValue)}</strong><small>最新日终价格</small></article>
          <article><span>未实现盈亏</span><strong className={valueClass(summary.unrealizedPnl)}>{formatMoney(summary.unrealizedPnl)}</strong><small>{formatPercent(summary.returnPct)}</small></article>
          <article><span>持仓品种</span><strong>{summary.positionCount}</strong><small>{lots.length} 笔买入记录</small></article>
        </div>
      </section>

      <section className="portfolio-grid">
        <article className="panel investment-form-panel" id="investment-form">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{editingId == null ? "新增买入" : "修改记录"}</p>
              <h3>{editingId == null ? "记录一笔投资" : "更新这笔投资"}</h3>
            </div>
            {editingId != null && <button className="text-button" type="button" onClick={resetForm}>取消修改</button>}
          </div>
          <form className="investment-form" onSubmit={submitInvestment}>
            <label className="field-span-2">证券
              <select required value={form.symbol} onChange={(event) => updateForm("symbol", event.target.value)}>
                {stocks.map((stock) => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.nameZh}（{stock.symbol} · {stock.instrumentType === "etf" ? "ETF" : "A股"}）
                  </option>
                ))}
              </select>
            </label>
            <label>买入金额（不含费用）
              <input min="0.01" required step="0.01" type="number" value={form.investedAmount} onChange={(event) => updateForm("investedAmount", event.target.value)} placeholder="例如 10000" />
            </label>
            <label>实际成交价格
              <input min="0.001" required step="0.001" type="number" value={form.entryPrice} onChange={(event) => updateForm("entryPrice", event.target.value)} placeholder="例如 12.350" />
            </label>
            <label>投资日期和时间
              <input max={localDateTimeInput()} required type="datetime-local" value={form.investedAt} onChange={(event) => updateForm("investedAt", event.target.value)} />
            </label>
            <label>交易费用
              <input min="0" step="0.01" type="number" value={form.fees} onChange={(event) => updateForm("fees", event.target.value)} />
            </label>
            <label className="field-span-2">备注（可选）
              <textarea maxLength={300} value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="例如：分批建仓第一笔" />
            </label>
            <button className="button primary field-span-2" disabled={saving || !stocks.length} type="submit">
              {saving ? "正在保存…" : editingId == null ? "保存投资记录" : "保存修改"}
            </button>
          </form>
        </article>

        <article className="panel portfolio-ranking-panel">
          <div className="panel-heading performance-heading">
            <div>
              <p className="section-kicker">持仓表现</p>
              <h3>从最差到最好</h3>
            </div>
            <div className="performance-controls">
              <div className="segmented" aria-label="持仓品种类型">
                {(["all", "stock", "etf"] as InstrumentFilter[]).map((item) => (
                  <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
                    {item === "all" ? "全部" : item === "stock" ? "A股" : "ETF"}
                  </button>
                ))}
              </div>
              <div className="segmented" aria-label="持仓排名口径">
                <button className={sortBy === "returnPct" ? "active" : ""} onClick={() => setSortBy("returnPct")} type="button">收益率</button>
                <button className={sortBy === "unrealizedPnl" ? "active" : ""} onClick={() => setSortBy("unrealizedPnl")} type="button">盈亏金额</button>
              </div>
              <button className="sort-direction" onClick={() => setAscending((current) => !current)} type="button">
                {ascending ? "最差 → 最好" : "最好 → 最差"}
              </button>
            </div>
          </div>
          {loading ? <div className="empty-state">正在读取私人投资记录…</div> : rankedPositions.length === 0 ? <div className="empty-state">保存第一笔投资后，持仓排名会显示在这里。</div> : (
            <div className="table-scroll">
              <table className="data-table position-table">
                <thead><tr><th>排名</th><th>证券</th><th>总成本</th><th>现价</th><th>当前市值</th><th>未实现盈亏</th><th>收益率</th><th>持有时间</th></tr></thead>
                <tbody>
                  {rankedPositions.map((position, index) => (
                    <tr key={position.symbol}>
                      <td className="rank-cell">{index + 1}</td>
                      <td><strong>{position.nameZh}</strong><small>{position.symbol} · {position.lotCount}笔</small></td>
                      <td>{formatMoney(position.totalCost)}<small>均价 ¥{position.averageEntryPrice.toFixed(3)}</small></td>
                      <td>{position.currentPrice == null ? "—" : `¥${position.currentPrice.toFixed(3)}`}<small>{position.currentPriceDate ?? "待更新"}</small></td>
                      <td>{formatMoney(position.currentValue)}</td>
                      <td className={valueClass(position.unrealizedPnl)}>{formatMoney(position.unrealizedPnl)}</td>
                      <td className={valueClass(position.returnPct)}>{formatPercent(position.returnPct)}</td>
                      <td>{holdingDays(position.firstInvestedAt)}天<small>自首笔买入</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <article className="panel lot-panel">
        <div className="panel-heading">
          <div><p className="section-kicker">交易批次</p><h3>全部买入记录</h3></div>
          <span className="privacy-note">登录身份隔离 · 其他访客无法读取</span>
        </div>
        {loading ? <div className="empty-state">正在加载…</div> : lots.length === 0 ? <div className="empty-state">尚无投资记录。</div> : (
          <div className="table-scroll">
            <table className="data-table lot-table">
              <thead><tr><th>证券</th><th>投资时间</th><th>买入金额</th><th>成交价</th><th>数量</th><th>现值</th><th>收益率</th><th>备注</th><th>操作</th></tr></thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td><strong>{lot.nameZh}</strong><small>{lot.symbol}</small></td>
                    <td>{formatInvestmentTime(lot.investedAt)}</td>
                    <td>{formatMoney(lot.investedAmount)}<small>费用 {formatMoney(lot.fees)}</small></td>
                    <td>¥{lot.entryPrice.toFixed(3)}</td>
                    <td>{lot.quantity.toFixed(3)}</td>
                    <td>{formatMoney(lot.currentValue)}</td>
                    <td className={valueClass(lot.returnPct)}>{formatPercent(lot.returnPct)}</td>
                    <td className="note-cell">{lot.note || "—"}</td>
                    <td><div className="row-actions"><button type="button" onClick={() => editLot(lot)}>修改</button><button className="danger" type="button" onClick={() => void removeLot(lot)}>删除</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <footer>
        <div><strong>计算说明</strong><p>数量 = 买入金额 ÷ 成交价；未实现盈亏 = 最新日终市值 − 买入金额 − 费用。现金分红、卖出、税费和汇率暂未包含。</p></div>
        <div className="disclaimer">本页面仅记录和展示数据，不构成投资建议。</div>
      </footer>
    </main>
  );
}
