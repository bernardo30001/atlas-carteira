// Monta a prévia da importação e aplica só o que você confirmar. Nada aqui grava.
import {
  allAssets,
  type Asset,
  type CorporateAction,
  type Income,
  type Portfolio,
  type TradeEvent,
} from "../model.ts";
import {
  ledgerFor,
  migratePortfolio,
  replayLedger,
  replayTrades,
} from "../trade-history.ts";
import type {
  ParsedAction,
  ParsedFile,
  ParsedIncome,
  ParsedNote,
  ParsedTrade,
} from "./b3.ts";

type Currency = "BRL" | "USD";
export type Row<T> = {
  id: string;
  key: string;
  source: string;
  file: string;
  currency: Currency;
  item: T;
  /** Motivo de estar fora do que será adicionado. */
  reason?: string;
};
export type ImportPreview = {
  files: { name: string; format: ParsedFile["format"]; sheet: string }[];
  trades: Row<ParsedTrade>[];
  incomes: Row<ParsedIncome>[];
  actions: Row<ParsedAction>[];
  /** Já importados antes, pela mesma chave. Nunca entram de novo. */
  duplicates: Row<ParsedTrade | ParsedIncome | ParsedAction>[];
  /** A mesma operação já na carteira, sem chave. Recebe a data do negócio e a corretora. */
  matched: (Row<ParsedTrade> & { legacyId: string })[];
  /** Parecidos com registros antigos, sem chave. Você decide; por padrão ficam fora. */
  probable: Row<ParsedTrade | ParsedIncome>[];
  /** Pagamentos já contidos em um provento "Acumulado anterior". */
  included: Row<ParsedIncome>[];
  /** Proventos acumulados que os pagamentos do arquivo explicam e substituem. */
  replaced: {
    id: string;
    ticker: string;
    currency: Currency;
    amount: number;
    payments: number;
    net: number;
    withheld: number;
  }[];
  /** Ativos fora da lista, com o que está aguardando o cadastro. */
  unknown: {
    ticker: string;
    rows: number;
    closed: boolean;
    net: number;
    currency: Currency;
  }[];
  ignored: (ParsedNote & { file: string; currency: Currency })[];
  decisions: (ParsedNote & { file: string; currency: Currency })[];
  /** Posições iniciais que o histórico completo agora explica. */
  reconcile: string[];
  impact: { ticker: string; before: number; after: number }[];
  warnings: string[];
};

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
/** Mesmo registro, mesmo id: reimportar o arquivo não cria nada novo. */
async function stableId(key: string) {
  const h = hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
  );
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const money4 = (value: number) => value.toFixed(4);
const tradeKey = (t: ParsedTrade) =>
  [
    "t",
    t.date,
    t.ticker,
    t.kind,
    t.quantity,
    money4(t.price),
    t.institution,
  ].join("|");
const incomeKey = (i: ParsedIncome) =>
  ["i", i.date, i.ticker, i.type, money4(i.amount), i.institution].join("|");
const actionKey = (a: ParsedAction) =>
  ["a", a.date, a.ticker, a.kind, a.delta, a.institution].join("|");
const sourceOf = (file: ParsedFile, institution: string, date: string) =>
  `${file.format}|${institution}|${date}`.slice(0, 200);
const close = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <= tolerance;

/** Números iguais no mesmo arquivo são execuções distintas, e não duplicatas. */
async function withOccurrence<T>(
  items: T[],
  keyOf: (item: T) => string,
  file: ParsedFile,
  importDate: string,
  institutionOf: (item: T) => string,
): Promise<Row<T>[]> {
  const seen = new Map<string, number>();
  return Promise.all(
    items.map(async (item) => {
      const base = keyOf(item),
        n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const key = `${base}#${n}`.slice(0, 200);
      return {
        id: await stableId(key),
        key,
        source: sourceOf(file, institutionOf(item), importDate),
        file: file.fileName,
        currency: file.currency ?? "BRL",
        item,
      };
    }),
  );
}
function uniqueByKey<T>(rows: Row<T>[]) {
  return [...new Map(rows.map((row) => [row.key, row])).values()];
}

