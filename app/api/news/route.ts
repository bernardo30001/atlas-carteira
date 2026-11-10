import {
  customNewsAsset,
  newsSelection,
  parseNews,
  type NewsItem,
} from "../../lib/news";
const cache = new Map<
  string,
  { time: number; items: NewsItem[]; provider: string }
>();
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    ticker = params.get("ticker") ?? "all",
    // Ativo fora da lista padrão: o navegador informa nome e símbolo.
    custom = newsSelection(ticker)
      ? undefined
      : customNewsAsset(ticker, params),
    selection = newsSelection(ticker, custom);
  if (!selection)
    return Response.json(
      { error: "Filtro de notícias inválido" },
      { status: 400 },
    );
  const cacheKey = custom
      ? `${ticker}|${custom.symbol}|${custom.name}`
      : ticker,
    hit = cache.get(cacheKey);
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
  // As três fontes são consultadas ao mesmo tempo e vale a primeira, na ordem de
  // preferência, que trouxer notícias. Em fila, uma fonte lenta atrasava tudo em 10 s.
  const attempts = urls.map(({ provider, url }) =>
    fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(6000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return { provider, xml: await response.text() };
      })
      .catch((e: unknown) => {
        console.warn(
          "News provider unavailable",
          provider,
          e instanceof Error ? e.message : "Connection failure",
        );
        return null;
      }),
  );
  for (const attempt of attempts) {
    const answer = await attempt;
    if (!answer) continue;
    const items = parseNews(answer.xml, ticker, answer.provider, custom);
    if (!items.length) continue;
    const result = { time: Date.now(), items, provider: answer.provider };
    cache.set(cacheKey, result);
    return Response.json({
      ...result,
      filter: ticker,
      updatedAt: new Date(result.time).toISOString(),
    });
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
