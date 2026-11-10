export type Tile<T> = {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Pior proporção entre lado maior e menor de uma fileira, para um lado fixo. */
function worst(row: number[], side: number) {
  const sum = row.reduce((a, b) => a + b, 0),
    max = Math.max(...row),
    min = Math.min(...row);
  return Math.max(
    (side * side * max) / (sum * sum),
    (sum * sum) / (side * side * min),
  );
}

/**
 * Mapa de árvore "squarified": divide o retângulo em blocos de área proporcional ao
 * valor, o mais perto possível de quadrados, para caber texto. Os maiores vêm primeiro.
 */
export function treemap<T>(
  entries: { item: T; value: number }[],
  width: number,
  height: number,
  x = 0,
  y = 0,
): Tile<T>[] {
  const valid = entries
      .filter((e) => Number.isFinite(e.value) && e.value > 0)
      .sort((a, b) => b.value - a.value),
    total = valid.reduce((s, e) => s + e.value, 0);
  if (!total || !(width > 0) || !(height > 0)) return [];
  const scale = (width * height) / total,
    areas = valid.map((e) => e.value * scale),
    tiles: Tile<T>[] = [];
  let w = width,
    h = height,
    start = 0;
  while (start < valid.length) {
    const side = Math.min(w, h),
      row = [areas[start]];
    let end = start + 1;
    while (
      end < valid.length &&
      worst([...row, areas[end]], side) <= worst(row, side)
    )
      row.push(areas[end++]);
    const thickness = row.reduce((a, b) => a + b, 0) / side;
    let offset = 0;
    for (let i = start; i < end; i++) {
      const length = areas[i] / thickness;
      tiles.push(
        w >= h
          ? {
              item: valid[i].item,
              x,
              y: y + offset,
              width: thickness,
              height: length,
            }
          : {
              item: valid[i].item,
              x: x + offset,
              y,
              width: length,
              height: thickness,
            },
      );
      offset += length;
    }
    if (w >= h) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    start = end;
  }
  return tiles;
}

/** Dois níveis: cada grupo ocupa uma região, e os itens se dividem dentro dela. */
export function groupedTreemap<G, T>(
  groups: { group: G; entries: { item: T; value: number }[] }[],
  width: number,
  height: number,
  gap = 0,
): { group: G; tiles: Tile<T>[]; region: Tile<G> }[] {
  const regions = treemap(
    groups.map((g) => ({
      item: g,
      value: g.entries.reduce((s, e) => s + Math.max(0, e.value || 0), 0),
    })),
    width,
    height,
  );
  return regions.map((region) => {
    // A folga só entra nas bordas internas, para o mapa encostar na moldura.
    const left = region.x > 0 ? gap / 2 : 0,
      top = region.y > 0 ? gap / 2 : 0,
      right = region.x + region.width < width - 1e-9 ? gap / 2 : 0,
      bottom = region.y + region.height < height - 1e-9 ? gap / 2 : 0;
    return {
      group: region.item.group,
      region: { ...region, item: region.item.group },
      tiles: treemap(
        region.item.entries,
        Math.max(0, region.width - left - right),
        Math.max(0, region.height - top - bottom),
        region.x + left,
        region.y + top,
      ),
    };
  });
}
