"use client";
import { ArrowUpRight, Newspaper, Plus, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, num, plainPercent, signedMoney } from "../lib/format";
import type { Market, totals } from "../lib/model";
import { Change } from "./change";
import { Mark } from "./mark";

const datetime = (n: number) =>
  new Date(n * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export function AssetDetail({
  ticker,
  market,
  position,
  hidden,
  onAdd,
  onSell,
  onNews,
}: {
  ticker: string;
  market: Market;
  position: ReturnType<typeof totals>["rows"][number];
  hidden: boolean;
  onAdd: () => void;
  onSell: () => void;
  onNews: () => void;
}) {
  const a = position,
    q = market.quotes[ticker];
  return (
    <>
      <div className="asset-detail-heading">
        <Mark ticker={ticker} size={48} color={a.color} />
        <div>
          <span className="eyebrow">{a.sector}</span>
          <h2 id="modal-title">
            {ticker} <small>{a.name}</small>
          </h2>
        </div>
      </div>
      <div className="asset-price">
        {q ? money(q.price, a.currency) : "Sem cotação"}{" "}
        <Change value={q?.change} />
      </div>
      <p>
        {q
          ? `Yahoo Finance · ${datetime(q.time)} · ${q.stale ? "sem atualização" : q.outdated ? "cotação antiga" : "pode haver atraso"}`
          : "Aguardando a fonte de mercado."}
      </p>
      {q && q.history.length > 2 && (
        <div className="detail-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={q.history}>
              <XAxis dataKey="date" hide />
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip
                formatter={(v) => money(Number(v), a.currency)}
                labelFormatter={(v) =>
                  new Date(String(v) + "T12:00:00").toLocaleDateString("pt-BR")
                }
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="var(--positive)"
                fill="var(--chart-area)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="detail-metrics">
        {[
          ["Volatilidade anual", q?.volatility],
          ["Tendência 6 meses", q?.momentum],
          ["Queda máxima · 1 ano", q?.drawdown],
        ].map(([l, v]) => (
          <div key={String(l)}>
            <small>{l}</small>
            <b>
              {v !== null && v !== undefined ? plainPercent(Number(v)) : "—"}
            </b>
          </div>
        ))}
      </div>
      <div className="notice">
        <Wallet size={18} />
        <span>
          Sua posição: {hidden ? "•••" : num(position.quantity, 8)} · custo
          médio{" "}
          {hidden
            ? "•••"
            : position.average === null
              ? "Não informado"
              : money(position.average, position.averageCurrency)}
        </span>
      </div>
      <div className="detail-financials">
        <div>
          <span>Saldo atual</span>
          <b>
            {hidden
              ? "••••••"
              : position.primaryValue !== null
                ? money(position.primaryValue, position.primaryCurrency)
                : "Cotação pendente"}
          </b>
        </div>
        <div>
          <span>Proventos acumulados</span>
          <b>
            {hidden
              ? "••••••"
              : position.nativeIncome === null
                ? "Conversão pendente"
                : money(position.nativeIncome, position.primaryCurrency)}
          </b>
        </div>
        <div>
          <span>Resultado com proventos</span>
          <b>
            {hidden
              ? "••••••"
              : position.result !== null
                ? signedMoney(position.result, position.primaryCurrency)
                : "Não disponível"}
          </b>
        </div>
      </div>
      <div className="dialog-actions">
        <button className="button outline" onClick={onNews}>
          <Newspaper size={16} />
          Notícias
        </button>
        {position.quantity > 0 && (
          <button className="button outline" onClick={onSell}>
            <ArrowUpRight size={16} />
            Registrar venda
          </button>
        )}
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          Registrar aporte
        </button>
      </div>
    </>
  );
}
