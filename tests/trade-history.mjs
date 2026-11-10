import assert from "node:assert/strict";
import { EMPTY } from "../app/lib/model.ts";
import {
  replayTrades,
  datedTrades,
  purchasesForPoints,
} from "../app/lib/trade-history.ts";
import { costPerformance } from "../app/lib/cost-performance.ts";
import { performancePortfolio } from "../app/lib/performance.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const event = (kind, quantity, price, date, extra = {}) => ({
  id: crypto.randomUUID(),
  ticker: "WEGE3",
  kind,
  quantity,
  price,
  total: quantity * price,
  currency: "BRL",
  fx: 1,
  fees: 0,
  date,
  ...extra,
});
const buy = event("buy", 10, 10, "2026-10-26"),
  sell = event("sell", 4, 20, "2026-10-27"),
  more = event("buy", 4, 12, "2026-10-28");
const events = [buy, sell, more];
let balance = replayTrades(events);
near(balance.quantity, 10);
near(balance.costNative, 108);
near(replayTrades(events, "2026-10-27").costNative, 60);
const oldBuy = event("buy", 5, 2, "2024-01-01"),
  oldSale = event("sell", 5, 4, "2024-02-01");
assert.throws(() => replayTrades([buy, event("sell", 11, 20, "2026-10-27")]));
const portfolio = {
  ...EMPTY,
  transactions: [
    {
      id: crypto.randomUUID(),
      ticker: "WEGE3",
      kind: "opening",
      quantity: 10,
      price: 10.8,
      costNative: 108,
      currency: "BRL",
      fx: 1,
      fees: 0,
      date: "2026-10-28",
      note: "Reconciled position",
    },
  ],
  tradeHistory: events,
  incomes: [],
};
const history = [
  { date: "2026-10-26", close: 12 },
  { date: "2026-10-27", close: 13 },
  { date: "2026-10-28", close: 14 },
];
const market = {
  quotes: {
    WEGE3: {
      ticker: "WEGE3",
      price: 14,
      previous: 13,
      change: 0,
      currency: "BRL",
      time: 1,
      source: "fixture",
      delay: 0,
      history,
      priceHistory: history,
      volatility: null,
      momentum: null,
      drawdown: null,
    },
  },
  errors: [],
  fetchedAt: "2026-10-28T18:00:00Z",
};
const r = costPerformance(
  portfolio,
  market,
  "br",
  365,
  Date.parse("2026-10-28T18:00:00Z"),
);
near(r.cost, 108);
near(r.returnPercent, (32 / 108) * 100);
near(r.points[0].portfolio, 20);
near(r.points[1].portfolio, 30);
near(r.points.at(-1).portfolio, r.returnPercent);
assert.equal(r.datedPositionCount, 1);
assert.ok(!r.warnings.some((w) => w.includes("Não presumimos")));
assert.equal(portfolioSchema.safeParse(portfolio).success, true);
assert.equal(portfolioSchema.parse(portfolio).tradeHistory.length, 3);
assert.equal(
  portfolioSchema.safeParse({ ...portfolio, tradeHistory: [...events, buy] })
    .success,
  false,
);
const closed = { ...oldBuy, ticker: "VALE3" },
  closedSale = { ...oldSale, ticker: "VALE3" };
