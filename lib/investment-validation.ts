import type { InvestmentLotInput } from "./database";

function finiteNumber(value: unknown, label: string, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > maximum) {
    throw new Error(`${label}必须是有效的正数`);
  }
  return number;
}

export function parseInvestmentLotInput(body: unknown): InvestmentLotInput {
  if (!body || typeof body !== "object") {
    throw new Error("投资记录格式无效");
  }
  const input = body as Record<string, unknown>;
  const symbol = String(input.symbol ?? "").trim();
  if (!/^\d{6}$/.test(symbol)) {
    throw new Error("请选择有效的六位证券代码");
  }
  const investedAmount = finiteNumber(input.investedAmount, "买入金额", 1e12);
  const entryPrice = finiteNumber(input.entryPrice, "成交价格", 1e8);
  const fees = Number(input.fees ?? 0);
  if (!Number.isFinite(fees) || fees < 0 || fees > 1e9) {
    throw new Error("交易费用必须是有效的非负数");
  }
  const investedAtDate = new Date(String(input.investedAt ?? ""));
  if (Number.isNaN(investedAtDate.getTime())) {
    throw new Error("请选择有效的投资日期和时间");
  }
  if (investedAtDate.getTime() > Date.now() + 300_000) {
    throw new Error("投资时间不能晚于当前时间");
  }
  const rawNote = String(input.note ?? "").trim();
  if (rawNote.length > 300) {
    throw new Error("备注不能超过300个字符");
  }
  return {
    symbol,
    investedAmount,
    entryPrice,
    fees,
    investedAt: investedAtDate.toISOString(),
    note: rawNote || null,
  };
}
