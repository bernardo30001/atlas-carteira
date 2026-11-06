// Relatórios de Negociação e Movimentação da Área do Investidor da B3.
//
// A B3 não publica o layout. Os cabeçalhos vêm de importadores abertos de arquivos
// reais e ainda precisam de confirmação com um arquivo seu: por isso são comparados
// sem acentos e com sinônimos, e um layout desconhecido é recusado com clareza.
import type { Cell, Table } from "./table.ts";

export type ParsedTrade = {
  line: number;
  date: string;
  ticker: string;
  kind: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  institution: string;
  fraction?: boolean;
};
export type ParsedIncome = {
  line: number;
  date: string;
  ticker: string;
  type: "dividend" | "jcp" | "yield";
  label: string;
  amount: number;
  institution: string;
};
export type ParsedAction = {
  line: number;
  date: string;
  ticker: string;
  kind: "split" | "bonus";
  label: string;
  delta: number;
  unitCost?: number;
  institution: string;
};
export type ParsedNote = {
  line: number;
  date: string | null;
  ticker: string | null;
  label: string;
  quantity: number | null;
  amount: number | null;
  institution: string;
  reason: string;
};
export type ParsedFile = {
  format: "b3-negociacao" | "b3-movimentacao";
  fileName: string;
  sheet: string;
  trades: ParsedTrade[];
  incomes: ParsedIncome[];
  actions: ParsedAction[];
  /** Linhas sem efeito na carteira, com o motivo. */
  ignored: ParsedNote[];
  /** Linhas que dependem de você. Nunca são aplicadas sozinhas. */
  decisions: ParsedNote[];
};

