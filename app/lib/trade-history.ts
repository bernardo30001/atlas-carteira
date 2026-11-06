import {
  allAssets,
  transactionCost,
  transactionCurrency,
  type CorporateAction,
  isTrackedTicker,
  type Currency,
  type Income,
  type Portfolio,
  type TradeEvent,
  type Transaction,
} from "./model.ts";

export const PORTFOLIO_SCHEMA = 4;

// As linhas de um mesmo dia não são cronológicas nos relatórios: compras vêm antes.
const ordered = (events: TradeEvent[]) =>
  [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.kind === "sell") - Number(b.kind === "sell"),
  );
export type TradeBalance = {
  quantity: number;
  costNative: number;
  feesBRL: number;
};

// Reductions preserve the average cost. The sale proceeds are not an acquisition cost.
export function replayTrades(
  events: TradeEvent[],
  date = "9999-12-31",
): TradeBalance {
  let quantity = 0,
    costNative = 0,
    feesBRL = 0;
  for (const event of ordered(events).filter((e) => e.date <= date)) {
    if (event.kind === "buy") {
      quantity += event.quantity;
      costNative += event.total;
      feesBRL += event.fees;
      continue;
    }
    if (event.quantity > quantity + 1e-8)
      throw new Error(
        "Venda sem saldo suficiente em " +
          event.ticker +
          " na data " +
          event.date +
          ".",
      );
    const factor =
      quantity > 0 ? Math.max(0, 1 - event.quantity / quantity) : 0;
    quantity = Math.max(0, quantity - event.quantity);
    costNative *= factor;
    feesBRL *= factor;
    if (quantity < 1e-8) {
      quantity = 0;
      costNative = 0;
      feesBRL = 0;
    }
  }
  return { quantity, costNative, feesBRL };
}

/** Keep only the currently open cycle. Old sales without their opening balance
 * precede the supplied acquisition history and cannot create a new position. */
export function openTradeCycle(events: TradeEvent[]): TradeEvent[] {
  let quantity = 0;
  let current: TradeEvent[] = [];
  for (const event of ordered(events)) {
    if (event.kind === "buy") {
      if (quantity === 0) current = [];
      current.push(event);
      quantity += event.quantity;
    } else {
      if (quantity === 0) continue;
      if (event.quantity > quantity + 1e-8)
        throw new Error("Movimentação incompleta para " + event.ticker + ".");
      current.push(event);
      quantity = Math.max(0, quantity - event.quantity);
      if (quantity < 1e-8) {
        quantity = 0;
        current = [];
      }
    }
  }
  return current;
}

// ------------------------------------------------------------------ fonte única

export type Lot = Transaction & { costNative: number };
export type Ledger = {
  /** Saldo inicial sem datas de compra: vale para toda a curva. */
  baseline: Lot[];
  /** Compras e vendas em ordem, incluindo compras registradas à mão. */
  entries: TradeEvent[];
  /** Desdobramentos, grupamentos e bonificações do ativo. */
  actions: CorporateAction[];
  /** O ativo tem movimentações datadas em uso. */
  dated: boolean;
  /** Movimentações anteriores ao saldo inicial, já explicadas por ele. */
  excluded: TradeEvent[];
};

/** Ticker em que um registro está hoje, depois das trocas de código. */
export function currentTicker(p: Portfolio, ticker: string, date: string) {
  const renames = (p.corporateActions ?? []).filter((a) => a.kind === "rename");
  let current = ticker;
  for (let hops = 0; hops <= renames.length; hops++) {
    const next = renames.find((r) => r.ticker === current && date <= r.date);
    if (!next?.newTicker) return current;
    current = next.newTicker;
  }
  return current;
}
/** Proventos do ativo, incluindo os recebidos com o código anterior. */
export const incomesFor = (p: Portfolio, ticker: string) =>
  (p.incomes ?? []).filter(
    (i) => currentTicker(p, i.ticker, i.date) === ticker,
  );

