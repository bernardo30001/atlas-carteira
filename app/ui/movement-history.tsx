"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { money, num } from "../lib/format";
import {
  transactionCost,
  transactionCurrency,
  type Currency,
  type Portfolio,
} from "../lib/model";
import { ledgerFor } from "../lib/trade-history";

type Row = {
  id: string;
  date: string;
  ticker: string;
  label: string;
  detail: string;
  quantity: number;
  price: number;
  total: number;
  currency: Currency;
  fixed: boolean;
  sale: boolean;
};

/** Compras, vendas e posições iniciais em uma lista só, da mais recente à mais antiga. */
export function movementRows(p: Portfolio): Row[] {
  const history = p.tradeHistory ?? [],
    eventIds = new Set(history.map((e) => e.id));
  const excluded = new Set(
    [...new Set(history.map((e) => e.ticker))].flatMap((ticker) =>
      ledgerFor(p, ticker).excluded.map((e) => e.id),
    ),
  );
  return [
    ...p.transactions
      .filter((t) => !eventIds.has(t.id))
      .map((t) => ({
        id: t.id,
        date: t.date,
        ticker: t.ticker,
        label: t.reconciled
          ? "Posição conciliada"
          : t.kind === "opening"
            ? "Posição inicial"
            : "Aporte",
        detail: t.reconciled ? "Resumo do histórico abaixo" : t.note,
        quantity: t.quantity,
        price: t.price,
        total: transactionCost(t),
        currency: transactionCurrency(t),
        fixed: t.reconciled === true,
        sale: false,
      })),
    ...history.map((e) => ({
      id: e.id,
      date: e.date,
      ticker: e.ticker,
      label: e.kind === "sell" ? "Venda" : "Compra",
      detail: excluded.has(e.id)
        ? "Anterior à posição inicial, já incluída nela"
        : (e.source ?? ""),
      quantity: e.quantity,
      price: e.price,
      total: e.total,
      currency: e.currency,
      fixed: false,
      sale: e.kind === "sell",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

export function MovementHistory({
  portfolio,
  hidden,
  onAdd,
  onSell,
  onDelete,
  onExport,
}: {
  portfolio: Portfolio;
  hidden: boolean;
  onAdd: () => void;
  onSell: () => void;
  onDelete: (id: string) => void;
  onExport: () => void;
}) {
  const rows = movementRows(portfolio),
    [limit, setLimit] = useState(12);
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <div>
          <h2>Histórico de registros</h2>
          <p>Posições iniciais, aportes, compras e vendas.</p>
        </div>
        <div className="button-row">
          <button className="button outline" onClick={onSell}>
            <ArrowUpRight size={15} />
            Registrar venda
          </button>
          <button
            className="icon-button"
            aria-label="Exportar histórico"
            onClick={onExport}
          >
            <Download size={17} />
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Ativo / Tipo</th>
                <th scope="col">Quantidade</th>
                <th scope="col">Preço unitário</th>
                <th scope="col">Total · moeda de origem</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((row) => (
                <tr key={row.id}>
                  <td>
                    {new Date(row.date + "T12:00:00").toLocaleDateString(
                      "pt-BR",
                    )}
                  </td>
                  <td>
                    <b>{row.ticker}</b>
                    <small>
                      {row.label}
                      {row.detail
                        ? hidden
                          ? " · Observação oculta"
                          : " · " + row.detail
                        : ""}
                    </small>
                  </td>
                  <td>
                    {hidden
                      ? "•••"
                      : (row.sale ? "−" : "") + num(row.quantity, 8)}
                  </td>
                  <td>{hidden ? "•••" : money(row.price, row.currency)}</td>
                  <td>{hidden ? "••••••" : money(row.total, row.currency)}</td>
                  <td>
                    {!row.fixed && (
                      <button
                        className="icon-button"
                        aria-label={`Excluir registro de ${row.ticker}`}
                        onClick={() => onDelete(row.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <button
              className="text-button history-more"
              onClick={() => setLimit(rows.length)}
            >
              Ver todos os {rows.length} registros
            </button>
          )}
        </div>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <ArrowDownLeft size={25} />
          </span>
          <h3>O primeiro registro é o começo</h3>
          <p>Cadastre uma posição atual ou registre uma nova compra.</p>
          <button className="button primary" onClick={onAdd}>
            <Plus size={15} />
            Adicionar registro
          </button>
        </div>
      )}
    </section>
  );
}
