# Revisão do Atlas: cálculos, design e importação

**Estado em 06/11/2026:** cálculos e design corrigidos, importação da B3 pronta em dados fictícios. **Falta validar com arquivos reais** e seguir para nota de corretagem e Nomad. Nada foi publicado: tudo está nesta branch local.

As seções 1 a 7 guardam o diagnóstico aprovado. As referências `arquivo:linha` delas valem no commit de formatação `99edf15`. O que mudou desde então está na seção 10.

## 1. Resumo

- **A base dos cálculos está certa.** TWR, fórmula ponderada, câmbio, volatilidade, tendência, queda máxima, proventos sem dupla contagem e planejador conferem em 24 testes recalculados à mão.
- **Há 20 divergências, 2 críticas.** A principal: venda registrada no histórico não reduz patrimônio nem custo, e a interface não tem como registrar uma venda.
- **A hierarquia visual é o maior problema de design.** O resultado da carteira só aparece fora da primeira tela. O modo escuro não existe. O contraste do modo claro passou nas medições.
- **A importação depende de arquivos reais.** Os cabeçalhos da B3 e o formato da Nomad não têm documentação pública, e `dados-privados/` não existe neste computador.


## 2. Avisos encontrados durante a revisão

| Aviso | Situação | O que preciso de você |
|---|---|---|
| `dados-privados/` não existe | A pasta está ignorada pelo Git, mas não há nada nela, nem em Documentos, Downloads ou Desktop. A comparação com a B3 (seção 3.5) ficou pendente. | Colocar os arquivos na pasta. |
| Repositório sem remote | Este checkout não tem `origin`. Não consegui confirmar que ele é público. O repositório pai aponta para outro projeto e não rastreia esta pasta. | Confirmar onde ele é publicado. |
| Tickers e metas no código | `ASSETS` e o README expõem a lista de ativos e as metas. Não há quantidades nem valores nos arquivos versionados que revisei. Se o repositório for público, isso é visível. | Decidir se isso incomoda. A importação permite tirar parte disso do código (D5). |
| Banco local com registros que parecem reais | `.wrangler/state` não está vazio e não é versionado. `tests/api.mjs` e `tests/performance-api.mjs` gravam nesse banco: restauram a carteira, mas avançam a revisão e criam observações locais. Rodei os dois uma vez antes de perceber. O site publicado não é afetado. | Ver a etapa 0 da seção 8. |
| `app/lib/evaluation.ts` não existe | Não está no repositório nem no histórico. As métricas estão em `metrics` (`model.ts`). Auditei essas. | Avisar se era outro arquivo. |
| `node_modules` estava danificado | Faltava o binário do `workerd`, e o site não subia. Rodei `npm ci`, que não altera arquivos versionados. | Nada. |

## 3. Diagnóstico dos cálculos

Os exemplos usam valores inventados. Cada linha tem um teste em `tests/auditoria-divergencias.mjs` que afirma o valor correto e, por isso, falha até a correção. O teste leva o mesmo código da tabela.

### 3.1 Crítico

| ID | Divergência | Exibido | Correto | Causa | Onde |
|---|---|---|---|---|---|
| C1 | Venda no histórico não reduz a posição. Compra de 100 a R$ 10, venda de 40, preço R$ 15. | 100 cotas, patrimônio R$ 1.500, custo R$ 1.000 | 60 cotas, R$ 900, R$ 600 | `positions` soma só `transactions`. `tradeHistory` alimenta apenas a curva. O formulário só aceita `buy` e `opening`, e excluir um registro "não representa uma venda". | `model.ts:308`, `model.ts:325`, `investment-forms.tsx:29`, `dashboard.tsx:1719` |
| C2 | Provento de ciclo encerrado infla o resultado. Recebeu R$ 500, vendeu tudo, recomprou 10 a R$ 10, preço R$ 10. | Resultado R$ 500, rendimento +500% | R$ 0 e 0%, pois o README diz que ciclos encerrados ficam fora | Os proventos são filtrados só por ticker, sem olhar o ciclo. | `model.ts:307`, `cost-performance.ts:112` |

### 3.2 Importante