const legacyCache = new WeakMap<Portfolio, Set<string>>();
/** Carteiras antigas guardam uma posição conciliada que já resume o histórico. */
function legacyReconciled(p: Portfolio): Set<string> {
  const cached = legacyCache.get(p);
  if (cached) return cached;
  const known = new Set<string>();
  for (const ticker of new Set((p.tradeHistory ?? []).map((e) => e.ticker))) {
    const opening = p.transactions.filter(
      (t) => t.ticker === ticker && t.kind === "opening",
    );
    if (!opening.length) continue;
    try {
      const { quantity } = replayTrades(
        (p.tradeHistory ?? []).filter((e) => e.ticker === ticker),
      );
      const total = opening.reduce((s, t) => s + t.quantity, 0);
      if (Math.abs(quantity - total) < 1e-8) known.add(ticker);
    } catch {
      // Histórico incompleto não explica o saldo inicial.
    }
  }
  legacyCache.set(p, known);
  return known;
}
const isReconciled = (p: Portfolio, lot: Transaction) =>
  lot.reconciled === true ||
  (p.schemaVersion === undefined && legacyReconciled(p).has(lot.ticker));

const lotFromTransaction = (t: Transaction): Lot => ({
  ...t,
  costNative: transactionCost(t),
});
const lotFromEvent = (e: TradeEvent): Lot => ({
  id: e.id,
  ticker: e.ticker,
  kind: "buy",
  quantity: e.quantity,
  price: e.price,
  fx: e.fx,
  fees: e.fees,
  feesCurrency: e.feesCurrency,
  date: e.date,
  note: "",
  currency: e.currency,
  costNative: e.total,
});
const eventFromTransaction = (t: Transaction): TradeEvent => ({
  id: t.id,
  ticker: t.ticker,
  kind: "buy",
  quantity: t.quantity,
  price: t.price,
  total: transactionCost(t),
  currency: transactionCurrency(t),
  fx: t.fx,
  fees: t.fees,
  feesCurrency: t.feesCurrency,
  date: t.date,
  source: "Registro no Atlas",
});

export function ledgerFor(p: Portfolio, ticker: string): Ledger {
  const relabel = <T extends { ticker: string }>(record: T): T =>
    record.ticker === ticker ? record : { ...record, ticker };
  const lots = p.transactions
      .filter((t) => currentTicker(p, t.ticker, t.date) === ticker)
      .map(relabel),
    history = (p.tradeHistory ?? [])
      .filter((e) => currentTicker(p, e.ticker, e.date) === ticker)
      .map(relabel);
  const baseline = lots.filter(
    (t) => t.kind === "opening" && !isReconciled(p, t),
  );
  // O saldo inicial descreve a posição na data de referência. O que veio antes já
  // está nele. Operações na própria data, como uma venda de hoje, ainda se aplicam.
  const since = baseline.reduce((d, t) => (t.date > d ? t.date : d), "");
  const kept = history.filter((e) => e.date >= since),
    excluded = history.filter((e) => e.date < since),
    ids = new Set(kept.map((e) => e.id));
  const manual = lots
    .filter((t) => t.kind === "buy" && !ids.has(t.id))
    .map(eventFromTransaction);
  return {
    baseline: baseline.map(lotFromTransaction),
    entries: ordered([...kept, ...manual]),
    actions: (p.corporateActions ?? [])
      .filter(
        (a) =>
          a.kind !== "rename" &&
          a.date >= since &&
          currentTicker(p, a.ticker, a.date) === ticker,
      )
      .sort((x, y) => x.date.localeCompare(y.date)),
    dated: kept.length > 0,
    excluded,
  };
}

type Step =
  | { date: string; action: CorporateAction }
  | { date: string; event: TradeEvent }
  | { date: string; income: Income };
/** No mesmo dia: evento societário, proventos, compras e vendas. O desdobramento vale
 * desde a abertura e o provento é de quem já tinha o ativo. */
const STEP_ORDER = { action: 0, income: 1, buy: 2, sell: 3 };
function timeline(ledger: Ledger, incomes: Income[], date: string): Step[] {
  const position = (step: Step) =>
    "action" in step
      ? STEP_ORDER.action
      : "income" in step
        ? STEP_ORDER.income
        : STEP_ORDER[step.event.kind];
  return [
    ...ledger.actions.map((action): Step => ({ date: action.date, action })),
    ...ledger.entries.map((event): Step => ({ date: event.date, event })),
    ...incomes.map((income): Step => ({ date: income.date, income })),
  ]
    .filter((step) => step.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || position(a) - position(b));
}

