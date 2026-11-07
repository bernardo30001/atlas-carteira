"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { CdiRate } from "../lib/performance";
export function useCdi() {
  const [rates, setRates] = useState<CdiRate[]>([]),
    [cdiError, setCdiError] = useState(""),
    [cdiBusy, setCdiBusy] = useState(false);
  const lastCdi = useRef(0),
    cdiFailed = useRef(false),
    cdiRunning = useRef(false);
  const loadCdi = useCallback(async (force = false) => {
    if (cdiRunning.current) return;
    cdiRunning.current = true;
    setCdiBusy(true);
    try {
      const r = await fetch("/api/cdi" + (force ? "?retry=1" : ""), {
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const j: { points?: CdiRate[]; error?: string } = await r.json();
      setRates(j.points ?? []);
      setCdiError(j.error ?? "");
      cdiFailed.current = !!j.error;
    } catch {
      setCdiError(
        "Não foi possível atualizar o CDI. As demais comparações foram preservadas.",
      );
      cdiFailed.current = true;
    } finally {
      lastCdi.current = Date.now();
      cdiRunning.current = false;
      setCdiBusy(false);
    }
  }, []);
  useEffect(() => {
    loadCdi();
    const id = setInterval(() => {
      if (
        !document.hidden &&
        Date.now() - lastCdi.current > (cdiFailed.current ? 55000 : 3550000)
      )
        loadCdi();
    }, 60000);
    return () => clearInterval(id);
  }, [loadCdi]);
  return { rates, cdiError, cdiBusy, retryCdi: () => loadCdi(true) };
}
