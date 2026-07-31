import {
  getSyncValue,
  listActivity,
  listAnnualRanges,
  listStocks,
} from "../../../lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [stocks, annualRanges, activity, lastSync] = await Promise.all([
      listStocks(),
      listAnnualRanges(),
      listActivity(),
      getSyncValue("last_complete_sync"),
    ]);
    return Response.json({
      stocks,
      annualRanges,
      activity,
      lastSync,
      marketStatus: "AKShare日终数据",
      currency: "CNY",
      timezone: "Asia/Shanghai",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取数据失败" },
      { status: 500 },
    );
  }
}
