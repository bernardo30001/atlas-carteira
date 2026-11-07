// Recálculo independente do que o README promete. As contas estão nos comentários,
// feitas à mão a partir de valores inventados. Tudo aqui deve passar.
import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationPlan,
  assetPlan,
  metrics,
  positions,
  today,
  totals,
} from "../app/lib/model.ts";
import {
  brDate,
  cdiFactor,
  simulateComposition,
} from "../app/lib/performance.ts";
import { costPerformance } from "../app/lib/cost-performance.ts";
import { datedCost, replayTrades } from "../app/lib/trade-history.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
import {
  income,
  lot,
  market,
  near,
  onlyBrazil,
  portfolio,
  quote,
  series,
  trade,
} from "./fixtures/auditoria.mjs";

const NOW = Date.parse("2026-11-06T18:00:00Z");
const row = (p, m, ticker) => positions(p, m).find((r) => r.ticker === ticker);

test("preço médio: compra parcial e venda reduzem o custo pelo médio", () => {
  // 100×10 + 100×20 = 3000 por 200 (médio 15). Vender 50 deixa 150 × 15 = 2250.
  // Taxas 5 + 5 = 10, reduzidas na mesma proporção (75%) = 7,5.
  const events = [
    trade("WEGE3", "buy", 100, 10, "2026-01-05", { fees: 5 }),
    trade("WEGE3", "buy", 100, 20, "2026-02-02", { fees: 5 }),
    trade("WEGE3", "sell", 50, 30, "2026-03-02"),
  ];
  const balance = replayTrades(events);
  near(balance.quantity, 150, "quantidade");
  near(balance.costNative, 2250, "custo");
  near(balance.feesBRL, 7.5, "taxas");
  near(
    datedCost(events, "2026-03-02", "BRL", null).cost,
    2257.5,
    "datedCost com taxas",
  );
  near(datedCost(events, "2026-01-31", "BRL", null).cost, 1005, "antes da 2ª");
});

test("preço médio: o preço de venda não altera o custo restante", () => {
  const sellAt = (price) =>
    replayTrades([
      trade("WEGE3", "buy", 10, 10, "2026-01-05"),
      trade("WEGE3", "sell", 4, price, "2026-02-02"),
    ]).costNative;
  near(sellAt(1), 60, "venda com prejuízo");
  near(sellAt(100), 60, "venda com lucro");
});

test("preço médio: zerar a posição encerra o ciclo", () => {
  // Novo ciclo: 5 × 20 = 100, sem herança do custo anterior.
  const balance = replayTrades([
    trade("WEGE3", "buy", 10, 10, "2026-01-05"),
    trade("WEGE3", "sell", 10, 12, "2026-02-02"),
    trade("WEGE3", "buy", 5, 20, "2026-03-02"),
  ]);
  near(balance.quantity, 5, "quantidade");
  near(balance.costNative, 100, "custo");
});

test("taxas: entram no custo igual em positions, costPerformance e datedCost", () => {
  // 10 × 10 + 5 de taxa = 105 nos três caminhos.
  const buy = lot("WEGE3", 10, 10, { kind: "buy", fees: 5 });
  const p = portfolio({ transactions: [buy] });
  const m = market(quote("WEGE3", 10));
  near(row(p, m, "WEGE3").primaryCost, 105, "positions");
  near(costPerformance(p, m, "br", 365, NOW).cost, 105, "costPerformance");
  near(
    datedCost(
      [trade("WEGE3", "buy", 10, 10, "2026-01-05", { fees: 5 })],
      "2026-11-06",
      "BRL",
      null,
    ).cost,
    105,
    "datedCost",
  );
});

test("desde o preço médio: (saldo − custo + proventos) / custo, ponderado", () => {
  // WEGE3: 1500 − 1000 + 100 = +600 (+60%). ITUB4: 2700 − 3000 = −300 (−10%).
  // Ponderado: 300 / 4000 = 7,5%. A média simples daria 25% e estaria errada.
  const p = portfolio({
    transactions: [lot("WEGE3", 100, 10), lot("ITUB4", 30, 100)],
    incomes: [income("WEGE3", 100, "2026-06-01")],
  });
  const m = market(quote("WEGE3", 15), quote("ITUB4", 90));
  near(row(p, m, "WEGE3").result, 600, "resultado do ativo");
  near(row(p, m, "ITUB4").result, -300, "resultado do ativo");
  const r = costPerformance(p, m, "br", 365, NOW);
  near(r.cost, 4000, "custo");
  near(r.value, 4200, "saldo");
  near(r.income, 100, "proventos");
  near(r.result, 300, "resultado");
  near(r.returnPercent, 7.5, "percentual");
});

