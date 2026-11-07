import type { Point } from "../lib/model";

const WIDTH = 92,
  HEIGHT = 28,
  PAD = 2;
/** Linha pequena com o preço dos últimos meses. A variação aparece em texto ao lado. */
export function Sparkline({
  points,
  days = 66,
}: {
  points: Point[] | undefined;
  days?: number;
}) {
  const closes = (points ?? []).slice(-days).map((p) => p.close);
  if (closes.length < 2) return <span className="sparkline-empty">—</span>;
  const low = Math.min(...closes),
    high = Math.max(...closes),
    range = high - low || 1,
    line = closes
      .map((close, i) => {
        const x = PAD + (i / (closes.length - 1)) * (WIDTH - PAD * 2),
          y = HEIGHT - PAD - ((close - low) / range) * (HEIGHT - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg
      className={"sparkline " + (closes.at(-1)! >= closes[0] ? "up" : "down")}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
    >
      <polyline points={line} />
    </svg>
  );
}
