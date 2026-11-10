import assert from "node:assert/strict";
import { EMPTY } from "../app/lib/model.ts";
import {
  BASE_STOCK_WEIGHTS,
  DEFAULT_EVALUATION,
  DEFAULT_SCENARIO,
} from "../app/lib/evaluation-config.ts";
import {
  evaluatePortfolio,
  normalizedWeights,
  cappedWeights,
  earningsValue,
} from "../app/lib/evaluation.ts";
import {
  parseFundamentals,
  parseScreening,
  providerNumber,
  peerReference,
  freshFundamentals,
} from "../app/lib/fundamentals.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`),
  now = Date.parse("2026-10-30T15:00:00Z");
near(
  Object.values(BASE_STOCK_WEIGHTS).reduce((s, v) => s + v, 0),
  99.8,
);
const normalized = normalizedWeights(BASE_STOCK_WEIGHTS);
near(
  Object.values(normalized).reduce((s, v) => s + v, 0),
  100,
);
near(normalized.ALUP11 / normalized.PRIO3, 10.4 / 4.5);
assert.equal(normalized.KLBN11, undefined);
near(
  earningsValue(2, {
    growth: 0,
    discountRate: 10,
    terminalPE: 10,
    payout: 0,
    years: 5,
  }),
  20 / 1.1 ** 5,
);
near(
  earningsValue(2, {
    growth: 0,
    discountRate: 10,
    terminalPE: 10,
    payout: 100,
    years: 1,
  }),
  22 / 1.1,
);
assert.equal(earningsValue(-1, DEFAULT_SCENARIO), null);
assert.equal(earningsValue(null, DEFAULT_SCENARIO), null);
assert.ok(
  earningsValue(2, { ...DEFAULT_SCENARIO, growth: 10 }) >
    earningsValue(2, DEFAULT_SCENARIO),
);
assert.ok(
  earningsValue(2, { ...DEFAULT_SCENARIO, discountRate: 20 }) <
    earningsValue(2, DEFAULT_SCENARIO),
);
const capped = cappedWeights(normalized, 15, 35);
near(
  Object.values(capped.weights).reduce((s, v) => s + v, 0),
  100,
);
assert.ok(capped.weights.KLBN4 + (capped.weights.KLBN11 ?? 0) <= 15 + 1e-8);
assert.ok(cappedWeights(normalized, 5, 35).reserve > 30);
const tx = (ticker, quantity, price) => ({
  id: crypto.randomUUID(),
  ticker,
  kind: "opening",
  quantity,
  price,
  fx: 1,
  fees: 0,
  date: "2026-10-29",
  note: "",
});
const quote = (ticker, price, extra = {}) => ({
  ticker,
  price,
  previous: price,
  change: 0,
  currency: "BRL",
  time: Date.parse("2026-10-29T20:00:00Z") / 1000,
  source: "fixture",
  delay: 0,
  history: [],
  volatility: null,
  momentum: null,
  drawdown: null,
  ...extra,
});
const f = (ticker, extra = {}) => ({
  ticker,
  company: ticker,
  sector: "fixture",
  segmentId: "25",
  sourcePrice: 100,
  quoteDate: "2026-10-29",
  balanceDate: "2026-06-30",
  pe: 10,
  pb: 2,
  eps: 10,
  bvps: 50,
  roe: 20,
  roic: 15,
  netDebtEbit: 1,
  netDebtEquity: 0.3,
  growth: 5,
  liquidity: 1000000,
  financial: false,
  sourceUrl: "https://www.fundamentus.com.br/detalhes.php?papel=" + ticker,
  ...extra,
});
const peer = {
  tickers: ["AAAA3", "BBBB3", "CCCC3"],
  medianPE: 10,
  lowPE: 8,
  highPE: 12,
  medianROE: 20,
  oldestQuote: "2026-10-29",
  oldestBalance: "2026-06-30",
  sourceUrls: [],
};
const settings = {
  ...structuredClone(DEFAULT_EVALUATION),
  baseWeights: { ALUP11: 50, WEGE3: 50 },
  maxIssuerWeight: 50,
  maxSectorWeight: 100,
};
const p = {
  ...EMPTY,
  transactions: [tx("ALUP11", 1, 50), tx("WEGE3", 3, 100)],
  targets: { br: 100, rf: 0, etf: 0, crypto: 0 },
  evaluation: settings,
};
const market = {
  quotes: { ALUP11: quote("ALUP11", 50), WEGE3: quote("WEGE3", 100) },
  fetchedAt: new Date(now).toISOString(),
  errors: [],
};
const data = {
  items: { ALUP11: f("ALUP11"), WEGE3: f("WEGE3") },
  peers: { ALUP11: peer, WEGE3: peer },
  fetchedAt: new Date(now).toISOString(),
  errors: [],
};
const row = (analysis, ticker = "ALUP11") =>
  analysis.rows.find((r) => r.ticker === ticker);
