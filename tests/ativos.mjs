// Modelo novo: ativos cadastrados, FIIs, eventos societários, taxas em dólar e backups
// antigos. Contas à mão nos comentários. Todos os valores são inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  allocationPlan,
  assetOf,
  assetPlan,
  positions,
  totals,
} from "../app/lib/model.ts";
import { performancePortfolio } from "../app/lib/performance.ts";
import { costPerformance } from "../app/lib/cost-performance.ts";
import {
  datedTrades,
  migratePortfolio,
  PORTFOLIO_SCHEMA,
  realizedResults,
} from "../app/lib/trade-history.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
import {
  income,
  lot,
  market,
  near,
  portfolio,
  quote,
  series,
  trade,
} from "./fixtures/auditoria.mjs";

registerHooks({
  resolve(specifier, context, next) {
    return next(
      /^\.{1,2}\/[^.]+$/.test(specifier) ? specifier + ".ts" : specifier,
      context,
    );
  },
});
const NOW = Date.parse("2026-11-06T18:00:00Z");
const row = (p, m, ticker) => positions(p, m).find((r) => r.ticker === ticker);
const v4 = (extra) => portfolio({ schemaVersion: PORTFOLIO_SCHEMA, ...extra });
const action = (ticker, kind, date, extra = {}) => ({
  id: crypto.randomUUID(),
  ticker,
  kind,
  date,
  ...extra,
});
const FII = {
  ticker: "HGLG11",
  symbol: "HGLG11.SA",
  name: "Fundo fictício",
  group: "br",
  currency: "BRL",
  sector: "FII",
  color: "#626b99",
  query: "HGLG11",
  segment: "fii",
};

test("ativo cadastrado vira posição, com cotação e validação", () => {
  const p = v4({
    customAssets: [FII],
    tradeHistory: [trade("HGLG11", "buy", 10, 100, "2026-03-02")],
  });
  const m = market(quote("HGLG11", 120));
  assert.equal(assetOf(p, "HGLG11").name, "Fundo fictício");
  near(row(p, m, "HGLG11").value, 1200, "saldo");
  near(totals(p, m).byGroup.br, 1200, "meta Brasil");
  assert.equal(portfolioSchema.safeParse(p).success, true);
});

test("ativo desconhecido é recusado com o código no erro", () => {
  const p = v4({
    tradeHistory: [trade("HGLG11", "buy", 10, 100, "2026-03-02")],
  });
  const parsed = portfolioSchema.safeParse(p);
  assert.equal(parsed.success, false);
  assert.ok(parsed.error.issues.some((i) => i.message.includes("HGLG11")));
});

test("cadastro recusa duplicata, colisão e símbolo inválido", () => {
  const parse = (customAssets) =>
    portfolioSchema.safeParse(v4({ customAssets })).success;
  assert.equal(parse([FII]), true);
  assert.equal(parse([FII, FII]), false);
  assert.equal(parse([{ ...FII, ticker: "WEGE3" }]), false);
  assert.equal(parse([{ ...FII, symbol: "X/../Y" }]), false);
});

test("FII entra na meta Brasil, mas não em Ações na B3", () => {
  const p = v4({
    customAssets: [FII],
    transactions: [lot("WEGE3", 10, 10)],
    tradeHistory: [trade("HGLG11", "buy", 10, 100, "2026-03-02")],
  });
  const m = market(quote("HGLG11", 120), quote("WEGE3", 10));
  const t = totals(p, m);
  near(t.brazilFiis.value, 1200, "FIIs");
  assert.equal(t.brazilFiis.count, 1);
  near(t.brazilStocks.value, 100, "ações");
  near(t.byGroup.br, 1300, "meta Brasil");
  assert.equal(performancePortfolio(p, "br").tradeHistory.length, 0);
  // Ações: 100 de custo e 100 de saldo. O FII fica só no consolidado.
  near(costPerformance(p, m, "br", 365, NOW).cost, 100, "ações na B3");
  near(costPerformance(p, m, "all", 365, NOW).cost, 1100, "consolidado");
});

test("ativo encerrado não exige cotação nem recebe aporte", () => {
  const p = v4({
    customAssets: [{ ...FII, archived: true }],
    targets: { br: 100, rf: 0, etf: 0, crypto: 0 },
    tradeHistory: [
      trade("HGLG11", "buy", 10, 100, "2026-03-02"),
      trade("HGLG11", "sell", 10, 120, "2026-06-01"),
    ],
  });
  const m = market(quote("WEGE3", 10));
  assert.equal(totals(p, m).missing.length, 0);
  assert.ok(
    !assetPlan(p, m, 1000).some((x) => x.ticker === "HGLG11"),
    "fora do plano",
  );
  assert.ok(allocationPlan(p, m, 1000).length > 0);
  near(realizedResults(p).BRL.result, 200, "lucro preservado");
});

