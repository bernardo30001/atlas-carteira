// Importação da B3, das planilhas à prévia. Só dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import { strToU8 } from "fflate";
import { dayChange, positions, totals } from "../app/lib/model.ts";
import { PORTFOLIO_SCHEMA, realizedResults } from "../app/lib/trade-history.ts";
import { portfolioSchema } from "../app/lib/validation.ts";
import { readTables } from "../app/lib/import/table.ts";
import {
  normalizeInstitution,
  normalizeTicker,
  parseB3Table,
  parseDate,
  parseNumber,
} from "../app/lib/import/b3.ts";
import {
  applyPreview,
  archivedAsset,
  buildPreview,
} from "../app/lib/import/preview.ts";
import {
  BTG,
  buildCsv,
  buildXlsx,
  movimentacao,
  negociacao,
  NU,
} from "./fixtures/b3.mjs";
import {
  income,
  lot,
  market,
  near,
  portfolio,
  quote,
  trade,
} from "./fixtures/auditoria.mjs";

const DAY = "2026-11-06";
const v4 = (extra) => portfolio({ schemaVersion: PORTFOLIO_SCHEMA, ...extra });
const parse = (rows, name = "arquivo.xlsx") => {
  const [table] = readTables(name, buildXlsx(rows));
  const file = parseB3Table(table, name);
  assert.ok(file, "layout reconhecido");
  return file;
};
const row = (p, ticker) =>
  positions(p, market(quote(ticker, 10))).find((r) => r.ticker === ticker);
const buy = (date, code, quantity, price, institution = BTG) => [
  date,
  "Compra",
  "Mercado à Vista",
  "-",
  institution,
  code,
  quantity,
  price,
  quantity * price,
];
const sell = (date, code, quantity, price, institution = BTG) => [
  date,
  "Venda",
  "Mercado à Vista",
  "-",
  institution,
  code,
  quantity,
  price,
  quantity * price,
];

test("números e datas em pt-BR", () => {
  assert.equal(parseNumber("R$ 1.234,56"), 1234.56);
  assert.equal(parseNumber("1.234"), 1234);
  assert.equal(parseNumber("10,5"), 10.5);
  assert.equal(parseNumber("12.5"), 12.5);
  assert.equal(parseNumber(7), 7);
  assert.equal(parseNumber("-"), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseDate("29/10/2026"), "2026-10-29");
  assert.equal(parseDate("2026-10-29"), "2026-10-29");
  assert.equal(parseDate(46324), "2026-10-29");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("Total"), null);
});

test("código fracionário e nome da corretora", () => {
  assert.equal(normalizeTicker("WEGE3F"), "WEGE3");
  assert.equal(normalizeTicker(" wege3 "), "WEGE3");
  assert.equal(normalizeTicker("ALUP11F"), "ALUP11");
  assert.equal(normalizeTicker("KLBN11"), "KLBN11");
  assert.equal(normalizeInstitution(NU), "Nu Invest");
  assert.equal(normalizeInstitution("NU BANK"), "Nu Invest");
  assert.equal(normalizeInstitution(BTG), "BTG");
  assert.equal(normalizeInstitution("OUTRA CORRETORA"), "OUTRA CORRETORA");
});

test("lê Excel com textos compartilhados e colunas faltando", () => {
  const [table] = readTables(
    "x.xlsx",
    buildXlsx(
      [
        ["A", null, "C"],
        [1.5, "dois & três"],
      ],
      "Aba",
    ),
  );
  assert.equal(table.name, "Aba");
  assert.deepEqual(table.rows[0], ["A", null, "C"]);
  assert.deepEqual(table.rows[1], [1.5, "dois & três"]);
});

test("lê CSV com ponto e vírgula, aspas e acentos em latin1", () => {
  const [table] = readTables(
    "x.csv",
    buildCsv([
      ["Data", "Texto"],
      ["01/02/2026", '"a;b"'],
    ]),
  );
  assert.deepEqual(table.rows[1], ["01/02/2026", "a;b"]);
  const latin = Uint8Array.from([0x41, 0xe7, 0xe3, 0x6f, 0x3b, 0x42]); // "Ação;B"
  assert.deepEqual(readTables("y.csv", latin)[0].rows[0], ["Ação", "B"]);
});

