# Atlas · Minha carteira

Painel privado de investimentos em português, com posições e estratégia vinculadas ao seu login e persistidas em Cloudflare D1.

## O que está pronto

- 14 ações BR: ALUP11, WEGE3, ITUB4, KLBN4, KLBN11, EGIE3, BPAC11, BBSE3, PSSA3, TUPY3, LEVE3, FESA4, VALE3, PRIO3.
- ETFs internacionais VOO, SPHQ, VEA, VNQ, IAU e VWO; ABTC11 e AUPO11 na B3; Bitcoin direto.
- AUPO11 classificado em renda fixa e ABTC11 em exposição cripto para as metas.
- Custos, saldos, proventos e resultados por moeda de origem; conversão do saldo em USD para BRL exibida à parte.
- Proventos acumulados ou novos pagamentos por ativo, sem duplicar o patrimônio.
- Extratos de referência preservados com os valores recebidos e observações de reconciliação.
- S&P 500, Ibovespa, USD/BRL como referências.
- Tema claro e escuro, que segue o sistema, com a fonte do sistema e sem chamadas ao Google Fonts.
- Importar movimentações: relatórios de Negociação e Movimentação da B3, em Excel ou CSV, e extratos mensais da Nomad, em PDF, lidos no navegador. O arquivo não é enviado nem guardado, e nada é gravado antes da sua confirmação. Reimportar não duplica.
- Dividendos da Nomad ficam pelo valor líquido, com o imposto retido à parte. Os extratos não trazem o câmbio das remessas, que nunca é presumido.
- Ativos fora da lista padrão, como FIIs, são cadastrados pela interface. FIIs entram na meta Brasil, com cartão próprio.
- Desdobramentos, grupamentos, bonificações e trocas de ticker ajustam quantidade e preço médio.
- Filtro de rendimento: tudo agregado, ações/ETFs americanos, ações na B3 e Bitcoin direto. O modo padrão Desde o preço médio inclui o resultado acumulado anterior ao cadastro: (saldo − custo + proventos) / custo, ponderado pelo capital investido. Custos exatos do extrato e taxas são preservados.
- O histórico de compras e vendas é a fonte da quantidade e do custo. Posição inicial vale como posição na data de referência; o que veio antes dela já está incluído. Vendas parciais reduzem o custo e os proventos pelo preço médio; posições e ciclos encerrados ficam fora do rendimento em carteira e aparecem em Resultado realizado. Backups antigos são migrados ao carregar, com aviso se alguma quantidade mudar.
- O preço médio inclui as taxas, como o valor investido exibido ao lado.
- Pontos de compra com botão liga/desliga, agrupados por data, detalhes de quantidade/preço/total e tabela acessível. Usa a data do extrato, sem inferir horário de execução.
- Curva retroativa pelo preço médio com cotações históricas sem ajuste por dividendos, quando disponíveis. Posições iniciais são reconstruídas pelas quantidades cadastradas; compras com datas conhecidas entram na data informada. Proventos acumulados entram na data de referência. A janela do gráfico não zera o acumulado. A curva é uma estimativa, separada das observações reais.
- No modo pelo preço médio, o grupo americano usa USD, B3 e Bitcoin usam BRL. O consolidado preserva o câmbio registrado; conversões sem câmbio de compra/recebimento usam o dólar da data avaliada e aparecem como estimativa, sem ganho cambial histórico. Renda fixa sem capital inicial fica fora do percentual, com cobertura indicada; saldos manuais conhecidos entram apenas no acumulado, sem curva diária inventada.
- Acompanhamento real e simulação permanecem disponíveis em BRL, com aportes e proventos isolados por grupo. O histórico real anterior ao registro por grupo continua no consolidado.
- Notícias por mercado (incluindo Bolsa brasileira) e por ativo, com buscas alternativas pelo nome ou ticker. Filtro Bolsa brasileira também na tabela de ativos, incluindo ações e ETFs negociados na B3.
- Metas iniciais: Brasil 35%, renda fixa 35%, exterior 22%, Bitcoin 8%.
- Registro de posição inicial e compra com quantidade, preço, câmbio e taxas.
- Cadastro e atualização manual de títulos de renda fixa.
- Patrimônio consolidado em BRL; totais Brasil e exterior separados; custos em USD preservados mesmo sem câmbio de compra. Custo histórico em reais permanece pendente quando não informado.
- Planejador de aportes por déficits de alocação, com ajuste moderado por volatilidade e tendência; pesos de ativos editáveis.
- Notícias por ativo, backup JSON, restauração validada, modo demonstração sem gravação real.
- Isolamento dos registros por identidade autenticada; revisão otimista para evitar sobreposição entre abas.

## Atualização e limites

A interface consulta o Yahoo Finance a cada 60 segundos enquanto a aba está visível. A fonte pode fornecer dados atrasados, ser bloqueada ou ficar indisponível; não há garantia de tempo real de bolsa. A interface usada não é uma API pública documentada do Yahoo. Para uma operação com garantias e disponibilidade contratual, substitua por um provedor licenciado. Nunca configure chaves no navegador.

Notícias via Google Notícias RSS, com Bing Notícias e Yahoo Finance como alternativas, com cache de 5 minutos e links para a publicação. Renda fixa exige atualização manual pelo extrato. O resultado por ativo inclui os proventos registrados, que não são somados novamente ao saldo em custódia. Vendas ficam à parte, em Resultado realizado. Impostos não são calculados. O gráfico de referências não representa a rentabilidade da carteira.

As sugestões não usam análise de fundamentos, valor justo, risco de crédito ou perfil pessoal, não executam ordens e não garantem retorno. A fórmula e as fontes estão disponíveis na própria interface.

As posições reais são registros privados no banco de dados e não são incluídas no código nem no arquivo de publicação. Importações preservam os custos exatos do extrato mesmo quando o preço médio está arredondado. O câmbio atual não preenche o custo histórico. Capital inicial de títulos de renda fixa pode ficar desconhecido. O modo demonstração contém posições fictícias.

## Desenvolvimento e verificação

- `npm run dev -- --port 5182`
- `npx tsc --noEmit`
- `npm test`: todos os testes que não dependem de servidor.
- `npm run test:api`: testes de API em um banco local temporário, apagado no fim. Eles não usam `.wrangler/state`.
- `npm run lint` e `npm run build`

Publicação: `npm run db:migrate` e `npm run deploy`, numa conta Cloudflare própria. O passo a passo está em `PUBLICAR.md`. A prévia local tem banco próprio. A pasta `dados-privados/` é ignorada pelo Git: arquivos reais ficam nela e nunca entram em código, testes ou commits.
