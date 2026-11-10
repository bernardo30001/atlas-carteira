import type { Fundamentals, PeerReference } from "./evaluation-config.ts";
const decode = (s: string) =>
  s
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, v) =>
      String.fromCodePoint(
        v[0].toLowerCase() === "x" ? parseInt(v.slice(1), 16) : Number(v),
      ),
    )
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
const text = (s: string) =>
  decode(
    s
      .replace(
        /<span\b[^>]*class=["'][^"']*\bhelp\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
        "",
      )
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
const key = (s: string) =>
  text(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
export function providerNumber(raw: string): number | null {
  const s = text(raw).replace(/%|\s/g, "");
  if (!/^-?\d[\d.,]*$/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && Math.abs(n) < 1e16 ? n : null;
}
const date = (s: string) => {
  const m = text(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = `${m[3]}-${m[2]}-${m[1]}`;
  return Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d
    ? d
    : null;
};
export function parseFundamentals(html: string, ticker: string): Fundamentals {
  const cells = [...html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(
    (m) => ({ attrs: m[1], html: m[2] }),
  );
  const data = new Map<string, string>();
  for (let i = 0; i < cells.length - 1; i++) {
    if (
      /\bclass=["'][^"']*\blabel\b/i.test(cells[i].attrs) &&
      /\bclass=["'][^"']*\bdata\b/i.test(cells[i + 1].attrs)
    ) {
      const k = key(cells[i].html);
      if (!data.has(k)) data.set(k, cells[i + 1].html);
    }
  }
  const raw = (k: string) => data.get(key(k)) ?? "",
    num = (k: string) => providerNumber(raw(k));
  if (text(raw("Papel")).toUpperCase() !== ticker || !(num("Cotação")! > 0))
    throw Error("Indicadores inválidos");
  const sector = text(raw("Setor")),
    segmentId = raw("Subsetor").match(/[?&]segmento=(\d+)/)?.[1] ?? "";
  const financial = /financeir|segur|previd/i.test(sector);
  const ebit = num("EBIT"),
    debt = num("Dív. Líquida");
  return {
    ticker,
    company: text(raw("Empresa")),
    sector,
    segmentId,
    sourcePrice: num("Cotação"),
    quoteDate: date(raw("Data últ cot")),
    balanceDate: date(raw("Últ balanço processado")),
    pe: num("P/L"),
    pb: num("P/VP"),
    eps: num("LPA"),
    bvps: num("VPA"),
    roe: num("ROE"),
    roic: num("ROIC"),
    netDebtEbit:
      !financial && ebit !== null && ebit > 0 && debt !== null
        ? debt / ebit
        : null,
    netDebtEquity: num("Dív Líq / Patrim"),
    growth: num("Cres. Rec (5a)"),
    liquidity: num("Vol $ méd (2m)"),
    financial,
    sourceUrl: `https://www.fundamentus.com.br/detalhes.php?papel=${ticker}`,
  };
}
export type ScreeningRow = {
  ticker: string;
  pe: number | null;
  liquidity: number;
};
export function parseScreening(html: string): ScreeningRow[] {
  const rows: ScreeningRow[] = [];
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (c) => c[1],
    );
    if (cells.length < 19) continue;
    const ticker = text(cells[0]).toUpperCase();
    if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) continue;
    rows.push({
      ticker,
      pe: providerNumber(cells[2]),
      liquidity: providerNumber(cells[18]) ?? 0,
    });
  }
  return rows
    .sort((a, b) => b.liquidity - a.liquidity)
    .filter(
      (r, i, all) =>
        all.findIndex((s) => s.ticker.slice(0, 4) === r.ticker.slice(0, 4)) ===
        i,
    );
}
export function freshFundamentals(
  f: Fundamentals | undefined,
  now = Date.now(),
) {
  if (!f?.quoteDate || !f.balanceDate) return false;
  const age = (d: string) => (now - Date.parse(d + "T12:00:00Z")) / 86400000;
  return (
    age(f.quoteDate) >= -1 &&
    age(f.quoteDate) <= 10 &&
    age(f.balanceDate) >= -1 &&
    age(f.balanceDate) <= 210
  );
}
const percentile = (v: number[], q: number) => {
  const sorted = v.toSorted((a, b) => a - b),
    i = (sorted.length - 1) * q,
    lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
};
export function peerReference(
  target: Fundamentals,
  all: Fundamentals[],
  now = Date.now(),
): PeerReference | undefined {
  const peers = all
    .filter(
      (f) =>
        f.segmentId === target.segmentId &&
        f.ticker.slice(0, 4) !== target.ticker.slice(0, 4) &&
        freshFundamentals(f, now) &&
        f.pe !== null &&
        f.pe >= 2 &&
        f.pe <= 60 &&
        f.eps !== null &&
        f.eps > 0 &&
        f.roe !== null &&
        f.roe > 0 &&
        (f.liquidity ?? 0) >= 200000,
    )
    .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
    .filter(
      (f, i, a) =>
        a.findIndex((s) => s.ticker.slice(0, 4) === f.ticker.slice(0, 4)) === i,
    );
  if (peers.length < 3) return undefined;
  const pes = peers.map((f) => f.pe!),
    roes = peers.map((f) => f.roe!);
  return {
    tickers: peers.map((f) => f.ticker),
    medianPE: percentile(pes, 0.5),
    lowPE: percentile(pes, 0.25),
    highPE: percentile(pes, 0.75),
    medianROE: percentile(roes, 0.5),
    oldestQuote: peers.map((f) => f.quoteDate!).sort()[0],
    oldestBalance: peers.map((f) => f.balanceDate!).sort()[0],
    sourceUrls: peers.map((f) => f.sourceUrl),
  };
}
