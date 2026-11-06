import { z } from "zod";
import {
  allAssets,
  ASSETS,
  KNOWN_ASSETS,
  LEGACY_ASSETS,
  today,
  wholeUnits,
  type Portfolio,
} from "./model.ts";
import { ledgerIssues } from "./trade-history.ts";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s &&
      s <= today(),
    "Data inválida ou futura",
  );
const amount = z.number().finite().min(0).max(1e12),
  signed = z.number().finite().min(-1e12).max(1e12),
  currency = z.enum(["BRL", "USD"]),
  ticker = z.string().regex(/^[A-Z0-9.-]{1,12}$/, "Ativo inválido");
const transaction = z.object({
  id: z.string().uuid(),
  ticker,
  kind: z.enum(["opening", "buy"]),
  quantity: z.number().finite().positive().max(1e12),
  price: z.number().finite().positive().max(1e12),
  fx: z.number().finite().positive().max(10000).nullable(),
  fees: amount,
  feesCurrency: currency.optional(),
  date,
  note: z.string().max(500),
  currency: currency.optional(),
  costNative: amount.optional(),
  reconciled: z.boolean().optional(),
});
const income = z.object({
  id: z.string().uuid(),
  ticker,
  amount,
  currency,
  date,
  kind: z.enum(["opening", "payment"]),
  fx: z.number().finite().positive().max(10000).nullable().optional(),
  note: z.string().max(500),
  source: z.string().max(200).optional(),
  institution: z.string().max(100).optional(),
  importKey: z.string().max(200).optional(),
  type: z.enum(["dividend", "jcp", "yield"]).optional(),
  withheldTax: amount.optional(),
});
const reportTotals = z.object({
  balance: amount,
  cost: amount,
  dividends: amount,
  result: signed,
});
const earningsScenario = z.object({
  growth: signed.min(-20).max(30),
  discountRate: amount.min(5).max(40),
  terminalPE: amount.min(2).max(50),
  payout: amount.max(100),
  years: z.number().int().min(1).max(10),
});
const tradeEvent = z.object({
  id: z.string().uuid(),
  ticker,
  kind: z.enum(["buy", "sell"]),
  quantity: z.number().finite().positive().max(1e12),
  price: z.number().finite().positive().max(1e12),
  total: amount,
  currency,
  fx: z.number().finite().positive().max(10000).nullable(),
  fees: amount,
  feesCurrency: currency.optional(),
  date,
  source: z.string().max(200).optional(),
  institution: z.string().max(100).optional(),
  importKey: z.string().max(200).optional(),
});
const statement = z.object({
  id: z.string().uuid(),
  date,
  label: z.string().max(150),
  rows: z
    .array(
      z.object({
        ticker,
        quantity: amount,
        average: amount,
        price: amount,
        balance: amount,
        cost: amount,
        dividends: amount,
        reportedResult: signed,
      }),
    )
    .max(100),
  reportedTotals: z.object({ BRL: reportTotals, USD: reportTotals }),
  bitcoin: z
    .object({
      quantity: amount,
      balance: amount,
      cost: amount,
      reportedProfit: signed,
      reportedPercent: signed,
      twelveMonthProfit: signed,
    })
    .optional(),
  notes: z.array(z.string().max(1000)).max(30),
});
const customAsset = z.object({
  ticker: z.string().regex(/^[A-Z0-9]{2,12}$/, "Código inválido"),
  symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/, "Símbolo inválido"),
  name: z.string().min(1).max(100),
  group: z.enum(["br", "rf", "etf", "crypto"]),
  currency,
  sector: z.string().max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/),
  query: z.string().max(100),
  segment: z.literal("fii").optional(),
  archived: z.boolean().optional(),
});
const corporateAction = z.object({
  id: z.string().uuid(),
  ticker,
  date,
  kind: z.enum(["split", "bonus", "rename"]),
  factor: z.number().finite().positive().max(10000).optional(),
  delta: signed.optional(),
  newTicker: ticker.optional(),
  unitCost: amount.optional(),
  source: z.string().max(200).optional(),
  importKey: z.string().max(200).optional(),
});
export const portfolioSchema = z
  .object({
    transactions: z.array(transaction).max(10000),
    fixedIncome: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().min(1).max(100),
            cost: amount.nullable(),
            value: amount,
            date,
            updatedAt: date,
            ratePercent: amount.max(10000).optional(),
            index: z.string().max(20).optional(),
            note: z.string().max(500).optional(),
          })
          .refine(
            (r) => r.updatedAt >= r.date,
            "Atualização anterior ao cadastro",
          ),
      )
      .max(1000),
    targets: z
      .object({
        br: amount.max(100),
        rf: amount.max(100),
        etf: amount.max(100),
        crypto: amount.max(100),
      })
      .refine(
        (t) =>
          Math.abs(Object.values(t).reduce((a, b) => a + b, 0) - 100) < 0.001,
        "Metas devem somar 100%",
      ),
    weights: z
      .record(z.number().finite().min(0).max(100))
      .refine(
        (w) =>
          ASSETS.filter((a) => a.group !== "rf").every((a) =>
            ASSETS.filter((b) => b.group === a.group).some(
              (b) => (w[b.ticker] ?? 1) > 0,
            ),
          ),
        "Cada classe precisa ter algum peso positivo",
      ),
    incomes: z.array(income).max(10000).optional(),
    statements: z.array(statement).max(100).optional(),
    tradeHistory: z.array(tradeEvent).max(10000).optional(),
    schemaVersion: z.number().int().positive().optional(),
    customAssets: z.array(customAsset).max(200).optional(),
    corporateActions: z.array(corporateAction).max(1000).optional(),
    evaluation: z
      .object({
        baseWeights: z
          .record(amount.max(100))
          .refine(
            (w) =>
              Object.keys(w).every((t) =>
                KNOWN_ASSETS.some((a) => a.ticker === t && a.group === "br"),
              ) &&
              ASSETS.some((a) => a.group === "br" && (w[a.ticker] ?? 0) > 0),
            "Informe pesos válidos para as ações brasileiras.",
          ),
        margin: amount.min(5).max(50),
        maxIssuerWeight: amount.min(5).max(50),
        maxSectorWeight: amount.min(10).max(100),
        scenario: earningsScenario.optional(),
        overrides: z
          .record(
            z.object({
              referencePrice: amount.positive().nullable(),
              thesis: z.enum(["unreviewed", "intact", "review", "broken"]),
              note: z.string().max(1000),
              updatedAt: date,
              method: z
                .enum(["auto", "peers", "scenario", "manual"])
                .optional(),
              scenario: earningsScenario.optional(),
            }),
          )
          .refine(
            (w) =>
              Object.keys(w).every((t) =>
                KNOWN_ASSETS.some((a) => a.ticker === t && a.group === "br"),
              ),
            "Ativo inválido na avaliação",
          ),
      })
      .optional(),
  })
  .superRefine((p, c) => {
    const ids = [
      ...p.transactions,
      ...p.fixedIncome,
      ...(p.incomes ?? []),
      ...(p.statements ?? []),
    ].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: "custom", message: "Registros duplicados" });
    const history = p.tradeHistory ?? [];
    if (new Set(history.map((e) => e.id)).size !== history.length)
      c.addIssue({ code: "custom", message: "Movimentações duplicadas" });
    const portfolio = p as Portfolio,
      known = new Map(
        [...allAssets(portfolio), ...LEGACY_ASSETS].map((a) => [a.ticker, a]),
      );
    const issue = (message: string) => c.addIssue({ code: "custom", message });
    const custom = p.customAssets ?? [];
    if (new Set(custom.map((a) => a.ticker)).size !== custom.length)
      issue("Ativos cadastrados em duplicidade");
    if (custom.some((a) => ASSETS.some((b) => b.ticker === a.ticker)))
      issue("Esse ativo já faz parte da lista padrão");
    // Um código antigo só existe antes da troca: o histórico continua válido.
    const renamed = new Set(
      (p.corporateActions ?? [])
        .filter((a) => a.kind === "rename")
        .map((a) => a.ticker),
    );
    const assetFor = (ticker: string, label: string) => {
      const asset = known.get(ticker);
      if (!asset && !renamed.has(ticker))
        issue(`Ativo não cadastrado em ${label}: ${ticker}`);
      return asset;
    };
    for (const t of p.transactions) {
      const a = assetFor(t.ticker, "registros");
      const cc = t.currency ?? a?.currency;
      if (cc === "BRL" && t.fx !== 1)
        issue("Registros em reais devem ter câmbio 1.");
      if (a && a.ticker !== "BTC" && cc !== a.currency)
        issue("Use a moeda de origem do ativo.");
      if (a && wholeUnits(a) && !Number.isInteger(t.quantity))
        issue("Ativos da B3 exigem unidades inteiras.");
    }
    for (const i of p.incomes ?? []) {
      const a = assetFor(i.ticker, "proventos");
      if (a && a.ticker !== "BTC" && i.currency !== a.currency)
        issue("Provento deve ser registrado na moeda do ativo.");
    }
    // Eventos societários podem gerar frações, vendidas depois em leilão.
    const fractional = new Set((p.corporateActions ?? []).map((a) => a.ticker));
    for (const e of history) {
      const a = assetFor(e.ticker, "movimentações");
      if (a && a.ticker !== "BTC" && e.currency !== a.currency)
        issue("Moeda da movimentação incompatível com o ativo.");
      if (
        a &&
        wholeUnits(a) &&
        !fractional.has(e.ticker) &&
        !Number.isInteger(e.quantity)
      )
        issue("A movimentação na B3 usa quantidades inteiras.");
      if (e.currency === "BRL" && e.fx !== 1)
        issue("Registros em reais usam câmbio 1.");
    }
    for (const statement of p.statements ?? [])
      for (const row of statement.rows) assetFor(row.ticker, "extratos");
    for (const ticker of ledgerIssues(portfolio))
      c.addIssue({
        code: "custom",
        message: "Histórico de vendas sem posição suficiente para " + ticker,
      });
  });
export const requestSchema = z.object({
  revision: z.number().int().min(0),
  portfolio: portfolioSchema,
});
