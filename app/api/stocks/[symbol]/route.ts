import { setStockActive } from "../../../../lib/database";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await context.params;
    const body = (await request.json()) as { active?: boolean };
    await setStockActive(symbol, Boolean(body.active));
    return Response.json({
      message: body.active ? "品种已恢复" : "品种已停用，可随时恢复",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 },
    );
  }
}
