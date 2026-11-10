"use client";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, ArrowUpRight, Newspaper } from "lucide-react";
import type { NewsItem } from "../lib/news";
import { Empty } from "./mark";
import { NewsFilters } from "./news-filters";

type Loaded = {
  ticker: string;
  items: NewsItem[];
  error: string;
  time: string;
  provider: string;
};
/** Notícias do filtro escolhido. Só consulta enquanto está na tela. */
export function NewsSection({
  full = false,
  ticker,
  onTicker,
  onAll,
}: {
  full?: boolean;
  ticker: string;
  onTicker: (ticker: string) => void;
  onAll: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>();
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const r = await fetch(
          "/api/news?ticker=" + encodeURIComponent(ticker),
          {
            signal: controller.signal,
          },
        );
        const j: {
          items?: NewsItem[];
          error?: string;
          updatedAt?: string;
          provider?: string;
        } = await r.json();
        setLoaded({
          ticker,
          items: j.items ?? [],
          error: j.error ?? "",
          time: j.updatedAt ?? "",
          provider: j.provider ?? "Google Notícias",
        });
      } catch {
        if (!controller.signal.aborted)
          setLoaded({
            ticker,
            items: [],
            error: "Não foi possível conectar às notícias.",
            time: "",
            provider: "Google Notícias",
          });
      }
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 300000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [ticker]);
  // Resposta de outro filtro não vale: enquanto a nova não chega, mostra o carregamento.
  const current = loaded?.ticker === ticker ? loaded : undefined,
    news = current?.items ?? [],
    newsBusy = !current,
    newsError = current?.error ?? "",
    newsTime = current?.time ?? "",
    newsProvider = current?.provider ?? "Google Notícias";
  return (
    <section className="news-section">
      <div className="section-title">
        <div>
          <span className="eyebrow">INFORMAÇÃO QUE IMPORTA</span>
          <h2>No radar dos seus ativos</h2>
        </div>
        {!full && (
          <button className="text-button" onClick={onAll}>
            Todas as notícias <ArrowRight size={16} />
          </button>
        )}
      </div>
      <NewsFilters value={ticker} onChange={onTicker} />
      {newsError && (
        <div className="notice warn">
          <AlertCircle size={16} />
          {newsError}
        </div>
      )}
      {newsBusy && news.length === 0 ? (
        <div className="news-grid">
          {[1, 2, 3].map((x) => (
            <div className="panel news-card skeleton" key={x}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : news.length ? (
        <div className="news-grid">
          {news.slice(0, full ? 24 : 3).map((n, i) => (
            <a
              key={n.link + i}
              className="panel news-card"
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="news-meta">
                <span className="news-ticker">{n.ticker}</span>
                <span>
                  {n.date
                    ? new Date(n.date).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      })
                    : ""}
                </span>
              </div>
              <h3>{n.title}</h3>
              <div className="news-source">
                <span>{n.source || "Google Notícias"}</span>
                <ArrowUpRight size={18} />
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Empty
          icon={Newspaper}
          title="Notícias indisponíveis no momento"
          text="O feed será consultado novamente automaticamente."
        />
      )}
      <p className="source-note">
        {newsProvider} · fontes e datas preservadas · atualização a cada 5 min
        {newsTime
          ? " · última consulta " +
            new Date(newsTime).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""}
      </p>
    </section>
  );
}
