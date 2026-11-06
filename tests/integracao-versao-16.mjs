// A carteira salva na versão 16 precisa sobreviver à migração, e os recursos dos dois
// lados precisam conviver. Só dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import {
  allAssets,
  EMPTY,
  isTrackedTicker,
  LEGACY_ASSETS,
  totals,
  trackedPortfolio,
} from "../app/lib/model.ts";
import {
  datedTrades,
  migratePortfolio,
  PORTFOLIO_SCHEMA,
} from "../app/lib/trade-history.ts";
import { portfolioSchema, requestSchema } from "../app/lib/validation.ts";
import { DEFAULT_EVALUATION } from "../app/lib/evaluation-config.ts";
import { evaluationSettings } from "../app/lib/evaluation.ts";
import { parseB3Table } from "../app/lib/import/b3.ts";
import { readTables } from "../app/lib/import/table.ts";
import { applyPreview, buildPreview } from "../app/lib/import/preview.ts";
import { BTG, buildXlsx, negociacao } from "./fixtures/b3.mjs";
import {
  income,
  lot,
  market,
  near,
  portfolio,
  quote,
  trade,
} from "./fixtures/auditoria.mjs";

const LEGACY = LEGACY_ASSETS[0].ticker;
const custom = {
  ticker: "ZZZZ11",
  symbol: "ZZZZ11.SA",
  name: "Fundo fictício",
  group: "br",
  currency: "BRL",
  sector: "FII",
  color: "#112233",
  query: "ZZZZ11",
  segment: "fii",
};
const evaluation = {
  ...structuredClone(DEFAULT_EVALUATION),
  margin: 25,
  overrides: {
    WEGE3: {
      referencePrice: 50,
      thesis: "intact",
      note: "Tese fictícia",
      updatedAt: "2026-10-01",
      method: "manual",
    },
  },
};

test("carteira da versão 16, sem versão de esquema, mantém pesos e teses", () => {
  const saved = portfolio({
    transactions: [lot("WEGE3", 10, 20)],
    evaluation,
  });
  delete saved.schemaVersion;
  const migrated = migratePortfolio(saved);
  assert.equal(migrated.schemaVersion, PORTFOLIO_SCHEMA);
  assert.deepEqual(migrated.evaluation, evaluation);
  const parsed = requestSchema.safeParse({ portfolio: migrated, revision: 3 });
  assert.ok(parsed.success, "aceita ao salvar");
  assert.deepEqual(parsed.data.portfolio.evaluation, evaluation);
  assert.equal(evaluationSettings(migrated).margin, 25);
});

test("avaliação inválida continua sendo recusada", () => {
  const bad = portfolio({
    schemaVersion: PORTFOLIO_SCHEMA,
    evaluation: { ...evaluation, margin: 99 },
  });
  assert.equal(portfolioSchema.safeParse(bad).success, false);
});

test("ativo legado: registros preservados, fora das contas e das telas", () => {
  const p = migratePortfolio(
    portfolio({
      transactions: [lot("KLBN4", 10, 5), lot(LEGACY, 100, 10)],
      tradeHistory: [trade(LEGACY, "buy", 100, 10, "2026-01-02")],
      incomes: [income(LEGACY, 7, "2026-02-01")],
    }),
  );
  assert.ok(
    portfolioSchema.safeParse(p).success,
    "backup antigo continua válido",
  );
  assert.ok(!allAssets(p).some((a) => a.ticker === LEGACY));
  assert.equal(isTrackedTicker(LEGACY), false);
  assert.ok(!datedTrades(p).some((e) => e.ticker === LEGACY));
  assert.equal(trackedPortfolio(p).incomes.length, 0);
  assert.equal(
    p.transactions.filter((t) => t.ticker === LEGACY).length,
    1,
    "o registro não é apagado",
  );
  near(
    totals(p, market(quote("KLBN4", 6))).cost,
    50,
    "custo só do que é acompanhado",
  );
});

test("ativo que você cadastrou continua sendo acompanhado", () => {
  assert.equal(isTrackedTicker(custom.ticker), true);
  const p = migratePortfolio(
    portfolio({
      customAssets: [custom],
      transactions: [lot(custom.ticker, 3, 100)],
      incomes: [income(custom.ticker, 4, "2026-02-01")],
    }),
  );
  const kept = trackedPortfolio(p);
  assert.equal(kept.transactions.length, 1);
  assert.equal(kept.incomes.length, 1);
  near(
    totals(p, market(quote(custom.ticker, 110))).cost,
    300,
    "custo do cadastrado",
  );
});

test("o relatório da B3 importa o ativo legado sem pedir cadastro nem mudar telas", async () => {
  const p = portfolio({
    schemaVersion: PORTFOLIO_SCHEMA,
    transactions: [],
    evaluation,
  });
  const [table] = readTables(
    "n.xlsx",
    buildXlsx(
      negociacao(
        [
          "05/01/2026",
          "Compra",
          "Mercado à Vista",
          "-",
          BTG,
          LEGACY,
          10,
          5,
          50,
        ],
        [
          "06/01/2026",
          "Venda",
          "Mercado à Vista",
          "-",
          BTG,
          LEGACY,
          20,
          6,
          120,
        ],
        [
          "07/01/2026",
          "Compra",
          "Mercado à Vista",
          "-",
          BTG,
          "WEGE3",
          5,
          40,
          200,
        ],
      ),
    ),
  );
  const preview = await buildPreview(
    p,
    [parseB3Table(table, "n.xlsx")],
    "2026-11-06",
  );
  assert.deepEqual(preview.unknown, []);
  assert.deepEqual(preview.decisions, []);
  assert.deepEqual(
    preview.impact.map((row) => row.ticker),
    ["WEGE3"],
  );
  const next = applyPreview(p, preview);
  assert.ok(portfolioSchema.safeParse(next).success, "carteira válida");
  assert.deepEqual(
    next.evaluation,
    evaluation,
    "a importação não mexe na avaliação",
  );
  assert.ok(!datedTrades(next).some((e) => e.ticker === LEGACY));
});

test("carteira vazia da versão 16 continua válida", () => {
  assert.ok(portfolioSchema.safeParse(migratePortfolio(EMPTY)).success);
});
