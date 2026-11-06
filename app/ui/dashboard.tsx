"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowDownLeft,
  Newspaper,
  SlidersHorizontal,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
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
  TrendingUp,
  Activity,
  ArrowRight,
  Trash2,
  Menu,
  Bitcoin,
  Landmark,
  Building2,
  ExternalLink,
  HelpCircle,
  Compass,
  AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ASSETS,
  GROUPS,
  EMPTY,
  today,
  totals,
  allocationPlan,
  assetPlan,
  transactionCurrency,
  transactionCost,
  type Group,
  type Portfolio,
  type Market,
} from "../lib/model";
import { fixed, money, num, plainPercent } from "../lib/format";
import { portfolioSchema } from "../lib/validation";
import { migratePortfolio } from "../lib/trade-history";
import { Change } from "./change";
import { ContributionPreview } from "./contribution-preview";
import { ValidatedForm, FormInput } from "./validated-form";
import { PerformanceChart } from "./performance-chart";
import { usePerformance } from "./use-performance";
import { CurrencySummary } from "./currency-summary";
import { AssetTable } from "./asset-table";
import { IncomePanel } from "./income-panel";
import { StatementPanel } from "./statement-panel";
import { NewsFilters } from "./news-filters";
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
  { id: "contributions", label: "Aportes", icon: ArrowDownLeft },
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
function demoPortfolio(): Portfolio {
  return {
    ...EMPTY,
    transactions: [
      ["WEGE3", 80, 34],
      ["ITUB4", 150, 29],
      ["VALE3", 70, 50],
      ["ALUP11", 80, 25],
      ["SPHQ", 10, 55],
      ["VEA", 15, 46],
      ["VNQ", 10, 80],
      ["IAU", 8, 43],
      ["VWO", 10, 42],
      ["BTC", 0.018, 80000],
    ].map(([ticker, quantity, price]) => ({
      id: crypto.randomUUID(),
      ticker: String(ticker),
      kind: "opening",
      quantity: Number(quantity),
      price: Number(price),
      fx: ASSETS.find((a) => a.ticker === ticker)?.currency === "USD" ? 5.1 : 1,
      fees: 0,
      date: today(),
      note: "Demonstração — posição fictícia",
    })),
    fixedIncome: [
      {
        id: crypto.randomUUID(),
        name: "CDB · exemplo fictício",
        cost: 18000,
        value: 19150,
        date: today(),
        updatedAt: today(),
      },
    ],
  };
}
export default function Dashboard() {
  const [page, setPage] = useState("overview"),
    [portfolio, setPortfolio] = useState<Portfolio>(EMPTY),
    [revision, setRevision] = useState(0),
    [changes, setChanges] = useState<
      { ticker: string; before: number; after: number }[]
    >([]),
    [market, setMarket] = useState<Market>(blankMarket),
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
  const dialogRef = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null),
    marketBusy = useRef(false),
    sidebarRef = useRef<HTMLElement>(null),
    menuRef = useRef<HTMLButtonElement>(null),
    importRef = useRef<HTMLInputElement>(null);
  const p = demo ?? portfolio,
    t = useMemo(() => totals(p, market), [p, market]),
    classPlan = allocationPlan(p, market, budget),
    suggestions = assetPlan(p, market, budget),
    fx = market.quotes.USD?.price;
  const displayMoney = (v: number | null) =>
    hidden ? "••••••" : v === null ? "Não informado" : money(v);
  const portfolioReady = !!demo || account === "ready";
  const hasPositions =
    p.transactions.length > 0 ||
    p.fixedIncome.length > 0 ||
    (p.tradeHistory?.length ?? 0) > 0;
  const navigate = (id: string) => {
    setPage(id);
    setMobile(false);
    setFilter("all");
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
      const r = await fetch("/api/market");
      if (!r.ok) throw Error();
      const j: any = await r.json();
      setMarket(j);
      setMarketError(
        j.errors.length
          ? `Sem atualização: ${j.errors.join(", ")}. Dados anteriores, quando disponíveis, estão marcados.`
          : "",
      );
    } catch {
      setMarket((old) => ({
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
  useEffect(() => {
    refreshMarket();
    const timer = setInterval(() => {
      if (!document.hidden) refreshMarket();
    }, 60000);
    return () => clearInterval(timer);
  }, []);
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
  const performance = usePerformance(
    account === "ready" && !demo,
    revision,
    market.fetchedAt,
  );

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
          <div className="strategy-mini">
            <div>
              <span className="small-icon">
                <Target size={18} />
              </span>
              <span>Um plano. Mais clareza.</span>
            </div>
            <p>Suas metas guiam cada novo aporte.</p>
            <button onClick={() => navigate("strategy")}>
              Revisar estratégia <ArrowUpRight size={14} />
            </button>
          </div>
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
                    : page === "contributions"
                      ? "Seu próximo passo."
                      : page === "news"
                        ? "O mercado no seu radar."
                        : "Uma direção para investir."}
              </h1>
              <p>
                {overview
                  ? "Clareza para acompanhar. Estratégia para crescer."
                  : page === "portfolio"
                    ? "Acompanhe suas posições e a distribuição do seu patrimônio."
                    : page === "contributions"
                      ? "Planeje, registre e acompanhe a construção do seu patrimônio."
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
                <b>Modo demonstração.</b> Posições fictícias, cotações da fonte
                de mercado. Nenhum dado real é alterado.
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
              <a href="/signin-with-chatgpt?return_to=/" target="_top">
                Entrar com ChatGPT <ArrowRight size={15} />
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
              <div className="overview-grid">
                <PerformanceChart
                  portfolio={p}
                  market={market}
                  data={performance.data}
                  rates={performance.rates}
                  busy={performance.busy}
                  cdiError={performance.cdiError}
                  demo={!!demo}
                  hidden={hidden}
                  cdiBusy={performance.cdiBusy}
                  onRetryCdi={performance.retryCdi}
                  onRetryHistory={performance.retryHistory}
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
                          background: `conic-gradient(${t.missing.length ? "#e7ebe5 0% 100%" : donutSegments})`,
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
              {!hasPositions && (
                <div className="onboarding">
                  <span className="onboard-icon">
                    <Wallet size={24} />
                  </span>
                  <div>
                    <h3>Sua estratégia já está aqui. Agora, sua carteira.</h3>
                    <p>
                      Cadastre as posições que você já tem para ver o patrimônio
                      e os desvios reais.
                    </p>
                  </div>
                  <button
                    className="button outline"
                    onClick={() => setDemo(demoPortfolio())}
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
                              <b>{hidden ? "Título de renda fixa" : r.name}</b>
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
          {portfolioReady && page === "contributions" && (
            <>
              <div className="planner-grid">
                <section className="panel planner">
                  <div className="panel-title">
                    <div>
                      <span className="eyebrow">SIMULADOR DE APORTES</span>
                      <h2>Onde investir agora?</h2>
                      <p>Suas metas são o ponto de partida.</p>
                    </div>
                    <Target size={23} />
                  </div>
                  <label className="field">
                    Valor disponível (R$)
                    <input
                      type={hidden ? "text" : "number"}
                      readOnly={hidden}
                      min="0"
                      max="1000000000"
                      value={hidden ? "••••••" : budget}
                      onChange={(e) =>
                        setBudget(
                          Math.min(1e9, Math.max(0, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                  <div
                    className="quick-budgets"
                    role="group"
                    aria-label="Valores de aporte sugeridos"
                  >
                    {[500, 1000, 2500, 5000].map((v) => (
                      <button
                        aria-pressed={budget === v}
                        className={budget === v ? "chip active" : "chip"}
                        key={v}
                        onClick={() => setBudget(v)}
                      >
                        {money(v)}
                      </button>
                    ))}
                  </div>
                  {t.missing.length ? (
                    <div className="notice warn">
                      Aguarde as cotações ausentes para calcular a distribuição.
                    </div>
                  ) : (
                    <div className="class-plan">
                      {classPlan.map((g) => (
                        <div key={g.group}>
                          <span>
                            <i style={{ background: GROUPS[g.group].color }} />
                            {GROUPS[g.group].name}
                          </span>
                          <b>{displayMoney(g.amount)}</b>
                          <small>
                            {budget ? fixed((g.amount / budget) * 100, 1) : 0}%
                            do aporte
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setModal({ kind: "method" })}
                  >
                    Como a sugestão é calculada <Info size={15} />
                  </button>
                </section>
                <section className="panel planner-summary">
                  <span className="eyebrow">SUA BÚSSOLA</span>
                  <h2>
                    Consistência antes
                    <br />
                    de adivinhação.
                  </h2>
                  <p>
                    O aporte prioriza as classes abaixo do objetivo. Dentro de
                    cada classe, o desvio de peso recebe um ajuste moderado por
                    volatilidade e tendência.
                  </p>
                  <div>
                    <ShieldCheck size={18} />
                    <span>Sem vendas automáticas</span>
                  </div>
                  <div>
                    <Activity size={18} />
                    <span>Métricas calculadas com até 1 ano de histórico</span>
                  </div>
                  <div>
                    <Info size={18} />
                    <span>Renda fixa exige escolha e cotação no seu banco</span>
                  </div>
                  <small>
                    Não considera objetivos pessoais, tributação, liquidez ou
                    análise de fundamentos. A decisão final é sua.
                  </small>
                </section>
              </div>
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Distribuição sugerida por ativo</h2>
                    <p>
                      Pesos iguais dentro de cada classe por padrão; ajuste em
                      Estratégia e metas.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("strategy")}
                  >
                    Ajustar pesos <ArrowRight size={15} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ativo</th>
                        <th>Orçamento</th>
                        <th>Quantidade estimada</th>
                        <th>Volatilidade anual</th>
                        <th>Queda máx. em 1 ano</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.ticker}>
                          <td>
                            <div className="asset-name">
                              <Mark ticker={s.ticker} />
                              <span>
                                <b>{s.ticker}</b>
                                <small>{GROUPS[s.group].short}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <b>{displayMoney(s.amount)}</b>
                          </td>
                          <td>
                            {hidden
                              ? "••••••"
                              : s.quantity > 0
                                ? num(s.quantity, 8)
                                : s.quote
                                  ? "Saldo insuficiente"
                                  : "Sem cotação"}
                            <small>
                              {s.quantity > 0
                                ? displayMoney(s.executable) + " estimados"
                                : "Aguarde ou ajuste o valor"}
                            </small>
                          </td>
                          <td>
                            {s.quote?.volatility != null
                              ? plainPercent(s.quote.volatility)
                              : "—"}
                          </td>
                          <td className="negative">
                            {s.quote?.drawdown != null
                              ? plainPercent(s.quote.drawdown)
                              : "—"}
                          </td>
                          <td>
                            <button
                              disabled={!s.quantity}
                              className="text-button"
                              onClick={() =>
                                setModal({
                                  kind: "transaction",
                                  ticker: s.ticker,
                                  quantity: s.quantity,
                                })
                              }
                            >
                              Registrar <Plus size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(classPlan.find((g) => g.group === "rf")?.amount ?? 0) >
                        0 && (
                        <tr>
                          <td>
                            <div className="asset-name">
                              <Mark ticker="RF" />
                              <span>
                                <b>Renda fixa</b>
                                <small>Escolha o título no seu banco</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <b>
                              {displayMoney(
                                classPlan.find((g) => g.group === "rf")!.amount,
                              )}
                            </b>
                          </td>
                          <td colSpan={3}>
                            Compare taxa líquida, emissor, vencimento e
                            liquidez.
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => setModal({ kind: "fixed" })}
                            >
                              Registrar <Plus size={14} />
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {!classPlan.length && (
                    <Empty
                      icon={Target}
                      title="Defina um valor para simular"
                      text="Informe um aporte positivo e aguarde as cotações."
                    />
                  )}
                </div>
                <div className="panel-foot">
                  Ativos da B3 em unidades inteiras; ETFs americanos com frações
                  de até 6 casas; BTC até 8. Confira a aceitação de frações na
                  corretora. Valores estimados sem taxas.
                </div>
              </section>
              <section className="panel history-panel">
                <div className="panel-title">
                  <div>
                    <h2>Histórico de registros</h2>
                    <p>Posições iniciais e novos aportes na sua carteira.</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Exportar histórico"
                    onClick={exportData}
                  >
                    <Download size={17} />
                  </button>
                </div>
                {p.transactions.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Ativo / Tipo</th>
                          <th>Quantidade</th>
                          <th>Preço unitário</th>
                          <th>Investido · moeda de origem</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {[...p.transactions]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((tx) => (
                            <tr key={tx.id}>
                              <td>
                                {new Date(
                                  tx.date + "T12:00:00",
                                ).toLocaleDateString("pt-BR")}
                              </td>
                              <td>
                                <b>{tx.ticker}</b>
                                <small>
                                  {tx.kind === "opening"
                                    ? "Posição inicial"
                                    : "Aporte"}
                                  {tx.note
                                    ? hidden
                                      ? " · Observação oculta"
                                      : " · " + tx.note
                                    : ""}
                                </small>
                              </td>
                              <td>{hidden ? "•••" : num(tx.quantity, 8)}</td>
                              <td>
                                {hidden
                                  ? "•••"
                                  : money(tx.price, transactionCurrency(tx))}
                              </td>
                              <td>
                                {hidden
                                  ? "••••••"
                                  : money(
                                      transactionCost(tx),
                                      transactionCurrency(tx),
                                    )}
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Excluir registro de ${tx.ticker}`}
                                  onClick={() =>
                                    setModal({ kind: "delete", id: tx.id })
                                  }
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={ArrowDownLeft}
                    title="O primeiro registro é o começo"
                    text="Cadastre uma posição atual ou registre uma nova compra."
                    action={
                      <button
                        className="button primary"
                        onClick={() => setModal({ kind: "transaction" })}
                      >
                        <Plus size={15} />
                        Adicionar registro
                      </button>
                    }
                  />
                )}
              </section>
            </>
          )}
          {page === "news" && newsBlock(true)}
          {portfolioReady && page === "strategy" && (
            <>
              <Strategy portfolio={p} save={save} busy={saveBusy} />
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
                      O orçamento considera o patrimônio após o aporte. As
                      classes abaixo da meta dividem o valor proporcionalmente
                      ao déficit, sem sugerir vendas.
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <h3>Risco e tendência</h3>
                    <p>
                      O peso de cada ativo usa o déficit × (0,80 + 0,15 × 1/(1 +
                      volatilidade/100) + 0,05 × tendência limitada entre −1 e
                      1). A alocação guia a sugestão.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <h3>Sem falsas garantias</h3>
                    <p>
                      Histórico não prevê retorno. O painel não avalia preço
                      justo, fundamentos, impostos, perfil de risco ou recomenda
                      um produto de renda fixa.
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
              key={modal.ticker ?? "new"}
              ticker={modal.ticker}
              quantity={modal.quantity}
              market={market}
              busy={saveBusy}
              onSubmit={async (tx) => {
                if (await save({ ...p, transactions: [...p.transactions, tx] }))
                  setModal(null);
              }}
            />
          )}
          {modal?.kind === "income" && !hidden && (
            <IncomeForm
              ticker={modal.ticker}
              busy={saveBusy}
              onSubmit={async (income) => {
                if (
                  await save({ ...p, incomes: [...(p.incomes ?? []), income] })
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
                A quantidade e o custo desse registro deixarão de compor a
                carteira. Esta ação não representa uma venda.
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
                    if (
                      await save({
                        ...p,
                        transactions: p.transactions.filter(
                          (t) => t.id !== modal.id,
                        ),
                      })
                    )
                      setModal(null);
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
                à sua conta ChatGPT.
              </p>
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  {account === "ready"
                    ? `Conectado como ${name}`
                    : "Entre para acessar seus registros."}
                </span>
              </div>
              {account !== "ready" ? (
                <a
                  className="button primary"
                  href="/signin-with-chatgpt?return_to=/"
                  target="_top"
                >
                  Entrar com ChatGPT
                </a>
              ) : (
                <a
                  className="button outline"
                  href="/signout-with-chatgpt?return_to=/"
                  target="_top"
                >
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
                  definiu. Metas editáveis. Na ausência de pesos específicos, os
                  ativos de uma classe têm pesos iguais.
                </p>
                <h3>Como o valor é distribuído</h3>
                <p>
                  Déficit por classe = máximo entre zero e (patrimônio + aporte)
                  × meta − posição atual. O orçamento é dividido
                  proporcionalmente aos déficits. Dentro da classe, o déficit
                  por ativo recebe ajuste moderado por risco e tendência.
                </p>
                <p>
                  Fator = 0,80 + 0,15/(1 + volatilidade anual/100) + 0,05 ×
                  limite(tendência 6m/100, −1, 1). Sem histórico suficiente, o
                  componente ausente é neutro. Os percentuais de classes
                  continuam preservados. Pode restar saldo após arredondar as
                  quantidades.
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
                  não são adicionados novamente ao patrimônio. Bitcoin direto
                  pode ter custo informado em reais. Renda fixa usa o saldo
                  manual do extrato; custo ausente permanece desconhecido. Não
                  inclui impostos, vendas ou ganhos realizados. AUPO11 entra em
                  renda fixa; ABTC11 entra em criptomoedas para as metas, sem
                  presumir exposição 100% a BTC em seu fundo. Valores e
                  rendimentos do extrato recebido ficam preservados
                  separadamente das cotações atuais.
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
  save,
  busy,
}: {
  portfolio: Portfolio;
  save: (p: Portfolio) => Promise<boolean>;
  busy: boolean;
}) {
  const [targets, setTargets] = useState(portfolio.targets),
    [weights, setWeights] = useState(portfolio.weights),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    setTargets(portfolio.targets);
    setWeights(portfolio.weights);
    setDirty(false);
  }, [portfolio]);
  const sum = Object.values(targets).reduce((a, b) => a + b, 0),
    valid = Math.abs(sum - 100) < 0.001;
  return (
    <ValidatedForm
      busy={busy}
      onValidSubmit={async (e) => {
        e.preventDefault();
        if (valid) await save({ ...portfolio, targets, weights });
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
              Peso 1 divide a meta igualmente. Peso 0 exclui dos novos aportes.
              Renda fixa é planejada por classe, sem indicação automática de
              título.
            </p>
          </div>
        </div>
        <div className="weight-grid">
          {ASSETS.filter((a) => a.group !== "rf").map((a) => {
            const total = ASSETS.filter((x) => x.group === a.group).reduce(
              (s, x) => s + (weights[x.ticker] ?? 1),
              0,
            );
            return (
              <label className="weight-item" key={a.ticker}>
                <Mark ticker={a.ticker} size={30} />
                <span>
                  <b>{a.ticker}</b>
                  <small>
                    {total
                      ? num(((weights[a.ticker] ?? 1) / total) * 100, 1)
                      : 0}
                    % da classe
                  </small>
                </span>
                <FormInput
                  name={"weight-" + a.ticker}
                  aria-label={`Peso ${a.ticker}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={weights[a.ticker] ?? 1}
                  onChange={(e) => {
                    setWeights({
                      ...weights,
                      [a.ticker]: Number(e.target.value),
                    });
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
              : "Ajuste as metas para somar 100%."}
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
  onNews,
}: {
  ticker: string;
  market: Market;
  position: any;
  hidden: boolean;
  onAdd: () => void;
  onNews: () => void;
}) {
  const a = ASSETS.find((a) => a.ticker === ticker)!,
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
          ? `Yahoo Finance · ${datetime(q.time)} · atraso ${q.delay === null ? "não informado" : q.delay + " min"}`
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
                stroke={a.color}
                fill={a.color + "15"}
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
                ? money(position.result, position.primaryCurrency)
                : "Não disponível"}
          </b>
        </div>
      </div>
      <div className="dialog-actions">
        <button className="button outline" onClick={onNews}>
          <Newspaper size={16} />
          Notícias
        </button>
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          Registrar aporte
        </button>
      </div>
    </>
  );
}