test("Excel inválido é recusado com mensagem clara", () => {
  assert.throws(
    () => readTables("x.xlsx", strToU8("não é zip")),
    /planilha Excel válida/,
  );
});

test("relatório desconhecido é recusado, sem supor colunas", () => {
  const [table] = readTables(
    "x.xlsx",
    buildXlsx([
      ["Foo", "Bar"],
      [1, 2],
    ]),
  );
  assert.equal(parseB3Table(table, "x.xlsx"), null);
});

test("Negociação: compras, vendas, fracionário e corretora", () => {
  const file = parse(
    negociacao(
      buy("02/03/2026", "WEGE3", 100, 10),
      buy("03/03/2026", "WEGE3F", 7, 11, NU),
      sell("04/03/2026", "WEGE3", 50, 12),
    ),
  );
  assert.equal(file.format, "b3-negociacao");
  assert.equal(file.trades.length, 3);
  assert.deepEqual(file.trades[1], {
    line: 3,
    date: "2026-03-03",
    ticker: "WEGE3",
    kind: "buy",
    quantity: 7,
    price: 11,
    total: 77,
    institution: "Nu Invest",
  });
  assert.equal(file.trades[2].kind, "sell");
});

test("Negociação tolera cabeçalho deslocado, sinônimos e texto pt-BR", () => {
  const file = parse([
    ["Relatório da Área do Investidor"],
    [],
    [
      "DATA DO NEGOCIO",
      "tipo de movimentação",
      "Instituicao",
      "Codigo",
      "Qtde",
      "Preço unitário",
      "Valor total",
    ],
    ["02/03/2026", "Compra", BTG, "ITUB4", "1.000", "R$ 30,50", "R$ 30.500,00"],
    ["Total", null, null, null, null, null, "R$ 30.500,00"],
  ]);
  assert.equal(file.trades.length, 1);
  assert.equal(file.trades[0].quantity, 1000);
  assert.equal(file.trades[0].price, 30.5);
  assert.equal(file.trades[0].total, 30500);
  assert.equal(file.decisions.length, 0);
  assert.equal(file.ignored.length, 1, "linha de total é só ignorada");
});

test("Negociação manda o que não entende para sua decisão", () => {
  const file = parse(
    negociacao(
      [
        "02/03/2026",
        "Compra",
        "Opção de Compra",
        "-",
        BTG,
        "WEGEA50",
        100,
        1,
        100,
      ],
      [
        "02/03/2026",
        "Permuta",
        "Mercado à Vista",
        "-",
        BTG,
        "WEGE3",
        100,
        1,
        100,
      ],
      [
        "02/03/2026",
        "Compra",
        "Mercado à Vista",
        "-",
        BTG,
        "WEGE3",
        null,
        1,
        100,
      ],
    ),
  );
  assert.equal(file.trades.length, 0);
  assert.equal(file.decisions.length, 3);
  assert.match(file.decisions[0].reason, /Mercado/);
  assert.match(file.decisions[1].reason, /Tipo desconhecido/);
  assert.match(file.decisions[2].reason, /quantidade/);
});

