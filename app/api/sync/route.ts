import { env } from "cloudflare:workers";
import {
  markSyncComplete,
  upsertAnnualRanges,
  upsertPrices,
} from "../../../lib/database";
import type { AnnualRange, PricePoint } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = (env as unknown as { SYNC_SECRET?: string })
    .SYNC_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return Response.json({ error: "未授权的同步请求" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      prices?: PricePoint[];
      annualRanges?: AnnualRange[];
      symbols?: string[];
      source?: string;
    };
    const prices = Array.isArray(payload.prices) ? payload.prices : [];
    const annualRanges = Array.isArray(payload.annualRanges)
      ? payload.annualRanges
      : [];
    const symbols = Array.isArray(payload.symbols) ? payload.symbols : [];
    await upsertPrices(prices);
    await upsertAnnualRanges(annualRanges);
    await markSyncComplete(symbols, payload.source ?? "Tushare/AKShare");
    return Response.json({
      ok: true,
      priceRows: prices.length,
      annualRows: annualRanges.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 400 },
    );
  }
}
