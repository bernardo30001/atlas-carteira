"use client";
import { useEffect, useState } from "react";
import {
  historyBatches,
  historyStart,
  historySymbols,
  type AssetHistory,
} from "../lib/market-history";
import { today, type Point, type Portfolio } from "../lib/model";

const REFRESH = 3600000;
const CONCURRENT = 3;
/** Histórico diário, em lotes, separado das cotações do minuto. */
export function useMarketHistory(portfolio: Portfolio) {
  const [histories, setHistories] = useState<Record<string, AssetHistory>>({}),
    [ptax, setPtax] = useState<Point[]>([]),
    [loadedKey, setLoadedKey] = useState(""),
    [tick, setTick] = useState(0);
  const from = historyStart(portfolio, today()),
    symbols = historySymbols(portfolio)
      .map((s) => `${s.ticker}:${s.symbol}`)
      .join(",");
  const key = `${from}|${symbols}|${tick}`;
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((value) => value + 1);
    }, REFRESH);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      { signal } = controller;
    fetch("/api/history", { signal })
      .then((r) => r.json() as Promise<{ points?: Point[] }>)
      .then((j) => setPtax(j.points ?? []))
      .catch(() => {});
    const queue = historyBatches(symbols.split(","));
    const worker = async () => {
      for (let batch = queue.shift(); batch; batch = queue.shift()) {
        try {
          const r = await fetch(
            `/api/history?from=${from}&assets=${encodeURIComponent(batch.join(","))}`,
            { signal },
          );
          if (!r.ok) continue;
          const j: { items: Record<string, AssetHistory> } = await r.json();
          setHistories((old) => ({ ...old, ...j.items }));
        } catch {
          if (signal.aborted) return;
        }
      }
    };
    Promise.all(Array.from({ length: CONCURRENT }, worker)).finally(() => {
      if (!signal.aborted) setLoadedKey(key);
    });
    return () => controller.abort();
  }, [from, symbols, key]);
  return { histories, ptax, loading: loadedKey !== key };
}
