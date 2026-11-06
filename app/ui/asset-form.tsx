"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { money } from "../lib/format";
import type { Asset, Currency, Group, Market } from "../lib/model";
import { FormInput, ValidatedForm } from "./validated-form";

const CLASSES: {
  key: string;
  label: string;
  group: Group;
  segment?: "fii";
  sector: string;
  currency: Currency;
}[] = [
  {
    key: "stock",
    label: "Ação na B3",
    group: "br",
    sector: "Ação",
    currency: "BRL",
  },
  {
    key: "fii",
    label: "FII",
    group: "br",
    segment: "fii",
    sector: "FII",
    currency: "BRL",
  },
  {
    key: "rf",
    label: "ETF de renda fixa na B3",
    group: "rf",
    sector: "ETF BR · renda fixa",
    currency: "BRL",
  },
  {
    key: "etf",
    label: "ETF no exterior",
    group: "etf",
    sector: "ETF no exterior",
    currency: "USD",
  },
  {
    key: "crypto",
    label: "Cripto",
    group: "crypto",
    sector: "Cripto",
    currency: "BRL",
  },
];
const COLORS = [
  "#626b99",
  "#377fc1",
  "#d67e2f",
  "#5a8c64",
  "#1e8ba8",
  "#344c7c",
  "#b6a143",
  "#9f6f57",
];
const colorFor = (ticker: string) =>
  COLORS[[...ticker].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const suggestSymbol = (ticker: string, currency: Currency) =>
  currency === "BRL" ? `${ticker}.SA` : ticker;

/** Cadastro de um ativo fora da lista padrão. O símbolo é testado antes de salvar. */
export function AssetForm({
  initialTicker = "",
  taken,
  busy,
  onSubmit,
}: {
  initialTicker?: string;
  taken: string[];
  busy: boolean;
  onSubmit: (asset: Asset) => Promise<void>;
}) {
  const [ticker, setTicker] = useState(initialTicker),
    [kind, setKind] = useState(/11$/.test(initialTicker) ? "fii" : "stock"),
    [currency, setCurrency] = useState<Currency>("BRL"),
    [symbol, setSymbol] = useState(
      initialTicker ? suggestSymbol(initialTicker, "BRL") : "",
    ),
    [symbolEdited, setSymbolEdited] = useState(false),
    [archived, setArchived] = useState(false),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    [found, setFound] = useState("");
  const choice = CLASSES.find((c) => c.key === kind)!;
  const updateTicker = (value: string) => {
    const next = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setTicker(next);
    setFound("");
    if (!symbolEdited) setSymbol(next ? suggestSymbol(next, currency) : "");
  };
  async function testSymbol() {
    setChecking(true);
    setError("");
    setFound("");
    try {
      const r = await fetch(
        "/api/market?assets=" + encodeURIComponent(`${ticker}:${symbol}`),
      );
      const j = (await r.json()) as Market;
      const q = j.quotes?.[ticker];
      if (!q) {
        setError(`O Yahoo Finance não encontrou o símbolo ${symbol}.`);
        return false;
      }
      setFound(
        `${symbol}: ${money(q.price, q.currency === "USD" ? "USD" : "BRL")}`,
      );
      return true;
    } catch {
      setError("Não foi possível consultar o símbolo agora.");
      return false;
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <span className="eyebrow">NOVO ATIVO</span>
      <h2 id="modal-title">Cadastrar ativo</h2>
      <p>Use para ativos fora da lista padrão, como FIIs.</p>
      <ValidatedForm
        busy={busy}
        onValidSubmit={async (e) => {
          e.preventDefault();
          // O evento perde o formulário depois da espera pelo teste do símbolo.
          const form = e.currentTarget;
          setError("");
          if (!/^[A-Z0-9]{2,12}$/.test(ticker)) {
            setError("Informe o código do ativo, como HGLG11.");
            return;
          }
          if (taken.includes(ticker)) {
            setError("Esse ativo já está cadastrado.");
            return;
          }
          if (!archived && !(await testSymbol())) return;
          const name = String(new FormData(form).get("name"));
          await onSubmit({
            ticker,
            symbol,
            name,
            group: choice.group,
            currency,
            sector: choice.sector,
            color: colorFor(ticker),
            query: `${name} ${ticker}`.slice(0, 100),
            ...(choice.segment ? { segment: choice.segment } : {}),
            ...(archived ? { archived: true } : {}),
          });
        }}
      >
        <div className="form-grid">
          <label className="field">
            Código
            <FormInput
              name="ticker"
              value={ticker}
              maxLength={12}
              required
              placeholder="HGLG11"
              onChange={(e) => updateTicker(e.target.value)}
            />
          </label>
          <label className="field">
            Nome
            <FormInput
              name="name"
              maxLength={100}
              required
              placeholder="Nome do ativo"
            />
          </label>
          <label className="field">
            Classe
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                const next = CLASSES.find((c) => c.key === e.target.value)!;
                setCurrency(next.currency);
                if (!symbolEdited && ticker)
                  setSymbol(suggestSymbol(ticker, next.currency));
              }}
            >
              {CLASSES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Moeda
            <select
              value={currency}
              onChange={(e) => {
                const next = e.target.value as Currency;
                setCurrency(next);
                if (!symbolEdited && ticker)
                  setSymbol(suggestSymbol(ticker, next));
              }}
            >
              <option value="BRL">Real · BRL</option>
              <option value="USD">Dólar · USD</option>
            </select>
          </label>
        </div>
        <label className="field">
          Símbolo no Yahoo Finance
          <FormInput
            name="symbol"
            value={symbol}
            maxLength={20}
            required={!archived}
            placeholder="HGLG11.SA"
            hint="Ativos da B3 terminam em .SA."
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setSymbolEdited(true);
              setFound("");
            }}
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Posição já encerrada: manter só no histórico, sem buscar cotação
        </label>
        {found && (
          <p className="form-note" role="status">
            Encontrado. {found}
          </p>
        )}
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {!archived && (
            <button
              type="button"
              className="button outline"
              disabled={checking || !ticker || !symbol}
              onClick={testSymbol}
            >
              {checking ? "Testando…" : "Testar símbolo"}
            </button>
          )}
          <button className="button primary" disabled={busy || checking}>
            {busy ? "Salvando…" : "Salvar ativo"}
            <Check size={16} />
          </button>
        </div>
      </ValidatedForm>
    </>
  );
}