const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;
/** Registros vindos da Movimentação têm a data de liquidação, dias depois do negócio. */
const MAX_SETTLEMENT_DAYS = 7;
/** Diferença de arredondamento aceita entre um acumulado e os pagamentos que o explicam. */
const CENT_TOLERANCE = 0.011;

/** Casa cada linha nova com um registro antigo sem chave: mesmo ativo, tipo e quantidade,
 * na data do negócio ou até a liquidação. Cada registro antigo serve a uma linha só. */
function matchLegacyLines(p: Portfolio, rows: Row<ParsedTrade>[]) {
  const free = new Set((p.tradeHistory ?? []).filter((e) => !e.importKey));
  const exact = new Map<string, TradeEvent>(),
    priceDiffers = new Set<string>();
  const ordered = [...rows].sort((a, b) =>
    a.item.date.localeCompare(b.item.date),
  );
  const pick = (row: Row<ParsedTrade>, samePrice: boolean) =>
    [...free]
      .filter((e) => {
        const gap = dayNumber(e.date) - dayNumber(row.item.date);
        return (
          e.ticker === row.item.ticker &&
          e.kind === row.item.kind &&
          close(e.quantity, row.item.quantity, 1e-8) &&
          gap >= 0 &&
          gap <= MAX_SETTLEMENT_DAYS &&
          (!samePrice || close(e.price, row.item.price, 0.011))
        );
      })
      .sort((x, y) => dayNumber(x.date) - dayNumber(y.date))[0];
  for (const row of ordered) {
    const event = pick(row, true);
    if (event) {
      exact.set(row.id, event);
      free.delete(event);
    }
  }
  for (const row of ordered) {
    if (exact.has(row.id)) continue;
    const event = pick(row, false);
    if (event) {
      priceDiffers.add(row.id);
      free.delete(event);
    }
  }
  // Um registro antigo pode somar as execuções de um dia, com o preço médio.
  const lots = new Set(p.transactions.map((t) => t.id));
  const summed = new Map<string, TradeEvent>();
  for (const event of [...free]) {
    if (lots.has(event.id)) continue;
    const days = new Map<string, Row<ParsedTrade>[]>();
    for (const row of ordered) {
      const gap = dayNumber(event.date) - dayNumber(row.item.date);
      if (
        exact.has(row.id) ||
        summed.has(row.id) ||
        priceDiffers.has(row.id) ||
        row.item.ticker !== event.ticker ||
        row.item.kind !== event.kind ||
        gap < 0 ||
        gap > MAX_SETTLEMENT_DAYS
      )
        continue;
      days.set(row.item.date, [...(days.get(row.item.date) ?? []), row]);
    }
    for (const rows of days.values()) {
      const quantity = rows.reduce((s, r) => s + r.item.quantity, 0),
        total = rows.reduce((s, r) => s + r.item.total, 0);
      if (
        rows.length > 1 &&
        close(quantity, event.quantity, 1e-8) &&
        close(total, event.total, Math.max(0.05, total * 0.001))
      ) {
        for (const row of rows) summed.set(row.id, event);
        free.delete(event);
        break;
      }
    }
  }
  return { exact, summed, priceDiffers, free };
}

