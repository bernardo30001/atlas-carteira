import assert from "node:assert/strict";
const base = process.env.ATLAS_TEST_BASE;
if (!base)
  throw new Error(
    "Rode com npm run test:api: este teste grava dados e não usa o banco local real.",
  );
assert.equal((await fetch(base + "/api/performance")).status, 401);
assert.equal(
  (await fetch(base + "/api/performance", { method: "POST" })).status,
  401,
);
// Só o servidor de desenvolvimento aceita este cookie. Em produção, vale o Access.
const cookie = "atlas_dev_user=local@atlas.test";
const headers = { Cookie: cookie, Origin: base };
const empty = await (await fetch(base + "/api/portfolio", { headers })).json();
const seeded = await fetch(base + "/api/portfolio", {
  method: "PUT",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({
    revision: empty.revision,
    portfolio: {
      ...empty.portfolio,
      transactions: [
        {
          id: crypto.randomUUID(),
          ticker: "WEGE3",
          kind: "opening",
          quantity: 10,
          price: 10,
          fx: 1,
          fees: 0,
          date: "2026-01-05",
          note: "Fictício",
        },
      ],
    },
  }),
});
assert.equal(seeded.status, 200);
const original = await (
  await fetch(base + "/api/portfolio", { headers })
).json();
let first = await (
  await fetch(base + "/api/performance", { method: "POST", headers })
).json();
assert.ok(!first.error, JSON.stringify(first));
assert.ok(first.points.length);
assert.equal(first.points.filter((p) => p.baseline).length, 1);
const replies = await Promise.all(
  Array.from({ length: 5 }, () =>
    fetch(base + "/api/performance", { method: "POST", headers }).then((r) =>
      r.json(),
    ),
  ),
);
assert.ok(
  replies.every((j) => !j.error),
  JSON.stringify(replies),
);
const saved = await (
  await fetch(base + "/api/performance", { headers })
).json();
assert.equal(saved.startedAt, first.startedAt);
assert.equal(saved.points.filter((p) => p.baseline).length, 1);
assert.ok(saved.points.length <= first.points.length + 1);
assert.equal(
  (
    await fetch(base + "/api/performance", {
      headers: { ...headers, Origin: "https://unexpected.example" },
      method: "POST",
    })
  ).status,
  403,
);
const afterward = await (
  await fetch(base + "/api/portfolio", { headers })
).json();
assert.deepEqual(afterward, original);
console.log(
  "Performance API passed: sign-in required, persistent baseline, concurrent capture, bucket consolidation, origin guard and holdings unchanged.",
);
