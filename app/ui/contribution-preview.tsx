"use client";
import { ArrowRight, Target } from "lucide-react";
import { GROUPS, type Group } from "../lib/model";
export function ContributionPreview({
  budget,
  setBudget,
  plan,
  hidden,
  pending,
  onPlan,
}: {
  budget: number;
  setBudget: (v: number) => void;
  plan: { group: Group; amount: number }[];
  hidden: boolean;
  pending: boolean;
  onPlan: () => void;
}) {
  const money = (v: number) =>
    hidden
      ? "••••••"
      : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <section className="panel contribution-preview">
      <div className="panel-title">
        <div>
          <span className="eyebrow">SEU PRÓXIMO PASSO</span>
          <h2>Planejar aporte</h2>
        </div>
        <Target size={20} />
      </div>
      <label className="field">
        Valor disponível em reais
        <input
          aria-label="Valor do próximo aporte"
          type={hidden ? "text" : "number"}
          value={hidden ? "••••••" : budget}
          readOnly={hidden}
          min="0"
          max="1000000000"
          onChange={(e) =>
            setBudget(Math.min(1e9, Math.max(0, Number(e.target.value))))
          }
        />
      </label>
      {pending ? (
        <p className="data-status" role="status">
          Aguardando cotações para calcular.
        </p>
      ) : (
        <div className="preview-plan">
          {plan.map((g) => (
            <div key={g.group}>
              <span>
                <i style={{ background: GROUPS[g.group].color }} />
                {GROUPS[g.group].short}
              </span>
              <b>{money(g.amount)}</b>
            </div>
          ))}
        </div>
      )}
      <button className="button primary full" onClick={onPlan}>
        Ver planejamento <ArrowRight size={16} />
      </button>
      <p>Distribuição pelas suas metas. Valores estimados.</p>
    </section>
  );
}
