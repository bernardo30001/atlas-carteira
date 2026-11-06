// Construtores dos testes de auditoria. Todos os valores são inventados.
import assert from "node:assert/strict";
import { ASSETS, EMPTY } from "../../app/lib/model.ts";

// Códigos fora da lista padrão, como um FII cadastrado, são em reais nestes testes.
const assetOf = (ticker) =>
  ASSETS.find((a) => a.ticker === ticker) ?? { currency: "BRL" };

/** Compara com tolerância e mostra "exibido" e "correto" na falha. */
export const near = (actual, expected, label = "valor", eps = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < eps,
    `${label}: exibido ${actual}, correto ${expected}`,
  );

export const lot = (ticker, quantity, price, extra = {}) => ({
  id: crypto.randomUUID(),
  ticker,
  kind: "opening",
  quantity,
  price,
  fx: assetOf(ticker).currency === "BRL" ? 1 : null,
  fees: 0,
  date: "2026-01-05",
  note: "",
  ...extra,
});

export const trade = (ticker, kind, quantity, price, date, extra = {}) => ({
  id: crypto.randomUUID(),
  ticker,
  kind,
  quantity,
  price,
  total: quantity * price,
  currency: assetOf(ticker).currency,
  fx: assetOf(ticker).currency === "BRL" ? 1 : null,
  fees: 0,
  date,
  ...extra,
});

export const income = (ticker, amount, date, extra = {}) => ({
  id: crypto.randomUUID(),
  ticker,
  amount,
  currency: assetOf(ticker).currency,
  date,
  kind: "payment",
  fx: assetOf(ticker).currency === "BRL" ? 1 : null,
  note: "",
  ...extra,
});

export const quote = (ticker, price, extra = {}) => ({
  ticker,
  price,
  previous: price,
  change: 0,
  currency: assetOf(ticker).currency,
  time: 1793000000,
  source: "fixture",
  delay: null,
  history: [],
  priceHistory: [],
  volatility: null,
  momentum: null,
  drawdown: null,
  ...extra,
});

export const market = (...quotes) => ({
  quotes: Object.fromEntries(quotes.map((q) => [q.ticker, q])),
  errors: [],
  fetchedAt: "2026-11-06T18:00:00.000Z",
});

export const portfolio = (extra = {}) => ({
  ...EMPTY,
  incomes: [],
  statements: [],
  tradeHistory: [],
  ...extra,
});

export const series = (...pairs) =>
  pairs.map(([date, close]) => ({ date, close }));

/** Só WEGE3 e ITUB4 recebem aportes em Brasil; útil para isolar o planejador. */
export const onlyBrazil = (...tickers) =>
  Object.fromEntries(
    ASSETS.filter((a) => a.group === "br").map((a) => [
      a.ticker,
      tickers.includes(a.ticker) ? 1 : 0,
    ]),
  );
