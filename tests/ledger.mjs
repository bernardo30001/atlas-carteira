// Fonte única da posição: saldo inicial, movimentações, migração e resultado realizado.
// Contas à mão nos comentários. Todos os valores são inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { positions, totals } from "../app/lib/model.ts";
import { costPerformance } from "../app/lib/cost-performance.ts";
import {
  attributeIncomes,
  datedTrades,
  hasHolding,
  ledgerFor,
  migratePortfolio,
  migrationChanges,
  PORTFOLIO_SCHEMA,
  realizedResults,
  replayLedger,
  saleIssue,
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

const NOW = Date.parse("2026-11-06T18:00:00Z");
const row = (p, m, ticker) => positions(p, m).find((r) => r.ticker === ticker);
const v4 = (extra) => portfolio({ schemaVersion: PORTFOLIO_SCHEMA, ...extra });

test("só movimentações: a posição vem do histórico, sem registros", () => {
  // Compra 100 a 10, vende 40: restam 60 × 15 = 900, custo 600.
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-03-02"),
      trade("WEGE3", "sell", 40, 12, "2026-06-01"),
    ],
  });
  const m = market(quote("WEGE3", 15));
  near(row(p, m, "WEGE3").quantity, 60, "quantidade");
  near(totals(p, m).value, 900, "patrimônio");
  near(row(p, m, "WEGE3").primaryCost, 600, "custo");
  assert.equal(hasHolding(p), true);
});

test("saldo inicial mais venda posterior reduz pelo preço médio", () => {
  // 100 a 10 = 1000. Venda de 25 deixa 75 e custo 750.
  const p = v4({
    transactions: [lot("WEGE3", 100, 10, { date: "2026-01-05" })],
    tradeHistory: [trade("WEGE3", "sell", 25, 20, "2026-06-01")],
  });
  const r = row(p, market(quote("WEGE3", 15)), "WEGE3");
  near(r.quantity, 75, "quantidade");
  near(r.primaryCost, 750, "custo");
});

test("venda no mesmo dia do saldo inicial é aplicada", () => {
  const p = v4({
    transactions: [lot("WEGE3", 100, 10, { date: "2026-06-01" })],
    tradeHistory: [trade("WEGE3", "sell", 25, 20, "2026-06-01")],
  });
  near(row(p, market(quote("WEGE3", 15)), "WEGE3").quantity, 75, "quantidade");
});

test("movimentação anterior ao saldo inicial já está explicada por ele", () => {
  const p = v4({
    transactions: [lot("WEGE3", 50, 20, { date: "2026-10-01" })],
    tradeHistory: [
      trade("WEGE3", "buy", 10, 10, "2026-01-05"),
      trade("WEGE3", "buy", 5, 12, "2026-10-15"),
    ],
  });
  const ledger = ledgerFor(p, "WEGE3");
  assert.equal(ledger.excluded.length, 1);
  // 50 + 5 posteriores; custo 1000 + 60.
  const r = row(p, market(quote("WEGE3", 30)), "WEGE3");
  near(r.quantity, 55, "quantidade");
  near(r.primaryCost, 1060, "custo");
});

test("compra manual registrada soma ao histórico sem duplicar pelo id", () => {
  const id = crypto.randomUUID();
  const p = v4({
    transactions: [
      lot("WEGE3", 10, 10, { id, kind: "buy", date: "2026-03-02" }),
      lot("WEGE3", 5, 10, { kind: "buy", date: "2026-04-01" }),
    ],
    tradeHistory: [trade("WEGE3", "buy", 10, 10, "2026-03-02", { id })],
  });
  near(row(p, market(quote("WEGE3", 10)), "WEGE3").quantity, 15, "quantidade");
  assert.equal(datedTrades(p).length, 2);
});

test("curva acompanha venda e termina no valor do acumulado", () => {
  const p = v4({
    transactions: [lot("WEGE3", 100, 10, { date: "2026-01-05" })],
    tradeHistory: [trade("WEGE3", "sell", 50, 20, "2026-10-30")],
  });
  const m = market(
    quote("WEGE3", 30, {
      priceHistory: series(["2026-10-29", 20], ["2026-11-02", 25]),
    }),
  );
  const r = costPerformance(p, m, "br", 365, NOW);
  // 50 × 30 = 1500, custo 500: +200%.
  near(r.returnPercent, 200, "acumulado");
  near(r.points.at(-1).portfolio, 200, "último ponto");
  // Antes da venda: 100 × 20 / 1000 = +100%.
  near(r.points[0].portfolio, 100, "antes da venda");
});

