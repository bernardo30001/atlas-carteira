import {
  allAssets,
  usableQuote,
  type Asset,
  type Currency,
  type FixedIncome,
  type Market,
  type Point,
  type Portfolio,
} from "./model.ts";
import {
  brDate,
  cdiFactor,
  performancePortfolio,
  type BenchmarkKey,
  type CdiRate,
  type ChartPoint,
  type PerformanceScope,
} from "./performance.ts";
import {
  incomesFor,
  ledgerFor,
  replayLedger,
  splitAdjustment,
  type Ledger,
} from "./trade-history.ts";

export type HistoryPoint = ChartPoint & {
  value: number;
  /** Capital líquido aportado até a data: compras menos vendas. */
  invested: number;
};
export type HistoryPerformance = {
  currency: Currency;
  points: HistoryPoint[];
  /** Primeiro dia do período contínuo com posições. */
  startedAt: string | null;
  /** Rentabilidade da janela, com aportes e vendas neutralizados. */
  returnPercent: number | undefined;
  value: number | undefined;
  invested: number | undefined;
  /** Ativos sem cotação histórica, fora da curva. */
  excluded: string[];
  /** Posições que entram na data de referência, por não terem datas de compra. */
  undated: string[];
  /** Títulos manuais estimados pelo índice depois do último saldo informado. */
  estimatedFixed: string[];
  unavailable: BenchmarkKey[];
};

