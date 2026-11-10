"use client";
import { ASSETS, type Asset } from "../lib/model";
import { NEWS_CATEGORIES } from "../lib/news";
export function NewsFilters({
  value,
  onChange,
  extra = [],
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ativos cadastrados por você, além da lista padrão. */
  extra?: Asset[];
}) {
  const all = [...ASSETS, ...extra],
    asset = all.find((a) => a.ticker === value),
    category = NEWS_CATEGORIES.find((c) => c.key === value);
  // Os mesmos grupos das metas: cada ETF fica na classe a que dá exposição.
  const groups = [
    { name: "Ações na B3", assets: all.filter((a) => a.group === "br") },
    { name: "Renda fixa", assets: all.filter((a) => a.group === "rf") },
    {
      name: "ETFs no exterior",
      assets: all.filter((a) => a.group === "etf"),
    },
    { name: "Bitcoin", assets: all.filter((a) => a.group === "crypto") },
  ];
  return (
    <div className="news-filter-panel">
      <div
        className="news-filters"
        role="group"
        aria-label="Filtrar notícias por mercado"
      >
        {NEWS_CATEGORIES.map((c) => (
          <button
            key={c.key}
            aria-pressed={value === c.key}
            className={value === c.key ? "chip active" : "chip"}
            onClick={() => onChange(c.key)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <label className="news-asset-select">
        Filtrar por ação ou ativo
        <select
          aria-label="Filtrar notícias por ação ou ativo"
          value={asset?.ticker ?? ""}
          onChange={(e) => onChange(e.target.value || "all")}
        >
          <option value="">Todos os ativos / escolher ativo</option>
          {groups.map((g) => (
            <optgroup label={g.name} key={g.name}>
              {g.assets.map((a) => (
                <option key={a.ticker} value={a.ticker}>
                  {a.ticker} · {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="news-selection" role="status">
        Exibindo notícias de{" "}
        {asset
          ? `${asset.ticker} · ${asset.name}`
          : (category?.name.toLocaleLowerCase("pt-BR") ?? "todos os ativos")}
        .
      </p>
    </div>
  );
}
