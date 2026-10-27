# Atlas · Minha carteira

Painel privado de investimentos em português, com posições e estratégia vinculadas à conta ChatGPT e persistidas em Cloudflare D1.

## O que está pronto

- 13 ações BR: ALUP11, WEGE3, ITUB4, KLBN4, EGIE3, BPAC11, BBSE3, PSSA3, TUPY3, LEVE3, FESA4, VALE3, PRIO3.
- ETFs SPHQ, VEA, VNQ, IAU, VWO e Bitcoin.
- S&P 500, Ibovespa, USD/BRL como referências.
- Metas iniciais: Brasil 35%, renda fixa 35%, exterior 22%, Bitcoin 8%.
- Registro de posição inicial e compra com quantidade, preço, câmbio e taxas.
- Cadastro e atualização manual de títulos de renda fixa.
- Patrimônio consolidado em BRL, exibição opcional em USD, custo e resultado em posição.
- Planejador de aportes por déficits de alocação, com ajuste moderado por volatilidade e tendência; pesos de ativos editáveis.
- Notícias por ativo, backup JSON, restauração validada, modo demonstração sem gravação real.
- Isolamento dos registros por identidade autenticada; revisão otimista para evitar sobreposição entre abas.

## Atualização e limites

A interface consulta o Yahoo Finance a cada 60 segundos enquanto a aba está visível. A fonte pode fornecer dados atrasados, ser bloqueada ou ficar indisponível; não há garantia de tempo real de bolsa. A interface usada não é uma API pública documentada do Yahoo. Para uma operação com garantias e disponibilidade contratual, substitua por um provedor licenciado. Nunca configure chaves no navegador.

Notícias via Google Notícias RSS, com cache de 5 minutos e links para a publicação. Renda fixa exige atualização manual pelo extrato. O resultado não inclui vendas, dividendos, impostos ou lucro realizado. O gráfico de referências não representa a rentabilidade da carteira.

As sugestões não usam análise de fundamentos, valor justo, risco de crédito ou perfil pessoal, não executam ordens e não garantem retorno. A fórmula e as fontes estão disponíveis na própria interface.

A carteira real começa vazia. Os valores de R$ 3.500 / R$ 3.500 / R$ 2.200 / R$ 800 informados junto das metas não foram importados como posições. O modo demonstração contém apenas posições fictícias.

## Desenvolvimento e verificação

- `npm run dev -- --port 5182`
- `npx tsc --noEmit`
- `node --experimental-strip-types tests/finance.mjs`
- `node tests/api.mjs` (prévia local ativa; usa identidade de desenvolvimento e restaura o estado anterior)

A migração `drizzle/0000_simple_gladiator.sql` é aplicada pela publicação do Sites. A prévia local tem banco próprio. A configuração de publicação fica em `.openai/hosting.json`.
