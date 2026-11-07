// Divergências listadas no REVISAO.md. Cada teste afirma o valor CORRETO: todos falhavam
// antes das correções e agora protegem contra a volta do erro. A mensagem de falha mostra
// o valor exibido e o correto. Todos os valores são inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { assetPlan, positions, totals } from "../app/lib/model.ts";
import { percent, tone } from "../app/lib/format.ts";
import { cdiFactor, simulateComposition } from "../app/lib/performance.ts";
import { costPerformance } from "../app/lib/cost-performance.ts";
import { purchasesForPoints, replayTrades } from "../app/lib/trade-history.ts";
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
const dashboard = readFileSync(
  new URL("../app/ui/dashboard.tsx", import.meta.url),
  "utf8",
);

// market-server importa "./model" sem extensão, como o bundler permite.
registerHooks({
  resolve(specifier, context, next) {
    return next(
      /^\.{1,2}\/[^.]+$/.test(specifier) ? specifier + ".ts" : specifier,
      context,
    );
  },
});

// Formato real da API do Yahoo para USD/BRL. No horário de verão britânico a barra
// diária começa às 23:00 UTC do dia anterior; gmtoffset informa só o offset atual.
const londonBars = [
  Date.UTC(2026, 6, 5, 23) / 1000, // segunda 06/07 em Londres
  Date.UTC(2026, 6, 6, 23) / 1000, // terça 07/07 em Londres
];
const realFetch = globalThis.fetch;
globalThis.fetch = async () =>
  Response.json({
    chart: {
      result: [
        {
          meta: {
            currency: "BRL",
            regularMarketPrice: 5.5,
            regularMarketTime: londonBars.at(-1),
            exchangeTimezoneName: "Europe/London",
            gmtoffset: 0,
          },
          timestamp: londonBars,
          indicators: {
            quote: [{ close: [5.4, 5.5] }],
            adjclose: [{ adjclose: [5.4, 5.5] }],
          },
        },
      ],
    },
  });
const { loadMarket, loadHistories } =
  await import("../app/lib/market-server.ts");
const fetched = await loadMarket();
const fetchedHistory = await loadHistories(
  [{ ticker: "USD", symbol: "BRL=X" }],
  "2026-07-01",
);
globalThis.fetch = realFetch;

// ---------------------------------------------------------------- CRÍTICO

test("C1 venda registrada no histórico reduz patrimônio e custo", () => {
  // Compra 100 a 10, vende 40. Restam 60: saldo 60 × 15 = 900 e custo 600.
  const id = crypto.randomUUID();
  const p = portfolio({
    transactions: [
      lot("WEGE3", 100, 10, { id, kind: "buy", date: "2026-03-02" }),
    ],
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-03-02", { id }),
      trade("WEGE3", "sell", 40, 12, "2026-06-01"),
    ],
  });
  const m = market(quote("WEGE3", 15));
  near(row(p, m, "WEGE3").quantity, 60, "quantidade");
  near(totals(p, m).value, 900, "patrimônio");
  near(row(p, m, "WEGE3").primaryCost, 600, "custo");
});

test("C2 provento de ciclo encerrado fica fora do resultado atual", () => {
  // Ciclo antigo: 100 cotas, recebeu 500 e vendeu tudo. Ciclo atual: 10 × 10, preço 10.
  // O README diz que ciclos encerrados ficam fora: resultado 0 (0%), não +500 (+500%).
  const p = portfolio({
    transactions: [lot("WEGE3", 10, 10, { date: "2026-09-01" })],
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-01-05"),
      trade("WEGE3", "sell", 100, 12, "2026-03-02"),
      trade("WEGE3", "buy", 10, 10, "2026-09-01"),
    ],
    incomes: [income("WEGE3", 500, "2026-02-10")],
  });
  const m = market(quote("WEGE3", 10));
  near(row(p, m, "WEGE3").result, 0, "resultado do ativo");
  near(
    costPerformance(p, m, "br", 365, NOW).returnPercent,
    0,
    "rendimento acumulado",
  );
});

// -------------------------------------------------------------- IMPORTANTE

test("I1 curva não some quando há ciclo encerrado e posição inicial", () => {
  // Ciclo antigo encerrado; posição atual 50 × 20 = 1000; saldo 50 × 30 = 1500: +50%.
  const p = portfolio({
    transactions: [lot("WEGE3", 50, 20, { date: "2026-10-01" })],
    tradeHistory: [
      trade("WEGE3", "buy", 10, 10, "2026-01-05"),
      trade("WEGE3", "sell", 10, 12, "2026-02-02"),
    ],
  });
  const m = market(
    quote("WEGE3", 30, {
      priceHistory: series(["2026-10-30", 28], ["2026-11-06", 30]),
    }),
  );
  const r = costPerformance(p, m, "br", 365, NOW);
  near(r.returnPercent, 50, "acumulado");
  near(r.points.at(-1)?.portfolio, 50, "último ponto da curva");
});

