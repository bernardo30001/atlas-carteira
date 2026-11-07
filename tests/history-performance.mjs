// Curva reconstruída pelas operações. Todos os valores são fictícios e conferidos à mão.
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY } from "../app/lib/model.ts";
import { historyPerformance } from "../app/lib/history-performance.ts";
import {
  historyBatches,
  historyStart,
  historySymbols,
  mergeMarket,
} from "../app/lib/market-history.ts";

const near = (a, b, label = "") =>
  assert.ok(Math.abs(a - b) < 1e-6, `${label} ${a} != ${b}`);
const NOW = Date.parse("2026-03-06T18:00:00Z");
const quote = (ticker, currency, closes) => {
  const history = Object.entries(closes).map(([date, close]) => ({
    date,
    close,
  }));
  return {
    ticker,
    price: history.at(-1).close,
    previous: history.at(-1).close,
    change: 0,
    currency,
    time: NOW / 1000,
    source: "ficticio",
    delay: 0,
    history,
    priceHistory: history,
    volatility: null,
    momentum: null,
    drawdown: null,
  };
};
const market = (...quotes) => ({
  quotes: Object.fromEntries(quotes.map((q) => [q.ticker, q])),
  errors: [],
  fetchedAt: new Date(NOW).toISOString(),
});
const trade = (ticker, kind, date, quantity, price, extra = {}) => ({
  id: `${ticker}-${kind}-${date}`,
  ticker,
  kind,
  date,
  quantity,
  price,
  total: quantity * price,
  currency: "BRL",
  fx: null,
  fees: 0,
  ...extra,
});
const portfolio = (extra) => ({ ...EMPTY, schemaVersion: 4, ...extra });
const WEGE = (closes) => quote("WEGE3", "BRL", closes);
const byDate = (result, date) => result.points.find((p) => p.date === date);

test("aporte novo não conta como ganho", () => {
  // Dia 2: 10 cotas a 10 → 110 (+10%). Dia 3: compra de 100 a 11 e preço parado (0%).
  // Dia 4: 19,0909 cotas a 12,1 (+10%). Encadeado: 1,1 × 1 × 1,1 = +21%.
  const r = historyPerformance(
    portfolio({
      tradeHistory: [
        trade("WEGE3", "buy", "2026-03-01", 10, 10),
        trade("WEGE3", "buy", "2026-03-03", 100 / 11, 11),
      ],
    }),
    market(
      WEGE({
        "2026-03-01": 10,
        "2026-03-02": 11,
        "2026-03-03": 11,
        "2026-03-04": 12.1,
        "2026-03-06": 12.1,
      }),
    ),
    [],
    "all",
    null,
    NOW,
  );
  assert.equal(r.startedAt, "2026-03-01");
  near(byDate(r, "2026-03-02").portfolio, 10, "dia 2");
  near(byDate(r, "2026-03-03").portfolio, 10, "o aporte não muda o retorno");
  near(byDate(r, "2026-03-04").portfolio, 21, "dia 4");
  near(r.invested, 200, "capital");
  near(r.value, (10 + 100 / 11) * 12.1, "saldo");
  near(r.returnPercent, 21, "fim");
});

test("a compra rende do preço pago até o fechamento do dia", () => {
  const r = historyPerformance(
    portfolio({ tradeHistory: [trade("WEGE3", "buy", "2026-03-02", 10, 10)] }),
    market(WEGE({ "2026-03-02": 10.5, "2026-03-06": 10.5 })),
    [],
    "all",
    null,
    NOW,
  );
  near(byDate(r, "2026-03-02").portfolio, 5, "primeiro dia");
});

