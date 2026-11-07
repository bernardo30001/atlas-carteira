import { BASE_STOCK_WEIGHTS } from "./evaluation-config.ts";
import {
  attributeIncomes,
  incomesFor,
  ledgerFor,
  replayLedger,
} from "./trade-history.ts";
export type Currency = "BRL" | "USD";
export type Group = "br" | "rf" | "etf" | "crypto";
export type Asset = {
  ticker: string;
  symbol: string;
  name: string;
  group: Group;
  currency: "BRL" | "USD";
  sector: string;
  color: string;
  query: string;
  /** FIIs entram na meta Brasil, mas têm cartão e filtro próprios. */
  segment?: "fii";
  /** Ativo encerrado: fica no histórico sem exigir cotação. */
  archived?: boolean;
};
export const GROUPS: Record<
  Group,
  { name: string; short: string; color: string }
> = {
  br: { name: "Ações brasileiras", short: "Brasil", color: "var(--group-br)" },
  rf: { name: "Renda fixa", short: "Renda fixa", color: "var(--group-rf)" },
  etf: {
    name: "ETFs internacionais",
    short: "Exterior",
    color: "var(--group-etf)",
  },
  crypto: {
    name: "Bitcoin e cripto",
    short: "Bitcoin",
    color: "var(--group-crypto)",
  },
};
export const ASSETS: Asset[] = (
  [
    ["ALUP11", "Alupar", "Energia", "#626b99", "Alupar ALUP11"],
    ["WEGE3", "WEG", "Indústria", "#377fc1", "WEG WEGE3"],
    ["ITUB4", "Itaú Unibanco", "Bancos", "#d67e2f", "Itaú ITUB4"],
    ["KLBN4", "Klabin", "Papel e celulose", "#5a8c64", "Klabin KLBN4"],
    ["EGIE3", "Engie Brasil", "Energia", "#1e8ba8", "Engie EGIE3"],
    ["BPAC11", "BTG Pactual", "Bancos", "#344c7c", "BTG Pactual BPAC11"],
    ["BBSE3", "BB Seguridade", "Seguros", "#b6a143", "BB Seguridade BBSE3"],
    ["PSSA3", "Porto Seguro", "Seguros", "#428cbb", "Porto Seguro PSSA3"],
    ["TUPY3", "Tupy", "Indústria", "#9f6f57", "Tupy TUPY3"],
    ["LEVE3", "Mahle Metal Leve", "Autopeças", "#4e7e9c", "Mahle LEVE3"],
    ["FESA4", "Ferbasa", "Siderurgia", "#a78858", "Ferbasa FESA4"],
    ["VALE3", "Vale", "Mineração", "#3a958e", "Vale VALE3"],
    ["PRIO3", "PRIO", "Petróleo e gás", "#9c872f", "PRIO PRIO3"],
  ] as string[][]
)
  .map(([ticker, name, sector, color, query]) => ({
    ticker,
    symbol: ticker + ".SA",
    name,
    sector,
    color,
    query,
    group: "br" as Group,
    currency: "BRL" as Asset["currency"],
  }))
  .concat([
    {
      ticker: "ABTC11",
      symbol: "ABTC11.SA",
      name: "BTG Teva AUVP Bitcoin Fear Arbitrage",
      sector: "ETF de Bitcoin na B3",
      color: "#bb954e",
      query: "ABTC11 BTG Bitcoin Fear",
      group: "crypto",
      currency: "BRL",
    },
    {
      ticker: "AUPO11",
      symbol: "AUPO11.SA",
      name: "BTG Teva AUVP ITBR Liquidez",
      sector: "ETF de renda fixa na B3",
      color: "#749775",
      query: "AUPO11 BTG liquidez",
      group: "rf",
      currency: "BRL",
    },
    {
      ticker: "VOO",
      symbol: "VOO",
      name: "Vanguard S&P 500",
      sector: "Ações EUA · S&P 500",
      color: "#a36a70",
      query: "VOO Vanguard S&P 500 ETF",
      group: "etf",
      currency: "USD",
    },
    {
      ticker: "SPHQ",
      symbol: "SPHQ",
      name: "Invesco S&P 500 Quality",
      sector: "Ações EUA · qualidade",
      color: "#658eb1",
      query: "SPHQ Invesco ETF",
      group: "etf",
      currency: "USD",
    },
    {
      ticker: "VEA",
      symbol: "VEA",
      name: "Vanguard FTSE Developed",
      sector: "Mercados desenvolvidos",
      color: "#9a6272",
      query: "VEA Vanguard ETF",
      group: "etf",
      currency: "USD",
    },
    {
      ticker: "VNQ",
      symbol: "VNQ",
      name: "Vanguard Real Estate",
      sector: "Imóveis EUA",
      color: "#84749f",
      query: "VNQ Vanguard real estate ETF",
      group: "etf",
      currency: "USD",
    },
    {
      ticker: "IAU",
      symbol: "IAU",
      name: "iShares Gold Trust",
      sector: "Ouro",
      color: "#b89b53",
      query: "IAU iShares ouro gold",
      group: "etf",
      currency: "USD",
    },
    {
      ticker: "VWO",
      symbol: "VWO",
      name: "Vanguard FTSE Emerging",
      sector: "Mercados emergentes",
      color: "#4f9291",
      query: "VWO Vanguard emerging ETF",
      group: "etf",
      currency: "USD",
    },
    {
      ticker: "BTC",
      symbol: "BTC-USD",
      name: "Bitcoin",
      sector: "Criptomoeda",
      color: "#d69c48",
      query: "Bitcoin BTC",
      group: "crypto",
      currency: "USD",
    },
  ] as Asset[]);
