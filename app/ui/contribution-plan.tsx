"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Target } from "lucide-react";
import { money, num, plainPercent } from "../lib/format";
import {
  GROUPS,
  contributionPlan,
  type Market,
  type PlanDestination,
  type Portfolio,
} from "../lib/model";

const DESTINATIONS: { key: PlanDestination; name: string; text: string }[] = [
  {
    key: "all",
    name: "Carteira inteira",
    text: "Divide entre as classes, conforme as suas metas.",
  },
  {
    key: "br",
    name: "Só bolsa BR",
    text: "Todo o valor nas ações, seguindo os seus pesos.",
  },
  {
    key: "etf",
    name: "Só ETFs americanos",
    text: "Todo o valor nos ETFs, seguindo os seus pesos.",
  },
];
const QUICK = [500, 1000, 2500, 5000];

/** Para onde vai o aporte: primeiro o destino de cada real, depois a explicação. */
export function ContributionPlan({
  portfolio,
  market,
  hidden,
  budget,
  setBudget,
  onRegister,
  onFixed,
  onStrategy,
  onEvaluation,
}: {
  portfolio: Portfolio;
  market: Market;
  hidden: boolean;
  budget: number;
  setBudget: (value: number) => void;
  onRegister: (ticker: string, quantity: number) => void;
  onFixed: () => void;
  onStrategy: () => void;
  onEvaluation: () => void;
}) {
  const [destination, setDestination] = useState<PlanDestination>("all");
  const plan = useMemo(
    () => contributionPlan(portfolio, market, budget, destination),
    [portfolio, market, budget, destination],
  );
  const cash = (value: number, currency = "BRL") =>
    hidden ? "••••••" : money(value, currency);
  const share = (value: number) => (hidden ? "•••" : plainPercent(value, 1));
  const fx = market.quotes.USD?.price;
  const funded = plan.classes.filter((c) => c.amount >= 0.01);
  const etfWeightsMissing =
    !Object.keys(portfolio.weights).some((ticker) =>
      ["VOO", "SPHQ", "VEA", "VNQ", "IAU", "VWO"].includes(ticker),
    ) && funded.some((c) => c.group === "etf");
  const fixedFunded = funded.some((c) => c.group === "rf");
  const table = (rows: typeof plan.items, buying: boolean) => (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label={buying ? "O que comprar" : "Ativos sem aporte"}
    >
      <table className="plan-table">
        <thead>
          <tr>
            <th scope="col">Ativo</th>
            {buying && <th scope="col">Comprar</th>}
            {buying && <th scope="col">Quantidade</th>}
            <th scope="col">Peso hoje</th>
            <th scope="col">Peso recomendado</th>
            <th scope="col">{buying ? "" : "Motivo"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.ticker}>
              <th scope="row">
                <b>{item.ticker}</b>
                <small>{GROUPS[item.group].short}</small>
              </th>
              {buying && (
                <td data-label="Comprar">
                  <b>{cash(item.executable)}</b>
                  {item.quote?.currency === "USD" && fx ? (
                    <small>≈ {cash(item.executable / fx, "USD")}</small>
                  ) : null}
                </td>
              )}
              {buying && (
                <td data-label="Quantidade">
                  {hidden ? "•••" : num(item.quantity, 8)}
                </td>
              )}
              <td data-label="Peso hoje">
                {item.group === "rf" || item.targetShare === 0
                  ? "—"
                  : share(item.currentShare)}
              </td>
              <td data-label="Peso recomendado">
                {item.group === "rf" ? "—" : share(item.targetShare)}
              </td>
              <td data-label={buying ? "" : "Motivo"}>
                {buying ? (
                  <button
                    className="text-button"
                    disabled={hidden}
                    onClick={() => onRegister(item.ticker, item.quantity)}
                  >
                    Registrar compra
                  </button>
                ) : (
                  <small>{item.reason}</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="panel plan-panel" aria-labelledby="plan-title">
      <div className="panel-title">
        <div>
          <span className="eyebrow">PLANEJAR APORTE</span>
          <h2 id="plan-title">Para onde vai o seu aporte</h2>
        </div>
        <Target size={21} />
      </div>
      <div className="plan-inputs">
        <div>
          <label className="field">
            Valor do aporte (R$)
            <input
              aria-label="Valor do aporte"
              type={hidden ? "text" : "number"}
              readOnly={hidden}
              min="0"
              max="1000000000"
              step="0.01"
              value={hidden ? "••••••" : budget}
              onChange={(e) =>
                setBudget(Math.min(1e9, Math.max(0, Number(e.target.value))))
              }
            />
          </label>
          <div
            className="quick-budgets"
            role="group"
            aria-label="Valores de aporte"
          >
            {QUICK.map((value) => (
              <button
                key={value}
                disabled={hidden}
                aria-pressed={budget === value}
                className={"chip " + (budget === value ? "active" : "")}
                onClick={() => setBudget(value)}
              >
                {money(value)}
              </button>
            ))}
          </div>
        </div>
        <div
          className="plan-destinations"
          role="radiogroup"
          aria-label="Destino do aporte"
        >
          {DESTINATIONS.map((option) => (
            <label
              key={option.key}
              className={destination === option.key ? "selected" : ""}
            >
              <input
                type="radio"
                name="plan-destination"
                checked={destination === option.key}
                onChange={() => setDestination(option.key)}
              />
              <span>
                <b>{option.name}</b>
                <small>{option.text}</small>
              </span>
            </label>
          ))}
        </div>
      </div>
      {plan.missing ? (
        <p className="plan-status" role="status">
          Aguardando as cotações para calcular. Nenhuma compra é indicada sem
          preço atualizado.
        </p>
      ) : !plan.ready ? (
        <p className="plan-status">Informe um valor maior que zero.</p>
      ) : (
        <>
          <div className="plan-classes" role="status" aria-live="polite">
            {plan.classes.map((c) => (
              <div key={c.group} className={c.amount >= 0.01 ? "receives" : ""}>
                <span className="plan-class-name">
                  <i style={{ background: GROUPS[c.group].color }} />
                  {GROUPS[c.group].short}
                </span>
                <strong>{cash(c.amount)}</strong>
                <div className="class-meter" aria-hidden="true">
                  <i
                    style={{
                      width: hidden ? 0 : `${Math.min(100, c.after)}%`,
                      background: GROUPS[c.group].color,
                    }}
                  />
                  <em style={{ left: `${c.target}%` }} />
                </div>
                <small>
                  {share(c.current)} → {share(c.after)} · meta{" "}
                  {num(c.target, 1)}%
                </small>
              </div>
            ))}
          </div>
          {plan.items.length > 0 ? (
            <>
              <h3 className="plan-heading">O que comprar</h3>
              {table(plan.items, true)}
            </>
          ) : (
            <p className="plan-status">
              Este valor não compra nenhuma cota inteira. Aumente o aporte ou
              escolha um título de renda fixa.
            </p>
          )}
          {plan.leftover >= 0.01 && (
            <p className="plan-leftover">
              <b>Sobra {cash(plan.leftover)}</b>{" "}
              {fixedFunded
                ? "para um título de renda fixa ou para o próximo aporte."
                : "por causa das cotas inteiras. Fica para o próximo aporte."}
            </p>
          )}
          {plan.waiting.length > 0 && (
            <details className="plan-waiting">
              <summary>
                {plan.waiting.length}{" "}
                {plan.waiting.length === 1
                  ? "ativo não recebe"
                  : "ativos não recebem"}{" "}
                neste aporte · ver motivos
              </summary>
              {table(plan.waiting, false)}
            </details>
          )}
          <div className="plan-notes">
            {fixedFunded && (
              <p>
                Renda fixa: a quantidade usa o ETF da classe. Se preferir um
                título, compare taxa, liquidez e emissor.{" "}
                <button className="text-button" onClick={onFixed}>
                  Registrar título manual
                </button>
              </p>
            )}
            {etfWeightsMissing && (
              <p>
                Os ETFs não têm percentuais definidos, então a compra mantém a
                proporção atual.{" "}
                <button className="text-button" onClick={onStrategy}>
                  Definir pesos <ArrowRight size={14} />
                </button>
              </p>
            )}
            <p>
              Os pesos vêm de Estratégia e metas. Aqui valem só os seus
              percentuais; o filtro de preço e fundamentos está em{" "}
              <button className="text-button" onClick={onEvaluation}>
                Avaliação <ArrowRight size={14} />
              </button>
              . Estimativas sem taxas: confirme os preços ao comprar. Nenhuma
              ordem é enviada à corretora.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