test("Movimentação: proventos, liquidação ignorada e eventos societários", () => {
  const file = parse(
    movimentacao(
      [
        "Credito",
        "10/03/2026",
        "Dividendo",
        "WEGE3 - WEG S.A.",
        BTG,
        100,
        0.5,
        50,
      ],
      [
        "Credito",
        "11/03/2026",
        "Juros Sobre Capital Próprio",
        "ITUB4 - ITAU",
        NU,
        10,
        1,
        10,
      ],
      ["Credito", "12/03/2026", "Rendimento", "HGLG11 - FUNDO", BTG, 5, 1, 5],
      [
        "Credito",
        "02/03/2026",
        "Transferência - Liquidação",
        "WEGE3 - WEG S.A.",
        BTG,
        100,
        10,
        1000,
      ],
      ["Credito", "15/03/2026", "Desdobro", "VALE3 - VALE", BTG, 100, "-", "-"],
      ["Debito", "16/03/2026", "Grupamento", "VALE3 - VALE", BTG, 50, "-", "-"],
      [
        "Credito",
        "17/03/2026",
        "Bonificação em Ativos",
        "ITUB4 - ITAU",
        BTG,
        10,
        5,
        50,
      ],
      [
        "Credito",
        "18/03/2026",
        "Atualização",
        "KLBN4 - KLABIN",
        BTG,
        1,
        "-",
        "-",
      ],
      [
        "Credito",
        "19/03/2026",
        "Direito de Subscrição",
        "VALE12 - VALE",
        BTG,
        1,
        "-",
        "-",
      ],
      [
        "Credito",
        "20/03/2026",
        "Evento Inventado",
        "VALE3 - VALE",
        BTG,
        1,
        "-",
        "-",
      ],
      ["Credito", "21/03/2026", "Rendimento", "CDB - BANCO X", BTG, 1, 1, 1],
    ),
    "movimentacao.xlsx",
  );
  assert.equal(file.format, "b3-movimentacao");
  assert.deepEqual(
    file.incomes.map((i) => [i.ticker, i.type, i.amount, i.institution]),
    [
      ["WEGE3", "dividend", 50, "BTG"],
      ["ITUB4", "jcp", 10, "Nu Invest"],
      ["HGLG11", "yield", 5, "BTG"],
    ],
  );
  assert.deepEqual(
    file.actions.map((a) => [a.ticker, a.kind, a.delta, a.unitCost]),
    [
      ["VALE3", "split", 100, undefined],
      ["VALE3", "split", -50, undefined],
      ["ITUB4", "bonus", 10, 5],
    ],
  );
  assert.equal(file.trades.length, 0, "liquidação não vira compra");
  assert.deepEqual(
    file.ignored.map((n) => n.reason.split(" ")[0]),
    ["Liquidação", "Produto"],
  );
  assert.deepEqual(
    file.decisions.map((n) => n.reason.split(" ")[0]),
    ["Evento", "Direito", "Tipo"],
  );
});

test("prévia: nada é gravado e a carteira original não muda", async () => {
  const p = v4({});
  const original = JSON.stringify(p);
  const preview = await buildPreview(
    p,
    [parse(negociacao(buy("02/03/2026", "WEGE3", 100, 10)))],
    DAY,
  );
  assert.equal(preview.trades.length, 1);
  assert.equal(JSON.stringify(p), original);
  assert.deepEqual(preview.impact, [
    { ticker: "WEGE3", before: 0, after: 100 },
  ]);
});

test("aplicar: posição correta, origem em source e validação aprovada", async () => {
  const p = v4({});
  const file = parse(
    negociacao(
      buy("02/03/2026", "WEGE3", 100, 10),
      sell("04/03/2026", "WEGE3", 40, 12),
    ),
  );
  const incomeFile = parse(
    movimentacao([
      "Credito",
      "03/03/2026",
      "Dividendo",
      "WEGE3 - WEG",
      BTG,
      100,
      0.5,
      50,
    ]),
    "m.xlsx",
  );
  const next = applyPreview(p, await buildPreview(p, [file, incomeFile], DAY));
  assert.equal(portfolioSchema.safeParse(next).success, true);
  near(row(next, "WEGE3").quantity, 60, "quantidade");
  near(row(next, "WEGE3").primaryCost, 600, "custo");
  assert.equal(next.tradeHistory[0].source, `b3-negociacao|BTG|${DAY}`);
  assert.equal(next.tradeHistory[0].institution, "BTG");
  assert.equal(next.incomes[0].source, `b3-movimentacao|BTG|${DAY}`);
  assert.equal(next.incomes[0].type, "dividend");
  near(realizedResults(next).BRL.sales, 480, "vendas");
});

test("reimportar o mesmo arquivo não duplica nada", async () => {
  const rows = negociacao(
    buy("02/03/2026", "WEGE3", 100, 10),
    buy("03/03/2026", "ITUB4", 10, 20),
  );
  const first = applyPreview(
    v4({}),
    await buildPreview(v4({}), [parse(rows)], DAY),
  );
  const again = await buildPreview(first, [parse(rows)], "2026-12-01");
  assert.equal(again.trades.length, 0);
  assert.equal(again.duplicates.length, 2);
  assert.deepEqual(again.impact, []);
  assert.equal(
    JSON.stringify(applyPreview(first, again).tradeHistory),
    JSON.stringify(first.tradeHistory),
  );
});

