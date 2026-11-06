// Cálculos novos do painel: variação do dia e eixo do gráfico. Contas à mão.
import test from "node:test";
import assert from "node:assert/strict";
import { dayChange } from "../app/lib/model.ts";
import { niceAxis } from "../app/lib/chart-axis.ts";
import { lot, market, near, portfolio, quote } from "./fixtures/auditoria.mjs";

test("variação do dia em reais, com o dólar", () => {
  // WEGE3: 100 × 10 → 100 × 11 = +100. VOO: 10 × 100 × 5 = 5000 → 10 × 110 × 5,5 = 6050.
  // Antes 6000, agora 7150: +1150, +19,1667%.
  const p = portfolio({
    transactions: [lot("WEGE3", 100, 8), lot("VOO", 10, 50)],
  });
  const m = market(
    quote("WEGE3", 11, { previous: 10 }),
    quote("VOO", 110, { previous: 100 }),
    quote("USD", 5.5, { previous: 5 }),
  );
  const change = dayChange(p, m);
  near(change.amount, 1150, "valor");
  near(change.percent, (1150 / 6000) * 100, "percentual");
});

test("variação do dia ignora renda fixa e fica pendente sem cotação", () => {
  const fixedIncome = [
    {
      id: "cdb",
      name: "CDB",
      cost: 100,
      value: 900000,
      date: "2026-01-05",
      updatedAt: "2026-01-05",
    },
  ];
  const p = portfolio({ transactions: [lot("WEGE3", 10, 8)], fixedIncome });
  const change = dayChange(p, market(quote("WEGE3", 11, { previous: 10 })));
  near(change.amount, 10, "valor");
  near(change.percent, 10, "percentual sobre as posições cotadas");
  assert.equal(dayChange(p, market()), null, "cotação ausente");
  assert.equal(
    dayChange(p, market(quote("WEGE3", 11, { previous: 10, stale: true }))),
    null,
    "cotação desatualizada",
  );
  assert.equal(
    dayChange(portfolio(), market()),
    null,
    "sem posições cotadas não há variação",
  );
});

test("eixo do gráfico usa marcas redondas e enquadra os valores", () => {
  // Antes as marcas eram 44,9%, 29%, 14% e −1%.
  const axis = niceAxis([29.3, 44.9, 33]);
  assert.deepEqual(axis.ticks, [25, 30, 35, 40, 45]);
  assert.deepEqual(axis.domain, [25, 45]);
});

test("eixo do gráfico inclui o zero quando os valores o cruzam", () => {
  const axis = niceAxis([-3.2, 7.4]);
  assert.ok(axis.ticks.includes(0));
  assert.ok(axis.domain[0] <= -3.2 && axis.domain[1] >= 7.4);
});

test("eixo do gráfico lida com série plana, vazia e valores pequenos", () => {
  assert.deepEqual(niceAxis([]).domain, [-1, 1]);
  const flat = niceAxis([0, 0]);
  assert.ok(flat.domain[0] < 0 && flat.domain[1] > 0);
  const tiny = niceAxis([0.12, 0.34]);
  assert.ok(tiny.ticks.length >= 3 && tiny.ticks.length <= 7);
  assert.ok(tiny.domain[0] <= 0.12 && tiny.domain[1] >= 0.34);
  const huge = niceAxis([-400, 1900]);
  assert.ok(huge.ticks.length <= 7);
  for (const tick of tiny.ticks)
    assert.equal(Number(tick.toFixed(2)), tick, "sem ruído de ponto flutuante");
});