| ID | Divergência | Exibido | Correto | Causa | Onde |
|---|---|---|---|---|---|
| I1 | Ticker com ciclo encerrado e posição inicial atual some da curva. | Curva vazia | Termina em +50%, igual ao acumulado | `recorded?.quantity ?? lots` não usa os lotes quando a quantidade é 0, pois 0 não é nulo. | `cost-performance.ts:225-235` |
| I2 | Com histórico parcial, a curva vê só as operações datadas. | Último ponto +200% e acumulado +63,64% | Os dois +63,64% | Mesma causa: duas fontes de quantidade. | `cost-performance.ts:225-237` |
| I3 | CDI some do Acompanhamento real durante o dia. No Banco Central, às 14h37 de 06/11 a última taxa era 05/11. | "sem dados", linha oculta e "Sem dado comum" | CDI acumulado até a última taxa publicada | O último ponto é de hoje e a condição exige taxa de hoje. A tela conclui que a série inteira falta. Como abrir a página gera observação, isso ocorre quase sempre. | `performance.ts:279`, `performance-chart.tsx:129-139`, `performance-chart.tsx:564-568` |
| I4 | Datas de USD/BRL ficam um dia adiantadas no horário de verão britânico. Em dados reais do Yahoo, 150 de 262 barras vêm às 23:00 UTC, e 30 caem em domingo. | Barra de segunda rotulada 05/07 | 06/07 | A data é derivada em UTC, sem considerar o fuso da bolsa. Afeta a curva em reais e a simulação, não o patrimônio atual. | `market-server.ts:32`, `market-server.ts:58` |
| I5 | Preço médio ignora as taxas, mas o Investido ao lado as inclui. 10 a R$ 10 com R$ 5 de taxa. **Decisão D3:** a metodologia hoje descreve o preço médio sem taxas (`cost-return.tsx:96`). | PM R$ 10,00 com Investido R$ 105 | PM R$ 10,50 | A média usa `quantidade × preço`, ignorando taxas e `costNative`. | `model.ts:370-378` |
| I6 | Taxa sem câmbio apaga o custo em dólar de todo o grupo. VOO 10 a US$ 100, R$ 5 de taxa, dólar a R$ 5. | Investido e Resultado "Não informado", também no total do exterior | US$ 1.001, resultado US$ 99, grupo US$ 1.101 | `primaryCost` vira `null`, enquanto `costPerformance` faz a estimativa. O README promete preservar custos em USD. | `model.ts:334-347` |
| I7 | Donut mostra patrimônio parcial como total. Medido na tela sem a cotação de VOO. | Cartão "Aguardando cotações" e donut "R$ 4.000,00" | "Aguardando cotações" nos dois | Falta a proteção `missing` no centro do donut. | `dashboard.tsx:978` |
| I8 | Venda listada antes da compra no mesmo dia derruba a validação. | Recusa a carteira inteira com "Confira os valores…" | Aceitar: a ordem dentro do dia não é cronológica | A ordenação usa só a data e preserva a ordem de entrada. | `trade-history.ts:9-10`, `validation.ts:206` |
| I9 | Sugestão usa câmbio desatualizado quando não há posição em dólar. | 2 cotas de VOO | 0, até haver câmbio válido | `assetPlan` não verifica `stale`, ao contrário de `positions`. | `model.ts:470` |
| I10 | Painel de proventos aparece vazio durante o carregamento. Medido na tela. | "Seus proventos aparecerão aqui" | Estado de carregamento | O bloco não exige `portfolioReady`. | `dashboard.tsx:1162` |

### 3.3 Melhoria

| ID | Divergência | Exibido | Correto | Onde |
|---|---|---|---|---|
| M1 | Pontos de compra incluem ciclos encerrados, e a tela afirma o contrário. | 2 compras | 1 | `trade-history.ts:108`, `performance-chart.tsx:454` |
| M2 | `totals.result` não soma proventos. Nenhuma tela usa esse campo. | R$ 500 | R$ 600, ou remover o campo | `model.ts:411` |
| M3 | Volatilidade ausente vale 0,5, o mesmo que 100% ao ano, mas a metodologia a chama de neutra. | R$ 488,72 e R$ 511,28 | R$ 500 e R$ 500 | `model.ts:484` |
| M4 | CDI acumula com a janela deslocada. A taxa de D remunera de D ao próximo dia útil. Só muda o valor quando a taxa muda. | Fator 1,0006 | 1,0005 | `performance.ts:291` |
| M5 | Às 22h de Brasília, a simulação pode terminar no dia seguinte, pois usa UTC. | 07/11 | 06/11 | `performance.ts:352-353` |
| M6 | Percentual arredondado a zero mostra sinal. | `-0%` | `0%` | `dashboard.tsx:85`, `performance-chart.tsx:45`, `asset-table.tsx:27` |
| M7 | Cotação antiga passa por atual: só falha de rede marca `stale`. O campo de atraso também nunca vem na resposta real, e a tela sempre diz "não informado". | Sem aviso | Marcar como desatualizada, sem bloquear o patrimônio | `market-server.ts:93` |
| M8 | A metodologia repete metas fixas com "conforme você definiu", mesmo após editá-las. | 35/35/22/8 fixos | Metas atuais | `dashboard.tsx:1913` |