// Keep legacy records importable, while excluding this ticker from every current view/model.
export const LEGACY_ASSETS: Asset[] = [
  {
    ticker: "KLBN11",
    symbol: "KLBN11.SA",
    name: "Klabin Units · fora do acompanhamento",
    sector: "Papel e celulose",
    color: "#5a8c64",
    query: "Klabin KLBN11",
    group: "br",
    currency: "BRL",
  },
];
export const KNOWN_ASSETS = [...ASSETS, ...LEGACY_ASSETS];
/** Só os ativos legados ficam fora: os que você cadastrou também são acompanhados. */
export const isTrackedTicker = (ticker: string) =>
  !LEGACY_ASSETS.some((a) => a.ticker === ticker);
export function trackedPortfolio(p: Portfolio): Portfolio {
  if (
    [...p.transactions, ...(p.incomes ?? []), ...(p.tradeHistory ?? [])].every(
      (t) => isTrackedTicker(t.ticker),
    )
  )
    return p;
  return {
    ...p,
    transactions: p.transactions.filter((t) => isTrackedTicker(t.ticker)),
    incomes: p.incomes?.filter((i) => isTrackedTicker(i.ticker)),
    tradeHistory: p.tradeHistory?.filter((t) => isTrackedTicker(t.ticker)),
  };
}
export type Transaction = {
  id: string;
  ticker: string;
  kind: "opening" | "buy";
  quantity: number;
  price: number;
  fx: number | null;
  fees: number;
  date: string;
  note: string;
  currency?: Currency;
  costNative?: number;
  /** Posição inicial que o histórico de movimentações já explica por inteiro. */
  reconciled?: boolean;
  /** Moeda das taxas. Sem esse campo, são reais. */
  feesCurrency?: Currency;
};
export type TradeEvent = {
  id: string;
  ticker: string;
  kind: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  currency: Currency;
  fx: number | null;
  fees: number;
  /** Moeda das taxas. Sem esse campo, são reais. */
  feesCurrency?: Currency;
  date: string;
  /** Origem do registro: tipo-de-arquivo|instituição|data da importação. */
  source?: string;
  institution?: string;
  /** Chave estável da importação, para reimportar sem duplicar. */
  importKey?: string;
};
export type CorporateAction = {
  id: string;
  ticker: string;
  date: string;
  kind: "split" | "bonus" | "rename";
  /** Split: multiplicador de cotas (2 = 1 vira 2; 0,5 = grupamento). Bonus: proporção. */
  factor?: number;
  /** Cotas creditadas ou debitadas, quando o arquivo traz isso em vez da proporção. */
  delta?: number;
  newTicker?: string;
  /** Custo unitário atribuído às cotas bonificadas. */
  unitCost?: number;
  source?: string;
  importKey?: string;
};
export type FixedIncome = {
  id: string;
  name: string;
  cost: number | null;
  value: number;
  date: string;
  updatedAt: string;
  ratePercent?: number;
  index?: string;
  note?: string;
};
export type Income = {
  id: string;
  ticker: string;
  amount: number;
  currency: Currency;
  date: string;
  kind: "opening" | "payment";
  fx?: number | null;
  note: string;
  /** Origem do registro: tipo-de-arquivo|instituição|data da importação. */
  source?: string;
  institution?: string;
  /** Chave estável da importação, para reimportar sem duplicar. */
  importKey?: string;
  type?: "dividend" | "jcp" | "yield";
  /** Imposto retido na fonte. O valor registrado é o líquido recebido. */
  withheldTax?: number;
};
export type StatementRow = {
  ticker: string;
  quantity: number;
  average: number;
  price: number;
  balance: number;
  cost: number;
  dividends: number;
  reportedResult: number;
};
export type Statement = {
  id: string;
  date: string;
  label: string;
  rows: StatementRow[];
  reportedTotals: {
    BRL: { balance: number; cost: number; dividends: number; result: number };
    USD: { balance: number; cost: number; dividends: number; result: number };
  };
  bitcoin?: {
    quantity: number;
    balance: number;
    cost: number;
    reportedProfit: number;
    reportedPercent: number;
    twelveMonthProfit: number;
  };
  notes: string[];
};
export type Portfolio = {
  transactions: Transaction[];
  fixedIncome: FixedIncome[];
  targets: Record<Group, number>;
  weights: Record<string, number>;
  incomes?: Income[];
  statements?: Statement[];
  tradeHistory?: TradeEvent[];
  schemaVersion?: number;
  /** Ativos cadastrados por você, além da lista padrão. */
  customAssets?: Asset[];
  corporateActions?: CorporateAction[];
  evaluation?: import("./evaluation-config").EvaluationSettings;
};
export const EMPTY: Portfolio = {
  transactions: [],
  fixedIncome: [],
  targets: { br: 35, rf: 35, etf: 22, crypto: 8 },
  weights: {},
  incomes: [],
  statements: [],
};
export type Point = { date: string; close: number };
export type Quote = {
  ticker: string;
  price: number;
  previous: number;
  change: number;
  currency: string;
  time: number;
  source: string;
  delay: number | null;
  history: Point[];
  priceHistory?: Point[];
  volatility: number | null;
  momentum: number | null;
  drawdown: number | null;
  /** A última consulta falhou e o preço é o anterior. */
  stale?: boolean;
  /** A fonte respondeu, mas o preço é antigo. Não bloqueia o patrimônio. */
  outdated?: boolean;
};
export type Market = {
  quotes: Record<string, Quote>;
  errors: string[];
  fetchedAt: string;
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function metrics(history: Point[], annual = 252) {
  const closes = history.map((p) => p.close).filter((x) => x > 0);
  if (closes.length < 30)
    return { volatility: null, momentum: null, drawdown: null };
  const ret = closes.slice(1).map((x, i) => Math.log(x / closes[i]));
  const mean = ret.reduce((a, b) => a + b, 0) / ret.length;
  const volatility =
    Math.sqrt(ret.reduce((a, b) => a + (b - mean) ** 2, 0) / (ret.length - 1)) *
    Math.sqrt(annual) *
    100;
  let peak = closes[0],
    drawdown = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    drawdown = Math.min(drawdown, (c / peak - 1) * 100);
  }
  const days = annual === 365 ? 183 : 126;
  return {
    volatility,
    momentum:
      closes.length > days
        ? (closes.at(-1)! / closes.at(-days - 1)! - 1) * 100
        : null,
    drawdown,
  };
}
export const allAssets = (p: Pick<Portfolio, "customAssets">): Asset[] =>
  p.customAssets?.length ? [...ASSETS, ...p.customAssets] : ASSETS;
