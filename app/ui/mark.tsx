import type { ReactNode } from "react";
import { Bitcoin, Landmark, Wallet, type LucideIcon } from "lucide-react";
import { ASSETS } from "../lib/model";

export function Mark({
  ticker,
  size = 36,
  color = ASSETS.find((a) => a.ticker === ticker)?.color ?? "#54735c",
}: {
  ticker: string;
  size?: number;
  /** Ativos cadastrados por você trazem a própria cor. */
  color?: string;
}) {
  return (
    <span
      className="asset-mark"
      style={{
        width: size,
        height: size,
        background: color + "16",
        color,
      }}
    >
      {ticker === "BTC" ? (
        <Bitcoin size={size * 0.55} />
      ) : ticker === "RF" ? (
        <Landmark size={18} />
      ) : (
        ticker.slice(0, 2)
      )}
    </span>
  );
}
export function Empty({
  icon: Icon = Wallet,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