/** Registro antigo que pode somar várias execuções do dia, com o preço médio. */
function matchLegacyTrades(p: Portfolio, rows: Row<ParsedTrade>[]) {
  const history = p.tradeHistory ?? [],
    ids = new Set(history.map((e) => e.id));
  const legacy: Pick<
    TradeEvent,
    "date" | "ticker" | "kind" | "quantity" | "total"
  >[] = [
    ...history.filter((e) => !e.importKey),
    ...p.transactions
      .filter((t) => t.kind === "buy" && !ids.has(t.id))
      .map((t) => ({
        date: t.date,
        ticker: t.ticker,
        kind: "buy" as const,
        quantity: t.quantity,
        total: t.costNative ?? t.quantity * t.price,
      })),
  ];
  const group = (x: { date: string; ticker: string; kind: string }) =>
    `${x.date}|${x.ticker}|${x.kind}`;
  const sums = new Map<string, { quantity: number; total: number }>();
  for (const e of legacy) {
    const s = sums.get(group(e)) ?? { quantity: 0, total: 0 };
    s.quantity += e.quantity;
    s.total += e.total;
    sums.set(group(e), s);
  }
  const incoming = new Map<string, { quantity: number; total: number }>();
  for (const { item } of rows) {
    const s = incoming.get(group(item)) ?? { quantity: 0, total: 0 };
    s.quantity += item.quantity;
    s.total += item.total;
    incoming.set(group(item), s);
  }
  const probable = new Set<string>();
  for (const [key, s] of incoming) {
    const old = sums.get(key);
    if (
      old &&
      close(s.quantity, old.quantity, 1e-6) &&
      close(s.total, old.total, Math.max(0.05, s.total * 0.001))
    )
      probable.add(key);
  }
  return (row: Row<ParsedTrade>) => probable.has(group(row.item));
}

