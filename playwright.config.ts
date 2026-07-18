import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// e2e é LOCAL-only: bate no Supabase real (cria/apaga um usuário efêmero
// no global-setup/teardown). Não roda no CI (que é mock, sem secrets).
dotenv.config({ path: ".env.local" });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    storageState: "e2e/.auth/user.json",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reusa o dev server já rodando; sobe um se não houver.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