const owned = datedTrades({
  ...portfolio,
  tradeHistory: [...events, closed, closedSale],
});
assert.ok(owned.every((e) => e.ticker === "WEGE3"));
const marked = purchasesForPoints(portfolio, r.points);
assert.equal(marked.flatMap((p) => p.purchases).length, 2);
assert.equal(marked[1].purchases.length, 0);
assert.equal(marked[0].purchases[0].price, 10);
const sameDay = purchasesForPoints(portfolio, [
  { date: "2026-10-26", time: 1 },
  { date: "2026-10-26", time: 2 },
]);
assert.equal(sameDay[0].purchases.length, 0);
assert.equal(sameDay[1].purchases.length, 1);
assert.deepEqual(
  purchasesForPoints(performancePortfolio(portfolio, "us"), r.points).flatMap(
    (p) => p.purchases,
  ),
  [],
);
const nextManual = {
  id: crypto.randomUUID(),
  ticker: "WEGE3",
  kind: "buy",
  quantity: 1,
  price: 14,
  fees: 0,
  fx: 1,
  currency: "BRL",
  date: "2026-10-28",
  note: "",
};
assert.equal(
  datedTrades({
    ...portfolio,
    transactions: [...portfolio.transactions, nextManual],
  }).length,
  4,
);
const alreadyInHistory = {
  ...buy,
  kind: "buy",
  note: "",
  costNative: buy.total,
};
assert.equal(
  datedTrades({
    ...portfolio,
    transactions: [...portfolio.transactions, alreadyInHistory],
  }).length,
  3,
);
const exact = event("buy", 2, 9.99, "2026-10-26", { total: 20 });
near(replayTrades([exact]).costNative, 20);
console.log(
  "Trade history passed: moving average on partial sales, excluded closed cycles, historical quantity and cost, purchase markers by group/date, no invented opening markers, same-day grouping, later manual buys, exact operation totals and validation round-trip.",
);
// A posição inicial vale na sua data de referência: o que veio antes já está contido
// nela, e só o que vem depois soma. Com a referência depois das compras, a posição
// consolidada é preservada e a curva termina no acumulado.
const REFERENCE = "2026-10-29";
const partial = {
  ...portfolio,
  transactions: [
    {
      ...portfolio.transactions[0],
      quantity: 20,
      costNative: 208,
      price: 10.4,
      date: REFERENCE,
    },
  ],
};
const partialResult = costPerformance(
  partial,
  market,
  "br",
  365,
  Date.parse("2026-10-29T18:00:00Z"),
);
near(partialResult.value, 280);
near(partialResult.cost, 208);
near(partialResult.points.at(-1).value, 280);
near(partialResult.points.at(-1).portfolio, partialResult.returnPercent);
assert.equal(partialResult.partialHistoryCount, 0);
assert.equal(
  purchasesForPoints(partial, partialResult.points).flatMap((p) => p.purchases)
    .length,
  0,
);
// Com a referência antes das compras, parte da posição segue sem datas: histórico parcial.
const openThenBought = costPerformance(
  {
    ...portfolio,
    transactions: [
      {
        ...portfolio.transactions[0],
        quantity: 20,
        costNative: 208,
        price: 10.4,
        date: "2026-10-01",
      },
    ],
  },
  market,
  "br",
  365,
  Date.parse("2026-10-28T18:00:00Z"),
);
assert.equal(openThenBought.partialHistoryCount, 1);
const feesOutsideHistory = {
  ...portfolio,
  transactions: [
    {
      ...portfolio.transactions[0],
      costNative: 110,
      price: 11,
      date: REFERENCE,
    },
  ],
};
const withCostAdjustment = costPerformance(
  feesOutsideHistory,
  market,
  "br",
  365,
  Date.parse("2026-10-29T18:00:00Z"),
);
near(
  withCostAdjustment.points.at(-1).portfolio,
  withCostAdjustment.returnPercent,
);
assert.equal(withCostAdjustment.partialHistoryCount, 0);
const excessHistory = {
  ...portfolio,
  transactions: [
    {
      ...portfolio.transactions[0],
      quantity: 5,
      costNative: 54,
      price: 10.8,
      date: REFERENCE,
    },
  ],
};
const conservative = costPerformance(
  excessHistory,
  market,
  "br",
  365,
  Date.parse("2026-10-29T18:00:00Z"),
);
near(conservative.points.at(-1).value, 70);
near(conservative.points.at(-1).portfolio, conservative.returnPercent);
assert.equal(conservative.partialHistoryCount, 0);
console.log(
  "Partial-history regression passed: consolidated quantities/costs preserved, final chart equals accumulated result, only documented buys receive markers, and excess history falls back to the consolidated basis.",
);
