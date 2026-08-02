import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePerformance,
  shiftCalendarMonths,
} from "../lib/performance.ts";

function point(date, close, high = close) {
  return {
    symbol: "600036",
    date,
    open: close,
    high,
    low: close,
    close,
    volume: 1,
    adjustment: "raw",
    source: "test",
  };
}

test("calendar month shifts clamp month-end dates", () => {
  assert.equal(shiftCalendarMonths("2026-03-31", 1), "2026-02-28");
  assert.equal(shiftCalendarMonths("2024-03-31", 1), "2024-02-29");
  assert.equal(shiftCalendarMonths("2026-01-31", 6), "2025-07-31");
});

test("performance uses the last trading close on or before each target date", () => {
  const result = calculatePerformance([
    point("2025-07-31", 80, 82),
    point("2026-01-30", 90, 92),
    point("2026-06-29", 95, 97),
    point("2026-07-31", 100, 110),
  ]);
  assert.ok(result);
  assert.equal(result.latestDate, "2026-07-31");
  assert.equal(result.latestPrice, 100);
  assert.ok(Math.abs(result.oneMonthReturn - (100 / 95 - 1) * 100) < 1e-10);
  assert.ok(Math.abs(result.sixMonthReturn - (100 / 90 - 1) * 100) < 1e-10);
  assert.equal(result.oneYearReturn, 25);
  assert.ok(Math.abs(result.distanceFromOneYearHigh - (100 / 110 - 1) * 100) < 1e-10);
});

test("performance leaves a horizon empty when no earlier anchor exists", () => {
  const result = calculatePerformance([
    point("2026-07-01", 90),
    point("2026-07-31", 100),
  ]);
  assert.ok(result);
  assert.equal(result.oneMonthReturn, null);
  assert.equal(result.sixMonthReturn, null);
  assert.equal(result.oneYearReturn, null);
});
