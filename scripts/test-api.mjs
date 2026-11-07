// Roda os testes de API em um banco local temporário, nunca em .wrangler/state.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const port = 5183;
const base = `http://localhost:${port}`;
const state = resolve(".wrangler/test-state");
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");

rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true });

const config = join(state, "wrangler.json");
writeFileSync(
  config,
  JSON.stringify({
    name: "atlas-test",
    compatibility_date: "2026-05-15",
    d1_databases: [
      {
        binding: "DB",
        database_name: "site-creator-d1",
        database_id: "00000000-0000-4000-8000-000000000000",
      },
    ],
  }),
);

for (const file of readdirSync("drizzle")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  const applied = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "site-creator-d1",
      "--local",
      "--persist-to",
      state,
      "--config",
      config,
      "--file",
      join("drizzle", file),
      "--yes",
    ],
    { encoding: "utf8" },
  );
  if (applied.status !== 0) {
    console.error(applied.stdout, applied.stderr);
    throw new Error(`Migração ${file} não aplicada ao banco de teste.`);
  }
}

const server = spawn(
  process.execPath,
  ["node_modules/vinext/dist/cli.js", "dev", "--port", String(port), "--strictPort"],
  {
    env: { ...process.env, ATLAS_PERSIST_STATE: state },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
server.stdout.on("data", (chunk) => (log += chunk));
server.stderr.on("data", (chunk) => (log += chunk));

let exitCode = 1;
try {
  const deadline = Date.now() + 90000;
  for (;;) {
    if (server.exitCode !== null) throw new Error("Servidor de teste encerrou.");
    const ready = await fetch(base + "/api/cdi")
      .then((r) => r.status > 0)
      .catch(() => false);
    if (ready) break;
    if (Date.now() > deadline) throw new Error("Servidor de teste não subiu.");
    await new Promise((done) => setTimeout(done, 500));
  }
  exitCode = 0;
  for (const file of ["tests/api.mjs", "tests/performance-api.mjs"]) {
    const run = spawnSync(process.execPath, [file], {
      env: { ...process.env, ATLAS_TEST_BASE: base },
      stdio: "inherit",
    });
    if (run.status !== 0) exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(log.slice(-2000));
} finally {
  server.kill("SIGTERM");
  await new Promise((done) => setTimeout(done, 500));
  rmSync(state, { recursive: true, force: true });
}
process.exit(exitCode);