### 3.4 O que confere

`tests/auditoria-calculos.mjs` passa nos 24 testes, recalculados à mão:

| Item que você pediu | Resultado |
|---|---|
| Preço médio com compra parcial e venda | Correto. O preço de venda não afeta o custo restante, e zerar encerra o ciclo. |
| Taxas no custo | Coerentes em `positions`, `costPerformance`, `datedCost` e `replayTrades`. Só o PM exibido difere (I5). |
| Fórmula desde o preço médio | Correta e ponderada: no teste dá 7,5%, enquanto a média simples daria 25%. |
| TWR | É TWR de fato, na grade das observações. Com +10%, aporte e +10% dá 21%, não 142%. Resgate também é neutro. |
| Proventos | Não entram no patrimônio e contam uma vez na curva. O acumulado anterior fica fora do TWR. |
| Câmbio | Custo em USD preservado, estimativa identificada, consolidado inclui câmbio só quando ele é conhecido. |
| Referências | Base comum em 0%, composição correta, S&P 500 convertido em reais. |
| Volatilidade, tendência, queda máxima | Conforme a metodologia, incluindo √365 e 183 dias para Bitcoin. |
| Planejador | Déficits, soma igual ao aporte, metas em 100%, arredondamento para baixo: inteiro na B3, 6 casas no exterior, 8 em BTC. |
| Fuso, dias sem pregão, ausência de dados | Corretos, exceto os itens I3, I4, M5 e M7. Sem divisão por zero. |

**Limitações já documentadas na tela, que não considero erro:**

- O TWR só enxerga o que existe nas observações. Importar uma venda antiga vira fluxo neutro na próxima observação e não reescreve o passado do Acompanhamento real.
- A curva desde o preço médio exclui renda fixa manual, e o acumulado a inclui. Os dois podem diferir nesse caso.
- O S&P 500 (`^GSPC`) é de preço e o Ibovespa é de retorno total. Sugiro avaliar `^SP500TR` depois.
- Vendas e lucro realizado ficam fora do resultado (decisão D4).

### 3.5 Comparação com a B3

**Pendente.** Depende dos arquivos em `dados-privados/`. Assim que eles existirem, comparo quantidade e preço médio por ativo e registro aqui só as diferenças, sem valores reais.

## 4. Diagnóstico de design

Referência: [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) e o guia Apple Design que você indicou. Medições feitas no modo demonstração, em 1440 × 900 e 390 × 844, por script. Dados em `outputs/revisao/antes/medicoes.json`; capturas na mesma pasta, que o Git ignora.

**Limites:** não testei aparelho físico, VoiceOver nem zoom de 200%. O contraste medido cobre texto sobre fundo sólido no modo claro, em 4 páginas.

### 4.1 Crítico

| ID | Achado | Evidência | Proposta |
|---|---|---|---|
| D-1 | **O resultado não aparece primeiro.** O patrimônio está no topo, mas sem ganho ou perda ao lado. No celular, o cartão de patrimônio ocupa meia largura, como os demais. | Patrimônio em y=365 no desktop e y=537 no celular. Rendimento em y=986 (tela de 900) e y=1608 (tela de 844). | Bloco principal com patrimônio, resultado em R$ e % e variação do dia, em largura total no celular. Reduzir cabeçalho e faixa de mercado acima dele. |
| D-2 | **Não há modo escuro.** | `color-scheme: light` fixo em `globals.css:3787`, sem `prefers-color-scheme`. Com o sistema escuro, as cores calculadas continuam iguais. São 549 cores literais no CSS, contra 20 usos de `var()`, além de cores fixas em `performance-chart.tsx` e `purchase-markers.tsx`. | Criar tokens semânticos e depois o tema escuro, mantendo a identidade do tema claro (D6). |

### 4.2 Importante

