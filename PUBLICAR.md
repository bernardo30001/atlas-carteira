# Publicar na Cloudflare

O site roda em uma conta Cloudflare própria: Workers, banco D1 e login pelo Cloudflare Access. Nada de valor secreto ou pessoal fica neste repositório, que é público.

## Primeira publicação

1. **Entrar na conta:** `npx wrangler login`.
2. **Criar o banco:** `npx wrangler d1 create atlas-carteira`. Copie o `database_id` para `wrangler.jsonc`.
3. **Criar as tabelas:** `npm run db:migrate`.
4. **Publicar:** `npm run deploy`. Sem as variáveis do passo 6, o site recusa todo mundo. É o esperado.
5. **Ligar o login:** no painel da Cloudflare, abra o Worker `atlas-carteira`, aba **Access**, e escolha **Protect this Worker behind Access**, com **All traffic**. A política deve permitir só o seu e-mail.
6. **Configurar as variáveis** como segredos, uma por comando, com `npx wrangler secret put NOME`:

   | Nome | Valor |
   |---|---|
   | `CF_ACCESS_TEAM_DOMAIN` | Nome do time no Cloudflare One, como `minha-equipe` |
   | `CF_ACCESS_AUD` | Application Audience (AUD) Tag da aplicação no Access |
   | `ATLAS_ALLOWED_EMAILS` | Os e-mails autorizados, separados por vírgula |

7. **Conferir:** abra o site em uma janela anônima. Ele deve pedir o login antes de mostrar qualquer coisa.
8. **Levar a carteira:** faça login e use **Estratégia e metas > Importar backup**.

## Publicações seguintes

```bash
npm run deploy
```

Se houver migração nova em `drizzle/`, rode `npm run db:migrate` antes.

## Como o login funciona

O Access barra quem não está autorizado antes de a página abrir. Depois, `app/lib/access-token.ts` confere a assinatura do token, o time, a aplicação, a validade e o e-mail. Sem configuração completa, ninguém entra.

No servidor de desenvolvimento (`npm run dev`), o login é simulado pelo cookie `atlas_dev_user`. Esse caminho não existe no build de produção.

## Custos

O plano grátis de Workers limita cada requisição a 10 ms de CPU. Se aparecer o erro 1102, ou se a rota de cotações falhar com frequência, o plano pago custa US$ 5 por mês e resolve o limite.

## Voltar atrás

Backups ficam fora do repositório. Para voltar a um estado anterior, use **Importar backup** com o arquivo desejado. Para voltar a uma versão anterior do código, use `npx wrangler rollback`.
