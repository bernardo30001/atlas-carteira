import { loadPtax } from "../../lib/cdi-server";
import { loadHistories, parseExtraAssets } from "../../lib/market-server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ASSETS = 6;
/** Histórico em lotes pequenos. Sem `assets`, devolve o dólar oficial (PTAX). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    headers = { "Cache-Control": "private, max-age=1800" };
  if (!params.has("assets"))
    return Response.json(await loadPtax(), { headers });
  const from = params.get("from") ?? "",
    assets = parseExtraAssets(params.get("assets"));
  if (!DATE.test(from) || !assets.length || assets.length > MAX_ASSETS)
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  return Response.json(await loadHistories(assets, from), { headers });
}
