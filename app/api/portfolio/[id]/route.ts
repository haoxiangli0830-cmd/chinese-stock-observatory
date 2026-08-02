import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  deleteInvestmentLot,
  getPortfolioSnapshot,
  updateInvestmentLot,
} from "../../../../lib/database";
import { parseInvestmentLotInput } from "../../../../lib/investment-validation";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("投资记录编号无效");
  return id;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "请先登录后修改投资记录" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const input = parseInvestmentLotInput(await request.json());
    await updateInvestmentLot(user.id, parseId(id), input);
    return Response.json({
      ...(await getPortfolioSnapshot(user.id)),
      message: "投资记录已更新",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "更新投资记录失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "请先登录后删除投资记录" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    await deleteInvestmentLot(user.id, parseId(id));
    return Response.json({
      ...(await getPortfolioSnapshot(user.id)),
      message: "投资记录已删除",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "删除投资记录失败" },
      { status: 400 },
    );
  }
}