export const normalize = (text: unknown) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Aceita número da planilha ou texto pt-BR como "R$ 1.234,56". Traço vira vazio. */
export function parseNumber(cell: Cell): number | null {
  if (cell === null) return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const text = cell.replace(/r\$|us\$|\s/gi, "");
  if (!text || /^[-–—]+$/.test(text)) return null;
  let digits = text;
  if (text.includes(",")) digits = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) digits = text.replace(/\./g, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/** Aceita dd/mm/aaaa, aaaa-mm-dd e o número de série do Excel. */
export function parseDate(cell: Cell): string | null {
  if (typeof cell === "number") {
    if (cell < 20000 || cell > 80000) return null;
    return new Date(Math.round((cell - 25569) * 86400000))
      .toISOString()
      .slice(0, 10);
  }
  if (!cell) return null;
  const text = cell.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  const iso = br
    ? `${br[3]}-${br[2]}-${br[1]}`
    : /^\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
  if (!iso) return null;
  const parsed = new Date(iso + "T00:00:00Z");
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

/** WEGE3F é WEGE3 no mercado fracionário. O resto do código não muda. */
export const normalizeTicker = (code: Cell) => {
  const text = String(code ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{4}\d{1,2}F$/.test(text) ? text.slice(0, -1) : text;
};

export function normalizeInstitution(raw: Cell) {
  const text = String(raw ?? "").trim();
  const plain = normalize(text);
  if (/\bnu\b|nubank|nu invest|easynvest/.test(plain)) return "Nu Invest";
  if (/\bbtg\b/.test(plain)) return "BTG";
  if (/\bxp\b/.test(plain)) return "XP";
  return text.slice(0, 100);
}

/** O produto vem como "WEGE3 - WEG S.A.". Renda fixa não tem código de negociação. */
function productTicker(product: Cell) {
  const first = String(product ?? "")
    .split(/\s+-\s+/)[0]
    .trim()
    .toUpperCase();
  return /^[A-Z]{4}\d{1,2}F?$/.test(first) ? normalizeTicker(first) : null;
}

const NEGOTIATION = {
  date: ["data do negocio", "data do pregao", "data"],
  side: ["tipo de movimentacao", "tipo de operacao", "compra/venda", "c/v"],
  market: ["mercado"],
  institution: ["instituicao", "corretora"],
  ticker: ["codigo de negociacao", "codigo", "ativo", "ticker", "produto"],
  quantity: ["quantidade", "qtde", "qtd"],
  price: ["preco", "preco unitario", "preco medio"],
  value: ["valor", "valor da operacao", "valor total"],
};
const MOVEMENT = {
  direction: ["entrada/saida", "credito/debito"],
  date: ["data", "data da movimentacao"],
  kind: ["movimentacao", "tipo de movimentacao"],
  product: ["produto", "ativo"],
  institution: ["instituicao", "corretora"],
  quantity: ["quantidade", "qtde", "qtd"],
  price: ["preco unitario", "preco"],
  value: ["valor da operacao", "valor", "valor liquido"],
};

type Columns<T> = { [K in keyof T]: number };
function locate<T extends Record<string, string[]>>(
  aliases: T,
  header: string[],
): Columns<T> {
  return Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [
      field,
      names.reduce<number>(
        (found, name) => (found >= 0 ? found : header.indexOf(name)),
        -1,
      ),
    ]),
  ) as Columns<T>;
}

type Detected =
  | {
      format: "b3-negociacao";
      row: number;
      columns: Columns<typeof NEGOTIATION>;
    }
  | {
      format: "b3-movimentacao";
      row: number;
      columns: Columns<typeof MOVEMENT>;
    };

function detect(rows: Cell[][]): Detected | null {
  // O cabeçalho pode não ser a primeira linha: há relatórios com título acima.
  for (let row = 0; row < Math.min(rows.length, 15); row++) {
    const header = rows[row].map(normalize);
    const movement = locate(MOVEMENT, header);
    if (
      movement.direction >= 0 &&
      movement.kind >= 0 &&
      movement.product >= 0 &&
      movement.date >= 0
    )
      return { format: "b3-movimentacao", row, columns: movement };
    const negotiation = locate(NEGOTIATION, header);
    if (
      negotiation.date >= 0 &&
      negotiation.side >= 0 &&
      negotiation.ticker >= 0 &&
      negotiation.quantity >= 0 &&
      (negotiation.price >= 0 || negotiation.value >= 0)
    )
      return { format: "b3-negociacao", row, columns: negotiation };
  }
  return null;
}

function parseNegotiation(
  rows: Cell[][],
  start: number,
  c: Columns<typeof NEGOTIATION>,
  file: ParsedFile,
) {
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((cell) => cell === null)) continue;
    const date = parseDate(row[c.date]),
      side = normalize(row[c.side]),
      rawTicker = String(row[c.ticker] ?? "").trim(),
      ticker = normalizeTicker(row[c.ticker]),
      quantity = parseNumber(row[c.quantity]),
      price = c.price >= 0 ? parseNumber(row[c.price]) : null,
      value = c.value >= 0 ? parseNumber(row[c.value]) : null,
      institution = normalizeInstitution(
        c.institution >= 0 ? row[c.institution] : "",
      ),
      market = c.market >= 0 ? normalize(row[c.market]) : "";
    const note = (reason: string): ParsedNote => ({
      line: i + 1,
      date,
      ticker: ticker || null,
      label: rawTicker || side || "Linha sem identificação",
      quantity,
      amount: value,
      institution,
      reason,
    });
    // Total ou rodapé: sem data e sem código, não é uma operação.
    if (!date && !ticker) {
      file.ignored.push(note("Linha de total ou texto do relatório."));
      continue;
    }
    if (!date || !ticker || !quantity || quantity <= 0) {
      file.decisions.push(note("Faltam data, código ou quantidade."));
      continue;
    }
    if (side !== "compra" && side !== "venda") {
      file.decisions.push(
        note(`Tipo desconhecido: ${row[c.side] ?? "vazio"}.`),
      );
      continue;
    }
    // ETF de renda fixa, como AUPO11, vem no mercado "Renda Fixa" com código de bolsa.
    const listed = /^[A-Z]{4}\d{1,2}$/.test(ticker);
    if (
      market &&
      !/vista|fracion/.test(market) &&
      !(market.includes("renda fixa") && listed)
    ) {
      file.decisions.push(
        note(`Mercado ainda não suportado: ${row[c.market]}.`),
      );
      continue;
    }
    const unit = price ?? (value !== null ? value / quantity : null);
    if (!unit || unit <= 0) {
      file.decisions.push(note("Sem preço nem valor."));
      continue;
    }
    file.trades.push({
      line: i + 1,
      date,
      ticker,
      kind: side === "compra" ? "buy" : "sell",
      quantity,
      price: unit,
      total: value ?? quantity * unit,
      institution,
    });
  }
}

const INCOME_TYPES: Record<string, ParsedIncome["type"]> = {
  dividendo: "dividend",
  dividendos: "dividend",
  "juros sobre capital proprio": "jcp",
  jcp: "jcp",
  rendimento: "yield",
  rendimentos: "yield",
};
const IGNORED_EVENTS: [RegExp, string][] = [
  [
    /^transferencia - liquidacao|^transferencia liquidacao|^liquidacao/,
    "Liquidação do negócio. A operação vem do relatório de Negociação.",
  ],
  [/^transferencia/, "Transferência de custódia não muda a posição."],
  [/^emprestimo/, "Aluguel de ativos não muda a posição."],
  [/^compra|^venda/, "Compras e vendas vêm do relatório de Negociação."],
  [/^fracao em ativos/, "A fração é tratada quando for vendida em leilão."],
  [/^cobranca|^taxa/, "Cobrança da custódia, fora do custo do ativo."],
];