export async function buildPreview(
  current: Portfolio,
  files: ParsedFile[],
  importDate: string,
): Promise<ImportPreview> {
  const portfolio = migratePortfolio(current);
  const known = new Set(allAssets(portfolio).map((a) => a.ticker));
  const existingKeys = new Set(
    [
      ...(portfolio.tradeHistory ?? []),
      ...(portfolio.incomes ?? []),
      ...(portfolio.corporateActions ?? []),
    ].flatMap((r) => (r.importKey ? [r.importKey] : [])),
  );
  const trades: Row<ParsedTrade>[] = [],
    incomes: Row<ParsedIncome>[] = [],
    actions: Row<ParsedAction>[] = [];
  for (const file of files) {
    trades.push(
      ...(await withOccurrence(
        file.trades,
        tradeKey,
        file,
        importDate,
        (t) => t.institution,
      )),
    );
    incomes.push(
      ...(await withOccurrence(
        file.incomes,
        incomeKey,
        file,
        importDate,
        (i) => i.institution,
      )),
    );
    actions.push(
      ...(await withOccurrence(
        file.actions,
        actionKey,
        file,
        importDate,
        (a) => a.institution,
      )),
    );
  }
  const preview: ImportPreview = {
    files: files.map((f) => ({
      name: f.fileName,
      format: f.format,
      sheet: f.sheet,
    })),
    trades: [],
    incomes: [],
    actions: [],
    duplicates: [],
    matched: [],
    probable: [],
    included: [],
    replaced: [],
    unknown: [],
    ignored: files.flatMap((f) =>
      f.ignored.map((n) => ({
        ...n,
        file: f.fileName,
        currency: f.currency ?? "BRL",
      })),
    ),
    decisions: files.flatMap((f) =>
      f.decisions.map((n) => ({
        ...n,
        file: f.fileName,
        currency: f.currency ?? "BRL",
      })),
    ),
    reconcile: [],
    impact: [],
    warnings: files.flatMap((f) => f.warnings ?? []),
  };

  // Duplicatas exatas: mesmo arquivo de novo, ou o mesmo período em dois arquivos.
  const fresh = <T>(rows: Row<T>[]) => {
    const unique = uniqueByKey(rows);
    const seenTwice = rows.length - unique.length;
    return { unique, seenTwice };
  };
  const allTrades = fresh(trades),
    allIncomes = fresh(incomes),
    allActions = fresh(actions);
  const split = <T extends ParsedTrade | ParsedIncome | ParsedAction>(
    rows: Row<T>[],
  ) =>
    rows.filter((row) => {
      if (!existingKeys.has(row.key)) return true;
      preview.duplicates.push({ ...row, reason: "Já importado antes." });
      return false;
    });
  let newTrades = split(allTrades.unique),
    newIncomes = split(allIncomes.unique);
  const newActions = split(allActions.unique);
  const repeated =
    allTrades.seenTwice + allIncomes.seenTwice + allActions.seenTwice;
  if (repeated)
    preview.warnings.push(
      `${repeated} ${repeated === 1 ? "linha repetida" : "linhas repetidas"} entre os arquivos ${repeated === 1 ? "foi considerada" : "foram consideradas"} uma vez só.`,
    );

  // Registros antigos, sem chave: primeiro linha a linha, depois somando o dia.
  const lines = matchLegacyLines(portfolio, newTrades);
  newTrades = newTrades.filter((row) => {
    const event = lines.exact.get(row.id);
    if (event) {
      preview.matched.push({
        ...row,
        legacyId: event.id,
        reason: "Já na carteira, com a data de liquidação.",
      });
      return false;
    }
    const sum = lines.summed.get(row.id);
    if (sum) {
      preview.matched.push({
        ...row,
        legacyId: sum.id,
        reason: "Já na carteira, somada com outras execuções do dia.",
      });
      return false;
    }
    if (lines.priceDiffers.has(row.id)) {
      preview.probable.push({
        ...row,
        reason: "Parece já estar no histórico, com outro preço.",
      });
      return false;
    }
    return true;
  });
  const isLegacyTrade = matchLegacyTrades(portfolio, newTrades);
  newTrades = newTrades.filter((row) => {
    if (!isLegacyTrade(row)) return true;
    preview.probable.push({
      ...row,
      reason: "Parece já estar no histórico, registrado sem a corretora.",
    });
    return false;
  });
  // Cada arquivo só responde pela sua moeda: um extrato em dólar não cobre a B3.
  for (const currency of new Set(allTrades.unique.map((r) => r.currency))) {
    const mine = allTrades.unique.filter((r) => r.currency === currency);
    const first = mine.reduce(
        (d, r) => (r.item.date < d ? r.item.date : d),
        "9999-12-31",
      ),
      last = mine.reduce((d, r) => (r.item.date > d ? r.item.date : d), "");
    const missing = [...lines.free].filter(
      (e) =>
        e.currency === currency &&
        e.date >= first &&
        dayNumber(e.date) <= dayNumber(last) + MAX_SETTLEMENT_DAYS,
    ).length;
    if (missing)
      preview.warnings.push(
        `${missing} ${missing === 1 ? "movimentação da carteira não aparece" : "movimentações da carteira não aparecem"} no arquivo, embora ${missing === 1 ? "esteja" : "estejam"} no período dele. ${missing === 1 ? "Ela continua valendo" : "Elas continuam valendo"}: confira antes de confirmar.`,
      );
  }
  const legacyIncomes = (portfolio.incomes ?? []).filter((i) => !i.importKey);
  const openings = legacyIncomes.filter((i) => i.kind === "opening");
  // Pagamentos com bruto e imposto conhecidos substituem o acumulado, se fecharem com ele.
  for (const opening of openings) {
    const rows = newIncomes.filter(
      ({ item, currency }) =>
        item.ticker === opening.ticker &&
        item.date <= opening.date &&
        currency === opening.currency,
    );
    if (
      !rows.length ||
      rows.some(({ item }) => item.gross === undefined) ||
      openings.filter((i) => i.ticker === opening.ticker).length > 1
    )
      continue;
    const gross = rows.reduce((s, r) => s + (r.item.gross ?? 0), 0),
      net = rows.reduce((s, r) => s + r.item.amount, 0);
    // O acumulado pode ter sido informado pelo bruto ou pelo líquido.
    if (
      close(gross, opening.amount, CENT_TOLERANCE) ||
      close(net, opening.amount, CENT_TOLERANCE)
    )
      preview.replaced.push({
        id: opening.id,
        ticker: opening.ticker,
        currency: opening.currency,
        amount: opening.amount,
        payments: rows.length,
        net,
        withheld: rows.reduce((s, r) => s + (r.item.withheldTax ?? 0), 0),
      });
    else
      preview.warnings.push(
        `${opening.ticker}: os pagamentos dos arquivos somam ${gross.toFixed(2)} brutos, e o acumulado informado é de ${opening.amount.toFixed(2)}. O acumulado continua valendo até os valores fecharem.`,
      );
  }
  const replacedIds = new Set(preview.replaced.map((r) => r.id));
  newIncomes = newIncomes.filter((row) => {
    const { item } = row;
    const accumulated = legacyIncomes.find(
      (i) =>
        i.kind === "opening" && i.ticker === item.ticker && item.date <= i.date,
    );
    if (accumulated && !replacedIds.has(accumulated.id)) {
      preview.included.push({
        ...row,
        reason: "Já contido no provento acumulado informado antes.",
      });
      return false;
    }
    if (accumulated) return true;
    const same = legacyIncomes.some(
      (i) =>
        i.kind === "payment" &&
        i.ticker === item.ticker &&
        i.date === item.date &&
        close(i.amount, item.amount, 0.01),
    );
    if (same) {
      preview.probable.push({
        ...row,
        reason: "Parece já estar registrado, sem a corretora.",
      });
      return false;
    }
    return true;
  });

  // Ativos que ainda precisam de cadastro ficam aguardando, sem quebrar o resto.
  const counts = new Map<
    string,
    { rows: number; net: number; currency: Currency }
  >();
  const hold = <T extends { ticker: string }>(rows: Row<T>[]) =>
    rows.filter(({ item, currency }) => {
      if (known.has(item.ticker)) return true;
      const c = counts.get(item.ticker) ?? { rows: 0, net: 0, currency };
      c.rows++;
      const trade = item as unknown as Partial<ParsedTrade>;
      if (trade.quantity && trade.kind)
        c.net += trade.kind === "buy" ? trade.quantity : -trade.quantity;
      counts.set(item.ticker, c);
      return false;
    });
  newTrades = hold(newTrades);
  newIncomes = hold(newIncomes);
  const heldActions = hold(newActions);
  preview.unknown = [...counts.entries()]
    .map(([ticker, c]) => ({
      ticker,
      rows: c.rows,
      // Saldo zero ou negativo: vendido, às vezes comprado antes do período do arquivo.
      closed: c.net < 1e-8,
      net: c.net,
      currency: c.currency,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Cada ativo precisa fechar: uma venda não pode superar o saldo daquela data.
  const blocked = new Set<string>();
  const historical = new Set(
    allAssets(portfolio)
      .filter((a) => a.archived)
      .map((a) => a.ticker),
  );
  const refreshed = withMatched(portfolio, preview.matched);
  const candidate = (rows: Row<ParsedTrade>[]): Portfolio => ({
    ...refreshed,
    tradeHistory: [
      ...(refreshed.tradeHistory ?? []),
      ...rows.map((row) => eventFrom(row, row.currency)),
    ],
    corporateActions: [
      ...(portfolio.corporateActions ?? []),
      ...heldActions.map(actionFrom),
    ],
  });
  for (const ticker of new Set(newTrades.map((r) => r.item.ticker))) {
    // Encerrado fica só no histórico: uma venda sem compra no arquivo não afeta nada.
    if (historical.has(ticker)) continue;
    for (let guard = 0; guard < 500; guard++) {
      const ledger = ledgerFor(candidate(newTrades), ticker);
      let quantity = ledger.baseline.reduce((s, l) => s + l.quantity, 0),
        orphan: TradeEvent | undefined,
        partial = false;
      for (const event of ledger.entries) {
        if (event.kind === "buy") quantity += event.quantity;
        else if (event.quantity > quantity + 1e-8) {
          if (quantity === 0) orphan = event;
          else partial = true;
          break;
        } else quantity = Math.max(0, quantity - event.quantity);
      }
      if (partial) {
        blocked.add(ticker);
        break;
      }
      if (!orphan) break;
      // Venda sem nenhuma compra antes: o arquivo não cobre a origem da posição.
      const target = orphan,
        row = newTrades.find((r) => r.id === target.id);
      if (!row) {
        blocked.add(ticker);
        break;
      }
      newTrades = newTrades.filter((r) => r !== row);
      preview.ignored.push({
        line: row.item.line,
        date: row.item.date,
        ticker,
        label: `Venda de ${ticker}`,
        quantity: row.item.quantity,
        amount: row.item.total,
        institution: row.item.institution,
        file: row.file,
        currency: row.currency,
        reason:
          "Venda sem compra anterior no arquivo. Não afeta a posição atual.",
      });
    }
  }
  if (blocked.size) {
    newTrades = newTrades.filter((row) => {
      if (!blocked.has(row.item.ticker)) return true;
      preview.decisions.push({
        line: row.item.line,
        date: row.item.date,
        ticker: row.item.ticker,
        label: `${row.item.kind === "buy" ? "Compra" : "Venda"} de ${row.item.ticker}`,
        quantity: row.item.quantity,
        amount: row.item.total,
        institution: row.item.institution,
        file: row.file,
        currency: row.currency,
        reason:
          "O histórico deste ativo está incompleto: uma venda supera o saldo. Informe a posição inicial ou envie um período maior.",
      });
      return false;
    });
  }
  preview.trades = newTrades;
  preview.incomes = newIncomes;
  preview.actions = heldActions;

  // Posição inicial que agora é explicada pelo histórico inteiro deixa de somar.
  const tickers = new Set(newTrades.map((r) => r.item.ticker));
  const next = candidate(newTrades);
  for (const ticker of tickers) {
    const opening = portfolio.transactions.filter(
      (t) => t.ticker === ticker && t.kind === "opening" && !t.reconciled,
    );
    if (!opening.length) continue;
    const total = opening.reduce((s, t) => s + t.quantity, 0);
    let explained: number | null = null;
    try {
      explained = replayTrades(
        (next.tradeHistory ?? []).filter((e) => e.ticker === ticker),
      ).quantity;
    } catch {
      explained = null;
    }
    if (explained !== null && close(explained, total, 1e-6))
      preview.reconcile.push(...opening.map((t) => t.id));
    else {
      const since = opening.reduce((d, t) => (t.date > d ? t.date : d), "");
      const before = newTrades.filter(
        (r) => r.item.ticker === ticker && r.item.date < since,
      ).length;
      if (before)
        preview.warnings.push(
          `${ticker}: ${before} ${before === 1 ? "operação anterior" : "operações anteriores"} à posição inicial ficam explicadas por ela, porque o histórico não fecha com a quantidade informada.`,
        );
    }
  }
  preview.impact = impactOf(portfolio, applyPreview(portfolio, preview));
  const movement = files.some((f) => f.format === "b3-movimentacao"),
    negotiation = files.some((f) => f.format === "b3-negociacao");
  if (movement && !negotiation)
    preview.warnings.push(
      "Só o relatório de Movimentação foi enviado. Ele traz proventos e eventos; envie também o de Negociação para registrar compras e vendas.",
    );
  return preview;
}

/** Atualiza os registros antigos com a data do negócio, a corretora e a origem. Um
 * registro que somava execuções vira uma linha por execução, com as taxas rateadas. */
function withMatched(
  p: Portfolio,
  matched: ImportPreview["matched"],
): Portfolio {
  if (!matched.length) return p;
  const byLegacy = new Map<string, ImportPreview["matched"]>();
  for (const row of matched)
    byLegacy.set(row.legacyId, [...(byLegacy.get(row.legacyId) ?? []), row]);
  return {
    ...p,
    tradeHistory: (p.tradeHistory ?? []).flatMap((e) => {
      const rows = byLegacy.get(e.id);
      if (!rows) return [e];
      const marks = (row: ImportPreview["matched"][number]) => ({
        date: row.item.date,
        institution: row.item.institution,
        source: row.source,
        importKey: row.key,
      });
      if (rows.length === 1) return [{ ...e, ...marks(rows[0]) }];
      const total = rows.reduce((s, r) => s + r.item.total, 0);
      return rows.map((row) => ({
        ...e,
        ...marks(row),
        id: row.id,
        quantity: row.item.quantity,
        price: row.item.price,
        total: row.item.total,
        fees: total ? (e.fees * row.item.total) / total : 0,
      }));
    }),
  };
}

/** Ativo guardado só para o histórico: sem cotação, fora do patrimônio e dos aportes. */
export const archivedAsset = (
  ticker: string,
  currency: Currency = "BRL",
): Asset => ({
  ticker,
  symbol: currency === "USD" ? ticker : `${ticker}.SA`,
  name: ticker,
  group: currency === "USD" ? "etf" : "br",
  currency,
  sector: "Encerrado",
  color: "#626b99",
  query: ticker,
  archived: true,
});

function eventFrom(row: Row<ParsedTrade>, currency: Currency): TradeEvent {
  const t = row.item;
  return {
    id: row.id,
    ticker: t.ticker,
    kind: t.kind,
    quantity: t.quantity,
    price: t.price,
    total: t.total,
    currency,
    fx: currency === "BRL" ? 1 : null,
    fees: t.fees ?? 0,
    ...(t.feesCurrency ? { feesCurrency: t.feesCurrency } : {}),
    date: t.date,
    source: row.source,
    institution: t.institution,
    importKey: row.key,
  };
}
function actionFrom(row: Row<ParsedAction>): CorporateAction {
  const a = row.item;
  return {
    id: row.id,
    ticker: a.ticker,
    date: a.date,
    kind: a.kind,
    delta: a.delta,
    ...(a.unitCost !== undefined ? { unitCost: a.unitCost } : {}),
    source: row.source,
    importKey: row.key,
  };
}
function incomeFrom(row: Row<ParsedIncome>, currency: Currency): Income {
  const i = row.item;
  return {
    id: row.id,
    ticker: i.ticker,
    amount: i.amount,
    currency,
    date: i.date,
    kind: "payment",
    fx: currency === "BRL" ? 1 : null,
    note: i.label.slice(0, 500),
    source: row.source,
    institution: i.institution,
    importKey: row.key,
    type: i.type,
    ...(i.withheldTax ? { withheldTax: i.withheldTax } : {}),
  };
}

function impactOf(before: Portfolio, after: Portfolio) {
  const tickers = new Set(
    [...(after.tradeHistory ?? []), ...before.transactions].map(
      (r) => r.ticker,
    ),
  );
  const historical = new Set(
    allAssets(after)
      .filter((a) => a.archived)
      .map((a) => a.ticker),
  );
  return [...tickers].flatMap((ticker) => {
    if (historical.has(ticker)) return [];
    const old = replayLedger(ledgerFor(before, ticker)).quantity,
      next = replayLedger(ledgerFor(after, ticker)).quantity;
    return Math.abs(old - next) > 1e-8
      ? [{ ticker, before: old, after: next }]
      : [];
  });
}

/** Aplica a prévia. `probableIds` são os parecidos que você decidiu incluir mesmo assim. */
export function applyPreview(
  current: Portfolio,
  preview: ImportPreview,
  probableIds: ReadonlySet<string> = new Set(),
): Portfolio {
  const portfolio = withMatched(migratePortfolio(current), preview.matched);
  const currency = <T extends { ticker: string }>(row: Row<T>) =>
    allAssets(portfolio).find((a) => a.ticker === row.item.ticker)?.currency ??
    row.currency;
  const extraTrades = preview.probable.filter(
      (row) => probableIds.has(row.id) && "kind" in row.item,
    ) as Row<ParsedTrade>[],
    extraIncomes = preview.probable.filter(
      (row) => probableIds.has(row.id) && "type" in row.item,
    ) as Row<ParsedIncome>[];
  const reconcile = new Set(preview.reconcile),
    replaced = new Set(preview.replaced.map((r) => r.id));
  return {
    ...portfolio,
    transactions: portfolio.transactions.map((t) =>
      reconcile.has(t.id) ? { ...t, reconciled: true } : t,
    ),
    tradeHistory: [
      ...(portfolio.tradeHistory ?? []),
      ...[...preview.trades, ...extraTrades].map((row) =>
        eventFrom(row, currency(row)),
      ),
    ],
    incomes: [
      ...(portfolio.incomes ?? []).filter((i) => !replaced.has(i.id)),
      ...[...preview.incomes, ...extraIncomes].map((row) =>
        incomeFrom(row, currency(row)),
      ),
    ],
    corporateActions: [
      ...(portfolio.corporateActions ?? []),
      ...preview.actions.map(actionFrom),
    ],
  };
}
