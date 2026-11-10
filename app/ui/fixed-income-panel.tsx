import { ArrowRight, Landmark, Plus } from "lucide-react";
import { money } from "../lib/format";
import type { Portfolio } from "../lib/model";
import { Empty } from "./mark";

/** Títulos de renda fixa com saldo informado à mão, como CDBs. */
export function FixedIncomePanel({
  portfolio,
  hidden,
  onEdit,
}: {
  portfolio: Portfolio;
  hidden: boolean;
  onEdit: (id?: string) => void;
}) {
  const displayMoney = (v: number | null) =>
    hidden ? "••••••" : v === null ? "Não informado" : money(v);
  return (
    <section className="panel fixed-panel">
      <div className="panel-title">
        <div>
          <h2>
            <Landmark size={18} />
            Renda fixa
          </h2>
          <p>
            CDBs e títulos com atualização manual · AUPO11 aparece entre os
            ativos cotados.
          </p>
        </div>
        <button className="button outline" onClick={() => onEdit()}>
          <Plus size={15} />
          Adicionar título
        </button>
      </div>
      {portfolio.fixedIncome.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Capital investido</th>
                <th>Saldo atual</th>
                <th>Atualizado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {portfolio.fixedIncome.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{hidden ? "Título de renda fixa" : r.name}</b>
                    <small>
                      {r.ratePercent
                        ? `${r.ratePercent}% do ${r.index ?? "CDI"}`
                        : "Atualização manual"}
                    </small>
                  </td>
                  <td>{displayMoney(r.cost)}</td>
                  <td>
                    <b>{displayMoney(r.value)}</b>
                  </td>
                  <td>
                    {new Date(r.updatedAt + "T12:00:00").toLocaleDateString(
                      "pt-BR",
                    )}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onEdit(r.id)}
                    >
                      Atualizar <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Landmark}
          title="Cadastre sua renda fixa"
          text="Adicione CDBs, Tesouro Direto e outros títulos com o saldo do seu extrato."
        />
      )}
    </section>
  );
}
