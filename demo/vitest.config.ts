// Corre la prueba de integración de la app real contra el Prisma en memoria de la demo.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@prisma/client": r("demo/src/shims/prisma.ts"), "@": r("src") } },
  test: { root: r("."), include: ["src/server/flow.test.ts"], testTimeout: 30_000 },
});
