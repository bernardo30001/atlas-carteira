"use client";
import { useMemo, useState } from "react";
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
  recordedChart,
  simulateComposition,
  type PerformanceScope,
  type BenchmarkKey,
  type PerformanceData,
  type CdiRate,
} from "../lib/performance";
import type { Portfolio, Market } from "../lib/model";
import { costPerformance } from "../lib/cost-performance";
import { CostReturnSummary, CostReturnMethod } from "./cost-return";
import { hasHolding, purchasesForPoints } from "../lib/trade-history";
import {
  PurchaseDot,
  PurchaseTooltipHeader,
  PurchaseTable,
} from "./purchase-markers";
const references: { key: BenchmarkKey; name: string; color: string }[] = [
  { key: "ibov", name: "Ibovespa", color: "#3d7180" },
  { key: "sp500", name: "S&P 500 em R$", color: "#78609d" },
  { key: "cdi", name: "CDI", color: "#887229" },
  { key: "bitcoin", name: "Bitcoin em R$", color: "#9d6219" },
];
const number = (v: number) =>
  v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const pct = (v: number | undefined) =>
  v === undefined ? "—" : `${v >= 0 ? "+" : ""}${number(v)}%`;
const date = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR");
type Props = {
  portfolio: Portfolio;
  market: Market;
  data?: PerformanceData;
  rates: CdiRate[];
  busy: boolean;
  cdiError: string;
  demo: boolean;
  hidden: boolean;
  cdiBusy: boolean;
  onRetryCdi: () => void;
  onRetryHistory: () => void;
};
export function PerformanceChart({
  portfolio,
  market,
  data,
  rates,
  busy,
  cdiError,
  demo,
  hidden,
  cdiBusy,
  onRetryCdi,
  onRetryHistory,
}: Props) {
  const [mode, setMode] = useState<"cost" | "simulation" | "recorded">("cost"),
    [days, setDays] = useState(365),
    [scope, setScope] = useState<PerformanceScope>("all"),
    [showPurchases, setShowPurchases] = useState(true),
    [selected, setSelected] = useState<BenchmarkKey[]>([
      "ibov",
      "sp500",
      "cdi",
    ]);
  const simulation = useMemo(
    () =>
      simulateComposition(
        portfolio,
        market,
        rates,
        days,
        selected,
        Date.now(),
        scope,
      ),
    [portfolio, market, rates, days, selected, scope],
  );
  const actual = useMemo(
    () => recordedChart(data, days, rates, Date.now(), scope),
    [data, days, rates, scope],
  );
  const accumulated = useMemo(
    () => costPerformance(portfolio, market, scope, days),
    [portfolio, market, scope, days],
  );
  const rawPoints =
    mode === "cost"
      ? accumulated.points
      : mode === "simulation"
        ? simulation.points
        : demo
          ? []
          : actual;
  const points = useMemo(
      () =>
        purchasesForPoints(performancePortfolio(portfolio, scope), rawPoints),
      [portfolio, scope, rawPoints],
    ),
    last = points.at(-1),
    first = points[0],
    returnValue = mode === "cost" ? accumulated.returnPercent : last?.portfolio;
  const visiblePurchases = points.flatMap((point) => point.purchases);
  const shownReferences = mode === "cost" ? [] : references;
  const warnings =
      mode === "simulation" ? simulation.warnings : (data?.warnings ?? []),
    partial =
      mode === "simulation" &&
      simulation.coverage > 0 &&
      simulation.coverage < 99.99;
  const unavailable =
    mode === "simulation"
      ? simulation.unavailable
      : references
          .filter(
            (r) =>
              selected.includes(r.key) &&
              points.length > 0 &&
              last?.[r.key] === undefined,
          )
          .map((r) => r.key);
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
    scope === "all"
      ? mode === "simulation"
        ? "Carteira simulada"
        : "Minha carteira"
      : scopeInfo.name;
  const labels: Record<string, string> = {
    portfolio: seriesName,
    ...Object.fromEntries(references.map((r) => [r.key, r.name])),
  };
  const result = (v: number | undefined) =>
    hidden
      ? "••••••"
      : `${mode === "cost" && accumulated.estimatedFX && v !== undefined ? "≈ " : ""}${pct(v)}`;
  const currencyName =
    mode === "cost" && accumulated.currency === "USD" ? "dólares" : "reais";
  const startedAt =
    scope === "all"
      ? data?.startedAt
      : data?.points.find((p) => p.segments?.[scope])?.segments?.[scope]
          ?.startedAt;
  const started = startedAt
    ? new Date(startedAt).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : undefined;
  return (
    <section
      className="panel performance-panel"
      aria-label="Evolução e rentabilidade da carteira"
    >
      <div className="panel-title">
        <div>
          <span className="eyebrow">SUA CARTEIRA EM PERSPECTIVA</span>
          <h2>
            {mode === "cost"
              ? "Rendimento desde o preço médio"
              : mode === "simulation"
                ? "Simulação da composição atual"
                : "Acompanhamento real da carteira"}
          </h2>
          <p>
            {mode === "cost"
              ? "Inclui o resultado acumulado antes do cadastro no Atlas."
              : mode === "simulation"
                ? "Estimativa histórica com os pesos de hoje."
                : "Valorização e desvalorização do patrimônio registrado."}
          </p>
        </div>
        <TrendingUp size={21} />
      </div>
      <div className="performance-toolbar">
        <div
          className="performance-modes"
          role="group"
          aria-label="Tipo de acompanhamento"
        >
          <button
            aria-pressed={mode === "cost"}
            className={mode === "cost" ? "active" : ""}
            onClick={() => setMode("cost")}
          >
            Desde o preço médio
          </button>
          <button
            aria-pressed={mode === "recorded"}
            className={mode === "recorded" ? "active" : ""}
            onClick={() => setMode("recorded")}
          >
            Acompanhamento real
          </button>
          <button
            aria-pressed={mode === "simulation"}
            className={mode === "simulation" ? "active" : ""}
            onClick={() => setMode("simulation")}
          >
            Simular histórico
          </button>
        </div>
        <div
          className="period-tabs"
          role="group"
          aria-label="Período do gráfico"
        >
          {[
            [30, "1M"],
            [90, "3M"],
            [180, "6M"],
            [365, "1A"],
          ].map(([v, l]) => (
            <button
              key={v}
              aria-label={String(l)}
              aria-pressed={days === v}
              className={days === v ? "active" : ""}
              onClick={() => setDays(Number(v))}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="performance-filters">
        <span id="performance-filter-label">Filtrar rendimento</span>
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
        <p role="status">
          {mode === "cost" && scope === "us"
            ? "Ativos negociados em dólar, com custo, saldo e proventos em US$."
            : scopeInfo.description}{" "}
          Todos os retornos deste gráfico são em {currencyName}.
        </p>
      </div>
      <div
        className={
          "performance-context " +
          (mode === "simulation" ? "simulated" : "observed")
        }
      >
        <b>
          {mode === "cost"
            ? "ACUMULADO DESDE O PREÇO MÉDIO"
            : mode === "simulation"
              ? "SIMULAÇÃO · " +
                (partial ? "COBERTURA PARCIAL" : "COMPOSIÇÃO ATUAL")
              : started
                ? "HISTÓRICO REAL DESDE " + started
                : "ACOMPANHAMENTO REAL"}
        </b>
        <span>
          {mode === "cost"
            ? "Saldo atual − valor investido + proventos. Inclui ganhos e perdas anteriores ao cadastro."
            : mode === "simulation"
              ? "Não representa o rendimento que você obteve nas compras anteriores."
              : "Novos aportes são separados da valorização entre observações."}
        </span>
      </div>
      {mode === "simulation" && simulation.coverage > 0 && (
        <div
          className={"coverage-note " + (partial ? "partial" : "")}
          role="status"
        >
          <b>
            {number(simulation.coverage)}%{" "}
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
            {mode === "cost"
              ? "Rendimento acumulado"
              : mode === "simulation"
                ? partial
                  ? "Retorno simulado da parcela incluída"
                  : "Retorno simulado no período"
                : "Retorno real no período"}{" "}
            · {scopeInfo.name}
          </span>
          <strong
            className={
              !hidden && returnValue !== undefined && returnValue < 0
                ? "negative"
                : ""
            }
          >
            {result(returnValue)}
          </strong>
          <p>
            {mode === "cost"
              ? `Desde o custo das posições cadastradas · em ${currencyName}`
              : first && last
                ? `${date(first.date)} — ${date(last.date)}`
                : mode === "simulation"
                  ? "Aguardando histórico dos ativos"
                  : "Aguardando a primeira observação confirmada"}
          </p>
        </div>
        <span className="performance-base">
          {mode === "cost" ? "Preço médio" : "Base 0%"}
          <small>
            {mode === "cost" ? "base do acumulado" : "na mesma data inicial"}
          </small>
        </span>
      </div>
      {mode === "cost" && (
        <>
          <CostReturnSummary data={accumulated} hidden={hidden} />
          <div className="cost-chart-note">
            <b>Curva retroativa pelo preço médio</b>
            <p>
              {accumulated.datedPositionCount
                ? `${accumulated.datedPositionCount} posições com compras e vendas datadas. Demais posições pelo preço médio`
                : "Estimativa das posições com cotações históricas"}
              {first && last
                ? ` · ${date(first.date)} — ${date(last.date)}`
                : ""}
              .{" "}
              {scope === "all" && portfolio.fixedIncome.length > 0
                ? "Renda fixa manual aparece apenas no acumulado acima. "
                : ""}
              O período muda a janela da curva; o acumulado continua desde o
              preço médio.
            </p>
          </div>
        </>
      )}
      <div
        className="performance-legend"
        role="group"
        aria-label={
          mode === "cost" ? "Série da carteira" : "Índices para comparação"
        }
      >
        <span>
          <i style={{ background: "#26775d" }} />
          {seriesName}
        </span>
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
      {mode !== "cost" && cdiError && (
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
      {mode === "simulation" &&
        simulation.unavailable.some((k) => k !== "cdi") && (
          <p className="data-status">
            Sem histórico comum para{" "}
            {references
              .filter(
                (r) =>
                  simulation.unavailable.includes(r.key) && r.key !== "cdi",
              )
              .map((r) => r.name)
              .join(", ")}
            . As demais referências foram preservadas.
          </p>
        )}
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
          {visiblePurchases.length} compras com data conhecida nesta janela.
          Posições e ciclos encerrados ficam fora.
        </span>
      </div>
      <div className="performance-chart">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              accessibilityLayer
              data={points}
              margin={{ top: 15, right: 15, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#26775d" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#26775d" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#dce5d5"
                strokeDasharray="3 5"
              />
              <ReferenceLine y={0} stroke="#75866b" strokeDasharray="4 4" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                minTickGap={55}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: "0.75rem", fill: "#53654b" }}
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
                width={60}
                tick={{ fontSize: "0.75rem", fill: "#53654b" }}
                tickFormatter={(v) =>
                  `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                }
                domain={[
                  (v: number) => Math.min(v, -1),
                  (v: number) => Math.max(v, 1),
                ]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 9,
                  border: "1px solid #75866b",
                  fontSize: "0.875rem",
                  color: "#253831",
                  boxShadow: "0 8px 24px #293d3210",
                }}
                labelFormatter={(v, items) => (
                  <PurchaseTooltipHeader
                    label={new Date(Number(v)).toLocaleString(
                      "pt-BR",
                      mode === "recorded"
                        ? {
                            timeZone: "America/Sao_Paulo",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        : { day: "2-digit", month: "2-digit", year: "numeric" },
                    )}
                    purchases={
                      showPurchases
                        ? (items?.[0]?.payload?.purchases ?? [])
                        : []
                    }
                    hidden={hidden}
                  />
                )}
                formatter={(v: any, n: any) => [
                  n === "portfolio" ? result(Number(v)) : pct(Number(v)),
                  labels[String(n)] ?? n,
                ]}
              />
              <Area
                dataKey="portfolio"
                type="linear"
                stroke="#26775d"
                fill="url(#portfolioFill)"
                strokeWidth={2.6}
                dot={
                  showPurchases
                    ? (props: any) => (
                        <PurchaseDot
                          key={props.index}
                          {...props}
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
              {shownReferences
                .filter(
                  (r) =>
                    selected.includes(r.key) && !unavailable.includes(r.key),
                )
                .map((r) => (
                  <Line
                    key={r.key}
                    dataKey={r.key}
                    type="linear"
                    stroke={r.color}
                    strokeWidth={1.7}
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
              {mode === "cost"
                ? !hasPositions
                  ? "Nenhuma posição neste grupo"
                  : !hasHolding(scoped)
                    ? "Renda fixa usa saldos manuais"
                    : "Aguardando cotações para reconstruir a curva"
                : mode === "recorded"
                  ? demo
                    ? "O exemplo não registra histórico real"
                    : busy
                      ? "Registrando a primeira observação…"
                      : !hasPositions
                        ? "Nenhuma posição neste grupo"
                        : "O histórico deste grupo começa nas próximas observações"
                  : "Aguardando dados para comparar"}
            </b>
            <p>
              {mode === "cost"
                ? "O resultado acumulado acima usa os custos registrados e não depende do início das observações."
                : mode === "recorded"
                  ? !hasPositions
                    ? "Cadastre posições neste grupo ou escolha outro filtro."
                    : "A curva cresce a cada consulta com a aba aberta. O histórico anterior ao registro separado por grupo permanece disponível em Tudo agregado."
                  : (simulation.warnings[0] ??
                    "Cadastre suas posições e aguarde as cotações.")}
            </p>
          </div>
        )}
      </div>
      {showPurchases && (
        <PurchaseTable purchases={visiblePurchases} hidden={hidden} />
      )}
      {mode === "recorded" && points.length > 0 && (
        <div className="performance-record-note">
          <Info size={16} />
          <span>
            {points.length < 3
              ? "Ainda há poucas observações. O histórico será formado daqui para a frente."
              : "Aportes e correções são descontados do retorno ao preço da observação."}
            {last?.value !== undefined && !hidden
              ? ` Saldo observado: ${last.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
              : ""}
          </span>
        </div>
      )}
      <div className="performance-comparison">
        {shownReferences
          .filter((r) => selected.includes(r.key))
          .map((r) => {
            const v = last?.[r.key],
              gap =
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
                  {gap === undefined
                    ? "Sem dado comum no período"
                    : hidden
                      ? "Comparação pessoal oculta"
                      : `${scopeInfo.name}: ${gap >= 0 ? "+" : ""}${number(gap)} p.p.`}
                </small>
              </div>
            );
          })}
      </div>
      {mode === "recorded" && data?.error && (
        <div className="source-recovery" role="status">
          <span>{data.error}</span>
          <button
            className="button outline"
            onClick={onRetryHistory}
            disabled={busy}
          >
            {busy ? "Consultando…" : "Atualizar histórico"}
          </button>
        </div>
      )}
      {mode === "cost" ? (
        <CostReturnMethod data={accumulated} hidden={hidden} />
      ) : (
        <details className="performance-method">
          <summary>
            <Info size={16} />
            Como este gráfico é calculado
          </summary>
          <div>
            <p>
              {mode === "simulation"
                ? "A estimativa usa os pesos atuais como alocação inicial, mantém as posições e compara a variação no período disponível. Faltam as datas reais das compras para reconstruir seu passado."
                : "O retorno encadeia a variação das posições entre consultas e os novos proventos registrados como pagamento. Mudanças de quantidade e capital são neutralizadas pelos preços da observação; podem diferir da rentabilidade apurada pela corretora nos horários reais das operações."}
            </p>
            {hidden && warnings.length ? (
              <p>Detalhes das posições ficam ocultos no modo de privacidade.</p>
            ) : (
              warnings.map((w, i) => <p key={i}>{w}</p>)
            )}
            <p>
              O filtro recalcula o retorno apenas com as posições e proventos do
              grupo escolhido. Tudo agregado inclui também renda fixa e ETFs na
              B3. Cada grupo tem seu próprio início de acompanhamento;
              observações antigas apenas do consolidado não são usadas para
              presumir retornos separados.
            </p>
            <p>
              Todos começam em 0% na mesma data. S&P 500 e Bitcoin incluem a
              variação histórica do dólar frente ao real. Ibovespa é um índice
              de retorno total; S&P 500 (^GSPC) é de preços, sem reinvestimento
              de dividendos. O CDI usa as taxas diárias já publicadas pelo Banco
              Central, que divulga a taxa do dia depois do fechamento.
            </p>
            {mode === "recorded" && (
              <p>
                Renda fixa usa saldos manuais. Sem capital inicial, mudanças de
                saldo são ajustes de posição. Proventos iniciais do extrato não
                entram no período novo. Consultas são consolidadas em intervalos
                de 15 minutos; no passado, a curva exibe a última observação do
                dia. O acompanhamento depende da aba aberta e das fontes
                disponíveis.
              </p>
            )}
            <p>
              Dados de mercado: Yahoo Finance. CDI:{" "}
              <a
                href="https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json"
                target="_blank"
                rel="noreferrer"
              >
                Banco Central, série 12 ↗
              </a>
              .{" "}
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
                {mode === "cost"
                  ? "Curva retroativa pelo preço médio"
                  : mode === "simulation"
                    ? "Simulação da composição atual"
                    : "Histórico real da carteira"}{" "}
                · {scopeInfo.name} · retornos em {currencyName}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">{labels.portfolio}</th>
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
                    <td>{result(p.portfolio)}</td>
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
