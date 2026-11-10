"use client";
import { useState, useEffect, useMemo } from "react";
import {
  RefreshCw,
  Scale,
  Target,
  ArrowRight,
  SlidersHorizontal,
  Info,
  ExternalLink,
} from "lucide-react";
import { ASSETS, today, type Portfolio, type Market } from "../lib/model";
import {
  ACTIONS,
  evaluatePortfolio,
  normalizedWeights,
} from "../lib/evaluation";
import {
  BASE_STOCK_WEIGHTS,
  DEFAULT_EVALUATION,
  DEFAULT_SCENARIO,
  type FundamentalData,
  type EvaluationSettings,
  type EarningsScenario,
} from "../lib/evaluation-config";
import { ValidatedForm, FormInput } from "./validated-form";
const stocks = ASSETS.filter((a) => a.group === "br");
const n = (value: number, d = 1) =>
    value.toLocaleString("pt-BR", { maximumFractionDigits: d }),
  pct = (value: number | null) => (value === null ? "—" : n(value) + "%"),
  money = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string | null | undefined) =>
  s ? new Date(s + "T12:00:00Z").toLocaleDateString("pt-BR") : "não informada";
const priceLabels: Record<string, string> = {
  cheap: "Desconto no modelo",
  expensive: "Prêmio no modelo",
  neutral: "Sem margem de compra",
  unknown: "Sem referência válida",
};
type Props = {
  portfolio: Portfolio;
  market: Market;
  hidden: boolean;
  budget: number;
  setBudget: (value: number) => void;
  save: (p: Portfolio) => Promise<boolean>;
  busy: boolean;
  onRegister?: (ticker: string, quantity: number) => void;
  onContributions?: () => void;
};
export function EvaluationPanel({
  portfolio,
  market,
  hidden,
  budget,
  setBudget,
  save,
  busy,
  onRegister,
  onContributions,
}: Props) {
  const [data, setData] = useState<FundamentalData>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("ALUP11"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [view, setView] = useState("allocation"),
    [message, setMessage] = useState("");
  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fundamentals", { signal });
      const result = (await response.json()) as FundamentalData;
      if (signal?.aborted) return;
      if (!response.ok)
        throw Error(
          "A fonte de fundamentos não respondeu. Tente consultar novamente.",
        );
      setData(result);
      if (result.errors?.length)
        setError(
          "Parte dos indicadores não foi atualizada. As linhas afetadas mostram a limitação.",
        );
    } catch (e) {
      if (!signal?.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível consultar os fundamentos.",
        );
        setData((old) => (old ? { ...old, stale: true } : undefined));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => {
      if (!document.hidden) load(controller.signal);
    }, 3600000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  const analysis = useMemo(
    () => evaluatePortfolio(portfolio, market, data, budget, Date.now()),
    [portfolio, market, data, budget],
  );
  const current = analysis.rows.find((r) => r.ticker === selected)!,
    visible = analysis.rows.filter(
      (r) =>
        (filter === "all" ||
          (filter === "owned" && r.quantity > 0) ||
          (filter === "buy" && r.action === "buy") ||
          (filter === "attention" &&
            ["reduce", "sell", "review", "missing"].includes(r.action))) &&
        `${r.ticker} ${r.name}`.toLowerCase().includes(query.toLowerCase()),
    );
  const cash = (value: number | null) => (hidden ? "••••••" : money(value)),
    weight = (value: number | null) => (hidden ? "•••" : pct(value));
  async function saveSettings(settings: EvaluationSettings) {
    const weights = {
      ...portfolio.weights,
      ...Object.fromEntries(
        stocks.map((a) => [a.ticker, settings.baseWeights[a.ticker] ?? 0]),
      ),
    };
    const ok = await save({ ...portfolio, evaluation: settings, weights });
    if (ok) setMessage("Critérios salvos na sua carteira.");
    return ok;
  }
  const showAsset = (ticker: string) => {
    setSelected(ticker);
    setView("asset");
    requestAnimationFrame(() => {
      const panel = document.getElementById("evaluation-detail");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  };
  const planner = (
    <ContributionAllocation
      analysis={analysis}
      hidden={hidden}
      budget={budget}
      setBudget={setBudget}
      pending={loading && !data}
      onAsset={showAsset}
      onRegister={onRegister}
      onContributions={onContributions}
    />
  );
  return (
    <div className="evaluation-page">
      <section className="panel evaluation-intro">
        <div>
          <span className="eyebrow">
            <Scale size={15} />
            PREÇO, QUALIDADE E PESO
          </span>
          <h2>O que faz sentido para sua carteira agora?</h2>
          <p>
            Seu plano é a referência. O preço e os fundamentos ajudam a escolher
            onde comprar mais, esperar ou avaliar uma redução.
          </p>
        </div>
        <button
          className="button outline"
          disabled={loading}
          onClick={() => load()}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {loading ? "Consultando fundamentos…" : "Consultar fundamentos"}
        </button>
      </section>
      <div className="evaluation-notice">
        <Info size={17} />
        <p>
          As indicações são condicionais às regras exibidas. A referência usa
          pares do mesmo subsetor ou um cenário editável de lucros; as premissas
          iniciais são hipóteses, não previsões nem preços justos definitivos. A
          análise não examina gestão, fatos relevantes ou toda a tese de cada
          empresa.
        </p>
      </div>
      {error && (
        <div className="notice warn" role="status">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
          <button onClick={() => setMessage("")} aria-label="Fechar mensagem">
            Fechar
          </button>
        </div>
      )}
      <div
        className="evaluation-view-tabs"
        role="tablist"
        aria-label="Tipo de avaliação"
        onKeyDown={(event) => {
          const ids = ["allocation", "portfolio", "asset"];
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const index = ids.indexOf(view),
            next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 2
                  : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
          setView(ids[next]);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>("[role=tab]")
            [next]?.focus();
        }}
      >
        {[
          ["allocation", "Meu aporte"],
          ["portfolio", "Minha carteira"],
          ["asset", "Uma ação"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={"evaluation-tab-" + id}
            role="tab"
            aria-selected={view === id}
            aria-controls={
              id === "asset" ? "evaluation-detail" : "evaluation-" + id
            }
            tabIndex={view === id ? 0 : -1}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="evaluation-allocation"
        className="evaluation-view"
        role="tabpanel"
        aria-labelledby="evaluation-tab-allocation"
        hidden={view !== "allocation"}
      >
        {planner}
      </div>
      <div
        id="evaluation-portfolio"
        className="evaluation-view"
        role="tabpanel"
        aria-labelledby="evaluation-tab-portfolio"
        hidden={view !== "portfolio"}
      >
        <div className="evaluation-summary">
          <section className="panel">
            <span>Ações brasileiras na carteira</span>
            <strong>
              {analysis.portfolioComplete
                ? weight(analysis.currentClassWeight)
                : "Cotação pendente"}
            </strong>
            <small>
              Meta da classe: {pct(analysis.classTarget)} · CDB e exterior
              entram no patrimônio total.
            </small>
          </section>
          <section className="panel">
            <span>Saldo atual em ações brasileiras</span>
            <strong>
              {analysis.missingStocks
                ? "Aguardando cotações"
                : cash(analysis.stockValue)}
            </strong>
            <small>
              Posição usada para calcular os pesos e os limites do aporte.
            </small>
          </section>
          <section className="panel">
            <span>Cobertura de preço e fundamentos</span>
            <strong>
              {loading
                ? "Consultando…"
                : `${analysis.coverage} / ${analysis.total}`}
            </strong>
            <small>
              Referência válida e cotação recente; indicadores ausentes não
              viram sinal de compra.
            </small>
          </section>
        </div>
        <section className="panel evaluation-overview">
          <div className="panel-title">
            <div>
              <h2>Avaliação da carteira</h2>
              <p>
                Concentração dentro da classe de ações brasileiras, com todas as
                posições atuais.
              </p>
            </div>
            <Target size={20} />
          </div>
          <div className="evaluation-health">
            <div>
              <h3>Distribuição por setor</h3>
              {analysis.missingStocks ? (
                <p>
                  Há posições sem cotação. A distribuição e os aportes aguardam
                  dados completos.
                </p>
              ) : (
                analysis.sectors.map((s) => (
                  <div className="evaluation-sector" key={s.name}>
                    <span>{s.name}</span>
                    <div>
                      <i style={{ width: Math.min(100, s.percent) + "%" }} />
                    </div>
                    <b>{weight(s.percent)}</b>
                  </div>
                ))
              )}
            </div>
            <div>
              <h3>O que merece atenção</h3>
              <ul>
                <li>
                  {analysis.currentClassWeight > analysis.classTarget + 2
                    ? "A classe de ações está acima da meta. Novos aportes podem priorizar outras classes."
                    : analysis.currentClassWeight < analysis.classTarget - 2
                      ? "A classe de ações está abaixo da meta. Verifique as candidatas com desconto e fundamentos válidos."
                      : "A classe de ações está próxima da meta definida."}
                </li>
                <li>
                  {analysis.rows.filter((r) => r.concentrated).length} posições
                  com excesso de concentração por emissor ou setor.
                </li>
                <li>
                  {analysis.rows.filter((r) => r.action === "buy").length}{" "}
                  candidatas a comprar/aumentar pelo modelo;{" "}
                  {
                    analysis.rows.filter((r) =>
                      ["sell", "reduce", "review"].includes(r.action),
                    ).length
                  }{" "}
                  posições ou teses para revisar.
                </li>
                <li>A análise da Klabin considera somente KLBN4.</li>
              </ul>
            </div>
          </div>
        </section>
        <section className="panel evaluation-ranking">
          <div className="panel-title">
            <div>
              <h2>O que orienta a distribuição</h2>
              <p>
                Pesos na classe de ações · base original normalizada de 99,8%
                para 100%.
              </p>
            </div>
          </div>
          <div className="evaluation-controls">
            <label className="evaluation-search">
              <span>Buscar ação</span>
              <input
                value={query}
                placeholder="Ticker ou empresa"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div role="group" aria-label="Filtrar avaliações">
              {[
                ["all", "Todas"],
                ["owned", "Na carteira"],
                ["buy", "Comprar / aumentar"],
                ["attention", "Revisar"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={"chip " + (filter === id ? "active" : "")}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="table-wrap"
            role="region"
            aria-label="Avaliação por ação"
            tabIndex={0}
          >
            <table className="evaluation-table">
              <thead>
                <tr>
                  <th scope="col">Ação / indicação</th>
                  <th scope="col">Preço / referência</th>
                  <th scope="col">Atual</th>
                  <th scope="col">Base</th>
                  <th scope="col">Peso sugerido</th>
                  <th scope="col">Análise</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.ticker}>
                    <th scope="row">
                      <b>{r.ticker}</b>
                      <small>{r.name}</small>
                      <span className={"evaluation-badge " + r.action}>
                        {loading && !data ? "Consultando…" : ACTIONS[r.action]}
                      </span>
                    </th>
                    <td>
                      <b>{money(r.price)}</b>
                      <small>Referência: {money(r.reference)}</small>
                      <small>{priceLabels[r.valuation]}</small>
                      <small>
                        {r.referenceKind === "scenario"
                          ? "Cenário editável"
                          : r.referenceKind === "manual"
                            ? "Sua referência"
                            : "Comparação por pares"}
                      </small>
                    </td>
                    <td>{weight(r.currentWeight)}</td>
                    <td>{pct(r.baseWeight)}</td>
                    <td>
                      <b>{pct(r.targetWeight)}</b>
                      <small>
                        {r.factor > 1
                          ? "Ajuste por desconto"
                          : r.factor < 1
                            ? "Ajuste por preço / revisão"
                            : Math.abs(r.targetWeight - r.baseWeight) < 0.05
                              ? "Base preservada"
                              : r.targetWeight > r.baseWeight
                                ? "Sobe com o ajuste das outras"
                                : "Desce pelos limites"}
                      </small>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        aria-label={"Ver avaliação de " + r.ticker}
                        onClick={() => showAsset(r.ticker)}
                      >
                        Ver motivos <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="evaluation-empty">Nenhuma ação para este filtro.</p>
            )}
          </div>
          <div className="panel-foot">
            A simulação acima usa estes critérios de preço, fundamentos e peso
            para decidir quanto aportar em cada ação.
          </div>
          <div className="evaluation-apply">
            <p>
              Os critérios desta avaliação já orientam a aba Aportes. O peso
              base é ajustado pelo preço e pelos fundamentos, respeitando os
              limites por emissor e setor. Você pode editar as proporções e as
              premissas em “Sua regra base e critérios de compra”.
            </p>
            {analysis.targetReserve > 0.01 && (
              <p>
                Os limites deixam {pct(analysis.targetReserve)} sem destino na
                classe; essa parcela não é forçada em outras ações.
              </p>
            )}
          </div>
        </section>
      </div>
      <section
        className="panel evaluation-detail"
        id="evaluation-detail"
        role="tabpanel"
        aria-labelledby="evaluation-tab-asset"
        tabIndex={-1}
        hidden={view !== "asset"}
      >
        <div className="panel-title">
          <div>
            <h2>Avaliação individual</h2>
            <p>
              Veja os motivos, confira as fontes e registre sua leitura da
              empresa.
            </p>
          </div>
          <label>
            Escolher ação
            <select
              aria-label="Ação para avaliação individual"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {stocks.map((a) => (
                <option value={a.ticker} key={a.ticker}>
                  {a.ticker} · {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="evaluation-detail-heading">
          <div>
            <span className="eyebrow">
              {current.ticker} · {current.sector}
            </span>
            <h3>{current.name}</h3>
            <span className={"evaluation-badge " + current.action}>
              {ACTIONS[current.action]}
            </span>
          </div>
          <div>
            <span>Preço máximo para comprar</span>
            <strong>{money(current.buyCeiling)}</strong>
            <small>
              {current.referenceKind === "scenario"
                ? "Cenário de lucros editável"
                : current.referenceKind === "manual"
                  ? "Sua referência manual"
                  : "Referência relativa por pares"}
            </small>
            <small>
              Preço igual ou inferior ao limite · margem{" "}
              {analysis.settings.margin}%.
            </small>
          </div>
        </div>
        <div className="evaluation-metrics">
          {[
            ["P/L", current.fundamentals?.pe, "x"],
            ["P/VP", current.fundamentals?.pb, "x"],
            ["ROE", current.fundamentals?.roe, "%"],
            ["ROIC", current.fundamentals?.roic, "%"],
            ["Dívida líquida / EBIT", current.fundamentals?.netDebtEbit, "x"],
            ["LPA (12 meses)", current.fundamentals?.eps, "R$"],
          ].map(([label, value, suffix]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <b>
                {typeof value === "number"
                  ? suffix === "R$"
                    ? money(value)
                    : n(value, 2) + suffix
                  : "Não disponível"}
              </b>
            </div>
          ))}
        </div>
        <ul className="evaluation-reasons">
          {current.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
        {current.excessValue > 0 &&
          ["sell", "reduce"].includes(current.action) && (
            <p className="evaluation-reduction">
              Excesso em relação ao peso sugerido: {cash(current.excessValue)}.
              Avalie reduzir aos poucos ou reequilibrar com aportes; impostos,
              custos e liquidez precisam ser verificados.
            </p>
          )}
        <div className="evaluation-sources">
          <p>
            Fundamentos:{" "}
            <a
              target="_blank"
              rel="noreferrer"
              href={
                current.fundamentals?.sourceUrl ??
                `https://www.fundamentus.com.br/detalhes.php?papel=${current.ticker}`
              }
            >
              Fundamentus <ExternalLink size={12} />
            </a>{" "}
            · cotação da fonte {date(current.fundamentals?.quoteDate)} · balanço{" "}
            {date(current.fundamentals?.balanceDate)}. Os indicadores usam os
            últimos 12 meses terminados no balanço.
          </p>
          {current.peer && (
            <p>
              Pares verificados:{" "}
              {current.peer.tickers.map((ticker, i) => (
                <span key={ticker}>
                  {i ? ", " : ""}
                  <a
                    href={current.peer!.sourceUrls[i]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ticker}
                  </a>
                </span>
              ))}
              . P/L mediano {n(current.peer.medianPE, 2)}x; intervalo central{" "}
              {n(current.peer.lowPE, 2)}x–{n(current.peer.highPE, 2)}x. Cotação
              mais antiga {date(current.peer.oldestQuote)}; balanço mais antigo{" "}
              {date(current.peer.oldestBalance)}.
            </p>
          )}
          <p>
            Preço atual: Yahoo Finance
            {current.quote?.time
              ? " · " +
                new Date(current.quote.time * 1000).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })
              : ""}
            . Consulta dos fundamentos:{" "}
            {data?.fetchedAt
              ? new Date(data.fetchedAt).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })
              : "aguardando"}{" "}
            · atualização por hora.
          </p>
        </div>
        {hidden ? (
          <p className="evaluation-empty">
            Mostre os valores para editar as premissas desta ação.
          </p>
        ) : (
          <IndividualSettings
            key={selected + JSON.stringify(analysis.settings)}
            ticker={selected}
            settings={analysis.settings}
            busy={busy}
            save={saveSettings}
          />
        )}
      </section>
      <EvaluationCriteria
        key={JSON.stringify(analysis.settings)}
        settings={analysis.settings}
        hidden={hidden}
        busy={busy}
        save={saveSettings}
      />
      <details className="panel evaluation-method">
        <summary>
          <Info size={16} />
          Como a avaliação decide
        </summary>
        <div>
          <p>
            A base fornecida por você soma 99,8% e é normalizada
            proporcionalmente. A Klabin é acompanhada somente pela KLBN4. A
            referência automática exige pelo menos 3 outros emissores do mesmo
            subsetor, P/L entre 2x e 60x, lucro e ROE positivos, liquidez média
            de pelo menos R$ 200 mil e datas verificadas nos detalhes de cada
            empresa. Classes de ações do mesmo emissor não são contadas como
            pares diferentes.
          </p>
          <p>
            Referência relativa = lucro por ação dos últimos 12 meses × mediana
            do P/L dos pares. O preço precisa ficar pelo menos{" "}
            {analysis.settings.margin}% abaixo para sugerir compra; acima de
            120% da referência suspende novas compras pelo preço. Na falta de
            pares suficientes, o modo automático usa o cenário de lucros:
            dividendos projetados (LPA × crescimento × payout) e valor de saída
            (LPA final × P/L de saída) são descontados pelo retorno exigido. As
            hipóteses iniciais são 5% de crescimento a.a., 15% de retorno
            exigido, payout de 40%, P/L de saída 12x e horizonte de 5 anos;
            todas são editáveis. Lucros cíclicos não são normalizados
            automaticamente. Por isso, um prêmio não prova que a empresa esteja
            cara, e um desconto não prova que esteja barata.
          </p>
          <p>
            Lucro ou ROE não positivos, ROE menor que metade da mediana dos
            pares e dívida líquida/EBIT acima de 4x suspendem compras para
            revisão. Bancos e seguradoras não recebem o teste de dívida
            industrial. Uma tese marcada por você para revisão também suspende
            compras; tese rompida gera “Avaliar venda”. Excesso de concentração
            ou prêmio com excesso de peso gera “Avaliar redução”. Prejuízo na
            posição e seu preço médio não determinam venda.
          </p>
          <p>
            Todo o valor informado é o orçamento para as ações. A divisão entre
            as classes fica em Aportes. A verba é distribuída entre as
            candidatas proporcionalmente ao que falta para atingir o peso
            sugerido, com limites por emissor e setor. As quantidades são
            arredondadas para unidades inteiras; a sobra só vai para compras
            ainda elegíveis e dentro dos limites. O que não puder ser aplicado
            fica em caixa. Renda fixa, ETFs e Bitcoin entram na avaliação da
            alocação total; a análise fundamentalista individual desta aba cobre
            as ações brasileiras cadastradas.
          </p>
          <p>
            As indicações ajudam a organizar a decisão; não executam ordens.
            Antes de vender, considere tese, tributação e custos.{" "}
            <a
              href="https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/acoes"
              target="_blank"
              rel="noreferrer"
            >
              Conceitos de análise e riscos — Portal do Investidor/CVM ↗
            </a>
          </p>
        </div>
      </details>
    </div>
  );
}
function ContributionAllocation({
  analysis,
  hidden,
  budget,
  setBudget,
  pending,
  onAsset,
  onRegister,
  onContributions,
}: {
  analysis: ReturnType<typeof evaluatePortfolio>;
  hidden: boolean;
  budget: number;
  setBudget: (v: number) => void;
  pending: boolean;
  onAsset: (ticker: string) => void;
  onRegister?: (ticker: string, quantity: number) => void;
  onContributions?: () => void;
}) {
  const cash = (v: number) => (hidden ? "••••••" : money(v)),
    ready = !pending && !analysis.missingStocks;
  const ordered = analysis.rows.toSorted(
    (a, b) => b.executable - a.executable || a.ticker.localeCompare(b.ticker),
  );
  const buys = ordered.filter((r) => r.executable > 0).length;
  return (
    <section
      className="panel contribution-allocation"
      aria-labelledby="contribution-allocation-title"
    >
      <div className="panel-title">
        <div>
          <span className="eyebrow">SIMULADOR DE APORTE</span>
          <h2 id="contribution-allocation-title">
            Quanto colocar em cada ação?
          </h2>
          <p>
            Informe o valor e veja a distribuição completa, incluindo as ações
            que devem receber R$ 0 neste aporte.
          </p>
        </div>
        <Target size={22} />
      </div>
      <div className="contribution-allocation-inputs">
        <div>
          <label className="field">
            Valor do aporte (R$)
            <input
              aria-label="Valor do aporte para distribuir entre as ações"
              type={hidden ? "text" : "number"}
              readOnly={hidden}
              min="0"
              max="1000000000"
              step="0.01"
              value={hidden ? "••••••" : budget}
              onChange={(e) =>
                setBudget(Math.min(1e9, Math.max(0, Number(e.target.value))))
              }
            />
          </label>
          <div
            className="quick-budgets"
            role="group"
            aria-label="Valores de aporte"
          >
            {[500, 1000, 2500, 5000].map((v) => (
              <button
                key={v}
                disabled={hidden}
                aria-pressed={budget === v}
                className={"chip " + (budget === v ? "active" : "")}
                onClick={() => setBudget(v)}
              >
                {money(v)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="contribution-allocation-context">
        Todo o valor vai para as ações, pelo preço, pelos fundamentos e pelos
        limites. O modelo pode deixar uma parte em caixa quando faltar preço
        atrativo, dados válidos ou espaço nos limites. Para dividir entre as
        classes ou seguir só os seus percentuais, use{" "}
        {onContributions ? (
          <button className="text-button" onClick={onContributions}>
            Aportes <ArrowRight size={14} />
          </button>
        ) : (
          "Aportes"
        )}
        .
      </p>
      <div
        className="contribution-allocation-totals"
        role="status"
        aria-live="polite"
      >
        <div>
          <span>Orçamento para ações</span>
          <strong>
            {ready ? cash(analysis.classAmount) : "Aguardando dados"}
          </strong>
        </div>
        <div>
          <span>Compras sugeridas</span>
          <strong>{ready ? cash(analysis.allocated) : "Calculando…"}</strong>
          <small>
            {ready
              ? `${buys} ${buys === 1 ? "ação recebe" : "ações recebem"} aporte`
              : "Consultando cotações e fundamentos"}
          </small>
        </div>
        <div>
          <span>Manter em caixa / aguardar</span>
          <strong>{ready ? cash(analysis.reserve) : "Calculando…"}</strong>
        </div>
      </div>
      {!ready && (
        <div className="contribution-allocation-status" role="status">
          Aguardando os dados necessários para calcular a sugestão. Nenhuma
          compra foi indicada enquanto a consulta está pendente.
        </div>
      )}
      {ready && budget <= 0 && (
        <div className="contribution-allocation-status">
          Informe um aporte maior que zero para receber a distribuição.
        </div>
      )}
      {ready && budget > 0 && analysis.allocated === 0 && (
        <div className="contribution-allocation-status">
          Nenhuma ação atende aos critérios de compra e ao orçamento neste
          cenário. O modelo sugere aguardar com o valor em caixa; confira o
          motivo em cada linha.
        </div>
      )}
      {(() => {
        const table = (list: typeof ordered, label: string) => (
          <div
            className="table-wrap"
            role="region"
            aria-label={label}
            tabIndex={0}
          >
            <table className="contribution-allocation-table">
              <thead>
                <tr>
                  <th scope="col">Ação</th>
                  <th scope="col">Valor sugerido</th>
                  <th scope="col">% do orçamento das ações</th>
                  <th scope="col">Quantidade estimada</th>
                  <th scope="col">Decisão e motivo</th>
                  <th scope="col">Análise / registro</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.ticker}>
                    <th scope="row">
                      <b>{r.ticker}</b>
                      <small>{r.name}</small>
                    </th>
                    <td>
                      <strong>{ready ? cash(r.executable) : "—"}</strong>
                    </td>
                    <td>
                      {!ready
                        ? "—"
                        : hidden
                          ? "•••"
                          : pct(
                              analysis.classAmount
                                ? (r.executable / analysis.classAmount) * 100
                                : 0,
                            )}
                    </td>
                    <td>
                      {!ready
                        ? "—"
                        : hidden
                          ? "•••"
                          : r.quantityToBuy.toLocaleString("pt-BR") + " un."}
                    </td>
                    <td>
                      <span
                        className={
                          "evaluation-badge " +
                          (!ready
                            ? "missing"
                            : r.executable > 0
                              ? "buy"
                              : "wait")
                        }
                      >
                        {!ready
                          ? "Aguardando dados"
                          : r.executable > 0
                            ? "Aportar agora"
                            : "Não aportar agora"}
                      </span>
                      <small>
                        {!ready
                          ? "A sugestão aparecerá após a consulta."
                          : r.allocationReason}
                      </small>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        aria-label={"Ver motivos do aporte em " + r.ticker}
                        onClick={() => onAsset(r.ticker)}
                      >
                        Ver análise <ArrowRight size={14} />
                      </button>
                      {ready && r.quantityToBuy > 0 && onRegister && (
                        <button
                          className="text-button register-suggestion"
                          disabled={hidden}
                          onClick={() => onRegister(r.ticker, r.quantityToBuy)}
                        >
                          Registrar compra
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        const active = ready ? ordered.filter((r) => r.executable > 0) : [],
          waiting = ready ? ordered.filter((r) => r.executable <= 0) : ordered;
        return (
          <>
            {active.length > 0 && table(active, "Ações que recebem aporte")}
            {waiting.length > 0 &&
              (active.length ? (
                <details className="contribution-waiting">
                  <summary>
                    {waiting.length}{" "}
                    {waiting.length === 1
                      ? "ação não recebe"
                      : "ações não recebem"}{" "}
                    neste aporte · ver motivos
                  </summary>
                  {table(waiting, "Ações que não recebem aporte")}
                </details>
              ) : (
                table(waiting, "Distribuição do aporte por ação")
              ))}
          </>
        );
      })()}
      <div className="panel-foot">
        Sugestões em unidades inteiras, incluindo negociação fracionária. O
        valor das compras somado ao saldo em caixa fecha o orçamento das ações.
        Estimativas sem taxas; confirme os preços ao comprar.
      </div>
    </section>
  );
}
function IndividualSettings({
  ticker,
  settings,
  busy,
  save,
}: {
  ticker: string;
  settings: EvaluationSettings;
  busy: boolean;
  save: (s: EvaluationSettings) => Promise<boolean>;
}) {
  const current = settings.overrides[ticker],
    scenario = current?.scenario ?? settings.scenario ?? DEFAULT_SCENARIO;
  return (
    <details className="evaluation-custom">
      <summary>
        <SlidersHorizontal size={15} />
        Sua tese e referência de preço
      </summary>
      <p>
        Escolha pares, um cenário de lucros ou um preço de referência próprio. O
        modo automático usa pares e, quando faltam comparáveis, usa o cenário
        abaixo. Para usá-la sem fundamentos atualizados, confirme a tese e
        registre o motivo. Referências manuais vencem após 180 dias.
      </p>
      <ValidatedForm
        busy={busy}
        onValidSubmit={async (e) => {
          const form = new FormData(e.currentTarget),
            price = String(form.get("reference") ?? "");
          await save({
            ...settings,
            overrides: {
              ...settings.overrides,
              [ticker]: {
                referencePrice: price ? Number(price) : null,
                thesis: form.get("thesis") as any,
                note: String(form.get("note") ?? ""),
                updatedAt: today(),
                method: form.get("method") as any,
                scenario: readScenario(form),
              },
            },
          });
        }}
      >
        <div className="evaluation-form-grid">
          <label className="field">
            Método de referência
            <select name="method" defaultValue={current?.method ?? "auto"}>
              <option value="auto">Automático · pares ou cenário</option>
              <option value="peers">Somente comparação por pares</option>
              <option value="scenario">Cenário de lucros</option>
              <option value="manual">Preço definido por mim</option>
            </select>
          </label>
          <label className="field">
            Sua referência de preço (R$)
            <FormInput
              name="reference"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              defaultValue={current?.referencePrice ?? ""}
              hint="Usado no método manual; no automático, tem prioridade se preenchido."
            />
          </label>
          <label className="field">
            Situação da tese
            <select
              name="thesis"
              defaultValue={current?.thesis ?? "unreviewed"}
            >
              <option value="unreviewed">Sem revisão manual</option>
              <option value="intact">Tese revisada e mantida</option>
              <option value="review">
                Precisa de revisão · pausar compras
              </option>
              <option value="broken">Tese rompida · avaliar venda</option>
            </select>
          </label>
          <label className="field evaluation-wide">
            Motivos / riscos que você acompanha
            <textarea
              name="note"
              defaultValue={current?.note ?? ""}
              maxLength={1000}
              rows={3}
              placeholder="Ex.: lucro normalizado, vantagem competitiva, dívida, risco do setor e fonte da sua referência."
            />
          </label>
        </div>
        <ScenarioFields scenario={scenario} />
        <button className="button primary" disabled={busy}>
          Salvar avaliação de {ticker}
        </button>
      </ValidatedForm>
    </details>
  );
}
function EvaluationCriteria({
  settings,
  hidden,
  busy,
  save,
}: {
  settings: EvaluationSettings;
  hidden: boolean;
  busy: boolean;
  save: (s: EvaluationSettings) => Promise<boolean>;
}) {
  const [weights, setWeights] = useState(settings.baseWeights),
    normalized = normalizedWeights(weights);
  return (
    <details className="panel evaluation-criteria">
      <summary>
        <SlidersHorizontal size={17} />
        Sua regra base e critérios de compra
      </summary>
      <p>
        Edite as proporções e os limites. Os percentuais são relativos à classe
        de ações brasileiras; salvar os critérios não altera suas posições.
      </p>
      {hidden ? (
        <p>Mostre os valores para editar os critérios.</p>
      ) : (
        <ValidatedForm
          busy={busy}
          onValidSubmit={async (e) => {
            const f = new FormData(e.currentTarget);
            await save({
              ...settings,
              baseWeights: weights,
              margin: Number(f.get("margin")),
              maxIssuerWeight: Number(f.get("issuer")),
              maxSectorWeight: Number(f.get("sector")),
              scenario: readScenario(f),
            });
          }}
        >
          <div className="evaluation-form-grid">
            <label className="field">
              Margem para comprar (%)
              <FormInput
                type="number"
                name="margin"
                required
                min="5"
                max="50"
                step="1"
                defaultValue={settings.margin}
              />
            </label>
            <label className="field">
              Limite por emissor (%)
              <FormInput
                type="number"
                name="issuer"
                required
                min="5"
                max="50"
                step="1"
                defaultValue={settings.maxIssuerWeight}
              />
            </label>
            <label className="field">
              Limite por setor (%)
              <FormInput
                type="number"
                name="sector"
                required
                min="10"
                max="100"
                step="1"
                defaultValue={settings.maxSectorWeight}
              />
            </label>
          </div>
          <ScenarioFields scenario={settings.scenario ?? DEFAULT_SCENARIO} />
          <div className="evaluation-weight-grid">
            {stocks.map((a) => (
              <label className="field" key={a.ticker}>
                {a.ticker}
                <FormInput
                  name={"weight-" + a.ticker}
                  aria-label={"Peso base de " + a.ticker}
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  value={weights[a.ticker] ?? 0}
                  onChange={(e) =>
                    setWeights((old) => ({
                      ...old,
                      [a.ticker]: Number(e.target.value),
                    }))
                  }
                />
                <small>{pct(normalized[a.ticker])} após normalizar</small>
              </label>
            ))}
          </div>
          <div className="evaluation-form-actions">
            <button
              className="button primary"
              disabled={
                busy || !stocks.some((a) => (weights[a.ticker] ?? 0) > 0)
              }
            >
              Salvar critérios
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setWeights({ ...BASE_STOCK_WEIGHTS })}
            >
              Restaurar proporções informadas
            </button>
          </div>
          <p>
            Referência inicial: margem {DEFAULT_EVALUATION.margin}%, emissor{" "}
            {DEFAULT_EVALUATION.maxIssuerWeight}% e setor{" "}
            {DEFAULT_EVALUATION.maxSectorWeight}%. Esses limites são premissas
            editáveis do modelo.
          </p>
        </ValidatedForm>
      )}
    </details>
  );
}

function readScenario(form: FormData): EarningsScenario {
  return {
    growth: Number(form.get("scenario-growth")),
    discountRate: Number(form.get("scenario-discount")),
    terminalPE: Number(form.get("scenario-pe")),
    payout: Number(form.get("scenario-payout")),
    years: Number(form.get("scenario-years")),
  };
}
function ScenarioFields({ scenario }: { scenario: EarningsScenario }) {
  return (
    <fieldset className="evaluation-scenario">
      <legend>Cenário de lucros · premissas editáveis</legend>
      <p>
        Aplica o lucro de 12 meses como ponto de partida. Crescimento e múltiplo
        de saída são hipóteses; revise lucros não recorrentes e ciclos do setor.
      </p>
      <div className="evaluation-form-grid">
        <label className="field">
          Crescimento do lucro (% a.a.)
          <FormInput
            name="scenario-growth"
            type="number"
            required
            min="-20"
            max="30"
            step="0.5"
            defaultValue={scenario.growth}
          />
        </label>
        <label className="field">
          Retorno exigido (% a.a.)
          <FormInput
            name="scenario-discount"
            type="number"
            required
            min="5"
            max="40"
            step="0.5"
            defaultValue={scenario.discountRate}
          />
        </label>
        <label className="field">
          P/L de saída (vezes)
          <FormInput
            name="scenario-pe"
            type="number"
            required
            min="2"
            max="50"
            step="0.5"
            defaultValue={scenario.terminalPE}
          />
        </label>
        <label className="field">
          Payout (% do lucro)
          <FormInput
            name="scenario-payout"
            type="number"
            required
            min="0"
            max="100"
            step="1"
            defaultValue={scenario.payout}
          />
        </label>
        <label className="field">
          Horizonte (anos)
          <FormInput
            name="scenario-years"
            type="number"
            required
            min="1"
            max="10"
            step="1"
            defaultValue={scenario.years}
          />
        </label>
      </div>
    </fieldset>
  );
}
