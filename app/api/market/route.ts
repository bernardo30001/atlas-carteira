import { loadMarket, parseExtraAssets } from "../../lib/market-server";
export async function GET(request: Request) {
  const assets = parseExtraAssets(
    new URL(request.url).searchParams.get("assets"),
  );
  return Response.json(await loadMarket(assets), {
    headers: { "Cache-Control": "private, max-age=10" },
  });
}