export const assetOf = (p: Pick<Portfolio, "customAssets">, ticker: string) =>
  allAssets(p).find((a) => a.ticker === ticker);
export const transactionCurrency = (tx: Transaction): Currency =>
  tx.currency ??
  KNOWN_ASSETS.find((a) => a.ticker === tx.ticker)?.currency ??
  "BRL";
export const transactionCost = (tx: Transaction) =>
  tx.costNative ?? tx.quantity * tx.price;
export const wholeUnits = (a: Asset) =>
  a.currency === "BRL" && a.ticker !== "BTC";
const sumNullable = (xs: (number | null)[]) =>
  xs.some((x) => x === null)
    ? null
    : xs.reduce<number>((s, x) => s + (x ?? 0), 0);
export const usableQuote = (q: Quote | undefined): q is Quote =>
  !!q && !q.stale && Number.isFinite(q.price) && q.price > 0;
export function positions(portfolio: Portfolio, market: Market) {
  const fx = usableQuote(market.quotes.USD)
    ? market.quotes.USD.price
    : undefined;
  return allAssets(portfolio).map((a) => {
    const ledger = ledgerFor(portfolio, a.ticker),
      state = replayLedger(ledger),
      tx = state.lots,
      income = attributeIncomes(ledger, incomesFor(portfolio, a.ticker)).kept;
    const quantity = state.quantity,
      q = market.quotes[a.ticker],
      quoteValid = usableQuote(q) && q.currency === a.currency;
    const nativeValue =
      quantity === 0 || a.archived ? 0 : quoteValid ? quantity * q.price : null;
    const value =
      nativeValue === 0
        ? 0
        : nativeValue === null
          ? null
          : a.currency === "BRL"
            ? nativeValue
            : fx
              ? nativeValue * fx
              : null;
    const primaryCurrency: Currency = a.ticker === "BTC" ? "BRL" : a.currency;
    const primaryValue = primaryCurrency === "BRL" ? value : nativeValue;
    // Taxas são em reais. Sem câmbio de compra, a parcela em dólar usa o câmbio atual
    // e o custo em dólar nunca se perde por causa dela.
    const usdCost = (t: Transaction) => {
      if (t.feesCurrency === "USD") return transactionCost(t) + t.fees;
      const rate = t.fx ?? fx;
      return transactionCost(t) + (t.fees > 0 && rate ? t.fees / rate : 0);
    };
    const costEstimated =
      primaryCurrency === "USD" &&
      tx.some((t) => t.fees > 0 && !t.fx && t.feesCurrency !== "USD");
    const cost = sumNullable(
      tx.map((t) =>
        transactionCurrency(t) === "BRL"
          ? transactionCost(t) + t.fees
          : t.fx !== null
            ? (transactionCost(t) + (t.feesCurrency === "USD" ? t.fees : 0)) *
                t.fx +
              (t.feesCurrency === "USD" ? 0 : t.fees)
            : null,
      ),
    );
    const primaryCost =
      primaryCurrency === "BRL"
        ? cost
        : sumNullable(
            tx.map((t) =>
              transactionCurrency(t) === "USD" ? usdCost(t) : null,
            ),
          );
    const nativeIncome = sumNullable(
      income.map((i) =>
        i.currency === primaryCurrency
          ? i.amount
          : i.fx
            ? i.currency === "USD"
              ? i.amount * i.fx
              : i.amount / i.fx
            : null,
      ),
    );
    const result =
      primaryValue !== null && primaryCost !== null && nativeIncome !== null
        ? primaryValue - primaryCost + nativeIncome
        : null;
    const currencies = new Set(tx.map(transactionCurrency));
    const averageCurrency =
      currencies.size > 1
        ? primaryCurrency
        : tx[0]
          ? transactionCurrency(tx[0])
          : primaryCurrency;
    const averageCost =
      currencies.size > 1
        ? primaryCost
        : sumNullable(
            tx.map((t) => {
              const fee =
                t.fees === 0
                  ? 0
                  : averageCurrency === "BRL"
                    ? t.fees
                    : t.fx
                      ? t.fees / t.fx
                      : null;
              return fee === null ? null : transactionCost(t) + fee;
            }),
          );
    const average = quantity
      ? currencies.size > 1
        ? primaryCost === null
          ? null
          : primaryCost / quantity
        : tx.reduce(
            (s, t) =>
              s +
              (transactionCurrency(t) === "BRL"
                ? transactionCost(t) + t.fees
                : usdCost(t)),
            0,
          ) / quantity
      : 0;
    return {
      ...a,
      quantity,
      cost,
      value,
      nativeValue,
      primaryCurrency,
      primaryValue,
      primaryCost,
      costEstimated,
      nativeIncome,
      result,
      quote: q,
      average,
      averageCurrency,
      feesBRL: tx.reduce((s, t) => s + t.fees, 0),
      transactions: tx,
      incomes: income,
    };
  });
}
export function totals(p: Portfolio, m: Market) {
  p = trackedPortfolio(p);
  const rows = positions(p, m),
    missing = rows.filter((r) => r.quantity > 0 && r.value === null);
  const byGroup: Record<Group, number> = {
    br: 0,
    rf: p.fixedIncome.reduce((s, r) => s + r.value, 0),
    etf: 0,
    crypto: 0,
  };
  for (const r of rows) byGroup[r.group] += r.value ?? 0;
  const value = Object.values(byGroup).reduce((a, b) => a + b, 0),
    cost = sumNullable([
      ...rows.map((r) => r.cost),
      ...p.fixedIncome.map((r) => r.cost),
    ]);
  const income = sumNullable(
    rows.flatMap((r) =>
      r.incomes.map((i) =>
        i.currency === "BRL" ? i.amount : i.fx ? i.amount * i.fx : null,
      ),
    ),
  );
  const result =
    cost !== null && income !== null && !missing.length
      ? value - cost + income
      : null;
  // Resumo por classe, na moeda principal de cada posição. Um ETF conta na classe a
  // que dá exposição: ABTC11 é Bitcoin e AUPO11 é renda fixa, mesmo negociados na B3.
  const summary = (matches: (r: (typeof rows)[number]) => boolean) => {
    const owned = rows.filter(
      (r) => !r.archived && r.quantity > 0 && matches(r),
    );
    return {
      value: owned.reduce((s, r) => s + (r.primaryValue ?? 0), 0),
      cost: sumNullable(owned.map((r) => r.primaryCost)),
      income: sumNullable(owned.map((r) => r.nativeIncome)),
      result: sumNullable(owned.map((r) => r.result)),
      missing: owned.some((r) => r.primaryValue === null),
      count: owned.length,
    };
  };
  return {
    rows,
    missing,
    byGroup,
    value,
    cost,
    result,
    brazilStocks: summary((r) => r.group === "br" && r.segment !== "fii"),
    brazilFiis: summary((r) => r.segment === "fii"),
    fixedQuoted: summary((r) => r.group === "rf"),
    international: summary((r) => r.group === "etf"),
    bitcoin: summary((r) => r.group === "crypto"),
    incomes: {
      BRL: (p.incomes ?? [])
        .filter((i) => i.currency === "BRL")
        .reduce((s, i) => s + i.amount, 0),
      USD: (p.incomes ?? [])
        .filter((i) => i.currency === "USD")
        .reduce((s, i) => s + i.amount, 0),
    },
  };
}
/** Variação do dia nas posições cotadas, em reais e com o efeito do dólar. Renda fixa
 * manual não tem cotação diária. Sem preço válido, fica pendente em vez de parcial. */