test("desdobramento multiplica cotas e preserva o custo", () => {
  // 100 a 10 = 1000. 1 vira 2: 200 cotas, PM 5. Vende 50: restam 150, custo 750.
  // Lucro: 50 × 6 − 250 = 50.
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-01-05"),
      trade("WEGE3", "sell", 50, 6, "2026-06-01"),
    ],
    corporateActions: [action("WEGE3", "split", "2026-03-02", { factor: 2 })],
  });
  const r = row(p, market(quote("WEGE3", 6)), "WEGE3");
  near(r.quantity, 150, "quantidade");
  near(r.primaryCost, 750, "custo");
  near(r.average, 5, "preço médio");
  near(realizedResults(p).BRL.result, 50, "realizado");
  assert.equal(portfolioSchema.safeParse(p).success, true);
});

test("grupamento reduz cotas e sobe o preço médio", () => {
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 100, 1, "2026-01-05")],
    corporateActions: [action("WEGE3", "split", "2026-03-02", { factor: 0.5 })],
  });
  const r = row(p, market(quote("WEGE3", 3)), "WEGE3");
  near(r.quantity, 50, "quantidade");
  near(r.primaryCost, 100, "custo");
  near(r.average, 2, "preço médio");
});

test("evento pode vir em cotas creditadas, como no extrato", () => {
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 100, 10, "2026-01-05")],
    corporateActions: [action("WEGE3", "split", "2026-03-02", { delta: 100 })],
  });
  const r = row(p, market(quote("WEGE3", 6)), "WEGE3");
  near(r.quantity, 200, "quantidade");
  near(r.primaryCost, 1000, "custo");
});

test("bonificação soma cotas ao custo unitário informado", () => {
  // 100 a 10 = 1000. 10% a R$ 5: 10 cotas por 50. Total 110 cotas, custo 1050.
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 100, 10, "2026-01-05")],
    corporateActions: [
      action("WEGE3", "bonus", "2026-03-02", { factor: 0.1, unitCost: 5 }),
    ],
  });
  const r = row(p, market(quote("WEGE3", 10)), "WEGE3");
  near(r.quantity, 110, "quantidade");
  near(r.primaryCost, 1050, "custo");
});

test("troca de ticker leva histórico e proventos para o código novo", () => {
  // 10 a 10 e R$ 20 de provento, tudo no código antigo. Saldo 150: resultado 70.
  const p = v4({
    tradeHistory: [trade("XPTO3", "buy", 10, 10, "2026-01-05")],
    incomes: [income("XPTO3", 20, "2026-02-02", { currency: "BRL", fx: 1 })],
    corporateActions: [
      action("XPTO3", "rename", "2026-03-02", { newTicker: "WEGE3" }),
    ],
  });
  const r = row(p, market(quote("WEGE3", 15)), "WEGE3");
  near(r.quantity, 10, "quantidade");
  near(r.primaryCost, 100, "custo");
  near(r.result, 70, "resultado");
  assert.deepEqual(
    datedTrades(p).map((e) => e.ticker),
    ["WEGE3"],
  );
  assert.equal(portfolioSchema.safeParse(p).success, true);
});

test("curva reexpressa quantidades antigas no preço ajustado por desdobramento", () => {
  // O histórico já vem dividido por 2. Em 02/03: 100 × 2 × 6 = 1200 sobre 1000 (+20%).
  // Hoje: 200 × 7 = 1400 (+40%). Sem o ajuste, o ponto antigo mostraria −40%.
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 100, 10, "2026-01-05")],
    corporateActions: [action("WEGE3", "split", "2026-06-01", { factor: 2 })],
  });
  const m = market(
    quote("WEGE3", 7, {
      priceHistory: series(["2026-03-02", 6], ["2026-11-06", 7]),
    }),
  );
  const r = costPerformance(p, m, "br", 365, NOW);
  near(r.points.find((x) => x.date === "2026-03-02").portfolio, 20, "antes");
  near(r.points.at(-1).portfolio, 40, "hoje");
  near(r.returnPercent, 40, "acumulado");
});

