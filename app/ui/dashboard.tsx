"use client";
import { lazy, Suspense, useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowDownLeft,
  Newspaper,
  SlidersHorizontal,
  Plus,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Globe2,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
  Download,
  Upload,
  Info,
  Target,
  ArrowRight,
  Menu,
  ExternalLink,
  Compass,
  AlertCircle,
  Scale,
} from "lucide-react";
import {
  allAssets,
  EMPTY,
  isTrackedTicker,
  trackedPortfolio,
  today,
  totals,
  allocationPlan,
  type Portfolio,
  type Market,
} from "../lib/model";
import { money, num } from "../lib/format";
import { portfolioSchema } from "../lib/validation";
import { ledgerIssues, migratePortfolio } from "../lib/trade-history";
import { MovementHistory } from "./movement-history";
import { AssetForm } from "./asset-form";
const ImportPanel = lazy(() =>
  import("./import-panel").then((m) => ({ default: m.ImportPanel })),
);
import { Change } from "./change";
import { ContributionPreview } from "./contribution-preview";
import { ContributionPlan } from "./contribution-plan";
import { PortfolioMap } from "./portfolio-map";
import { PerformanceChart } from "./performance-chart";
import { useCdi } from "./use-cdi";
import { useMarket } from "./use-market-history";
import { CurrencySummary } from "./currency-summary";
import { AssetTable } from "./asset-table";
import { IncomePanel } from "./income-panel";
import { StatementPanel } from "./statement-panel";
import { NewsSection } from "./news-section";
import { MethodContent } from "./method-content";
import { FixedIncomePanel } from "./fixed-income-panel";
import { Strategy, strategyKey } from "./strategy";
import { AssetDetail } from "./asset-detail";
import { demoPortfolio } from "./demo-portfolio";
import { ThemeToggle } from "./theme-toggle";
const EvaluationPanel = lazy(() =>
  import("./evaluation-panel").then((m) => ({ default: m.EvaluationPanel })),
);
import { TransactionForm, FixedForm, IncomeForm } from "./investment-forms";
const blankMarket: Market = { quotes: {}, errors: [], fetchedAt: "" };
const nav = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "portfolio", label: "Minha carteira", icon: Wallet },
  { id: "evaluation", label: "Avaliação", icon: Scale },
  { id: "contributions", label: "Aportes", icon: ArrowDownLeft },
  { id: "import", label: "Importar", icon: Upload },
  { id: "news", label: "Notícias", icon: Newspaper },
];
/** Atalhos da barra inferior do celular. O restante fica no menu. */
const TABS = [
  { id: "overview", label: "Visão", icon: LayoutDashboard },
  { id: "portfolio", label: "Carteira", icon: Wallet },
  { id: "contributions", label: "Aportes", icon: ArrowDownLeft },
  { id: "evaluation", label: "Avaliação", icon: Scale },
];
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
    [pendingImport, setPendingImport] = useState<Portfolio | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null),
    marketBusy = useRef(false),
    sidebarRef = useRef<HTMLElement>(null),
    menuRef = useRef<HTMLButtonElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    extraRef = useRef(""),
    compactRef = useRef(false);
  const p = demo ?? portfolio,
    { market, loading: historyLoading } = useMarket(p, quotes),
    t = useMemo(() => totals(p, market), [p, market]),
    classPlan = allocationPlan(p, market, budget);
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
      // Voltar pelo navegador não pode deixar a tabela com o filtro da página anterior.
      setFilter("all");
      setQuery("");
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
        compactRef.current = query.matches;
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
        const j: {
          portfolio: Portfolio;
          changes?: { ticker: string; before: number; after: number }[];
          revision: number;
          name: string;
          error?: string;
        } = await r.json();
        if (!r.ok) {
          setAccount(r.status === 401 ? "signin" : "error");
          if (r.status !== 401) setToast(j.error ?? "");
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
      const j: Market = await r.json();
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
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (modal) {
      lastFocus.current =
        compactRef.current &&
        sidebarRef.current?.contains(document.activeElement)
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
      const j: { revision: number; error?: string } = await r.json();
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
      setPendingImport(
        migratePortfolio(portfolioSchema.parse(j.portfolio) as Portfolio),
      );
      setModal({ kind: "import" });
    } catch {
      setToast("Esse arquivo não é um backup válido do Atlas.");
    }
  }
  const overview = page === "overview";
  const cdi = useCdi();

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
        <button
          className="brand"
          aria-label="Atlas, ir para a visão geral"
          onClick={() => navigate("overview")}
        >
          <span className="brand-icon">
            <Compass size={27} strokeWidth={1.5} />
          </span>
          <span>
            atlas<span className="brand-period">.</span>
          </span>
        </button>
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
                    historyLoading={historyLoading}
                    cdiError={cdi.cdiError}
                    hidden={hidden}
                    cdiBusy={cdi.cdiBusy}
                    onRetryCdi={cdi.retryCdi}
                  />
                  <div className="overview-aside">
                    <PortfolioMap
                      portfolio={p}
                      summary={t}
                      hidden={hidden}
                      onAsset={(ticker) => setModal({ kind: "asset", ticker })}
                      onTargets={() => navigate("strategy")}
                    />
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
                <NewsSection
                  ticker={newsTicker}
                  onTicker={setNewsTicker}
                  onAll={() => navigate("news")}
                />
              </>
            )}
            {portfolioReady && page === "portfolio" && (
              <>
                {table(true)}
                <FixedIncomePanel
                  portfolio={p}
                  hidden={hidden}
                  onEdit={(id) => setModal({ kind: "fixed", id })}
                />
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
                onRegister={(ticker, quantity) =>
                  setModal({ kind: "transaction", ticker, quantity })
                }
                onContributions={() => navigate("contributions")}
              />
            )}
            {portfolioReady && page === "contributions" && (
              <>
                <ContributionPlan
                  portfolio={p}
                  market={market}
                  hidden={hidden}
                  budget={budget}
                  setBudget={setBudget}
                  onRegister={(ticker, quantity) =>
                    setModal({ kind: "transaction", ticker, quantity })
                  }
                  onFixed={() => setModal({ kind: "fixed" })}
                  onStrategy={() => navigate("strategy")}
                  onEvaluation={() => navigate("evaluation")}
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
            {page === "news" && (
              <NewsSection
                full
                ticker={newsTicker}
                onTicker={setNewsTicker}
                onAll={() => navigate("news")}
              />
            )}
            {portfolioReady && page === "strategy" && (
              <>
                <Strategy
                  key={strategyKey(p)}
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
        <nav className="tabbar" aria-label="Atalhos">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
          <button
            aria-controls="main-navigation"
            aria-expanded={mobile}
            className={TABS.some((tab) => tab.id === page) ? "" : "active"}
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
            Mais
          </button>
        </nav>
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
                O arquivo contém {pendingImport?.transactions.length ?? 0}{" "}
                posições e {pendingImport?.incomes?.length ?? 0} registros de
                proventos e {pendingImport?.tradeHistory?.length ?? 0}{" "}
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
                  disabled={saveBusy || !pendingImport}
                  onClick={async () => {
                    if (pendingImport && (await save(pendingImport))) {
                      setPendingImport(null);
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
            <MethodContent kind={modal.kind} targets={p.targets} />
          )}
        </div>
      </dialog>
    </div>
  );
}