/** Fator de quantidade de um evento: o arquivo pode trazer a proporção ou as cotas. */
function actionFactor(action: CorporateAction, quantity: number) {
  if (action.factor !== undefined)
    return action.kind === "bonus" ? 1 + action.factor : action.factor;
  if (action.delta !== undefined && quantity > 0)
    return (quantity + action.delta) / quantity;
  return 1;
}
function applyAction(lots: Lot[], action: CorporateAction, factor: number) {
  const before = lots.reduce((s, l) => s + l.quantity, 0);
  if (action.kind === "bonus") {
    const added = before * (factor - 1);
    return added > 0
      ? [
          ...lots,
          {
            ...lots[0],
            id: action.id,
            kind: "buy" as const,
            quantity: added,
            price: action.unitCost ?? 0,
            costNative: added * (action.unitCost ?? 0),
            fees: 0,
            date: action.date,
          },
        ]
      : lots;
  }
  return lots.map((l) => ({
    ...l,
    quantity: l.quantity * factor,
    price: l.price / factor,
  }));
}

export type LedgerState = {
  lots: Lot[];
  quantity: number;
  /** Compras e vendas do ciclo ainda aberto. */
  cycle: TradeEvent[];
  /** Alguma venda superou o saldo disponível. */
  oversold: boolean;
  /** Fatores de quantidade aplicados, para reexpressar quantidades antigas. */
  factors: { date: string; factor: number }[];
};

/** Reproduz o livro até a data. Vendas reduzem cada lote pelo preço médio. */
export function replayLedger(ledger: Ledger, date = "9999-12-31"): LedgerState {
  let lots = ledger.baseline,
    quantity = lots.reduce((s, l) => s + l.quantity, 0),
    cycle: TradeEvent[] = [],
    oversold = false;
  const factors: LedgerState["factors"] = [];
  for (const step of timeline(ledger, [], date)) {
    if ("action" in step) {
      if (quantity === 0) continue;
      const factor = actionFactor(step.action, quantity);
      lots = applyAction(lots, step.action, factor);
      quantity *= factor;
      factors.push({ date: step.date, factor });
      continue;
    }
    if (!("event" in step)) continue;
    const event = step.event;
    if (event.kind === "buy") {
      if (quantity === 0) {
        lots = [];
        cycle = [];
      }
      lots = [...lots, lotFromEvent(event)];
      cycle.push(event);
      quantity += event.quantity;
      continue;
    }
    if (event.quantity > quantity + 1e-8) oversold = true;
    if (quantity === 0) continue;
    const factor = Math.max(0, 1 - event.quantity / quantity);
    quantity = Math.max(0, quantity - event.quantity);
    lots = lots.map((l) => ({
      ...l,
      quantity: l.quantity * factor,
      costNative: l.costNative * factor,
      fees: l.fees * factor,
    }));
    cycle.push(event);
    if (quantity < 1e-8) {
      quantity = 0;
      lots = [];
      cycle = [];
    }
  }
  return { lots, quantity, cycle, oversold, factors };
}

/** O histórico de preços já vem ajustado por desdobramentos: uma quantidade antiga
 * precisa do mesmo ajuste para valer o que valia naquela data. */
export function splitAdjustment(state: LedgerState, date: string) {
  return state.factors
    .filter((f) => f.date > date)
    .reduce((total, f) => total * f.factor, 1);
}

const allTickers = (p: Portfolio) =>
  new Set(
    [...p.transactions, ...(p.tradeHistory ?? [])].map((record) =>
      currentTicker(p, record.ticker, record.date),
    ),
  );

export const hasHolding = (p: Portfolio) =>
  [...allTickers(p)].some(
    (ticker) => replayLedger(ledgerFor(p, ticker)).quantity > 0,
  );

/** Movimentações do ciclo aberto de cada posição. Ciclos encerrados ficam fora. */
export function datedTrades(p: Portfolio): TradeEvent[] {
  return ordered(
    [...allTickers(p)]
      .filter((ticker) => isTrackedTicker(ticker))
      .flatMap((ticker) => replayLedger(ledgerFor(p, ticker)).cycle),
  );
}

export function purchasesForPoints<T extends { date: string }>(
  p: Portfolio,
  points: T[],
): (T & { purchases: TradeEvent[] })[] {
  const known = new Set(
    allAssets(p)
      .filter((a) => !a.archived)
      .map((a) => a.ticker),
  );
  const trades = datedTrades(p).filter(
    (e) => e.kind === "buy" && known.has(e.ticker),
  );
  const lastPerDay = new Map(points.map((point, index) => [point.date, index]));
  return points.map((point, index) => ({
    ...point,
    purchases:
      lastPerDay.get(point.date) === index
        ? trades.filter((e) => e.date === point.date)
        : [],
  }));
}