function parseMovement(
  rows: Cell[][],
  start: number,
  c: Columns<typeof MOVEMENT>,
  file: ParsedFile,
) {
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((cell) => cell === null)) continue;
    const date = parseDate(row[c.date]),
      label = String(row[c.kind] ?? "").trim(),
      kind = normalize(label),
      product = String(row[c.product] ?? "").trim(),
      ticker = productTicker(row[c.product]),
      direction = normalize(row[c.direction]),
      credit = /credito|entrada/.test(direction),
      debit = /debito|saida/.test(direction),
      quantity = c.quantity >= 0 ? parseNumber(row[c.quantity]) : null,
      price = c.price >= 0 ? parseNumber(row[c.price]) : null,
      amount = c.value >= 0 ? parseNumber(row[c.value]) : null,
      institution = normalizeInstitution(
        c.institution >= 0 ? row[c.institution] : "",
      );
    const note = (reason: string): ParsedNote => ({
      line: i + 1,
      date,
      ticker,
      label:
        [label, product].filter(Boolean).join(" · ") ||
        "Linha sem identificação",
      quantity,
      amount,
      institution,
      reason,
    });
    if (!date && !label) {
      file.ignored.push(note("Linha de total ou texto do relatório."));
      continue;
    }
    if (!date) {
      file.decisions.push(note("Linha sem data."));
      continue;
    }
    const ignored = IGNORED_EVENTS.find(([pattern]) => pattern.test(kind));
    if (ignored) {
      file.ignored.push(note(ignored[1]));
      continue;
    }
    if (!ticker) {
      file.ignored.push(
        note("Produto sem código de negociação. Renda fixa segue manual."),
      );
      continue;
    }
    const type = INCOME_TYPES[kind];
    if (type) {
      if (debit)
        file.decisions.push(
          note("Provento a débito: confira se é um estorno."),
        );
      else if (!amount || amount <= 0)
        file.ignored.push(note("Provento sem valor no relatório."));
      else
        file.incomes.push({
          line: i + 1,
          date,
          ticker,
          type,
          label,
          amount,
          institution,
        });
      continue;
    }
    if (/^desdobro|^grupamento/.test(kind)) {
      if (!quantity) file.decisions.push(note("Evento sem quantidade."));
      else
        file.actions.push({
          line: i + 1,
          date,
          ticker,
          kind: "split",
          label,
          // Desdobro credita e grupamento debita cotas.
          delta:
            credit || (!debit && kind.startsWith("desdobro"))
              ? quantity
              : -quantity,
          institution,
        });
      continue;
    }
    if (/^bonificacao/.test(kind)) {
      if (!quantity) file.decisions.push(note("Bonificação sem quantidade."));
      else
        file.actions.push({
          line: i + 1,
          date,
          ticker,
          kind: "bonus",
          label,
          delta: quantity,
          ...(price ? { unitCost: price } : {}),
          institution,
        });
      continue;
    }
    file.decisions.push(
      note(
        /^atualizacao|^incorporacao|^cisao|^troca|^conversao/.test(kind)
          ? "Evento societário: confira o código novo e a proporção."
          : /subscricao|direito|cessao/.test(kind)
            ? "Direito de subscrição: confira se foi exercido ou vendido."
            : /leilao/.test(kind)
              ? "Venda de fração em leilão: confira quantidade e valor."
              : "Tipo de movimentação desconhecido.",
      ),
    );
  }
}

/** Lê uma tabela. Devolve null quando ela não é um relatório conhecido da B3. */
export function parseB3Table(
  table: Table,
  fileName: string,
): ParsedFile | null {
  const detected = detect(table.rows);
  if (!detected) return null;
  const file: ParsedFile = {
    format: detected.format,
    fileName,
    sheet: table.name,
    trades: [],
    incomes: [],
    actions: [],
    ignored: [],
    decisions: [],
  };
  if (detected.format === "b3-negociacao")
    parseNegotiation(table.rows, detected.row + 1, detected.columns, file);
  else parseMovement(table.rows, detected.row + 1, detected.columns, file);
  return file;
}
