import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** GET /api/app-shell/routes (dev e preview). Na Vercel: rewrite em vercel.json. */
function appShellRoutesApi(): Plugin {
  const handler = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => {
    if (req.url?.split("?")[0] !== "/api/app-shell/routes") return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(readFileSync(resolve(__dirname, "public/api/app-shell/routes.json"), "utf8"));
  };
  return {
    name: "smart40-app-shell-routes",
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  };
}

/**
 * Telas dos grupos (grupos/<gN>/...) trazem CSS global (html, body, :root, button…).
 * Na SPA única esse CSS NÃO pode vazar para o Shell: todo .css importado por arquivos de
 * grupos/ vira string (?inline) e o módulo do grupo o aplica dentro do próprio Shadow DOM.
 */
function isolateGroupCss(): Plugin {
  return {
    name: "smart40-isolate-group-css",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer || !/[\\/]grupos[\\/]/.test(importer) || !source.endsWith(".css")) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      return resolved ? `${resolved.id}?inline` : null;
    },
  };
}

const headers = { "Access-Control-Allow-Origin": "*" };

export default defineConfig({
  plugins: [isolateGroupCss(), react(), appShellRoutesApi()],
  server: { port: 9000, strictPort: true, host: true, headers },
  preview: { port: 9000, strictPort: true, host: true, headers },
  build: { sourcemap: false },
});
