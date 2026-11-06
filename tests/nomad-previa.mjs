// Extratos da Nomad na prévia e na carteira. Só dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ledgerFor,
  PORTFOLIO_SCHEMA,
  replayLedger,
} from "../app/lib/trade-history.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
import { parseNomadStatement } from "../app/lib/import/nomad.ts";
import {
  applyPreview,
  archivedAsset,
  buildPreview,
} from "../app/lib/import/preview.ts";
import {
  buyEn,
  dividendEn,
  FUNDO,
  OUTRO,
  sellEn,
  statementEn,
} from "./fixtures/nomad.mjs";
import {
  income,
  lot,
  near,
  portfolio,
  trade,
} from "./fixtures/auditoria.mjs";

const DAY = "2026-11-06";
const asset = (ticker) => ({
  ticker,
  symbol: ticker,
  name: `Fundo ${ticker}`,
  group: "etf",
  currency: "USD",
  sector: "Teste",
  color: "#112233",
  query: ticker,
});
const v4 = (extra) =>
  portfolio({
    schemaVersion: PORTFOLIO_SCHEMA,
    customAssets: [asset(FUNDO), asset(OUTRO)],
    ...extra,
  });
const parse = (lines, name = "extrato.pdf") => {
  const file = parseNomadStatement(lines, name);
  assert.ok(file, "extrato reconhecido");
  return file;
};
const usdLot = (ticker, quantity, price, extra) =>
  lot(ticker, quantity, price, {
    currency: "USD",
    fx: null,
    costNative: quantity * price,
    date: "2026-10-20",
    ...extra,
  });
const openingIncome = (ticker, amount) =>
  income(ticker, amount, "2026-10-20", {
    kind: "opening",
    currency: "USD",
    fx: null,
  });

const history = () => [
  parse(
    statementEn({
      start: "2026-03-01",
      end: "2026-03-31",
      trades: [
        buyEn("2026-03-10", FUNDO, "2", "50.00", "100.00"),
        buyEn("2026-03-10", OUTRO, "1", "30.00", "30.00"),
      ],
    }),
    "marco.pdf",
  ),
  parse(
    statementEn({
      start: "2026-06-01",
      end: "2026-06-30",
      trades: [buyEn("2026-06-10", FUNDO, "3", "60.00", "180.00")],
      activity: [
        ...dividendEn("2026-06-20", FUNDO, "0.5", "5", "2.50"),
        ...dividendEn("2026-06-20", OUTRO, "1", "1", "1.00"),
      ],
      dividends: "2.45",
    }),
    "junho.pdf",
  ),
];

test("histórico completo explica a posição inicial, sem mudar quantidade nem custo", async () => {
  const p = v4({
    transactions: [usdLot(FUNDO, 5, 56), usdLot(OUTRO, 1, 30)],
  });
  const files = history();
  const preview = await buildPreview(p, files, DAY);
  assert.equal(preview.trades.length, 3);
  assert.equal(preview.reconcile.length, 2);
  assert.deepEqual(preview.impact, []);
  assert.deepEqual(preview.warnings, []);

  const next = applyPreview(p, preview);
  assert.ok(portfolioSchema.safeParse(next).success, "carteira válida");
  const state = replayLedger(ledgerFor(next, FUNDO));
  near(state.quantity, 5, "quantidade");
  near(
    state.lots.reduce((s, l) => s + l.costNative, 0),
    280,
    "custo",
  );

  const event = next.tradeHistory.find((e) => e.date === "2026-06-10");
  assert.equal(event.currency, "USD");
  assert.equal(event.fx, null, "o extrato não traz câmbio: nunca é presumido");
  assert.equal(event.fees, 0);
  assert.equal(event.institution, "Nomad");
  assert.equal(event.source, `nomad-extrato|Nomad|${DAY}`);
  assert.ok(event.importKey);
});

test("taxa da corretora fica em dólar no evento", async () => {
  const p = v4({ transactions: [] });
  const file = parse(
    statementEn({
      trades: [buyEn("2026-03-10", FUNDO, "1", "100.00", "101.00", "1.00")],
    }),
  );
  const next = applyPreview(p, await buildPreview(p, [file], DAY));
  assert.equal(next.tradeHistory[0].fees, 1);
  assert.equal(next.tradeHistory[0].feesCurrency, "USD");
  assert.equal(next.tradeHistory[0].total, 100);
});

test("o mesmo extrato enviado duas vezes conta uma vez", async () => {
  const p = v4({ transactions: [] });
  const [march] = history();
  const preview = await buildPreview(
    p,
    [march, { ...march, fileName: "copia.pdf" }],
    DAY,
  );
  assert.equal(preview.trades.length, 2);
  assert.match(preview.warnings[0], /repetidas/);
});

test("ativo fora da lista fica aguardando, em dólar, e pode ser só histórico", async () => {
  const p = v4({ transactions: [], customAssets: [] });
  const file = parse(
    statementEn({
      trades: [
        buyEn("2026-03-10", FUNDO, "2", "50.00", "100.00"),
        sellEn("2026-03-12", FUNDO, "2", "60.00", "120.00"),
      ],
    }),
  );
  const preview = await buildPreview(p, [file], DAY);
  assert.equal(preview.trades.length, 0);
  assert.deepEqual(
    preview.unknown.map((u) => [u.ticker, u.currency, u.closed]),
    [[FUNDO, "USD", true]],
  );
  const history = archivedAsset(FUNDO, "USD");
  assert.equal(history.currency, "USD");
  assert.equal(history.symbol, FUNDO);
  const kept = { ...p, customAssets: [history] };
  const next = applyPreview(kept, await buildPreview(kept, [file], DAY));
  assert.ok(portfolioSchema.safeParse(next).success, "carteira válida");
  assert.equal(next.tradeHistory[0].currency, "USD");
  assert.equal(
    archivedAsset("ZZZZ3").currency,
    "BRL",
    "o padrão segue em reais",
  );
});

test("prévia não altera a carteira original", async () => {
  const p = v4({
    transactions: [usdLot(FUNDO, 5, 56)],
    incomes: [openingIncome(FUNDO, 2.5)],
  });
  const before = JSON.stringify(p);
  const preview = await buildPreview(p, history(), DAY);
  applyPreview(p, preview);
  assert.equal(JSON.stringify(p), before);
});
test("extrato em dólar não acusa movimentações da B3", async () => {
  const p = v4({
    transactions: [],
    tradeHistory: [
      trade("WEGE3", "buy", 10, 30, "2026-03-11"),
      trade(FUNDO, "buy", 9, 10, "2026-03-11", {
        currency: "USD",
        fx: null,
      }),
    ],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        statementEn({
          trades: [buyEn("2026-03-10", FUNDO, "2", "50.00", "100.00")],
        }),
      ),
    ],
    DAY,
  );
  const warning = preview.warnings.find((w) => /não aparece/.test(w));
  assert.ok(warning, "a movimentação em dólar continua sendo avisada");
  assert.match(warning, /^1 movimentação/);
});

