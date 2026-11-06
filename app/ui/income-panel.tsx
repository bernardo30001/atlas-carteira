"use client";
import { money } from "../lib/format";
import { Plus, Coins } from "lucide-react";
import { ASSETS, type Income, type Portfolio } from "../lib/model";
export function IncomePanel({
  portfolio,
  hidden,
  onAdd,
  onDelete,
}: {
  portfolio: Portfolio;
  hidden: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel income-panel">
      <div className="panel-title">
        <div>
          <h2>
            <Coins size={18} />
            Proventos e dividendos
          </h2>
          <p>
            Somados ao resultado de cada ativo. Não são adicionados novamente ao
            patrimônio.
          </p>
        </div>
        <button className="button outline" onClick={onAdd}>
          <Plus size={15} />
          Registrar provento
        </button>
      </div>
      {(portfolio.incomes ?? []).length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Valor recebido</th>
                <th>Tipo / Referência</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(portfolio.incomes ?? []).map((i) => (
                <tr key={i.id}>
                  <td>
                    <b>{i.ticker}</b>
                    <small>
                      {ASSETS.find((a) => a.ticker === i.ticker)?.name}
                    </small>
                  </td>
                  <td>
                    <b>{hidden ? "••••••" : money(i.amount, i.currency)}</b>
                  </td>
                  <td>
                    {i.kind === "opening"
                      ? "Acumulado informado"
                      : "Pagamento registrado"}
                    <small>
                      {new Date(i.date + "T12:00:00").toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      · {hidden ? "Observação oculta" : i.note}
                    </small>
                  </td>
                  <td>
                    <button
                      className="text-button negative"
                      onClick={() => onDelete(i.id)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h3>Seus proventos aparecerão aqui</h3>
          <p>Registre dividendos em reais ou em dólares, conforme o ativo.</p>
        </div>
      )}
    </section>
  );
}