test("venda retira capital sem criar ganho e a taxa pesa no retorno", () => {
  // Compra de 10 a 10 com taxa 1 (capital 101). Vende 5 a 10 no dia 3 com taxa 1:
  // (50 + 49) / 100 = −1%, encadeado com 100/101.
  const r = historyPerformance(
    portfolio({
      tradeHistory: [
        trade("WEGE3", "buy", "2026-03-02", 10, 10, { fees: 1 }),
        trade("WEGE3", "sell", "2026-03-03", 5, 10, { fees: 1 }),
      ],
    }),
    market(WEGE({ "2026-03-02": 10, "2026-03-03": 10, "2026-03-06": 10 })),
    [],
    "all",
    null,
    NOW,
  );
  near(
    byDate(r, "2026-03-02").portfolio,
    (100 / 101 - 1) * 100,
    "taxa da compra",
  );
  near(
    byDate(r, "2026-03-03").portfolio,
    ((100 / 101) * (99 / 100) - 1) * 100,
    "taxa da venda",
  );
  near(r.value, 50, "saldo depois da venda");
  near(r.invested, 101 - 49, "capital líquido");
});

test("provento soma uma vez no dia do pagamento", () => {
  // 10 cotas a 10: provento de 5 no dia 3 e preço parado = +5%.
  const r = historyPerformance(
    portfolio({
      tradeHistory: [trade("WEGE3", "buy", "2026-03-02", 10, 10)],
      incomes: [
        {
          id: "i",
          ticker: "WEGE3",
          amount: 5,
          currency: "BRL",
          date: "2026-03-03",
          kind: "payment",
          note: "",
        },
      ],
    }),
    market(WEGE({ "2026-03-02": 10, "2026-03-03": 10, "2026-03-06": 10 })),
    [],
    "all",
    null,
    NOW,
  );
  near(byDate(r, "2026-03-02").portfolio, 0);
  near(byDate(r, "2026-03-03").portfolio, 5);
  near(r.returnPercent, 5);
  near(r.value, 100, "o provento não entra no saldo");
});

test("posição sem datas entra na referência, sem retorno inventado antes dela", () => {
  // O erro antigo valorizava o Bitcoin desde o início do gráfico. Aqui: BTC entra dia 4.
  const r = historyPerformance(
    portfolio({
      tradeHistory: [trade("WEGE3", "buy", "2026-03-02", 10, 10)],
      transactions: [
        {
          id: "b",
          ticker: "BTC",
          kind: "opening",
          quantity: 1,
          price: 50,
          fx: 1,
          fees: 0,
          date: "2026-03-04",
          note: "",
          currency: "BRL",
          costNative: 50,
        },
      ],
    }),
    market(
      WEGE({
        "2026-03-02": 10,
        "2026-03-03": 10,
        "2026-03-04": 10,
        "2026-03-05": 11,
        "2026-03-06": 11,
      }),
      quote("USD", "BRL", { "2026-03-02": 5, "2026-03-06": 5 }),
      quote("BTC", "USD", {
        "2026-03-02": 10,
        "2026-03-03": 40,
        "2026-03-04": 20,
        "2026-03-05": 20,
        "2026-03-06": 20,
      }),
    ),
    [],
    "all",
    null,
    NOW,
  );
  near(byDate(r, "2026-03-03").portfolio, 0, "antes da referência");
  near(byDate(r, "2026-03-03").value, 100, "sem BTC antes da referência");
  near(byDate(r, "2026-03-04").portfolio, 0, "entra pelo mercado, sem ganho");
  near(byDate(r, "2026-03-04").value, 200, "10 × 10 + 1 × 20 × 5");
  // Dia 5: só WEGE sobe 10%, sobre um saldo total de 200 → +5%.
  near(byDate(r, "2026-03-05").portfolio, 5, "depois da referência");
  assert.deepEqual(r.undated, ["BTC"]);
});

test("dólar: em reais soma preço e câmbio; no filtro americano, só preço", () => {
  const trades = [
    trade("VOO", "buy", "2026-03-02", 1, 100, { currency: "USD" }),
  ];
  const m = market(
    quote("VOO", "USD", { "2026-03-02": 100, "2026-03-06": 110 }),
    quote("USD", "BRL", { "2026-03-02": 5, "2026-03-06": 6 }),
  );
  const brl = historyPerformance(
    portfolio({ tradeHistory: trades }),
    m,
    [],
    "all",
    null,
    NOW,
  );
  near(brl.returnPercent, ((110 * 6) / (100 * 5)) * 100 - 100, "em reais");
  near(brl.invested, 500, "custo pelo câmbio do dia da compra");
  const usd = historyPerformance(
    portfolio({ tradeHistory: trades }),
    m,
    [],
    "us",
    null,
    NOW,
  );
  assert.equal(usd.currency, "USD");
  near(usd.returnPercent, 10, "em dólares");
  near(usd.invested, 100);
});

