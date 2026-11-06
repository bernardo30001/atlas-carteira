// Formatação pt-BR única do site. Formatadores são caros de criar, por isso o cache.
const cache = new Map<string, Intl.NumberFormat>();
function formatter(options: Intl.NumberFormatOptions) {
  const key = JSON.stringify(options);
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat("pt-BR", options);
    cache.set(key, format);
  }
  return format;
}
export const money = (value: number, currency = "BRL") =>
  formatter({ style: "currency", currency }).format(value);
/** Dinheiro com sinal explícito, para ganho ou perda. Zero fica sem sinal. */
export const signedMoney = (value: number, currency = "BRL") =>
  formatter({ style: "currency", currency, signDisplay: "exceptZero" }).format(
    value,
  );
export const num = (value: number, digits = 2) =>
  formatter({ maximumFractionDigits: digits }).format(value);
/** Casas fixas, para alinhar colunas. */
export const fixed = (value: number, digits = 2) =>
  formatter({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
/** Variação com sinal. O que arredonda para zero fica sem sinal. */
export const percent = (value: number, digits = 2) =>
  `${formatter({
    signDisplay: "exceptZero",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}%`;
/** Percentual sem sinal, como participação ou volatilidade. */
export const plainPercent = (value: number, digits = 2) =>
  `${fixed(value, digits)}%`;
/** Classe semântica de ganho ou perda. Zero não é ganho. */
export const tone = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined) return "";
  const rounded = Number(value.toFixed(digits));
  return rounded > 0 ? "positive" : rounded < 0 ? "negative" : "neutral";
};
