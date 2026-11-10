"use client";
import { useEffect, useState } from "react";
import type { CdiRate } from "../lib/performance";

const OK_INTERVAL = 3550000,
  RETRY_INTERVAL = 55000;
export function useCdi() {
  const [rates, setRates] = useState<CdiRate[]>([]),
    [cdiError, setCdiError] = useState(""),
    [cdiBusy, setCdiBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let last = 0,
      failed = false,
      running = false,
      stopped = false;
    const load = async (force: boolean) => {
      if (running) return;
      running = true;
      try {
        const r = await fetch("/api/cdi" + (force ? "?retry=1" : ""), {
          cache: "no-store",
        });
        if (!r.ok) throw Error();
        const j: { points?: CdiRate[]; error?: string } = await r.json();
        if (stopped) return;
        setRates(j.points ?? []);
        setCdiError(j.error ?? "");
        failed = !!j.error;
      } catch {
        if (stopped) return;
        setCdiError(
          "Não foi possível atualizar o CDI. As demais comparações foram preservadas.",
        );
        failed = true;
      } finally {
        last = Date.now();
        running = false;
        if (!stopped) setCdiBusy(false);
      }
    };
    load(retry > 0);
    const id = setInterval(() => {
      if (
        !document.hidden &&
        Date.now() - last > (failed ? RETRY_INTERVAL : OK_INTERVAL)
      )
        load(false);
    }, 60000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [retry]);
  return {
    rates,
    cdiError,
    cdiBusy,
    retryCdi: () => {
      // "Consultando…" só aparece quando é você quem pede de novo.
      setCdiBusy(true);
      setRetry((n) => n + 1);
    },
  };
}