test("proventos: não entram de novo no patrimônio", () => {
  const transactions = [lot("WEGE3", 100, 10)];
  const m = market(quote("WEGE3", 15));
  const without = totals(portfolio({ transactions }), m);
  const withIncome = totals(
    portfolio({ transactions, incomes: [income("WEGE3", 100, "2026-06-01")] }),
    m,
  );
  near(without.value, 1500, "sem provento");
  near(withIncome.value, 1500, "com provento");
  near(withIncome.byGroup.br, 1500, "classe");
});

test("câmbio: custo em USD sem câmbio de compra fica preservado", () => {
  // 10 × 100 = US$ 1000; saldo 10 × 110 = US$ 1100; resultado US$ 100.
  // Consolidado sem câmbio de compra: 1000 × 5,5 = R$ 5500 (estimativa), 10%.
  const p = portfolio({ transactions: [lot("VOO", 10, 100)] });
  const m = market(quote("VOO", 110), quote("USD", 5.5));
  const r = row(p, m, "VOO");
  near(r.primaryCost, 1000, "custo em USD");
  assert.equal(r.cost, null, "custo em BRL pendente");
  near(r.nativeValue, 1100, "saldo em USD");
  near(r.value, 6050, "saldo em BRL");
  near(r.result, 100, "resultado em USD");
  assert.equal(totals(p, m).cost, null, "total em BRL pendente");
  const us = costPerformance(p, m, "us", 365, NOW);
  assert.equal(us.currency, "USD");
  near(us.returnPercent, 10, "grupo em USD");
  assert.equal(us.estimatedFX, false);
  const all = costPerformance(p, m, "all", 365, NOW);
  near(all.cost, 5500, "custo estimado");
  near(all.returnPercent, 10, "sem ganho cambial inventado");
  assert.equal(all.estimatedFX, true);
});

test("câmbio: com câmbio de compra o consolidado inclui o efeito cambial", () => {
  // Custo 1000 × 5 = R$ 5000; saldo 1100 × 5,5 = R$ 6050 = +21% em BRL e +10% em USD.
  const p = portfolio({ transactions: [lot("VOO", 10, 100, { fx: 5 })] });
  const m = market(quote("VOO", 110), quote("USD", 5.5));
  const all = costPerformance(p, m, "all", 365, NOW);
  near(all.cost, 5000, "custo");
  near(all.returnPercent, 21, "em BRL");
  assert.equal(all.estimatedFX, false);
  near(costPerformance(p, m, "us", 365, NOW).returnPercent, 10, "em USD");
});

test("Bitcoin: custo em reais e cotação em dólar", () => {
  // Custo 0,01 × 300000 = R$ 3000; saldo 0,01 × 70000 × 5 = R$ 3500; +16,67%.
  const p = portfolio({
    transactions: [lot("BTC", 0.01, 300000, { currency: "BRL", fx: 1 })],
  });
  const m = market(quote("BTC", 70000), quote("USD", 5));
  const r = row(p, m, "BTC");
  assert.equal(r.primaryCurrency, "BRL");
  near(r.primaryCost, 3000, "custo");
  near(r.value, 3500, "saldo");
  near(
    costPerformance(p, m, "btc", 365, NOW).returnPercent,
    (500 / 3000) * 100,
    "percentual",
  );
});

test("simulação: carteira e referências começam em 0% na mesma data", () => {
  const dates = ["2026-10-01", "2026-10-02", "2026-10-05"];
  const history = (closes) => series(...dates.map((d, i) => [d, closes[i]]));
  const p = portfolio({ transactions: [lot("WEGE3", 10, 10)] });
  const m = market(
    quote("WEGE3", 12, { history: history([10, 11, 12]) }),
    quote("IBOV", 110, { history: history([100, 105, 110]) }),
  );
  const s = simulateComposition(p, m, [], 365, ["ibov"], NOW);
  near(s.points[0].portfolio, 0, "carteira");
  near(s.points[0].ibov, 0, "Ibovespa");
  near(s.points.at(-1).portfolio, 20, "carteira no fim");
  near(s.points.at(-1).ibov, 10, "Ibovespa no fim");
  near(s.coverage, 100, "cobertura");
});

