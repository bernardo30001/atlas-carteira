# Atlas · Minha carteira

Painel privado de investimentos em português, com posições e estratégia vinculadas ao seu login e persistidas em Cloudflare D1.

## O que está pronto

- 14 ações BR: ALUP11, WEGE3, ITUB4, KLBN4, KLBN11, EGIE3, BPAC11, BBSE3, PSSA3, TUPY3, LEVE3, FESA4, VALE3, PRIO3.
- ETFs internacionais VOO, SPHQ, VEA, VNQ, IAU e VWO; ABTC11 e AUPO11 na B3; Bitcoin direto.
- Cada ETF conta na classe a que dá exposição: AUPO11 em renda fixa e ABTC11 em Bitcoin, nas metas, nos resumos e nos filtros.
- Custos, saldos, proventos e resultados por moeda de origem; conversão do saldo em USD para BRL exibida à parte.
- Proventos acumulados ou novos pagamentos por ativo, sem duplicar o patrimônio.
- Extratos de referência preservados com os valores recebidos e observações de reconciliação.
- S&P 500, Ibovespa, USD/BRL como referências.
- Tema claro e escuro, que segue o sistema, só com fontes do sistema e sem chamadas ao Google Fonts. Títulos em fonte serifada.
- Mapa da carteira: cada classe é uma região e cada ativo, um bloco do tamanho do seu peso, colorido pela variação do dia ou pela classe.
- No celular, barra de atalhos na parte de baixo da tela.
- Importar movimentações: relatórios de Negociação e Movimentação da B3, em Excel ou CSV, e extratos mensais da Nomad, em PDF, lidos no navegador. O arquivo não é enviado nem guardado, e nada é gravado antes da sua confirmação. Reimportar não duplica.
- Dividendos da Nomad ficam pelo valor líquido, com o imposto retido à parte. Os extratos não trazem o câmbio das remessas, que nunca é presumido.
- Ativos fora da lista padrão, como FIIs, são cadastrados pela interface. FIIs entram na meta Brasil, com cartão próprio.
- Desdobramentos, grupamentos, bonificações e trocas de ticker ajustam quantidade e preço médio.
- Filtro por classe: tudo, Brasil, renda fixa, exterior e Bitcoin. O resultado sobre o investido inclui o resultado acumulado anterior ao cadastro: (saldo − custo + proventos) / custo, ponderado pelo capital investido. Custos exatos do extrato e taxas são preservados.
- O histórico de compras e vendas é a fonte da quantidade e do custo. Posição inicial vale como posição na data de referência; o que veio antes dela já está incluído. Vendas parciais reduzem o custo e os proventos pelo preço médio; posições e ciclos encerrados ficam fora do rendimento em carteira e aparecem em Resultado realizado. Backups antigos são migrados ao carregar, com aviso se alguma quantidade mudar.
- O preço médio inclui as taxas, como o valor investido exibido ao lado.
- Pontos de compra com botão liga/desliga, agrupados por data, detalhes de quantidade/preço/total e tabela acessível. Usa a data do extrato, sem inferir horário de execução.
- Curva de rentabilidade refeita dia a dia com as compras, vendas, proventos e os preços de cada dia, sem depender de abrir o site. Aportes não contam como ganho, como na cota de um fundo, e a comparação com Ibovespa, S&P 500, CDI e Bitcoin parte da mesma data. Posição sem datas de compra entra na data de referência, pelo valor de mercado. Títulos manuais entram na data do saldo e depois seguem o índice contratado, como estimativa.
- Exterior em dólares; Brasil, renda fixa, Bitcoin e consolidado em reais. Sem o câmbio da remessa, o custo em reais usa o dólar oficial (PTAX) do dia da compra e aparece como estimativa. Renda fixa sem capital inicial fica fora do resultado sobre o investido, com cobertura indicada.
- Gráficos de rentabilidade, patrimônio contra dinheiro aportado, resultado sobre o investido e simulação da composição atual.
- Notícias por mercado (incluindo Bolsa brasileira) e por ativo, com buscas alternativas pelo nome ou ticker. Filtro Bolsa brasileira também na tabela de ativos, incluindo ações e ETFs negociados na B3.
- Metas iniciais: Brasil 35%, renda fixa 35%, exterior 22%, Bitcoin 8%.
- Registro de posição inicial e compra com quantidade, preço, câmbio e taxas.
- Cadastro e atualização manual de títulos de renda fixa.
- Patrimônio consolidado em BRL; totais Brasil e exterior separados; custos em USD preservados mesmo sem câmbio de compra. Custo histórico em reais permanece pendente quando não informado.
- Planejador de aportes com três destinos: carteira inteira, só bolsa BR ou só ETFs americanos. O valor vai primeiro para quem está mais longe da meta, em proporção à própria meta, sem sugerir vendas. Pesos editáveis; sem pesos, a compra mantém a proporção atual da classe. O filtro de preço e fundamentos fica na aba Avaliação.
- Notícias por ativo, backup JSON, restauração validada, modo demonstração sem gravação real.
- Isolamento dos registros por identidade autenticada; revisão otimista para evitar sobreposição entre abas.

## Atualização e limites

A interface consulta o Yahoo Finance a cada 60 segundos enquanto a aba está visível, só para o preço atual. O histórico diário vem à parte, em lotes pequenos, e o histórico do dólar vem da PTAX do Banco Central. A fonte pode fornecer dados atrasados, ser bloqueada ou ficar indisponível; não há garantia de tempo real de bolsa. A interface usada não é uma API pública documentada do Yahoo. Para uma operação com garantias e disponibilidade contratual, substitua por um provedor licenciado. Nunca configure chaves no navegador.

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
