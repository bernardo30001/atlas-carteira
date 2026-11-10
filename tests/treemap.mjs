// Mapa da carteira: áreas proporcionais, sem sobras nem sobreposição. Valores fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import { groupedTreemap, treemap } from "../app/lib/treemap.ts";

const near = (a, b, label = "") =>
  assert.ok(Math.abs(a - b) < 1e-6, `${label} ${a} != ${b}`);
const area = (t) => t.width * t.height;
const overlap = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-9 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-9;
const entries = (...values) => values.map((value, i) => ({ item: i, value }));

test("a área de cada bloco é proporcional ao valor", () => {
  // 100 × 60 = 6000 de área para valores 6, 3, 2 e 1 (total 12): 3000, 1500, 1000, 500.
  const tiles = treemap(entries(6, 3, 2, 1), 100, 60);
  assert.equal(tiles.length, 4);
  for (const [i, expected] of [3000, 1500, 1000, 500].entries())
    near(area(tiles.find((t) => t.item === i)), expected, "bloco " + i);
  near(
    tiles.reduce((s, t) => s + area(t), 0),
    6000,
    "área total",
  );
});

test("blocos ficam dentro da moldura e não se sobrepõem", () => {
  const tiles = treemap(entries(40, 25, 12, 9, 6, 4, 2, 1, 1), 100, 70);
  for (const t of tiles) {
    assert.ok(t.x >= -1e-9 && t.y >= -1e-9, "origem");
    assert.ok(
      t.x + t.width <= 100 + 1e-9 && t.y + t.height <= 70 + 1e-9,
      "fim",
    );
  }
  for (const [i, a] of tiles.entries())
    for (const b of tiles.slice(i + 1))
      assert.ok(!overlap(a, b), "sobreposição");
});

test("blocos ficam perto de quadrados, para caber o nome", () => {
  // Quatro valores iguais numa moldura quadrada viram quatro quadrados.
  for (const t of treemap(entries(1, 1, 1, 1), 100, 100)) {
    near(t.width, 50, "largura");
    near(t.height, 50, "altura");
  }
});

test("um item ocupa tudo; zero, negativo e inválido ficam fora", () => {
  const [only] = treemap(entries(5), 80, 40);
  assert.deepEqual([only.x, only.y, only.width, only.height], [0, 0, 80, 40]);
  assert.deepEqual(
    treemap(entries(3, 0, -2, NaN), 10, 10).map((t) => t.item),
    [0],
  );
  assert.deepEqual(treemap([], 10, 10), []);
  assert.deepEqual(treemap(entries(1), 0, 10), []);
});

test("dois níveis: cada grupo ganha uma região com a soma dos seus itens", () => {
  const map = groupedTreemap(
    [
      { group: "a", entries: entries(30, 30) },
      { group: "b", entries: entries(30) },
      { group: "c", entries: entries(10) },
      { group: "vazio", entries: [] },
    ],
    100,
    50,
  );
  assert.deepEqual(
    map.map((g) => g.group),
    ["a", "b", "c"],
  );
  const of = (name) => map.find((g) => g.group === name);
  near(area(of("a").region), 3000, "região a: 60% de 5000");
  near(
    of("a").tiles.reduce((s, t) => s + area(t), 0),
    3000,
    "itens de a",
  );
  near(area(of("c").region), 500, "região c");
  // Nenhum bloco de um grupo invade a região de outro.
  for (const g of map)
    for (const other of map.filter((o) => o !== g))
      for (const t of g.tiles) assert.ok(!overlap(t, other.region), "invasão");
});

test("a folga separa as regiões sem tirar o mapa da moldura", () => {
  const map = groupedTreemap(
    [
      { group: "a", entries: entries(1) },
      { group: "b", entries: entries(1) },
    ],
    100,
    50,
    4,
  );
  const [a, b] = map.map((g) => g.tiles[0]);
  near(a.x, 0, "encosta na esquerda");
  near(b.x + b.width, 100, "encosta na direita");
  near(b.x - (a.x + a.width), 4, "folga entre as regiões");
  near(a.height, 50, "altura inteira");
});
