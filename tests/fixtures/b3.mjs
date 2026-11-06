// Planilhas fictícias que imitam a estrutura dos relatórios da B3. Valores inventados.
// Os cabeçalhos seguem importadores abertos e serão conferidos com um arquivo real.
import { strToU8, zipSync } from "fflate";

export const NEGOCIACAO_HEADER = [
  "Data do Negócio",
  "Tipo de Movimentação",
  "Mercado",
  "Prazo/Vencimento",
  "Instituição",
  "Código de Negociação",
  "Quantidade",
  "Preço",
  "Valor",
];
export const MOVIMENTACAO_HEADER = [
  "Entrada/Saída",
  "Data",
  "Movimentação",
  "Produto",
  "Instituição",
  "Quantidade",
  "Preço unitário",
  "Valor da Operação",
];
export const BTG = "BTG PACTUAL CTVM S/A";
export const NU = "NU INVEST CORRETORA DE VALORES S.A.";

export const negociacao = (...rows) => [NEGOCIACAO_HEADER, ...rows];
export const movimentacao = (...rows) => [MOVIMENTACAO_HEADER, ...rows];

const escape = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const column = (index) => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** Monta um .xlsx mínimo, com textos compartilhados, como o Excel faz. */
export function buildXlsx(rows, sheetName = "Negociação") {
  const shared = [];
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null || cell === undefined) return "";
          const ref = `${column(c)}${r + 1}`;
          if (typeof cell === "number")
            return `<c r="${ref}"><v>${cell}</v></c>`;
          shared.push(cell);
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(
      `<workbook xmlns:r="x"><sheets><sheet name="${escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId1" Type="w" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<sst>${shared.map((s) => `<si><t xml:space="preserve">${escape(s)}</t></si>`).join("")}</sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  });
}

export const buildCsv = (rows, delimiter = ";") =>
  strToU8(
    rows
      .map((row) => row.map((cell) => cell ?? "").join(delimiter))
      .join("\r\n"),
  );
