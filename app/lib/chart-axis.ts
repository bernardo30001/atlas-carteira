/** Eixo com marcas redondas que enquadram os valores, sem forçar o zero. */
export function niceAxis(values: number[], target = 5) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return { domain: [-1, 1], ticks: [-1, 0, 1] };
  let low = Math.min(...valid),
    high = Math.max(...valid);
  if (low === high) {
    low -= 1;
    high += 1;
  }
  const raw = (high - low) / Math.max(1, target - 1),
    power = 10 ** Math.floor(Math.log10(raw)),
    fraction = raw / power,
    step =
      (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (v: number) => Number(v.toFixed(digits));
  const start = Math.floor(low / step),
    end = Math.ceil(high / step);
  const ticks = Array.from({ length: end - start + 1 }, (_, i) =>
    round((start + i) * step),
  );
  return { domain: [ticks[0], ticks.at(-1)!], ticks };
}
