"use client";
import { money } from "../lib/format";
import { Wallet, Globe2, Landmark, Coins } from "lucide-react";
import { useMemo } from "react";
import { percent, signedMoney, tone } from "../lib/format";
import { costPerformance } from "../lib/cost-performance";
import { realizedResults } from "../lib/trade-history";
import { dayChange, totals, type Portfolio, type Market } from "../lib/model";
export function CurrencySummary({
  portfolio,
  market,
  hidden,
  compact = false,
}: {
  portfolio: Portfolio;
  market: Market;
  hidden: boolean;
  compact?: boolean;
}) {
  const t = totals(portfolio, market),
    fx =
      market.quotes.USD && !market.quotes.USD.stale
        ? market.quotes.USD
        : undefined;
  const fmt = (v: number | null, c = "BRL") =>
    hidden ? "••••••" : v === null ? "Não informado" : money(v, c);
  const br = t.brazilStocks,
    etfs = t.brazilEtfs,
    us = t.international,
    btc = t.rows.find((a) => a.ticker === "BTC")!,
    realized = realizedResults(portfolio),
    sold = realized.BRL.count + realized.USD.count;
  // A janela de 1 dia dispensa reconstruir a curva: aqui só importa o acumulado.
  const accumulated = useMemo(
      () => costPerformance(portfolio, market, "all", 1),
      [portfolio, market],
    ),
    today = useMemo(() => dayChange(portfolio, market), [portfolio, market]);
  const figure = (amount: number | undefined, change: number | undefined) =>
    hidden ? (
      "••••••"
    ) : t.missing.length || amount === undefined || change === undefined ? (
      "Aguardando"
    ) : (
      <>
        {signedMoney(amount)} <span>{percent(change)}</span>
      </>
    );
  return (
    <>
      <div className="stats-grid currency-stats">
        <section className="stat-card wealth">
          <div className="stat-label">
            Patrimônio consolidado em reais <Wallet size={16} />
          </div>
          <div className="stat-value">
            {t.missing.length ? "Aguardando cotações" : fmt(t.value)}
          </div>
          {(accumulated.includedCount > 0 || t.missing.length > 0) && (
            <dl className="wealth-figures">
              <div>
                <dt>
                  Resultado com proventos
                  {accumulated.estimatedFX ? " (estimado)" : ""}
                </dt>
                <dd>{figure(accumulated.result, accumulated.returnPercent)}</dd>
              </div>
              <div>
                <dt>Hoje, nas posições cotadas</dt>
                <dd>{figure(today?.amount, today?.percent)}</dd>
              </div>
            </dl>
          )}
          <div className="stat-foot">
            {t.missing.length
              ? "Valor parcial · cotação ou câmbio pendente"
              : accumulated.excluded.length
                ? `Resultado sem ${accumulated.excluded.length} ${accumulated.excluded.length === 1 ? "posição pendente" : "posições pendentes"} · detalhes no gráfico`
                : "Posições + renda fixa · exterior convertido hoje"}
          </div>
          <div className="wealth-decoration" />
        </section>
        <section className="stat-card">
          <div className="stat-label">
            Ações na B3 <Landmark size={16} />
          </div>
          <div className="stat-value">
            {br.missing ? "Cotação pendente" : fmt(br.value)}
          </div>
          <div className="stat-foot">{br.count} ações · valores em reais</div>
        </section>
        <section className="stat-card">
          <div className="stat-label">
            ETFs na B3 <Landmark size={16} />
          </div>
          <div className="stat-value">
            {etfs.missing ? "Cotação pendente" : fmt(etfs.value)}
          </div>
          <div className="stat-foot">{etfs.count} ETFs · ABTC11 e AUPO11</div>
        </section>
        <section className="stat-card">
          <div className="stat-label">
            Exterior · patrimônio em dólar <Globe2 size={16} />
          </div>
          <div className="stat-value">
            {us.missing ? "Cotação pendente" : fmt(us.value, "USD")}
          </div>
          <div className="stat-foot">
            {fx ? (
              <>≈ {fmt(us.value * fx.price)} ao câmbio atual</>
            ) : (
              "Conversão indisponível · saldo em US$ preservado"
            )}
          </div>
        </section>
      </div>
      {!compact && (
        <div className="fx-ribbon">
          <Globe2 size={16} />
          <b>
            {fx
              ? `US$ 1 = ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(fx.price)}`
              : "Câmbio USD/BRL indisponível"}
          </b>
          <span>
            {fx
              ? `Cotação de ${new Date(fx.time * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : "Aguardando a fonte"}
          </span>
          <small>
            Consulta automática a cada 60s · custos de compra em US$ permanecem
            em US$.
          </small>
        </div>
      )}
      {!compact && (
        <>
          <div className="regional-summaries">
            {[
              { label: "Ações na B3", currency: "BRL", data: br },
              { label: "ETFs na B3", currency: "BRL", data: etfs },
              {
                label: "Exterior · ETFs em dólares",
                currency: "USD",
                data: us,
              },
            ].map(({ label, currency, data }) => (
              <section className="panel regional-summary" key={label}>
                <div className="regional-heading">
                  <h2>{label}</h2>
                  <span>{currency}</span>
                </div>
                <div>
                  <span>Investido</span>
                  <b>{fmt(data.cost, currency)}</b>
                </div>
                <div>
                  <span>Proventos acumulados</span>
                  <b>{fmt(data.income, currency)}</b>
                </div>
                <div>
                  <span>Resultado com proventos</span>
                  <b className={hidden ? "" : tone(data.result)}>
                    {data.missing
                      ? "Cotação pendente"
                      : hidden
                        ? "••••••"
                        : data.result === null
                          ? "Não informado"
                          : signedMoney(data.result, currency)}
                  </b>
                </div>
                <p>
                  {currency === "USD"
                    ? "O câmbio de compra não foi presumido. O resultado acima é em dólares."
                    : label === "ETFs na B3"
                      ? "ABTC11 e AUPO11, separados das ações. As metas seguem a exposição de cada fundo."
                      : "Somente ações brasileiras. ETFs, CDB e Bitcoin direto ficam separados."}
                </p>
              </section>
            ))}
          </div>
          {
            <div className="supplemental-holdings">
              <section className="panel supplemental-income">
                <div className="stat-label">
                  Proventos registrados <Coins size={16} />
                </div>
                <div className="stat-value">{fmt(t.incomes.BRL)}</div>
                <div className="stat-foot income-us">
                  + {fmt(t.incomes.USD, "USD")} <span>· moedas separadas</span>
                </div>
              </section>
              {sold > 0 && (
                <section className="panel supplemental-income">
                  <div className="stat-label">
                    Resultado realizado <Coins size={16} />
                  </div>
                  <div
                    className={
                      "stat-value " + (hidden ? "" : tone(realized.BRL.result))
                    }
                  >
                    {hidden ? "••••••" : signedMoney(realized.BRL.result)}
                  </div>
                  <div className="stat-foot income-us">
                    {hidden
                      ? "••••••"
                      : signedMoney(realized.USD.result, "USD")}{" "}
                    <span>
                      · {sold} {sold === 1 ? "venda" : "vendas"} · fora do
                      rendimento em carteira
                    </span>
                  </div>
                  {realized.pending.length > 0 && (
                    <div className="stat-foot">
                      {hidden
                        ? "Há vendas sem câmbio para calcular."
                        : "Sem câmbio para calcular: " +
                          realized.pending.join(", ") +
                          "."}
                    </div>
                  )}
                </section>
              )}
              {btc.quantity > 0 && (
                <section className="panel supplemental-holding">
                  <div>
                    <span className="eyebrow">BITCOIN DIRETO</span>
                    <b>
                      {hidden
                        ? "••••••"
                        : btc.quantity.toLocaleString("pt-BR", {
                            maximumFractionDigits: 8,
                          })}{" "}
                      BTC
                    </b>
                    <small>Custo em reais: {fmt(btc.primaryCost)}</small>
                  </div>
                  <div>
                    <strong>
                      {btc.value === null ? "Cotação pendente" : fmt(btc.value)}
                    </strong>
                    <small>
                      Resultado atual:{" "}
                      {hidden
                        ? "••••••"
                        : btc.result === null
                          ? "Não informado"
                          : signedMoney(btc.result)}
                    </small>
                  </div>
                </section>
              )}
              {portfolio.fixedIncome.map((r) => (
                <section key={r.id} className="panel supplemental-holding">
                  <div>
                    <span className="eyebrow">RENDA FIXA · SALDO MANUAL</span>
                    <b>{hidden ? "Título de renda fixa" : r.name}</b>
                    <small>
                      {r.ratePercent
                        ? `${r.ratePercent}% do ${r.index ?? "CDI"}`
                        : "Taxa não informada"}{" "}
                      · saldo de{" "}
                      {new Date(r.updatedAt + "T12:00:00").toLocaleDateString(
                        "pt-BR",
                      )}
                    </small>
                  </div>
                  <div>
                    <strong>{fmt(r.value)}</strong>
                    <small>
                      {r.cost === null
                        ? "Capital inicial não informado"
                        : "Investido: " + fmt(r.cost)}
                    </small>
                  </div>
                </section>
              ))}
            </div>
          }
        </>
      )}
    </>
  );
}
