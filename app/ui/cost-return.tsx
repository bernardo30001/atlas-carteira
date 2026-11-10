import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { signedMoney, tone } from "../lib/format";
import type { CostPerformance } from "../lib/cost-performance";

export function CostReturnSummary({
  data,
  hidden,
}: {
  data: CostPerformance;
  hidden: boolean;
}) {
  const money = (v: number) =>
    hidden
      ? "••••••"
      : v.toLocaleString("pt-BR", {
          style: "currency",
          currency: data.currency,
        });
  return (
    <>
      {data.returnPercent !== undefined && (
        <div
          className="cost-return-summary"
          aria-label="Resultado desde o preço médio"
        >
          <div>
            <span>Valor investido</span>
            <b>{money(data.cost)}</b>
          </div>
          <div>
            <span>Saldo atual</span>
            <b>{money(data.value)}</b>
          </div>
          <div>
            <span>Proventos registrados</span>
            <b>{money(data.income)}</b>
          </div>
          <div>
            <span>Resultado com proventos</span>
            <b className={hidden ? "" : tone(data.result)}>
              {hidden ? "••••••" : signedMoney(data.result, data.currency)}
            </b>
          </div>
        </div>
      )}
      {data.manualFixedCount > 0 && (
        <div className="coverage-note" role="status">
          <b>Curva somente dos ativos com cotação</b>
          <span>
            O resultado acumulado acima inclui a renda fixa com capital inicial
            informado. A curva mostra os ativos cotados; o saldo manual do CDB
            não tem histórico diário para entrar no gráfico.
          </span>
        </div>
      )}
      {data.partialHistoryCount > 0 && (
        <div className="coverage-note partial" role="status">
          <b>Histórico de compras parcial</b>
          <span>
            O acumulado considera todas as quantidades e os custos consolidados.
            O gráfico combina as compras documentadas com estimativas das
            parcelas sem datas. Os pontos mostram somente as compras conhecidas.
          </span>
        </div>
      )}
      {data.excluded.length > 0 && (
        <div className="coverage-note partial" role="status">
          <b>
            {data.includedCount} de {data.totalCount} posições no cálculo
            acumulado
          </b>
          <span>
            {hidden
              ? "Há posições com custo, cotação ou câmbio pendente."
              : data.excluded.join("; ") + "."}
          </span>
          <span>
            Saldo e custo dessas posições ficam fora do percentual até os dados
            serem informados.
          </span>
        </div>
      )}
      {data.estimatedFX && (
        <div className="coverage-note partial" role="status">
          <b>
            {data.currency === "USD"
              ? "Conversão estimada das taxas"
              : "Conversão estimada para reais"}
          </b>
          <span>
            {data.currency === "USD"
              ? "Taxas em reais sem câmbio de compra informado são convertidas para dólares pela cotação atual."
              : "Parte do exterior não tem câmbio de compra ou recebimento. Para esses valores, usamos o dólar atual; o resultado não inclui o efeito cambial histórico. O grupo americano mostra o rendimento em US$."}
          </span>
        </div>
      )}
    </>
  );
}

export function CostReturnMethod({
  data,
  hidden,
  children,
}: {
  data: CostPerformance;
  hidden: boolean;
  children?: ReactNode;
}) {
  return (
    <details className="performance-method">
      <summary>
        <Info size={16} />
        Como este resultado é calculado
      </summary>
      <div>
        {children}
        <p>
          Resultado = (saldo atual − valor investido + proventos registrados) ÷
          valor investido. O preço médio já inclui as taxas. O custo usa
          quantidade × preço médio, ou o valor investido exato do extrato quando
          informado. O percentual do grupo é ponderado pelo capital investido.
        </p>
        <p>
          ETFs no exterior são calculados em dólares; Brasil, renda fixa,
          Bitcoin e o consolidado usam reais. O câmbio informado na compra é
          preservado. Sem ele, o custo em reais usa o dólar oficial (PTAX) do
          dia da operação e fica marcado como estimativa.
        </p>
        <p>
          Vendas parciais abatem o custo pelo preço médio. Posições e ciclos já
          encerrados não entram na carteira atual, e o lucro das vendas aparece
          à parte, em Resultado realizado. Posição sem datas de compra entra na
          curva na data de referência.
        </p>
        <p>
          A curva pode começar acima ou abaixo de 0%: sua base é o custo
          registrado, e não o primeiro dia visível. Este número não é uma
          rentabilidade anualizada. Para comparar com Ibovespa, S&P 500, CDI e
          Bitcoin a partir da mesma data, use o modo Rentabilidade.
        </p>
        {hidden && data.warnings.length ? (
          <p>Detalhes das posições ficam ocultos no modo de privacidade.</p>
        ) : (
          data.warnings.map((warning, i) => <p key={i}>{warning}</p>)
        )}
        <p>
          Proventos são somados uma vez ao resultado e não aumentam novamente o
          saldo em custódia. Impostos não são calculados. Cotações e histórico:
          Yahoo Finance. Câmbio: PTAX do Banco Central.
        </p>
      </div>
    </details>
  );
}
