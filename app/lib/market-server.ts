import { ASSETS, metrics, type Quote, type Market, type Point } from "./model";
const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** Dia da barra no fuso da bolsa. USD/BRL fecha em Londres: no horário de verão
 * britânico a barra começa às 23:00 UTC do dia anterior. */
function barDay(seconds: number, zone: string) {
  let format = dayFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormats.set(zone, format);
  }
  return format.format(new Date(seconds * 1000));
}
const DAY = 86400;
export type ExtraAsset = { ticker: string; symbol: string };
let memory: Market | undefined;
let pending: Promise<Market> | undefined;
export const SYMBOLS = [
  ...ASSETS.map((a) => ({ ticker: a.ticker, symbol: a.symbol })),
  { ticker: "USD", symbol: "BRL=X" },
  { ticker: "SP500", symbol: "^GSPC" },
  { ticker: "IBOV", symbol: "^BVSP" },
];
type Bars = { closes: Point[]; raw: Point[]; meta: any; zone: string };
async function bars(symbol: string, query: string): Promise<Bars> {
  let last: unknown;
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}&interval=1d`,
        {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
          signal: AbortSignal.timeout(9000),
        },
      );
      if (!r.ok) throw new Error(`Fonte: ${r.status}`);
      const data = (await r.json()) as any,
        result = data.chart?.result?.[0],
        meta = result?.meta;
      if (
        !Number.isFinite(meta?.regularMarketPrice) ||
        !(meta.regularMarketPrice > 0)
      )
        throw new Error("Sem cotação");
      const zone: string = meta.exchangeTimezoneName ?? "UTC",
        stamps: number[] = result.timestamp ?? [],
        rawCloses: number[] = result.indicators?.quote?.[0]?.close ?? [],
        closes: number[] =
          result.indicators?.adjclose?.[0]?.adjclose ?? rawCloses;
      const series = (values: number[]) =>
        stamps
          .map((t, i) => ({ date: barDay(t, zone), close: values[i] }))
          .filter((p) => Number.isFinite(p.close) && p.close > 0);
      return { closes: series(closes), raw: series(rawCloses), meta, zone };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
/** Só o preço atual: a tela consulta a cada minuto e o histórico vem à parte. */
async function quote(ticker: string, symbol: string): Promise<Quote> {
  const { raw, meta, zone } = await bars(symbol, "range=5d"),
    sessionDay = barDay(meta.regularMarketTime, zone),
    prior = raw.filter((p) => p.date < sessionDay).at(-1)?.close,
    stated = Number.isFinite(meta.regularMarketChangePercent)
      ? meta.regularMarketChangePercent
      : undefined,
    prev =
      stated !== undefined && stated > -100
        ? meta.regularMarketPrice / (1 + stated / 100)
        : (prior ?? meta.previousClose ?? 0);
  return {
    ticker,
    price: meta.regularMarketPrice,
    previous: prev,
    change: stated ?? (prev ? (meta.regularMarketPrice / prev - 1) * 100 : 0),
    currency: meta.currency,
    time: meta.regularMarketTime,
    source: "Yahoo Finance",
    delay: meta.exchangeDataDelayedBy ?? null,
    outdated:
      Date.now() / 1000 - meta.regularMarketTime >
      (ticker === "BTC" ? 2 : 5) * DAY,
    history: [],
    priceHistory: [],
    volatility: null,
    momentum: null,
    drawdown: null,
  };
}

export type AssetHistory = Pick<
  Quote,
  "history" | "priceHistory" | "volatility" | "momentum" | "drawdown"
>;
const histories = new Map<string, { data: AssetHistory; at: number }>();
const HISTORY_TTL = 1800000;
/** Histórico diário desde a data pedida. Muda só uma vez por dia. */
async function assetHistory(
  ticker: string,
  symbol: string,
  from: string,
): Promise<AssetHistory> {
  const key = `${symbol}|${from}`,
    cached = histories.get(key);
  if (cached && Date.now() - cached.at < HISTORY_TTL) return cached.data;
  const { closes, raw } = await bars(
    symbol,
    `period1=${Math.floor(Date.parse(from + "T00:00:00Z") / 1000)}&period2=${Math.floor(Date.now() / 1000)}`,
  );
  const yearAgo = new Date(Date.now() - 365 * DAY * 1000)
    .toISOString()
    .slice(0, 10);
  const data = {
    history: closes,
    priceHistory: raw,
    ...metrics(
      closes.filter((p) => p.date >= yearAgo),
      ticker === "BTC" ? 365 : 252,
    ),
  };
  histories.set(key, { data, at: Date.now() });
  return data;
}
/** Cada pedido traz poucos ativos, para caber no limite de CPU por requisição. */
export async function loadHistories(assets: ExtraAsset[], from: string) {
  const items: Record<string, AssetHistory> = {},
    errors: string[] = [];
  await Promise.all(
    assets.map(async (a) => {
      try {
        items[a.ticker] = await assetHistory(a.ticker, a.symbol, from);
      } catch {
        errors.push(a.ticker);
      }
    }),
  );
  return { items, errors };
}

async function refresh(): Promise<Market> {
  const quotes: Record<string, Quote> = {},
    errors: string[] = [];
  for (let i = 0; i < SYMBOLS.length; i += 4) {
    await Promise.all(
      SYMBOLS.slice(i, i + 4).map(async (a) => {
        try {
          quotes[a.ticker] = await quote(a.ticker, a.symbol);
        } catch {
          errors.push(a.ticker);
          if (memory?.quotes[a.ticker])
            quotes[a.ticker] = { ...memory.quotes[a.ticker], stale: true };
        }
      }),
    );
  }
  memory = { quotes, errors, fetchedAt: new Date().toISOString() };
  return memory;
}
async function loadBase() {
  if (memory && Date.now() - Date.parse(memory.fetchedAt) < 55000)
    return memory;
  if (!pending)
    pending = refresh().finally(() => {
      pending = undefined;
    });
  return await pending;
}

const extras = new Map<string, { quote: Quote; at: number }>();
/** Cotações dos ativos cadastrados, com o mesmo intervalo de atualização da lista padrão. */
async function loadExtras(assets: ExtraAsset[], errors: string[]) {
  const quotes: Record<string, Quote> = {};
  for (let i = 0; i < assets.length; i += 4) {
    await Promise.all(
      assets.slice(i, i + 4).map(async (a) => {
        const key = a.ticker + "|" + a.symbol,
          cached = extras.get(key);
        if (cached && Date.now() - cached.at < 55000) {
          quotes[a.ticker] = cached.quote;
          return;
        }
        try {
          const fresh = await quote(a.ticker, a.symbol);
          extras.set(key, { quote: fresh, at: Date.now() });
          quotes[a.ticker] = fresh;
        } catch {
          errors.push(a.ticker);
          if (cached) quotes[a.ticker] = { ...cached.quote, stale: true };
        }
      }),
    );
  }
  return quotes;
}

export async function loadMarket(assets: ExtraAsset[] = []) {
  const base = await loadBase();
  if (!assets.length) return base;
  const errors = [...base.errors],
    added = await loadExtras(assets, errors);
  return { ...base, quotes: { ...base.quotes, ...added }, errors };
}

const EXTRA_PATTERN = /^([A-Z0-9]{2,12}):([A-Z0-9.^=-]{1,20})$/;
/** Lê a lista enviada pelo navegador. O host da consulta é fixo e o limite evita abuso. */
export function parseExtraAssets(raw: string | null): ExtraAsset[] {
  return (raw ?? "")
    .split(",")
    .flatMap((item) => {
      const match = EXTRA_PATTERN.exec(item.trim());
      return match ? [{ ticker: match[1], symbol: match[2] }] : [];
    })
    .slice(0, 40);
}