test("duas execuções idênticas no mesmo dia continuam sendo duas", async () => {
  const rows = negociacao(
    buy("02/03/2026", "WEGE3", 100, 10),
    buy("02/03/2026", "WEGE3", 100, 10),
  );
  const preview = await buildPreview(v4({}), [parse(rows)], DAY);
  assert.equal(preview.trades.length, 2);
  assert.notEqual(preview.trades[0].id, preview.trades[1].id);
  const next = applyPreview(v4({}), preview);
  near(row(next, "WEGE3").quantity, 200, "quantidade");
  const again = await buildPreview(next, [parse(rows)], DAY);
  assert.equal(again.trades.length, 0);
  assert.equal(again.duplicates.length, 2);
});

test("mesmo período em dois arquivos conta uma vez só", async () => {
  const a = parse(negociacao(buy("02/03/2026", "WEGE3", 100, 10)), "a.xlsx");
  const b = parse(
    negociacao(
      buy("02/03/2026", "WEGE3", 100, 10),
      buy("03/03/2026", "WEGE3", 5, 10),
    ),
    "b.xlsx",
  );
  const preview = await buildPreview(v4({}), [a, b], DAY);
  assert.equal(preview.trades.length, 2);
  assert.ok(preview.warnings.some((w) => w.includes("uma vez só")));
});

test("corretoras diferentes no mesmo dia não são duplicatas", async () => {
  const rows = negociacao(
    buy("02/03/2026", "WEGE3", 100, 10, BTG),
    buy("02/03/2026", "WEGE3", 100, 10, NU),
  );
  const preview = await buildPreview(v4({}), [parse(rows)], DAY);
  assert.equal(preview.trades.length, 2);
  assert.deepEqual(preview.trades.map((t) => t.item.institution).sort(), [
    "BTG",
    "Nu Invest",
  ]);
});

test("mesma quantidade com outro preço: você decide, e por padrão fica fora", async () => {
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 150, 20, "2026-03-02")],
  });
  const rows = negociacao(buy("02/03/2026", "WEGE3", 150, 10));
  const preview = await buildPreview(p, [parse(rows)], DAY);
  assert.equal(preview.trades.length, 0);
  assert.equal(preview.probable.length, 1);
  assert.deepEqual(preview.impact, []);
  near(
    row(applyPreview(p, preview), "WEGE3").quantity,
    150,
    "por padrão, fora",
  );
  const chosen = new Set(preview.probable.map((r) => r.id));
  near(
    row(applyPreview(p, preview, chosen), "WEGE3").quantity,
    300,
    "incluído por sua escolha",
  );
});

test("compra manual antiga também vira provável duplicado", async () => {
  const p = v4({
    transactions: [lot("WEGE3", 10, 10, { kind: "buy", date: "2026-03-02" })],
  });
  const preview = await buildPreview(
    p,
    [parse(negociacao(buy("02/03/2026", "WEGE3", 10, 10)))],
    DAY,
  );
  assert.equal(preview.probable.length, 1);
  assert.equal(preview.trades.length, 0);
});

test("pagamento já contido no provento acumulado não conta duas vezes", async () => {
  const p = v4({
    transactions: [lot("WEGE3", 100, 10)],
    incomes: [income("WEGE3", 500, "2026-06-30", { kind: "opening" })],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        movimentacao(
          [
            "Credito",
            "10/03/2026",
            "Dividendo",
            "WEGE3 - WEG",
            BTG,
            100,
            1,
            100,
          ],
          [
            "Credito",
            "10/09/2026",
            "Dividendo",
            "WEGE3 - WEG",
            BTG,
            100,
            1,
            100,
          ],
        ),
      ),
    ],
    DAY,
  );
  assert.equal(preview.included.length, 1);
  assert.equal(preview.included[0].item.date, "2026-03-10");
  assert.equal(preview.incomes.length, 1);
  assert.equal(preview.incomes[0].item.date, "2026-09-10");
});

