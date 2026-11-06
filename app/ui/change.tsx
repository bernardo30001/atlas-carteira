import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { percent, tone } from "../lib/format";

/** Variação percentual com sinal, seta e cor. Zero fica neutro, sem seta. */
export function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined)
    return <span className="muted">—</span>;
  const kind = tone(value);
  return (
    <span className={`change ${kind}`}>
      {kind === "positive" && <ArrowUpRight size={13} aria-hidden="true" />}
      {kind === "negative" && <ArrowDownRight size={13} aria-hidden="true" />}
      {kind === "neutral" ? "" : " "}
      {percent(value)}
    </span>
  );
}