test("I2 curva termina no mesmo valor do acumulado com histórico parcial", () => {
  // Saldo inicial de 50 mais compra posterior de 10: a curva deve enxergar as 60.
  const id = crypto.randomUUID();
  const p = portfolio({
    transactions: [
      lot("WEGE3", 50, 20, { date: "2026-01-05" }),
      lot("WEGE3", 10, 10, { id, kind: "buy", date: "2026-06-01" }),
    ],
    tradeHistory: [trade("WEGE3", "buy", 10, 10, "2026-06-01", { id })],
  });
  const m = market(
    quote("WEGE3", 30, {
      priceHistory: series(["2026-10-30", 28], ["2026-11-06", 30]),
    }),
  );
  const r = costPerformance(p, m, "br", 365, NOW);
  near(r.points.at(-1)?.portfolio, r.returnPercent, "último ponto da curva");
});

test("I4 datas de USD/BRL seguem o fuso da bolsa, sem adiantar o câmbio", () => {
  // 150 de 262 barras reais vêm às 23:00 UTC. Em UTC, a segunda vira domingo.
  assert.equal(fetchedHistory.items.USD.history[0].date, "2026-07-06");
});

test("I5 preço médio inclui as taxas, como o custo exibido ao lado", () => {
  // 10 × 10 + 5 de taxa = 105. PM 10,50, não 10,00 (R$ 100 ≠ investido R$ 105).
  const p = portfolio({ transactions: [lot("WEGE3", 10, 10, { fees: 5 })] });
  const r = row(p, market(quote("WEGE3", 12)), "WEGE3");
  near(r.primaryCost, 105, "investido");
  near(r.average, 10.5, "preço médio");
});

test("I6 taxa sem câmbio não apaga o custo em dólar do grupo", () => {
  // US$ 1000 + R$ 5 / 5 = US$ 1001, igual ao que costPerformance já calcula.
  const p = portfolio({
    transactions: [lot("VOO", 10, 100, { fees: 5 }), lot("IAU", 1, 100)],
  });
  const m = market(quote("VOO", 110), quote("IAU", 100), quote("USD", 5));
  const r = row(p, m, "VOO");
  near(r.primaryCost, 1001, "custo em USD");
  near(r.result, 99, "resultado em USD");
  near(totals(p, m).international.cost, 1101, "custo do grupo");
  near(
    costPerformance(p, m, "us", 365, NOW).cost,
    1101,
    "mesmo custo na curva",
  );
});

test("I7 donut não mostra patrimônio parcial como total", () => {
  // Medido na tela: cartão "Aguardando cotações" e donut "R$ 4.000,00" sem VOO.
  const center = dashboard.slice(
    dashboard.indexOf('"PATRIMÔNIO"'),
    dashboard.indexOf("4 classes de ativos"),
  );
  assert.match(
    center,
    /missing/,
    "dashboard.tsx: centro do donut sem proteção",
  );
});

test("I8 venda listada antes da compra no mesmo dia é aceita", () => {
  // A ordem das linhas num mesmo dia não é cronológica nos relatórios.
  const events = [
    trade("WEGE3", "sell", 10, 12, "2026-03-02"),
    trade("WEGE3", "buy", 10, 10, "2026-03-02"),
  ];
  assert.doesNotThrow(() => replayTrades(events));
  assert.equal(
    portfolioSchema.safeParse(portfolio({ tradeHistory: events })).success,
    true,
    "validação recusa a carteira inteira",
  );
});

test("I9 sugestão não usa câmbio desatualizado", () => {
  // Sem posição em dólar nada bloqueia o plano, mas assetPlan aceita USD stale.
  const p = portfolio({
    targets: { br: 0, rf: 0, etf: 100, crypto: 0 },
    weights: { SPHQ: 0, VEA: 0, VNQ: 0, IAU: 0, VWO: 0 },
  });
  const m = market(quote("VOO", 100), quote("USD", 5, { stale: true }));
  const voo = assetPlan(p, m, 1000).find((x) => x.ticker === "VOO");
  assert.equal(
    voo.quantity,
    0,
    `quantidade: exibido ${voo.quantity}, correto 0`,
  );
});

test("I10 carteira não mostra proventos vazios enquanto carrega", () => {
  // Medido na tela: "Seus proventos aparecerão aqui" durante o carregamento.
  const before = dashboard.slice(
    dashboard.lastIndexOf("{", dashboard.indexOf("<IncomePanel")) - 80,
    dashboard.indexOf("<IncomePanel"),
  );
  assert.match(before, /portfolioReady/, "dashboard.tsx: painel sem proteção");
});

// ---------------------------------------------------------------- MELHORIA

