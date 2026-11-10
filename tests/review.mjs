import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {
  ASSETS,
  EMPTY,
  positions,
  totals,
  allocationPlan,
  assetPlan,
  trackedPortfolio,
} from "../app/lib/model.ts";
import { costPerformance } from "../app/lib/cost-performance.ts";
import { evaluatePortfolio } from "../app/lib/evaluation.ts";
import { datedTrades } from "../app/lib/trade-history.ts";
import { newsSelection } from "../app/lib/news.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
import { resolveTheme, THEME_BOOT_SCRIPT } from "../app/lib/theme.ts";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`),
  now = Date.parse("2026-10-30T15:00:00Z");
const tx = (ticker, quantity, price, extra = {}) => ({
  id: crypto.randomUUID(),
  ticker,
  quantity,
  price,
  fx: 1,
  fees: 0,
  kind: "opening",
  date: "2026-10-29",
  note: "",
  currency: "BRL",
  ...extra,
});
const quote = (ticker, price, currency = "BRL") => ({
  ticker,
  price,
  currency,
  previous: price,
  change: 0,
  time: now / 1000,
  history: [{ date: "2026-10-29", close: price }],
  priceHistory: [{ date: "2026-10-29", close: price }],
  source: "fixture",
  delay: 0,
  volatility: null,
  momentum: null,
  drawdown: null,
});
const kept = tx("KLBN4", 10, 5),
  legacy = tx("KLBN11", 1000, 10);
const ledger = [kept, legacy].map((t) => ({
  ...t,
  id: crypto.randomUUID(),
  kind: "buy",
  total: t.quantity * t.price,
}));
const income = (ticker, amount) => ({
  id: crypto.randomUUID(),
  ticker,
  amount,
  currency: "BRL",
  date: "2026-10-29",
  kind: "payment",
  fx: 1,
  note: "",
});
const p = {
    ...EMPTY,
    transactions: [kept, legacy],
    tradeHistory: ledger,
    incomes: [income("KLBN4", 2), income("KLBN11", 100)],
  },
  before = JSON.stringify(p);
const m = {
  quotes: { KLBN4: quote("KLBN4", 6) },
  errors: [],
  fetchedAt: new Date(now).toISOString(),
};
assert.ok(!ASSETS.some((a) => a.ticker === "KLBN11"));
assert.equal(ASSETS.filter((a) => a.group === "br").length, 13);
assert.equal(portfolioSchema.safeParse(p).success, true);
assert.equal(trackedPortfolio(p).transactions.length, 1);
assert.equal(JSON.stringify(p), before);
const total = totals(p, m);
near(total.value, 60);
near(total.cost, 50);
near(total.incomes.BRL, 2);
assert.equal(total.missing.length, 0);
assert.ok(assetPlan(p, m, 1000).every((r) => r.ticker !== "KLBN11"));
assert.ok(datedTrades(p).every((t) => t.ticker !== "KLBN11"));
assert.equal(newsSelection("KLBN11"), undefined);
const cost = costPerformance(p, m, "br", 365, now);
near(cost.value, 60);
near(cost.cost, 50);
near(cost.income, 2);
assert.ok(
  evaluatePortfolio(p, m, undefined, 1000, now).rows.every(
    (r) => r.ticker !== "KLBN11",
  ),
);
const exact = {
  ...EMPTY,
  transactions: [tx("WEGE3", 2, 9.99, { costNative: 20, fees: 1 })],
};
let market = { ...m, quotes: { WEGE3: quote("WEGE3", 12) } };
let row = positions(exact, market).find((a) => a.ticker === "WEGE3");
near(row.average, 10.5);
near(row.primaryCost, 21);
near(row.result, 3);
const foreign = {
  ...EMPTY,
  transactions: [
    tx("SPHQ", 2, 9.99, { costNative: 20, currency: "USD", fx: null, fees: 1 }),
  ],
};
market = {
  ...m,
  quotes: { SPHQ: quote("SPHQ", 12, "USD"), USD: quote("USD", 5) },
};
row = positions(foreign, market).find((a) => a.ticker === "SPHQ");
near(row.average, 10.1);
assert.equal(row.costEstimated, true); // Taxa em reais sem câmbio de compra: usa o câmbio atual e fica marcada como estimativa, sem apagar o custo em dólar (I6 da revisão).
row = positions(
  { ...foreign, transactions: [{ ...foreign.transactions[0], fx: 5 }] },
  market,
).find((a) => a.ticker === "SPHQ");
near(row.average, 10.1);
for (const price of [0, -1, NaN, Infinity]) {
  const invalid = { ...m, quotes: { WEGE3: quote("WEGE3", price) } };
  assert.equal(
    positions(exact, invalid).find((r) => r.ticker === "WEGE3").value,
    null,
  );
  assert.equal(totals(exact, invalid).result, null);
  assert.deepEqual(allocationPlan(exact, invalid, 1000), []);
}
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme(null, true), "dark");
assert.equal(resolveTheme("invalid", false), "light");
for (const { saved, system, blocked, expected } of [
  { saved: "dark", system: false, expected: "dark" },
  { saved: "light", system: true, expected: "light" },
  { saved: null, system: true, expected: "dark" },
  { saved: "invalid", system: false, expected: "light" },
  { saved: null, system: true, blocked: true, expected: "dark" },
]) {
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(THEME_BOOT_SCRIPT, {
    localStorage: {
      getItem() {
        if (blocked) throw Error("blocked");
        return saved;
      },
    },
    matchMedia: () => ({ matches: system }),
    document: { documentElement: root },
  });
  assert.equal(root.dataset.theme, expected);
  assert.equal(root.style.colorScheme, expected);
}
const css = await fs.readFile("app/globals.css", "utf8");
const variables = (selector) => {
  const block = css.match(selector);
  return Object.fromEntries(
    [...block[1].matchAll(/(--[\w-]+):\s*([^;}]*)/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
};
const light = variables(/^:root\s*\{([^}]+)\}/m),
  dark = {
    ...light,
    ...variables(/^html\[data-theme="?dark"?\]\s*\{([^}]+)\}/m),
  };
const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => {
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l[0] + 0.05) / (l[1] + 0.05);
};
const color = (s) =>
  s.length === 4 ? "#" + [...s.slice(1)].map((c) => c + c).join("") : s;
for (const palette of [light, dark])
  for (const [fg, bg] of [
    ["--text-secondary", "--surface"],
    ["--text-secondary", "--surface-subtle"],
    ["--positive", "--surface"],
    ["--negative", "--surface"],
    ["--on-action", "--action"],
    ["--warning-text", "--warning-bg"],
  ])
    assert.ok(
      contrast(color(palette[fg]), color(palette[bg])) >= 4.5,
      `${fg}/${bg} contrast`,
    );
console.log(
  "Review passed: KLBN4-only totals, cost, incomes, markers, news and planning; legacy backup compatibility; exact cost/fee averages; invalid quote guards; preserved observations with safe performance rebasing; theme persistence/bootstrap and contrast in both palettes.",
);