test("provento igual já registrado à mão vira provável duplicado", async () => {
  const p = v4({
    transactions: [lot("WEGE3", 100, 10)],
    incomes: [income("WEGE3", 100, "2026-03-10")],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        movimentacao([
          "Credito",
          "10/03/2026",
          "Dividendo",
          "WEGE3 - WEG",
          BTG,
          100,
          1,
          100,
        ]),
      ),
    ],
    DAY,
  );
  assert.equal(preview.probable.length, 1);
  assert.equal(preview.incomes.length, 0);
});

test("ativo fora da lista aguarda cadastro sem travar os demais", async () => {
  const preview = await buildPreview(
    v4({}),
    [
      parse(
        negociacao(
          buy("02/03/2026", "HGLG11", 10, 100),
          buy("02/03/2026", "WEGE3", 10, 10),
          buy("03/03/2026", "XPTO3", 5, 10),
          sell("04/03/2026", "XPTO3", 5, 12),
        ),
      ),
    ],
    DAY,
  );
  assert.deepEqual(
    preview.trades.map((t) => t.item.ticker),
    ["WEGE3"],
  );
  assert.deepEqual(preview.unknown, [
    { ticker: "HGLG11", rows: 1, closed: false, net: 10, currency: "BRL" },
    { ticker: "XPTO3", rows: 2, closed: true, net: 0, currency: "BRL" },
  ]);
});

test("depois de cadastrar, as linhas do ativo entram", async () => {
  const p = v4({
    customAssets: [
      {
        ticker: "HGLG11",
        symbol: "HGLG11.SA",
        name: "Fundo fictício",
        group: "br",
        currency: "BRL",
        sector: "FII",
        color: "#626b99",
        query: "HGLG11",
        segment: "fii",
      },
    ],
  });
  const preview = await buildPreview(
    p,
    [parse(negociacao(buy("02/03/2026", "HGLG11", 10, 100)))],
    DAY,
  );
  assert.equal(preview.unknown.length, 0);
  const next = applyPreview(p, preview);
  assert.equal(portfolioSchema.safeParse(next).success, true);
  near(row(next, "HGLG11").quantity, 10, "quantidade");
});

test("venda sem compra anterior no arquivo não cria posição negativa", async () => {
  const preview = await buildPreview(
    v4({}),
    [
      parse(
        negociacao(
          sell("02/01/2026", "WEGE3", 50, 12),
          buy("02/03/2026", "WEGE3", 10, 10),
        ),
      ),
    ],
    DAY,
  );
  assert.equal(preview.trades.length, 1);
  assert.equal(preview.trades[0].item.kind, "buy");
  assert.ok(
    preview.ignored.some((n) => n.reason.includes("sem compra anterior")),
  );
  assert.equal(
    portfolioSchema.safeParse(applyPreview(v4({}), preview)).success,
    true,
  );
});

test("venda maior que o saldo trava o ativo e pede decisão", async () => {
  const preview = await buildPreview(
    v4({}),
    [
      parse(
        negociacao(
          buy("02/01/2026", "WEGE3", 10, 10),
          sell("02/03/2026", "WEGE3", 50, 12),
          buy("02/03/2026", "ITUB4", 5, 10),
        ),
      ),
    ],
    DAY,
  );
  assert.deepEqual(
    preview.trades.map((t) => t.item.ticker),
    ["ITUB4"],
  );
  assert.equal(
    preview.decisions.filter((d) => d.reason.includes("incompleto")).length,
    2,
  );
});

test("posição inicial que o histórico explica deixa de somar", async () => {
  const p = v4({
    transactions: [lot("WEGE3", 60, 10, { date: "2026-10-01" })],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        negociacao(
          buy("02/03/2026", "WEGE3", 100, 10),
          sell("04/03/2026", "WEGE3", 40, 12),
        ),
      ),
    ],
    DAY,
  );
  assert.deepEqual(preview.reconcile, [p.transactions[0].id]);
  assert.deepEqual(preview.impact, []);
  const next = applyPreview(p, preview);
  assert.equal(next.transactions[0].reconciled, true);
  near(row(next, "WEGE3").quantity, 60, "quantidade igual");
  near(row(next, "WEGE3").primaryCost, 600, "custo vindo do histórico");
  assert.equal(portfolioSchema.safeParse(next).success, true);
});

