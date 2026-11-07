import {
  ASSETS,
  type Market,
  type Point,
  type Portfolio,
  type Quote,
} from "./model.ts";
import { ledgerFor, replayLedger } from "./trade-history.ts";

export type AssetHistory = Pick<
  Quote,
  "history" | "priceHistory" | "volatility" | "momentum" | "drawdown"
>;
export type HistorySymbol = { ticker: string; symbol: string };
const BENCHMARKS: HistorySymbol[] = [
  { ticker: "USD", symbol: "BRL=X" },
  { ticker: "SP500", symbol: "^GSPC" },
  { ticker: "IBOV", symbol: "^BVSP" },
];
/** Cada pedido cabe no limite de CPU por requisição do plano grátis. */
export const HISTORY_BATCH = 4;
export function historySymbols(p: Portfolio): HistorySymbol[] {
  return [
    ...BENCHMARKS,
    ...ASSETS.map(({ ticker, symbol }) => ({ ticker, symbol })),
    ...(p.customAssets ?? [])
      .filter((a) => !a.archived)
      .map(({ ticker, symbol }) => ({ ticker, symbol })),
  ];
}
export function historyBatches<T>(items: T[], size = HISTORY_BATCH) {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    batches.push(items.slice(i, i + size));
  return batches;
}
/** Primeira data que a curva precisa: início da posição mais antiga ainda aberta, com
 * pelo menos um ano para as medidas de risco. Ciclos encerrados antes dela não contam. */
export function historyStart(p: Portfolio, today: string) {
  const yearAgo = new Date(Date.parse(today + "T12:00:00Z") - 366 * 86400000)
    .toISOString()
    .slice(0, 10);
  let start = yearAgo;
  const tickers = new Set(
    [...p.transactions, ...(p.tradeHistory ?? [])].map((r) => r.ticker),
  );
  for (const ticker of tickers) {
    const ledger = ledgerFor(p, ticker),
      state = replayLedger(ledger),
      first =
        state.quantity > 0
          ? [
              ...ledger.baseline.map((l) => l.date),
              ...state.cycle.map((e) => e.date),
            ].sort()[0]
          : undefined;
    if (first && first < start) start = first;
  }
  for (const r of p.fixedIncome) if (r.date < start) start = r.date;
  return start;
}
/** Junta as cotações do minuto com o histórico diário. O histórico do dólar usa a PTAX,
 * porque o do Yahoo chega um dia atrasado em relação à B3. */
export function mergeMarket(
  base: Market,
  histories: Record<string, AssetHistory>,
  ptax: Point[],
): Market {
  const quotes: Market["quotes"] = {};
  for (const [ticker, quote] of Object.entries(base.quotes)) {
    const history = histories[ticker];
    quotes[ticker] = history ? { ...quote, ...history } : quote;
  }
  if (quotes.USD && ptax.length)
    quotes.USD = { ...quotes.USD, history: ptax, priceHistory: ptax };
  return { ...base, quotes };
}
