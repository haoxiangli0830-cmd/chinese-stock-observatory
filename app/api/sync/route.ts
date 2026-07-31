import { env } from "cloudflare:workers";
import {
  markSyncResults,
  markSyncStarted,
  rebuildAnnualRanges,
  upsertPrices,
} from "../../../lib/database";
import type { PricePoint } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtimeSecret = (env as unknown as { SYNC_SECRET?: string })
    .SYNC_SECRET;
  const configuredSecret = (runtimeSecret ?? process.env.SYNC_SECRET ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return Response.json({ error: "未授权的同步请求" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      prices?: PricePoint[];
      startedSymbols?: string[];
      results?: Array<{
        symbol: string;
        ok: boolean;
        source?: string;
        error?: string;
      }>;
    };
    const prices = Array.isArray(payload.prices) ? payload.prices : [];
    const startedSymbols = Array.isArray(payload.startedSymbols)
      ? payload.startedSymbols
      : [];
    const results = Array.isArray(payload.results) ? payload.results : [];
    await markSyncStarted(startedSymbols);
    await upsertPrices(prices);
    const completedSymbols = results
      .filter((result) => result.ok)
      .map((result) => result.symbol);
    await rebuildAnnualRanges(completedSymbols);
    await markSyncResults(results);
    return Response.json({
      ok: true,
      priceRows: prices.length,
      completed: completedSymbols.length,
      failed: results.length - completedSymbols.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 400 },
    );
  }
}
