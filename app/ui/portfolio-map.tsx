"use client";
import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { percent, plainPercent } from "../lib/format";
import {
  GROUPS,
  usableQuote,
  type Group,
  type Portfolio,
  type totals,
} from "../lib/model";
import { groupedTreemap } from "../lib/treemap";

const WIDTH = 100,
  HEIGHT = 70,
  GAP = 1.4,
  /** Variação do dia em que a cor chega ao máximo. */
  FULL_HEAT = 3;
const groups = Object.keys(GROUPS) as Group[];
type Entry = {
  key: string;
  label: string;
  ticker?: string;
  value: number;
  change: number | null;
  group: Group;
};

/** A carteira como um mapa: cada classe é uma região e cada ativo, um bloco do tamanho
 * do seu peso. A cor mostra a variação do dia ou a classe. */
export function PortfolioMap({
  portfolio,
  summary,
  hidden,
  onAsset,
  onTargets,
}: {
  portfolio: Portfolio;
  summary: ReturnType<typeof totals>;
  hidden: boolean;
  onAsset: (ticker: string) => void;
  onTargets: () => void;
}) {
  const [mode, setMode] = useState<"today" | "class">("today");
  const entries = useMemo<Entry[]>(
    () => [
      ...summary.rows
        .filter((r) => !r.archived && (r.value ?? 0) > 0)
        .map((r) => ({
          key: r.ticker,
          label: r.ticker,
          ticker: r.ticker,
          value: r.value ?? 0,
          change: usableQuote(r.quote) ? r.quote.change : null,
          group: r.group,
        })),
      ...portfolio.fixedIncome
        .filter((r) => r.value > 0)
        .map((r) => ({
          key: r.id,
          label: "Título",
          value: r.value,
          change: null,
          group: "rf" as Group,
        })),
    ],
    [summary.rows, portfolio.fixedIncome],
  );
  const empty = entries.length === 0;
  const map = useMemo(
    () =>
      groupedTreemap(
        groups.map((group) => ({
          group,
          entries: empty
            ? // Sem posições, o mapa mostra o destino: as metas de cada classe.
              [
                {
                  item: {
                    key: group,
                    label: GROUPS[group].short,
                    value: portfolio.targets[group],
                    change: null,
                    group,
                  } as Entry,
                  value: portfolio.targets[group],
                },
              ]
            : entries
                .filter((e) => e.group === group)
                .map((e) => ({ item: e, value: e.value })),
        })),
        WIDTH,
        HEIGHT,
        GAP,
      ),
    [entries, empty, portfolio.targets],
  );
  const total = empty ? 100 : summary.value,
    pending = !empty && summary.missing.length > 0,
    byClass = mode === "class" || empty;
  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <div className="panel-title">
        <div>
          <h2 id="map-title">
            {empty ? "Seu mapa de alocação" : "Mapa da carteira"}
          </h2>
          <p>
            {empty
              ? "Suas metas, para começar com direção."
              : "Cada bloco tem o tamanho do peso do ativo."}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Editar metas"
          onClick={onTargets}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>
      {!empty && (
        <div className="map-modes" role="group" aria-label="Cor dos blocos">
          <button
            aria-pressed={mode === "today"}
            className={mode === "today" ? "active" : ""}
            onClick={() => setMode("today")}
          >
            Hoje
          </button>
          <button
            aria-pressed={mode === "class"}
            className={mode === "class" ? "active" : ""}
            onClick={() => setMode("class")}
          >
            Classes
          </button>
        </div>
      )}
      {hidden && !empty ? (
        <p className="map-status">Mapa oculto no modo de privacidade.</p>
      ) : pending ? (
        <p className="map-status" role="status">
          Aguardando as cotações para desenhar o mapa.
        </p>
      ) : (
        <ul
          className={"portfolio-map" + (byClass ? " by-class" : "")}
          style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        >
          {map.flatMap(({ tiles }) =>
            tiles.map(({ item, x, y, width, height }) => {
              const share = (item.value / total) * 100,
                heat =
                  item.change === null
                    ? 0
                    : Math.round(
                        Math.min(1, Math.abs(item.change) / FULL_HEAT) * 100,
                      ),
                background = byClass
                  ? `color-mix(in srgb, ${GROUPS[item.group].color} 34%, var(--surface))`
                  : `color-mix(in srgb, var(${(item.change ?? 0) < 0 ? "--heat-down" : "--heat-up"}) ${heat}%, var(--heat-flat))`,
                // O nome só aparece quando cabe inteiro no bloco.
                wide = width >= 4 + item.label.length * 1.8 && height >= 9,
                tall = width >= 15 && height >= 16,
                detail = byClass
                  ? plainPercent(share, 1)
                  : item.change === null
                    ? "—"
                    : percent(item.change),
                title =
                  `${item.label} · ${plainPercent(share, 1)} ${empty ? "de meta" : "da carteira"}` +
                  (item.change === null
                    ? ""
                    : ` · hoje ${percent(item.change)}`),
                content = (
                  <>
                    {wide && <b>{item.label}</b>}
                    {tall && <small>{detail}</small>}
                  </>
                );
              return (
                <li
                  key={item.key}
                  style={{
                    left: `${(x / WIDTH) * 100}%`,
                    top: `${(y / HEIGHT) * 100}%`,
                    width: `${(width / WIDTH) * 100}%`,
                    height: `${(height / HEIGHT) * 100}%`,
                  }}
                >
                  {item.ticker ? (
                    <button
                      style={{ background }}
                      title={title}
                      aria-label={title}
                      onClick={() => onAsset(item.ticker!)}
                    >
                      {content}
                    </button>
                  ) : (
                    <span style={{ background }} title={title}>
                      {content}
                      <span className="visually-hidden">{title}</span>
                    </span>
                  )}
                </li>
              );
            }),
          )}
        </ul>
      )}
      {byClass || hidden ? (
        <div className="map-legend">
          {groups.map((g) => (
            <span key={g}>
              <i style={{ background: GROUPS[g].color }} />
              {GROUPS[g].short}
              <b>
                {empty
                  ? `${portfolio.targets[g]}%`
                  : hidden || pending || !summary.value
                    ? "—"
                    : plainPercent(
                        (summary.byGroup[g] / summary.value) * 100,
                        1,
                      )}
              </b>
            </span>
          ))}
        </div>
      ) : (
        <div className="map-legend heat" aria-hidden="true">
          <span>−{FULL_HEAT}%</span>
          <i />
          <span>+{FULL_HEAT}%</span>
          <small>variação de hoje</small>
        </div>
      )}
    </section>
  );
}
