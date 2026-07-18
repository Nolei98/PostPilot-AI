import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes unitários rodam em Node, sem DOM. Alias "@/..." resolvido
// manualmente (evita plugin ESM-only no config CJS). A suíte é
// MOCK-only: nenhum teste depende de chave de API (ver triage.test.ts,
// que faz stub das envs de IA).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    clearMocks: true,
  },
});
