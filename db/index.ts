import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Banco D1 `DB` indisponível. Confira `d1_databases` em wrangler.jsonc.",
    );
  }

  return drizzle(env.DB, { schema });
}
