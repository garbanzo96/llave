// Demo web de Llave: compila las páginas, acciones y servicios reales de src/ para el navegador,
// cambiando solo lo que necesita un servidor (base de datos, sesión, cifrado, archivos y SMS).
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import tailwind from "@tailwindcss/postcss";

const root = fileURLToPath(new URL("..", import.meta.url));
const r = (p: string) => path.join(root, p);
const base = process.env.DEMO_BASE ?? "/llave/";
const appUrl = process.env.DEMO_APP_URL ?? "https://garbanzo96.github.io/llave/#";

const ALIAS: Record<string, string> = {
  "@prisma/client": r("demo/src/shims/prisma.ts"),
  "next/link": r("demo/src/shims/link.tsx"),
  "next/navigation": r("demo/src/shims/navigation.ts"),
  "next/cache": r("demo/src/shims/next-misc.ts"),
  "next/headers": r("demo/src/shims/next-misc.ts"),
};
const SWAP: Record<string, string> = {
  [r("src/server/auth.ts")]: r("demo/src/shims/auth.ts"),
  [r("src/server/crypto.ts")]: r("demo/src/shims/crypto.ts"),
  [r("src/server/storage.ts")]: r("demo/src/shims/storage.ts"),
  [r("src/server/notify.ts")]: r("demo/src/shims/notify.ts"),
};

function replaceOnce(code: string, from: string, to: string, file: string) {
  if (!code.includes(from)) throw new Error(`demo: no encontré «${from}» en ${file}; actualiza demo/vite.config.ts`);
  return code.replace(from, to);
}

function llaveDemo(): Plugin {
  return {
    name: "llave-demo",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (ALIAS[source]) return ALIAS[source];
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && SWAP[resolved.id] ? SWAP[resolved.id] : null;
    },
    transform(code, id) {
      if (!id.startsWith(r("src/")) && !id.startsWith(r("prisma/"))) return null;
      // Las rutas /api/... de la app real las responde el service worker bajo la base de GitHub Pages.
      let out = code.replaceAll('"/api/', `"${base}api/`).replaceAll("`/api/", "`" + base + "api/");
      // "use client" / "use server" solo tienen sentido en Next; aquí todo corre en el navegador.
      out = out.replace(/^\s*(["'])use (client|server)\1;?/, "");
      if (id === r("prisma/seed.ts")) {
        out = replaceOnce(out, 'process.env.NODE_ENV === "production"', "false", id);
        out = replaceOnce(out, "main().catch(", "export const seeded = main().catch(", id);
        out = replaceOnce(out, "process.exitCode = 1;", "void 0;", id);
      }
      return out;
    },
  };
}

export default defineConfig({
  root: r("demo"),
  base,
  plugins: [llaveDemo()],
  resolve: { alias: { "@": r("src") } },
  esbuild: { jsx: "automatic" },
  define: { "process.env.APP_URL": JSON.stringify(appUrl) },
  css: { postcss: { plugins: [tailwind()] } },
  server: { fs: { allow: [root] } },
  build: {
    outDir: r("demo/dist"),
    emptyOutDir: true,
  },
});
