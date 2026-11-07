"use client";
import { useMemo, useState } from "react";
import { niceAxis } from "../lib/chart-axis";
import { fixed, money, num, percent } from "../lib/format";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Activity, Info, TrendingUp, Check, RefreshCw } from "lucide-react";
import {
  PERFORMANCE_SCOPES,
  performancePortfolio,
  simulateComposition,
  type PerformanceScope,
  type BenchmarkKey,
  type CdiRate,
} from "../lib/performance";
import type { Portfolio, Market } from "../lib/model";
import { costPerformance } from "../lib/cost-performance";
import { historyPerformance } from "../lib/history-performance";
import { CostReturnSummary, CostReturnMethod } from "./cost-return";
import { hasHolding, purchasesForPoints } from "../lib/trade-history";
import { purchaseLabelLayout } from "../lib/purchase-label-layout";
import {
  PurchaseDot,
  PurchaseTooltipHeader,
  PurchaseTable,
} from "./purchase-markers";

type Mode = "return" | "wealth" | "cost" | "simulation";
const MODES: { key: Mode; name: string; title: string }[] = [
  { key: "return", name: "Rentabilidade", title: "Rentabilidade da carteira" },
  {
    key: "wealth",
    name: "Patrimônio",
    title: "Patrimônio e dinheiro aportado",
  },
  {
    key: "cost",
    name: "Sobre o investido",
    title: "Resultado sobre o investido",
  },
  {
    key: "simulation",
    name: "Simular",
    title: "Simulação da composição atual",
  },
];
const PERIODS: [number | null, string][] = [
  [30, "1M"],
  [90, "3M"],
  [180, "6M"],
  [365, "1A"],
  [null, "Tudo"],
];
const pct = (v: number | undefined) => (v === undefined ? "—" : percent(v));
const date = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR");
type Props = {
  portfolio: Portfolio;
  market: Market;
  rates: CdiRate[];
  historyLoading: boolean;
  cdiError: string;
  hidden: boolean;
  cdiBusy: boolean;
  onRetryCdi: () => void;
};
export function PerformanceChart({
  portfolio,
  market,
  rates,
  historyLoading,
  cdiError,
  hidden,
  cdiBusy,
  onRetryCdi,
}: Props) {
  const [mode, setMode] = useState<Mode>("return"),
    [days, setDays] = useState<number | null>(null),
    [scope, setScope] = useState<PerformanceScope>("all"),
    [showPurchases, setShowPurchases] = useState(true),
    [selected, setSelected] = useState<BenchmarkKey[]>([
      "ibov",
      "sp500",
      "cdi",
    ]);
  const [chartSize, setChartSize] = useState({ width: 720, height: 288 });
  // "Tudo" nos modos que precisam de um número: maior que qualquer histórico carregado.
  const windowDays = days ?? 3650;
  const history = useMemo(
    () => historyPerformance(portfolio, market, rates, scope, days),
    [portfolio, market, rates, scope, days],
  );
  const simulation = useMemo(
    () =>
      simulateComposition(
        portfolio,
        market,
        rates,
        windowDays,
        selected,
        Date.now(),
        scope,
      ),
    [portfolio, market, rates, windowDays, selected, scope],
  );
  const accumulated = useMemo(
    () => costPerformance(portfolio, market, scope, windowDays),
    [portfolio, market, scope, windowDays],
  );
  const wealth = mode === "wealth",
    rawPoints =
      mode === "cost"
        ? accumulated.points
        : mode === "simulation"
          ? simulation.points
          : history.points;
  const points = useMemo(
      () =>
        purchasesForPoints(performancePortfolio(portfolio, scope), rawPoints),
      [portfolio, scope, rawPoints],
    ),
    last = points.at(-1),
    first = points[0],
    returnValue =
      mode === "cost"
        ? accumulated.returnPercent
        : mode === "simulation"
          ? last?.portfolio
          : history.returnPercent;
  const dataKey = wealth ? "value" : "portfolio";
  const labelLayout = useMemo(
    () =>
      purchaseLabelLayout(
        wealth
          ? points.map((p) => ({ ...p, portfolio: p.value ?? 0 }))
          : points,
        chartSize.width,
        chartSize.height,
      ),
    [points, chartSize, wealth],
  );
  const visiblePurchases = points.flatMap((point) => point.purchases);
  const curveCurrency = mode === "simulation" ? "BRL" : history.currency,
    references: { key: BenchmarkKey; name: string; color: string }[] = [
      ...(curveCurrency === "USD"
        ? []
        : [
            {
              key: "ibov" as const,
              name: "Ibovespa",
              color: "var(--chart-ibov)",
            },
          ]),
      {
        key: "sp500",
        name: curveCurrency === "USD" ? "S&P 500" : "S&P 500 em R$",
        color: "var(--chart-sp500)",
      },
      ...(curveCurrency === "USD"
        ? []
        : [{ key: "cdi" as const, name: "CDI", color: "var(--chart-cdi)" }]),
      {
        key: "bitcoin",
        name: curveCurrency === "USD" ? "Bitcoin" : "Bitcoin em R$",
        color: "var(--chart-bitcoin)",
      },
    ];
  const shownReferences =
    mode === "return" || mode === "simulation" ? references : [];
  const partial =
    mode === "simulation" &&
    simulation.coverage > 0 &&
    simulation.coverage < 99.99;
  const unavailable =
    mode === "simulation" ? simulation.unavailable : history.unavailable;
  const axis = useMemo(
    () =>
      niceAxis(
        points.flatMap((point) => [
          wealth ? (point.value ?? 0) : point.portfolio,
          ...(wealth && "invested" in point ? [point.invested as number] : []),
          ...(mode === "return" || mode === "simulation"
            ? selected.flatMap((key) =>
                point[key] === undefined ? [] : [point[key]!],
              )
            : []),
        ]),
      ),
    [points, mode, selected, wealth],
  );
  const toggle = (key: BenchmarkKey) =>
    setSelected((old) =>
      old.includes(key) ? old.filter((k) => k !== key) : [...old, key],
    );
  const scopeInfo = PERFORMANCE_SCOPES.find((s) => s.key === scope)!;
  const scoped = performancePortfolio(portfolio, scope),
    hasPositions =
      scoped.transactions.length > 0 ||
      scoped.fixedIncome.length > 0 ||
      (scoped.tradeHistory?.length ?? 0) > 0;
  const seriesName =
    mode === "cost" && accumulated.manualFixedCount > 0
      ? "Ativos com cotação"
      : wealth
        ? "Patrimônio"
        : scope === "all"
          ? mode === "simulation"
            ? "Carteira simulada"
            : "Minha carteira"
          : scopeInfo.name;
  const labels: Record<string, string> = {
    portfolio: seriesName,
    value: "Patrimônio",
    invested: "Dinheiro aportado",
    ...Object.fromEntries(references.map((r) => [r.key, r.name])),
  };
  const estimated = mode === "cost" && accumulated.estimatedFX;
  const result = (v: number | undefined) =>
    hidden ? "••••••" : `${estimated && v !== undefined ? "≈ " : ""}${pct(v)}`;
  const cash = (v: number | undefined) =>
    hidden || v === undefined ? "••••••" : money(v, history.currency);
  const currencyName =
    (mode === "cost" ? accumulated.currency : curveCurrency) === "USD"
      ? "dólares"
      : "reais";
  const undatedNote =
    (mode === "return" || wealth) && history.undated.length > 0;
  const gain =
    history.value !== undefined && history.invested !== undefined
      ? history.value - history.invested
      : undefined;
  return (
    <section
      className="panel performance-panel"
      aria-label="Evolução e rentabilidade da carteira"
    >
      <div className="panel-title">
        <div>
          <span className="eyebrow">SUA CARTEIRA EM PERSPECTIVA</span>
          <h2>{MODES.find((m) => m.key === mode)!.title}</h2>
        </div>
        <TrendingUp size={21} />
      </div>
      <div className="performance-toolbar">
        <div
          className="performance-modes"
          role="group"
          aria-label="Tipo de gráfico"
        >
          {MODES.map((m) => (
            <button
              key={m.key}
              aria-pressed={mode === m.key}
              className={mode === m.key ? "active" : ""}
              onClick={() => setMode(m.key)}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div
          className="period-tabs"
          role="group"
          aria-label="Período do gráfico"
        >
          {PERIODS.map(([value, label]) => (
            <button
              key={label}
              aria-label={label}
              aria-pressed={days === value}
              className={days === value ? "active" : ""}
              onClick={() => setDays(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="performance-filters">
        <span id="performance-filter-label">Filtrar por classe</span>
        <div role="group" aria-labelledby="performance-filter-label">
          {PERFORMANCE_SCOPES.map((s) => (
            <button
              key={s.key}
              aria-pressed={scope === s.key}
              className={scope === s.key ? "chip active" : "chip"}
              onClick={() => setScope(s.key)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {mode === "simulation" && (
        <div className="performance-context simulated">
          <b>
            SIMULAÇÃO · {partial ? "COBERTURA PARCIAL" : "COMPOSIÇÃO ATUAL"}
          </b>
          <span>
            Não é o seu rendimento: aplica os pesos de hoje ao passado, como
            comparação.
          </span>
        </div>
      )}
      {mode === "simulation" && simulation.coverage > 0 && (
        <div
          className={"coverage-note " + (partial ? "partial" : "")}
          role="status"
        >
          <b>
            {fixed(simulation.coverage)}%{" "}
            {scope === "all" ? "do patrimônio" : "do grupo selecionado"}{" "}
            incluído
          </b>
          {partial && (
            <span>
              {hidden
                ? `${simulation.excluded.length} posições fora desta estimativa.`
                : "Fora da simulação: " + simulation.excluded.join(", ") + "."}
            </span>
          )}
        </div>
      )}
      <div className="performance-result">
        <div>
          <span className="performance-scope">
            {wealth
              ? "Patrimônio"
              : mode === "cost"
                ? "Resultado sobre o investido"
                : mode === "simulation"
                  ? partial
                    ? "Retorno simulado da parcela incluída"
                    : "Retorno simulado no período"
                  : "Rentabilidade no período"}{" "}
            · {scopeInfo.name}
          </span>
          <strong
            className={
              !hidden && !wealth && returnValue !== undefined && returnValue < 0
                ? "negative"
                : ""
            }
          >
            {wealth ? cash(history.value) : result(returnValue)}
          </strong>
          <p>
            {wealth
              ? `Aportado ${cash(history.invested)} · ${
                  hidden || gain === undefined
                    ? "••••••"
                    : `${gain >= 0 ? "+" : "−"}${money(Math.abs(gain), history.currency)}`
                } sem contar proventos`
              : mode === "cost"
                ? `Desde o custo das posições · em ${currencyName}`
                : first && last
                  ? `${date(first.date)} a ${date(last.date)} · em ${currencyName}`
                  : historyLoading
                    ? "Carregando o histórico…"
                    : "Aguardando histórico dos ativos"}
          </p>
        </div>
        <span className="performance-base">
          {mode === "cost" ? "Custo" : wealth ? currencyName : "Base 0%"}
          <small>
            {mode === "cost"
              ? "base do resultado"
              : wealth
                ? "com aportes"
                : "na mesma data inicial"}
          </small>
        </span>
      </div>
      <div
        className="performance-legend"
        role="group"
        aria-label={
          shownReferences.length ? "Índices para comparação" : "Séries"
        }
      >
        <span>
          <i style={{ background: "var(--chart-line)" }} />
          {seriesName}
        </span>
        {wealth && (
          <span>
            <i style={{ background: "var(--chart-invested)" }} />
            Dinheiro aportado
          </span>
        )}
        {shownReferences.map((r) => (
          <button
            key={r.key}
            aria-pressed={selected.includes(r.key)}
            onClick={() => toggle(r.key)}
            className={selected.includes(r.key) ? "selected" : ""}
          >
            <i
              style={{
                borderColor: r.color,
                background: selected.includes(r.key) ? r.color : "transparent",
              }}
            >
              {selected.includes(r.key) && <Check size={10} />}
            </i>
            {r.name}
            {selected.includes(r.key) && unavailable.includes(r.key) && (
              <small>sem dados</small>
            )}
          </button>
        ))}
      </div>
      {shownReferences.length > 0 && cdiError && (
        <div className="source-recovery" role="status">
          <span>
            <b>CDI temporariamente indisponível.</b> As séries disponíveis
            continuam no gráfico
            {partial ? " com a cobertura indicada acima" : ""}.
          </span>
          <button
            className="button outline"
            disabled={cdiBusy}
            onClick={onRetryCdi}
          >
            <RefreshCw size={15} />
            {cdiBusy ? "Consultando…" : "Tentar CDI novamente"}
          </button>
        </div>
      )}
      <div className="performance-chart">
        {points.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            onResize={(width, height) =>
              setChartSize((old) =>
                old.width === width && old.height === height
                  ? old
                  : { width, height },
              )
            }
          >
            <ComposedChart
              accessibilityLayer
              data={points}
              margin={{ top: 15, right: 15, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-line)"
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-line)"
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--chart-grid)"
                strokeDasharray="3 5"
              />
              {!wealth && (
                <ReferenceLine
                  y={0}
                  stroke="var(--chart-axis)"
                  strokeDasharray="4 4"
                />
              )}
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                minTickGap={55}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: "0.75rem", fill: "var(--text-secondary)" }}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })
                }
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={wealth ? 72 : 60}
                tick={{ fontSize: "0.75rem", fill: "var(--text-secondary)" }}
                tickFormatter={(v) =>
                  wealth
                    ? hidden
                      ? "•••"
                      : Number(v).toLocaleString("pt-BR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        })
                    : `${num(Number(v), 2)}%`
                }
                domain={axis.domain}
                ticks={axis.ticks}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--line-strong)",
                  background: "var(--surface)",
                  fontSize: "0.875rem",
                  color: "var(--ink)",
                  boxShadow: "0 12px 32px var(--shadow-soft)",
                }}
                labelFormatter={(v, items) => (
                  <PurchaseTooltipHeader
                    label={new Date(Number(v)).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                    purchases={
                      showPurchases
                        ? (items?.[0]?.payload?.purchases ?? [])
                        : []
                    }
                    hidden={hidden}
                  />
                )}
                formatter={(v: any, n: any) => [
                  n === "value" || n === "invested"
                    ? cash(Number(v))
                    : n === "portfolio"
                      ? result(Number(v))
                      : pct(Number(v)),
                  labels[String(n)] ?? n,
                ]}
              />
              <Area
                dataKey={dataKey}
                type="monotone"
                stroke="var(--chart-line)"
                fill="url(#portfolioFill)"
                strokeWidth={2.4}
                dot={
                  showPurchases
                    ? (props: any) => (
                        <PurchaseDot
                          key={props.index}
                          {...props}
                          labelPlacement={labelLayout[props.index]}
                          hidden={hidden}
                          fallback={points.length < 3}
                        />
                      )
                    : points.length < 3
                      ? { r: 4 }
                      : false
                }
                isAnimationActive={false}
              />
              {wealth && (
                <Line
                  dataKey="invested"
                  type="stepAfter"
                  stroke="var(--chart-invested)"
                  strokeWidth={1.8}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {shownReferences
                .filter(
                  (r) =>
                    selected.includes(r.key) && !unavailable.includes(r.key),
                )
                .map((r) => (
                  <Line
                    key={r.key}
                    dataKey={r.key}
                    type="monotone"
                    stroke={r.color}
                    strokeWidth={1.5}
                    dot={points.length < 3 ? { r: 3 } : false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="performance-empty">
            <Activity size={25} />
            <b>
              {historyLoading
                ? "Carregando o histórico de preços…"
                : !hasPositions
                  ? "Nenhuma posição neste grupo"
                  : mode === "cost" && !hasHolding(scoped)
                    ? "Renda fixa usa saldos manuais"
                    : "Aguardando dados para montar a curva"}
            </b>
            <p>
              {mode === "simulation"
                ? (simulation.warnings[0] ??
                  "Cadastre suas posições e aguarde as cotações.")
                : hasPositions
                  ? "A curva é montada com as suas operações e os preços de cada dia."
                  : "Cadastre posições neste grupo ou escolha outro filtro."}
            </p>
          </div>
        )}
      </div>
      {undatedNote && (
        <div className="performance-record-note">
          <Info size={16} />
          <span>
            {hidden
              ? "Parte das posições não tem datas de compra."
              : `${history.undated.join(", ")} sem datas de compra: entra na curva na data de referência, pelo valor de mercado. Com o histórico de compras, a curva passa a incluir o período anterior.`}
          </span>
        </div>
      )}
      {mode === "cost" && (
        <CostReturnSummary data={accumulated} hidden={hidden} />
      )}
      {visiblePurchases.length > 0 && (
        <div className="purchase-controls">
          <button
            type="button"
            role="switch"
            aria-checked={showPurchases}
            onClick={() => setShowPurchases((value) => !value)}
            className={
              showPurchases ? "purchase-switch active" : "purchase-switch"
            }
          >
            <span aria-hidden="true" className="switch-track">
              <i />
            </span>
            Pontos de compra <b>{showPurchases ? "Ativados" : "Desativados"}</b>
          </button>
          <span>
            {visiblePurchases.length} compras nesta janela. Ciclos encerrados
            ficam fora.
          </span>
        </div>
      )}
      {showPurchases && (
        <PurchaseTable purchases={visiblePurchases} hidden={hidden} />
      )}
      <div className="performance-comparison">
        {shownReferences
          .filter((r) => selected.includes(r.key))
          .map((r) => {
            const v = last?.[r.key],
              difference =
                v !== undefined && returnValue !== undefined
                  ? returnValue - v
                  : undefined;
            return (
              <div key={r.key}>
                <span>
                  <i style={{ background: r.color }} />
                  {r.name}
                </span>
                <b>{pct(v)}</b>
                <small>
                  {difference === undefined
                    ? "Sem dado comum no período"
                    : hidden
                      ? "Comparação pessoal oculta"
                      : `${scopeInfo.name}: ${percent(difference).replace("%", "")} p.p.`}
                </small>
              </div>
            );
          })}
      </div>
      {mode === "cost" ? (
        <CostReturnMethod data={accumulated} hidden={hidden}>
          <p>
            {scopeInfo.description} Todos os retornos deste gráfico são em{" "}
            {currencyName}.
          </p>
        </CostReturnMethod>
      ) : (
        <details className="performance-method">
          <summary>
            <Info size={16} />
            Como este gráfico é calculado
          </summary>
          <div>
            <p>
              {scopeInfo.description} Todos os retornos deste gráfico são em{" "}
              {currencyName}.
            </p>
            {mode === "simulation" ? (
              <>
                <p>
                  A estimativa usa os pesos atuais como alocação inicial, mantém
                  as posições e compara a variação no período disponível. Não
                  usa as suas datas de compra.
                </p>
                {hidden
                  ? null
                  : simulation.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </>
            ) : (
              <>
                <p>
                  A curva refaz a carteira dia a dia com as suas compras, vendas
                  e proventos e o preço de fechamento de cada dia. O retorno de
                  cada dia é (saldo final + vendas + proventos) ÷ (saldo
                  anterior + compras) − 1, e os dias são encadeados. Assim, um
                  aporte novo não conta como ganho, como na cota de um fundo, e
                  a comparação com os índices é justa qualquer que seja o
                  tamanho de cada aporte.
                </p>
                <p>
                  Por isso este número é diferente do resultado sobre o
                  investido: aqui cada dia pesa igual; lá, cada real investido
                  pesa igual. Quem aportou mais depois de uma alta vê as duas
                  medidas se afastarem.
                </p>
                <p>
                  Posições em dólar usam o dólar oficial (PTAX) de cada dia,
                  menos quando o registro traz o câmbio da remessa. Títulos
                  manuais entram na data do saldo informado e, depois dela, são
                  estimados pelo índice contratado, sem impostos.
                </p>
                {!hidden && history.estimatedFixed.length > 0 && (
                  <p>
                    Estimados pelo índice desde o último saldo:{" "}
                    {history.estimatedFixed.join(", ")}.
                  </p>
                )}
                {!hidden && history.excluded.length > 0 && (
                  <p>
                    Sem cotação histórica, fora da curva:{" "}
                    {history.excluded.join(", ")}.
                  </p>
                )}
              </>
            )}
            <p>
              Todas as séries começam em 0% na mesma data. Ibovespa é um índice
              de retorno total; S&P 500 (^GSPC) é de preços, sem reinvestimento
              de dividendos. O CDI usa as taxas diárias já publicadas pelo Banco
              Central.
            </p>
            <p>
              Dados de mercado: Yahoo Finance. Câmbio e CDI:{" "}
              <a
                href="https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios"
                target="_blank"
                rel="noreferrer"
              >
                PTAX ↗
              </a>{" "}
              e{" "}
              <a
                href="https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json"
                target="_blank"
                rel="noreferrer"
              >
                série 12 ↗
              </a>{" "}
              do Banco Central.{" "}
              <a
                href="https://b3.com.br/pt_br/market-data-e-indices/indices/indices-amplos/ibovespa-b3.htm"
                target="_blank"
                rel="noreferrer"
              >
                Metodologia do Ibovespa ↗
              </a>
              .
            </p>
          </div>
        </details>
      )}
      {points.length > 0 && (
        <details className="performance-method">
          <summary>Consultar dados do gráfico em tabela</summary>
          <div
            className="table-wrap chart-data-table"
            tabIndex={0}
            role="region"
            aria-label="Dados de rentabilidade por data"
          >
            <table>
              <caption>
                {MODES.find((m) => m.key === mode)!.title} · {scopeInfo.name} ·
                em {currencyName}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  {wealth ? (
                    <>
                      <th scope="col">Patrimônio</th>
                      <th scope="col">Dinheiro aportado</th>
                    </>
                  ) : (
                    <th scope="col">{labels.portfolio}</th>
                  )}
                  {shownReferences
                    .filter((r) => selected.includes(r.key))
                    .map((r) => (
                      <th scope="col" key={r.key}>
                        {r.name}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.time}>
                    <th scope="row">{date(p.date)}</th>
                    {wealth ? (
                      <>
                        <td>{cash(p.value)}</td>
                        <td>
                          {cash(
                            "invested" in p
                              ? (p.invested as number)
                              : undefined,
                          )}
                        </td>
                      </>
                    ) : (
                      <td>{result(p.portfolio)}</td>
                    )}
                    {shownReferences
                      .filter((r) => selected.includes(r.key))
                      .map((r) => (
                        <td key={r.key}>{pct(p[r.key])}</td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
