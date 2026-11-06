// Leitura do texto de um PDF, no mesmo formato em que o navegador lê. Só dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import { linesOfPage, readPdfLines } from "../app/lib/import/pdf.ts";
import { buildPdf } from "./fixtures/nomad.mjs";

test("lê o texto de um PDF, com as colunas separadas", async () => {
  const bytes = buildPdf(["Título fictício", "Coluna A  Coluna B  10,50"]);
  assert.deepEqual(await readPdfLines(bytes), [
    "Título fictício",
    "Coluna A  Coluna B  10,50",
  ]);
  assert.ok(bytes.length > 0, "o arquivo original continua utilizável");
});

test("linhas da página: colunas, ordem de leitura e linhas diferentes", () => {
  assert.deepEqual(
    linesOfPage([
      { x: 100, y: 700, width: 20, text: "B" },
      { x: 10, y: 700.5, width: 20, text: "A" },
      { x: 10, y: 690, width: 20, text: "C" },
      { x: 32, y: 690, width: 5, text: "D" },
      { x: 10, y: 680, width: 20, text: "   " },
    ]),
    ["A  B", "C D"],
  );
});

test("PDF inválido dá mensagem clara e não quebra", async () => {
  await assert.rejects(
    readPdfLines(new TextEncoder().encode("isto não é um pdf")),
    /não foi possível ler este PDF/,
  );
});

