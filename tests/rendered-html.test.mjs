import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const distUrl = new URL("../dist/", import.meta.url);

test("production build contains the Chinese stock observatory", async () => {
  const worker = await readFile(new URL("server/index.js", distUrl), "utf8");
  assert.match(worker, /中国股票与ETF价格观察台/);
  assert.match(worker, /\/api\/dashboard/);
  assert.match(worker, /\/api\/prices/);
  assert.match(worker, /\/api\/performance/);
  assert.match(worker, /\/api\/portfolio/);
  assert.match(worker, /\/api\/export/);

  const assetDirectory = new URL("server/ssr/assets/", distUrl);
  const files = await readdir(assetDirectory);
  const dashboardAsset = files.find((name) =>
    /^dashboard-client-.+\.js$/.test(name),
  );
  assert.ok(dashboardAsset, "dashboard SSR asset should be emitted");

  const dashboard = await readFile(
    new URL(`server/ssr/assets/${dashboardAsset}`, distUrl),
    "utf8",
  );
  assert.match(dashboard, /正在加载中国股票与ETF价格观察台/);
  assert.match(dashboard, /ETF/);
  assert.match(dashboard, /年度最低价与最高价/);
  assert.match(dashboard, /刷新当前图表/);
  assert.match(dashboard, /证券表现排名/);
  assert.match(dashboard, /我的投资/);
  assert.match(dashboard, /历史数据尚未就绪/);
  assert.match(dashboard, /当前区间最高价和最低价/);
  assert.match(dashboard, /年度高低点标记/);
  assert.match(dashboard, /区间最高/);
  assert.match(dashboard, /自选品种管理/);
  assert.match(dashboard, /AKShare/);
  assert.doesNotMatch(dashboard, /Tushare/);
  assert.doesNotMatch(dashboard, /Your site is taking shape/);

  const workbook = await stat(
    new URL("client/中国股票价格观察台.xlsx", distUrl),
  );
  const sharingImage = await stat(new URL("client/og-share.png", distUrl));
  assert.ok(workbook.size > 100_000, "complete workbook should be bundled");
  assert.ok(sharingImage.size > 100_000, "sharing image should be bundled");
});