test("taxa em dólar não passa por câmbio", () => {
  // US$ 1000 + US$ 1 = 1001. Com câmbio 5, em reais: 5005.
  const noFx = v4({
    transactions: [lot("VOO", 10, 100, { fees: 1, feesCurrency: "USD" })],
  });
  const m = market(quote("VOO", 110), quote("USD", 5));
  near(row(noFx, m, "VOO").primaryCost, 1001, "em dólar");
  assert.equal(row(noFx, m, "VOO").costEstimated, false);
  assert.equal(row(noFx, m, "VOO").cost, null, "câmbio de compra pendente");
  near(costPerformance(noFx, m, "us", 365, NOW).cost, 1001, "na curva");
  const withFx = v4({
    transactions: [
      lot("VOO", 10, 100, { fees: 1, feesCurrency: "USD", fx: 5 }),
    ],
  });
  near(row(withFx, m, "VOO").cost, 5005, "em reais");
  near(costPerformance(withFx, m, "all", 365, NOW).cost, 5005, "consolidado");
});

test("backup antigo da versão 3 continua válido e é migrado", () => {
  const backup = JSON.parse(
    JSON.stringify({
      transactions: [lot("WEGE3", 10, 10)],
      fixedIncome: [],
      targets: { br: 35, rf: 35, etf: 22, crypto: 8 },
      weights: {},
      incomes: [income("WEGE3", 5, "2026-02-02")],
      statements: [],
    }),
  );
  const parsed = portfolioSchema.parse(backup);
  assert.equal(parsed.schemaVersion, undefined);
  const migrated = migratePortfolio(parsed);
  assert.equal(migrated.schemaVersion, PORTFOLIO_SCHEMA);
  assert.equal(portfolioSchema.safeParse(migrated).success, true);
  near(
    row(migrated, market(quote("WEGE3", 10)), "WEGE3").result,
    5,
    "mesmo resultado",
  );
});

test("campos novos sobrevivem à validação", () => {
  const p = v4({
    customAssets: [FII],
    tradeHistory: [
      trade("HGLG11", "buy", 10, 100, "2026-03-02", {
        institution: "BTG",
        importKey: "chave",
        source: "b3-negociacao|BTG|2026-11-06",
        feesCurrency: "BRL",
      }),
    ],
    incomes: [
      income("HGLG11", 5, "2026-04-01", {
        source: "b3-movimentacao|BTG|2026-11-06",
        institution: "BTG",
        importKey: "chave-2",
        type: "yield",
        withheldTax: 1,
      }),
    ],
    corporateActions: [action("HGLG11", "split", "2026-05-02", { factor: 2 })],
  });
  const parsed = portfolioSchema.parse(p);
  assert.equal(parsed.tradeHistory[0].institution, "BTG");
  assert.equal(parsed.incomes[0].source, "b3-movimentacao|BTG|2026-11-06");
  assert.equal(parsed.incomes[0].withheldTax, 1);
  assert.equal(parsed.corporateActions[0].factor, 2);
  assert.equal(parsed.customAssets[0].segment, "fii");
});

test("cotações incluem os ativos cadastrados e filtram o que vem do navegador", async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (String(url).includes("FALHA")) return new Response("", { status: 404 });
    const t = Math.floor(Date.now() / 1000);
    return Response.json({
      chart: {
        result: [
          {
            meta: {
              currency: "BRL",
              regularMarketPrice: 120,
              regularMarketTime: t,
              exchangeTimezoneName: "America/Sao_Paulo",
            },
            timestamp: [t],
            indicators: { quote: [{ close: [120] }] },
          },
        ],
      },
    });
  };
  try {
    const { loadMarket, parseExtraAssets } =
      await import("../app/lib/market-server.ts");
    assert.deepEqual(
      parseExtraAssets("HGLG11:HGLG11.SA,../x:y,ABC:,OK11:OK11.SA"),
      [
        { ticker: "HGLG11", symbol: "HGLG11.SA" },
        { ticker: "OK11", symbol: "OK11.SA" },
      ],
    );
    assert.equal(
      parseExtraAssets(
        Array.from({ length: 60 }, (_, i) => `AA${i}:AA${i}`).join(","),
      ).length,
      40,
      "limite",
    );
    const m = await loadMarket([
      { ticker: "HGLG11", symbol: "HGLG11.SA" },
      { ticker: "FALHA3", symbol: "FALHA3.SA" },
    ]);
    assert.equal(m.quotes.HGLG11.price, 120);
    assert.equal(m.quotes.WEGE3.price, 120, "lista padrão preservada");
    assert.equal(m.quotes.FALHA3, undefined);
    assert.ok(m.errors.includes("FALHA3"));
    assert.ok(asked.every((u) => u.includes(".finance.yahoo.com/")));
  } finally {
    globalThis.fetch = realFetch;
  }
});
