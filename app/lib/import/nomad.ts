// Extrato mensal da Nomad, em PDF. O layout foi conferido com extratos reais.
//
// Três variações convivem nos arquivos, às vezes de um mês para o outro: títulos em
// português ou em inglês; números como "1,234.56" ou "123,45"; e o dividendo mostrado
// líquido em alguns meses e bruto em outros. Os extratos mais antigos só trazem o nome
// da corretora no logotipo: por isso o arquivo é reconhecido pela estrutura.
import {
  normalize,
  type ParsedFile,
  type ParsedNote,
  type ParsedTrade,
} from "./b3.ts";

export const NOMAD = "Nomad";

/** O último separador é o decimal. Sem vírgula, o ponto é decimal, como em "0.12345". */
export function statementNumber(text: string): number | null {
  const clean = text.trim();
  if (!/\d/.test(clean)) return null;
  const digits =
    clean.lastIndexOf(",") > clean.lastIndexOf(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

const NUM = String.raw`(-?[\d.,]+)`,
  DATE = String.raw`(\d{4}-\d{2}-\d{2})`,
  SYMBOL = String.raw`([A-Z][A-Z.]{0,6})`;
const TRADE = new RegExp(
  `^(BUY|SELL)\\s+${DATE}\\s+${DATE}\\s+.*?\\s+${SYMBOL}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+[A-Z]+$`,
);
const ACTIVITY = new RegExp(
  `^${DATE}\\s+([A-Z][A-Z_]+)\\s+(.*?)(?:\\s+${SYMBOL})?\\s+${NUM}\\s+${NUM}\\s+${NUM}$`,
);
const PERIOD = new RegExp(
  `(?:statement date|data do extrato):?\\s*${DATE}\\s*-\\s*${DATE}`,
);
const PERIOD_DIVIDENDS = new RegExp(`^dividend(?:s|os)\\s+${NUM}\\s+${NUM}$`);
/** Texto do dividendo: "Cash Div of 0.5 on 10.25 shs" seguido da retenção. */
const DIVIDEND = /Cash Div\s+of\s+([\d.]+)\s+on\s+([\d.]+)\s+shs/i;
const WITHHOLDING = /With\s+(\d+(?:\.\d+)?)%/i;
/** O texto do dividendo continua nas linhas seguintes, até a próxima movimentação. */
const DIVIDEND_LINES = 5;
/** Quantidade × preço arredonda para o centavo, e as frações somam mais um. */
const TRADE_TOLERANCE = 0.02;

type Section = "trading" | "pending" | "other";
function sectionOf(plain: string): Section | null {
  // Os títulos em português quebram em duas ou três linhas: basta o começo.
  if (/pending settlement|pendente de/.test(plain)) return "pending";
  if (/^non-trading activity|^atividade nao/.test(plain)) return "other";
  if (/^trading activities|^atividades de( negociacao)?$/.test(plain))
    return "trading";
  return null;
}

const toCents = (value: number) => Math.round(value * 100);

type OpenDividend = {
  line: number;
  date: string;
  ticker: string | undefined;
  shown: number;
  text: string;
  extra: number;
};

/** Lê as linhas de um extrato. Devolve null quando o PDF não é um extrato conhecido. */
export function parseNomadStatement(
  lines: string[],
  fileName: string,
): ParsedFile | null {
  const plainLines = lines.map(normalize);
  const period = plainLines.map((l) => PERIOD.exec(l)).find(Boolean);
  if (
    !period ||
    !plainLines.some((l) => sectionOf(l) === "trading") ||
    !plainLines.some((l) => sectionOf(l) === "other")
  )
    return null;
  const file: ParsedFile = {
    format: "nomad-extrato",
    fileName,
    sheet: `${period[1]} a ${period[2]}`,
    currency: "USD",
    trades: [],
    incomes: [],
    actions: [],
    ignored: [],
    decisions: [],
    warnings: [],
  };
  const note = (
    line: number,
    label: string,
    reason: string,
    extra: Partial<ParsedNote> = {},
  ): ParsedNote => ({
    line,
    date: null,
    ticker: null,
    label,
    quantity: null,
    amount: null,
    institution: NOMAD,
    reason,
    ...extra,
  });

  let section: Section | null = null,
    open: OpenDividend | null = null,
    periodNet: number | null = null,
    unreadDividend = false;

  const closeDividend = () => {
    if (!open) return;
    const { line, date, ticker, shown, text } = open;
    open = null;
    const facts = { date, ticker: ticker ?? null, amount: shown };
    const refuse = (reason: string) => {
      unreadDividend = true;
      file.decisions.push(note(line, "Dividendo", reason, facts));
    };
    if (!ticker) return refuse("Dividendo sem o código do ativo.");
    if (shown <= 0)
      return refuse("Dividendo negativo: confira se é um estorno.");
    const paid = DIVIDEND.exec(text),
      withholding = WITHHOLDING.exec(text);
    if (!paid) return refuse("Sem a taxa por cota no texto do dividendo.");
    if (!withholding) return refuse("Sem a alíquota de retenção no texto.");
    const expected = toCents(Number(paid[1]) * Number(paid[2])),
      cents = toCents(shown),
      rate = Number(withholding[1]);
    const withheldOf = (gross: number) => Math.round((gross * rate) / 100);
    let gross: number;
    // O bruto é taxa × cotas. O que não for o bruto precisa ser o líquido.
    if (Math.abs(cents - expected) <= 1) gross = cents;
    else if (Math.abs(cents - (expected - withheldOf(expected))) <= 1)
      gross = expected;
    else return refuse("O valor não bate com a taxa por cota × a quantidade.");
    const withheld = withheldOf(gross);
    file.incomes.push({
      line,
      date,
      ticker,
      type: "dividend",
      label: "Dividendo",
      amount: (gross - withheld) / 100,
      institution: NOMAD,
      gross: gross / 100,
      withheldTax: withheld / 100,
    });
  };

  const readTrade = (line: string, index: number, pending: boolean) => {
    const match = TRADE.exec(line);
    if (!match) {
      file.decisions.push(
        note(
          index + 1,
          line.slice(0, 80),
          "Operação que não consegui ler: registre à mão, conferindo no extrato.",
        ),
      );
      return;
    }
    const [, side, date, , ticker, ...raw] = match;
    const [quantity, price, net, commission, fee, additional] =
      raw.map(statementNumber);
    const label = side === "BUY" ? "Compra" : "Venda";
    const facts = {
      date,
      ticker,
      quantity,
      amount: net,
    };
    if (
      !quantity ||
      !price ||
      !net ||
      commission === null ||
      fee === null ||
      additional === null ||
      quantity < 0 ||
      price < 0 ||
      net < 0
    ) {
      file.decisions.push(
        note(index + 1, label, "Faltam quantidade, preço ou valor.", facts),
      );
      return;
    }
    if (pending) {
      file.ignored.push(
        note(
          index + 1,
          label,
          "Ainda não liquidada: a operação virá no extrato do mês seguinte.",
          facts,
        ),
      );
      return;
    }
    const fees = commission + fee + additional;
    // O valor líquido já inclui as taxas, que o livro guarda à parte do custo.
    const total = side === "BUY" ? net - fees : net + fees;
    if (Math.abs(quantity * price - total) > TRADE_TOLERANCE) {
      file.decisions.push(
        note(
          index + 1,
          label,
          "Quantidade × preço não bate com o valor: confira no extrato.",
          facts,
        ),
      );
      return;
    }
    const trade: ParsedTrade = {
      line: index + 1,
      date,
      ticker,
      kind: side === "BUY" ? "buy" : "sell",
      quantity,
      price,
      total,
      institution: NOMAD,
      ...(fees > 0 ? { fees, feesCurrency: "USD" as const } : {}),
    };
    file.trades.push(trade);
  };

  const readActivity = (line: string, index: number) => {
    const match = ACTIVITY.exec(line);
    if (!match) {
      file.decisions.push(
        note(
          index + 1,
          line.slice(0, 80),
          "Movimentação que não consegui ler: confira no extrato.",
        ),
      );
      return;
    }
    const [, date, kind, description, ticker, , rawAmount] = match;
    const amount = statementNumber(rawAmount);
    const facts = { date, ticker: ticker ?? null, amount };
    if (kind === "CASH_DIVIDEND" && amount !== null) {
      open = {
        line: index + 1,
        date,
        ticker,
        shown: amount,
        text: description,
        extra: 0,
      };
      return;
    }
    if (kind === "DEPOSIT")
      file.ignored.push(
        note(
          index + 1,
          "Remessa",
          "A compra vem das operações. O extrato não traz o câmbio da remessa.",
          facts,
        ),
      );
    else if (kind === "SWEEP")
      file.ignored.push(
        note(
          index + 1,
          "Saldo em dólar",
          "Movimentação interna do saldo, sem efeito na posição.",
          facts,
        ),
      );
    else
      file.decisions.push(
        note(
          index + 1,
          kind,
          "Tipo de movimentação desconhecido. Registre à mão se afetar a carteira.",
          facts,
        ),
      );
  };

  lines.forEach((raw, index) => {
    const line = raw.trim(),
      plain = plainLines[index];
    const dividends = PERIOD_DIVIDENDS.exec(plain);
    if (dividends) periodNet = statementNumber(dividends[1]);
    const next = sectionOf(plain);
    if (next) {
      closeDividend();
      section = next;
      return;
    }
    if (section === "trading" || section === "pending") {
      if (/^[A-Z_]+\s+\d{4}-\d{2}-\d{2}\b/.test(line))
        readTrade(line, index, section === "pending");
      return;
    }
    if (section !== "other") return;
    if (/^\d{4}-\d{2}-\d{2}\b/.test(line)) {
      closeDividend();
      readActivity(line, index);
      return;
    }
    if (open) {
      const current: OpenDividend = open;
      current.text += " " + line;
      if (++current.extra >= DIVIDEND_LINES) closeDividend();
    }
  });
  closeDividend();

  // O resumo traz o líquido do mês: confirma a conta de bruto e retenção.
  const net = file.incomes.reduce((sum, i) => sum + toCents(i.amount), 0);
  if (
    periodNet !== null &&
    !unreadDividend &&
    Math.abs(net - toCents(periodNet)) > 1
  )
    file.warnings?.push(
      `${fileName}: os dividendos líquidos somam ${(net / 100).toFixed(2)}, e o resumo do extrato informa ${(periodNet as number).toFixed(2)}. Confira antes de confirmar.`,
    );
  return file;
}
