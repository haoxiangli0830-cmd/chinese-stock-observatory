import { listAnnualRanges, listStocks } from "../../../lib/database";

export const dynamic = "force-dynamic";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET() {
  const [stocks, annualRanges] = await Promise.all([
    listStocks(),
    listAnnualRanges(),
  ]);
  const activeStocks = stocks.filter((stock) => stock.active);
  const years = Array.from(
    new Set(annualRanges.map((row) => row.year)),
  ).sort((a, b) => b - a);

  const annualRows = years
    .map(
      (year) => `<tr><td class="year">${year}</td>${activeStocks
        .map((stock) => {
          const row = annualRanges.find(
            (item) => item.symbol === stock.symbol && item.year === year,
          );
          return `<td>${row ? row.low.toFixed(2) : "—"}</td><td>${row ? row.high.toFixed(2) : "—"}</td>`;
        })
        .join("")}</tr>`,
    )
    .join("");

  const groupHeaders = activeStocks
    .map(
      (stock) =>
        `<th colspan="2">${escapeHtml(stock.nameZh)}<br><small>${stock.symbol}</small></th>`,
    )
    .join("");
  const subHeaders = activeStocks
    .map(() => "<th>最低</th><th>最高</th>")
    .join("");
  const watchlistRows = stocks
    .map(
      (stock) =>
        `<tr><td>${stock.active ? "启用" : "停用"}</td><td>${stock.symbol}</td><td>${escapeHtml(stock.nameZh)}</td><td>${stock.instrumentType === "etf" ? "ETF" : "A股"}</td><td>${stock.exchange}</td><td>${escapeHtml(stock.category)}</td><td>${escapeHtml(stock.syncStatus)}</td><td>${escapeHtml(stock.source)}</td><td>${escapeHtml(stock.lastPriceDateRaw ?? "待更新")}</td><td>${escapeHtml(stock.lastSuccessAt ?? "待更新")}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><style>
  body{font-family:"Microsoft YaHei",Arial;color:#172033}
  h1{color:#0a3d75}p{color:#5f6b7a}
  table{border-collapse:collapse;margin:18px 0;width:100%}
  th{background:#0a3d75;color:white;padding:8px;border:1px solid #d6e0ea}
  td{padding:7px;border:1px solid #d6e0ea;text-align:right}
  td:first-child{text-align:left}.year{font-weight:bold;background:#eef4fa}
  small{font-weight:normal;opacity:.8}
  </style></head><body>
  <h1>中国股票与ETF价格观察台</h1>
  <p>币种：人民币（CNY）｜数据频率：日终｜导出时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
  <h2>年度最高价与最低价（不复权）</h2>
  <table><tr><th rowspan="2">年份</th>${groupHeaders}</tr><tr>${subHeaders}</tr>${annualRows}</table>
  <h2>观察名单</h2>
  <table><tr><th>启用状态</th><th>代码</th><th>名称</th><th>类型</th><th>交易所</th><th>分类</th><th>同步状态</th><th>数据源</th><th>最新交易日</th><th>最后更新</th></tr>${watchlistRows}</table>
  <p>说明：价格仅用于信息与研究，不构成投资建议。</p>
  </body></html>`;

  const filename = encodeURIComponent(
    `中国股票与ETF价格观察台_${new Date().toISOString().slice(0, 10)}.xls`,
  );
  return new Response(`\uFEFF${html}`, {
    headers: {
      "content-type": "application/vnd.ms-excel; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${filename}`,
      "cache-control": "no-store",
    },
  });
}