| ID | Achado | Evidência | Proposta |
|---|---|---|---|
| D-3 | Visão geral longa. Oito blocos antecedem a curva. | Celular: 6035 px, 7,2 telas; carteira, 8,1 telas. Gráfico em y=1530 e y=2280, contra 514 e 770 registrados na auditoria de 27/10. | Mostrar valor e gráfico primeiro. Mover explicações para "detalhes". |
| D-4 | Duas tipografias e dependência externa. | `@import` do Google Fonts em `globals.css:1` para DM Sans e Manrope. O corpo usa `system-ui`, mas os números principais usam Manrope (`.stat-value`, `.donut b`). Georgia em `globals.css:855`. | Usar só a fonte do sistema e remover o `@import`. Também evita chamar o Google a cada abertura. |
| D-5 | Números desalinhados. | `.market-strip b` e `.allocation-legend b` sem `tabular-nums`. Casas decimais variam na mesma coluna: "31,1%" ao lado de "30,78%". | Formatador único em pt-BR, com casas fixas por coluna. |
| D-6 | Tabelas ruins no celular. A coluna fixa ocupa cerca de 40% da largura e Investido, Saldo e Resultado ficam fora da tela. | `mobile-claro-carteira.png`. O aviso "Deslize…" se repete em cada seção. | Lista em cartões com ticker, saldo e resultado, com detalhes ao tocar. |
| D-7 | Estados incompletos. | I7 e I10. Modo demonstração só aparece com a carteira vazia (`dashboard.tsx:1033`). Convite inicial abaixo do gráfico (`dashboard.tsx:1019`). Faixa de mercado e detalhe do ativo sem marca de cotação desatualizada (`dashboard.tsx:762`, `dashboard.tsx:2169`). | Tratar carregando, vazio, parcial e erro em cada bloco. Permitir abrir a demonstração a qualquer momento. |
| D-8 | Sinal além da cor incompleto. Percentuais têm seta e sinal, mas valores em dinheiro não têm "+". Zero aparece como ganho. | `asset-table.tsx:324`, `currency-summary.tsx:133`, `cost-return.tsx:39`. `.negative` definido duas vezes com `!important` (`globals.css:105`, `globals.css:3885`). | Sinal explícito e estado neutro para zero. |
| D-9 | Contraste de elementos gráficos abaixo de 3:1. | Renda fixa `#b7c9b2` com 1,75:1 e cripto `#d7a65d` com 2,21:1 sobre branco, no donut e nas barras. | Ajustar só o tom desses segmentos ou separá-los com contorno. |
| D-10 | Três estilos para a mesma função no mesmo painel. | Modo em abas sublinhadas, período em botões, filtro em chips. | Um único controle segmentado para escolhas exclusivas. |
| D-11 | Elementos truncados no celular. | Faixa de mercado corta o Bitcoin sem indicar rolagem. Aviso de demonstração em coluna estreita. Três botões com 38–39 px de altura. | Faixa rolável com indicação, aviso em largura total, botões com 44 px. |

### 4.3 Melhoria

| ID | Achado | Evidência |
|---|---|---|
| D-12 | Grade de espaçamento irregular. | Entre 57% e 80% dos valores medidos são múltiplos de 4 px, conforme a página. O CSS tem 6112 linhas, com camadas sobrepostas e 39 `!important`. |
| D-13 | Eixo do gráfico pouco legível. | Marcas 44,9%, 29%, 14% e −1%. O domínio força valores negativos mesmo em curva toda positiva (`performance-chart.tsx:502`). |
| D-14 | "Ativos no radar" ignora o que você tem. | Mostra os 5 primeiros de `ASSETS` (`asset-table.tsx:74`). |
| D-15 | "Seus ativos" lista 23 linhas, incluindo as não possuídas, com "PM R$ 0,00". | Sugiro iniciar em "Em carteira". |
| D-16 | Controle de pontos de compra aparece mesmo com 0 compras. | `performance-chart.tsx:438-457`. |

### 4.4 O que já está bom

- **Contraste AA:** nenhuma falha de texto nas 4 páginas, nos 2 tamanhos, no modo claro.
- **Áreas de toque:** 44 px em todos os alvos medidos, exceto os 3 de D-11.
- **Teclado:** 25 paradas de Tab, todas com foco visível. Menu com captura de foco e Escape.
- **Acessibilidade:** um `h1` por página, `main`, `nav`, link para pular conteúdo e `scope` em quase todas as células de cabeçalho.
- **Preferências:** movimento reduzido sem animações ativas, além de suporte a maior contraste, menor transparência e cores forçadas.
- **Tamanhos:** fontes em `rem`, respeitando o tamanho de texto do navegador, com mínimo de 12 px.

Molas, gestos e projeção de movimento do guia Apple não se aplicam: o site não tem arraste. Não proponho acrescentá-los só para cumprir o estilo.

## 5. Plano da importação (Camada 1)

### 5.1 O que já sei sobre os formatos

