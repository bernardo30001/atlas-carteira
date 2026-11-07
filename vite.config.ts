import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // A configuração da Cloudflare fica em wrangler.jsonc.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        // Só os testes de API definem esta variável. Publicação e dev normal não mudam.
        ...(process.env.ATLAS_PERSIST_STATE
          ? { persistState: { path: process.env.ATLAS_PERSIST_STATE } }
          : {}),
      }),
    ],
  };
});
