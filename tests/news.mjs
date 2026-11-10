import assert from "node:assert/strict";
import { ASSETS } from "../app/lib/model.ts";
import { newsSelection, parseNews, NEWS_CATEGORIES } from "../app/lib/news.ts";
for (const key of [
  ...ASSETS.map((a) => a.ticker),
  ...NEWS_CATEGORIES.map((c) => c.key),
])
  assert.ok(newsSelection(key), key);
assert.equal(newsSelection("invalid"), undefined);
assert.ok(newsSelection("WEGE3").query.includes('"WEGE3" OR "WEG"'));
assert.ok(newsSelection("brazil").query.includes("Ibovespa"));
assert.ok(newsSelection("brazil").symbols.includes("^BVSP"));
assert.ok(
  newsSelection("stocks").symbols.every((s) =>
    ASSETS.some((a) => a.symbol === s && a.group === "br"),
  ),
);
assert.ok(
  newsSelection("us").symbols.every(
    (s) => !s.endsWith(".SA") && s !== "BTC-USD",
  ),
);
const item = (
  title,
  url = "https://example.com/article",
  source = "Jornal",
  date = "Thu, 29 Oct 2026 10:00:00 GMT",
) =>
  `<item><title><![CDATA[${title} - ${source}]]></title><link>${url}</link><source url="https://example.com">${source}</source><pubDate>${date}</pubDate></item>`;
const xml =
  "<rss><channel>" +
  item("WEGE3: resultados &amp; dividendos") +
  item("Duplicate") +
  item("HTTP link", "http://example.com/insecure") +
  item("Ibovespa em alta", "https://example.com/market", "Diário") +
  "</channel></rss>";
const stocks = parseNews(xml, "WEGE3", "Fonte");
assert.equal(stocks.length, 2);
assert.equal(stocks[0].title, "WEGE3: resultados & dividendos");
assert.equal(stocks[0].ticker, "WEGE3");
assert.equal(stocks[0].source, "Jornal");
const brazil = parseNews(xml, "brazil", "Fonte");
assert.equal(brazil[0].ticker, "WEGE3");
assert.equal(brazil[1].ticker, "Bolsa brasileira");
assert.deepEqual(parseNews("<rss/>", "all", "Fonte"), []);
assert.deepEqual(parseNews(xml, "invalid", "Fonte"), []);
console.log(
  "News passed: all categories and assets, alternative name/ticker queries, B3/US separation, Brazilian market, RSS entities, source attribution, duplicate removal and valid links.",
);

// Ativo cadastrado por você: nome e símbolo vêm do navegador e são conferidos.
{
  const { customNewsAsset } = await import("../app/lib/news.ts");
  const params = (o) => new URLSearchParams(o);
  const fii = customNewsAsset(
    "HGLG11",
    params({ name: 'CSHG "Logística"  <b>', symbol: "HGLG11.SA" }),
  );
  assert.deepEqual(fii, {
    ticker: "HGLG11",
    symbol: "HGLG11.SA",
    name: "CSHG Logística b",
    currency: "BRL",
  });
  assert.equal(
    newsSelection("HGLG11", fii).query,
    '"HGLG11" OR "CSHG Logística b"',
  );
  assert.deepEqual(newsSelection("HGLG11", fii).symbols, ["HGLG11.SA"]);
  // Sem os dados, ou com dados inválidos, o filtro continua recusado.
  assert.equal(newsSelection("HGLG11"), undefined);
  assert.equal(
    customNewsAsset("HGLG11", params({ symbol: "HGLG11.SA" })),
    undefined,
  );
  assert.equal(
    customNewsAsset("HGLG11", params({ name: "x", symbol: "a b/../c" })),
    undefined,
  );
  assert.equal(
    customNewsAsset("../etc", params({ name: "x", symbol: "X" })),
    undefined,
  );
  // O ativo de outro código não vale para este filtro.
  assert.equal(newsSelection("OUTRO11", fii), undefined);
  const xml =
    "<rss><item><title>Fundo anuncia rendimento</title><link>https://exemplo.test/a</link><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item></rss>";
  assert.equal(parseNews(xml, "HGLG11", "Fonte", fii)[0].ticker, "HGLG11");
  assert.deepEqual(parseNews(xml, "HGLG11", "Fonte"), []);
  console.log(
    "Custom asset news passed: validated name and symbol, refused without them.",
  );
}