| Arquivo | Situação | Consequência |
|---|---|---|
| B3 Negociação e Movimentação (Excel) | Nenhuma fonte pública lista os cabeçalhos. De memória, espero `Data do Negócio`, `Tipo de Movimentação`, `Mercado`, `Instituição`, `Código de Negociação`, `Quantidade`, `Preço`, `Valor` e, na Movimentação, `Entrada/Saída`, `Data`, `Movimentação`, `Produto`, `Instituição`, `Quantidade`, `Preço unitário`, `Valor da Operação`. **Não verificado.** | Validar com o arquivo real antes de escrever o parser. |
| Nota do BTG | Sinacor é o sistema de origem, mas cada corretora emite a nota do seu modo. Taxas ficam no resumo financeiro. | Validar com nota real. |
| Nota da Nu Invest | **Contraria a premissa do pedido.** Uma fonte de terceiros afirma que a Nubank emite por padrão notas fora do padrão Sinacor. | Provavelmente exige um segundo layout. Preciso de uma nota real. |
| Nomad | Sem documentação do formato. O site cita relatórios por ano e relatórios auxiliares. A custódia remunerada gera lançamentos próprios, com imposto retido. | Só posso definir o parser com um arquivo real. |

### 5.2 Fluxo

1. **Escolher arquivos.** O tipo é detectado pelos cabeçalhos, não pelo nome.
2. **Ler no navegador.** O arquivo não sai do seu aparelho e não é guardado. PDF com senha pede a senha na hora, sem armazená-la.
3. **Mostrar a prévia:** adicionar, complementar taxas, duplicado, ignorado e precisa de decisão. Evento desconhecido nunca é descartado em silêncio.
4. **Confirmar.** Só aqui ocorre a gravação, pela rota atual e com controle de revisão.
5. **Oferecer desfazer** e backup antes de aplicar.

Bibliotecas propostas, carregadas sob demanda: `pdfjs-dist` para PDF e um leitor pequeno de Excel. Não usarei o pacote `xlsx` do npm, que está defasado, nem incorporarei `parser-de-notas-de-corretagem`, que é GPLv3 e pode servir só de referência.

### 5.3 Mapeamento da Movimentação

Os rótulos abaixo também precisam de confirmação no arquivo real.

| Evento | Tratamento |
|---|---|
| Dividendo, Juros Sobre Capital Próprio, Rendimento | `Income`. Verificar se o JCP vem líquido. |
| Transferência - Liquidação | Ignorar: é a liquidação do negócio que já vem na Negociação. Serve como conferência. |
| Desdobro, Grupamento | Evento societário: ajusta a quantidade e preserva o custo. |
| Bonificação em Ativos | Aumenta a quantidade. O custo unitário vem do arquivo ou é pedido a você. |
| Atualização, Incorporação, troca de ticker | Evento societário: renomeia e preserva o histórico. |
| Fração em Ativos, Leilão de Fração | Venda de fração. |
| Empréstimo, direitos de subscrição, outros | Precisa de decisão na prévia. |

Códigos do mercado fracionário, como `WEGE3F`, são normalizados para `WEGE3`.

### 5.4 Deduplicação

A chave que você pediu (data, ticker, tipo, quantidade, preço, instituição) é a base, mas sozinha ela falha em quatro casos reais:

| Caso | Risco | Regra proposta |
|---|---|---|
| Duas execuções idênticas no mesmo dia | Uma seria apagada como duplicata. | Acrescentar o número da ocorrência à chave. Reimportar o mesmo arquivo gera os mesmos IDs. |
| B3 lista execuções e a nota pode consolidar | B3 e nota não casam linha a linha. | Agrupar por data, ticker, tipo e instituição e comparar soma de quantidade e valor, com tolerância de centavos. Havendo casamento, a nota só **complementa as taxas**, rateadas por valor. |
| Registros antigos sem instituição | Primeira importação duplicaria o histórico atual. | Casar ignorando a instituição e mostrar como "provável duplicado" para você decidir. |
| Proventos "Acumulado anterior" | Importar pagamentos antigos contaria duas vezes. | Pagamentos com data até a do acumulado vêm marcados como "já incluído", e por padrão são ignorados. |

### 5.5 Mudanças de modelo (proposta para aprovação)

```ts
type Portfolio = {
  // campos atuais preservados
  schemaVersion?: 4;
  customAssets?: CustomAsset[];
  corporateActions?: CorporateAction[];
};
type CustomAsset = {
  ticker: string; symbol: string; name: string;
  group: Group; currency: Currency; sector: string;
  archived?: boolean; // ativo encerrado, sem exigir cotação
};
type CorporateAction = {
  id: string; ticker: string; date: string;
  kind: "split" | "bonus" | "rename";
  factor?: number; newTicker?: string; unitCost?: number; source: string;
};
// TradeEvent ganha: institution?, feesCurrency?, importKey?
// Income ganha: source?, institution?, importKey?, type?, withheldTax?
```

