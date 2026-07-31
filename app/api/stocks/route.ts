import { listStocks, saveStock } from "../../../lib/database";
import { validateAStock } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ stocks: await listStocks() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { symbol?: string };
    const symbol = String(body.symbol ?? "").trim();
    const stock = await validateAStock(symbol);
    if (!stock) {
      return Response.json(
        { error: "无法验证该A股代码，请检查后重试" },
        { status: 400 },
      );
    }
    await saveStock(stock);
    return Response.json({
      stock,
      message: "股票已加入，完整历史数据将在30分钟内自动同步",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "添加失败" },
      { status: 500 },
    );
  }
}