export function dayChange(p: Portfolio, m: Market) {
  const usd = m.quotes.USD && !m.quotes.USD.stale ? m.quotes.USD : undefined;
  let now = 0,
    before = 0;
  for (const r of positions(p, m)) {
    if (r.quantity <= 0 || r.archived) continue;
    const q = r.quote;
    if (!q || q.stale || (r.currency === "USD" && !usd)) return null;
    now += r.quantity * q.price * (r.currency === "USD" ? usd!.price : 1);
    before +=
      r.quantity *
      (q.previous || q.price) *
      (r.currency === "USD" ? usd!.previous || usd!.price : 1);
  }
  return before > 0
    ? { amount: now - before, percent: (now / before - 1) * 100 }
    : null;
}
/** Distribui o aporte para que os destinos terminem igualmente perto da meta: quem está
 * mais longe, em proporção à própria meta, recebe primeiro, até alcançar o seguinte. Sem
 * vender nada, é o que deixa menor a maior distância em relação às metas. */
function fillToTargets(
  items: { key: string; target: number; held: number }[],
  budget: number,
) {
  const funded = items
    .filter((item) => item.target > 0)
    .sort((a, b) => a.held / a.target - b.held / b.target);
  let held = 0,
    target = 0,
    level = 0;
  for (const [index, item] of funded.entries()) {
    held += item.held;
    target += item.target;
    level = (budget + held) / target;
    const next = funded[index + 1];
    if (!next || level <= next.held / next.target) break;
  }
  return new Map(
    items.map((item) => [
      item.key,
      item.target > 0 ? Math.max(0, level * item.target - item.held) : 0,
    ]),
  );
}
export function allocationPlan(p: Portfolio, m: Market, budget: number) {
  const t = totals(p, m);
  if (t.missing.length || !Number.isFinite(budget) || !(budget > 0)) return [];
  const keys = Object.keys(GROUPS) as Group[],
    amounts = fillToTargets(
      keys.map((group) => ({
        key: group,
        target: p.targets[group] / 100,
        held: t.byGroup[group],
      })),
      budget,
    );
  return keys.map((group) => ({
    group,
    gap: Math.max(
      0,
      ((t.value + budget) * p.targets[group]) / 100 - t.byGroup[group],
    ),
    amount: amounts.get(group) ?? 0,
  }));
}
export type PlanDestination = "all" | "br" | "etf";
export type PlanItem = {
  ticker: string;
  group: Group;
  amount: number;
  quantity: number;
  executable: number;
  gap: number;
  quote: Quote | undefined;
  /** Peso do ativo dentro da classe hoje e o recomendado, em %. */
  currentShare: number;
  targetShare: number;
  /** Por que não recebe neste aporte. */
  reason?: string;
};
const PAUSED_THESES = new Set(["review", "broken"]);
/** Pesos dentro da classe. Ações seguem a sua regra base; nas demais, sem pesos escolhidos,
 * mantém a proporção atual, sem presumir divisão. Tese em revisão não recebe aporte. */