const snapshot = JSON.stringify(p);
let result = evaluatePortfolio(p, market, data, 100, now);
assert.equal(row(result).action, "buy");
assert.equal(row(result).quantityToBuy, 2);
near(row(result).executable, 100);
near(result.reserve, 0);
assert.equal(JSON.stringify(p), snapshot);
const expensive = {
  ...market,
  quotes: { ...market.quotes, ALUP11: quote("ALUP11", 150) },
};
assert.notEqual(
  row(evaluatePortfolio(p, expensive, data, 100, now)).action,
  "buy",
);
for (const patch of [
  { eps: -1 },
  { roe: -1 },
  { netDebtEbit: 5 },
  { roe: 3 },
]) {
  result = evaluatePortfolio(
    p,
    market,
    { ...data, items: { ...data.items, ALUP11: f("ALUP11", patch) } },
    100,
    now,
  );
  assert.equal(row(result).action, "review");
  near(row(result).executable, 0);
}
result = evaluatePortfolio(
  p,
  market,
  {
    ...data,
    items: {
      ...data.items,
      ALUP11: f("ALUP11", { financial: true, netDebtEbit: 9 }),
    },
  },
  100,
  now,
);
assert.equal(row(result).action, "buy");
for (const invalid of [
  undefined,
  { ...data, stale: true },
  {
    ...data,
    items: { ...data.items, ALUP11: f("ALUP11", { quoteDate: "2026-01-01" }) },
  },
  {
    ...data,
    items: {
      ...data.items,
      ALUP11: f("ALUP11", { balanceDate: "2025-01-01" }),
    },
  },
])
  assert.notEqual(
    row(evaluatePortfolio(p, market, invalid, 100, now)).action,
    "buy",
  );
for (const q of [
  { stale: true },
  { time: Date.parse("2026-01-01") / 1000 },
  { currency: "USD" },
])
  assert.notEqual(
    row(
      evaluatePortfolio(
        p,
        {
          ...market,
          quotes: { ...market.quotes, ALUP11: quote("ALUP11", 50, q) },
        },
        data,
        100,
        now,
      ),
    ).action,
    "buy",
  );
const manual = {
  referencePrice: 100,
  thesis: "intact",
  note: "Lucro normalizado e premissas revisados.",
  updatedAt: "2026-10-29",
  method: "manual",
};
const withOverride = (override) => ({
  ...p,
  evaluation: {
    ...settings,
    overrides: { ALUP11: { ...manual, ...override } },
  },
});
assert.equal(
  row(evaluatePortfolio(withOverride({}), market, undefined, 100, now)).action,
  "buy",
);
assert.notEqual(
  row(
    evaluatePortfolio(
      withOverride({ updatedAt: "2025-01-01" }),
      market,
      undefined,
      100,
      now,
    ),
  ).action,
  "buy",
);
assert.equal(
  row(
    evaluatePortfolio(
      withOverride({ thesis: "review" }),
      market,
      data,
      100,
      now,
    ),
  ).action,
  "review",
);
assert.equal(
  row(
    evaluatePortfolio(
      withOverride({ thesis: "broken" }),
      market,
      data,
      100,
      now,
    ),
  ).action,
  "sell",
);
near(
  row(
    evaluatePortfolio(
      withOverride({ thesis: "broken" }),
      market,
      data,
      100,
      now,
    ),
  ).targetWeight,
  0,
);
const concentrated = {
  ...p,
  transactions: [tx("KLBN4", 100, 1), tx("KLBN11", 100, 1)],
  evaluation: structuredClone(DEFAULT_EVALUATION),
};
result = evaluatePortfolio(
  concentrated,
  {
    ...market,
    quotes: { KLBN4: quote("KLBN4", 1), KLBN11: quote("KLBN11", 1) },
  },
  data,
  100,
  now,
);
assert.equal(row(result, "KLBN4").action, "reduce");
assert.equal(row(result, "KLBN11"), undefined);
assert.equal(
  result.rows.reduce((s, r) => s + r.executable, 0),
  0,
);
result = evaluatePortfolio(p, market, data, 1, now);
assert.ok(result.rows.every((r) => r.quantityToBuy === 0));
near(result.reserve, 1);
const missing = { ...market, quotes: { ALUP11: market.quotes.ALUP11 } };
result = evaluatePortfolio(p, missing, data, 100, now);
assert.equal(result.portfolioComplete, false);
assert.equal(result.classAmount, 0);
assert.ok(result.rows.every((r) => r.executable === 0));
const scenarioData = { ...data, peers: {} };
result = evaluatePortfolio(p, market, scenarioData, 100, now);
assert.equal(row(result).referenceKind, "scenario");
near(row(result).reference, earningsValue(10, DEFAULT_SCENARIO));
result = evaluatePortfolio(
  withOverride({ method: "peers", referencePrice: null }),
  market,
  scenarioData,
  100,
  now,
);
assert.equal(row(result).action, "missing");
assert.equal(
  portfolioSchema.safeParse({
    ...p,
    evaluation: {
      ...settings,
      scenario: DEFAULT_SCENARIO,
      overrides: { ALUP11: manual },
    },
  }).success,
  true,
);
for (const scenario of [
  { ...DEFAULT_SCENARIO, discountRate: 0 },
  { ...DEFAULT_SCENARIO, payout: 101 },
  { ...DEFAULT_SCENARIO, years: 1.5 },
])
  assert.equal(
    portfolioSchema.safeParse({ ...p, evaluation: { ...settings, scenario } })
      .success,
    false,
  );