test("histórico que não fecha mantém a posição inicial e avisa", async () => {
  const p = v4({
    transactions: [lot("WEGE3", 60, 10, { date: "2026-10-01" })],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        negociacao(
          buy("02/03/2026", "WEGE3", 10, 10),
          buy("10/10/2026", "WEGE3", 5, 10),
        ),
      ),
    ],
    DAY,
  );
  assert.equal(preview.reconcile.length, 0);
  assert.ok(preview.warnings.some((w) => w.includes("explicadas por ela")));
  // 60 da posição inicial + 5 posteriores. A compra anterior está contida nela.
  assert.deepEqual(preview.impact, [
    { ticker: "WEGE3", before: 60, after: 65 },
  ]);
});

test("evento societário importado ajusta a posição", async () => {
  const p = v4({});
  const preview = await buildPreview(
    p,
    [
      parse(negociacao(buy("02/03/2026", "WEGE3", 100, 10)), "n.xlsx"),
      parse(
        movimentacao([
          "Credito",
          "10/04/2026",
          "Desdobro",
          "WEGE3 - WEG",
          BTG,
          100,
          "-",
          "-",
        ]),
        "m.xlsx",
      ),
    ],
    DAY,
  );
  assert.equal(preview.actions.length, 1);
  const next = applyPreview(p, preview);
  assert.equal(portfolioSchema.safeParse(next).success, true);
  near(row(next, "WEGE3").quantity, 200, "quantidade");
  near(row(next, "WEGE3").primaryCost, 1000, "custo preservado");
  const again = await buildPreview(
    next,
    [
      parse(
        movimentacao([
          "Credito",
          "10/04/2026",
          "Desdobro",
          "WEGE3 - WEG",
          BTG,
          100,
          "-",
          "-",
        ]),
        "m.xlsx",
      ),
    ],
    DAY,
  );
  assert.equal(again.actions.length, 0, "reimportar não desdobra de novo");
  assert.equal(again.duplicates.length, 1);
});

test("só Movimentação: avisa que faltam compras e vendas", async () => {
  const preview = await buildPreview(
    v4({}),
    [
      parse(
        movimentacao([
          "Credito",
          "02/03/2026",
          "Transferência - Liquidação",
          "WEGE3 - WEG",
          BTG,
          10,
          10,
          100,
        ]),
      ),
    ],
    DAY,
  );
  assert.ok(preview.warnings.some((w) => w.includes("Negociação")));
});

test("carteira antiga sem versão é migrada antes da prévia", async () => {
  const legacy = portfolio({
    transactions: [lot("WEGE3", 10, 10, { date: "2026-10-01" })],
    tradeHistory: [trade("WEGE3", "buy", 10, 10, "2026-03-02")],
  });
  const next = applyPreview(legacy, await buildPreview(legacy, [], DAY));
  assert.equal(next.schemaVersion, PORTFOLIO_SCHEMA);
  assert.equal(next.transactions[0].reconciled, true);
});

// Regras que vieram do relatório real. Os valores continuam inventados.

test("cabeçalhos e mercados do relatório real", () => {
  // Formato confirmado: mercado à vista, fracionário e "Renda Fixa" para ETF listado.
  const file = parse(
    negociacao(
      [
        "02/03/2026",
        "Compra",
        "Mercado à Vista",
        "-",
        BTG,
        "WEGE3",
        100,
        10,
        1000,
      ],
      [
        "03/03/2026",
        "Compra",
        "Mercado Fracionário",
        "-",
        BTG,
        "WEGE3F",
        7,
        10,
        70,
      ],
      ["04/03/2026", "Compra", "Renda Fixa", "-", BTG, "AUPO11", 3, 100, 300],
      [
        "05/03/2026",
        "Compra",
        "Renda Fixa",
        "14/04/2028",
        BTG,
        "CDB12345",
        1,
        100,
        100,
      ],
    ),
  );
  assert.deepEqual(
    file.trades.map((t) => t.ticker),
    ["WEGE3", "WEGE3", "AUPO11"],
  );
  assert.equal(file.decisions.length, 1, "título sem código de bolsa");
  assert.equal(normalizeInstitution("XP INVESTIMENTOS CCTVM S/A"), "XP");
});

