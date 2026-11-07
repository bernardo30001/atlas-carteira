export type CdiPoint = { date: string; rate: number };
export type CdiResponse = {
  points: CdiPoint[];
  source: string;
  updatedAt: string;
  stale?: boolean;
  error?: string;
};
let cached: CdiResponse | undefined,
  checked = 0,
  pending: Promise<CdiResponse> | undefined;
export async function loadCdi(force = false): Promise<CdiResponse> {
  if (
    !force &&
    cached &&
    Date.now() - checked < (cached.error ? 60000 : 3600000)
  )
    return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const end = new Date(),
        start = new Date(end.getTime() - 1100 * 86400000),
        format = (d: Date) =>
          `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${format(start)}&dataFinal=${format(end)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("Fonte indisponível");
      const rows = (await r.json()) as { data: string; valor: string }[];
      if (!Array.isArray(rows)) throw new Error("Resposta inválida");
      const points = rows
        .map((p) => {
          const [d, m, y] = p.data.split("/");
          return {
            date: `${y}-${m}-${d}`,
            rate: Number(p.valor.replace(",", ".")),
          };
        })
        .filter(
          (p) =>
            /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
            Number.isFinite(p.rate) &&
            p.rate >= 0 &&
            p.rate < 5,
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!points.length) throw new Error("Sem dados");
      cached = {
        points,
        source: "Banco Central · SGS 12 · CDI diário",
        updatedAt: new Date().toISOString(),
      };
      checked = Date.now();
      return cached;
    } catch {
      checked = Date.now();
      cached = cached
        ? { ...cached, stale: true, error: "Não foi possível atualizar o CDI." }
        : {
            points: [],
            source: "Banco Central · SGS 12",
            updatedAt: new Date().toISOString(),
            error:
              "CDI indisponível. A renda fixa sem histórico não será presumida.",
          };
      return cached;
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

export type PtaxResponse = { points: { date: string; close: number }[] };
let ptaxCache: PtaxResponse | undefined,
  ptaxChecked = 0,
  ptaxPending: Promise<PtaxResponse> | undefined;
/** Dólar oficial do Banco Central, no boletim de fechamento de cada dia útil. O histórico
 * do Yahoo para BRL=X chega um dia atrasado em relação à B3. */
export function loadPtax(): Promise<PtaxResponse> {
  if (ptaxCache && Date.now() - ptaxChecked < 3600000)
    return Promise.resolve(ptaxCache);
  ptaxPending ??= (async () => {
    try {
      const end = new Date(),
        start = new Date(end.getTime() - 1100 * 86400000),
        format = (d: Date) =>
          `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;
      const r = await fetch(
        `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${format(start)}'&@dataFinalCotacao='${format(end)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao&$top=2000`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!r.ok) throw new Error("Fonte indisponível");
      const { value: rows } = (await r.json()) as {
        value: { cotacaoVenda: number; dataHoraCotacao: string }[];
      };
      const points = rows
        .map((row) => ({
          date: row.dataHoraCotacao.slice(0, 10),
          close: row.cotacaoVenda,
        }))
        .filter((p) => Number.isFinite(p.close) && p.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!points.length) throw new Error("Sem dados");
      ptaxCache = { points };
    } catch {
      ptaxCache ??= { points: [] };
    }
    ptaxChecked = Date.now();
    return ptaxCache;
  })().finally(() => {
    ptaxPending = undefined;
  });
  return ptaxPending;
}