assert.equal(
  portfolioSchema.safeParse({
    ...p,
    evaluation: { ...settings, baseWeights: { BTC: 100 } },
  }).success,
  false,
);
assert.equal(
  portfolioSchema.safeParse({
    ...p,
    evaluation: { ...settings, baseWeights: { ALUP11: 0 } },
  }).success,
  false,
);
assert.equal(providerNumber("-"), null);
assert.equal(providerNumber("1.234,56"), 1234.56);
assert.equal(providerNumber("-0,13"), -0.13);
assert.equal(providerNumber("31,4%"), 31.4);
const cell = (label, value) =>
  `<td class="label"><span class="help">?</span><span class="txt">${label}</span></td><td class="data"><span class="txt">${value}</span></td>`;
const html =
  cell("Papel", "WEGE3") +
  cell("Cotação", "49,28") +
  cell("Data últ cot", "29/10/2026") +
  cell("Últ balanço processado", "30/09/2026") +
  cell("Setor", "Máquinas") +
  cell("Subsetor", '<a href="resultado.php?segmento=41">Motores</a>') +
  cell("LPA", "1,49") +
  cell("Dív. Líquida", "-2.585.000") +
  cell("EBIT", "8.438.960") +
  cell("EBIT", "2.296.490");
const parsed = parseFundamentals(html, "WEGE3");
near(parsed.netDebtEbit, -2585000 / 8438960);
assert.equal(parsed.segmentId, "41");
assert.equal(parsed.quoteDate, "2026-10-29");
assert.throws(() => parseFundamentals(html, "VALE3"));
assert.ok(freshFundamentals(parsed, now));
assert.equal(
  freshFundamentals({ ...parsed, balanceDate: "2027-12-31" }, now),
  false,
);
const candidates = [
  f("AAAA3"),
  f("BBBB3"),
  f("CCCC3"),
  f("CCCC4"),
  f("ALUP4"),
  f("DDDD3", { quoteDate: "2020-01-01" }),
  f("EEEE3", { eps: -1 }),
];
const ref = peerReference(f("ALUP11"), candidates, now);
assert.deepEqual(ref.tickers.toSorted(), ["AAAA3", "BBBB3", "CCCC3"]);
assert.equal(
  peerReference(f("ALUP11"), candidates.slice(0, 2), now),
  undefined,
);
const screen = (ticker, liquidity) =>
  "<tr>" +
  Array.from(
    { length: 22 },
    (_, i) =>
      `<td>${i === 0 ? ticker : i === 2 ? "10,00" : i === 18 ? liquidity : "0"}</td>`,
  ).join("") +
  "</tr>";