- **`source`:** `tipo-de-arquivo|instituição|data`, como `b3-negociacao|BTG|2026-11-06`. `Income` não tem esse campo hoje, e o validador descartaria o valor em silêncio.
- **Taxas em USD:** hoje toda taxa é tratada como real. A Nomad exige `feesCurrency`.
- **Câmbio:** `fx` só é preenchido quando o arquivo liga a remessa à operação. Caso contrário fica pendente e nunca é presumido.
- **Validação:** `ticker` passa a aceitar também `customAssets`. A regra de cota inteira continua na B3, com tratamento para fração vinda de evento societário.
- **Cadastro de ativo:** formulário na prévia com ticker, classe, moeda e símbolo do Yahoo, testando o símbolo antes de salvar. A lista de cotações do servidor passa a incluir esses ativos, com o símbolo validado por expressão regular.
- **Compatibilidade:** `migratePortfolio` converte backups antigos ao carregar, com testes usando um backup fictício da versão 3. Os limites atuais (2 MB, 10 mil eventos) devem ser suficientes, mas a prévia avisa se forem atingidos.
- **Evento societário e curva:** o histórico de preço do Yahoo já vem ajustado por desdobro, então a curva precisa reexpressar quantidades antigas no mesmo fator. Vou validar também com bonificações.

### 5.6 Testes

Fixtures fictícias em `tests/fixtures`, geradas por script, imitando apenas a estrutura dos arquivos reais. Haverá testes de cada parser, cada regra de deduplicação, reimportação idempotente, migração e aplicação da prévia.

### 5.7 Camada 2

Conforme sua ordem, a pesquisa de Pluggy, Belvo, APIs oficiais e limites do ChatGPT Sites fica para depois de você ver a Camada 1 funcionando. Vou parar nesse ponto e esperar sua escolha.

## 6. Como reproduzir

```bash
node --experimental-strip-types --no-warnings tests/auditoria-calculos.mjs
```

```bash
node --experimental-strip-types --no-warnings tests/auditoria-divergencias.mjs
```

Antes das correções, o segundo falhava de propósito em 20 testes, mostrando o valor exibido e o correto. Agora os dois passam. `npm test` roda todos.

**Linha de base antes das mudanças:** os 8 arquivos de teste existentes e `npx tsc --noEmit` passavam. `npm run lint` tinha 33 erros e 17 avisos.

## 7. Decisões

Todas as recomendações abaixo foram aprovadas. Na D7 a resposta sobre day trade não veio explícita, e segui sem day trade: se você faz, o preço médio precisa separar as operações do dia.

| ID | Pergunta | Recomendação | Por quê |
|---|---|---|---|
| D1 | Qual é a fonte da posição? (A) `tradeHistory` como fonte única, com migração explícita. (B) Manter `transactions` e fazer o importador recalcular uma posição conciliada. | **A** | Resolve C1, I1 e I2 pela causa. B muda menos código, mas mantém duas fontes que podem divergir. |
| D2 | Em venda parcial, o que acontece com os proventos? (A) Reduzir na mesma proporção do custo. (B) Manter todos. | **A** | Com B, vender 90% de uma posição pode mostrar +100% sobre o custo restante. Teste D2 já preparado. |
| D3 | O preço médio inclui taxas? | **Sim** | Fica coerente com o Investido exibido ao lado e com a apuração usual de custo de aquisição. Se preferir sem taxas, removo o I5 e só deixo o rótulo claro. |
| D4 | Mostrar lucro realizado? | **Sim, em um número separado** | Quem registra vendas vai querer ver o resultado delas. Mantém o rendimento atual sem misturar os dois. |
| D5 | Aprova o modelo da seção 5.5? Como classificar FIIs? | **Sim; FIIs dentro da meta Brasil, com cartão próprio** | Não exige uma quinta meta. Hoje "Ações na B3" seria um rótulo errado para eles. |
| D6 | Implementar modo escuro agora? | **Sim, em commits próprios** | Exige tokens de cor, que também facilitam o resto da revisão. O tema claro não muda. |
| D7 | Você faz day trade? | **Se não, basta ordenar compras antes de vendas no dia** | Se fizer, o preço médio precisa separar as operações do dia, e o escopo aumenta. |

**Ainda preciso de:** arquivos reais em `dados-privados/`: B3 Negociação e Movimentação, uma nota do BTG, uma da Nu Invest e um relatório da Nomad, de preferência com venda, desdobro e dividendo.

## 8. Ordem de execução após aprovação

