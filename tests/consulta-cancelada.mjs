// Na Cloudflare, uma consulta morre com a requisição que a criou. Se a próxima requisição
// esperasse pela mesma promessa, ficaria presa para sempre.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// market-server importa "./model" sem extensão, como o bundler permite.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./model") return next("./model.ts", context);
    return next(specifier, context);
  },
});
const chart = () =>
  new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 10,
              regularMarketTime: Math.floor(Date.now() / 1000),
              currency: "BRL",
              exchangeTimezoneName: "America/Sao_Paulo",
            },
            timestamp: [],
            indicators: { quote: [{ close: [] }] },
          },
        ],
      },
    }),
  );
const bcb = (body) => new Response(JSON.stringify(body));
let hang = true;
const realFetch = globalThis.fetch;
// A primeira rodada nunca responde, como uma requisição cancelada no meio do caminho.
globalThis.fetch = (url) => {
  if (hang) return new Promise(() => {});
  return Promise.resolve(
    String(url).includes("yahoo")
      ? chart()
      : String(url).includes("olinda")
        ? bcb({
            value: [{ cotacaoVenda: 5, dataHoraCotacao: "2026-03-02 13:00" }],
          })
        : bcb([{ data: "02/03/2026", valor: "0,05" }]),
  );
};
const { loadMarket } = await import("../app/lib/market-server.ts");
const { loadCdi, loadPtax } = await import("../app/lib/cdi-server.ts");
loadMarket();
loadCdi();
loadPtax();
hang = false;
const within = (promise, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + " ficou preso")), 2000),
    ),
  ]);
const market = await within(loadMarket(), "market");
assert.equal(market.quotes.WEGE3.price, 10);
const cdi = await within(loadCdi(), "cdi");
assert.equal(cdi.points.length, 1);
const ptax = await within(loadPtax(), "ptax");
assert.equal(ptax.points[0].close, 5);
globalThis.fetch = realFetch;
console.log(
  "Consulta cancelada não prende as seguintes: cotações, CDI e PTAX.",
);
process.exit(0);