test("volatilidade: desvio amostral de retornos log × √252 e √365", () => {
  // 30 retornos alternando +1% e −1% (log): média 0; variância 30 × 0,01² / 29.
  const closes = [100];
  for (let i = 0; i < 30; i++)
    closes.push(closes[i] * Math.exp(i % 2 ? -0.01 : 0.01));
  const history = closes.map((close, i) => ({ date: String(i), close }));
  const sample = Math.sqrt((30 * 0.01 ** 2) / 29);
  near(metrics(history).volatility, sample * Math.sqrt(252) * 100, "√252");
  near(metrics(history, 365).volatility, sample * Math.sqrt(365) * 100, "√365");
});

test("queda máxima: do pico até o fundo", () => {
  // Pico 120, fundo 90: −25%. A queda posterior de 110 a 100 é menor e não conta.
  const closes = [100, 120, 90, 110, 100, ...Array(30).fill(105)];
  const history = closes.map((close, i) => ({ date: String(i), close }));
  near(metrics(history).drawdown, -25, "queda máxima");
});

test("tendência: 126 pregões, ou 183 dias para Bitcoin", () => {
  // 100, 101, … 299. Último 299; 126 antes 173; 183 antes 116.
  const history = Array.from({ length: 200 }, (_, i) => ({
    date: String(i),
    close: 100 + i,
  }));
  near(metrics(history).momentum, (299 / 173 - 1) * 100, "126");
  near(metrics(history, 365).momentum, (299 / 116 - 1) * 100, "183");
  assert.equal(metrics(history.slice(0, 100)).momentum, null);
  assert.equal(metrics(history.slice(0, 29)).volatility, null);
});

test("planejador: déficits por classe e soma igual ao aporte", () => {
  // Patrimônio 1000 + aporte 1000 = 2000. Alvos 700, 700, 440, 160.
  // Déficits: Brasil 0 (já 1000), RF 700, exterior 440, cripto 160; soma 1300.
  const p = portfolio({ transactions: [lot("WEGE3", 100, 10)] });
  const plan = allocationPlan(p, market(quote("WEGE3", 10)), 1000);
  const amount = (group) => plan.find((g) => g.group === group).amount;
  near(amount("br"), 0, "classe acima da meta");
  near(amount("rf"), (1000 * 700) / 1300, "renda fixa");
  near(amount("etf"), (1000 * 440) / 1300, "exterior");
  near(amount("crypto"), (1000 * 160) / 1300, "cripto");
  near(
    plan.reduce((s, g) => s + g.amount, 0),
    1000,
    "soma",
  );
});

test("planejador: cotas inteiras na B3 e frações no exterior e em BTC", () => {
  // Só Brasil: R$ 100 por WEGE3 a 33 = 3 cotas (99).
  const targets = { br: 100, rf: 0, etf: 0, crypto: 0 };
  const b3 = assetPlan(
    portfolio({ targets, weights: onlyBrazil("WEGE3") }),
    market(quote("WEGE3", 33)),
    100,
  );
  assert.equal(b3.length, 1);
  assert.equal(b3[0].quantity, 3);
  near(b3[0].executable, 99, "executável");
  near(b3[0].amount, 100, "orçamento");
  // Exterior: R$ 100 / (US$ 7 × 5) = 2,857142 cotas, até 6 casas.
  const voo = assetPlan(
    portfolio({
      targets: { br: 0, rf: 0, etf: 100, crypto: 0 },
      weights: { SPHQ: 0, VEA: 0, VNQ: 0, IAU: 0, VWO: 0 },
    }),
    market(quote("VOO", 7), quote("USD", 5)),
    100,
  );
  assert.equal(voo[0].quantity, 2.857142);
  // BTC: R$ 100 / (US$ 70000 × 5) = 0,00028571 BTC, até 8 casas.
  const btc = assetPlan(
    portfolio({
      targets: { br: 0, rf: 0, etf: 0, crypto: 100 },
      weights: { ABTC11: 0 },
    }),
    market(quote("BTC", 70000), quote("USD", 5)),
    100,
  );
  assert.equal(btc[0].quantity, 0.00028571);
});

