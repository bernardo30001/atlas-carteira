import assert from "node:assert/strict";
const base = process.env.ATLAS_TEST_BASE;
if (!base)
  throw new Error(
    "Rode com npm run test:api: este teste grava dados e não usa o banco local real.",
  );
assert.equal((await fetch(base + "/api/portfolio")).status, 401);
// Só o servidor de desenvolvimento aceita este cookie. Em produção, vale o Access.
const cookie = "atlas_dev_user=local@atlas.test";
const headers = {
  Cookie: cookie,
  "Content-Type": "application/json",
  Origin: base,
};
let r = await fetch(base + "/api/portfolio", { headers }),
  initial = await r.json();
assert.equal(r.status, 200);
const original = initial.portfolio;
const tx = {
  id: crypto.randomUUID(),
  ticker: "WEGE3",
  kind: "buy",
  quantity: 2,
  price: 40,
  fx: 1,
  fees: 1,
  date: "2026-10-26",
  note: "Teste local",
};
let edited = { ...original, transactions: [...original.transactions, tx] };
r = await fetch(base + "/api/portfolio", {
  method: "PUT",
  headers,
  body: JSON.stringify({ portfolio: edited, revision: initial.revision }),
});
const saved = await r.json();
assert.equal(r.status, 200, JSON.stringify(saved));
r = await fetch(base + "/api/portfolio", { headers });
const read = await r.json();
assert.ok(read.portfolio.transactions.some((x) => x.id === tx.id));
r = await fetch(base + "/api/portfolio", {
  method: "PUT",
  headers,
  body: JSON.stringify({ portfolio: edited, revision: initial.revision }),
});
assert.equal(r.status, 409);
r = await fetch(base + "/api/portfolio", {
  method: "PUT",
  headers,
  body: JSON.stringify({
    portfolio: { ...edited, targets: { br: 100, rf: 100, etf: 0, crypto: 0 } },
    revision: saved.revision,
  }),
});
assert.equal(r.status, 400);
r = await fetch(base + "/api/portfolio", {
  method: "PUT",
  headers: { ...headers, Origin: "https://unexpected.example" },
  body: JSON.stringify({ portfolio: original, revision: saved.revision }),
});
assert.equal(r.status, 403);
r = await fetch(base + "/api/portfolio", {
  method: "PUT",
  headers,
  body: JSON.stringify({ portfolio: original, revision: saved.revision }),
});
assert.equal(r.status, 200);
console.log(
  "API verification passed: authentication, cloud-style persistence, revision conflict, target validation, cross-origin protection and restoration of local fixture.",
);
