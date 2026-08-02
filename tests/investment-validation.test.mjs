import assert from "node:assert/strict";
import test from "node:test";
import { parseInvestmentLotInput } from "../lib/investment-validation.ts";

test("investment input is normalized for storage", () => {
  const parsed = parseInvestmentLotInput({
    symbol: "510300",
    investedAmount: "10000",
    entryPrice: "4.125",
    fees: "5",
    investedAt: "2026-07-31T08:00:00.000Z",
    note: "  first lot  ",
  });
  assert.deepEqual(parsed, {
    symbol: "510300",
    investedAmount: 10000,
    entryPrice: 4.125,
    fees: 5,
    investedAt: "2026-07-31T08:00:00.000Z",
    note: "first lot",
  });
});

test("investment input rejects zero amounts and malformed symbols", () => {
  assert.throws(
    () => parseInvestmentLotInput({ symbol: "ETF", investedAmount: 100, entryPrice: 1, investedAt: "2026-07-31" }),
    /六位证券代码/,
  );
  assert.throws(
    () => parseInvestmentLotInput({ symbol: "510300", investedAmount: 0, entryPrice: 1, investedAt: "2026-07-31" }),
    /买入金额/,
  );
});
