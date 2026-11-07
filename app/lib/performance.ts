import { currentTicker } from "./trade-history.ts";
import {
  assetOf,
  totals,
  trackedPortfolio,
  type Portfolio,
  type Market,
} from "./model.ts";
export const PERFORMANCE_SCOPES = [
  {
    key: "all",
    name: "Tudo",
    description: "Toda a carteira, incluindo renda fixa e Bitcoin.",
  },
  {
    key: "us",
    name: "Exterior",
    description: "ETFs negociados em dólar, com retorno em dólares.",
  },
  {
    key: "br",
    name: "Brasil",
    description: "Somente ações brasileiras.",
  },
  {
    key: "rf",
    name: "Renda fixa",
    description: "ETFs de renda fixa na B3 e títulos manuais, como CDBs.",
  },
  {
    key: "btc",
    name: "Bitcoin",
    description: "Bitcoin direto (BTC) e ETFs de Bitcoin na B3, como ABTC11.",
  },
] as const;
export type PerformanceScope = (typeof PERFORMANCE_SCOPES)[number]["key"];
export function performancePortfolio(
  p: Portfolio,
  scope: PerformanceScope,
): Portfolio {
  p = trackedPortfolio(p);
  if (scope === "all") return p;
  const matches = (record: { ticker: string; date: string }) => {
    const ticker = currentTicker(p, record.ticker, record.date),
      asset = assetOf(p, ticker);
    return scope === "btc"
      ? asset?.group === "crypto"
      : scope === "rf"
        ? asset?.group === "rf"
        : scope === "br"
          ? asset?.group === "br" && asset.segment !== "fii"
          : asset?.group === "etf";
  };
  return {
    ...p,
    transactions: p.transactions.filter(matches),
    incomes: (p.incomes ?? []).filter(matches),
    fixedIncome: scope === "rf" ? p.fixedIncome : [],
    tradeHistory: p.tradeHistory?.filter(matches),
  };
}
export type BenchmarkKey = "ibov" | "sp500" | "bitcoin" | "cdi";
export type ChartPoint = {
  time: number;
  date: string;
  portfolio: number;
  ibov?: number;
  sp500?: number;
  bitcoin?: number;
  cdi?: number;
  value?: number;
  flow?: number;
};
export type CdiRate = { date: string; rate: number };
export const brDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const pct = (v: number, b: number) => (v / b - 1) * 100;
// A taxa de D remunera de D até o próximo dia útil: início inclusive e fim exclusive.
// Assim a taxa do dia, publicada só depois, não falta para acumular até hoje.
export function cdiFactor(
  rates: CdiRate[],
  start: string,
  end: string,
  ratePercent = 100,
) {
  return rates
    .filter((r) => r.date >= start && r.date < end)
    .reduce((f, r) => f * (1 + ((r.rate / 100) * ratePercent) / 100), 1);
}
export type Simulation = {
  points: ChartPoint[];
  warnings: string[];
  coverage: number;
  start: string | null;
  end: string | null;
  heldCount: number;
  excluded: string[];
  unavailable: BenchmarkKey[];
};
export function simulateComposition(
  p: Portfolio,
  m: Market,
  rates: CdiRate[],
  days: number,
  selected: BenchmarkKey[],
  now = Date.now(),
  scope: PerformanceScope = "all",
): Simulation {
  p = performancePortfolio(p, scope);
  const t = totals(p, m),
    warnings: string[] = [],
    excluded: string[] = [],
    unavailable: BenchmarkKey[] = [];
  const empty: Simulation = {
    points: [],
    warnings,
    coverage: 0,
    start: null,
    end: null,
    heldCount: 0,
    excluded,
    unavailable,
  };
  if (t.missing.length) {
    warnings.push(
      "Aguarde as cotações atuais para definir os pesos da simulação.",
    );
    return empty;
  }
  if (!(t.value > 0)) return empty;
  const hasHistory = (key: string) => (m.quotes[key]?.history.length ?? 0) >= 2,
    hasFX = hasHistory("USD"),
    hasCDI = rates.length >= 2;
  const usable = t.rows
    .filter((a) => a.quantity > 0 && a.value !== null)
    .filter((a) => {
      if (hasHistory(a.ticker) && (a.currency !== "USD" || hasFX)) return true;
      excluded.push(a.ticker);
      return false;
    });
  let modeledFixed = p.fixedIncome.filter(
    (r) =>
      r.index?.toUpperCase() === "CDI" && r.ratePercent !== undefined && hasCDI,
  );
  for (const r of p.fixedIncome)
    if (!modeledFixed.some((x) => x.id === r.id)) excluded.push(r.name);
  const series = new Map<string, Map<string, number>>();
  let start = brDate(new Date(now - days * 86400000)),
    end = brDate(new Date(now));
  const include = (key: string) => {
    const h = m.quotes[key]!.history;
    series.set(key, new Map(h.map((x) => [x.date, x.close])));
    start = start > h[0].date ? start : h[0].date;
    end = end < h.at(-1)!.date ? end : h.at(-1)!.date;
  };
  for (const key of new Set([
    ...usable.map((a) => a.ticker),
    ...(usable.some((a) => a.currency === "USD") ? ["USD"] : []),
  ]))
    include(key);
  if (
    modeledFixed.length &&
    (rates[0].date >= end || rates.at(-1)!.date <= start)
  ) {
    excluded.push(...modeledFixed.map((r) => r.name));
    modeledFixed = [];
  }
  let needCDI = modeledFixed.length > 0;
  if (needCDI) {
    start = start > rates[0].date ? start : rates[0].date;
    end = end < rates.at(-1)!.date ? end : rates.at(-1)!.date;
  }
  const available: BenchmarkKey[] = [];
  for (const key of selected) {
    if (key === "cdi") {
      if (!hasCDI || rates[0].date >= end || rates.at(-1)!.date <= start) {
        unavailable.push(key);
        continue;
      }
      available.push(key);
      needCDI = true;
      start = start > rates[0].date ? start : rates[0].date;
      end = end < rates.at(-1)!.date ? end : rates.at(-1)!.date;
      continue;
    }
    const ticker = key === "ibov" ? "IBOV" : key === "sp500" ? "SP500" : "BTC",
      fx = key !== "ibov";
    if (!hasHistory(ticker) || (fx && !hasFX)) {
      unavailable.push(key);
      continue;
    }
    const histories = [
      m.quotes[ticker]!.history,
      ...(fx ? [m.quotes.USD.history] : []),
    ];
    const commonStart = histories.reduce(
        (d, h) => (d > h[0].date ? d : h[0].date),
        start,
      ),
      commonEnd = histories.reduce(
        (d, h) => (d < h.at(-1)!.date ? d : h.at(-1)!.date),
        end,
      );
    if (commonStart >= commonEnd) {
      unavailable.push(key);
      continue;
    }
    include(ticker);
    if (fx && !series.has("USD")) include("USD");
    available.push(key);
  }
  if (unavailable.length)
    warnings.push(
      "Referências indisponíveis: " +
        unavailable
          .map(
            (k) =>
              ({
                ibov: "Ibovespa",
                sp500: "S&P 500",
                bitcoin: "Bitcoin",
                cdi: "CDI",
              })[k],
          )
          .join(", ") +
        ". As demais séries continuam disponíveis.",
    );
  if (start >= end) {
    warnings.push("Ainda não há histórico comum suficiente entre os ativos.");
    return empty;
  }
  const dates = Array.from(
    new Set([
      ...usable.flatMap((a) => a.quote!.history.map((x) => x.date)),
      ...(needCDI ? rates.map((r) => r.date) : []),
    ]),
  )
    .filter((d) => d >= start && d <= end)
    .sort();
  const carried = new Map<string, number>();
  for (const [key, map] of series)
    for (const [date, value] of map) if (date < start) carried.set(key, value);
  const rows: { date: string; levels: Map<string, number> }[] = [];
  for (const date of dates) {
    for (const [key, map] of series) {
      const value = map.get(date);
      if (value !== undefined) carried.set(key, value);
    }
    if ([...series.keys()].every((key) => carried.has(key)))
      rows.push({ date, levels: new Map(carried) });
  }
  if (rows.length < 2) {
    warnings.push("Histórico comum insuficiente.");
    return empty;
  }
  const initial = rows[0],
    last = rows.at(-1)!,
    covered =
      usable.reduce((s, a) => s + (a.value ?? 0), 0) +
      modeledFixed.reduce((s, r) => s + r.value, 0),
    base = initial.levels;
  if (!(covered > 0)) return empty;
  const brlLevel = (
    levels: Map<string, number>,
    ticker: string,
    currency: string,
  ) => levels.get(ticker)! * (currency === "USD" ? levels.get("USD")! : 1);
  const points = rows.map((row) => {
    let factor = usable.reduce(
      (s, a) =>
        s +
        (((a.value ?? 0) / covered) *
          brlLevel(row.levels, a.ticker, a.currency)) /
          brlLevel(base, a.ticker, a.currency),
      0,
    );
    for (const r of modeledFixed)
      factor +=
        (r.value / covered) *
        cdiFactor(rates, initial.date, row.date, r.ratePercent);
    const b: Partial<Record<BenchmarkKey, number>> = {};
    for (const k of available) {
      if (k === "cdi")
        b.cdi = (cdiFactor(rates, initial.date, row.date) - 1) * 100;
      else {
        const ticker = k === "ibov" ? "IBOV" : k === "sp500" ? "SP500" : "BTC",
          currency = k === "ibov" ? "BRL" : "USD";
        b[k] = pct(
          brlLevel(row.levels, ticker, currency),
          brlLevel(base, ticker, currency),
        );
      }
    }
    return {
      time: Date.parse(row.date + "T12:00:00Z"),
      date: row.date,
      portfolio: (factor - 1) * 100,
      ...b,
    };
  });
  if (excluded.length)
    warnings.push(
      "Fora da simulação por falta de histórico ou taxa: " +
        excluded.join(", ") +
        ".",
    );
  const requested = brDate(new Date(now - days * 86400000));
  if (initial.date > requested)
    warnings.push(
      "O período começa em " +
        initial.date.split("-").reverse().join("/") +
        " para respeitar o histórico disponível dos ativos incluídos.",
    );
  if (needCDI)
    warnings.push(
      "CDBs são simulados pelo percentual informado do CDI, com juros brutos e sem impostos. A comparação termina na última data comum com o CDI (" +
        last.date.split("-").reverse().join("/") +
        ").",
    );
  warnings.push(
    "Pesos atuais no início do período, sem novos aportes ou rebalanceamento. Preços ajustados pelo provedor quando disponíveis; os proventos acumulados do extrato não são somados novamente.",
  );
  return {
    points,
    warnings,
    coverage: (covered / t.value) * 100,
    start: initial.date,
    end: last.date,
    heldCount: usable.length,
    excluded,
    unavailable,
  };
}
