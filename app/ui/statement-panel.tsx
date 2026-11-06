"use client";
import { FileCheck2, Info } from "lucide-react";
import { ASSETS, type Portfolio } from "../lib/model";
const money = (v: number, c = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(v);
export function StatementPanel({
  portfolio,
  hidden,
}: {
  portfolio: Portfolio;
  hidden: boolean;
}) {
  const report = portfolio.statements?.at(-1);
  if (!report) return null;
  const fmt = (v: number, c = "BRL") => (hidden ? "••••••" : money(v, c));
  return (
    <section className="panel statement-panel">
      <div className="panel-title">
        <div>
          <h2>
            <FileCheck2 size={18} />
            Extrato de referência
          </h2>
          <p>
            {hidden ? "Referência privada" : report.label} · recebido em{" "}
            {new Date(report.date + "T12:00:00").toLocaleDateString("pt-BR")}.
            Valores abaixo preservados como informados.
          </p>
        </div>
      </div>
      <div className="statement-totals">
        {(["BRL", "USD"] as const).map((c) => (
          <div key={c}>
            <span>
              {c === "BRL" ? "Bolsa Brasil" : "Exterior"} · {c}
            </span>
            <b>{fmt(report.reportedTotals[c].balance, c)}</b>
            <small>Investido: {fmt(report.reportedTotals[c].cost, c)}</small>
            <small>
              Proventos: {fmt(report.reportedTotals[c].dividends, c)}
            </small>
            <small>
              Resultado informado: {fmt(report.reportedTotals[c].result, c)}
            </small>
          </div>
        ))}
      </div>
      <p className="statement-note">
        <Info size={14} />
        Este extrato não é uma cotação atual. O painel usa suas quantidades e os
        preços consultados para atualizar os saldos.
      </p>
      <details>
        <summary>Ver posições e valores originais</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Quantidade</th>
                <th>PM informado</th>
                <th>Cotação do extrato</th>
                <th>Saldo do extrato</th>
                <th>Investido</th>
                <th>Proventos</th>
                <th>Resultado informado</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const currency =
                  ASSETS.find((a) => a.ticker === r.ticker)?.currency ?? "BRL";
                return (
                  <tr key={r.ticker}>
                    <td>
                      <b>{r.ticker}</b>
                    </td>
                    <td>
                      {hidden
                        ? "•••"
                        : r.quantity.toLocaleString("pt-BR", {
                            maximumFractionDigits: 8,
                          })}
                    </td>
                    <td>{fmt(r.average, currency)}</td>
                    <td>{fmt(r.price, currency)}</td>
                    <td>{fmt(r.balance, currency)}</td>
                    <td>{fmt(r.cost, currency)}</td>
                    <td>{fmt(r.dividends, currency)}</td>
                    <td>{fmt(r.reportedResult, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      {report.bitcoin && (
        <div className="bitcoin-reference">
          <b>Bitcoin · referência recebida</b>
          <div>
            <span>Quantidade</span>
            <strong>
              {hidden
                ? "•••"
                : report.bitcoin.quantity.toLocaleString("pt-BR", {
                    maximumFractionDigits: 8,
                  })}{" "}
              BTC
            </strong>
          </div>
          <div>
            <span>Saldo informado</span>
            <strong>{fmt(report.bitcoin.balance)}</strong>
          </div>
          <div>
            <span>Aplicado</span>
            <strong>{fmt(report.bitcoin.cost)}</strong>
          </div>
          <div>
            <span>Rendimento informado</span>
            <strong>
              {fmt(report.bitcoin.reportedProfit)} ·{" "}
              {hidden ? "•••" : report.bitcoin.reportedPercent}%
            </strong>
          </div>
          <div>
            <span>Rendimento em 12 meses informado</span>
            <strong>{fmt(report.bitcoin.twelveMonthProfit)}</strong>
          </div>
          <p>
            Diferença aritmética entre saldo e aplicado:{" "}
            {fmt(report.bitcoin.balance - report.bitcoin.cost)}. O saldo atual
            de BTC usa a quantidade exata e a cotação; o rendimento informado
            foi preservado.
          </p>
        </div>
      )}
      <div className="statement-notes">
        {hidden ? (
          <p>
            <Info size={13} />
            As observações do extrato ficam ocultas no modo de privacidade.
          </p>
        ) : (
          report.notes.map((n, i) => (
            <p key={i}>
              <Info size={13} />
              {n}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