test("M1 pontos de compra deixam de fora ciclos encerrados", () => {
  // A tela afirma "Posições e ciclos encerrados ficam fora".
  const p = portfolio({
    transactions: [lot("WEGE3", 10, 10, { date: "2026-09-01" })],
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-01-05"),
      trade("WEGE3", "sell", 100, 12, "2026-03-02"),
      trade("WEGE3", "buy", 10, 10, "2026-09-01"),
    ],
  });
  const marked = purchasesForPoints(p, [
    { date: "2026-01-05", time: 1 },
    { date: "2026-09-01", time: 2 },
  ]);
  const count = marked.flatMap((x) => x.purchases).length;
  assert.equal(count, 1, `compras marcadas: exibido ${count}, correto 1`);
});

test("M2 totals.result segue a mesma fórmula, com proventos", () => {
  // 1500 − 1000 + 100 = 600. Hoje dá 500. Sem uso na interface: corrigir ou remover.
  const p = portfolio({
    transactions: [lot("WEGE3", 100, 10)],
    incomes: [income("WEGE3", 100, "2026-06-01")],
  });
  near(totals(p, market(quote("WEGE3", 15))).result, 600, "resultado");
});

test("M3 volatilidade ausente é neutra, como diz a metodologia", () => {
  // Hoje a ausência vale 0,5, o mesmo que 100% de volatilidade, e reduz o aporte.
  const p = portfolio({
    targets: { br: 100, rf: 0, etf: 0, crypto: 0 },
    weights: onlyBrazil("WEGE3", "ITUB4"),
  });
  const plan = assetPlan(
    p,
    market(quote("WEGE3", 10), quote("ITUB4", 10, { volatility: 30 })),
    1000,
  );
  const amount = (t) => plan.find((x) => x.ticker === t).amount;
  near(amount("WEGE3"), amount("ITUB4"), "aporte sem histórico");
});

test("M4 CDI acumula de início inclusive a fim exclusive", () => {
  // A taxa de D remunera de D até o próximo dia útil. Só importa quando a taxa muda.
  const rates = [
    { date: "2026-11-05", rate: 0.05 },
    { date: "2026-11-06", rate: 0.06 },
  ];
  near(cdiFactor(rates, "2026-11-05", "2026-11-06"), 1.0005, "fator");
});

test("M5 simulação não termina em data futura às 22h de Brasília", () => {
  // Às 22:00 de 06/11 já é dia 07 em UTC: o limite usa toISOString.
  const history = series(
    ["2026-11-05", 70],
    ["2026-11-06", 71],
    ["2026-11-07", 72],
  );
  const s = simulateComposition(
    portfolio({ transactions: [lot("BTC", 1, 100, { fx: 5 })] }),
    market(
      quote("BTC", 72, { history }),
      quote("USD", 5, { history: history.map((x) => ({ ...x, close: 5 })) }),
    ),
    [],
    30,
    [],
    Date.parse("2026-11-07T01:00:00Z"),
    "btc",
  );
  assert.ok(s.end <= "2026-11-06", `fim: exibido ${s.end}, correto 2026-11-06`);
});

test("M6 percentual arredondado a zero não exibe sinal", () => {
  assert.equal(percent(-0.001), "0,00%");
  assert.equal(percent(1.5), "+1,50%");
  assert.equal(percent(-1.5), "-1,50%");
  assert.equal(tone(-0.001), "neutral");
  assert.equal(tone(0), "neutral");
  assert.equal(tone(0.01), "positive");
  assert.equal(tone(-0.01), "negative");
});

test("M7 cotação antiga é identificada", () => {
  // Só falhas de rede marcam stale. Um preço de julho passa como se fosse atual.
  assert.equal(fetched.quotes.USD.outdated, true);
});

test("M8 metodologia não repete metas fixas no texto", () => {
  // O texto afirma "conforme você definiu" mesmo depois de editar as metas.
  assert.doesNotMatch(
    dashboard,
    /Brasil 35%, renda fixa 35%, exterior 22% e Bitcoin 8%/,
  );
});

// ------------------------------------------------------- DECISÃO D2 (aprovada)

test("D2 venda parcial reduz os proventos na mesma proporção do custo", () => {
  // Compra 100 a 10, recebe 100, vende 90. Restam 10: custo 100, saldo 100.
  // Sem a regra seriam 100 de provento sobre 100 de custo (+100%). Com ela, 10 (+10%).
  const p = portfolio({
    transactions: [lot("WEGE3", 10, 10, { date: "2026-06-01" })],
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-01-05"),
      trade("WEGE3", "sell", 90, 12, "2026-06-01"),
    ],
    incomes: [income("WEGE3", 100, "2026-03-02")],
  });
  near(
    costPerformance(p, market(quote("WEGE3", 10)), "br", 365, NOW)
      .returnPercent,
    10,
    "rendimento acumulado",
  );
});