test("carteira zerada recomeça: uma compra antiga não liga as duas histórias", () => {
  // Ciclo de 2024 encerrado e nova compra em 2026: a curva começa na nova compra.
  const r = historyPerformance(
    portfolio({
      tradeHistory: [
        trade("WEGE3", "buy", "2024-01-02", 1, 5),
        trade("WEGE3", "sell", "2024-06-03", 1, 50),
        trade("WEGE3", "buy", "2026-03-02", 10, 10),
      ],
    }),
    market(
      WEGE({
        "2024-01-02": 5,
        "2024-06-03": 50,
        "2026-03-02": 10,
        "2026-03-06": 11,
      }),
    ),
    [],
    "all",
    null,
    NOW,
  );
  assert.equal(r.startedAt, "2026-03-02");
  assert.equal(r.points[0].date, "2026-03-02");
  near(r.returnPercent, 10);
  near(r.invested, 100, "só o ciclo atual");
});

test("janela reinicia em 0%, com carteira e índices na mesma data", () => {
  const m = market(
    WEGE({ "2026-03-02": 10, "2026-03-04": 11, "2026-03-06": 12.1 }),
    quote("IBOV", "BRL", {
      "2026-03-02": 100,
      "2026-03-04": 110,
      "2026-03-06": 99,
    }),
  );
  const r = historyPerformance(
    portfolio({ tradeHistory: [trade("WEGE3", "buy", "2026-03-02", 10, 10)] }),
    m,
    [
      { date: "2026-03-04", rate: 0.05 },
      { date: "2026-03-05", rate: 0.05 },
      { date: "2026-03-06", rate: 0.05 },
    ],
    "all",
    2,
    NOW,
  );
  assert.equal(r.points[0].date, "2026-03-04");
  near(r.points[0].portfolio, 0, "carteira na base");
  near(r.points[0].ibov, 0, "índice na base");
  near(r.returnPercent, 10, "12,1 / 11");
  near(r.points.at(-1).ibov, -10, "99 / 110");
  near(
    r.points.at(-1).cdi,
    (1.0005 ** 2 - 1) * 100,
    "CDI: início inclusive, fim exclusive",
  );
});

test("CDB sem capital entra pelo saldo e acompanha o CDI contratado", () => {
  const rates = [
    { date: "2026-03-02", rate: 0.1 },
    { date: "2026-03-03", rate: 0.1 },
    { date: "2026-03-04", rate: 0.1 },
    { date: "2026-03-05", rate: 0.1 },
  ];
  const r = historyPerformance(
    portfolio({
      fixedIncome: [
        {
          id: "c",
          name: "CDB",
          cost: null,
          value: 1000,
          date: "2026-03-03",
          updatedAt: "2026-03-03",
          ratePercent: 120,
          index: "CDI",
        },
      ],
    }),
    market(),
    rates,
    "all",
    null,
    NOW,
  );
  assert.equal(r.startedAt, "2026-03-03");
  near(r.points[0].portfolio, 0, "entra sem ganho");
  // Três dias de taxa (03, 04 e 05) a 120% de 0,1% = 0,12% ao dia.
  near(r.returnPercent, (1.0012 ** 3 - 1) * 100, "120% do CDI");
  assert.deepEqual(r.estimatedFixed, ["CDB"]);
});

test("filtro Bitcoin junta BTC e ABTC11", () => {
  const r = historyPerformance(
    portfolio({
      tradeHistory: [
        trade("BTC", "buy", "2026-03-02", 1, 100, { currency: "BRL" }),
        trade("ABTC11", "buy", "2026-03-02", 10, 10),
        trade("WEGE3", "buy", "2026-03-02", 10, 10),
      ],
    }),
    market(
      quote("USD", "BRL", { "2026-03-02": 5, "2026-03-06": 5 }),
      quote("BTC", "USD", { "2026-03-02": 20, "2026-03-06": 22 }),
      quote("ABTC11", "BRL", { "2026-03-02": 10, "2026-03-06": 11 }),
      WEGE({ "2026-03-02": 10, "2026-03-06": 20 }),
    ),
    [],
    "btc",
    null,
    NOW,
  );
  near(r.value, 22 * 5 + 110, "BTC e ABTC11, sem ações");
  near(r.returnPercent, 10, "as ações ficam fora");
});

