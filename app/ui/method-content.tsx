import type { Portfolio } from "../lib/model";

/** Texto de transparência: como os aportes são orientados e de onde vêm os dados. */
export function MethodContent({
  kind,
  targets,
}: {
  kind: string;
  targets: Portfolio["targets"];
}) {
  return (
    <>
      <span className="eyebrow">TRANSPARÊNCIA</span>
      <h2 id="modal-title">
        {kind === "method"
          ? "Como orientamos seus aportes"
          : "Fontes e atualização"}
      </h2>
      <div className="prose">
        <h3>Suas metas vêm primeiro</h3>
        <p>
          Brasil {targets.br}%, renda fixa {targets.rf}%, exterior {targets.etf}
          % e Bitcoin {targets.crypto}%, conforme você definiu. Metas editáveis.
          Sem pesos específicos, a compra mantém a proporção atual dos ativos da
          classe. Nenhuma divisão é presumida.
        </p>
        <h3>Como o valor é distribuído</h3>
        <p>
          Cada classe tem um nível: posição atual ÷ meta. O aporte vai primeiro
          para o nível mais baixo e, ao alcançar o seguinte, as duas sobem
          juntas. Assim, as classes que recebem terminam igualmente perto da
          meta, e nenhuma venda é sugerida. Nas ações brasileiras, preço,
          fundamentos e limites da Avaliação definem as compras. Nas outras
          classes, a mesma regra vale entre os ativos.
        </p>
        <p>
          As quantidades respeitam as cotas inteiras da B3 e as frações do
          exterior e do Bitcoin. O que o arredondamento deixar vai para quem
          aceita frações ou para mais uma cota de quem couber. Volatilidade e
          tendência são exibidas como informação e não alteram os valores.
        </p>
        <h3>Métricas</h3>
        <p>
          Volatilidade: desvio padrão amostral dos retornos logarítmicos diários
          × √252 (√365 para Bitcoin). Tendência: variação em 126 intervalos
          diários de negociação, ou 183 dias para Bitcoin. Queda máxima: maior
          perda de um pico até um fundo no histórico de até 1 ano. Preços
          históricos ajustados pelo provedor quando disponíveis.
        </p>
        <h3>Cotações e notícias</h3>
        <p>
          Yahoo Finance: consulta a cada 60 segundos enquanto a aba está
          visível. A fonte pode ter atrasos e bloqueios; o horário exibido é o
          da cotação, em Brasília. A conexão usa uma interface não oficial, sem
          garantia de disponibilidade. Notícias: Google Notícias via RSS, com
          Bing Notícias e Yahoo Finance como alternativas, consultadas a cada 5
          minutos, com links para as matérias. As alternativas podem incluir
          conteúdo em inglês.
        </p>
        <h3>Câmbio e resultado</h3>
        <p>
          Os ETFs internacionais preservam saldo, custo e dividendos em dólares;
          a conversão atual em reais é exibida separadamente. Sem o câmbio de
          compra, o custo e o resultado históricos em reais ficam pendentes. O
          resultado por ativo é saldo na moeda de origem menos custo mais
          proventos registrados. Dividendos não são adicionados novamente ao
          patrimônio. Bitcoin pode ter custo informado em reais. Renda fixa usa
          o saldo manual do extrato; custo ausente permanece desconhecido. O
          resultado das posições em carteira não inclui vendas, que aparecem à
          parte em Resultado realizado. Impostos não são calculados. Cada ETF
          conta na classe a que dá exposição: AUPO11 em renda fixa e ABTC11 em
          Bitcoin, nas metas, nos resumos e nos filtros. O ABTC11 segue a
          estratégia do próprio fundo, então sua variação pode diferir da do
          BTC. Valores e rendimentos do extrato recebido ficam preservados
          separadamente das cotações atuais.
        </p>
        <h3>Limites</h3>
        <p>
          O simulador não avalia fundamentos, valor justo, risco de crédito,
          liquidez, tributação nem seu perfil. Não executa ordens e não garante
          retorno. Confirme preços e condições na corretora.
        </p>
        <a
          href="https://help.yahoo.com/kb/SLN2310.html"
          target="_blank"
          rel="noreferrer"
        >
          Cobertura e atrasos — Yahoo Finance ↗
        </a>
        <a
          href="https://www.investor.gov/introduction-investing/getting-started/asset-allocation"
          target="_blank"
          rel="noreferrer"
        >
          Alocação e reequilíbrio — Investor.gov ↗
        </a>
      </div>
    </>
  );
}