const validPrice = (v: number) => Number.isFinite(v) && v > 0;
const atDate = (series: Point[], date: string) => {
  // Busca binária: a curva consulta cada série em todos os dias.
  let low = 0,
    high = series.length - 1,
    found: number | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (series[middle].date <= date) {
      found = series[middle].close;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
};
/** Fechamentos sem ajuste por dividendos, que entram como pagamentos, mais a cotação atual. */
function prices(market: Market, ticker: string, today: string): Point[] {
  const quote = market.quotes[ticker];
  if (!quote) return [];
  const points = (quote.priceHistory ?? quote.history).filter(
    (p) => p.date <= today && validPrice(p.close),
  );
  const current = usableQuote(quote)
    ? [{ date: today, close: quote.price }]
    : [];
  return [
    ...new Map([...points, ...current].map((p) => [p.date, p])).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

type Flow = { buys: number; sales: number; income: number };
type Holding = {
  asset: Asset;
  ledger: Ledger;
  series: Point[];
  /** Quantidade após o último evento de cada data com mudança. */
  steps: { date: string; quantity: number }[];
  adjust: (date: string) => number;
};

/** Saldo manual estimado: do capital ao saldo informado por juros constantes e, depois
 * do último saldo, pelo índice contratado. Sem capital, entra na data do saldo. */
function fixedValue(r: FixedIncome, date: string, rates: CdiRate[]) {
  const entry = r.cost !== null && r.cost > 0 ? r.date : r.updatedAt;
  if (date < entry) return null;
  if (date <= r.updatedAt) {
    if (r.cost === null || r.cost <= 0 || r.date >= r.updatedAt) return r.value;
    const span = Date.parse(r.updatedAt) - Date.parse(r.date);
    return (
      r.cost *
      (r.value / r.cost) ** ((Date.parse(date) - Date.parse(r.date)) / span)
    );
  }
  return r.index?.toUpperCase() === "CDI" &&
    r.ratePercent !== undefined &&
    rates.length
    ? r.value * cdiFactor(rates, r.updatedAt, date, r.ratePercent)
    : r.value;
}

/**
 * Reconstrói a carteira dia a dia com as operações registradas e as cotações históricas.
 *
 * Retorno diário = (saldo final + vendas + proventos) / (saldo anterior + compras) − 1.
 * Compras entram no início do dia e vendas saem no fim, de modo que aportes não contam
 * como ganho, e os dias são encadeados. É a mesma ideia da cota de um fundo: permite
 * comparar com um índice qualquer que seja o tamanho de cada aporte.
 */
export function historyPerformance(
  portfolio: Portfolio,
  market: Market,
  rates: CdiRate[],
  scope: PerformanceScope = "all",
  days: number | null = null,
  now = Date.now(),
): HistoryPerformance {
  const p = performancePortfolio(portfolio, scope),
    currency: Currency = scope === "us" ? "USD" : "BRL",
    today = brDate(new Date(now)),
    fxSeries = prices(market, "USD", today);
  const empty: HistoryPerformance = {
    currency,
    points: [],
    startedAt: null,
    returnPercent: undefined,
    value: undefined,
    invested: undefined,
    excluded: [],
    undated: [],
    estimatedFixed: [],
    unavailable: [],
  };
  const fxAt = (date: string) => atDate(fxSeries, date);
  const toCurrency = (
    amount: number,
    from: Currency,
    date: string,
    rate?: number | null,
  ) => {
    if (amount === 0 || from === currency) return amount;
    const fx = rate || fxAt(date);
    if (!fx) return null;
    return from === "USD" ? amount * fx : amount / fx;
  };

  const flows = new Map<string, Flow>();
  const flowAt = (date: string) => {
    let flow = flows.get(date);
    if (!flow) flows.set(date, (flow = { buys: 0, sales: 0, income: 0 }));
    return flow;
  };
  const excluded: string[] = [],
    undated: string[] = [],
    holdings: Holding[] = [];
  let needsFx = false;
  for (const asset of allAssets(p)) {
    const ledger = ledgerFor(p, asset.ticker);
    if (!ledger.baseline.length && !ledger.entries.length) continue;
    const series = prices(market, asset.ticker, today);
    if (!series.length) {
      // Ativo encerrado ou sem fonte: sem preço não há como valorizar nenhum dia.
      if (replayLedger(ledger).quantity > 0 || !asset.archived)
        excluded.push(asset.ticker);
      continue;
    }
    if (asset.currency !== currency) needsFx = true;
    const dates = [
      ...new Set([
        ...ledger.baseline.map((l) => l.date),
        ...ledger.entries.map((e) => e.date),
        ...ledger.actions.map((a) => a.date),
      ]),
    ].sort();
    const final = replayLedger(ledger);
    holdings.push({
      asset,
      ledger,
      series,
      steps: dates.map((date) => ({
        date,
        quantity: replayLedger(ledger, date).quantity,
      })),
      adjust: (date) => splitAdjustment(final, date),
    });
    if (ledger.baseline.length) undated.push(asset.ticker);
  }
  // Sem nenhum preço, a curva seria só dos títulos manuais e pareceria a carteira inteira.
  if (!holdings.length && (excluded.length || !p.fixedIncome.length))
    return { ...empty, excluded, undated };
  if (needsFx && !fxSeries.length)
    return { ...empty, excluded: holdings.map((h) => h.asset.ticker), undated };

  const quantityOn = (holding: Holding, date: string) => {
    let quantity = 0;
    for (const step of holding.steps) {
      if (step.date > date) break;
      quantity = step.quantity;
    }
    return quantity;
  };
  // Antes do primeiro preço conhecido, o ativo fica parado no primeiro preço, para não
  // bloquear a curva dos demais. Costuma ser um ETF mais novo que a posição informada.
  const priceOn = (holding: Holding, date: string) =>
    atDate(holding.series, date) ?? holding.series[0].close;
  /** Saldo de uma posição na moeda da curva, na data. */
  const holdingValue = (holding: Holding, date: string) => {
    const quantity = quantityOn(holding, date);
    if (quantity === 0) return 0;
    return toCurrency(
      quantity * holding.adjust(date) * priceOn(holding, date),
      holding.asset.currency,
      date,
    );
  };

  for (const holding of holdings) {
    const { asset, ledger } = holding;
    // Sem datas de compra: entra pelo valor de mercado, sem gerar ganho nem perda.
    const baselineDate = ledger.baseline.reduce(
      (d, l) => (l.date > d ? l.date : d),
      "",
    );
    let quantity = 0;
    if (baselineDate) {
      const opening = ledger.baseline.reduce((s, l) => s + l.quantity, 0),
        close = priceOn(holding, baselineDate),
        value = toCurrency(
          opening * holding.adjust(baselineDate) * close,
          asset.currency,
          baselineDate,
        );
      quantity = opening;
      if (value !== null) flowAt(baselineDate).buys += value;
    }
    for (const event of ledger.entries) {
      const moved =
        event.kind === "buy"
          ? event.quantity
          : Math.min(event.quantity, quantity);
      // Venda sem saldo vem de compras anteriores ao arquivo: não tem efeito aqui.
      if (moved <= 0) continue;
      const share = moved / event.quantity,
        amount = toCurrency(
          event.total * share,
          event.currency,
          event.date,
          event.fx,
        ),
        fees = toCurrency(
          event.fees * share,
          event.feesCurrency ?? "BRL",
          event.date,
          event.fx,
        );
      if (amount === null || fees === null) continue;
      const flow = flowAt(event.date);
      if (event.kind === "buy") {
        quantity += moved;
        flow.buys += amount + fees;
      } else {
        quantity = Math.max(0, quantity - moved);
        flow.sales += amount - fees;
      }
    }
    for (const income of incomesFor(p, asset.ticker)) {
      const amount = toCurrency(
        income.amount,
        income.currency,
        income.date,
        income.fx,
      );
      if (amount !== null) flowAt(income.date).income += amount;
    }
  }
  const estimatedFixed: string[] = [];
  for (const r of p.fixedIncome) {
    const entry = r.cost !== null && r.cost > 0 ? r.date : r.updatedAt;
    flowAt(entry).buys += r.cost !== null && r.cost > 0 ? r.cost : r.value;
    if (entry <= today && r.updatedAt < today) estimatedFixed.push(r.name);
  }

  const firstEvent = [...flows.keys()].sort()[0];
  if (!firstEvent || firstEvent > today) return { ...empty, excluded, undated };
  const dates = new Set<string>([today, ...flows.keys()]);
  for (const holding of holdings)
    for (const point of holding.series) dates.add(point.date);
  const ordered = [...dates]
    .filter((d) => d >= firstEvent && d <= today)
    .sort();

  let index = 1,
    previous = 0,
    invested = 0,
    startedAt: string | null = null,
    raw: (HistoryPoint & { index: number })[] = [];
  for (const date of ordered) {
    let value = 0,
      complete = true;
    for (const holding of holdings) {
      const v = holdingValue(holding, date);
      if (v === null) {
        // Sem câmbio neste dia, por exemplo antes do início da série.
        complete = false;
        break;
      }
      value += v;
    }
    if (!complete) continue;
    for (const r of p.fixedIncome) value += fixedValue(r, date, rates) ?? 0;
    const flow = flows.get(date) ?? { buys: 0, sales: 0, income: 0 },
      capital = previous + flow.buys;
    if (capital > 0) index *= (value + flow.sales + flow.income) / capital;
    invested += flow.buys - flow.sales;
    if (value <= 1e-8) {
      // Carteira zerada: a próxima compra começa outra história, sem ligar as duas.
      raw = [];
      index = 1;
      invested = 0;
      previous = 0;
      startedAt = null;
      continue;
    }
    startedAt ??= date;
    previous = value;
    raw.push({
      time: Date.parse(date + "T12:00:00Z"),
      date,
      portfolio: 0,
      value,
      invested,
      index,
    });
  }
  if (!raw.length) return { ...empty, excluded, undated, estimatedFixed };

  const windowStart =
    days === null ? "" : brDate(new Date(now - days * 86400000));
  const shown = raw.filter((point) => point.date >= windowStart);
  const base = shown[0] ?? raw.at(-1)!,
    // Desde o início, o primeiro dia já conta do preço pago até o fechamento.
    baseIndex = raw[0].date === base.date ? 1 : base.index;
  const unavailable: BenchmarkKey[] = [];
  const reference = (
    key: Exclude<BenchmarkKey, "cdi">,
    ticker: string,
    usd: boolean,
  ) => {
    const series = market.quotes[ticker]
      ? (market.quotes[ticker].history.length
          ? market.quotes[ticker].history
          : []
        ).filter((q) => validPrice(q.close))
      : [];
    const level = (date: string) => {
      const close = atDate(series, date);
      if (close === null) return null;
      if (!usd || currency === "USD") return close;
      const fx = fxAt(date);
      return fx ? close * fx : null;
    };
    const start = level(base.date);
    if (start === null || !series.length || series[0].date > base.date) {
      unavailable.push(key);
      return null;
    }
    return (date: string) => {
      const current = level(date);
      return current === null ? undefined : (current / start - 1) * 100;
    };
  };
  const ibov = reference("ibov", "IBOV", false),
    sp500 = reference("sp500", "SP500", true),
    bitcoin = reference("bitcoin", "BTC", true),
    cdiReady =
      rates.length > 1 &&
      rates[0].date <= base.date &&
      rates.at(-1)!.date >= base.date;
  if (!cdiReady) unavailable.push("cdi");
  const points: HistoryPoint[] = (shown.length ? shown : [base]).map(
    ({ index: pointIndex, ...point }) => {
      const benchmarks: Partial<Record<BenchmarkKey, number>> = {};
      const ibovValue = ibov?.(point.date),
        spValue = sp500?.(point.date),
        btcValue = bitcoin?.(point.date);
      if (ibovValue !== undefined) benchmarks.ibov = ibovValue;
      if (spValue !== undefined) benchmarks.sp500 = spValue;
      if (btcValue !== undefined) benchmarks.bitcoin = btcValue;
      if (cdiReady)
        benchmarks.cdi = (cdiFactor(rates, base.date, point.date) - 1) * 100;
      return {
        ...point,
        ...benchmarks,
        portfolio: (pointIndex / baseIndex - 1) * 100,
      };
    },
  );
  const last = points.at(-1)!;
  return {
    currency,
    points,
    startedAt,
    returnPercent: last.portfolio,
    value: last.value,
    invested: last.invested,
    excluded,
    undated,
    estimatedFixed,
    unavailable,
  };
}
