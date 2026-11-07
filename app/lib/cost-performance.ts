import {
  positions,
  transactionCost,
  transactionCurrency,
  type Currency,
  type Income,
  type Market,
  type Point,
  type Portfolio,
  type Transaction,
} from "./model.ts";
import {
  brDate,
  performancePortfolio,
  type ChartPoint,
  type PerformanceScope,
} from "./performance.ts";
import {
  attributeIncomes,
  datedTrades,
  incomesFor,
  ledgerFor,
  replayLedger,
  splitAdjustment,
} from "./trade-history.ts";

export type CostPerformance = {
  currency: Currency;
  cost: number;
  value: number;
  income: number;
  result: number;
  returnPercent: number | undefined;
  includedCount: number;
  totalCount: number;
  excluded: string[];
  estimatedFX: boolean;
  points: ChartPoint[];
  warnings: string[];
  datedPositionCount: number;
  partialHistoryCount: number;
  manualFixedCount: number;
};
const add = (values: (number | null)[]) =>
  values.some((v) => v === null)
    ? null
    : values.reduce<number>((s, v) => s + (v ?? 0), 0);
function convert(
  amount: number,
  from: Currency,
  to: Currency,
  fx: number | null,
): number | null {
  if (amount === 0 || from === to) return amount;
  if (!fx || !Number.isFinite(fx) || fx <= 0) return null;
  return from === "USD" ? amount * fx : amount / fx;
}
function costOf(tx: Transaction, currency: Currency, fx: number | null) {
  const rate = tx.fx ?? fx;
  return add([
    convert(transactionCost(tx), transactionCurrency(tx), currency, rate),
    convert(tx.fees, tx.feesCurrency ?? "BRL", currency, rate),
  ]);
}
const incomeOf = (i: Income, currency: Currency, fx: number | null) =>
  convert(i.amount, i.currency, currency, i.fx ?? fx);