function classWeights(
  p: Portfolio,
  group: Group,
  assets: { ticker: string; value: number | null }[],
) {
  const held = (a: { value: number | null }) => a.value ?? 0,
    chosen = assets.some((a) => p.weights[a.ticker] !== undefined),
    anyHeld = assets.some((a) => held(a) > 0);
  return (a: { ticker: string; value: number | null }) => {
    if (group === "br")
      return PAUSED_THESES.has(
        p.evaluation?.overrides?.[a.ticker]?.thesis ?? "",
      )
        ? 0
        : (p.evaluation?.baseWeights?.[a.ticker] ??
            p.weights[a.ticker] ??
            // Critérios salvos são a lista completa: o que não está neles não tem peso.
            (p.evaluation ? 0 : BASE_STOCK_WEIGHTS[a.ticker]) ??
            0);
    return chosen ? (p.weights[a.ticker] ?? 1) : anyHeld ? held(a) : 1;
  };
}
/** Plano completo do aporte: quanto vai para cada classe e o que comprar em cada uma.
 * Em "só bolsa BR" ou "só ETFs", todo o valor fica na classe e segue os pesos dela. */
export function contributionPlan(
  p: Portfolio,
  m: Market,
  budget: number,
  destination: PlanDestination = "all",
) {
  const t = totals(p, m),
    keys = Object.keys(GROUPS) as Group[],
    fx = m.quotes.USD && !m.quotes.USD.stale ? m.quotes.USD.price : undefined,
    ready = !t.missing.length && Number.isFinite(budget) && budget > 0;
  const empty = {
    ready,
    missing: t.missing.length > 0,
    classes: [] as {
      group: Group;
      amount: number;
      current: number;
      after: number;
      target: number;
    }[],
    items: [] as PlanItem[],
    waiting: [] as PlanItem[],
    spent: 0,
    leftover: 0,
  };
  if (!ready) return empty;
  const amounts =
      destination === "all"
        ? new Map(allocationPlan(p, m, budget).map((g) => [g.group, g.amount]))
        : new Map(keys.map((g) => [g, g === destination ? budget : 0])),
    total = t.value + budget,
    items: PlanItem[] = [],
    waiting: PlanItem[] = [];
  for (const group of keys) {
    const classAmount = amounts.get(group) ?? 0;
    if (classAmount < 0.01) continue;
    const assets = t.rows.filter((a) => a.group === group && !a.archived),
      held = (a: (typeof assets)[number]) => a.value ?? 0,
      weightOf = classWeights(p, group, assets),
      weightSum = assets.reduce((s, a) => s + weightOf(a), 0),
      heldSum = assets.reduce((s, a) => s + held(a), 0),
      planned = fillToTargets(
        assets.map((a) => ({
          key: a.ticker,
          target: weightOf(a),
          held: held(a),
        })),
        classAmount,
      );
    const rows = assets.map((a) => {
      const q = a.quote,
        amount = planned.get(a.ticker) ?? 0,
        unit =
          q && !q.stale ? q.price * (a.currency === "USD" ? (fx ?? 0) : 1) : 0,
        precision = wholeUnits(a) ? 1 : a.ticker === "BTC" ? 1e8 : 1e6,
        quantity =
          unit > 0 ? Math.floor((amount / unit) * precision) / precision : 0;
      return {
        ticker: a.ticker,
        group,
        amount,
        quantity,
        executable: quantity * unit,
        gap: amount,
        quote: q,
        currentShare: heldSum ? (held(a) / heldSum) * 100 : 0,
        targetShare: weightSum ? (weightOf(a) / weightSum) * 100 : 0,
        unit,
        precision,
      };
    });
    // O que o arredondamento em cotas inteiras deixou vai para quem aceita frações,
    // ou para mais uma cota de quem couber, em vez de ficar sem destino.
    const funded = rows.filter((x) => x.amount > 0);
    let left = classAmount - funded.reduce((s, x) => s + x.executable, 0);
    for (const item of [...funded].sort((a, b) =>
      a.precision === b.precision
        ? b.amount - a.amount
        : b.precision - a.precision,
    )) {
      if (left <= 0 || item.unit <= 0) continue;
      const extra =
        Math.floor((left / item.unit) * item.precision) / item.precision;
      item.quantity =
        Math.round((item.quantity + extra) * item.precision) / item.precision;
      item.executable = item.quantity * item.unit;
      left -= extra * item.unit;
    }
    for (const row of rows) {
      const item: PlanItem = {
        ticker: row.ticker,
        group: row.group,
        amount: row.amount,
        quantity: row.quantity,
        executable: row.executable,
        gap: row.gap,
        quote: row.quote,
        currentShare: row.currentShare,
        targetShare: row.targetShare,
      };
      if (item.quantity > 0) items.push(item);
      else
        waiting.push({
          ...item,
          reason:
            group === "br" &&
            PAUSED_THESES.has(
              p.evaluation?.overrides?.[item.ticker]?.thesis ?? "",
            )
              ? "Tese marcada para revisão"
              : item.targetShare === 0
                ? "Sem peso definido"
                : row.unit <= 0
                  ? "Cotação indisponível"
                  : item.amount > 0
                    ? "Valor menor que uma cota"
                    : "Já está no peso ou acima",
        });
    }
  }
  items.sort((a, b) => b.executable - a.executable);
  waiting.sort((a, b) => b.targetShare - a.targetShare);
  const spent = items.reduce((s, x) => s + x.executable, 0);
  return {
    ...empty,
    classes: keys.map((group) => ({
      group,
      amount: amounts.get(group) ?? 0,
      current: t.value ? (t.byGroup[group] / t.value) * 100 : 0,
      after: ((t.byGroup[group] + (amounts.get(group) ?? 0)) / total) * 100,
      target: p.targets[group],
    })),
    items,
    waiting,
    spent,
    leftover: Math.max(0, budget - spent),
  };
}
export function assetPlan(p: Portfolio, m: Market, budget: number) {
  return contributionPlan(p, m, budget).items;
}
