type LabelPoint = {
  time: number;
  portfolio: number;
  purchases: unknown[];
  ibov?: number;
  sp500?: number;
  cdi?: number;
  bitcoin?: number;
};
export type PurchaseLabelPlacement = { dx: number; dy: number; width: number };
/** Visual offsets only: the dates, quantities, returns and marker coordinates are unchanged. */
export function purchaseLabelLayout(
  points: LabelPoint[],
  width: number,
  height: number,
): (PurchaseLabelPlacement | undefined)[] {
  const result: (PurchaseLabelPlacement | undefined)[] = points.map(
    () => undefined,
  );
  if (!points.length) return result;
  const values = points.flatMap((p) =>
    [p.portfolio, p.ibov, p.sp500, p.cdi, p.bitcoin].filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    ),
  );
  const low = Math.min(-1, ...values),
    high = Math.max(1, ...values),
    range = (high - low) * 1.2;
  const first = points[0].time,
    span = Math.max(1, points.at(-1)!.time - first),
    plotWidth = Math.max(100, width - 80),
    plotHeight = Math.max(100, height - 55);
  const placed: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (point.purchases.length < 2) continue;
    const boxWidth = Math.max(
        24,
        String(point.purchases.length).length * 7.5 + 10,
      ),
      boxHeight = 19;
    const px = 60 + ((point.time - first) / span) * plotWidth,
      py =
        15 +
        ((high - point.portfolio + (high - low) * 0.1) / range) * plotHeight;
    const dx =
      Math.min(
        Math.max(px, 60 + boxWidth / 2),
        Math.max(60 + boxWidth / 2, width - 12 - boxWidth / 2),
      ) - px;
    const offsets = [-32, 13, -57, 38, -82, 63];
    const choices = offsets
      .map((dy) => ({
        x: px + dx - boxWidth / 2,
        y: py + dy,
        width: boxWidth,
        height: boxHeight,
        dy,
      }))
      .filter((b) => b.y >= 2 && b.y + b.height <= height - 33);
    const overlaps = (box: (typeof choices)[number]) =>
      placed.reduce(
        (sum, old) =>
          sum +
          (box.x < old.x + old.width + 5 &&
          box.x + box.width + 5 > old.x &&
          box.y < old.y + old.height + 5 &&
          box.y + box.height + 5 > old.y
            ? 1
            : 0),
        0,
      );
    const chosen = choices.toSorted((a, b) => overlaps(a) - overlaps(b))[0] ?? {
      x: px + dx - boxWidth / 2,
      y: Math.max(2, py - 32),
      width: boxWidth,
      height: boxHeight,
      dy: -32,
    };
    placed.push(chosen);
    result[i] = { dx, dy: chosen.dy, width: boxWidth };
  }
  return result;
}
