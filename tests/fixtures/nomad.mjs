// Extratos fictícios que imitam a estrutura dos extratos mensais da Nomad, nas duas
// versões que existem: em inglês, com número como "1,234.56", e em português, com
// número como "123,45". Fundos, códigos, datas e valores são todos inventados.

export const FUNDO = "ZZFA";
export const OUTRO = "ZZFB";

const HEADER_EN = [
  "Corretora Ficticia Inc.",
  "Rua Inventada, 100",
  "Account Statement",
  "PESSOA FICTICIA",
  "Account Number:  0000000",
];
const TRADING_EN = [
  "Activity  Trade  Settle  Description  Symbol  Quantity  Price($)  Net  Commission($)  Transaction  Additional  Capacity",
  "Type  Date  Date  CUSIP  Amount($)  Fee($)  Fees($)",
];
const ACTIVITY_EN = [
  "Date  Activity Type  Description  Symbol  Quantity  Amount($)  Transaction",
  "CUSIP  Fee($)",
];

/** Linhas de um extrato em inglês, como a leitura do PDF as devolve. */
export const statementEn = ({
  start = "2026-03-01",
  end = "2026-03-31",
  trades = [],
  pending = [],
  activity = [],
  dividends = null,
} = {}) => [
  ...HEADER_EN,
  `Statement Date:  ${start} - ${end}`,
  "ACCOUNT SUMMARY",
  "Opening Balance  Closing Balance",
  "Cash Balance  0.00  0.00",
  "Securities Valuation  1,000.50  1,234.56",
  "INCOME AND EXPENSE SUMMARY",
  "This Period  Year to Date",
  ...(dividends === null ? [] : [`Dividends  ${dividends}  ${dividends}`]),
  "PORTFOLIO",
  "TRADING ACTIVITIES",
  ...TRADING_EN,
  ...(trades.length ? trades : ["No Information to be displayed"]),
  "TRADING ACTIVITY PENDING SETTLEMENT",
  ...TRADING_EN,
  ...(pending.length ? pending : ["No Information to be displayed"]),
  "NON-TRADING ACTIVITY",
  ...ACTIVITY_EN,
  ...(activity.length ? activity : ["No Information to be displayed"]),
  "Investment objectives and Financial information",
  "Disclosures",
];

/** A versão em português quebra os títulos em linhas e usa vírgula nos valores. */
export const statementPt = ({
  start = "2025-12-01",
  end = "2025-12-31",
  trades = [],
  activity = [],
} = {}) => [
  "Avenida Inventada, 200",
  "PESSOA FICTICIA",
  `Data do extrato:  ${start} - ${end}`,
  "RESUMO DA CONTA",
  "Saldo inicial  Saldo final",
  "Saldo disponível  0,00  0,00",
  "CARTEIRA",
  "ATIVIDADES DE",
  "NEGOCIAÇÃO",
  ...(trades.length ? trades : ["Nenhuma informação a exibir"]),
  "ATIVIDADE DE NEGOCIAÇÃO PENDENTE DE",
  "LIQUIDAÇÃO",
  "Nenhuma informação a exibir",
  "ATIVIDADE NÃO",
  "RELACIONADA À",
  "NEGOCIAÇÃO",
  ...(activity.length ? activity : ["Nenhuma informação a exibir"]),
];

export const buyEn = (date, ticker, quantity, price, net, fees = "0.00") =>
  `BUY  ${date}  ${date}  FUNDO FICTICIO DE INDICE ETF  ${ticker}  ${quantity}  ${price}  ${net}  ${fees}  0.00  0.00  AGENCY`;
export const sellEn = (date, ticker, quantity, price, net) =>
  `SELL  ${date}  ${date}  FUNDO FICTICIO DE INDICE ETF  ${ticker}  ${quantity}  ${price}  ${net}  0.00  0.00  0.00  AGENCY`;
/** Dividendo com o valor bruto, e o texto em várias linhas, como no extrato. */
export const dividendEn = (date, ticker, rate, shares, amount, tax = "30%") => [
  `${date}  CASH_DIVIDEND  FUNDO FICTICIO DE INDICE ETF Cash Div  ${ticker}  0.00  ${amount}  0.00`,
  `of ${rate} on ${shares} shs. Rec 01/02/26 Pay 01/05/26.  000000000`,
  "NON-QUALIFIED DIVIDEND" + (tax ? ` With ${tax} NON Resident` : ""),
  "Alien Withholding Deductions",
];
/** Na versão em português, o código fica no meio do texto do dividendo. */
export const dividendPt = (date, ticker, rate, shares, amount) => [
  `${date}  CASH_DIVIDEND  FUNDO FICTICIO DE INDICE ETF Cash Div of ${rate} on  ${ticker}  0  ${amount}  0,00`,
  `${shares} shs. Rec 01/02/26 Pay 01/05/26. NON-QUALIFIED  000000000`,
  "DIVIDEND With 30% NON Resident Alien Withholding",
  "Deductions",
];

const escapePdf = (text) =>
  text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Largura folgada de um caractere na fonte usada, em pontos. */
const CHAR_WIDTH = 5.2;

/** Monta um PDF mínimo e válido: cada linha vira uma linha de texto, com as colunas
 * (separadas por dois espaços) em posições diferentes, como em um extrato de verdade. */
export function buildPdf(lines) {
  const body = lines
    .map((line, index) => {
      const y = 780 - index * 11;
      let x = 30;
      return line
        .split(/\s{2,}/)
        .map((cell) => {
          const text = `BT /F1 7 Tf ${x} ${y} Td (${escapePdf(cell)}) Tj ET`;
          x += cell.length * CHAR_WIDTH + 12;
          return text;
        })
        .join("\n");
    })
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2400 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Um byte por caractere, com os acentos do português: as posições do índice batem.
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}