Cada etapa em commits pequenos, com teste antes de qualquer mudança de cálculo.

| Etapa | Conteúdo | Você vê |
|---|---|---|
| 0 | Isolar os testes de API em um banco local próprio | Nada muda na tela |
| 1 | Correções C1 a M8, com migração se D1 = A | Testes de divergência passando |
| 2 | Design: tipografia, tokens, modo escuro, hierarquia, celular, estados | Capturas antes e depois |
| 3 | Modelo novo, migração e cadastro de ativos | Backup antigo carregando |
| 4 | Importação B3 | **Checkpoint:** prévia funcionando com seus arquivos |
| 5 | Nota de corretagem | **Checkpoint:** taxas complementadas sem duplicar |
| 6 | Nomad | **Checkpoint:** USD e impostos retidos |
| 7 | Comparação com a B3, `tsc`, lint, testes, build e atualização deste documento | Relatório final |
| 8 | Pesquisa da Camada 2 | **Paro e espero sua escolha** |

Não vou alterar `.openai/hosting.json` nem `app/chatgpt-auth.ts`. Os 33 erros de lint existentes ficam fora do escopo, salvo os que estiverem em linhas que eu precise mudar.

## 9. Fontes consultadas

- [Dados públicos do CDI no Banco Central, série 12](https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json): usados para confirmar a defasagem de publicação em I3.
- [Contrato de LIG do Bradesco](https://banco.bradesco/assets/classic/pdf/produtos-servicos/Aditivo_Anexo_III_LIG_2_Programa_Bradesco.pdf): descreve o uso da taxa DI com um dia útil de defasagem, base de M4. Não encontrei o documento de metodologia da própria B3.
- [parser-de-notas-de-corretagem, README](https://unpkg.com/parser-de-notas-de-corretagem@0.14.80/README.md): notas da Nubank fora do Sinacor, licença GPLv3. Fonte de terceiros, com suporte à Nubank marcado como em teste.
- [Parser de Negociação da B3, luiznaac/portfolio-2](https://github.com/luiznaac/portfolio-2/pull/197): normalização de tickers com sufixo `F`.
- [b3-excel-parse](https://github.com/PedroAugustoRamalhoDuarte/b3-excel-parse): alerta para cisão, fração, subscrição e leilão.
- [SINACOR-PARSER](https://github.com/vcolella/SINACOR-PARSER) e [SINACOR na Mais Retorno](https://maisretorno.com/blog/termos/s/sinacor): origem e variação das notas.
- [Taxa de liquidação, C6 Bank](https://www.c6bank.com.br/blog/taxa-de-liquidacao-b3): localização das taxas no resumo financeiro.
- [Imposto de Renda na Nomad](https://www.nomadglobal.com/imposto-de-renda) e [Custódia remunerada na Nomad](https://www.nomadglobal.com/portal/artigos/custodia-remunerada-nomad): relatórios e imposto retido.
- [Área do Investidor da B3](https://b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/area-do-investidor/): extratos disponíveis.
- [Importador de Negociação, Sergiovalle3121/quant-trade](https://github.com/Sergiovalle3121/quant-trade/pull/327): `Data do Negócio`, `Tipo de Movimentação`, `Instituição` e sufixo `F` vêm de importadores de arquivos reais; `Mercado` e `Código de Negociação` são inferidos.
- [Importação da Movimentação em CSV, DanielPitthan/OrcaFacil](https://github.com/DanielPitthan/OrcaFacil/issues/30) e [reconciliação em DavidSilva32/investlab](https://github.com/DavidSilva32/investlab/issues/212): colunas do extrato, formato CSV e divergência sobre `Transferência - Liquidação`.
- [Relatórios auxiliares da B3, Warren](https://faq.warren.com.br/hc/pt-br/articles/34668377679515-Como-encontrar-os-relat%C3%B3rios-auxiliares-da-B3-para-a-minha-declara%C3%A7%C3%A3o-de-imposto-de-renda) e [material de IR da B3](https://midia.b3.com.br/aIVRig): campos da Movimentação e coluna `Valor da Operação`.
- API de gráficos do Yahoo Finance, consultada em 06/11/2026: horários reais das barras em I4. É uma interface não oficial.

## 10. O que foi feito

### Cálculos

Todas as 20 divergências foram corrigidas, cada uma com teste antes da correção. `tests/auditoria-divergencias.mjs` agora passa inteiro.

| Mudança | Resolve | Commit |
|---|---|---|
| Histórico como fonte única da posição, com migração e aviso de conferência | C1, C2, I1, I2, I8, M1, D1, D2, D7 | `0ac0167` |
| Preço médio com taxas e custo em dólar preservado | I5, I6, D3 | `fd0e157` |
| CDI no acompanhamento real e janela de acumulação | I3, M4 | `d907582` |
| Datas no fuso da bolsa e cotação antiga identificada | I4, M7 | `c6a4799` |
| Donut e proventos sem estado falso | I7, I10 | `549d79d` |
| Planejador sem câmbio antigo e com volatilidade neutra | I9, M3 | `9d687fc` |
| Resultado total com proventos | M2 | `ab6f13b` |
| Simulação na data de Brasília | M5 | `cf1fa41` |
| Formatação pt-BR única e metas reais na metodologia | M6, M8 | `05a3661` |
| Venda manual e resultado realizado à parte | C1, D4 | `c179a57` |

### Design

Medido em 16 telas: 4 páginas, em desktop e celular, nos temas claro e escuro.

| Medição | Antes | Depois |
|---|---|---|
| Modo escuro | Não existia | Segue o sistema |
| Falhas de contraste de texto | 0 no claro, escuro inexistente | 0 nos dois |
| Alvos de toque abaixo de 44 px | 3 | 0 |
| Fontes | Sistema, Manrope, DM Sans e Georgia, com Google Fonts | Só a do sistema |
| Espaçamentos em múltiplos de 4 px | 57% a 80% | 100% |
| Resultado no bloco principal | Não aparecia | Patrimônio, resultado e hoje juntos |
| Gráfico no desktop | y=1530 | y=1096 |
| Gráfico no celular | y=2280 | y=1484 |
| Carteira no desktop, altura | 4979 px | 3649 px |

Capturas em `outputs/revisao/antes`, `outputs/revisao/depois` e `outputs/revisao/importacao`, pasta que o Git ignora. Todas usam dados fictícios.

### Importação da B3 (Camada 1, primeira parte)

Tela "Importar movimentações", com Excel e CSV lidos no navegador, prévia, confirmação, desfazer, cadastro de ativo na própria prévia, modelo da seção 5.5 e migração. Testada em `tests/importacao.mjs`, `tests/ativos.mjs` e `tests/ledger.mjs`, e no navegador com planilhas fictícias e gravação interceptada: nenhuma gravação antes de confirmar, e reimportar deu 0 a adicionar.

## 11. O que ficou pendente

1. **Validar com arquivos reais.** Sem `dados-privados/`, os cabeçalhos e rótulos da B3 vêm de importadores abertos e não foram confirmados. Em especial: se o JCP vem líquido, como Desdobro e Grupamento aparecem, e se o Yahoo ajusta o histórico por bonificação.
2. **Comparação com a B3 (seção 3.5).** Depende dos mesmos arquivos.
3. **Migração sobre a sua carteira.** Não li seus dados para testar. Na primeira abertura, se alguma quantidade mudar, um aviso lista cada ativo com o valor antes e depois. Se aparecer, confira antes de salvar qualquer coisa.
4. **Nota de corretagem e Nomad (etapas 5 e 6).** Não iniciadas, conforme o checkpoint. Dependem de arquivos reais.
5. **Camada 2 (etapa 8).** Não iniciada, conforme sua ordem.
6. **Eventos que dependem de você na prévia.** Atualização, incorporação, subscrição e leilão de fração são mostrados, mas não aplicados. Falta interface para registrar troca de ticker à mão e para excluir evento societário importado depois de sair da tela. Vou definir isso com o arquivo real.
7. **Altura no celular.** O conteúdo principal subiu, mas a página total não encurtou: visão geral de 6035 para 6189 px e carteira de 6853 para 7553 px, porque os cartões mostram mais dados à vista. Sugiro recolher os detalhes de cada cartão.
8. **Notícias.** Ativos cadastrados ainda não aparecem nos filtros de notícias.
9. **Não testado:** site publicado, aparelho físico, VoiceOver e zoom de 200%.
10. **Lint.** Restam erros anteriores a esta revisão, fora do escopo. Os números finais estão na seção 12.
11. **Publicação.** Nada foi publicado. O checkout não tem remote, e `.openai/hosting.json` e `app/chatgpt-auth.ts` não foram alterados.

## 12. Verificação final

Executada ao fim desta etapa, na ordem pedida.

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | Passa |
| `npm run lint` | 32 erros e 6 avisos, contra 33 e 17 antes. Nenhum nos arquivos novos |
| `npm test` | 12 de 12 arquivos, incluindo as 21 verificações de divergência |
| `npm run test:api` | 2 de 2, em banco temporário. O banco local não mudou, conferido por soma de verificação |
| `npm run build` | Passa |