test("migração marca a posição conciliada e mantém os valores", () => {
  const opening = lot("WEGE3", 10, 10.8, {
    costNative: 108,
    date: "2026-10-28",
  });
  const legacy = portfolio({
    transactions: [opening],
    tradeHistory: [
      trade("WEGE3", "buy", 10, 10, "2026-10-26"),
      trade("WEGE3", "sell", 4, 20, "2026-10-27"),
      trade("WEGE3", "buy", 4, 12, "2026-10-28"),
    ],
  });
  const migrated = migratePortfolio(legacy);
  assert.equal(migrated.schemaVersion, PORTFOLIO_SCHEMA);
  assert.equal(migrated.transactions[0].reconciled, true);
  assert.equal(legacy.transactions[0].reconciled, undefined, "sem mutação");
  assert.equal(migratePortfolio(migrated), migrated, "idempotente");
  assert.deepEqual(migrationChanges(legacy), []);
  const m = market(quote("WEGE3", 14));
  near(row(migrated, m, "WEGE3").primaryCost, 108, "custo igual");
  near(row(legacy, m, "WEGE3").primaryCost, 108, "leitura sem migrar");
  assert.equal(
    portfolioSchema.parse(migrated).transactions[0].reconciled,
    true,
  );
  assert.equal(portfolioSchema.parse(migrated).schemaVersion, PORTFOLIO_SCHEMA);
});

test("depois de migrar, histórico novo não é confundido com conciliação", () => {
  // Saldo de 10 e compra posterior de 10 somam 20, mesmo com quantidades iguais.
  const p = v4({
    transactions: [lot("WEGE3", 10, 10, { date: "2026-01-05" })],
    tradeHistory: [trade("WEGE3", "buy", 10, 12, "2026-03-02")],
  });
  near(row(p, market(quote("WEGE3", 10)), "WEGE3").quantity, 20, "quantidade");
});

test("migração informa quantidades que mudam", () => {
  const legacy = portfolio({
    transactions: [lot("WEGE3", 50, 20, { date: "2026-01-05" })],
    tradeHistory: [trade("WEGE3", "sell", 10, 30, "2026-06-01")],
  });
  assert.deepEqual(migrationChanges(legacy), [
    { ticker: "WEGE3", before: 50, after: 40 },
  ]);
});

test("validação usa o saldo inicial e recusa venda sem cobertura", () => {
  const covered = v4({
    transactions: [lot("WEGE3", 100, 10, { date: "2026-01-05" })],
    tradeHistory: [trade("WEGE3", "sell", 50, 12, "2026-06-01")],
  });
  assert.equal(portfolioSchema.safeParse(covered).success, true);
  const uncovered = v4({
    tradeHistory: [trade("WEGE3", "sell", 50, 12, "2026-06-01")],
  });
  assert.equal(portfolioSchema.safeParse(uncovered).success, false);
});

test("carteira antiga com histórico válido nunca fica impedida de salvar", () => {
  // O saldo não bate com o histórico, mas o histórico sozinho fecha: não bloqueia.
  const p = v4({
    transactions: [lot("WEGE3", 5, 10, { date: "2026-03-02" })],
    tradeHistory: [
      trade("WEGE3", "buy", 10, 10, "2026-01-05"),
      trade("WEGE3", "sell", 8, 12, "2026-06-01"),
    ],
  });
  assert.equal(portfolioSchema.safeParse(p).success, true);
  // E a tela não quebra: a venda excedente zera a posição.
  assert.equal(replayLedger(ledgerFor(p, "WEGE3")).oversold, true);
  near(row(p, market(quote("WEGE3", 10)), "WEGE3").quantity, 0, "quantidade");
});

test("venda manual: saldo e data são conferidos", () => {
  const p = v4({
    transactions: [lot("WEGE3", 100, 10, { date: "2026-06-01" })],
  });
  const sale = (quantity, date) => trade("WEGE3", "sell", quantity, 12, date);
  assert.equal(saleIssue(p, sale(50, "2026-07-01")), null);
  assert.equal(saleIssue(p, sale(100, "2026-06-01")), null);
  assert.match(saleIssue(p, sale(101, "2026-07-01")), /maior que o saldo/);
  assert.match(saleIssue(p, sale(10, "2026-05-01")), /anterior/);
});

