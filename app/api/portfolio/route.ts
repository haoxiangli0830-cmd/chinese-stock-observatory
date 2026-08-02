import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createInvestmentLot,
  getPortfolioSnapshot,
  listStocks,
} from "../../../lib/database";
import { parseInvestmentLotInput } from "../../../lib/investment-validation";

export const dynamic = "force-dynamic";

async function portfolioResponse(userId: string) {
  const [portfolio, stocks] = await Promise.all([
    getPortfolioSnapshot(userId),
    listStocks(),
  ]);
  return {
    ...portfolio,
    stocks: stocks
      .filter((stock) => stock.active)
      .map((stock) => ({
        symbol: stock.symbol,
        nameZh: stock.nameZh,
        instrumentType: stock.instrumentType,
      })),
  };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "请先登录后查看投资记录" }, { status: 401 });
  }
  try {
    return Response.json(await portfolioResponse(user.id));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取投资记录失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "请先登录后添加投资记录" }, { status: 401 });
  }
  try {
    const input = parseInvestmentLotInput(await request.json());
    await createInvestmentLot(user.id, input);
    return Response.json(
      {
        ...(await portfolioResponse(user.id)),
        message: "投资记录已保存",
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "保存投资记录失败" },
      { status: 400 },
    );
  }
}
