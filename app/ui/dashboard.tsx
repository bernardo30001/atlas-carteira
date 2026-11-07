"use client";
import { lazy, Suspense, useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowDownLeft,
  Newspaper,
  SlidersHorizontal,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Globe2,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
  Check,
  Download,
  Upload,
  Info,
  Target,
  Activity,
  ArrowRight,
  Menu,
  Bitcoin,
  Landmark,
  ExternalLink,
  Compass,
  AlertCircle,
  Scale,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  allAssets,
  ASSETS,
  GROUPS,
  EMPTY,
  isTrackedTicker,
  trackedPortfolio,
  today,
  totals,
  allocationPlan,
  assetPlan,
  type Group,
  type Portfolio,
  type Market,
} from "../lib/model";
import { fixed, money, num, plainPercent, signedMoney } from "../lib/format";
import { portfolioSchema } from "../lib/validation";
import {
  ledgerIssues,
  migratePortfolio,
  PORTFOLIO_SCHEMA,
} from "../lib/trade-history";
import { MovementHistory } from "./movement-history";
import { AssetForm } from "./asset-form";
const ImportPanel = lazy(() =>
  import("./import-panel").then((m) => ({ default: m.ImportPanel })),
);
import { Change } from "./change";
import { ContributionPreview } from "./contribution-preview";
import { ValidatedForm, FormInput } from "./validated-form";
import { PerformanceChart } from "./performance-chart";
import { useCdi } from "./use-cdi";
import { useMarketHistory } from "./use-market-history";
import { mergeMarket } from "../lib/market-history";
import { CurrencySummary } from "./currency-summary";
import { AssetTable } from "./asset-table";
import { IncomePanel } from "./income-panel";
import { StatementPanel } from "./statement-panel";
import { NewsFilters } from "./news-filters";
import { ThemeToggle } from "./theme-toggle";
const EvaluationPanel = lazy(() =>
  import("./evaluation-panel").then((m) => ({ default: m.EvaluationPanel })),
);
import { evaluationSettings } from "../lib/evaluation";
import { TransactionForm, FixedForm, IncomeForm } from "./investment-forms";
const groups = Object.keys(GROUPS) as Group[];
const blankMarket: Market = { quotes: {}, errors: [], fetchedAt: "" };
const datetime = (n: number) =>
  new Date(n * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const nav = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "portfolio", label: "Minha carteira", icon: Wallet },
  { id: "evaluation", label: "Avaliação", icon: Scale },
  { id: "contributions", label: "Aportes", icon: ArrowDownLeft },
  { id: "import", label: "Importar", icon: Upload },
  { id: "news", label: "Notícias", icon: Newspaper },
];
function Mark({ ticker, size = 36 }: { ticker: string; size?: number }) {
  const a = ASSETS.find((a) => a.ticker === ticker);
  return (
    <span
      className="asset-mark"
      style={{
        width: size,
        height: size,
        background: (a?.color ?? "#6c8579") + "16",
        color: a?.color ?? "#54735c",
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
function Empty({
  icon: Icon = Wallet,
  title,
  text,
  action,
}: {
  icon?: any;
  title: string;
  text: string;
  action?: React.ReactNode;
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
/** Carteira fictícia com compras datadas, pelos preços reais de cada dia quando já
 * carregados, para que a demonstração mostre a curva e os pontos de compra. */
function demoPortfolio(market: Market): Portfolio {
  const dayOffset = (days: number) =>
      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
    start = dayOffset(300),
    priceOn = (ticker: string, date: string, fallback: number) =>
      (market.quotes[ticker]?.priceHistory ?? []).findLast(
        (point) => point.date <= date,
      )?.close ?? fallback;
  const positions: [string, number, number][] = [
    ["WEGE3", 80, 34],
    ["ITUB4", 150, 29],
    ["VALE3", 70, 50],
    ["ALUP11", 80, 25],
    ["AUPO11", 60, 105],
    ["SPHQ", 10, 55],
    ["VEA", 15, 46],
    ["VNQ", 10, 80],
    ["IAU", 8, 43],
    ["VWO", 10, 42],
    ["BTC", 0.018, 80000],
    ["ABTC11", 12, 120],
  ];
  const monthly: [string, number, number][] = [
    ["WEGE3", 6, 34],
    ["SPHQ", 1.5, 55],
    ["AUPO11", 8, 105],
    ["BTC", 0.0008, 80000],
  ];
  const currencyOf = (ticker: string) =>
    ASSETS.find((a) => a.ticker === ticker)?.currency ?? "BRL";
  return {
    ...EMPTY,
    schemaVersion: PORTFOLIO_SCHEMA,
    transactions: positions.map(([ticker, quantity, fallback]) => ({
      id: crypto.randomUUID(),
      ticker,
      kind: "opening",
      quantity,
      price: priceOn(ticker, start, fallback),
      fx: currencyOf(ticker) === "USD" ? null : 1,
      fees: 0,
      date: start,
      note: "Demonstração — posição fictícia",
    })),
    tradeHistory: [270, 225, 180, 135, 90, 45].flatMap((days) =>
      monthly.map(([ticker, quantity, fallback]) => {
        const date = dayOffset(days),
          price = priceOn(ticker, date, fallback);
        return {
          id: crypto.randomUUID(),
          ticker,
          kind: "buy" as const,
          quantity,
          price,
          total: quantity * price,
          currency: currencyOf(ticker),
          fx: currencyOf(ticker) === "USD" ? null : 1,
          fees: 0,
          date,
          source: "Demonstração",
        };
      }),
    ),
    fixedIncome: [
      {
        id: crypto.randomUUID(),
        name: "CDB · exemplo fictício",
        cost: 18000,
        value: 19150,
        date: start,
        updatedAt: today(),
      },
    ],
  };
}
/** O Access pede o login ao recarregar a página: precisa ser um link comum. */
const SIGN_IN_URL = "/";
const SIGN_OUT_URL = "/cdn-cgi/access/logout";

export default function Dashboard() {
  const [page, setPage] = useState("overview"),
    [portfolio, setPortfolio] = useState<Portfolio>(EMPTY),
    [revision, setRevision] = useState(0),
    [changes, setChanges] = useState<
      { ticker: string; before: number; after: number }[]
    >([]),
    [quotes, setQuotes] = useState<Market>(blankMarket),
    [marketLoading, setMarketLoading] = useState(true),
    [marketError, setMarketError] = useState(""),
    [account, setAccount] = useState<"loading" | "ready" | "signin" | "error">(
      "loading",
    ),
    [name, setName] = useState("Minha conta"),
    [saveBusy, setSaveBusy] = useState(false),
    [toast, setToast] = useState(""),
    [demo, setDemo] = useState<Portfolio | null>(null),
    [hidden, setHidden] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [budget, setBudget] = useState(1000),
    [modal, setModal] = useState<{
      kind: string;
      mode?: "buy" | "sell";
      ticker?: string;
      quantity?: number;
      id?: string;
    } | null>(null),
    [mobile, setMobile] = useState(false),
    [compact, setCompact] = useState(false),
    [newsTicker, setNewsTicker] = useState("all"),
    [news, setNews] = useState<any[]>([]),
    [newsBusy, setNewsBusy] = useState(true),
    [newsError, setNewsError] = useState(""),
    [newsTime, setNewsTime] = useState(""),
    [newsProvider, setNewsProvider] = useState("Google Notícias");
  const [evaluationTicker, setEvaluationTicker] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null),
    marketBusy = useRef(false),
    sidebarRef = useRef<HTMLElement>(null),
    menuRef = useRef<HTMLButtonElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    extraRef = useRef("");
  const p = demo ?? portfolio,
    marketHistory = useMarketHistory(p),
    market = useMemo(
      () => mergeMarket(quotes, marketHistory.histories, marketHistory.ptax),
      [quotes, marketHistory.histories, marketHistory.ptax],
    ),
    t = useMemo(() => totals(p, market), [p, market]),
    classPlan = allocationPlan(p, market, budget),
    fx = market.quotes.USD?.price;
  const displayMoney = (v: number | null) =>
    hidden ? "••••••" : v === null ? "Não informado" : money(v);
  const portfolioReady = !!demo || account === "ready";
  const hasPositions =
    p.transactions.some((t) => isTrackedTicker(t.ticker)) ||
    p.fixedIncome.length > 0 ||
    (p.tradeHistory ?? []).some((t) => isTrackedTicker(t.ticker));
  const navigate = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.pushState({}, "", url);
    setPage(id);
    setMobile(false);
    setFilter(
      id === "portfolio" && t.rows.some((r) => r.quantity > 0) ? "held" : "all",
    );
    setQuery("");
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    requestAnimationFrame(() =>
      document.querySelector("h1")?.focus({ preventScroll: true }),
    );
  };
  const closeMenu = (restore = true) => {
    setMobile(false);
    if (restore) requestAnimationFrame(() => menuRef.current?.focus());
  };
  useEffect(() => {
    const sync = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      setPage(
        tab && [...nav.map((n) => n.id), "strategy"].includes(tab)
          ? tab
          : "overview",
      );
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 980px)"),
      sync = () => {
        setCompact(query.matches);
        if (!query.matches) setMobile(false);
      };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!mobile || !compact) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = sidebarRef.current;
    const focusFrame = requestAnimationFrame(() =>
      root?.querySelector<HTMLButtonElement>(".menu-close")?.focus(),
    );
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
      if (e.key === "Tab" && root) {
        const items = Array.from(
            root.querySelectorAll<HTMLElement>(
              "a[href],button:not([disabled])",
            ),
          ).filter((el) => el.offsetParent !== null),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keydown);
    };
  }, [mobile, compact]);
  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (r) => {
        const j: any = await r.json();
        if (!r.ok) {
          setAccount(r.status === 401 ? "signin" : "error");
          if (r.status !== 401) setToast(j.error);
          return;
        }
        setPortfolio(j.portfolio);
        setChanges(j.changes ?? []);
        setRevision(j.revision);
        setName(j.name);
        setAccount("ready");
      })
      .catch(() => {
        setAccount("error");
        setToast(
          "Não foi possível carregar sua conta. Recarregue antes de cadastrar.",
        );
      });
  }, []);
  async function refreshMarket() {
    if (marketBusy.current) return;
    marketBusy.current = true;
    setMarketLoading(true);
    try {
      // Com prazo: uma consulta presa não pode impedir as próximas.
      const r = await fetch(
        "/api/market" +
          (extraRef.current
            ? "?assets=" + encodeURIComponent(extraRef.current)
            : ""),
        { signal: AbortSignal.timeout(30000) },
      );
      if (!r.ok) throw Error();
      const j: any = await r.json();
      setQuotes(j);
      setMarketError(
        j.errors.length
          ? `Sem atualização: ${j.errors.join(", ")}. Dados anteriores, quando disponíveis, estão marcados.`
          : "",
      );
    } catch {
      setQuotes((old) => ({
        ...old,
        quotes: Object.fromEntries(
          Object.entries(old.quotes).map(([k, v]) => [
            k,
            { ...v, stale: true },
          ]),
        ),
      }));
      setMarketError(
        "A fonte de cotações não respondeu. Tentaremos novamente em 60 segundos.",
      );
    } finally {
      setMarketLoading(false);
      marketBusy.current = false;
    }
  }
  const extraAssets = (p.customAssets ?? [])
    .filter((a) => !a.archived)
    .map((a) => `${a.ticker}:${a.symbol}`)
    .join(",");
  useEffect(() => {
    extraRef.current = extraAssets;
    refreshMarket();
    const timer = setInterval(() => {
      if (!document.hidden) refreshMarket();
    }, 60000);
    return () => clearInterval(timer);
  }, [extraAssets]);
  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    const load = async () => {
      setNewsBusy(true);
      setNewsError("");
      try {
        const r = await fetch(
          "/api/news?ticker=" + encodeURIComponent(newsTicker),
          { signal: controller.signal },
        );
        const j: any = await r.json();
        if (!canceled) {
          setNews(j.items ?? []);
          setNewsError(j.error ?? "");
          setNewsTime(j.updatedAt ?? "");
          setNewsProvider(j.provider ?? "Google Notícias");
        }
      } catch {
        if (!canceled) {
          setNews([]);
          setNewsError("Não foi possível conectar às notícias.");
        }
      } finally {
        if (!canceled) setNewsBusy(false);
      }
    };
    setNews([]);
    setNewsTime("");
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 300000);
    return () => {
      canceled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [newsTicker]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (modal) {
      lastFocus.current =
        compact && sidebarRef.current?.contains(document.activeElement)
          ? menuRef.current
          : (document.activeElement as HTMLElement);
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      lastFocus.current?.focus();
    }
  }, [modal]);
  async function save(next: Portfolio) {
    if (demo) {
      setDemo(next);
      setToast("Exemplo atualizado. Nenhum dado real foi alterado.");
      return true;
    }
    if (account !== "ready") {
      setToast("Entre na sua conta e carregue a carteira antes de salvar.");
      return false;
    }
    setSaveBusy(true);
    try {
      const r = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio: next, revision }),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j.error);
      setPortfolio(next);
      setRevision(j.revision);
      setToast("Salvo na sua carteira.");
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSaveBusy(false);
    }
  }
  function exportData() {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              app: "Atlas",
              version: 3,
              exportedAt: new Date().toISOString(),
              portfolio: p,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `atlas-carteira-${today()}${demo ? "-demo" : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Backup exportado. Guarde o arquivo em um local seguro.");
  }
  async function importData(file: File | undefined) {
    if (!file) return;
    if (file.size > 2000000) {
      setToast("O backup deve ter até 2 MB.");
      return;
    }
    try {
      const j = JSON.parse(await file.text());
      if (
        j.app !== "Atlas" ||
        !j.portfolio ||
        !Array.isArray(j.portfolio.transactions) ||
        !Array.isArray(j.portfolio.fixedIncome)
      )
        throw Error();
      (window as any).__atlasImport = migratePortfolio(
        portfolioSchema.parse(j.portfolio),
      );
      setModal({ kind: "import" });
    } catch {
      setToast("Esse arquivo não é um backup válido do Atlas.");
    }
  }
  const overview = page === "overview";
  const cdi = useCdi();

  const donutSegments = (() => {
    let offset = 0;
    return groups
      .map((g) => {
        const v =
          hasPositions && t.value > 0
            ? (t.byGroup[g] / t.value) * 100
            : p.targets[g];
        const start = offset;
        offset += v;
        return `${GROUPS[g].color} ${start}% ${offset}%`;
      })
      .join(",");
  })();
  function table(full = false) {
    return (
      <AssetTable
        portfolio={p}
        market={market}
        hidden={hidden}
        full={full}
        filter={filter}
        query={query}
        setFilter={setFilter}
        setQuery={setQuery}
        onAsset={(ticker) => setModal({ kind: "asset", ticker })}
        onAdd={(ticker) => setModal({ kind: "transaction", ticker })}
        onIncome={() => setModal({ kind: "income" })}
        onPortfolio={() => navigate("portfolio")}
      />
    );
  }
  function newsBlock(full = false) {
    return (
      <section className="news-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">INFORMAÇÃO QUE IMPORTA</span>
            <h2>No radar dos seus ativos</h2>
          </div>
          {!full && (
            <button className="text-button" onClick={() => navigate("news")}>
              Todas as notícias <ArrowRight size={16} />
            </button>
          )}
        </div>
        <NewsFilters value={newsTicker} onChange={setNewsTicker} />
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
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <aside
        id="main-navigation"
        ref={sidebarRef}
        className={`sidebar ${mobile ? "open" : ""}`}
        inert={compact && !mobile}
        aria-hidden={compact && !mobile ? true : undefined}
        role={compact ? "dialog" : undefined}
        aria-modal={compact && mobile ? true : undefined}
        aria-label="Navegação principal"
      >
        <button
          className="menu-close icon-button"
          aria-label="Fechar menu"
          onClick={() => closeMenu()}
        >
          <X size={20} />
        </button>
        <a className="brand" href="/" aria-label="Atlas início">
          <span className="brand-icon">
            <Compass size={27} strokeWidth={1.5} />
          </span>
          <span>
            atlas<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-label">SEU ESPAÇO FINANCEIRO</div>
        <nav aria-label="Páginas da carteira">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={page === n.id ? "page" : undefined}
              className={page === n.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {page === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-separator" />
        <button
          aria-current={page === "strategy" ? "page" : undefined}
          className={page === "strategy" ? "nav-item active" : "nav-item"}
          onClick={() => navigate("strategy")}
        >
          <SlidersHorizontal size={18} />
          Estratégia e metas
        </button>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={14} /> Carteira privada e protegida
          </div>
          <button
            className="profile"
            onClick={() => {
              setMobile(false);
              setModal({ kind: "account" });
            }}
          >
            <span className="avatar">{name.charAt(0).toUpperCase()}</span>
            <span>
              <b>{name === "Minha conta" ? name : name.split(" ")[0]}</b>
              <small>Minha carteira pessoal</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      {mobile && compact && (
        <button
          className="mobile-backdrop"
          aria-label="Fechar navegação"
          tabIndex={-1}
          onClick={() => closeMenu()}
        />
      )}
      <div className="app-main" inert={compact && mobile}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              ref={menuRef}
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              aria-controls="main-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={21} />
            </button>
            <span>Minha carteira</span>
            <ChevronRight size={12} />
            <b>
              {page === "strategy"
                ? "Estratégia e metas"
                : nav.find((n) => n.id === page)?.label}
            </b>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <button
              className="currency-button"
              onClick={() => setModal({ kind: "sources" })}
            >
              <Globe2 size={14} />
              BRL + USD <Info size={12} />
            </button>
            <button
              className="icon-button"
              aria-pressed={hidden}
              aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
              onClick={() => setHidden(!hidden)}
            >
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <span className="top-divider" />
            <span className="top-avatar">{name.charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <div className="market-strip">
          <span className="strip-label">
            <span className="live-dot" /> MERCADO
          </span>
          {[
            ["IBOV", "Ibovespa"],
            ["SP500", "S&P 500"],
            ["USD", "Dólar"],
            ["BTC", "Bitcoin"],
          ].map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <b>
                {market.quotes[key]
                  ? key === "USD"
                    ? money(market.quotes[key].price)
                    : key === "BTC"
                      ? money(market.quotes[key].price, "USD")
                      : num(market.quotes[key].price, 0)
                  : "—"}
              </b>
              <Change value={market.quotes[key]?.change} />
              {(market.quotes[key]?.stale || market.quotes[key]?.outdated) && (
                <small className="quote-age">
                  {market.quotes[key].stale ? "sem atualização" : "antiga"}
                </small>
              )}
            </div>
          ))}
          <button
            aria-label="Atualizar cotações"
            title="Atualizar cotações"
            className={"icon-button " + (marketLoading ? "spinning" : "")}
            onClick={refreshMarket}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <main id="main-content" tabIndex={-1}>
          <Suspense fallback={null}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {new Date()
                    .toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                    .toUpperCase()}
                </span>
                <h1 tabIndex={-1}>
                  {overview
                    ? "Sua carteira, por inteiro."
                    : page === "portfolio"
                      ? "Cada ativo, em perspectiva."
                      : page === "evaluation"
                        ? "Decisões com fundamento."
                        : page === "contributions"
                          ? "Seu próximo passo."
                          : page === "import"
                            ? "Seu histórico, sem digitar."
                            : page === "news"
                              ? "O mercado no seu radar."
                              : "Uma direção para investir."}
                </h1>
                <p>
                  {overview
                    ? "Clareza para acompanhar. Estratégia para crescer."
                    : page === "portfolio"
                      ? "Acompanhe suas posições e a distribuição do seu patrimônio."
                      : page === "evaluation"
                        ? "Sua carteira, os preços e os motivos para agir ou esperar."
                        : page === "contributions"
                          ? "Planeje, registre e acompanhe a construção do seu patrimônio."
                          : page === "import"
                            ? "Envie os relatórios e confira tudo antes de salvar."
                            : page === "news"
                              ? "Notícias recentes sobre os ativos que você escolheu."
                              : "Seu patrimônio distribuído de acordo com as suas metas."}
                </p>
              </div>
              <div className="heading-actions">
                {overview && (
                  <button
                    className="button outline"
                    disabled={!portfolioReady}
                    onClick={() => navigate("contributions")}
                  >
                    <Target size={17} />
                    Planejar aporte
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={!portfolioReady}
                  onClick={() => setModal({ kind: "transaction" })}
                >
                  <Plus size={17} />
                  Registrar aporte
                </button>
              </div>
            </div>
            {demo && (
              <div className="notice demo">
                <Info size={17} />
                <span>
                  <b>Modo demonstração.</b> Posições fictícias, cotações da
                  fonte de mercado. Nenhum dado real é alterado.
                </span>
                <button
                  onClick={() => {
                    setDemo(null);
                    setToast("Você voltou à sua carteira real.");
                  }}
                >
                  Sair da demonstração <X size={14} />
                </button>
              </div>
            )}
            {!demo && account === "signin" && (
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  Entre para salvar sua carteira na nuvem e acessar em outros
                  dispositivos.
                </span>
                <a href={SIGN_IN_URL} target="_top">
                  Entrar <ArrowRight size={15} />
                </a>
              </div>
            )}
            {!demo && account === "error" && (
              <div className="notice warn">
                <AlertCircle size={18} />
                <span>
                  Sua carteira não pôde ser carregada. Recarregue para tentar
                  novamente.
                </span>
                <button onClick={() => location.reload()}>Recarregar</button>
              </div>
            )}
            {marketError && (
              <div className="notice warn">
                <AlertCircle size={17} />
                <span>{marketError}</span>
              </div>
            )}
            {!demo && changes.length > 0 && (
              <div className="notice warn">
                <AlertCircle size={17} />
                <span>
                  <b>Confira estas posições.</b> Agora a quantidade segue o
                  histórico de movimentações.{" "}
                  {hidden
                    ? `${changes.length} posições mudaram.`
                    : changes
                        .map(
                          (c) =>
                            `${c.ticker}: ${num(c.before, 8)} → ${num(c.after, 8)}`,
                        )
                        .join("; ") + "."}
                </span>
                <button onClick={() => setChanges([])}>Entendi</button>
              </div>
            )}
            {portfolioReady && market.fetchedAt && t.missing.length > 0 && (
              <div className="notice warn">
                <AlertCircle size={17} />
                <span>
                  Patrimônio parcial: sem cotação atual de{" "}
                  {t.missing.map((a) => a.ticker).join(", ")}. Alocação e
                  sugestões suspensas até a atualização.
                </span>
              </div>
            )}
            {!portfolioReady && page !== "news" && (
              <section
                className="panel portfolio-loading"
                aria-busy={account === "loading"}
                role="status"
              >
                <Wallet size={25} />
                <h2>
                  {account === "loading"
                    ? "Carregando sua carteira…"
                    : "Sua carteira está protegida"}
                </h2>
                <p>
                  {account === "loading"
                    ? "Vamos mostrar os saldos assim que seus registros forem confirmados."
                    : "Entre na sua conta ou recarregue para acessar os registros. Nenhum saldo foi presumido."}
                </p>
                {account !== "loading" && (
                  <button
                    className="button outline"
                    onClick={() => setDemo(demoPortfolio(market))}
                  >
                    Explorar demonstração
                  </button>
                )}
                {account === "loading" && (
                  <div className="loading-cards" aria-hidden="true">
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} />
                    ))}
                  </div>
                )}
              </section>
            )}
            {portfolioReady && (overview || page === "portfolio") && (
              <CurrencySummary
                portfolio={p}
                market={market}
                hidden={hidden}
                compact={overview}
              />
            )}
            {portfolioReady && overview && (
              <>
                {!hasPositions && (
                  <div className="onboarding">
                    <span className="onboard-icon">
                      <Wallet size={24} />
                    </span>
                    <div>
                      <h3>Sua estratégia já está aqui. Agora, sua carteira.</h3>
                      <p>
                        Cadastre as posições que você já tem para ver o
                        patrimônio e os desvios reais.
                      </p>
                    </div>
                    <button
                      className="button outline"
                      onClick={() => setDemo(demoPortfolio(market))}
                    >
                      Explorar demonstração
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setModal({ kind: "transaction" })}
                    >
                      Cadastrar posição <ArrowRight size={15} />
                    </button>
                  </div>
                )}
                <div className="overview-grid">
                  <PerformanceChart
                    portfolio={p}
                    market={market}
                    rates={cdi.rates}
                    historyLoading={marketHistory.loading}
                    cdiError={cdi.cdiError}
                    hidden={hidden}
                    cdiBusy={cdi.cdiBusy}
                    onRetryCdi={cdi.retryCdi}
                  />
                  <div className="overview-aside">
                    <section className="panel allocation">
                      <div className="panel-title">
                        <div>
                          <h2>
                            {hasPositions
                              ? "Distribuição da carteira"
                              : "Seu mapa de alocação"}
                          </h2>
                          <p>
                            {hasPositions
                              ? "Patrimônio atual por classe."
                              : "Suas metas para começar com direção."}
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Editar metas"
                          onClick={() => navigate("strategy")}
                        >
                          <SlidersHorizontal size={17} />
                        </button>
                      </div>
                      <div className="donut-wrap">
                        <div
                          className="donut"
                          style={{
                            background: `conic-gradient(${t.missing.length ? "var(--surface-4) 0% 100%" : donutSegments})`,
                          }}
                        >
                          <div>
                            <span>
                              {hasPositions ? "PATRIMÔNIO" : "META TOTAL"}
                            </span>
                            <b>
                              {!hasPositions
                                ? "100%"
                                : t.missing.length
                                  ? "Aguardando"
                                  : displayMoney(t.value)}
                            </b>
                            <small>
                              {hasPositions
                                ? "4 classes de ativos"
                                : "4 classes de ativos"}
                            </small>
                          </div>
                        </div>
                      </div>
                      <div className="allocation-legend">
                        {groups.map((g) => (
                          <div key={g}>
                            <span>
                              <i style={{ background: GROUPS[g].color }} />
                              {GROUPS[g].name}
                            </span>
                            <b>
                              {hasPositions && t.value > 0 && !t.missing.length
                                ? hidden
                                  ? "•••"
                                  : fixed((t.byGroup[g] / t.value) * 100, 1)
                                : p.targets[g]}
                              %
                            </b>
                            <small>
                              {hasPositions ? `Meta ${p.targets[g]}%` : "Meta"}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                    <ContributionPreview
                      budget={budget}
                      setBudget={setBudget}
                      plan={classPlan}
                      hidden={hidden}
                      pending={!!t.missing.length}
                      onPlan={() => navigate("contributions")}
                    />
                  </div>
                </div>
                {table()}
                {newsBlock()}
              </>
            )}
            {portfolioReady && page === "portfolio" && (
              <>
                {table(true)}
                <section className="panel fixed-panel">
                  <div className="panel-title">
                    <div>
                      <h2>
                        <Landmark size={18} />
                        Renda fixa
                      </h2>
                      <p>
                        CDBs e títulos com atualização manual · AUPO11 aparece
                        entre os ativos cotados.
                      </p>
                    </div>
                    <button
                      className="button outline"
                      onClick={() => setModal({ kind: "fixed" })}
                    >
                      <Plus size={15} />
                      Adicionar título
                    </button>
                  </div>
                  {p.fixedIncome.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Título</th>
                            <th>Capital investido</th>
                            <th>Saldo atual</th>
                            <th>Atualizado em</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {p.fixedIncome.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <b>
                                  {hidden ? "Título de renda fixa" : r.name}
                                </b>
                                <small>
                                  {r.ratePercent
                                    ? `${r.ratePercent}% do ${r.index ?? "CDI"}`
                                    : "Atualização manual"}
                                </small>
                              </td>
                              <td>{displayMoney(r.cost)}</td>
                              <td>
                                <b>{displayMoney(r.value)}</b>
                              </td>
                              <td>
                                {new Date(
                                  r.updatedAt + "T12:00:00",
                                ).toLocaleDateString("pt-BR")}
                              </td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({ kind: "fixed", id: r.id })
                                  }
                                >
                                  Atualizar <ArrowRight size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon={Landmark}
                      title="Cadastre sua renda fixa"
                      text="Adicione CDBs, Tesouro Direto e outros títulos com o saldo do seu extrato."
                    />
                  )}
                </section>
                <div className="panel allocation-comparison">
                  <h2>Atual × objetivo</h2>
                  {groups.map((g) => (
                    <div className="comparison-row" key={g}>
                      <span>
                        <i style={{ background: GROUPS[g].color }} />
                        {GROUPS[g].name}
                      </span>
                      <div className="comparison-track">
                        <span
                          style={{
                            width: `${!t.missing.length && t.value ? (t.byGroup[g] / t.value) * 100 : 0}%`,
                            background: GROUPS[g].color,
                          }}
                        />
                        <i
                          style={{ left: p.targets[g] + "%" }}
                          title={`Meta ${p.targets[g]}%`}
                        />
                      </div>
                      <b>
                        {!t.missing.length && t.value
                          ? plainPercent((t.byGroup[g] / t.value) * 100, 1)
                          : "—"}
                      </b>
                      <small>Meta {p.targets[g]}%</small>
                    </div>
                  ))}
                  <p className="source-note">
                    A marca vertical indica sua meta. Os saldos estrangeiros são
                    convertidos pelo USD/BRL da fonte.
                  </p>
                </div>
              </>
            )}
            {portfolioReady && page === "portfolio" && (
              <>
                <IncomePanel
                  portfolio={p}
                  hidden={hidden}
                  onAdd={() => setModal({ kind: "income" })}
                  onDelete={(id) => setModal({ kind: "delete-income", id })}
                />
                <StatementPanel portfolio={p} hidden={hidden} />
              </>
            )}
            {portfolioReady && page === "evaluation" && (
              <EvaluationPanel
                portfolio={p}
                market={market}
                hidden={hidden}
                budget={budget}
                setBudget={setBudget}
                save={save}
                busy={saveBusy}
                initialTicker={evaluationTicker}
                onRegister={(ticker, quantity) =>
                  setModal({ kind: "transaction", ticker, quantity })
                }
              />
            )}
            {portfolioReady && page === "contributions" && (
              <>
                <EvaluationPanel
                  plannerOnly
                  defaultBudgetScope="portfolio"
                  portfolio={p}
                  market={market}
                  hidden={hidden}
                  budget={budget}
                  setBudget={setBudget}
                  save={save}
                  busy={saveBusy}
                  onInspect={(ticker) => {
                    setEvaluationTicker(ticker);
                    navigate("evaluation");
                  }}
                  onRegister={(ticker, quantity) =>
                    setModal({ kind: "transaction", ticker, quantity })
                  }
                  onFixed={() => setModal({ kind: "fixed" })}
                />
                <MovementHistory
                  portfolio={trackedPortfolio(p)}
                  hidden={hidden}
                  onAdd={() => setModal({ kind: "transaction" })}
                  onSell={() => setModal({ kind: "transaction", mode: "sell" })}
                  onDelete={(id) => setModal({ kind: "delete", id })}
                  onExport={exportData}
                />
              </>
            )}
            {portfolioReady && page === "import" && (
              <ImportPanel
                portfolio={p}
                hidden={hidden}
                busy={saveBusy}
                save={save}
                onAddAsset={(ticker) => setModal({ kind: "asset-new", ticker })}
                onShowValues={() => setHidden(false)}
              />
            )}
            {page === "news" && newsBlock(true)}
            {portfolioReady && page === "strategy" && (
              <>
                <Strategy
                  portfolio={p}
                  market={market}
                  save={save}
                  busy={saveBusy}
                  onAddAsset={() => setModal({ kind: "asset-new" })}
                />
                <section className="panel method-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Critérios claros. Decisões conscientes.</h2>
                      <p>Entenda os dados que orientam o painel.</p>
                    </div>
                    <Compass size={24} />
                  </div>
                  <div className="method-grid">
                    <div>
                      <span>01</span>
                      <h3>Reequilíbrio por aportes</h3>
                      <p>
                        O aporte vai primeiro para a classe mais longe da meta,
                        em proporção à própria meta. Ao alcançar a seguinte, as
                        duas sobem juntas, sem sugerir vendas.
                      </p>
                    </div>
                    <div>
                      <span>02</span>
                      <h3>Dentro de cada classe</h3>
                      <p>
                        Vale a mesma regra entre os ativos, com os pesos que
                        você definiu. Sem pesos, a compra mantém a proporção
                        atual da classe. Volatilidade e tendência são só
                        informação.
                      </p>
                    </div>
                    <div>
                      <span>03</span>
                      <h3>Sem falsas garantias</h3>
                      <p>
                        Histórico não prevê retorno. Aportes usa os pesos que
                        você definiu. A aba Avaliação acrescenta comparação de
                        preço e fundamentos para ações brasileiras. Impostos,
                        perfil e produtos de renda fixa exigem análise própria.
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal({ kind: "method" })}
                  >
                    Ver metodologia completa <ArrowRight size={15} />
                  </button>
                </section>
                <section className="panel backup-panel">
                  <div>
                    <h2>Seus dados, com você.</h2>
                    <p>Salvos na sua conta. Exporte um backup quando quiser.</p>
                  </div>
                  <div className="button-row">
                    <button
                      className="button outline"
                      onClick={() => importRef.current?.click()}
                    >
                      <Upload size={15} />
                      Importar backup
                    </button>
                    <button className="button outline" onClick={exportData}>
                      <Download size={15} />
                      Exportar backup
                    </button>
                    <button
                      className="button outline"
                      onClick={() => setModal({ kind: "paste-import" })}
                    >
                      Importar texto do backup
                    </button>
                  </div>
                  <input
                    ref={importRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      importData(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </section>
              </>
            )}
            <footer>
              <span className="footer-brand">atlas.</span>
              <p>Mais clareza em cada decisão.</p>
              <button onClick={() => setModal({ kind: "sources" })}>
                Fontes e atualização <ExternalLink size={12} />
              </button>
              <span className="footer-right">
                Dados informativos. Investir envolve riscos.
              </span>
            </footer>
          </Suspense>
        </main>
      </div>
      {toast && !modal && (
        <div className="toast" role="status">
          <Info size={17} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <dialog
        ref={dialogRef}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
        aria-labelledby="modal-title"
      >
        <div className="dialog-content">
          {toast && (
            <div className="notice warn modal-notice" role="alert">
              {toast}
            </div>
          )}
          <button
            className="dialog-close icon-button"
            aria-label="Fechar"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
          {hidden &&
            modal &&
            ["transaction", "income", "fixed"].includes(modal.kind) && (
              <>
                <h2 id="modal-title">Modo de privacidade ativo</h2>
                <p>
                  Mostre os valores para abrir este formulário e editar seus
                  registros.
                </p>
                <button
                  className="button primary"
                  onClick={() => setHidden(false)}
                >
                  Mostrar valores e continuar
                </button>
              </>
            )}
          {modal?.kind === "transaction" && !hidden && (
            <TransactionForm
              key={(modal.ticker ?? "new") + (modal.mode ?? "")}
              ticker={modal.ticker}
              quantity={modal.quantity}
              initialKind={modal.mode}
              portfolio={p}
              market={market}
              busy={saveBusy}
              onSubmit={async (tx) => {
                if (await save({ ...p, transactions: [...p.transactions, tx] }))
                  setModal(null);
              }}
              onSell={async (sale) => {
                if (
                  await save({
                    ...p,
                    tradeHistory: [...(p.tradeHistory ?? []), sale],
                  })
                )
                  setModal(null);
              }}
            />
          )}
          {modal?.kind === "income" && !hidden && (
            <IncomeForm
              ticker={modal.ticker}
              portfolio={p}
              busy={saveBusy}
              onSubmit={async (income) => {
                if (
                  await save({ ...p, incomes: [...(p.incomes ?? []), income] })
                )
                  setModal(null);
              }}
            />
          )}
          {modal?.kind === "asset-new" && (
            <AssetForm
              key={modal.ticker ?? "novo"}
              initialTicker={modal.ticker}
              taken={allAssets(p).map((a) => a.ticker)}
              busy={saveBusy}
              onSubmit={async (asset) => {
                if (
                  await save({
                    ...p,
                    customAssets: [...(p.customAssets ?? []), asset],
                  })
                )
                  setModal(null);
              }}
            />
          )}
          {modal?.kind === "fixed" && !hidden && (
            <FixedForm
              existing={p.fixedIncome.find((x) => x.id === modal.id)}
              busy={saveBusy}
              onDelete={
                modal.id
                  ? () => setModal({ kind: "delete-fixed", id: modal.id })
                  : undefined
              }
              onSubmit={async (r) => {
                if (
                  await save({
                    ...p,
                    fixedIncome: [
                      ...p.fixedIncome.filter((x) => x.id !== r.id),
                      r,
                    ],
                  })
                )
                  setModal(null);
              }}
            />
          )}
          {modal?.kind === "asset" && (
            <AssetDetail
              ticker={modal.ticker!}
              market={market}
              position={t.rows.find((a) => a.ticker === modal.ticker)!}
              hidden={hidden}
              onAdd={() =>
                setModal({ kind: "transaction", ticker: modal.ticker })
              }
              onSell={() =>
                setModal({
                  kind: "transaction",
                  mode: "sell",
                  ticker: modal.ticker,
                })
              }
              onNews={() => {
                setNewsTicker(modal.ticker!);
                navigate("news");
                setModal(null);
              }}
            />
          )}
          {modal?.kind === "delete" && (
            <>
              <span className="eyebrow">CORRIGIR REGISTRO</span>
              <h2 id="modal-title">Excluir este registro?</h2>
              <p>
                Este registro deixará de compor a carteira. Para registrar uma
                venda, use Registrar venda: excluir uma compra não é uma venda.
              </p>
              <div className="dialog-actions">
                <button
                  className="button outline"
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button
                  className="button danger"
                  disabled={saveBusy}
                  onClick={async () => {
                    const next = {
                      ...p,
                      transactions: p.transactions.filter(
                        (t) => t.id !== modal.id,
                      ),
                      tradeHistory: p.tradeHistory?.filter(
                        (e) => e.id !== modal.id,
                      ),
                    };
                    if (ledgerIssues(next).length) {
                      setToast(
                        "Essa exclusão deixaria uma venda sem saldo. Exclua a venda primeiro.",
                      );
                      return;
                    }
                    if (await save(next)) setModal(null);
                  }}
                >
                  Excluir registro
                </button>
              </div>
            </>
          )}
          {modal?.kind === "delete-income" && (
            <>
              <h2 id="modal-title">Excluir registro de provento?</h2>
              <p>
                Esse valor deixará de compor o resultado do ativo. O patrimônio
                em custódia não é alterado.
              </p>
              <button
                className="button danger"
                disabled={saveBusy}
                onClick={async () => {
                  if (
                    await save({
                      ...p,
                      incomes: (p.incomes ?? []).filter(
                        (i) => i.id !== modal.id,
                      ),
                    })
                  )
                    setModal(null);
                }}
              >
                Excluir provento
              </button>
            </>
          )}
          {modal?.kind === "delete-fixed" && (
            <>
              <h2 id="modal-title">Excluir título de renda fixa?</h2>
              <p>O saldo deste título deixará de compor a carteira.</p>
              <button
                className="button danger"
                disabled={saveBusy}
                onClick={async () => {
                  if (
                    await save({
                      ...p,
                      fixedIncome: p.fixedIncome.filter(
                        (r) => r.id !== modal.id,
                      ),
                    })
                  )
                    setModal(null);
                }}
              >
                Excluir título
              </button>
            </>
          )}
          {modal?.kind === "paste-import" && (
            <>
              <h2 id="modal-title">Importar texto do backup</h2>
              <p>
                Cole o conteúdo de um backup do Atlas. Os dados serão conferidos
                antes da restauração.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const text = String(
                    new FormData(e.currentTarget).get("backup") ?? "",
                  );
                  await importData(
                    new File([text], "atlas-backup.json", {
                      type: "application/json",
                    }),
                  );
                }}
              >
                <label className="field">
                  Conteúdo do backup
                  <textarea
                    name="backup"
                    aria-label="Conteúdo do backup"
                    rows={8}
                    required
                    maxLength={2000000}
                  />
                </label>
                <button type="submit" className="button primary full">
                  Conferir dados do backup
                </button>
              </form>
            </>
          )}
          {modal?.kind === "import" && (
            <>
              <h2 id="modal-title">Restaurar este backup?</h2>
              <p>
                O arquivo contém{" "}
                {(window as any).__atlasImport?.transactions?.length ?? 0}{" "}
                posições e {(window as any).__atlasImport?.incomes?.length ?? 0}{" "}
                registros de proventos e{" "}
                {(window as any).__atlasImport?.tradeHistory?.length ?? 0}{" "}
                movimentações de compra e venda. A restauração substitui a
                carteira atual; exporte-a antes se quiser preservar seus
                registros.
              </p>
              <div className="dialog-actions">
                <button className="button outline" onClick={exportData}>
                  Exportar atual
                </button>
                <button
                  className="button primary"
                  disabled={saveBusy}
                  onClick={async () => {
                    const next = (window as any).__atlasImport;
                    if (await save(next)) {
                      delete (window as any).__atlasImport;
                      setModal(null);
                    }
                  }}
                >
                  Restaurar backup
                </button>
              </div>
            </>
          )}
          {modal?.kind === "account" && (
            <>
              <span className="eyebrow">MINHA CONTA</span>
              <h2 id="modal-title">Uma carteira só sua.</h2>
              <p>
                Este site é privado. Registros são salvos na nuvem e vinculados
                à sua conta.
              </p>
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  {account === "ready"
                    ? `Conectado como ${name}`
                    : "Entre para acessar seus registros."}
                </span>
              </div>
              {!demo && (
                <button
                  className="button outline"
                  onClick={() => {
                    setDemo(demoPortfolio(market));
                    setModal(null);
                  }}
                >
                  Explorar demonstração
                </button>
              )}
              {account !== "ready" ? (
                <a className="button primary" href={SIGN_IN_URL} target="_top">
                  Entrar
                </a>
              ) : (
                <a className="button outline" href={SIGN_OUT_URL} target="_top">
                  Sair da conta
                </a>
              )}
            </>
          )}
          {(modal?.kind === "method" || modal?.kind === "sources") && (
            <>
              <span className="eyebrow">TRANSPARÊNCIA</span>
              <h2 id="modal-title">
                {modal.kind === "method"
                  ? "Como orientamos seus aportes"
                  : "Fontes e atualização"}
              </h2>
              <div className="prose">
                <h3>Suas metas vêm primeiro</h3>
                <p>
                  Brasil {p.targets.br}%, renda fixa {p.targets.rf}%, exterior{" "}
                  {p.targets.etf}% e Bitcoin {p.targets.crypto}%, conforme você
                  definiu. Metas editáveis. Sem pesos específicos, a compra
                  mantém a proporção atual dos ativos da classe. Nenhuma divisão
                  é presumida.
                </p>
                <h3>Como o valor é distribuído</h3>
                <p>
                  Cada classe tem um nível: posição atual ÷ meta. O aporte vai
                  primeiro para o nível mais baixo e, ao alcançar o seguinte, as
                  duas sobem juntas. Assim, as classes que recebem terminam
                  igualmente perto da meta, e nenhuma venda é sugerida. Nas
                  ações brasileiras, preço, fundamentos e limites da Avaliação
                  definem as compras. Nas outras classes, a mesma regra vale
                  entre os ativos.
                </p>
                <p>
                  As quantidades respeitam as cotas inteiras da B3 e as frações
                  do exterior e do Bitcoin. O que o arredondamento deixar vai
                  para quem aceita frações ou para mais uma cota de quem couber.
                  Volatilidade e tendência são exibidas como informação e não
                  alteram os valores.
                </p>
                <h3>Métricas</h3>
                <p>
                  Volatilidade: desvio padrão amostral dos retornos logarítmicos
                  diários × √252 (√365 para Bitcoin). Tendência: variação em 126
                  intervalos diários de negociação, ou 183 dias para Bitcoin.
                  Queda máxima: maior perda de um pico até um fundo no histórico
                  de até 1 ano. Preços históricos ajustados pelo provedor quando
                  disponíveis.
                </p>
                <h3>Cotações e notícias</h3>
                <p>
                  Yahoo Finance: consulta a cada 60 segundos enquanto a aba está
                  visível. A fonte pode ter atrasos e bloqueios; o horário
                  exibido é o da cotação, em Brasília. A conexão usa uma
                  interface não oficial, sem garantia de disponibilidade.
                  Notícias: Google Notícias via RSS, com Bing Notícias e Yahoo
                  Finance como alternativas, consultadas a cada 5 minutos, com
                  links para as matérias. As alternativas podem incluir conteúdo
                  em inglês.
                </p>
                <h3>Câmbio e resultado</h3>
                <p>
                  Os ETFs internacionais preservam saldo, custo e dividendos em
                  dólares; a conversão atual em reais é exibida separadamente.
                  Sem o câmbio de compra, o custo e o resultado históricos em
                  reais ficam pendentes. O resultado por ativo é saldo na moeda
                  de origem menos custo mais proventos registrados. Dividendos
                  não são adicionados novamente ao patrimônio. Bitcoin pode ter
                  custo informado em reais. Renda fixa usa o saldo manual do
                  extrato; custo ausente permanece desconhecido. O resultado das
                  posições em carteira não inclui vendas, que aparecem à parte
                  em Resultado realizado. Impostos não são calculados. Cada ETF
                  conta na classe a que dá exposição: AUPO11 em renda fixa e
                  ABTC11 em Bitcoin, nas metas, nos resumos e nos filtros. O
                  ABTC11 segue a estratégia do próprio fundo, então sua variação
                  pode diferir da do BTC. Valores e rendimentos do extrato
                  recebido ficam preservados separadamente das cotações atuais.
                </p>
                <h3>Limites</h3>
                <p>
                  O simulador não avalia fundamentos, valor justo, risco de
                  crédito, liquidez, tributação nem seu perfil. Não executa
                  ordens e não garante retorno. Confirme preços e condições na
                  corretora.
                </p>
                <a
                  href="https://help.yahoo.com/kb/SLN2310.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Cobertura e atrasos — Yahoo Finance ↗
                </a>
                <a
                  href="https://www.investor.gov/introduction-investing/getting-started/asset-allocation"
                  target="_blank"
                  rel="noreferrer"
                >
                  Alocação e reequilíbrio — Investor.gov ↗
                </a>
              </div>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
function Strategy({
  portfolio,
  market,
  save,
  busy,
  onAddAsset,
}: {
  portfolio: Portfolio;
  market: Market;
  save: (p: Portfolio) => Promise<boolean>;
  busy: boolean;
  onAddAsset: () => void;
}) {
  const assets = allAssets(portfolio).filter((a) => !a.archived);
  const rows = useMemo(
      () => totals(portfolio, market).rows,
      [portfolio, market],
    ),
    heldOf = (ticker: string) =>
      rows.find((r) => r.ticker === ticker)?.value ?? 0;
  const [targets, setTargets] = useState(portfolio.targets),
    [weights, setWeights] = useState({
      ...portfolio.weights,
      ...evaluationSettings(portfolio).baseWeights,
    }),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    setTargets(portfolio.targets);
    setWeights({
      ...portfolio.weights,
      ...evaluationSettings(portfolio).baseWeights,
    });
    setDirty(false);
  }, [portfolio]);
  const sum = Object.values(targets).reduce((a, b) => a + b, 0),
    targetsValid = Math.abs(sum - 100) < 0.001,
    weightsValid = groups
      .filter((g) => g !== "rf")
      .every((g) =>
        ASSETS.some((a) => a.group === g && (weights[a.ticker] ?? 1) > 0),
      ),
    valid = targetsValid && weightsValid;
  return (
    <ValidatedForm
      busy={busy}
      onValidSubmit={async (e) => {
        e.preventDefault();
        if (valid)
          await save({
            ...portfolio,
            targets,
            weights,
            evaluation: {
              ...evaluationSettings(portfolio),
              baseWeights: Object.fromEntries(
                ASSETS.filter((a) => a.group === "br").map((a) => [
                  a.ticker,
                  weights[a.ticker] ?? 0,
                ]),
              ),
            },
          });
      }}
    >
      <section className="panel target-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">ALOCAÇÃO DEFINIDA POR VOCÊ</span>
            <h2>Suas metas de patrimônio</h2>
            <p>Percentuais por classe. O total deve ser 100%.</p>
          </div>
          <span className={"total-pill " + (valid ? "" : "invalid")}>
            {num(sum)}% / 100%
          </span>
        </div>
        <div className="target-grid">
          {groups.map((g) => (
            <label className="target-card" key={g}>
              <span>
                <i style={{ background: GROUPS[g].color }} />
                {GROUPS[g].name}
              </span>
              <div>
                <FormInput
                  name={"target-" + g}
                  aria-label={`Meta ${GROUPS[g].name}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  value={targets[g]}
                  onChange={(e) => {
                    setTargets({ ...targets, [g]: Number(e.target.value) });
                    setDirty(true);
                  }}
                />
                <span>%</span>
              </div>
              <small>do patrimônio total</small>
            </label>
          ))}
        </div>
        <div className="target-strip">
          {groups.map((g) => (
            <span
              key={g}
              style={{ width: targets[g] + "%", background: GROUPS[g].color }}
            />
          ))}
        </div>
      </section>
      <section className="panel weights-panel">
        <div className="panel-title">
          <div>
            <h2>Pesos dentro de cada classe</h2>
            <p>
              Sem pesos definidos, a compra mantém a proporção atual da classe.
              Ao definir um peso, os demais ativos da classe valem 1. Peso 0
              exclui dos novos aportes. Em renda fixa, a escolha do título é
              sua.
            </p>
          </div>
          <button type="button" className="button outline" onClick={onAddAsset}>
            <Plus size={15} />
            Cadastrar ativo
          </button>
        </div>
        <div className="weight-grid">
          {assets
            .filter((a) => a.group !== "rf")
            .map((a) => {
              const peers = assets.filter((x) => x.group === a.group),
                chosen = peers.some((x) => weights[x.ticker] !== undefined),
                anyHeld = peers.some((x) => heldOf(x.ticker) > 0),
                weightOf = (ticker: string) =>
                  chosen
                    ? (weights[ticker] ?? 1)
                    : anyHeld
                      ? heldOf(ticker)
                      : 1,
                total = peers.reduce((s, x) => s + weightOf(x.ticker), 0);
              return (
                <label className="weight-item" key={a.ticker}>
                  <Mark ticker={a.ticker} size={30} />
                  <span>
                    <b>{a.ticker}</b>
                    <small>
                      {total ? num((weightOf(a.ticker) / total) * 100, 1) : 0}%
                      da classe{chosen ? "" : " hoje"}
                    </small>
                  </span>
                  <FormInput
                    name={"weight-" + a.ticker}
                    aria-label={`Peso ${a.ticker}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder={chosen ? "1" : "Atual"}
                    value={weights[a.ticker] ?? ""}
                    onChange={(e) => {
                      const next = { ...weights };
                      if (e.target.value === "") delete next[a.ticker];
                      else next[a.ticker] = Number(e.target.value);
                      setWeights(next);
                      setDirty(true);
                    }}
                  />
                </label>
              );
            })}
        </div>
        <div className="save-row">
          <span className={valid ? "muted" : "negative"}>
            {valid
              ? dirty
                ? "Você tem alterações para salvar."
                : "Metas alinhadas com sua estratégia."
              : !targetsValid
                ? "Ajuste as metas para somar 100%."
                : "Defina pelo menos um peso positivo em cada classe."}
          </span>
          <button
            className="button primary"
            disabled={!valid || busy || !dirty}
          >
            {busy ? "Salvando…" : "Salvar estratégia"}
            <Check size={15} />
          </button>
        </div>
      </section>
    </ValidatedForm>
  );
}
function AssetDetail({
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
  position: any;
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
        <Mark ticker={ticker} size={48} />
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
                formatter={(v: any) => money(Number(v), a.currency)}
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