test("Bitcoin aceita venda em reais, como a compra", () => {
  const p = v4({
    transactions: [
      lot("BTC", 1, 100000, { currency: "BRL", fx: 1, date: "2026-01-05" }),
    ],
    tradeHistory: [
      trade("BTC", "sell", 0.5, 200000, "2026-06-01", {
        currency: "BRL",
        fx: 1,
      }),
    ],
  });
  assert.equal(portfolioSchema.safeParse(p).success, true);
  near(realizedResults(p).BRL.result, 50000, "lucro");
});

test("proventos: venda reduz na mesma proporção do custo", () => {
  const ledger = ledgerFor(
    v4({
      tradeHistory: [
        trade("WEGE3", "buy", 100, 10, "2026-01-05"),
        trade("WEGE3", "sell", 90, 12, "2026-06-01"),
      ],
    }),
    "WEGE3",
  );
  const paid = income("WEGE3", 100, "2026-03-02");
  const { kept, realized } = attributeIncomes(ledger, [paid]);
  near(kept[0].amount, 10, "fica com a parte em carteira");
  near(realized[0].amount, 90, "vai para o realizado");
  near(
    attributeIncomes(ledger, [paid], "2026-05-01").kept[0].amount,
    100,
    "antes da venda",
  );
  assert.equal(paid.amount, 100, "sem mutação");
});

test("proventos: pagamento depois de zerar pertence ao ciclo encerrado", () => {
  const ledger = ledgerFor(
    v4({
      tradeHistory: [
        trade("WEGE3", "buy", 10, 10, "2026-01-05"),
        trade("WEGE3", "sell", 10, 12, "2026-03-02"),
        trade("WEGE3", "buy", 5, 10, "2026-09-01"),
      ],
    }),
    "WEGE3",
  );
  const { kept, realized } = attributeIncomes(ledger, [
    income("WEGE3", 30, "2026-02-10"),
    income("WEGE3", 20, "2026-04-01"),
    income("WEGE3", 7, "2026-10-01"),
  ]);
  assert.deepEqual(
    kept.map((i) => i.amount),
    [7],
  );
  near(
    realized.reduce((s, i) => s + i.amount, 0),
    50,
    "realizado",
  );
});

test("resultado realizado: ativo encerrado e venda parcial, por moeda", () => {
  // WEGE3: compra 100 × 10 + taxa 10; vende tudo a 15 com taxa 5.
  // 1500 − 5 − 1010 = 485; mais 40 de provento = 525.
  // VOO: compra 10 × 100, vende 5 a 120: 600 − 500 = US$ 100.
  const p = v4({
    transactions: [lot("VOO", 10, 100, { date: "2026-01-05", fx: 5 })],
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-01-05", { fees: 10 }),
      trade("WEGE3", "sell", 100, 15, "2026-06-01", { fees: 5 }),
      trade("VOO", "sell", 5, 120, "2026-06-01", { fx: 5 }),
    ],
    incomes: [income("WEGE3", 40, "2026-03-02")],
  });
  const r = realizedResults(p);
  near(r.BRL.sales, 1500, "vendas");
  near(r.BRL.cost, 1010, "custo");
  near(r.BRL.fees, 5, "taxas");
  near(r.BRL.income, 40, "proventos");
  near(r.BRL.result, 525, "resultado");
  assert.equal(r.BRL.count, 1);
  near(r.USD.result, 100, "em dólar");
  assert.deepEqual(r.pending, []);
  // O rendimento das posições em carteira não recebe nada disso.
  near(
    row(p, market(quote("VOO", 120), quote("USD", 5)), "VOO").result,
    100,
    "em carteira",
  );
});

test("resultado realizado sem câmbio para a taxa fica pendente, sem presumir", () => {
  const p = v4({
    transactions: [lot("VOO", 10, 100, { date: "2026-01-05", fees: 5 })],
    tradeHistory: [trade("VOO", "sell", 5, 120, "2026-06-01")],
  });
  const r = realizedResults(p);
  assert.deepEqual(r.pending, ["VOO"]);
  assert.equal(r.USD.count, 0);
});
