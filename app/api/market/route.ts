import { loadMarket } from "../../lib/market-server";
export async function GET() {
  return Response.json(await loadMarket(), {
    headers: { "Cache-Control": "private, max-age=10" },
  });
}
