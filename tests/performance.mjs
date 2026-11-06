import assert from "node:assert/strict";
import { EMPTY, totals } from "../app/lib/model.ts";
import {
  capturePerformance,
  simulateComposition,
  recordedChart,
  cdiFactor,
  performancePortfolio,
} from "../app/lib/performance.ts";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const quote = (ticker, price, currency = "BRL", history = []) => ({
  ticker,
  price,
  currency,
  history,
  previous: price,
  change: 0,
  time: 1,
  source: "fixture",
  delay: 0,
  volatility: null,
  momentum: null,
  drawdown: null,
});
const market = (price = 10, fx = 5) => ({
  quotes: {
    WEGE3: quote("WEGE3", price),
    USD: quote("USD", fx),
    SP500: quote("SP500", 100, "USD"),
    IBOV: quote("IBOV", 1000),
    BTC: quote("BTC", 100, "USD"),
  },
  errors: [],
  fetchedAt: "2026-10-27T15:00:00Z",
});
const tx = (ticker, quantity, price, currency = "BRL") => ({
  id: ticker,
  ticker,
  quantity,
  price,
  currency,
  fx: currency === "USD" ? null : 1,
  fees: 0,
  date: "2026-10-27",
  kind: "opening",
  note: "",
});
const p = { ...EMPTY, transactions: [tx("WEGE3", 10, 8)], incomes: [] };
let c = capturePerformance(p, market(), undefined, 1, "2026-10-27T15:00:00Z");
close(c.point.index, 100);
close(c.point.value, 100);
const more = {
  ...p,
  transactions: [
    ...p.transactions,
    { ...tx("WEGE3", 10, 10), id: "new", kind: "buy" },
  ],
};
let next = capturePerformance(
  more,
  market(),
  c.state,
  2,
  "2026-10-27T15:01:00Z",
);
close(next.point.index, 100);
close(next.point.flow, 100);
close(next.point.value, 200);
next = capturePerformance(
  more,
  market(11),
  next.state,
  2,
  "2026-10-28T15:00:00Z",
);
close(next.point.index, 110);
const dividend = {
  ...more,
  incomes: [
    {
      id: "pay",
      ticker: "WEGE3",
      amount: 4,
      currency: "BRL",
      date: "2026-10-28",
      kind: "payment",
      note: "",
    },
    {
      id: "opening",
      ticker: "WEGE3",
      amount: 900,
      currency: "BRL",
      date: "2026-10-27",
      kind: "opening",
      note: "",
    },
  ],
};
let paid = capturePerformance(
  dividend,
  market(11),
  next.state,
  3,
  "2026-10-28T15:01:00Z",
);
close(paid.point.index, 112);
close(paid.point.flow, 100);
let repeat = capturePerformance(
  dividend,
  market(11),
  paid.state,
  3,
  "2026-10-28T15:02:00Z",
);
close(repeat.point.index, 112);
const corrected = capturePerformance(
  p,
  market(11),
  repeat.state,
  4,
  "2026-10-28T15:03:00Z",
);
close(corrected.point.index, 112);
close(corrected.point.flow, -10);
const foreign = { ...EMPTY, transactions: [tx("VOO", 1, 90, "USD")] };
const fm = {
  ...market(),
  quotes: { ...market().quotes, VOO: quote("VOO", 100, "USD") },
};
const fc = capturePerformance(
  foreign,
  fm,
  undefined,
  1,
  "2026-10-27T15:00:00Z",
);
const fxChanged = { ...fm, quotes: { ...fm.quotes, USD: quote("USD", 6) } };
close(
  capturePerformance(foreign, fxChanged, fc.state, 1, "2026-10-28T15:00:00Z")
    .point.index,
  120,
);
const fixed = {
  ...EMPTY,
  fixedIncome: [
    {
      id: "cdb",
      name: "CDB",
      value: 1000,
      cost: null,
      date: "2026-10-27",
      updatedAt: "2026-10-27",
    },
  ],
};
const f0 = capturePerformance(
  fixed,
  market(),
  undefined,
  1,
  "2026-10-27T15:00:00Z",
);
const f1 = capturePerformance(
  { ...fixed, fixedIncome: [{ ...fixed.fixedIncome[0], value: 1100 }] },
  market(),
  f0.state,
  2,
  "2026-10-28T15:00:00Z",
);
close(f1.point.index, 100);
close(f1.point.flow, 100);
assert.ok(f1.warnings.length);
const known = {
  ...fixed,
  fixedIncome: [{ ...fixed.fixedIncome[0], cost: 1000 }],
};
const k0 = capturePerformance(
  known,
  market(),
  undefined,
  1,
  "2026-10-27T15:00:00Z",
);
close(
  capturePerformance(
    {
      ...known,
      fixedIncome: [{ ...known.fixedIncome[0], value: 1110, cost: 1100 }],
    },
    market(),
    k0.state,
    2,
    "2026-10-28T15:00:00Z",
  ).point.index,
  101,
);
assert.throws(() =>
  capturePerformance(
    p,
    { ...market(), quotes: {} },
    c.state,
    1,
    "2026-10-28T15:00:00Z",
  ),
);
const rates = [
  { date: "2026-10-26", rate: 0.05 },
  { date: "2026-10-27", rate: 0.05 },
  { date: "2026-10-28", rate: 0.05 },
];
close(cdiFactor(rates, "2026-10-26", "2026-10-28", 120), 1.0006 ** 2);
const h = (prices) =>
  prices.map((close, i) => ({ date: `2026-10-${26 + i}`, close }));
