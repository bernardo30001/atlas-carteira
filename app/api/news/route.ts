import { newsSelection, parseNews, type NewsItem } from "../../lib/news";
const cache = new Map<
  string,
  { time: number; items: NewsItem[]; provider: string }
>();
export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker") ?? "all",
    selection = newsSelection(ticker);
  if (!selection)
    return Response.json(
      { error: "Filtro de notícias inválido" },
      { status: 400 },
    );
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.time < 300000)
    return Response.json({
      ...hit,
      filter: ticker,
      updatedAt: new Date(hit.time).toISOString(),
    });
  const query = selection.query;
  const urls = [
    {
      provider: "Google Notícias",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:30d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    },
    {
      provider: "Bing Notícias",
      url: `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=BR`,
    },
    {
      provider: "Yahoo Finance",
      url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(selection.symbols.join(","))}&region=US&lang=en-US`,
    },
  ];
  for (const { provider, url } of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const items = parseNews(await response.text(), ticker, provider);
      if (!items.length) throw new Error("Nenhuma notícia na resposta");
      const result = { time: Date.now(), items, provider };
      cache.set(ticker, result);
      return Response.json({
        ...result,
        filter: ticker,
        updatedAt: new Date(result.time).toISOString(),
      });
    } catch (e) {
      console.warn(
        "News provider unavailable",
        provider,
        e instanceof Error ? e.message : "Connection failure",
      );
    }
  }
  return Response.json(
    {
      items: hit?.items ?? [],
      provider: hit?.provider ?? "Notícias",
      filter: ticker,
      updatedAt: hit ? new Date(hit.time).toISOString() : null,
      stale: !!hit,
      error:
        "Não foi possível atualizar as notícias deste filtro. Tente novamente em instantes.",
    },
    { status: hit ? 200 : 503 },
  );
}