export function datedCost(
  events: TradeEvent[],
  date: string,
  currency: Currency,
  fx: number | null,
): { quantity: number; cost: number | null } {
  let quantity = 0,
    cost: number | null = 0;
  for (const event of ordered(events).filter((e) => e.date <= date)) {
    if (event.kind === "buy") {
      const rate = event.fx ?? fx;
      const native =
        event.currency === currency
          ? event.total
          : rate
            ? event.currency === "USD"
              ? event.total * rate
              : event.total / rate
            : null;
      const fee =
        event.fees === 0
          ? 0
          : currency === "BRL"
            ? event.fees
            : rate
              ? event.fees / rate
              : null;
      cost =
        cost === null || native === null || fee === null
          ? null
          : cost + native + fee;
      quantity += event.quantity;
    } else {
      if (event.quantity > quantity + 1e-8)
        throw new Error(
          "Venda sem saldo suficiente para " + event.ticker + ".",
        );
      const factor = quantity ? Math.max(0, 1 - event.quantity / quantity) : 0;
      quantity = Math.max(0, quantity - event.quantity);
      if (cost !== null) cost *= factor;
      if (quantity < 1e-8) {
        quantity = 0;
        cost = 0;
      }
    }
  }
  return { quantity, cost };
}

// ------------------------------------------------------------------- proventos

/** Separa o provento da parte que continua em carteira e o da parte já vendida.
 * Cada venda reduz o provento na mesma proporção do custo. Ao zerar a posição,
 * tudo o que veio antes pertence ao ciclo encerrado. */
export function attributeIncomes(
  ledger: Ledger,
  incomes: Income[],
  date = "9999-12-31",
): { kept: Income[]; realized: Income[] } {
  let quantity = ledger.baseline.reduce((s, l) => s + l.quantity, 0),
    closed = false,
    kept: Income[] = [];
  const realized: Income[] = [];
  for (const step of timeline(ledger, incomes, date)) {
    if ("income" in step) {
      if (quantity === 0 && closed) realized.push(step.income);
      else kept.push({ ...step.income });
      continue;
    }
    if ("action" in step) {
      quantity *= actionFactor(step.action, quantity);
      continue;
    }
    const event = step.event;
    if (event.kind === "buy") {
      quantity += event.quantity;
      continue;
    }
    if (quantity <= 0) continue;
    let factor = Math.max(0, 1 - event.quantity / quantity);
    quantity = Math.max(0, quantity - event.quantity);
    if (quantity < 1e-8) {
      quantity = 0;
      factor = 0;
    }
    kept = kept.map((i) => {
      if (factor < 1) realized.push({ ...i, amount: i.amount * (1 - factor) });
      return { ...i, amount: i.amount * factor };
    });
    if (quantity === 0) {
      kept = [];
      closed = true;
    }
  }
  return { kept, realized };
}

// ------------------------------------------------------------ resultado realizado

export type Realized = {
  sales: number;
  cost: number;
  fees: number;
  income: number;
  result: number;
  count: number;
};
const emptyRealized = (): Realized => ({
  sales: 0,
  cost: 0,
  fees: 0,
  income: 0,
  result: 0,
  count: 0,
});

function convertTo(
  amount: number,
  from: Currency,
  to: Currency,
  rate?: number | null,
) {
  if (amount === 0 || from === to) return amount;
  if (!rate) return null;
  return from === "USD" ? amount * rate : amount / rate;
}

/** Lucro das vendas, separado do rendimento das posições em carteira. Inclui ativos
 * já encerrados e os proventos atribuídos às partes vendidas. */
