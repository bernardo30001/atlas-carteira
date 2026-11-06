// Roda todos os testes que não dependem de servidor. Os de API ficam em test-api.mjs.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const files = readdirSync("tests")
  .filter((name) => name.endsWith(".mjs") && !name.includes("api"))
  .sort();
let failed = 0;
for (const file of files) {
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", `tests/${file}`],
    { encoding: "utf8" },
  );
  if (run.status === 0) console.log(`ok    ${file}`);
  else {
    failed++;
    console.log(`FALHA ${file}\n${run.stdout}\n${run.stderr}`);
  }
}
console.log(`${files.length - failed} de ${files.length} arquivos passaram.`);
process.exit(failed ? 1 : 0);
