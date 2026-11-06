"use client";
import { Search, Plus, ArrowRight, Coins } from "lucide-react";
import { money, num, plainPercent, signedMoney, tone } from "../lib/format";
import { Change } from "./change";
import { GROUPS, totals, type Portfolio, type Market } from "../lib/model";
export function AssetTable({
  portfolio,
  market,
  hidden,
  full,
  filter,
  query,
  setFilter,
  setQuery,
  onAsset,
  onAdd,
  onIncome,
  onPortfolio,
}: {
  portfolio: Portfolio;
  market: Market;
  hidden: boolean;
  full: boolean;
  filter: string;
  query: string;
  setFilter: (v: string) => void;
  setQuery: (v: string) => void;
  onAsset: (t: string) => void;
  onAdd: (t: string) => void;
  onIncome: () => void;
  onPortfolio: () => void;
}) {
  const t = totals(portfolio, market),
    fx =
      market.quotes.USD && !market.quotes.USD.stale
        ? market.quotes.USD.price
        : undefined;
  const rows = t.rows.filter(
    (a) =>
      (filter === "all" ||
        (filter === "brazil" && a.currency === "BRL") ||
        (filter === "held" && a.quantity > 0) ||
        (filter === "b3etf" && a.currency === "BRL" && a.group !== "br") ||
        filter === a.group) &&
      (!query ||
        `${a.ticker} ${a.name}`.toLowerCase().includes(query.toLowerCase())),
  );
  // A prévia mostra primeiro o que você tem, do maior para o menor saldo.
  const shown = full
    ? rows
    : [...rows].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 5);
  const segments = [
    {
      id: "stocks",
      title: "Ações na B3",
      text: "Empresas brasileiras · valores em R$",
      rows: shown.filter((a) => a.currency === "BRL" && a.group === "br"),
    },
    {
      id: "b3etfs",
      title: "ETFs na B3",
      text: "ABTC11 e AUPO11 · valores em R$",
      rows: shown.filter((a) => a.currency === "BRL" && a.group !== "br"),
    },
    {
      id: "abroad",
      title: "ETFs no exterior",
      text: "Valores em US$ · conversão atual em R$ separada",
      rows: shown.filter((a) => a.currency === "USD" && a.ticker !== "BTC"),
    },
    {
      id: "btc",
      title: "Bitcoin direto",
      text: "Quantidade em BTC · saldo em reais",
      rows: shown.filter((a) => a.ticker === "BTC"),
    },
  ].filter((s) => s.rows.length);
  const fmt = (v: number | null, c = "BRL") =>
    hidden ? "••••••" : v === null ? "Não informado" : money(v, c);
  return (
    <section className="panel asset-panel">
      <div className="panel-title">
        <div>
          <h2>
            {full ? "Seus ativos" : "Ativos no radar"}{" "}
            <span className="count">{rows.length}</span>
          </h2>
          <p>
            {full
              ? "Custos, proventos e resultados preservados na moeda de cada posição."
              : "Ações, ETFs, renda fixa em bolsa e criptomoedas."}
          </p>
        </div>
        {full ? (
          <button className="text-button" onClick={onIncome}>
            <Coins size={14} />
            Registrar provento
          </button>
        ) : (
          <button className="text-button" onClick={onPortfolio}>
            Ver carteira <ArrowRight size={15} />
          </button>
        )}
      </div>
      <div className="table-tools">
        <div
          className="tabs"
          role="group"
          aria-label="Filtrar por classe de ativo"
        >
          {[
            ["all", "Todos"],
            ["brazil", "Bolsa brasileira"],
            ["br", "Ações na B3"],
            ["b3etf", "ETFs na B3"],
            ["etf", "Exterior"],
            ["crypto", "Cripto"],
            ["rf", "Renda fixa"],
            ...(full ? [["held", "Em carteira"]] : []),
          ].map(([v, l]) => (
            <button
              aria-pressed={filter === v}
              className={filter === v ? "active" : ""}
              key={v}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="search compact">
          <Search size={15} />
          <input
            aria-label="Filtrar ativos"
            placeholder="Buscar ativo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <>
        {segments.map((segment) => (
          <section className="asset-segment" key={segment.id}>
            <div className="asset-segment-heading">
              <h3>
                {segment.title}{" "}
                <span className="count">{segment.rows.length}</span>
              </h3>
              <span>{segment.text}</span>
            </div>
            <p className="table-scroll-hint">
              Deslize para ver todas as colunas.
            </p>
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label={segment.title + " · tabela com rolagem horizontal"}
            >
              <table
                role="table"
                className={"asset-table " + (full ? "portfolio-table" : "")}
              >
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Ativo / Classe
                    </th>
                    <th role="columnheader" scope="col">
                      Cotação
                    </th>
                    {full ? (
                      <>
                        <th role="columnheader" scope="col">
                          Quantidade / PM
                        </th>
                        <th role="columnheader" scope="col">
                          Investido
                        </th>
                        <th role="columnheader" scope="col">
                          Proventos
                        </th>
                        <th role="columnheader" scope="col">
                          Saldo atual
                        </th>
                        <th role="columnheader" scope="col">
                          Resultado c/ proventos
                        </th>
                      </>
                    ) : (
                      <>
                        <th role="columnheader" scope="col">
                          Variação do dia
                        </th>
                        <th role="columnheader" scope="col">
                          Volatilidade anual
                        </th>
                        <th role="columnheader" scope="col">
                          Tendência 6 meses
                        </th>
                      </>
                    )}
                    <th role="columnheader" scope="col" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {segment.rows.map((a) => {
                    const quotePrimary = a.quote
                      ? a.ticker === "BTC"
                        ? fx
                          ? a.quote.price * fx
                          : null
                        : a.quote.price
                      : null;
                    return (
                      <tr role="row" key={a.ticker}>
                        <td role="cell" className="sticky-asset">
                          <button
                            className="asset-name"
                            onClick={() => onAsset(a.ticker)}
                          >
                            <span
                              className="asset-mark"
                              style={{
                                background: a.color + "16",
                                color: a.color,
                                width: 36,
                                height: 36,
                              }}
                            >
                              {a.ticker === "BTC" ? "₿" : a.ticker.slice(0, 2)}
                            </span>
                            <span>
                              <b>{a.ticker}</b>
                              <small>{a.name}</small>
                              <small>
                                {GROUPS[a.group].short} ·{" "}
                                {a.currency === "USD" && a.ticker !== "BTC"
                                  ? "US$"
                                  : "R$"}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td role="cell" data-label="Cotação">
                          <b>
                            {quotePrimary === null
                              ? "Cotação pendente"
                              : money(quotePrimary, a.primaryCurrency)}
                          </b>
                          {a.currency === "USD" && (
                            <small>
                              {a.ticker === "BTC"
                                ? a.quote
                                  ? money(a.quote.price, "USD")
                                  : "Cotação em dólar pendente"
                                : fx && a.quote
                                  ? "≈ " + money(a.quote.price * fx)
                                  : "Conversão pendente"}
                            </small>
                          )}
                          <small>
                            {a.quote
                              ? new Date(a.quote.time * 1000).toLocaleString(
                                  "pt-BR",
                                  {
                                    timeZone: "America/Sao_Paulo",
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "Aguardando a fonte"}
                            {a.quote?.stale
                              ? " · sem atualização"
                              : a.quote?.outdated
                                ? " · cotação antiga"
                                : ""}
                          </small>
                        </td>
                        {full ? (
                          <>
                            <td role="cell" data-label="Quantidade / PM">
                              <b>{hidden ? "•••" : num(a.quantity, 8)}</b>
                              <small>
                                PM {fmt(a.average, a.averageCurrency)}
                              </small>
                            </td>
                            <td role="cell" data-label="Investido">
                              <b>{fmt(a.primaryCost, a.primaryCurrency)}</b>
                              {a.currency === "USD" &&
                                a.ticker !== "BTC" &&
                                a.cost === null &&
                                a.quantity > 0 && (
                                  <small>Câmbio de compra não informado</small>
                                )}
                              {a.feesBRL > 0 && (
                                <small>Taxas: {fmt(a.feesBRL)}</small>
                              )}
                              {a.costEstimated && (
                                <small>Taxa convertida pelo câmbio atual</small>
                              )}
                            </td>
                            <td role="cell" data-label="Proventos">
                              {fmt(a.nativeIncome, a.primaryCurrency)}
                            </td>
                            <td role="cell" data-label="Saldo atual">
                              <b>
                                {a.primaryValue === null
                                  ? "Cotação pendente"
                                  : fmt(a.primaryValue, a.primaryCurrency)}
                              </b>
                              {a.primaryCurrency === "USD" && (
                                <small>
                                  {a.value !== null
                                    ? "≈ " + fmt(a.value)
                                    : "Conversão pendente"}
                                </small>
                              )}
                              <small>
                                {hidden
                                  ? "Peso oculto"
                                  : !t.missing.length && t.value
                                    ? num(((a.value ?? 0) / t.value) * 100) +
                                      "% da carteira"
                                    : "Peso pendente"}
                              </small>
                            </td>
                            <td role="cell" data-label="Resultado c/ proventos">
                              <b className={hidden ? "" : tone(a.result)}>
                                {a.result === null
                                  ? "Não disponível"
                                  : hidden
                                    ? "••••••"
                                    : signedMoney(a.result, a.primaryCurrency)}
                              </b>
                              <small>
                                {hidden ? (
                                  "•••"
                                ) : a.primaryCost && a.result !== null ? (
                                  <Change
                                    value={(a.result / a.primaryCost) * 100}
                                  />
                                ) : null}
                              </small>
                            </td>
                          </>
                        ) : (
                          <>
                            <td role="cell" data-label="Variação do dia">
                              <Change value={a.quote?.change} />
                            </td>
                            <td role="cell" data-label="Volatilidade anual">
                              {a.quote?.volatility != null
                                ? plainPercent(a.quote.volatility)
                                : "—"}
                            </td>
                            <td role="cell" data-label="Tendência 6 meses">
                              <Change value={a.quote?.momentum} />
                            </td>
                          </>
                        )}
                        <td role="cell" className="asset-action">
                          <button
                            className="icon-button"
                            title={`Registrar ${a.ticker}`}
                            aria-label={`Registrar ${a.ticker}`}
                            onClick={() => onAdd(a.ticker)}
                          >
                            <Plus size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </>
      {!rows.length && (
        <div className="empty">
          <h3>Nenhum ativo encontrado</h3>
          <p>Altere a categoria ou a busca.</p>
        </div>
      )}
      <div className="panel-foot">
        {!full && (
          <span>
            Exibindo {shown.length} de {rows.length} ativos. Use a busca ou abra
            a carteira completa.
          </span>
        )}
        <span>
          <span className="live-dot" />
          Yahoo Finance · consulta a cada 60s · pode haver atraso
        </span>
        <span>
          Resultados em moeda nativa. Conversão atual não altera o custo de
          compra.
        </span>
      </div>
    </section>
  );
}