test("registro antigo com data de liquidação é a mesma operação", async () => {
  // Negócio em 02/03; o registro antigo traz a liquidação, 4 dias depois.
  const id = crypto.randomUUID();
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 100, 10, "2026-03-06", { id, fees: 2 }),
    ],
  });
  const rows = negociacao(buy("02/03/2026", "WEGE3", 100, 10));
  const preview = await buildPreview(p, [parse(rows)], DAY);
  assert.equal(preview.trades.length, 0, "não duplica");
  assert.equal(preview.matched.length, 1);
  assert.deepEqual(preview.impact, []);
  const next = applyPreview(p, preview);
  assert.equal(next.tradeHistory.length, 1);
  assert.equal(next.tradeHistory[0].id, id, "mantém o registro");
  assert.equal(next.tradeHistory[0].date, "2026-03-02", "data do negócio");
  assert.equal(next.tradeHistory[0].institution, "BTG");
  assert.equal(next.tradeHistory[0].fees, 2, "preserva as taxas");
  assert.ok(next.tradeHistory[0].importKey);
  near(row(next, "WEGE3").quantity, 100, "quantidade");
  assert.equal(portfolioSchema.safeParse(next).success, true);
  const again = await buildPreview(next, [parse(rows)], DAY);
  assert.equal(
    again.duplicates.length,
    1,
    "reimportar agora é duplicata exata",
  );
  assert.equal(again.matched.length, 0);
});

test("execuções iguais usam um registro antigo cada", async () => {
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 10, 10, "2026-03-04")],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        negociacao(
          buy("02/03/2026", "WEGE3", 10, 10),
          buy("02/03/2026", "WEGE3", 10, 10),
        ),
      ),
    ],
    DAY,
  );
  assert.equal(preview.matched.length, 1);
  assert.equal(preview.trades.length, 1);
  assert.deepEqual(preview.impact, [
    { ticker: "WEGE3", before: 10, after: 20 },
  ]);
});

test("mesma quantidade com outro preço vira provável duplicado", async () => {
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 10, 12, "2026-03-04")],
  });
  const preview = await buildPreview(
    p,
    [parse(negociacao(buy("02/03/2026", "WEGE3", 10, 10)))],
    DAY,
  );
  assert.equal(preview.matched.length, 0);
  assert.equal(preview.probable.length, 1);
  assert.equal(preview.trades.length, 0);
});

test("fora da janela de liquidação é outra operação", async () => {
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 10, 10, "2026-03-20"),
      trade("WEGE3", "buy", 10, 10, "2026-03-01"),
    ],
  });
  const preview = await buildPreview(
    p,
    [parse(negociacao(buy("02/03/2026", "WEGE3", 10, 10)))],
    DAY,
  );
  assert.equal(
    preview.matched.length,
    0,
    "o registro não pode vir antes do negócio",
  );
  assert.equal(preview.trades.length, 1);
});

test("registro da carteira ausente do arquivo gera aviso e continua valendo", async () => {
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 10, 10, "2026-03-04"),
      trade("WEGE3", "buy", 7, 10, "2026-03-05"),
    ],
  });
  const preview = await buildPreview(
    p,
    [parse(negociacao(buy("02/03/2026", "WEGE3", 10, 10)))],
    DAY,
  );
  assert.ok(preview.warnings.some((w) => w.includes("não aparece")));
  near(row(applyPreview(p, preview), "WEGE3").quantity, 17, "quantidade");
});

test("venda antiga casa pela data do negócio, sem falso saldo negativo", async () => {
  // Venda antiga liquidada em 10/03. A nova compra de 08/03 precisa vir antes dela.
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 5, 10, "2026-03-03"),
      trade("WEGE3", "sell", 10, 12, "2026-03-10"),
    ],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        negociacao(
          buy("01/03/2026", "WEGE3", 5, 10),
          buy("05/03/2026", "WEGE3", 5, 10),
          sell("08/03/2026", "WEGE3", 10, 12),
        ),
      ),
    ],
    DAY,
  );
  assert.equal(preview.decisions.length, 0);
  assert.equal(preview.matched.length, 2);
  assert.equal(preview.trades.length, 1);
  assert.equal(
    portfolioSchema.safeParse(applyPreview(p, preview)).success,
    true,
  );
});