export function realizedResults(p: Portfolio) {
  const totals: Record<Currency, Realized> = {
    BRL: emptyRealized(),
    USD: emptyRealized(),
  };
  const pending = new Set<string>();
  for (const ticker of allTickers(p)) {
    const ledger = ledgerFor(p, ticker);
    let lots = ledger.baseline,
      quantity = lots.reduce((s, l) => s + l.quantity, 0);
    for (const step of timeline(ledger, [], "9999-12-31")) {
      if ("action" in step) {
        if (quantity === 0) continue;
        const factor = actionFactor(step.action, quantity);
        lots = applyAction(lots, step.action, factor);
        quantity *= factor;
        continue;
      }
      if (!("event" in step)) continue;
      const event = step.event;
      if (event.kind === "buy") {
        if (quantity === 0) lots = [];
        lots = [...lots, lotFromEvent(event)];
        quantity += event.quantity;
        continue;
      }
      if (quantity <= 0) continue;
      const factor = Math.max(0, 1 - event.quantity / quantity),
        sold = 1 - factor,
        target = totals[event.currency],
        rate = event.fx;
      let cost = 0,
        complete = true;
      for (const lot of lots) {
        const lotRate = lot.fx ?? rate,
          native = convertTo(
            lot.costNative * sold,
            transactionCurrency(lot),
            event.currency,
            lotRate,
          ),
          fee = convertTo(
            lot.fees * sold,
            lot.feesCurrency ?? "BRL",
            event.currency,
            lotRate,
          );
        if (native === null || fee === null) complete = false;
        else cost += native + fee;
      }
      const saleFee = convertTo(
        event.fees,
        event.feesCurrency ?? "BRL",
        event.currency,
        rate,
      );
      if (complete && saleFee !== null) {
        // Sem a compra no arquivo, só conta a parte da venda que tem custo conhecido.
        const covered = Math.min(event.quantity, quantity) / event.quantity;
        target.sales += event.total * covered;
        target.fees += saleFee * covered;
        target.cost += cost;
        target.count++;
      } else pending.add(ticker);
      quantity = Math.max(0, quantity - event.quantity);
      lots = lots.map((l) => ({
        ...l,
        quantity: l.quantity * factor,
        costNative: l.costNative * factor,
        fees: l.fees * factor,
      }));
      if (quantity < 1e-8) {
        quantity = 0;
        lots = [];
      }
    }
    const { realized } = attributeIncomes(ledger, incomesFor(p, ticker));
    for (const income of realized)
      totals[income.currency].income += income.amount;
  }
  for (const currency of ["BRL", "USD"] as const) {
    const t = totals[currency];
    t.result = t.sales - t.fees - t.cost + t.income;
  }
  return { ...totals, pending: [...pending] };
}

// ---------------------------------------------------------- migração e validação

/** Marca como conciliada a posição inicial que o histórico completo já explica. */
export function migratePortfolio(p: Portfolio): Portfolio {
  if ((p.schemaVersion ?? 0) >= PORTFOLIO_SCHEMA) return p;
  const known = legacyReconciled(p);
  return {
    ...p,
    schemaVersion: PORTFOLIO_SCHEMA,
    transactions: p.transactions.map((t) =>
      t.kind === "opening" && known.has(t.ticker)
        ? { ...t, reconciled: true }
        : t,
    ),
  };
}

/** Quantidades que mudam em relação à soma antiga dos registros, para conferência. */
export function migrationChanges(before: Portfolio) {
  const after = migratePortfolio(before);
  return [...allTickers(after)].flatMap((ticker) => {
    const old = before.transactions
        .filter((t) => t.ticker === ticker)
        .reduce((s, t) => s + t.quantity, 0),
      next = replayLedger(ledgerFor(after, ticker)).quantity;
    return Math.abs(old - next) > 1e-8
      ? [{ ticker, before: old, after: next }]
      : [];
  });
}

/** Tickers cujo histórico não fecha nem com o saldo inicial nem sozinho. */
export function ledgerIssues(p: Portfolio): string[] {
  // Ativo guardado só no histórico pode ter vendas de compras anteriores ao arquivo.
  const historical = new Set(
    allAssets(p)
      .filter((a) => a.archived)
      .map((a) => a.ticker),
  );
  return [...new Set((p.tradeHistory ?? []).map((e) => e.ticker))].filter(
    (ticker) => {
      // Ativo fora do acompanhamento também não entra em nenhuma conta.
      if (historical.has(ticker) || !isTrackedTicker(ticker)) return false;
      if (!replayLedger(ledgerFor(p, ticker)).oversold) return false;
      try {
        replayTrades((p.tradeHistory ?? []).filter((e) => e.ticker === ticker));
        return false;
      } catch {
        return true;
      }
    },
  );
}

/** Motivo para recusar uma venda, ou null se ela couber no saldo. */
export function saleIssue(p: Portfolio, sale: TradeEvent): string | null {
  const ledger = ledgerFor(p, sale.ticker),
    since = ledger.baseline.reduce((d, t) => (t.date > d ? t.date : d), "");
  if (sale.date < since)
    return "A venda é anterior à data de referência da posição inicial.";
  const next = ledgerFor(
    { ...p, tradeHistory: [...(p.tradeHistory ?? []), sale] },
    sale.ticker,
  );
  return replayLedger(next).oversold
    ? "A quantidade vendida é maior que o saldo disponível nessa data."
    : null;
}