const hm = {
  quotes: {
    ...market().quotes,
    WEGE3: quote("WEGE3", 11, "BRL", h([10, 11, 11])),
    USD: quote("USD", 6, "BRL", h([5, 5, 6])),
    VOO: quote("VOO", 100, "USD", h([100, 100, 100])),
    SP500: quote("SP500", 100, "USD", h([100, 100, 100])),
    IBOV: quote("IBOV", 1100, "BRL", h([1000, 1100, 1100])),
    BTC: quote("BTC", 120, "USD", h([100, 110, 120])),
  },
  errors: [],
  fetchedAt: "2026-10-28T17:00:00Z",
};
const sim = simulateComposition(
  foreign,
  hm,
  rates,
  30,
  ["sp500", "ibov", "cdi", "bitcoin"],
  Date.parse("2026-10-28T18:00:00Z"),
);
assert.equal(sim.points.length, 3);
close(sim.points[0].portfolio, 0);
close(sim.points.at(-1).portfolio, 20);
close(sim.points.at(-1).sp500, 20);
close(sim.points.at(-1).bitcoin, 44);
const newer = {
  ...hm,
  quotes: {
    ...hm.quotes,
    VOO: { ...hm.quotes.VOO, history: h([100, 100, 100]).slice(1) },
  },
};
const short = simulateComposition(
  foreign,
  newer,
  rates,
  365,
  ["sp500"],
  Date.parse("2026-10-28T18:00:00Z"),
);
assert.equal(short.start, "2026-10-27");
assert.ok(short.warnings.some((w) => w.includes("respeitar")));
const withFixed = {
  ...p,
  fixedIncome: [
    { ...fixed.fixedIncome[0], value: 110, ratePercent: 120, index: "CDI" },
  ],
};
const fs = simulateComposition(
  withFixed,
  hm,
  rates,
  30,
  ["cdi"],
  Date.parse("2026-10-28T18:00:00Z"),
);
close(fs.coverage, 100);
close(fs.points.at(-1).portfolio, ((1.1 + 1.0006 ** 2) / 2 - 1) * 100);
const unsupported = {
  ...withFixed,
  fixedIncome: [{ ...withFixed.fixedIncome[0], index: undefined }],
};
const partial = simulateComposition(
  unsupported,
  hm,
  rates,
  30,
  [],
  Date.parse("2026-10-28T18:00:00Z"),
);
close(partial.coverage, 50);
assert.ok(partial.excluded.includes("CDB"));
const hist = {
  points: [c.point, next.point],
  startedAt: c.point.time,
  updatedAt: next.point.time,
  warnings: [],
};
const plotted = recordedChart(hist, 30, [], Date.parse("2026-10-28T18:00:00Z"));
close(plotted[0].portfolio, 0);
close(plotted.at(-1).portfolio, 10);
const br = {
  ...EMPTY,
  transactions: [tx("WEGE3", 10, 10), tx("ABTC11", 2, 10), tx("AUPO11", 3, 10)],
};
const bm = {
  ...market(),
  quotes: {
    ...market().quotes,
    ABTC11: quote("ABTC11", 10),
    AUPO11: quote("AUPO11", 10),
  },
};
const bt = totals(br, bm);
close(bt.brazilStocks.value, 100);
close(bt.brazilEtfs.value, 50);
close(bt.brazil.value, 150);
close(bt.byGroup.crypto, 20);
close(bt.byGroup.rf, 30);
console.log(
  "Performance: contributions neutral, linked price/FX returns, income once, manual fixed income, CDI, common dates, coverage and B3 segments passed.",
);
// A missing reference must not erase independently available portfolio history.
const noCdi = simulateComposition(
  withFixed,
  hm,
  [],
  30,
  ["ibov", "sp500", "cdi"],
  Date.parse("2026-10-28T18:00:00Z"),
);
assert.ok(noCdi.points.length >= 2);
close(noCdi.coverage, 50);
assert.ok(noCdi.unavailable.includes("cdi"));
assert.ok(noCdi.excluded.includes("CDB"));
assert.notEqual(noCdi.points.at(-1).ibov, undefined);
const noSp = {
  ...hm,
  quotes: { ...hm.quotes, SP500: { ...hm.quotes.SP500, history: [] } },
};
const isolated = simulateComposition(
  p,
  noSp,
  rates,
  30,
  ["sp500", "ibov"],
  Date.parse("2026-10-28T18:00:00Z"),
);
assert.ok(isolated.points.length >= 2);
assert.ok(isolated.unavailable.includes("sp500"));
assert.notEqual(isolated.points.at(-1).ibov, undefined);
const onlyFixed = {
  ...EMPTY,
  fixedIncome: [
    { ...fixed.fixedIncome[0], value: 100, ratePercent: 120, index: "CDI" },
  ],
};
const rfSimulation = simulateComposition(
  onlyFixed,
  hm,
  rates,
  30,
  ["cdi"],
  Date.parse("2026-10-28T18:00:00Z"),
);
close(rfSimulation.coverage, 100);
close(rfSimulation.points.at(-1).portfolio, (1.0006 ** 2 - 1) * 100);
console.log(
  "Resilience passed: missing CDI, isolated benchmark failure, explicit partial coverage and fixed-income-only history.",
);
const outdatedCdi = simulateComposition(
  withFixed,
  hm,
  [
    { date: "2026-01-01", rate: 0.05 },
    { date: "2026-01-02", rate: 0.05 },
  ],
  30,
  ["cdi", "ibov"],
  Date.parse("2026-10-28T18:00:00Z"),
);
assert.ok(outdatedCdi.points.length >= 2);
assert.ok(outdatedCdi.unavailable.includes("cdi"));
close(outdatedCdi.coverage, 50);
console.log(
  "Outdated CDI does not block available portfolio and index history.",
);

