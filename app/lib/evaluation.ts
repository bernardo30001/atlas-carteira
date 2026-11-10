import {
  ASSETS,
  totals,
  allocationPlan,
  type Market,
  type Portfolio,
} from "./model.ts";
import {
  DEFAULT_EVALUATION,
  DEFAULT_SCENARIO,
  type FundamentalData,
  type EvaluationSettings,
  type EarningsScenario,
} from "./evaluation-config.ts";
import { freshFundamentals } from "./fundamentals.ts";
export const ACTIONS = {
  buy: "Comprar / aumentar",
  hold: "Manter",
  wait: "Aguardar preço",
  reduce: "Avaliar redução",
  sell: "Avaliar venda",
  review: "Revisar fundamentos",
  missing: "Dados insuficientes",
  unassigned: "Definir peso",
};
export type EvaluationAction = keyof typeof ACTIONS;
export type EvaluationBudgetScope = "stocks" | "portfolio";
const stocks = ASSETS.filter((a) => a.group === "br"),
  issuer = (ticker: string) => ticker.slice(0, 4);
export function evaluationSettings(p: Portfolio): EvaluationSettings {
  return p.evaluation ?? structuredClone(DEFAULT_EVALUATION);
}
export function normalizedWeights(weights: Record<string, number>) {
  const sum = stocks.reduce((s, a) => s + (weights[a.ticker] ?? 0), 0);
  return Object.fromEntries(
    stocks.map((a) => [
      a.ticker,
      sum ? ((weights[a.ticker] ?? 0) / sum) * 100 : 0,
    ]),
  );
}
export function earningsValue(eps: number | null, scenario: EarningsScenario) {
  if (eps === null || !Number.isFinite(eps) || eps <= 0) return null;
  const { growth, discountRate, terminalPE, payout, years } = scenario;
  let value = 0;
  for (let year = 1; year <= years; year++)
    value +=
      (eps * (1 + growth / 100) ** year * payout) /
      100 /
      (1 + discountRate / 100) ** year;
  return (
    value +
    (eps * (1 + growth / 100) ** years * terminalPE) /
      (1 + discountRate / 100) ** years
  );
}
/** Proportional water filling, retaining cash if the issuer/sector limits are infeasible. */
export function cappedWeights(
  scores: Record<string, number>,
  maxIssuer: number,
  maxSector: number,
) {
  const values: Record<string, number> = Object.fromEntries(
    stocks.map((a) => [a.ticker, 0]),
  );
  let remaining = 100;
  for (let step = 0; step < stocks.length * 2 && remaining > 1e-8; step++) {
    const issuerSum = (id: string) =>
        stocks
          .filter((a) => issuer(a.ticker) === id)
          .reduce((s, a) => s + values[a.ticker], 0),
      sectorSum = (sector: string) =>
        stocks
          .filter((a) => a.sector === sector)
          .reduce((s, a) => s + values[a.ticker], 0);
    const active = stocks.filter(
      (a) =>
        (scores[a.ticker] ?? 0) > 0 &&
        issuerSum(issuer(a.ticker)) < maxIssuer - 1e-8 &&
        sectorSum(a.sector) < maxSector - 1e-8,
    );
    const sum = active.reduce((s, a) => s + scores[a.ticker], 0);
    if (!sum) break;
    const proposed = Object.fromEntries(
      active.map((a) => [a.ticker, (remaining * scores[a.ticker]) / sum]),
    );
    let fraction = 1;
    for (const id of new Set(active.map((a) => issuer(a.ticker)))) {
      const need = active
        .filter((a) => issuer(a.ticker) === id)
        .reduce((s, a) => s + proposed[a.ticker], 0);
      fraction = Math.min(fraction, (maxIssuer - issuerSum(id)) / need);
    }
    for (const sector of new Set(active.map((a) => a.sector))) {
      const need = active
        .filter((a) => a.sector === sector)
        .reduce((s, a) => s + proposed[a.ticker], 0);
      fraction = Math.min(fraction, (maxSector - sectorSum(sector)) / need);
    }
    let used = 0;
    for (const a of active) {
      const v = proposed[a.ticker] * Math.max(0, fraction);
      values[a.ticker] += v;
      used += v;
    }
    remaining -= used;
    if (used < 1e-10) break;
  }
  return { weights: values, reserve: Math.max(0, remaining) };
}
export function evaluatePortfolio(
  p: Portfolio,
  m: Market,
  data: FundamentalData | undefined,
  budget: number,
  now = Date.now(),
  budgetScope: EvaluationBudgetScope = "portfolio",
) {
  const settings = evaluationSettings(p),
    base = normalizedWeights(settings.baseWeights),
    t = totals(p, m),
    stockRows = t.rows.filter((a) => a.group === "br");
  const quoteValid = (q: Market["quotes"][string] | undefined) => {
    const age = q ? (now - q.time * 1000) / 86400000 : Infinity;
    return (
      !!q &&
      !q.stale &&
      q.currency === "BRL" &&
      q.price > 0 &&
      age >= -1 &&
      age <= 7
    );
  };
  const brValue = t.byGroup.br,
    missingStocks = stockRows.some(
      (r) => r.quantity > 0 && (r.value === null || !quoteValid(r.quote)),
    ),
    portfolioComplete = t.missing.length === 0 && !missingStocks;
  const enteredBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0;
  const classAmount =
    budgetScope === "stocks"
      ? missingStocks
        ? 0
        : enteredBudget
      : portfolioComplete
        ? (allocationPlan(p, m, enteredBudget).find((g) => g.group === "br")
            ?.amount ?? 0)
        : 0;
  const sectorValues = Object.fromEntries(
    [...new Set(stocks.map((a) => a.sector))].map((sector) => [
      sector,
      stockRows
        .filter((r) => r.sector === sector)
        .reduce((s, r) => s + (r.value ?? 0), 0),
    ]),
  );
  const issuerValues = Object.fromEntries(
    stocks.map((a) => [
      issuer(a.ticker),
      stockRows
        .filter((r) => issuer(r.ticker) === issuer(a.ticker))
        .reduce((s, r) => s + (r.value ?? 0), 0),
    ]),
  );
  const rows = stockRows.map((row) => {
    const f = data?.items[row.ticker],
      peer = data?.peers[row.ticker],
      override = settings.overrides[row.ticker],
      reasons: string[] = [];
    const quote = row.quote,
      validQuote = quoteValid(quote);
    const fresh =
      !!f &&
      freshFundamentals(f, now) &&
      !data?.stale &&
      (now - Date.parse(data!.fetchedAt)) / 86400000 <= 2;
    const manual = override?.referencePrice ?? null,
      manualFresh =
        !!override &&
        (now - Date.parse(override.updatedAt + "T12:00:00Z")) / 86400000 <= 180;
    const scenario =
        override?.scenario ?? settings.scenario ?? DEFAULT_SCENARIO,
      method = override?.method ?? "auto";
    const freshPeer =
      !!peer &&
      !!f &&
      freshFundamentals(
        { ...f, quoteDate: peer.oldestQuote, balanceDate: peer.oldestBalance },
        now,
      );
    // O mesmo filtro dos pares vale para a própria ação: com P/L fora de 2x a 60x, o lucro de
    // 12 meses está fora do normal, como num ano de baixa de uma empresa cíclica.
    const earningsUsable = !!f && f.pe !== null && f.pe >= 2 && f.pe <= 60;
    const peerValue =
      fresh &&
      freshPeer &&
      peer &&
      earningsUsable &&
      f.eps !== null &&
      f.eps > 0
        ? f.eps * peer.medianPE
        : null;
    const scenarioValue =
      fresh && earningsUsable ? earningsValue(f?.eps ?? null, scenario) : null;
    const referenceKind =
      method === "manual" || (method === "auto" && manual !== null)
        ? "manual"
        : method === "scenario"
          ? "scenario"
          : method === "peers"
            ? "peers"
            : peerValue !== null
              ? "peers"
              : "scenario";
    const reference =
      referenceKind === "manual"
        ? manual !== null && manualFresh
          ? manual
          : null
        : referenceKind === "peers"
          ? peerValue
          : scenarioValue;
    const manualOnly =
      manual !== null &&
      manualFresh &&
      override?.thesis === "intact" &&
      !!override.note.trim();
    const usable = validQuote && reference !== null && (fresh || manualOnly);
    const price = validQuote ? quote!.price : null,
      buyCeiling =
        reference !== null ? reference * (1 - settings.margin / 100) : null;
    const valuation =
      usable && price !== null && buyCeiling !== null && reference !== null
        ? price <= buyCeiling
          ? "cheap"
          : price > reference * 1.2
            ? "expensive"
            : "neutral"
        : "unknown";
    const risk =
      !!f &&
      fresh &&
      ((f.eps !== null && f.eps <= 0) ||
        (f.roe !== null && f.roe <= 0) ||
        (!f.financial && f.netDebtEbit !== null && f.netDebtEbit > 4) ||
        (freshPeer &&
          f.roe !== null &&
          peer?.medianROE !== null &&
          peer?.medianROE !== undefined &&
          f.roe < peer.medianROE * 0.5));
    if (!validQuote)
      reasons.push("Cotação atual ausente, antiga ou indisponível.");
    if (!fresh && !manualOnly)
      reasons.push(
        "Faltam fundamentos com cotação de até 10 dias e balanço de até 210 dias.",
      );
    if (manual !== null && !manualFresh)
      reasons.push("Sua referência tem mais de 180 dias; revise-a.");
    if (referenceKind === "manual" && manual !== null && manualFresh)
      reasons.push(
        "Referência de preço definida por você; não é uma estimativa independente.",
      );
    else if (referenceKind === "peers" && peerValue !== null)
      reasons.push(
        "Referência = LPA dos últimos 12 meses × P/L mediano de " +
          peer!.tickers.length +
          " outros emissores do mesmo subsetor.",
      );
    else if (referenceKind === "scenario" && scenarioValue !== null)
      reasons.push(
        "Referência pelo cenário: lucro cresce " +
          scenario.growth +
          "% a.a. por " +
          scenario.years +
          " anos, retorno exigido " +
          scenario.discountRate +
          "% a.a., payout " +
          scenario.payout +
          "% e P/L de saída " +
          scenario.terminalPE +
          "x. São premissas editáveis, não previsões.",
      );
    else
      reasons.push(
        referenceKind === "peers"
          ? "Sem referência por pares: são necessários ao menos 3 outros emissores lucrativos, líquidos e com datas válidas no mesmo subsetor."
          : "Falta uma referência válida pelo método escolhido.",
      );
    if (
      fresh &&
      f &&
      !earningsUsable &&
      f.eps !== null &&
      f.eps > 0 &&
      f.pe !== null
    )
      reasons.push(
        "P/L de " +
          f.pe.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
          "x, fora do intervalo de 2x a 60x: o lucro de 12 meses parece fora do normal e não serve de referência. Use um preço de referência próprio, se tiver um.",
      );
    if (fresh && f?.eps !== null && f?.eps !== undefined && f.eps <= 0)
      reasons.push(
        "Lucro por ação negativo ou nulo: múltiplo baixo não comprova desconto.",
      );
    if (fresh && f?.roe !== null && f?.roe !== undefined && f.roe <= 0)
      reasons.push("Retorno sobre o patrimônio não positivo.");
    if (
      fresh &&
      !f?.financial &&
      f?.netDebtEbit !== null &&
      f?.netDebtEbit !== undefined &&
      f.netDebtEbit > 4
    )
      reasons.push(
        "Dívida líquida acima de 4 vezes o EBIT; novas compras ficam suspensas pelo modelo.",
      );
    if (
      risk &&
      !reasons.some(
        (r) =>
          r.includes("Dívida") ||
          r.includes("Lucro por") ||
          r.includes("não positivo"),
      )
    )
      reasons.push(
        "ROE abaixo da metade da mediana dos pares: revise a qualidade do lucro.",
      );
    const currentWeight = missingStocks
      ? null
      : brValue
        ? ((row.value ?? 0) / brValue) * 100
        : 0;
    const concentrated =
      !missingStocks &&
      brValue > 0 &&
      ((issuerValues[issuer(row.ticker)] / brValue) * 100 >
        settings.maxIssuerWeight + 0.1 ||
        (sectorValues[row.sector] / brValue) * 100 >
          settings.maxSectorWeight + 0.1);
    if (concentrated)
      reasons.push(
        "Emissor ou setor acima do limite dentro da classe de ações; priorize diversificação.",
      );
    if (["VALE3", "PRIO3", "FESA4", "KLBN4"].includes(row.ticker))
      reasons.push(
        "Negócio cíclico: lucros de 12 meses podem estar fora do nível sustentável.",
      );
    if (override?.thesis === "review")
      reasons.push(
        "Você marcou a tese para revisão; novas compras ficam suspensas.",
      );
    if (override?.thesis === "broken")
      reasons.push(
        "Você marcou a tese como rompida; avalie uma saída e seus custos.",
      );
    const blocked =
      risk || override?.thesis === "review" || override?.thesis === "broken";
    const factor =
      override?.thesis === "broken"
        ? 0
        : blocked
          ? 0.5
          : valuation === "cheap"
            ? 1.25
            : valuation === "expensive"
              ? 0.75
              : 1;
    return {
      ...row,
      fundamentals: f,
      peer,
      override,
      scenario,
      referenceKind,
      scenarioValue,
      peerValue,
      price,
      baseWeight: base[row.ticker],
      currentWeight,
      reference,
      buyCeiling,
      valuation,
      usable,
      risk,
      blocked,
      concentrated,
      factor,
      reasons,
      amount: 0,
      quantityToBuy: 0,
      executable: 0,
      action: "missing" as EvaluationAction,
      targetWeight: 0,
      deficit: 0,
      excessValue: 0,
    };
  });
  const capped = cappedWeights(
    Object.fromEntries(rows.map((r) => [r.ticker, r.baseWeight * r.factor])),
    settings.maxIssuerWeight,
    settings.maxSectorWeight,
  );
  for (const r of rows) {
    r.targetWeight = capped.weights[r.ticker];
    r.deficit = Math.max(
      0,
      ((brValue + classAmount) * r.targetWeight) / 100 - (r.value ?? 0),
    );
    r.excessValue = missingStocks
      ? 0
      : Math.max(0, (r.value ?? 0) - (brValue * r.targetWeight) / 100);
    r.action =
      r.override?.thesis === "broken"
        ? r.quantity > 0
          ? "sell"
          : "review"
        : r.price === null || missingStocks
          ? "missing"
          : r.concentrated && r.quantity > 0
            ? "reduce"
            : r.blocked
              ? "review"
              : !r.usable
                ? "missing"
                : r.baseWeight === 0
                  ? "unassigned"
                  : r.valuation === "expensive"
                    ? r.quantity > 0 &&
                      r.currentWeight !== null &&
                      r.currentWeight > r.targetWeight + 2
                      ? "reduce"
                      : r.quantity > 0
                        ? "hold"
                        : "wait"
                    : r.valuation === "cheap" && r.deficit > 1
                      ? "buy"
                      : r.quantity > 0
                        ? "hold"
                        : "wait";
    if (r.valuation === "cheap")
      r.reasons.push(
        "Preço com a margem mínima de " +
          settings.margin +
          "% abaixo da referência do modelo.",
      );
    if (r.valuation === "expensive")
      r.reasons.push(
        "Preço mais de 20% acima da referência escolhida; a qualidade e o crescimento podem justificar um prêmio.",
      );
    if (r.action === "buy" && classAmount <= 0)
      r.reasons.push(
        enteredBudget <= 0
          ? "Informe um valor de aporte para calcular as compras."
          : "Compra candidata, mas sem verba para ações no aporte atual: a distribuição entre classes tem prioridade.",
      );
    if (!r.baseWeight)
      r.reasons.push(
        "Ativo fora da sua regra base; defina um peso antes de direcionar novas compras.",
      );
  }
  // Share cash in proportion to eligible deficits, redistributing saturated limits.
  const candidates = rows.filter((r) => r.action === "buy"),
    planned = Object.fromEntries(candidates.map((r) => [r.ticker, 0]));
  let remaining = classAmount;
  const plannedIssuer = (id: string) =>
    candidates
      .filter((r) => issuer(r.ticker) === id)
      .reduce((s, r) => s + planned[r.ticker], 0);
  const plannedSector = (sector: string) =>
    candidates
      .filter((r) => r.sector === sector)
      .reduce((s, r) => s + planned[r.ticker], 0);
  const issuerCap = (id: string) =>
    Math.max(
      0,
      ((brValue + classAmount) * settings.maxIssuerWeight) / 100 -
        issuerValues[id],
    );
  const sectorCap = (sector: string) =>
    Math.max(
      0,
      ((brValue + classAmount) * settings.maxSectorWeight) / 100 -
        sectorValues[sector],
    );
  for (let step = 0; step < rows.length * 3 && remaining > 1e-8; step++) {
    const active = candidates.filter(
      (r) =>
        r.deficit - planned[r.ticker] > 1e-8 &&
        issuerCap(issuer(r.ticker)) - plannedIssuer(issuer(r.ticker)) > 1e-8 &&
        sectorCap(r.sector) - plannedSector(r.sector) > 1e-8,
    );
    const sum = active.reduce((s, r) => s + r.deficit, 0);
    if (!sum) break;
    const proposed = Object.fromEntries(
      active.map((r) => [r.ticker, (remaining * r.deficit) / sum]),
    );
    let fraction = 1;
    for (const r of active)
      fraction = Math.min(
        fraction,
        (r.deficit - planned[r.ticker]) / proposed[r.ticker],
      );
    for (const id of new Set(active.map((r) => issuer(r.ticker))))
      fraction = Math.min(
        fraction,
        (issuerCap(id) - plannedIssuer(id)) /
          active
            .filter((r) => issuer(r.ticker) === id)
            .reduce((s, r) => s + proposed[r.ticker], 0),
      );
    for (const sector of new Set(active.map((r) => r.sector)))
      fraction = Math.min(
        fraction,
        (sectorCap(sector) - plannedSector(sector)) /
          active
            .filter((r) => r.sector === sector)
            .reduce((s, r) => s + proposed[r.ticker], 0),
      );
    let spent = 0;
    for (const r of active) {
      const amount = proposed[r.ticker] * Math.max(0, fraction);
      planned[r.ticker] += amount;
      spent += amount;
    }
    remaining -= spent;
    if (spent < 1e-10) break;
  }
  for (const r of candidates) {
    r.quantityToBuy = r.price
      ? Math.floor((planned[r.ticker] + 1e-9) / r.price)
      : 0;
    r.amount = r.executable = r.quantityToBuy * (r.price ?? 0);
  }
  remaining = classAmount - candidates.reduce((s, r) => s + r.executable, 0);
  const actualIssuer = (id: string) =>
      candidates
        .filter((r) => issuer(r.ticker) === id)
        .reduce((s, r) => s + r.executable, 0),
    actualSector = (sector: string) =>
      candidates
        .filter((r) => r.sector === sector)
        .reduce((s, r) => s + r.executable, 0);
  // Use affordable rounding leftovers only within the same eligibility and limits.
  const roundingOrder = candidates.toSorted(
    (a, b) =>
      (planned[b.ticker] - b.executable) / (b.price ?? 1) -
        (planned[a.ticker] - a.executable) / (a.price ?? 1) ||
      a.ticker.localeCompare(b.ticker),
  );
  for (const r of roundingOrder) {
    const room = Math.min(
      remaining,
      r.deficit - r.executable,
      issuerCap(issuer(r.ticker)) - actualIssuer(issuer(r.ticker)),
      sectorCap(r.sector) - actualSector(r.sector),
    );
    const extra = r.price
      ? Math.max(0, Math.floor((room + 1e-9) / r.price))
      : 0;
    const spent = extra * (r.price ?? 0);
    r.quantityToBuy += extra;
    r.amount = r.executable += spent;
    remaining -= spent;
  }
  const allocationReason = (r: (typeof rows)[number]) => {
    if (enteredBudget <= 0) return "Informe um valor de aporte.";
    if (missingStocks || (budgetScope === "portfolio" && !portfolioComplete))
      return "Aguardando cotações para calcular a distribuição.";
    if (classAmount <= 0)
      return "As metas da carteira não destinam verba para ações neste aporte.";
    if (r.executable > 0)
      return "Preço com margem de compra e espaço para aumentar o peso na carteira.";
    if (r.action === "sell" || r.action === "review")
      return "Novas compras suspensas: tese ou fundamentos em revisão.";
    if (r.action === "reduce")
      return "Sem aporte: peso atual ou concentração acima do limite.";
    if (!r.usable)
      return "Sem aporte: cotação ou referência de preço sem dados válidos.";
    if (r.baseWeight === 0)
      return "Sem aporte: esta ação ainda não tem peso na sua regra base.";
    if (r.valuation !== "cheap")
      return "Sem aporte: preço atual sem a margem de compra exigida.";
    if (r.deficit <= 1) return "Sem aporte: o peso sugerido já foi atingido.";
    return "Sem compra: saldo disponível ou espaço nos limites insuficiente para uma unidade.";
  };
  const order: Record<EvaluationAction, number> = {
    buy: 0,
    reduce: 1,
    sell: 1,
    review: 2,
    hold: 3,
    wait: 4,
    missing: 5,
    unassigned: 6,
  };
  rows.sort(
    (a, b) =>
      order[a.action] - order[b.action] ||
      b.amount - a.amount ||
      b.deficit - a.deficit,
  );
  return {
    rows: rows.map((r) => ({ ...r, allocationReason: allocationReason(r) })),
    settings,
    base,
    budgetScope,
    enteredBudget,
    allocated: rows.reduce((s, r) => s + r.executable, 0),
    otherClasses:
      budgetScope === "portfolio" && portfolioComplete
        ? Math.max(0, enteredBudget - classAmount)
        : 0,
    stockValue: brValue,
    classAmount,
    portfolioValue: t.value,
    portfolioComplete,
    missingStocks,
    currentClassWeight: t.value ? (brValue / t.value) * 100 : 0,
    classTarget: p.targets.br,
    reserve: Math.max(0, remaining),
    targetReserve: capped.reserve,
    coverage: rows.filter((r) => r.usable).length,
    total: rows.length,
    sectors: Object.entries(sectorValues)
      .map(([name, value]) => ({
        name,
        value,
        percent: brValue ? (value / brValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value),
  };
}