test("sem cotação histórica, o ativo fica fora e é informado", () => {
  const r = historyPerformance(
    portfolio({
      tradeHistory: [
        trade("WEGE3", "buy", "2026-03-02", 10, 10),
        trade("ITUB4", "buy", "2026-03-02", 10, 10),
      ],
    }),
    market(WEGE({ "2026-03-02": 10, "2026-03-06": 11 })),
    [],
    "all",
    null,
    NOW,
  );
  assert.deepEqual(r.excluded, ["ITUB4"]);
  near(r.returnPercent, 10);
});

test("histórico: lotes pequenos, início pela posição aberta mais antiga", () => {
  assert.deepEqual(historyBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const p = portfolio({
    tradeHistory: [
      trade("WEGE3", "buy", "2022-04-25", 1, 5),
      trade("WEGE3", "sell", "2024-05-27", 1, 9),
      trade("VOO", "buy", "2024-11-04", 1, 100, { currency: "USD" }),
    ],
  });
  // O ciclo encerrado de 2022 não força baixar anos de preços.
  assert.equal(historyStart(p, "2026-03-06"), "2024-11-04");
  // Sem posição antiga, um ano basta para as medidas de risco.
  assert.equal(historyStart(portfolio({}), "2026-03-06"), "2025-03-05");
  const tickers = historySymbols(
    portfolio({
      customAssets: [
        { ticker: "ATIVO3", symbol: "ATIVO3.SA" },
        { ticker: "ANTIGO3", symbol: "ANTIGO3.SA", archived: true },
      ],
    }),
  ).map((s) => s.ticker);
  assert.ok(tickers.includes("ATIVO3") && tickers.includes("USD"));
  assert.ok(
    !tickers.includes("ANTIGO3"),
    "ativo encerrado não baixa histórico",
  );
});

test("dólar histórico usa a PTAX, sem mudar a cotação do minuto", () => {
  const usd = quote("USD", "BRL", { "2026-03-02": 5 });
  const merged = mergeMarket(
    market(usd, WEGE({ "2026-03-02": 10 })),
    {
      WEGE3: {
        history: [],
        priceHistory: [],
        volatility: 20,
        momentum: 1,
        drawdown: -2,
      },
    },
    [{ date: "2026-03-02", close: 5.5 }],
  );
  assert.equal(merged.quotes.USD.price, 5, "cotação atual preservada");
  assert.equal(
    merged.quotes.USD.priceHistory[0].close,
    5.5,
    "histórico oficial",
  );
  assert.equal(merged.quotes.WEGE3.volatility, 20, "medidas vêm do histórico");
  const noPtax = mergeMarket(market(usd), {}, []);
  assert.equal(
    noPtax.quotes.USD.priceHistory[0].close,
    5,
    "sem PTAX, usa o Yahoo",
  );
});

test("S&P 500 em reais soma índice e câmbio; em dólar, só o índice", () => {
  const m = market(
    quote("VOO", "USD", { "2026-03-02": 100, "2026-03-06": 100 }),
    quote("USD", "BRL", { "2026-03-02": 5, "2026-03-06": 6 }),
    quote("SP500", "USD", { "2026-03-02": 1000, "2026-03-06": 1100 }),
  );
  const p = portfolio({
    tradeHistory: [
      trade("VOO", "buy", "2026-03-02", 1, 100, { currency: "USD" }),
    ],
  });
  near(
    historyPerformance(p, m, [], "all", null, NOW).points.at(-1).sp500,
    32,
    "1,1 × 1,2",
  );
  near(historyPerformance(p, m, [], "us", null, NOW).points.at(-1).sp500, 10);
});
