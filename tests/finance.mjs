import assert from "node:assert/strict";
import {
  EMPTY,
  ASSETS,
  totals,
  allocationPlan,
  assetPlan,
  metrics,
} from "../app/lib/model.ts";
const market = { quotes: {}, errors: [], fetchedAt: new Date().toISOString() };
for (const a of ASSETS)
  market.quotes[a.ticker] = {
    ticker: a.ticker,
    price: 100,
    previous: 99,
    change: 1,
    currency: a.currency,
    time: Date.now() / 1000,
    history: [],
    volatility: 20,
    momentum: 10,
    drawdown: -12,
    source: "test",
    delay: 0,
  };
market.quotes.USD = { ...market.quotes.SPHQ, price: 5 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
let plan = allocationPlan(EMPTY, market, 10000);
near(
  plan.reduce((s, x) => s + x.amount, 0),
  10000,
);
assert.deepEqual(
  plan.map((x) => Math.round(x.amount * 100) / 100),
  [3500, 3500, 2200, 800],
);
const tx = (ticker, quantity, price, fx, fees = 0) => ({
  id: crypto.randomUUID(),
  ticker,
  quantity,
  price,
  fx,
  fees,
  kind: "buy",
  date: "2026-10-01",
  note: "",
});
let p = {
  ...EMPTY,
  transactions: [tx("WEGE3", 10, 80, 1, 10), tx("SPHQ", 2, 90, 4, 2)],
};
let total = totals(p, market);
near(total.value, 2000);
near(total.cost, 1532);
near(total.result, 468);
plan = allocationPlan(p, market, 1000);
near(
  plan.reduce((s, x) => s + x.amount, 0),
  1000,
);
assert.equal(plan.find((x) => x.group === "etf").amount, 0);
assert.ok(plan.find((x) => x.group === "rf").amount > 0);
const missing = { ...market, quotes: { ...market.quotes, USD: undefined } };
assert.equal(totals(p, missing).missing.length, 1);
assert.equal(allocationPlan(p, missing, 1000).length, 0);
const stale = {
  ...market,
  quotes: { ...market.quotes, WEGE3: { ...market.quotes.WEGE3, stale: true } },
};
assert.equal(allocationPlan(p, stale, 1000).length, 0);
const estimates = assetPlan(EMPTY, market, 10000);
// A sobra pode passar de um ativo a outro, mas a classe nunca gasta mais que o seu valor.
for (const group of new Set(estimates.map((x) => x.group))) {
  const items = estimates.filter((x) => x.group === group);
  assert.ok(
    items.reduce((s, x) => s + x.executable, 0) <=
      items.reduce((s, x) => s + x.amount, 0) + 1e-8,
  );
}
assert.ok(
  estimates
    .filter((x) => x.group === "br")
    .every((x) => Number.isInteger(x.quantity)),
);
const excluded = assetPlan({ ...EMPTY, weights: { WEGE3: 0 } }, market, 10000);
assert.ok(!excluded.some((x) => x.ticker === "WEGE3"));
assert.equal(allocationPlan(EMPTY, market, 0).length, 0);
const hist = Array.from({ length: 150 }, (_, i) => ({
  date: "2026-01-01",
  close: 100,
}));
near(metrics(hist).volatility, 0);
near(metrics(hist).drawdown, 0);
near(metrics(hist).momentum, 0);
assert.equal(metrics(hist.slice(0, 10)).volatility, null);
const crash = [
  ...hist.slice(0, 100),
  ...hist.slice(100).map((x) => ({ ...x, close: 75 })),
];
near(metrics(crash).drawdown, -25);
console.log(
  "Financial verification passed: allocation, cost, FX, stale-data blocking, rounding, weights, volatility and drawdown.",
);
