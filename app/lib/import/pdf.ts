/// <reference types="vite/client" />
// Texto de um PDF, linha a linha, na ordem de leitura. Roda no navegador: nada é enviado.

/** Diferença de altura, em pontos, até a qual dois textos estão na mesma linha. */
const SAME_LINE = 2;
/** Distância, em pontos, a partir da qual dois textos são colunas diferentes. */
const NEW_COLUMN = 4;

type Piece = { x: number; y: number; width: number; text: string };

/** Monta as linhas de uma página. Colunas ficam separadas por dois espaços. */
export function linesOfPage(pieces: Piece[]): string[] {
  const ordered = pieces
    .filter((piece) => piece.text.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Piece[][] = [];
  for (const piece of ordered) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - piece.y) <= SAME_LINE) row.push(piece);
    else rows.push([piece]);
  }
  return rows.map((row) => {
    let line = "",
      end = 0;
    for (const piece of [...row].sort((a, b) => a.x - b.x)) {
      if (line) {
        const gap = piece.x - end;
        if (gap >= NEW_COLUMN) line += "  ";
        else if (gap > 0.5 && !line.endsWith(" ")) line += " ";
      }
      line += piece.text;
      end = piece.x + piece.width;
    }
    return line.trim();
  });
}

/** A biblioteca só é carregada quando um PDF é escolhido. Sem fontes do sistema e sem
 * rede: o que interessa aqui é só o texto. */
export async function readPdfLines(bytes: Uint8Array): Promise<string[]> {
  // No servidor nunca há PDF para ler: a condição deixa a biblioteca fora do pacote dele.
  if (import.meta.env?.SSR) throw new Error("A leitura de PDF é do navegador.");
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(
    // A biblioteca toma posse do buffer: a cópia mantém o original utilizável.
    bytes.slice(),
    {
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    },
  ).catch((error: unknown) => {
    throw new Error(
      error instanceof Error && error.name === "PasswordException"
        ? "o PDF está protegido por senha."
        : "não foi possível ler este PDF.",
    );
  });
  try {
    const lines: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { items } = await page.getTextContent();
      lines.push(
        ...linesOfPage(
          items.flatMap((item) =>
            "str" in item
              ? [
                  {
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width,
                    text: item.str,
                  },
                ]
              : [],
          ),
        ),
      );
      page.cleanup();
    }
    return lines;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
