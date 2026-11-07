# Publicar na Cloudflare

O site roda em uma conta Cloudflare própria: Workers, banco D1 e login pelo Cloudflare Access. Nada de valor secreto ou pessoal fica neste repositório, que é público. O `database_id` em `wrangler.jsonc` identifica o banco, mas não dá acesso a ele.

## Primeira publicação

1. **Entrar na conta:** `npx wrangler login`.
2. **Escolher o subdomínio:** o endereço do site será `atlas-carteira.<subdomínio>.workers.dev`. Em **Workers & Pages**, confira o subdomínio antes de publicar. A Cloudflare pode criar um a partir do seu e-mail, e o `wrangler` não troca um subdomínio existente: use **Edit** no painel.
3. **Criar o banco:** `npx wrangler d1 create atlas-carteira`. Copie o `database_id` para `wrangler.jsonc`.
4. **Criar as tabelas:** `npm run db:migrate`.
5. **Publicar:** `npm run deploy`. Sem as variáveis do passo 10, o site recusa todo mundo. É o esperado.
6. **Ativar o Zero Trust:** no Worker, aba **Access**, escolha **Set up Zero Trust**. O plano Free custa US$ 0, mas a Cloudflare exige cartão ou PayPal e autorização de cobrança pelo uso acima dos limites grátis.
7. **Escolher o nome do time:** a ativação pode criar um nome automático. Para trocar, use **Zero Trust > Settings > Team domain** e depois atualize o nome em **Reusable components > Custom pages > Access login page**. Faça isso antes do passo 10.
8. **Criar a política:** em **Access controls > Policies > Add a policy**, use a ação **Allow** e a regra **Emails** com o seu e-mail exato. Não use as opções prontas: **Email domain** com um domínio público, como o Gmail, liberaria qualquer conta dele na política.
9. **Ligar o login:**
   - No Worker, aba **Access**, escolha **Protect this Worker behind Access**, com **All traffic** e a política do passo 8.
   - Em **Integrations > Identity providers**, adicione **One-time PIN** para entrar com código por e-mail. Sem isso, a tela só oferece a conta Cloudflare.
10. **Configurar as variáveis** como segredos, uma por comando, com `npx wrangler secret put NOME`:

    | Nome | Valor |
    |---|---|
    | `CF_ACCESS_TEAM_DOMAIN` | Nome do time, como `minha-equipe` |
    | `CF_ACCESS_AUD` | **AUD tag**, na aba **Access** do Worker |
    | `ATLAS_ALLOWED_EMAILS` | Os e-mails autorizados, separados por vírgula |

11. **Conferir:** abra o site em uma janela anônima. Ele deve pedir o login antes de mostrar qualquer coisa.
12. **Levar a carteira:** faça login e use **Estratégia e metas > Importar backup**.

## Publicações seguintes

```bash
npm run deploy
```

Se houver migração nova em `drizzle/`, rode `npm run db:migrate` antes.

## Como o login funciona

O Access barra quem não está autorizado antes de a página abrir. Depois, `app/lib/access-token.ts` confere a assinatura do token, o time, a aplicação, a validade e o e-mail. Sem configuração completa, ninguém entra.

Quem trocar o nome do time ou recriar a aplicação no Access precisa atualizar `CF_ACCESS_TEAM_DOMAIN` e `CF_ACCESS_AUD`. Enquanto os valores estiverem diferentes, o site recusa todo mundo.

No servidor de desenvolvimento (`npm run dev`), o login é simulado pelo cookie `atlas_dev_user`. Esse caminho não existe no build de produção.

## Custos

O plano grátis de Workers limita cada requisição a 10 ms de CPU. Se aparecer o erro 1102, ou se a rota de cotações falhar com frequência, o plano pago custa US$ 5 por mês e resolve o limite.

## Voltar atrás

Backups ficam fora do repositório. Para voltar a um estado anterior, use **Importar backup** com o arquivo desejado. Para voltar a uma versão anterior do código, use `npx wrangler rollback`.
