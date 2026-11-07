import assert from "node:assert/strict";
import { EMPTY, totals } from "../app/lib/model.ts";
import {
  simulateComposition,
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
const foreign = { ...EMPTY, transactions: [tx("VOO", 1, 90, "USD")] };
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
const known = {
  ...fixed,
  fixedIncome: [{ ...fixed.fixedIncome[0], cost: 1000 }],
};
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
close(bt.bitcoin.value, 20);
close(bt.fixedQuoted.value, 30);
close(bt.byGroup.crypto, 20);
close(bt.byGroup.rf, 30);
console.log(
  "Simulation: FX, CDI, common dates, coverage and class summaries passed.",
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

// Each filter has independent holdings.
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
assert.deepEqual(
  performancePortfolio(mixed, "btc").transactions.map((t) => t.ticker),
  ["BTC", "ABTC11"],
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
  {
    ...mixed,
    transactions: mixed.transactions.filter((t) => t.ticker === "BTC"),
  },
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
  "Filters passed: scoped simulation weights and missing quotes outside the selected group.",
);
