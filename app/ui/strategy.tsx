"use client";
import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { evaluationSettings } from "../lib/evaluation";
import { num } from "../lib/format";
import {
  allAssets,
  ASSETS,
  GROUPS,
  totals,
  type Group,
  type Market,
  type Portfolio,
} from "../lib/model";
import { Mark } from "./mark";
import { FormInput, ValidatedForm } from "./validated-form";

const groups = Object.keys(GROUPS) as Group[];
/** Muda quando a estratégia salva muda: o formulário recomeça dos valores novos. */
export const strategyKey = (p: Portfolio) =>
  JSON.stringify([p.targets, p.weights, p.evaluation?.baseWeights]);

export function Strategy({
  portfolio,
  market,
  save,
  busy,
  onAddAsset,
}: {
  portfolio: Portfolio;
  market: Market;
  save: (p: Portfolio) => Promise<boolean>;
  busy: boolean;
  onAddAsset: () => void;
}) {
  const assets = allAssets(portfolio).filter((a) => !a.archived);
  const held = useMemo(
    () =>
      new Map(
        totals(portfolio, market).rows.map((r) => [r.ticker, r.value ?? 0]),
      ),
    [portfolio, market],
  );
  const heldOf = (ticker: string) => held.get(ticker) ?? 0;
  const [targets, setTargets] = useState(portfolio.targets),
    [weights, setWeights] = useState({
      ...portfolio.weights,
      ...evaluationSettings(portfolio).baseWeights,
    }),
    [dirty, setDirty] = useState(false);
  const sum = Object.values(targets).reduce((a, b) => a + b, 0),
    targetsValid = Math.abs(sum - 100) < 0.001,
    weightsValid = groups
      .filter((g) => g !== "rf")
      .every((g) =>
        ASSETS.some((a) => a.group === g && (weights[a.ticker] ?? 1) > 0),
      ),
    valid = targetsValid && weightsValid;
  return (
    <ValidatedForm
      busy={busy}
      onValidSubmit={async (e) => {
        e.preventDefault();
        if (valid)
          await save({
            ...portfolio,
            targets,
            weights,
            evaluation: {
              ...evaluationSettings(portfolio),
              baseWeights: Object.fromEntries(
                ASSETS.filter((a) => a.group === "br").map((a) => [
                  a.ticker,
                  weights[a.ticker] ?? 0,
                ]),
              ),
            },
          });
      }}
    >
      <section className="panel target-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">ALOCAÇÃO DEFINIDA POR VOCÊ</span>
            <h2>Suas metas de patrimônio</h2>
            <p>Percentuais por classe. O total deve ser 100%.</p>
          </div>
          <span className={"total-pill " + (valid ? "" : "invalid")}>
            {num(sum)}% / 100%
          </span>
        </div>
        <div className="target-grid">
          {groups.map((g) => (
            <label className="target-card" key={g}>
              <span>
                <i style={{ background: GROUPS[g].color }} />
                {GROUPS[g].name}
              </span>
              <div>
                <FormInput
                  name={"target-" + g}
                  aria-label={`Meta ${GROUPS[g].name}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  value={targets[g]}
                  onChange={(e) => {
                    setTargets({ ...targets, [g]: Number(e.target.value) });
                    setDirty(true);
                  }}
                />
                <span>%</span>
              </div>
              <small>do patrimônio total</small>
            </label>
          ))}
        </div>
        <div className="target-strip">
          {groups.map((g) => (
            <span
              key={g}
              style={{ width: targets[g] + "%", background: GROUPS[g].color }}
            />
          ))}
        </div>
      </section>
      <section className="panel weights-panel">
        <div className="panel-title">
          <div>
            <h2>Pesos dentro de cada classe</h2>
            <p>
              Sem pesos definidos, a compra mantém a proporção atual da classe.
              Ao definir um peso, os demais ativos da classe valem 1. Peso 0
              exclui dos novos aportes. Em renda fixa, a escolha do título é
              sua.
            </p>
          </div>
          <button type="button" className="button outline" onClick={onAddAsset}>
            <Plus size={15} />
            Cadastrar ativo
          </button>
        </div>
        <div className="weight-grid">
          {assets
            .filter((a) => a.group !== "rf")
            .map((a) => {
              const peers = assets.filter((x) => x.group === a.group),
                chosen = peers.some((x) => weights[x.ticker] !== undefined),
                anyHeld = peers.some((x) => heldOf(x.ticker) > 0),
                weightOf = (ticker: string) =>
                  chosen
                    ? (weights[ticker] ?? 1)
                    : anyHeld
                      ? heldOf(ticker)
                      : 1,
                total = peers.reduce((s, x) => s + weightOf(x.ticker), 0);
              return (
                <label className="weight-item" key={a.ticker}>
                  <Mark ticker={a.ticker} size={30} color={a.color} />
                  <span>
                    <b>{a.ticker}</b>
                    <small>
                      {total ? num((weightOf(a.ticker) / total) * 100, 1) : 0}%
                      da classe{chosen ? "" : " hoje"}
                    </small>
                  </span>
                  <FormInput
                    name={"weight-" + a.ticker}
                    aria-label={`Peso ${a.ticker}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder={chosen ? "1" : "Atual"}
                    value={weights[a.ticker] ?? ""}
                    onChange={(e) => {
                      const next = { ...weights };
                      if (e.target.value === "") delete next[a.ticker];
                      else next[a.ticker] = Number(e.target.value);
                      setWeights(next);
                      setDirty(true);
                    }}
                  />
                </label>
              );
            })}
        </div>
        <div className="save-row">
          <span className={valid ? "muted" : "negative"}>
            {valid
              ? dirty
                ? "Você tem alterações para salvar."
                : "Metas alinhadas com sua estratégia."
              : !targetsValid
                ? "Ajuste as metas para somar 100%."
                : "Defina pelo menos um peso positivo em cada classe."}
          </span>
          <button
            className="button primary"
            disabled={!valid || busy || !dirty}
          >
            {busy ? "Salvando…" : "Salvar estratégia"}
            <Check size={15} />
          </button>
        </div>
      </section>
    </ValidatedForm>
  );
}
