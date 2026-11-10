export const BASE_STOCK_WEIGHTS: Record<string, number> = {
  ALUP11: 10.4,
  WEGE3: 10.4,
  ITUB4: 9.7,
  KLBN4: 9.7,
  EGIE3: 9.7,
  BPAC11: 8.2,
  BBSE3: 6.7,
  PSSA3: 6.7,
  TUPY3: 6.7,
  LEVE3: 6.7,
  FESA4: 5.2,
  VALE3: 5.2,
  PRIO3: 4.5,
};
export type EarningsScenario = {
  growth: number;
  discountRate: number;
  terminalPE: number;
  payout: number;
  years: number;
};
export const DEFAULT_SCENARIO: EarningsScenario = {
  growth: 5,
  discountRate: 15,
  terminalPE: 12,
  payout: 40,
  years: 5,
};
export type EvaluationOverride = {
  referencePrice: number | null;
  thesis: "unreviewed" | "intact" | "review" | "broken";
  note: string;
  updatedAt: string;
  method?: "auto" | "peers" | "scenario" | "manual";
  scenario?: EarningsScenario;
};
export type EvaluationSettings = {
  baseWeights: Record<string, number>;
  margin: number;
  maxIssuerWeight: number;
  maxSectorWeight: number;
  overrides: Record<string, EvaluationOverride>;
  scenario?: EarningsScenario;
};
export const DEFAULT_EVALUATION: EvaluationSettings = {
  baseWeights: BASE_STOCK_WEIGHTS,
  margin: 20,
  maxIssuerWeight: 15,
  maxSectorWeight: 35,
  overrides: {},
  scenario: DEFAULT_SCENARIO,
};
export type Fundamentals = {
  ticker: string;
  company: string;
  sector: string;
  segmentId: string;
  sourcePrice: number | null;
  quoteDate: string | null;
  balanceDate: string | null;
  pe: number | null;
  pb: number | null;
  eps: number | null;
  bvps: number | null;
  roe: number | null;
  roic: number | null;
  netDebtEbit: number | null;
  netDebtEquity: number | null;
  growth: number | null;
  liquidity: number | null;
  financial: boolean;
  sourceUrl: string;
};
export type PeerReference = {
  tickers: string[];
  medianPE: number;
  lowPE: number;
  highPE: number;
  medianROE: number | null;
  oldestQuote: string;
  oldestBalance: string;
  sourceUrls: string[];
};
export type FundamentalData = {
  items: Record<string, Fundamentals>;
  peers: Record<string, PeerReference>;
  fetchedAt: string;
  errors: string[];
  stale?: boolean;
};
