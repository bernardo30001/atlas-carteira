"use client";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { AlertCircle, Check, ShieldCheck, Upload } from "lucide-react";
import { money, num } from "../lib/format";
import { parseB3Table, type ParsedFile } from "../lib/import/b3";
import {
  applyPreview,
  archivedAsset,
  buildPreview,
  type ImportPreview,
} from "../lib/import/preview";
import { readTables } from "../lib/import/table";
import { today, type Portfolio } from "../lib/model";
import { portfolioSchema } from "../lib/validation";

const MAX_FILE = 20_000_000;
const FORMATS: Record<string, string> = {
  "b3-negociacao": "B3 · Negociação",
  "b3-movimentacao": "B3 · Movimentação",
};
const date = (d: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "Sem data";

type Line = {
  key: string;
  date: string | null;
  ticker: string | null;
  label: string;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null;
  institution: string;
  reason?: string;
};
const TRADE_LABEL = { buy: "Compra", sell: "Venda" };
function lineOf(row: ImportPreview["duplicates"][number]): Line {
  const item = row.item;
  if ("type" in item)
    return {
      key: row.id,
      date: item.date,
      ticker: item.ticker,
      label: item.label,
      amount: item.amount,
      institution: item.institution,
      reason: row.reason,
    };
  if ("delta" in item)
    return {
      key: row.id,
      date: item.date,
      ticker: item.ticker,
      label: item.label,
      quantity: item.delta,
      institution: item.institution,
      reason: row.reason,
    };
  return {
    key: row.id,
    date: item.date,
    ticker: item.ticker,
    label: TRADE_LABEL[item.kind],
    quantity: item.quantity,
    price: item.price,
    amount: item.total,
    institution: item.institution,
    reason: row.reason,
  };
}

function Lines({
  title,
  lines,
  hint,
  open = false,
  choose,
}: {
  title: string;
  lines: Line[];
  hint?: string;
  open?: boolean;
  choose?: { chosen: ReadonlySet<string>; toggle: (id: string) => void };
}) {
  if (!lines.length) return null;
  return (
    <details className="import-section" open={open}>
      <summary>
        {title} <span className="count">{lines.length}</span>
      </summary>
      {hint && <p className="form-note">{hint}</p>}
      <div className="table-wrap" tabIndex={0} role="region" aria-label={title}>
        <table>
          <thead>
            <tr>
              {choose && <th scope="col">Incluir</th>}
              <th scope="col">Data</th>
              <th scope="col">Ativo</th>
              <th scope="col">Tipo</th>
              <th scope="col">Quantidade</th>
              <th scope="col">Preço</th>
              <th scope="col">Valor</th>
              <th scope="col">Corretora</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                {choose && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Incluir ${line.label} de ${line.ticker}`}
                      checked={choose.chosen.has(line.key)}
                      onChange={() => choose.toggle(line.key)}
                    />
                  </td>
                )}
                <td>{date(line.date)}</td>
                <td>
                  <b>{line.ticker ?? "—"}</b>
                </td>
                <td>
                  {line.label}
                  {line.reason && <small>{line.reason}</small>}
                </td>
                <td>
                  {line.quantity === null || line.quantity === undefined
                    ? "—"
                    : num(line.quantity, 8)}
                </td>
                <td>
                  {line.price === null || line.price === undefined
                    ? "—"
                    : money(line.price)}
                </td>
                <td>
                  {line.amount === null || line.amount === undefined
                    ? "—"
                    : money(line.amount)}
                </td>
                <td>{line.institution || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ImportPanel({
  portfolio,
  hidden,
  busy,
  save,
  onAddAsset,
  onShowValues,
}: {
  portfolio: Portfolio;
  hidden: boolean;
  busy: boolean;
  save: (next: Portfolio) => Promise<boolean>;
  onAddAsset: (ticker: string) => void;
  onShowValues: () => void;
}) {
  const [files, setFiles] = useState<ParsedFile[]>([]),
    [computed, setPreview] = useState<ImportPreview | null>(null),
    [errors, setErrors] = useState<string[]>([]),
    [reading, setReading] = useState(false),
    [dragging, setDragging] = useState(false),
    [chosen, setChosen] = useState<ReadonlySet<string>>(new Set()),
    [undo, setUndo] = useState<{ before: Portfolio; count: number } | null>(
      null,
    ),
    [problem, setProblem] = useState("");

  // A prévia é refeita quando a carteira muda, como ao cadastrar um ativo.
  useEffect(() => {
    if (!files.length) return;
    let current = true;
    buildPreview(portfolio, files, today()).then((next) => {
      if (current) setPreview(next);
    });
    return () => {
      current = false;
    };
  }, [files, portfolio]);

  const preview = files.length ? computed : null;

  async function read(list: FileList | null) {
    if (!list?.length) return;
    setReading(true);
    setErrors([]);
    setProblem("");
    setUndo(null);
    const parsed: ParsedFile[] = [],
      failures: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE) {
        failures.push(`${file.name}: o limite é de 20 MB.`);
        continue;
      }
      try {
        // Os bytes ficam só nesta função. Nada é enviado nem guardado.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const found = readTables(file.name, bytes).flatMap((table) => {
          const result = parseB3Table(table, file.name);
          return result ? [result] : [];
        });
        if (found.length) parsed.push(...found);
        else
          failures.push(
            `${file.name}: não parece um relatório de Negociação ou Movimentação da B3. Nada foi lido dele.`,
          );
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : "não foi possível ler o arquivo."}`,
        );
      }
    }
    setFiles((old) => [...old, ...parsed]);
    setErrors(failures);
    setReading(false);
  }

  const toggle = (id: string) =>
    setChosen((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups = useMemo(() => {
    if (!preview) return null;
    return {
      add: [...preview.trades, ...preview.incomes, ...preview.actions].map(
        (row) => lineOf(row as ImportPreview["duplicates"][number]),
      ),
      matched: preview.matched.map((row) =>
        lineOf(row as ImportPreview["duplicates"][number]),
      ),
      duplicates: preview.duplicates.map(lineOf),
      probable: preview.probable.map((row) =>
        lineOf(row as ImportPreview["duplicates"][number]),
      ),
      included: preview.included.map((row) =>
        lineOf(row as ImportPreview["duplicates"][number]),
      ),
      ignored: preview.ignored.map((n, i) => ({
        ...n,
        key: `ignorado-${i}`,
      })),
      decisions: preview.decisions.map((n, i) => ({
        ...n,
        key: `decisao-${i}`,
      })),
    };
  }, [preview]);

  const total = groups ? groups.add.length + chosen.size : 0,
    updates = groups ? groups.matched.length : 0;
  const keepAsHistory = (tickers: string[]) =>
    save({
      ...portfolio,
      customAssets: [
        ...(portfolio.customAssets ?? []),
        ...tickers.map(archivedAsset),
      ],
    });

  async function confirm() {
    if (!preview) return;
    setProblem("");
    const next = applyPreview(portfolio, preview, chosen);
    const parsed = portfolioSchema.safeParse(next);
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Registros inválidos.");
      return;
    }
    if (JSON.stringify(next).length > 1_900_000) {
      setProblem(
        "A carteira passaria do limite de 2 MB. Importe um período menor.",
      );
      return;
    }
    if (await save(parsed.data as Portfolio)) {
      setUndo({ before: portfolio, count: total + updates });
      setFiles([]);
      setChosen(new Set());
    }
  }

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void read(event.dataTransfer.files);
  };

  if (hidden)
    return (
      <section className="panel import-panel">
        <h2>Modo de privacidade ativo</h2>
        <p>A prévia mostra valores. Mostre os valores para importar.</p>
        <button className="button primary" onClick={onShowValues}>
          Mostrar valores e continuar
        </button>
      </section>
    );

  return (
    <section className="panel import-panel">
      <div className="panel-title">
        <div>
          <h2>
            <Upload size={18} />
            Importar movimentações
          </h2>
          <p>
            Relatórios de Negociação e Movimentação da Área do Investidor da B3,
            em Excel ou CSV. Eles cobrem Nu Invest e BTG juntos.
          </p>
        </div>
      </div>
      <label
        className={"import-drop" + (dragging ? " dragging" : "")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <Upload size={22} aria-hidden="true" />
        <b>
          {reading ? "Lendo os arquivos…" : "Escolher ou arrastar arquivos"}
        </b>
        <small>
          <ShieldCheck size={13} aria-hidden="true" /> A leitura acontece neste
          navegador. O arquivo não é enviado nem guardado.
        </small>
        <input
          type="file"
          multiple
          accept=".xlsx,.xlsm,.csv"
          aria-label="Arquivos para importar"
          onChange={(event) => {
            void read(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {errors.map((error) => (
        <div className="notice warn" role="alert" key={error}>
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      ))}
      {undo && (
        <div className="notice" role="status">
          <Check size={17} />
          <span>
            {undo.count}{" "}
            {undo.count === 1 ? "registro salvo" : "registros salvos"} na
            carteira.
          </span>
          <button
            disabled={busy}
            onClick={async () => {
              if (await save(undo.before)) setUndo(null);
            }}
          >
            Desfazer
          </button>
        </div>
      )}
      {preview && groups && (
        <>
          <div className="import-files" role="status">
            {preview.files.map((file, i) => (
              <span key={file.name + i}>
                <b>{FORMATS[file.format]}</b> {file.name}
              </span>
            ))}
            <button
              className="text-button"
              onClick={() => {
                setFiles([]);
                setChosen(new Set());
              }}
            >
              Descartar
            </button>
          </div>
          <dl className="import-summary">
            <div>
              <dt>A adicionar</dt>
              <dd>{groups.add.length}</dd>
            </div>
            <div>
              <dt>Já na carteira</dt>
              <dd>{groups.matched.length}</dd>
            </div>
            <div>
              <dt>Duplicados</dt>
              <dd>{groups.duplicates.length}</dd>
            </div>
            <div>
              <dt>Prováveis duplicados</dt>
              <dd>{groups.probable.length}</dd>
            </div>
            <div>
              <dt>Ignorados</dt>
              <dd>{groups.ignored.length + groups.included.length}</dd>
            </div>
            <div className={groups.decisions.length ? "attention" : ""}>
              <dt>Precisam de você</dt>
              <dd>{groups.decisions.length + preview.unknown.length}</dd>
            </div>
          </dl>
          {preview.warnings.map((warning) => (
            <div className="notice warn" key={warning}>
              <AlertCircle size={17} />
              <span>{warning}</span>
            </div>
          ))}
          {preview.unknown.length > 0 && (
            <div className="import-unknown">
              <h3>Ativos fora da sua lista</h3>
              <p>
                Cadastre o que você ainda tem. O que já vendeu pode ficar só no
                histórico, sem cotação e fora do patrimônio. Sem nenhuma das
                duas, as linhas ficam de fora e o resto segue normalmente.
              </p>
              {preview.unknown.filter((a) => a.closed).length > 1 && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() =>
                    keepAsHistory(
                      preview.unknown
                        .filter((a) => a.closed)
                        .map((a) => a.ticker),
                    )
                  }
                >
                  Guardar os {preview.unknown.filter((a) => a.closed).length}{" "}
                  encerrados só no histórico
                </button>
              )}
              <ul>
                {preview.unknown.map((asset) => (
                  <li key={asset.ticker}>
                    <b>{asset.ticker}</b>
                    <span>
                      {asset.rows} {asset.rows === 1 ? "linha" : "linhas"}
                      {asset.closed
                        ? " · sem saldo no arquivo"
                        : ` · saldo de ${num(asset.net, 8)} no arquivo. Confira se houve evento societário.`}
                    </span>
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={() => keepAsHistory([asset.ticker])}
                    >
                      Só histórico
                    </button>
                    <button
                      className="button outline"
                      onClick={() => onAddAsset(asset.ticker)}
                    >
                      Cadastrar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.impact.length > 0 && (
            <details className="import-section" open>
              <summary>
                Como as posições vão mudar{" "}
                <span className="count">{preview.impact.length}</span>
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Ativo</th>
                      <th scope="col">Quantidade hoje</th>
                      <th scope="col">Depois de importar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.impact.map((row) => (
                      <tr key={row.ticker}>
                        <td>
                          <b>{row.ticker}</b>
                        </td>
                        <td>{num(row.before, 8)}</td>
                        <td>{num(row.after, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {preview.reconcile.length > 0 && (
            <p className="form-note">
              O histórico importado explica {preview.reconcile.length}{" "}
              {preview.reconcile.length === 1
                ? "posição inicial, que passa a ser só um resumo"
                : "posições iniciais, que passam a ser só um resumo"}
              . As quantidades não mudam por causa disso.
            </p>
          )}
          <Lines title="A adicionar" lines={groups.add} open />
          <Lines
            title="Já estão na carteira"
            lines={groups.matched}
            hint="As mesmas operações, registradas antes com a data de liquidação. Elas recebem a data do negócio e a corretora, sem mudar quantidades."
          />
          <Lines
            title="Precisam de você"
            lines={groups.decisions}
            hint="Estas linhas não serão aplicadas. Registre à mão o que for necessário."
            open
          />
          <Lines
            title="Prováveis duplicados"
            lines={groups.probable}
            hint="Parecem já estar no seu histórico, registrados sem a corretora. Marque só o que for mesmo novo."
            open
            choose={{ chosen, toggle }}
          />
          <Lines
            title="Já contidos no acumulado"
            lines={groups.included}
            hint="Proventos anteriores ao acumulado que você já informou."
          />
          <Lines title="Duplicados" lines={groups.duplicates} />
          <Lines title="Ignorados" lines={groups.ignored} />
          {problem && (
            <div className="notice warn" role="alert">
              <AlertCircle size={17} />
              <span>{problem}</span>
            </div>
          )}
          <div className="save-row">
            <span className="muted">Nada foi salvo até agora.</span>
            <button
              className="button primary"
              disabled={busy || total + updates === 0}
              onClick={confirm}
            >
              {busy
                ? "Salvando…"
                : total + updates === 0
                  ? "Nada a adicionar"
                  : total === 0
                    ? `Atualizar ${updates} ${updates === 1 ? "registro" : "registros"}`
                    : `Adicionar ${total} ${total === 1 ? "registro" : "registros"}`}
              <Check size={15} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