test("ativo encerrado fica só no histórico, com venda maior que as compras", async () => {
  // Comprou 4 antes do arquivo. No arquivo: compra 10 a 10, vende 14 a 20.
  const rows = negociacao(
    buy("02/03/2026", "ANTG3", 10, 10),
    sell("04/03/2026", "ANTG3", 14, 20),
  );
  const first = await buildPreview(v4({}), [parse(rows)], DAY);
  assert.deepEqual(first.unknown, [
    { ticker: "ANTG3", rows: 2, closed: true, net: -4, currency: "BRL" },
  ]);
  const p = v4({ customAssets: [archivedAsset("ANTG3")] });
  const preview = await buildPreview(p, [parse(rows)], DAY);
  assert.equal(preview.trades.length, 2);
  assert.equal(preview.decisions.length, 0);
  const next = applyPreview(p, preview);
  assert.equal(portfolioSchema.safeParse(next).success, true);
  // Só as 10 cotas com custo conhecido entram: 10 × 20 − 100 = 100.
  near(realizedResults(next).BRL.result, 100, "realizado");
  near(row(next, "ANTG3").quantity, 0, "sem posição");
});

test("encerrado com saldo no arquivo não bloqueia o patrimônio", async () => {
  // Evento societário sem venda: sobra saldo no arquivo, mas o ativo não existe mais.
  const p = v4({
    customAssets: [archivedAsset("ZZZZ3")],
    transactions: [lot("WEGE3", 10, 10)],
  });
  const next = applyPreview(
    p,
    await buildPreview(
      p,
      [parse(negociacao(buy("02/03/2026", "ZZZZ3", 3, 10)))],
      DAY,
    ),
  );
  const m = market(quote("WEGE3", 10, { previous: 9 }));
  const t = totals(next, m);
  assert.equal(t.missing.length, 0);
  near(t.value, 100, "fora do patrimônio");
  near(dayChange(next, m).amount, 10, "fora da variação do dia");
  assert.deepEqual(
    (
      await buildPreview(
        p,
        [parse(negociacao(buy("02/03/2026", "ZZZZ3", 3, 10)))],
        DAY,
      )
    ).impact,
    [],
  );
});

test("registro antigo que soma execuções do dia vira uma linha por execução", async () => {
  // Negócio em 02/03: 100 a 10 e 80 a 10,50 = 1840. Antigo: 180 liquidadas em 06/03.
  const id = crypto.randomUUID();
  const p = v4({
    tradeHistory: [
      trade("WEGE3", "buy", 180, 1840 / 180, "2026-03-06", {
        id,
        total: 1840,
        fees: 18.4,
      }),
    ],
  });
  const rows = negociacao(
    buy("02/03/2026", "WEGE3", 100, 10),
    buy("02/03/2026", "WEGE3", 80, 10.5),
  );
  const preview = await buildPreview(p, [parse(rows)], DAY);
  assert.equal(preview.trades.length, 0, "não duplica");
  assert.equal(preview.matched.length, 2);
  assert.deepEqual(preview.impact, []);
  assert.equal(preview.warnings.length, 0, "o registro antigo foi reconhecido");
  const next = applyPreview(p, preview);
  assert.equal(next.tradeHistory.length, 2);
  near(next.tradeHistory[0].fees + next.tradeHistory[1].fees, 18.4, "taxas");
  near(row(next, "WEGE3").quantity, 180, "quantidade");
  near(row(next, "WEGE3").primaryCost, 1858.4, "custo igual");
  assert.equal(portfolioSchema.safeParse(next).success, true);
  const again = await buildPreview(next, [parse(rows)], DAY);
  assert.equal(again.duplicates.length, 2, "reimportar é duplicata exata");
});

test("soma de execuções com outro valor não é a mesma operação", async () => {
  const p = v4({
    tradeHistory: [trade("WEGE3", "buy", 180, 20, "2026-03-06")],
  });
  const preview = await buildPreview(
    p,
    [
      parse(
        negociacao(
          buy("02/03/2026", "WEGE3", 100, 10),
          buy("02/03/2026", "WEGE3", 80, 10.5),
        ),
      ),
    ],
    DAY,
  );
  assert.equal(preview.matched.length, 0);
  assert.equal(preview.trades.length, 2);
  assert.ok(preview.warnings.some((w) => w.includes("não aparece")));
});
