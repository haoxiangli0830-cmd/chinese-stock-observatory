import { searchInstruments } from "../../../lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (!query.trim()) return Response.json({ results: [] });
  try {
    const results = await searchInstruments(query);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "搜索失败" },
      { status: 502 },
    );
  }
}
