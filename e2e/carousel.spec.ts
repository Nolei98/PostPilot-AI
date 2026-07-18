// ============================================================
// e2e da UI de carrossel: o post format='carousel' semeado no
// global-setup aparece na fila como galeria (3 cards) e esconde os
// controles que só fazem sentido no post single.
// ============================================================
import { test, expect } from "@playwright/test";

test("carrossel aparece como galeria e esconde controles single", async ({ page }) => {
  await page.goto("/fila");

  // O card do post carrossel semeado.
  await expect(page.getByText("Notícia e2e carrossel")).toBeVisible();

  // Galeria com 3 cards → indicador "1/3" do CarouselPreview.
  await expect(page.getByText("1/3")).toBeVisible();

  // Controles single-only escondidos no carrossel.
  await expect(page.getByText("Prompt de imagem")).toHaveCount(0);
  await expect(page.getByText("Adicionar contra-capa")).toHaveCount(0);
});