function needsEstimatedFX(tx: Transaction, currency: Currency) {
  return (
    ((transactionCurrency(tx) !== currency && transactionCost(tx) > 0) ||
      (currency === "USD" && tx.fees > 0 && tx.feesCurrency !== "USD")) &&
    !tx.fx
  );
}
const validPrice = (v: number) => Number.isFinite(v) && v > 0;
function priceSeries(m: Market, ticker: string, today: string): Point[] {
  const quote = m.quotes[ticker];
  if (!quote || quote.stale || !validPrice(quote.price)) return [];
  const points = (quote.priceHistory ?? quote.history).filter(
    (p) => p.date <= today && validPrice(p.close),
  );
  // The last point uses the same quote as the accumulated result.
  return [
    ...new Map(
      [...points, { date: today, close: quote.price }].map((p) => [p.date, p]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
const atDate = (series: Point[], date: string) =>
  series.findLast((p) => p.date <= date)?.close ?? null;

/** Cost-weighted profit on the registered positions, including pre-registration gains.
 * Historical prices reconstruct a cost-basis curve; they never become observed history.
 */
export function costPerformance(
  portfolio: Portfolio,
  market: Market,
  scope: PerformanceScope = "all",
  days = 365,
  now = Date.now(),
): CostPerformance {
  const p = performancePortfolio(portfolio, scope),
    currency: Currency = scope === "us" ? "USD" : "BRL";
  const rows = positions(p, market).filter(
      (r) => r.quantity > 0 && !r.archived,
    ),
    excluded: string[] = [],
    warnings: string[] = [];
  const ledgers = new Map(rows.map((r) => [r.ticker, ledgerFor(p, r.ticker)])),
    finals = new Map(
      rows.map((r) => [r.ticker, replayLedger(ledgers.get(r.ticker)!)]),
    ),
    events = datedTrades(p);
  const fxQuote = market.quotes.USD,
    fx =
      fxQuote && !fxQuote.stale && validPrice(fxQuote.price)
        ? fxQuote.price
        : null,
    today = brDate(new Date(now)),
    fxSeries = priceSeries(market, "USD", today),
    // Sem o câmbio da remessa, a melhor estimativa é o dólar do dia da operação.
    fxOn = (date: string) => atDate(fxSeries, date) ?? fx;
  let cost = 0,
    value = 0,
    income = 0,
    includedCount = 0,
    estimatedFX = false;
  const included: typeof rows = [];
  for (const row of rows) {
    const rowCost = add(
      row.transactions.map((tx) => costOf(tx, currency, fxOn(tx.date))),
    );
    const rowIncome = add(
      row.incomes.map((i) => incomeOf(i, currency, fxOn(i.date))),
    );
    const rowValue =
      row.nativeValue === null
        ? null
        : convert(row.nativeValue, row.currency, currency, fx);
    if (
      rowCost === null ||
      rowCost <= 0 ||
      rowIncome === null ||
      rowValue === null
    ) {
      excluded.push(
        row.ticker +
          " · " +
          (rowCost === null || rowIncome === null
            ? "câmbio pendente"
            : rowCost <= 0
              ? "custo não informado"
              : "cotação pendente"),
      );
      continue;
    }
    cost += rowCost;
    value += rowValue;
    income += rowIncome;
    includedCount++;
    included.push(row);
    if (
      row.transactions.some((tx) => needsEstimatedFX(tx, currency)) ||
      row.incomes.some((i) => i.amount > 0 && i.currency !== currency && !i.fx)
    )
      estimatedFX = true;
  }
  for (const fixed of p.fixedIncome) {
    if (fixed.cost === null || fixed.cost <= 0) {
      excluded.push(fixed.name + " · capital inicial não informado");
      continue;
    }
    cost += fixed.cost;
    value += fixed.value;
    includedCount++;
  }
  const result = value - cost + income;
  // Histórico parcial: há compras datadas, mas parte da posição segue sem datas.
  const partialHistoryCount = included.filter((row) => {
    const ledger = ledgers.get(row.ticker)!;
    return ledger.dated && ledger.baseline.length > 0;
  }).length;
  const response: CostPerformance = {
    currency,
    cost,
    value,
    income,
    result,
    returnPercent: cost > 0 ? (result / cost) * 100 : undefined,
    includedCount,
    totalCount: rows.length + p.fixedIncome.length,
    excluded,
    estimatedFX,
    points: [],
    warnings,
    datedPositionCount: included.filter((row) => ledgers.get(row.ticker)!.dated)
      .length,
    partialHistoryCount,
    manualFixedCount: p.fixedIncome.filter((r) => r.cost !== null && r.cost > 0)
      .length,
  };
  if (estimatedFX)
    warnings.push(
      currency === "USD"
        ? "Taxas em reais sem câmbio registrado são convertidas para dólares pela cotação do dia da operação. Essa parcela do custo é uma estimativa."
        : "Sem o câmbio da remessa, o custo em reais usa o dólar oficial (PTAX) do dia de cada compra. É uma estimativa: a taxa real da remessa pode ser diferente. O resultado do grupo americano é calculado em dólares.",
    );
  if (excluded.length)
    warnings.push("Fora do cálculo acumulado: " + excluded.join("; ") + ".");
  if (!included.length) return response;

  const start = brDate(new Date(now - days * 86400000));
  const series = new Map(
    included.map((r) => [r.ticker, priceSeries(market, r.ticker, today)]),
  );
  const dates = new Set([today]);
  for (const points of series.values())
    for (const point of points) if (point.date >= start) dates.add(point.date);
  for (const tx of p.transactions)
    if (tx.kind === "buy" && tx.date >= start && tx.date <= today)
      dates.add(tx.date);
  for (const event of events)
    if (event.date >= start && event.date <= today) dates.add(event.date);
  const selectedTickers = new Set(included.map((r) => r.ticker));
  const incomes = [...selectedTickers].flatMap((ticker) =>
    incomesFor(p, ticker).map((i) => ({ ...i, ticker })),
  );
  for (const i of incomes)
    if (i.date >= start && i.date <= today) dates.add(i.date);
  const orderedDates = [...dates]
    .filter((d) => d >= start && d <= today)
    .sort();
  for (const date of orderedDates) {
    const dayFx = atDate(fxSeries, date);
    let invested = 0,
      balance = 0,
      received = 0,
      complete = true;
    for (const row of included) {
      // Saldo inicial sem datas de compra: só existe a partir da data de referência.
      // Valorizá-lo antes disso criaria um retorno que a carteira não teve.
      const ledger = ledgers.get(row.ticker)!;
      if (ledger.baseline.some((lot) => lot.date > date)) continue;
      const state = replayLedger(ledger, date);
      if (state.quantity === 0) continue;
      const price = atDate(series.get(row.ticker)!, date);
      const lotCost = add(
        state.lots.map((tx) => costOf(tx, currency, fxOn(tx.date))),
      );
      const lotValue =
        price === null
          ? null
          : convert(
              state.quantity *
                splitAdjustment(finals.get(row.ticker)!, date) *
                price,
              row.currency,
              currency,
              dayFx,
            );
      if (lotCost === null || lotValue === null) {
        complete = false;
        break;
      }
      invested += lotCost;
      balance += lotValue;
    }
    if (!complete || invested <= 0) continue;
    for (const row of included) {
      const { kept } = attributeIncomes(
        ledgers.get(row.ticker)!,
        incomes.filter((i) => i.ticker === row.ticker),
        date,
      );
      for (const i of kept) {
        const amount = incomeOf(i, currency, fxOn(i.date));
        if (amount === null) {
          complete = false;
          break;
        }
        received += amount;
      }
    }
    if (complete)
      response.points.push({
        time: Date.parse(date + "T12:00:00Z"),
        date,
        portfolio: ((balance - invested + received) / invested) * 100,
        value: balance,
      });
  }
  if (response.datedPositionCount)
    warnings.push(
      "As movimentações documentadas de " +
        response.datedPositionCount +
        " posições entram nas datas informadas. Vendas reduzem quantidade e custo pelo preço médio. O extrato de operações não substitui a posição consolidada. Ciclos encerrados ficam fora da carteira atual.",
    );
  if (partialHistoryCount)
    warnings.push(
      "Histórico parcial em " +
        partialHistoryCount +
        " posições: quantidades e custos consolidados são preservados. Parcelas sem datas são estimadas pelo custo informado, sem criar pontos de compra. Ajustes de custo sem quantidade adicional entram na data de referência do cadastro.",
    );
  if (included.some((row) => ledgers.get(row.ticker)!.baseline.length > 0))
    warnings.push(
      "Posições sem histórico de operações entram na curva na data de referência, com a quantidade e o preço médio informados. Não presumimos datas de compra para elas.",
    );
  if (incomes.some((i) => i.kind === "opening"))
    warnings.push(
      "Proventos acumulados entram na curva na data de referência registrada. O total acumulado atual inclui todos os proventos informados.",
    );
  if (p.fixedIncome.length)
    warnings.push(
      "Renda fixa com capital inicial informado entra no resultado acumulado. A curva usa apenas ativos com cotações, pois os saldos de renda fixa são manuais.",
    );
  warnings.push(
    "O período selecionado muda apenas a janela da curva. O acumulado usa o valor investido registrado, sem zerar o retorno no início do gráfico. Novas compras entram na data informada; a curva usa preços sem ajuste por dividendos quando disponíveis.",
  );
  return response;
}