// Each filter has independent holdings, cash flows, income and inception.
const mixed = {
  ...EMPTY,
  transactions: [
    tx("WEGE3", 10, 10),
    tx("VOO", 1, 100, "USD"),
    tx("BTC", 0.2, 100, "USD"),
    tx("ABTC11", 2, 10),
    tx("AUPO11", 3, 10),
  ],
  fixedIncome: [{ ...known.fixedIncome[0], value: 1000, cost: 1000 }],
  incomes: [],
};
const mixedMarket = {
  ...fm,
  quotes: {
    ...fm.quotes,
    ABTC11: quote("ABTC11", 10),
    AUPO11: quote("AUPO11", 10),
  },
};
const base = capturePerformance(
  mixed,
  mixedMarket,
  undefined,
  1,
  "2026-10-27T15:00:00Z",
);
close(base.point.value, 1750);
close(base.point.segments.br.value, 100);
close(base.point.segments.us.value, 500);
close(base.point.segments.btc.value, 100);
const movedMarket = {
  ...mixedMarket,
  quotes: {
    ...mixedMarket.quotes,
    WEGE3: quote("WEGE3", 11),
    VOO: quote("VOO", 120, "USD"),
    USD: quote("USD", 6),
    BTC: quote("BTC", 90, "USD"),
    ABTC11: quote("ABTC11", 15),
  },
};
const withPayments = {
  ...mixed,
  incomes: [
    {
      id: "br-payment",
      ticker: "WEGE3",
      amount: 4,
      currency: "BRL",
      date: "2026-10-28",
      kind: "payment",
      note: "",
    },
    {
      id: "us-payment",
      ticker: "VOO",
      amount: 2,
      currency: "USD",
      date: "2026-10-28",
      kind: "payment",
      note: "",
    },
  ],
};
const movement = capturePerformance(
  withPayments,
  movedMarket,
  base.state,
  2,
  "2026-10-28T15:00:00Z",
);
close(movement.point.segments.br.index, 114);
close(movement.point.segments.us.index, 146.4);
close(movement.point.segments.btc.index, 108);
close(movement.point.index, (2014 / 1750) * 100);
const bought = {
  ...withPayments,
  transactions: [
    ...mixed.transactions,
    { ...tx("VOO", 1, 120, "USD"), id: "us-buy", kind: "buy" },
  ],
};
const contribution = capturePerformance(
  bought,
  movedMarket,
  movement.state,
  3,
  "2026-10-28T15:01:00Z",
);
close(contribution.point.segments.us.index, 146.4);
close(contribution.point.segments.us.flow, 720);
close(contribution.point.segments.br.flow, 0);
close(contribution.point.segments.btc.flow, 0);
close(contribution.point.index, movement.point.index);
const mixedData = {
  points: [base.point, movement.point, contribution.point],
  startedAt: base.state.startedAt,
  updatedAt: contribution.state.capturedAt,
  warnings: [],
};
for (const [scope, expected] of [
  ["br", 14],
  ["us", 46.4],
  ["btc", 8],
]) {
  const chart = recordedChart(
    mixedData,
    30,
    [],
    Date.parse("2026-10-28T18:00:00Z"),
    scope,
  );
  close(chart[0].portfolio, 0);
  close(chart.at(-1).portfolio, expected);
}
const oldState = { ...base.state };
delete oldState.segments;
const oldPoint = { ...base.point };
delete oldPoint.segments;
const upgraded = capturePerformance(
  mixed,
  movedMarket,
  oldState,
  2,
  "2026-10-28T15:00:00Z",
);
close(upgraded.point.segments.us.index, 100);
assert.equal(upgraded.point.segments.us.baseline, true);
assert.equal(upgraded.point.baseline, false);
assert.equal(upgraded.state.startedAt, base.state.startedAt);
assert.deepEqual(
  recordedChart(
    { ...mixedData, points: [oldPoint] },
    30,
    [],
    Date.parse("2026-10-28T18:00:00Z"),
    "br",
  ),
  [],
);
const delayed = capturePerformance(
  { ...p, transactions: [...p.transactions, tx("VOO", 1, 100, "USD")] },
  mixedMarket,
  c.state,
  2,
  "2026-10-28T15:00:00Z",
);
assert.equal(delayed.point.segments.us.baseline, true);
assert.equal(delayed.point.segments.br.baseline, false);
assert.deepEqual(
  performancePortfolio(mixed, "btc").transactions.map((t) => t.ticker),
  ["BTC"],
);
assert.equal(performancePortfolio(mixed, "all"), mixed);
const simBr = simulateComposition(
  mixed,
  hm,
  rates,
  30,
  [],
  Date.parse("2026-10-28T18:00:00Z"),
  "br",
);
close(simBr.coverage, 100);
close(simBr.points.at(-1).portfolio, 10);
assert.equal(simBr.heldCount, 1);
assert.deepEqual(simBr.excluded, []);
const simUS = simulateComposition(
  mixed,
  hm,
  rates,
  30,
  [],
  Date.parse("2026-10-28T18:00:00Z"),
  "us",
);
close(simUS.points.at(-1).portfolio, 20);
close(simUS.coverage, 100);
const simBTC = simulateComposition(
  mixed,
  hm,
  rates,
  30,
  [],
  Date.parse("2026-10-28T18:00:00Z"),
  "btc",
);
close(simBTC.points.at(-1).portfolio, 44);
close(simBTC.coverage, 100);
const noSelectedPositions = simulateComposition(
  p,
  hm,
  rates,
  30,
  [],
  Date.parse("2026-10-28T18:00:00Z"),
  "us",
);
assert.deepEqual(noSelectedPositions.points, []);
console.log(
  "Filters passed: isolated BR/US/BTC returns, dividends, FX, neutral contributions, legacy history, new group inception, scoped simulation weights and missing quotes outside the selected group.",
);
