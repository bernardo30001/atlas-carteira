import { Info } from "lucide-react";
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
            <b className={!hidden && data.result < 0 ? "negative" : "positive"}>
              {money(data.result)}
            </b>
          </div>
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
}: {
  data: CostPerformance;
  hidden: boolean;
}) {
  return (
    <details className="performance-method">
      <summary>
        <Info size={16} />
        Como o retroativo é calculado
      </summary>
      <div>
        <p>
          Rendimento acumulado = (saldo atual − valor investido + proventos
          registrados) ÷ valor investido. O preço médio já inclui as taxas. O
          custo usa quantidade × preço médio, ou o valor investido exato do
          extrato quando informado. O percentual do grupo é ponderado pelo
          capital investido.
        </p>
        <p>
          Ações e ETFs americanos são calculados em dólares; ações da B3,
          Bitcoin e o consolidado usam reais. O câmbio informado na compra é
          preservado. Conversões sem câmbio registrado usam a cotação da data
          avaliada e são identificadas como estimativas.
        </p>
        <p>
          Com movimentações importadas, a curva usa as quantidades e os custos
          disponíveis em cada data. Vendas parciais abatem o custo pelo preço
          médio; posições e ciclos já encerrados não entram na carteira atual. O
          resultado de vendas realizadas não se mistura ao rendimento da posição
          que permanece em carteira.
        </p>
        <p>
          Para posições sem movimentações, a curva usa o preço médio informado.
          Ela pode começar acima ou abaixo de 0%: sua base é o custo registrado,
          e não o primeiro dia visível. Esse acumulado não equivale a uma
          rentabilidade anualizada nem ao retorno do período selecionado.
        </p>
        {hidden && data.warnings.length ? (
          <p>Detalhes das posições ficam ocultos no modo de privacidade.</p>
        ) : (
          data.warnings.map((warning, i) => <p key={i}>{warning}</p>)
        )}
        <p>
          Os índices de referência continuam disponíveis em Acompanhamento real
          e Simular histórico, que comparam retornos a partir da mesma data.
          Proventos são somados uma vez ao resultado e não aumentam novamente o
          saldo em custódia. Vendas ficam em Resultado realizado, e impostos não
          são calculados.
        </p>
        <p>
          Cotações e histórico: Yahoo Finance. A reconstrução não altera as
          posições ou as observações já salvas.
        </p>
      </div>
    </details>
  );
}
