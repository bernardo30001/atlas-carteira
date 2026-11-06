// Leitura dos extratos mensais da Nomad. Só dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNomadStatement,
  statementNumber,
} from "../app/lib/import/nomad.ts";
import { readPdfLines } from "../app/lib/import/pdf.ts";
import {
  buildPdf,
  buyEn,
  dividendEn,
  dividendPt,
  FUNDO,
  sellEn,
  statementEn,
  statementPt,
} from "./fixtures/nomad.mjs";

const parse = (lines, name = "extrato.pdf") => {
  const file = parseNomadStatement(lines, name);
  assert.ok(file, "extrato reconhecido");
  return file;
};

test("números nas duas versões do extrato", () => {
  assert.equal(statementNumber("1,234.56"), 1234.56);
  assert.equal(statementNumber("1.234,56"), 1234.56);
  assert.equal(statementNumber("123,45"), 123.45);
  assert.equal(statementNumber("0.12345"), 0.12345);
  assert.equal(statementNumber("-0,55"), -0.55);
  assert.equal(statementNumber("."), null);
});

test("compras em inglês: data do negócio, valor e dólar", () => {
  const file = parse(
    statementEn({
      trades: [buyEn("2026-03-10", FUNDO, "2.5", "40.1077", "100.27")],
    }),
  );
  assert.equal(file.format, "nomad-extrato");
  assert.equal(file.currency, "USD");
  assert.equal(file.sheet, "2026-03-01 a 2026-03-31");
  assert.equal(file.trades.length, 1);
  const [buy] = file.trades;
  assert.equal(buy.date, "2026-03-10");
  assert.equal(buy.ticker, FUNDO);
  assert.equal(buy.kind, "buy");
  assert.equal(buy.quantity, 2.5);
  assert.equal(buy.price, 40.1077);
  assert.equal(buy.total, 100.27);
  assert.equal(buy.institution, "Nomad");
  assert.equal(buy.fees, undefined);
  assert.equal(file.decisions.length, 0);
});

test("compras em português, com título quebrado e vírgula decimal", () => {
  const file = parse(
    statementPt({
      trades: [
        `BUY  2025-12-05  2025-12-08  FUNDO FICTICIO ETF  ${FUNDO}  0.25  400,00  100,00  0,00  0,00  0,00  AGENCY`,
      ],
    }),
  );
  assert.equal(file.sheet, "2025-12-01 a 2025-12-31");
  assert.equal(file.trades[0].total, 100);
  assert.equal(file.trades[0].price, 400);
  assert.equal(file.trades[0].quantity, 0.25);
});

test("venda e taxas ficam à parte do valor da operação", () => {
  const file = parse(
    statementEn({
      trades: [
        buyEn("2026-03-10", FUNDO, "1", "100.00", "101.00", "1.00"),
        sellEn("2026-03-12", FUNDO, "1", "110.00", "110.00"),
      ],
    }),
  );
  const [buy, sell] = file.trades;
  assert.equal(buy.total, 100, "o líquido da compra inclui a taxa");
  assert.equal(buy.fees, 1);
  assert.equal(buy.feesCurrency, "USD");
  assert.equal(sell.kind, "sell");
  assert.equal(sell.total, 110);
});

test("dividendo mostrado pelo bruto: líquido e imposto à parte", () => {
  const file = parse(
    statementEn({
      activity: dividendEn("2026-03-20", FUNDO, "0.5", "10", "5.00"),
      dividends: "3.50",
    }),
  );
  const [paid] = file.incomes;
  assert.equal(paid.ticker, FUNDO);
  assert.equal(paid.date, "2026-03-20");
  assert.equal(paid.type, "dividend");
  assert.equal(paid.gross, 5);
  assert.equal(paid.withheldTax, 1.5);
  assert.equal(paid.amount, 3.5);
  assert.deepEqual(file.warnings, []);
});

test("dividendo mostrado pelo líquido, com o código no meio do texto", () => {
  // 2 × 1 = 2,00 bruto; 0,60 retido; o extrato mostra 1,40.
  const file = parse(
    statementPt({
      activity: dividendPt("2025-12-20", FUNDO, "2", "1", "1,40"),
    }),
  );
  const [paid] = file.incomes;
  assert.equal(paid.ticker, FUNDO);
  assert.equal(paid.gross, 2);
  assert.equal(paid.withheldTax, 0.6);
  assert.equal(paid.amount, 1.4);
});

test("retenção arredonda meio centavo para cima, como no extrato", () => {
  // 30% de 1,15 são 0,345: o extrato retém 0,35 e paga 0,80.
  const file = parse(
    statementEn({
      activity: dividendEn("2026-03-20", FUNDO, "0.115", "10", "1.15"),
      dividends: "0.80",
    }),
  );
  assert.equal(file.incomes[0].withheldTax, 0.35);
  assert.equal(file.incomes[0].amount, 0.8);
  assert.deepEqual(file.warnings, []);
});

