import {
  ASSETS,
  EMPTY,
  today,
  type Market,
  type Portfolio,
} from "../lib/model";
import { PORTFOLIO_SCHEMA } from "../lib/trade-history";

/** Carteira fictícia com compras datadas, pelos preços reais de cada dia quando já
 * carregados, para que a demonstração mostre a curva e os pontos de compra. */
export function demoPortfolio(market: Market): Portfolio {
  const dayOffset = (days: number) =>
      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
    start = dayOffset(300),
    priceOn = (ticker: string, date: string, fallback: number) =>
      (market.quotes[ticker]?.priceHistory ?? []).findLast(
        (point) => point.date <= date,
      )?.close ?? fallback;
  const positions: [string, number, number][] = [
    ["WEGE3", 80, 34],
    ["ITUB4", 150, 29],
    ["VALE3", 70, 50],
    ["ALUP11", 80, 25],
    ["AUPO11", 60, 105],
    ["SPHQ", 10, 55],
    ["VEA", 15, 46],
    ["VNQ", 10, 80],
    ["IAU", 8, 43],
    ["VWO", 10, 42],
    ["BTC", 0.018, 80000],
    ["ABTC11", 12, 120],
  ];
  const monthly: [string, number, number][] = [
    ["WEGE3", 6, 34],
    ["SPHQ", 1.5, 55],
    ["AUPO11", 8, 105],
    ["BTC", 0.0008, 80000],
  ];
  const currencyOf = (ticker: string) =>
    ASSETS.find((a) => a.ticker === ticker)?.currency ?? "BRL";
  return {
    ...EMPTY,
    schemaVersion: PORTFOLIO_SCHEMA,
    transactions: positions.map(([ticker, quantity, fallback]) => ({
      id: crypto.randomUUID(),
      ticker,
      kind: "opening",
      quantity,
      price: priceOn(ticker, start, fallback),
      fx: currencyOf(ticker) === "USD" ? null : 1,
      fees: 0,
      date: start,
      note: "Demonstração — posição fictícia",
    })),
    tradeHistory: [270, 225, 180, 135, 90, 45].flatMap((days) =>
      monthly.map(([ticker, quantity, fallback]) => {
        const date = dayOffset(days),
          price = priceOn(ticker, date, fallback);
        return {
          id: crypto.randomUUID(),
          ticker,
          kind: "buy" as const,
          quantity,
          price,
          total: quantity * price,
          currency: currencyOf(ticker),
          fx: currencyOf(ticker) === "USD" ? null : 1,
          fees: 0,
          date,
          source: "Demonstração",
        };
      }),
    ),
    fixedIncome: [
      {
        id: crypto.randomUUID(),
        name: "CDB · exemplo fictício",
        cost: 18000,
        value: 19150,
        date: start,
        updatedAt: today(),
      },
    ],
  };
}
