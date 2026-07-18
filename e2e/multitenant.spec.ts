// ============================================================
// e2e (Playwright, stack real): valida o multi-tenant pela UI —
// o seletor de cliente aparece com o tenant do signup e criar um
// novo cliente isola fila e fontes (prova visual do isolamento).
// Autenticado via storageState do global-setup.
// ============================================================
import { test, expect } from "@playwright/test";

test("seletor mostra o tenant criado no signup", async ({ page }) => {
  await page.goto("/fila");
  const select = page.locator("aside").getByTestId("client-select");
  await expect(select).toBeVisible();
  await expect(select).toContainText("E2E Marca");
});

test("criar novo cliente isola fila e fontes (tenant limpo)", async ({ page }) => {
  await page.goto("/fila");
  const aside = page.locator("aside");

  await aside.getByTestId("new-client-btn").click();
  await aside.getByTestId("new-client-name").fill("Cliente E2E 2");
  await aside.getByTestId("new-client-create").click();

  // O novo cliente vira ativo (server action + revalidate).
  await expect(aside.getByTestId("client-select")).toContainText("Cliente E2E 2", {
    timeout: 15_000,
  });

  // Tenant recém-criado não tem fontes RSS → prova de isolamento.
  await page.goto("/settings");
  await expect(page.getByText("Nenhuma fonte")).toBeVisible();

  // E a marca do signup (com 4 fontes default) continua isolada: ao
  // voltar pra ela, as fontes reaparecem.
  await aside.getByTestId("client-select").selectOption({ label: "E2E Marca" });
  await expect(page.getByText("Nenhuma fonte")).toBeHidden({ timeout: 15_000 });
});
