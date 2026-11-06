// Lê planilhas no navegador. Nada aqui envia ou guarda o arquivo.
import { strFromU8, unzipSync } from "fflate";

export type Cell = string | number | null;
export type Table = { name: string; rows: Cell[][] };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const decode = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? whole;
    const value =
      code[1].toLowerCase() === "x"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
  });
const attribute = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const textRuns = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => decode(m[1]))
    .join("");

function columnIndex(reference: string | undefined, fallback: number) {
  const letters = reference ? /^[A-Z]+/.exec(reference)?.[0] : undefined;
  if (!letters) return fallback;
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

function parseSheet(xml: string, shared: string[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: Cell[] = [];
    let next = 0;
    for (const cell of (row[1] ?? "").matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const index = columnIndex(attribute(cell[1], "r"), next);
      next = index + 1;
      const type = attribute(cell[1], "t"),
        inner = cell[2] ?? "",
        raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: Cell = null;
      if (type === "s") value = shared[Number(raw)] ?? null;
      else if (type === "inlineStr") value = textRuns(inner);
      else if (type === "str" || type === "e")
        value = raw === undefined ? null : decode(raw);
      else if (raw !== undefined) {
        const number = Number(raw);
        value = Number.isFinite(number) ? number : decode(raw);
      }
      cells[index] = value;
    }
    rows.push(Array.from(cells, (c) => c ?? null));
  }
  return rows;
}

const MAX_PART = 50_000_000;
export function readXlsx(bytes: Uint8Array): Table[] {
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter: (file) =>
        file.originalSize < MAX_PART &&
        (file.name.startsWith("xl/") || file.name === "[Content_Types].xml"),
    });
  } catch {
    throw new Error("O arquivo não é uma planilha Excel válida.");
  }
  const text = (name: string) =>
    parts[name] ? strFromU8(parts[name]) : undefined;
  const shared = [
    ...(text("xl/sharedStrings.xml") ?? "").matchAll(
      /<si\b[^>]*>([\s\S]*?)<\/si>/g,
    ),
  ].map((m) => textRuns(m[1]));
  const workbook = text("xl/workbook.xml"),
    rels = text("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels)
    throw new Error("O arquivo não é uma planilha Excel válida.");
  const targets = new Map(
    [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      attribute(m[0], "Id"),
      attribute(m[0], "Target"),
    ]),
  );
  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].flatMap((m) => {
    const target = targets.get(attribute(m[0], "r:id"));
    if (!target) return [];
    const path = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`;
    const xml = text(path);
    return xml
      ? [
          {
            name: decode(attribute(m[0], "name") ?? ""),
            rows: parseSheet(xml, shared),
          },
        ]
      : [];
  });
}

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

export function readCsv(bytes: Uint8Array): Table {
  const text = decodeText(bytes).replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) =>
    first.split(d).length > first.split(best).length ? d : best,
  );
  const rows: Cell[][] = [];
  let row: Cell[] = [],
    field = "",
    quoted = false;
  const endField = () => {
    row.push(field.trim() === "" ? null : field.trim());
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endField();
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    endField();
    rows.push(row);
  }
  return { name: "CSV", rows };
}

export function readTables(fileName: string, bytes: Uint8Array): Table[] {
  // Assinatura do ZIP: PK. O nome do arquivo não define o formato.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  if (/\.(xlsx|xlsm)$/i.test(fileName))
    throw new Error("O arquivo não é uma planilha Excel válida.");
  return [readCsv(bytes)];
}
