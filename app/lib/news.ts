import { ASSETS, type Asset } from "./model.ts";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  date: string;
  ticker: string;
};
export const NEWS_CATEGORIES = [
  { key: "all", name: "Todos os ativos" },
  { key: "brazil", name: "Bolsa brasileira" },
  { key: "stocks", name: "Ações na B3" },
  { key: "us", name: "ETFs no exterior" },
  { key: "bitcoin", name: "Bitcoin" },
] as const;
const quoted = (text: string) => '"' + text + '"';
/** Ativo cadastrado por você, informado pelo navegador para a busca de notícias. */
export type NewsAsset = Pick<Asset, "ticker" | "name" | "symbol" | "currency">;
const NEWS_TICKER = /^[A-Z0-9]{2,12}$/,
  NEWS_SYMBOL = /^[A-Z0-9.^=-]{1,20}$/;
/** Confere os dados vindos do navegador. O nome vira só texto de busca, sem aspas. */
export function customNewsAsset(
  ticker: string,
  params: URLSearchParams,
): NewsAsset | undefined {
  const symbol = params.get("symbol") ?? "",
    name = (params.get("name") ?? "")
      .replace(/["\\<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
  if (!NEWS_TICKER.test(ticker) || !NEWS_SYMBOL.test(symbol) || !name) return;
  return {
    ticker,
    symbol,
    name,
    currency: params.get("currency") === "USD" ? "USD" : "BRL",
  };
}
export function newsSelection(
  key: string,
  custom?: NewsAsset,
): { query: string; symbols: string[]; label: string } | undefined {
  const asset =
    ASSETS.find((a) => a.ticker === key) ??
    (custom?.ticker === key ? custom : undefined);
  if (asset) {
    // Company names and tickers are alternatives: requiring every term hid valid stories.
    const query =
      asset.ticker === "BTC"
        ? "Bitcoin OR BTC"
        : asset.currency === "USD"
          ? `${quoted(asset.ticker + " ETF")} OR ${quoted(asset.name)}`
          : `${quoted(asset.ticker)} OR ${quoted(asset.name)}`;
    return { query, symbols: [asset.symbol], label: asset.ticker };
  }
  const category = NEWS_CATEGORIES.find((c) => c.key === key);
  if (!category) return;
  if (key === "brazil")
    return {
      query:
        'Ibovespa OR "bolsa brasileira" OR "ações brasileiras" OR "B3 bolsa"',
      symbols: [
        "^BVSP",
        ...ASSETS.filter((a) => a.group === "br").map((a) => a.symbol),
      ],
      label: category.name,
    };
  if (key === "bitcoin")
    return {
      query: "Bitcoin OR BTC",
      symbols: ["BTC-USD"],
      label: category.name,
    };
  const assets = ASSETS.filter(
    (a) =>
      key === "all" ||
      (key === "stocks"
        ? a.group === "br"
        : a.currency === "USD" && a.ticker !== "BTC"),
  );
  return {
    query: assets
      .map((a) =>
        quoted(
          a.ticker === "BTC"
            ? "Bitcoin"
            : a.currency === "USD"
              ? a.name
              : a.ticker,
        ),
      )
      .join(" OR "),
    symbols: assets.map((a) => a.symbol),
    label: category.name,
  };
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const field = (xml: string, tag: string) =>
  decode(
    xml.match(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
    )?.[1] ?? "",
  ).trim();
const mentions = (title: string, asset: Asset) =>
  new RegExp(`\\b${asset.ticker}\\b`, "i").test(title) ||
  title
    .toLocaleLowerCase("pt-BR")
    .includes(asset.name.toLocaleLowerCase("pt-BR"));
export function parseNews(
  xml: string,
  filter: string,
  provider: string,
  custom?: NewsAsset,
): NewsItem[] {
  const selection = newsSelection(filter, custom);
  if (!selection) return [];
  const seen = new Set<string>();
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((m) => {
      const x = m[1],
        link = field(x, "link"),
        source = field(x, "source") || field(x, "News:Source") || provider,
        title = field(x, "title");
      return {
        title:
          source && title.endsWith(" - " + source)
            ? title.slice(0, -source.length - 3)
            : title,
        link: link.startsWith("https://") ? link : "",
        source,
        date: field(x, "pubDate"),
        ticker:
          ASSETS.some((a) => a.ticker === filter) || custom?.ticker === filter
            ? filter
            : (ASSETS.find((a) => mentions(title, a))?.ticker ??
              selection.label),
      };
    })
    .filter((x) => {
      if (!x.link || !x.title || seen.has(x.link)) return false;
      seen.add(x.link);
      return true;
    })
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
    .slice(0, 24);
}