assert.deepEqual(
  parseScreening(screen("AAAA3", "200.000") + screen("AAAA4", "900.000")).map(
    (r) => r.ticker,
  ),
  ["AAAA4"],
);
console.log(
  "Evaluation passed: supplied weights, cash-flow math, peer freshness/deduplication, missing/negative data, financial-sector exception, buy eligibility, issuer/sector caps, legacy Klabin exclusion, cash preservation, explicit thesis review/sale, manual expiry, scenario selection and schema round-trip.",
);
const splitPortfolio = {
  ...EMPTY,
  transactions: [],
  targets: { br: 0, rf: 100, etf: 0, crypto: 0 },
  evaluation: {
    ...settings,
    baseWeights: { ALUP11: 40, ITUB4: 40, WEGE3: 20 },
  },
};
const splitMarket = {
  ...market,
  quotes: {
    ALUP11: quote("ALUP11", 10),
    ITUB4: quote("ITUB4", 10),
    WEGE3: quote("WEGE3", 40),
  },
};
const splitData = {
  ...data,
  items: { ALUP11: f("ALUP11"), ITUB4: f("ITUB4"), WEGE3: f("WEGE3") },
  peers: { ALUP11: peer, ITUB4: peer, WEGE3: peer },
};
const dedicated = (
  portfolio = splitPortfolio,
  prices = splitMarket,
  fundamentals = splitData,
  amount = 1000,
) => evaluatePortfolio(portfolio, prices, fundamentals, amount, now);
result = dedicated();
near(result.classAmount, 1000);
near(row(result).amount, 400);
near(row(result, "ITUB4").amount, 400);
near(row(result, "WEGE3").amount, 200);
near(result.allocated + result.reserve, 1000);
assert.equal(result.rows.length, 13);
for (const amount of [0, 1, 50, 500, 1000, 2500, 9999.99]) {
  const a = dedicated(undefined, undefined, undefined, amount);
  near(a.allocated + a.reserve, amount);
  assert.ok(a.allocated <= amount + 1e-8);
  assert.ok(
    a.rows.every(
      (r) =>
        Number.isInteger(r.quantityToBuy) &&
        r.quantityToBuy >= 0 &&
        r.executable >= 0,
    ),
  );
  assert.ok(a.rows.filter((r) => !r.usable).every((r) => r.executable === 0));
}
const notAttractive = {
  ...splitMarket,
  quotes: { ...splitMarket.quotes, WEGE3: quote("WEGE3", 150) },
};
result = dedicated(undefined, notAttractive);
near(row(result, "WEGE3").executable, 0);
assert.ok(row(result, "WEGE3").allocationReason.includes("margem"));
assert.ok(row(result).amount > 0 && row(result, "ITUB4").amount > 0);
assert.ok(result.reserve > 0);
const belowUnit = dedicated(undefined, undefined, undefined, 1);
near(belowUnit.allocated, 0);
near(belowUnit.reserve, 1);
assert.ok(belowUnit.rows.every((r) => r.allocationReason));
const combined = {
  ...splitPortfolio,
  evaluation: { ...settings, baseWeights: { KLBN4: 50, KLBN11: 50 } },
};
const combinedMarket = {
  ...market,
  quotes: { KLBN4: quote("KLBN4", 10), KLBN11: quote("KLBN11", 10) },
};
const combinedData = {
  ...data,
  items: { KLBN4: f("KLBN4"), KLBN11: f("KLBN11") },
  peers: { KLBN4: peer, KLBN11: peer },
};
result = dedicated(combined, combinedMarket, combinedData);
assert.ok(
  row(result, "KLBN4").amount + (row(result, "KLBN11")?.amount ?? 0) <=
    500 + 1e-8,
);
near(result.allocated + result.reserve, 1000);
const foreignMissing = {
  ...p,
  transactions: [
    ...p.transactions,
    { ...tx("SPHQ", 1, 50), currency: "USD", fx: null },
  ],
};
result = evaluatePortfolio(foreignMissing, market, data, 100, now);
assert.equal(result.portfolioComplete, false);
assert.equal(result.missingStocks, false);
near(result.classAmount, 100);
near(result.allocated, 100);
result = dedicated(undefined, undefined, undefined, Number.NaN);
near(result.classAmount, 0);
near(result.allocated, 0);
console.log(
  "Contribution simulation passed: entire amount for stocks, proportional distribution across candidates, explicit zero amounts and reasons, cash accounting, whole units, rounding, issuer limits with archived Klabin records ignored, unrelated missing quotes and zero/invalid budgets.",
);
// Lucro deprimido (P/L 130): sem referência, em vez de um "preço justo" absurdo que indica redução.
{
  const depressed = {
    ...data,
    items: { ...data.items, ALUP11: f("ALUP11", { pe: 130, eps: 0.77 }) },
  };
  const r = row(evaluatePortfolio(p, market, depressed, 100, now), "ALUP11");
  assert.equal(r.reference, null);
  assert.equal(r.valuation, "unknown");
  assert.equal(r.action, "missing");
  assert.ok(r.reasons.some((x) => x.includes("fora do intervalo de 2x a 60x")));
  const normal = row(evaluatePortfolio(p, market, data, 100, now), "ALUP11");
  assert.ok(normal.reference > 0, "P/L 10 continua com referência");
  const edge = row(
    evaluatePortfolio(
      p,
      market,
      { ...data, items: { ...data.items, ALUP11: f("ALUP11", { pe: 60 }) } },
      100,
      now,
    ),
    "ALUP11",
  );
  assert.ok(edge.reference > 0, "60x ainda vale");
}