test("soma diferente do resumo do extrato gera aviso", () => {
  const file = parse(
    statementEn({
      activity: dividendEn("2026-03-20", FUNDO, "0.5", "10", "5.00"),
      dividends: "9.99",
    }),
  );
  assert.equal(file.incomes.length, 1);
  assert.equal(file.warnings.length, 1);
  assert.match(file.warnings[0], /3\.50.*9\.99/);
});

test("dividendo duvidoso vai para decisão, sem entrar na carteira", () => {
  const semAliquota = parse(
    statementEn({
      activity: dividendEn("2026-03-20", FUNDO, "0.5", "10", "5.00", null),
    }),
  );
  assert.equal(semAliquota.incomes.length, 0);
  assert.match(semAliquota.decisions[0].reason, /alíquota/);

  const naoBate = parse(
    statementEn({
      activity: dividendEn("2026-03-20", FUNDO, "0.5", "10", "7.77"),
    }),
  );
  assert.equal(naoBate.incomes.length, 0);
  assert.match(naoBate.decisions[0].reason, /não bate/);

  const estorno = parse(
    statementEn({
      activity: dividendEn("2026-03-20", FUNDO, "0.5", "10", "-5.00"),
    }),
  );
  assert.equal(estorno.incomes.length, 0);
  assert.match(estorno.decisions[0].reason, /estorno/);
});

test("depósito e movimentação de saldo são ignorados com o motivo", () => {
  const file = parse(
    statementEn({
      activity: [
        "2026-03-02  DEPOSIT  ICT Deposit  0.00  100.00  0.00",
        "2026-03-03  SWEEP  FDIC Insured Deposit Program Purchase Sweep  0.00  -100.00  0.00",
      ],
    }),
  );
  assert.equal(file.ignored.length, 2);
  assert.match(file.ignored[0].reason, /câmbio/);
  assert.match(file.ignored[1].reason, /sem efeito/);
  assert.equal(file.decisions.length, 0);
  assert.equal(file.trades.length + file.incomes.length, 0);
});

test("o que não sei ler nunca some: vai para decisão", () => {
  const file = parse(
    statementEn({
      trades: [
        buyEn("2026-03-10", FUNDO, "2", "50.00", "100.00"),
        "BUY  2026-03-11  linha truncada",
        // Quantidade × preço não fecha com o valor.
        buyEn("2026-03-12", FUNDO, "2", "50.00", "130.00"),
      ],
      activity: [
        "2026-03-15  WITHDRAWAL  Saque  0.00  -50.00  0.00",
        "2026-03-16  linha sem colunas",
      ],
    }),
  );
  assert.equal(file.trades.length, 1);
  assert.equal(file.decisions.length, 4);
  assert.match(file.decisions[0].reason, /não consegui ler/);
  assert.match(file.decisions[1].reason, /não bate/);
  assert.match(file.decisions[2].reason, /desconhecido/);
  assert.match(file.decisions[3].reason, /não consegui ler/);
});

test("operação pendente não conta: virá no extrato seguinte", () => {
  const file = parse(
    statementEn({
      pending: [buyEn("2026-03-31", FUNDO, "1", "50.00", "50.00")],
    }),
  );
  assert.equal(file.trades.length, 0);
  assert.match(file.ignored[0].reason, /mês seguinte/);
});

test("mês sem movimentação é reconhecido, sem linhas", () => {
  const file = parse(statementEn());
  assert.equal(file.trades.length + file.incomes.length, 0);
  assert.equal(file.ignored.length + file.decisions.length, 0);
});

test("PDF de outro tipo não é reconhecido", () => {
  assert.equal(parseNomadStatement(["Fatura", "Total  10,00"], "a.pdf"), null);
  assert.equal(parseNomadStatement([], "a.pdf"), null);
});

test("nenhum dado pessoal do extrato chega ao resultado", () => {
  const file = parse(
    statementEn({
      trades: [buyEn("2026-03-10", FUNDO, "2", "50.00", "100.00")],
    }),
  );
  assert.doesNotMatch(JSON.stringify(file), /PESSOA FICTICIA|Rua Inventada/);
});

test("do PDF ao extrato, nas duas versões", async () => {
  const en = parse(
    await readPdfLines(
      buildPdf(
        statementEn({
          trades: [buyEn("2026-03-10", FUNDO, "2.5", "40.00", "100.00")],
          activity: dividendEn("2026-03-20", FUNDO, "0.5", "10", "5.00"),
          dividends: "3.50",
        }),
      ),
    ),
  );
  assert.equal(en.trades[0].total, 100);
  assert.equal(en.trades[0].quantity, 2.5);
  assert.equal(en.incomes[0].amount, 3.5);
  assert.equal(en.decisions.length, 0);
  assert.deepEqual(en.warnings, []);

  const pt = parse(
    await readPdfLines(
      buildPdf(
        statementPt({
          activity: dividendPt("2025-12-20", FUNDO, "2", "1", "1,40"),
        }),
      ),
    ),
  );
  assert.equal(pt.incomes[0].withheldTax, 0.6);
});