test("planejador: peso zero fica fora e a classe preserva o valor", () => {
  const targets = { br: 100, rf: 0, etf: 0, crypto: 0 };
  const plan = assetPlan(
    portfolio({ targets, weights: onlyBrazil("WEGE3", "ITUB4") }),
    market(quote("WEGE3", 10), quote("ITUB4", 10)),
    1000,
  );
  assert.deepEqual(plan.map((x) => x.ticker).sort(), ["ITUB4", "WEGE3"]);
  near(
    plan.reduce((s, x) => s + x.amount, 0),
    1000,
    "soma da classe",
  );
});

test("validação: metas somam 100% e B3 usa quantidades inteiras", () => {
  const base = portfolio();
  assert.equal(portfolioSchema.safeParse(base).success, true);
  assert.equal(
    portfolioSchema.safeParse({
      ...base,
      targets: { br: 35, rf: 35, etf: 22, crypto: 7 },
    }).success,
    false,
  );
  assert.equal(
    portfolioSchema.safeParse({
      ...base,
      transactions: [lot("WEGE3", 1.5, 10)],
    }).success,
    false,
  );
});

test("fuso: datas seguem America/Sao_Paulo", (t) => {
  // 01:00 UTC do dia 7 ainda são 22:00 do dia 6 em Brasília.
  assert.equal(brDate(new Date("2026-11-07T01:00:00Z")), "2026-11-06");
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-07T01:00:00Z"),
  });
  assert.equal(today(), "2026-11-06");
});

test("dias sem pregão: a curva repete o último fechamento", () => {
  // Compra no sábado 07/11. O último fechamento é 12 (sexta): 10 × 12 / 100 = +20%.
  const p = portfolio({
    transactions: [lot("WEGE3", 10, 10, { kind: "buy", date: "2026-11-07" })],
  });
  const m = market(
    quote("WEGE3", 12, {
      priceHistory: series(["2026-11-05", 11], ["2026-11-06", 12]),
    }),
  );
  const r = costPerformance(p, m, "br", 30, Date.parse("2026-11-08T18:00:00Z"));
  assert.deepEqual(
    r.points.map((x) => x.date),
    ["2026-11-07", "2026-11-08"],
  );
  near(r.points[0].portfolio, 20, "sábado");
  near(r.points[1].portfolio, 20, "domingo");
});

test("cotação ausente ou desatualizada: nada é presumido", () => {
  const p = portfolio({
    transactions: [lot("WEGE3", 10, 10), lot("VOO", 10, 100)],
  });
  const missing = totals(p, market(quote("WEGE3", 10), quote("USD", 5)));
  assert.deepEqual(
    missing.missing.map((a) => a.ticker),
    ["VOO"],
  );
  assert.deepEqual(allocationPlan(p, market(quote("WEGE3", 10)), 1000), []);
  const staleQuote = market(
    quote("WEGE3", 10, { stale: true }),
    quote("VOO", 100),
    quote("USD", 5),
  );
  assert.equal(row(p, staleQuote, "WEGE3").value, null, "cotação antiga");
  const staleFx = market(
    quote("WEGE3", 10),
    quote("VOO", 100),
    quote("USD", 5, { stale: true }),
  );
  assert.equal(row(p, staleFx, "VOO").value, null, "câmbio antigo");
  near(row(p, staleFx, "VOO").nativeValue, 1000, "saldo em USD preservado");
  const partial = costPerformance(p, staleQuote, "all", 365, NOW);
  assert.ok(partial.excluded.some((x) => x.startsWith("WEGE3")));
});

test("divisões por zero e posições zeradas", () => {
  const empty = portfolio();
  const m = market();
  const t = totals(empty, m);
  assert.equal(t.value, 0);
  assert.equal(t.missing.length, 0);
  assert.ok(t.rows.every((r) => r.quantity === 0 && r.average === 0));
  assert.deepEqual(allocationPlan(empty, m, 0), []);
  const r = costPerformance(empty, m, "all", 365, NOW);
  assert.equal(r.returnPercent, undefined);
  assert.deepEqual(r.points, []);
  assert.equal(simulateComposition(empty, m, [], 30, [], NOW).points.length, 0);
  const flat = Array.from({ length: 30 }, (_, i) => ({
    date: String(i),
    close: 10,
  }));
  assert.equal(metrics(flat).volatility, 0);
  assert.equal(metrics(flat).drawdown, 0);
});
