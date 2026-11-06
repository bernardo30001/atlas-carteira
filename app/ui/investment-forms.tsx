"use client";
import { ValidatedForm, FormInput } from "./validated-form";
import { useState } from "react";
import { saleIssue } from "../lib/trade-history";
import { Check, Trash2 } from "lucide-react";
import {
  allAssets,
  today,
  wholeUnits,
  type Portfolio,
  type TradeEvent,
  type Transaction,
  type FixedIncome,
  type Income,
  type Market,
  type Currency,
} from "../lib/model";
export function TransactionForm({
  ticker,
  quantity,
  initialKind = "buy",
  portfolio,
  market,
  busy,
  onSubmit,
  onSell,
}: {
  ticker?: string;
  quantity?: number;
  initialKind?: "buy" | "sell";
  portfolio: Portfolio;
  market: Market;
  busy: boolean;
  onSubmit: (t: Transaction) => Promise<void>;
  onSell: (sale: TradeEvent) => Promise<void>;
}) {
  const assets = allAssets(portfolio).filter((a) => !a.archived);
  const [selected, setSelected] = useState(ticker ?? assets[0].ticker),
    [kind, setKind] = useState<"buy" | "opening" | "sell">(initialKind),
    [currency, setCurrency] = useState<Currency>(
      ticker === "BTC"
        ? "BRL"
        : (assets.find((a) => a.ticker === ticker)?.currency ?? "BRL"),
    ),
    [error, setError] = useState("");
  const a = assets.find((a) => a.ticker === selected) ?? assets[0];
  return (
    <>
      <span className="eyebrow">CONSTRUA SEU PATRIMÔNIO</span>
      <h2 id="modal-title">Registrar investimento</h2>
      <p>
        Registre na moeda efetivamente usada. O custo em dólar permanece em
        dólar.
      </p>
      <ValidatedForm
        busy={busy}
        onValidSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const f = new FormData(e.currentTarget),
            qty = Number(f.get("quantity")),
            price = Number(f.get("price")),
            fx =
              currency === "BRL" ? 1 : f.get("fx") ? Number(f.get("fx")) : null,
            fees = Number(f.get("fees") ?? 0),
            date = String(f.get("date")),
            costNative = f.get("costNative")
              ? Number(f.get("costNative"))
              : undefined;
          if (
            !(qty > 0 && price > 0 && fees >= 0) ||
            (fx !== null && fx <= 0) ||
            date > today() ||
            (wholeUnits(a) && !Number.isInteger(qty))
          ) {
            setError(
              "Confira os valores e a data. Ativos da B3 usam quantidades inteiras.",
            );
            return;
          }
          if (kind === "sell") {
            const sale: TradeEvent = {
              id: crypto.randomUUID(),
              ticker: selected,
              kind: "sell",
              quantity: qty,
              price,
              total: costNative ?? qty * price,
              currency,
              fx,
              fees,
              date,
              source: "Registro no Atlas",
            };
            const issue = saleIssue(portfolio, sale);
            if (issue) {
              setError(issue);
              return;
            }
            await onSell(sale);
            return;
          }
          await onSubmit({
            id: crypto.randomUUID(),
            ticker: selected,
            kind,
            quantity: qty,
            price,
            fx,
            fees,
            date,
            note: String(f.get("note") ?? ""),
            currency,
            ...(costNative !== undefined ? { costNative } : {}),
          });
        }}
      >
        <div className="segmented" role="group" aria-label="Tipo de registro">
          <button
            type="button"
            aria-pressed={kind === "buy"}
            className={kind === "buy" ? "active" : ""}
            onClick={() => setKind("buy")}
          >
            Novo aporte
          </button>
          <button
            type="button"
            aria-pressed={kind === "sell"}
            className={kind === "sell" ? "active" : ""}
            onClick={() => setKind("sell")}
          >
            Venda
          </button>
          <button
            type="button"
            aria-pressed={kind === "opening"}
            className={kind === "opening" ? "active" : ""}
            onClick={() => setKind("opening")}
          >
            Posição que já tenho
          </button>
        </div>
        <label className="field">
          Ativo
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const aa = assets.find((x) => x.ticker === e.target.value)!;
              setCurrency(aa.ticker === "BTC" ? "BRL" : aa.currency);
            }}
          >
            {assets.map((a) => (
              <option key={a.ticker} value={a.ticker}>
                {a.ticker} · {a.name}
              </option>
            ))}
          </select>
        </label>
        {selected === "BTC" && (
          <label className="field">
            {kind === "sell" ? "Moeda da venda" : "Moeda do custo de compra"}
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="BRL">Real · BRL</option>
              <option value="USD">Dólar · USD</option>
            </select>
          </label>
        )}
        <div className="form-grid">
          <label className="field">
            Quantidade
            <FormInput
              key={selected}
              name="quantity"
              type="number"
              min={wholeUnits(a) ? 1 : 0.00000001}
              step={
                wholeUnits(a) ? 1 : a.ticker === "BTC" ? 0.00000001 : 0.000001
              }
              defaultValue={quantity}
              required
              placeholder="0"
            />
          </label>
          <label className="field">
            {kind === "opening"
              ? "Preço médio"
              : kind === "sell"
                ? "Preço de venda"
                : "Preço unitário"}{" "}
            ({currency})
            <FormInput
              key={selected + currency}
              name="price"
              type="number"
              min="0.00000001"
              step="any"
              required
              placeholder="0,00"
            />
          </label>
          <label className="field">
            {kind === "opening"
              ? "Data de referência"
              : kind === "sell"
                ? "Data da venda"
                : "Data da compra"}
            <FormInput
              type="date"
              name="date"
              max={today()}
              defaultValue={today()}
              required
            />
          </label>
          <label className="field">
            Taxas em reais
            <FormInput
              type="number"
              name="fees"
              min="0"
              step="0.01"
              defaultValue="0"
              required
            />
          </label>
        </div>
        {kind === "opening" && (
          <label className="field">
            Valor investido exato ({currency}) · opcional
            <FormInput
              name="costNative"
              type="number"
              min="0"
              step="0.01"
              placeholder="Use o custo do extrato, se o preço médio estiver arredondado"
            />
          </label>
        )}
        {currency === "USD" && (
          <label className="field">
            {kind === "sell"
              ? "Câmbio da venda (R$ por US$) · opcional"
              : "Câmbio efetivamente pago (R$ por US$) · opcional"}
            <FormInput
              type="number"
              step="any"
              min="0.000001"
              name="fx"
              placeholder="Deixe vazio se não souber"
              hint="O câmbio atual converte o saldo, mas não será usado como custo histórico."
            />
          </label>
        )}
        {kind !== "sell" && (
          <label className="field">
            Observação · opcional
            <FormInput
              name="note"
              maxLength={500}
              placeholder="Ex.: aporte do mês"
            />
          </label>
        )}
        {kind === "sell" && (
          <p className="form-note">
            A venda reduz a quantidade e o custo pelo preço médio. O lucro
            aparece à parte, em Resultado realizado.
          </p>
        )}
        {kind === "opening" && (
          <p className="form-note">
            O registro inicial preserva sua posição atual e não reconstrói as
            compras anteriores. Preencha proventos acumulados separadamente.
          </p>
        )}
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Salvando…" : "Salvar na carteira"}
          <Check size={16} />
        </button>
      </ValidatedForm>
    </>
  );
}
export function FixedForm({
  existing,
  busy,
  onSubmit,
  onDelete,
}: {
  existing?: FixedIncome;
  busy: boolean;
  onSubmit: (r: FixedIncome) => Promise<void>;
  onDelete?: () => void;
}) {
  return (
    <>
      <span className="eyebrow">RENDA FIXA</span>
      <h2 id="modal-title">
        {existing ? "Atualizar título" : "Adicionar título"}
      </h2>
      <p>
        Use o saldo do extrato. O valor aplicado pode ficar pendente se você
        ainda não o informou.
      </p>
      <ValidatedForm
        busy={busy}
        onValidSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await onSubmit({
            id: existing?.id ?? crypto.randomUUID(),
            name: String(f.get("name")),
            cost: f.get("cost") ? Number(f.get("cost")) : null,
            value: Number(f.get("value")),
            date: String(f.get("date")),
            updatedAt: String(f.get("updatedAt")),
            ...(f.get("ratePercent")
              ? {
                  ratePercent: Number(f.get("ratePercent")),
                  index: String(f.get("index") ?? "CDI"),
                }
              : { index: String(f.get("index") ?? "CDI") }),
            note: String(f.get("note") ?? ""),
          });
        }}
      >
        <label className="field">
          Nome do título
          <FormInput
            name="name"
            maxLength={100}
            defaultValue={existing?.name}
            required
            placeholder="Ex.: CDB Banco · vencimento 2028"
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Capital investido (R$) · opcional
            <FormInput
              name="cost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={existing?.cost ?? ""}
              placeholder="Não informado"
            />
          </label>
          <label className="field">
            Saldo atual (R$)
            <FormInput
              name="value"
              type="number"
              min="0"
              step="0.01"
              defaultValue={existing?.value}
              required
            />
          </label>
          <label className="field">
            Data de referência do cadastro
            <FormInput
              name="date"
              type="date"
              max={today()}
              defaultValue={existing?.date ?? today()}
              required
            />
          </label>
          <label className="field">
            Data do saldo
            <FormInput
              name="updatedAt"
              type="date"
              max={today()}
              min={existing?.date}
              defaultValue={existing?.updatedAt ?? today()}
              required
            />
          </label>
          <label className="field">
            Percentual do indexador
            <FormInput
              name="ratePercent"
              type="number"
              min="0"
              step="0.01"
              defaultValue={existing?.ratePercent}
              placeholder="Ex.: 120"
            />
          </label>
          <label className="field">
            Indexador
            <FormInput
              name="index"
              maxLength={20}
              defaultValue={existing?.index ?? "CDI"}
              placeholder="CDI"
            />
          </label>
        </div>
        <label className="field">
          Observação
          <FormInput
            name="note"
            maxLength={500}
            defaultValue={existing?.note}
          />
        </label>
        <p className="form-note">
          O saldo é manual. A taxa é uma referência e não substitui o extrato;
          não há cálculo automático sem datas, regras de capitalização e
          impostos.
        </p>
        <button className="button primary full" disabled={busy}>
          {busy ? "Salvando…" : "Salvar título"}
          <Check size={16} />
        </button>
        {onDelete && (
          <button
            type="button"
            className="text-button negative delete-title"
            onClick={onDelete}
          >
            <Trash2 size={14} />
            Excluir título
          </button>
        )}
      </ValidatedForm>
    </>
  );
}
export function IncomeForm({
  ticker,
  portfolio,
  busy,
  onSubmit,
}: {
  ticker?: string;
  portfolio: Portfolio;
  busy: boolean;
  onSubmit: (i: Income) => Promise<void>;
}) {
  const [selected, setSelected] = useState(ticker ?? "PSSA3"),
    [kind, setKind] = useState<"opening" | "payment">("payment");
  const assets = allAssets(portfolio).filter((a) => a.ticker !== "BTC");
  const a = assets.find((a) => a.ticker === selected) ?? assets[0];
  return (
    <>
      <span className="eyebrow">PROVENTOS E DIVIDENDOS</span>
      <h2 id="modal-title">Registrar provento</h2>
      <p>
        O valor entra no resultado do ativo em sua moeda original, sem aumentar
        novamente o patrimônio.
      </p>
      <ValidatedForm
        busy={busy}
        onValidSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await onSubmit({
            id: crypto.randomUUID(),
            ticker: selected,
            amount: Number(f.get("amount")),
            currency: a.currency,
            date: String(f.get("date")),
            kind,
            fx:
              a.currency === "USD"
                ? f.get("fx")
                  ? Number(f.get("fx"))
                  : null
                : 1,
            note: String(f.get("note") ?? ""),
          });
        }}
      >
        <div className="segmented" role="group" aria-label="Tipo de registro">
          <button
            type="button"
            aria-pressed={kind === "payment"}
            className={kind === "payment" ? "active" : ""}
            onClick={() => setKind("payment")}
          >
            Novo pagamento
          </button>
          <button
            type="button"
            aria-pressed={kind === "opening"}
            className={kind === "opening" ? "active" : ""}
            onClick={() => setKind("opening")}
          >
            Acumulado anterior
          </button>
        </div>
        <label className="field">
          Ativo
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {assets.map((a) => (
              <option value={a.ticker} key={a.ticker}>
                {a.ticker} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            Valor total recebido ({a.currency})
            <FormInput
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </label>
          <label className="field">
            {kind === "opening" ? "Acumulado até" : "Data do pagamento"}
            <FormInput
              name="date"
              type="date"
              max={today()}
              defaultValue={today()}
              required
            />
          </label>
        </div>
        {a.currency === "USD" && (
          <label className="field">
            Câmbio do recebimento · opcional
            <FormInput
              name="fx"
              type="number"
              min="0.000001"
              step="any"
              placeholder="Não será presumido"
            />
          </label>
        )}
        <label className="field">
          Observação
          <FormInput
            name="note"
            maxLength={500}
            placeholder="Ex.: dividendos líquidos recebidos"
          />
        </label>
        <button className="button primary full" disabled={busy}>
          {busy ? "Salvando…" : "Salvar provento"}
          <Check size={16} />
        </button>
      </ValidatedForm>
    </>
  );
}
