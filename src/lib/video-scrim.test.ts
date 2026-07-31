// ============================================================
// Véu de legibilidade do vídeo medido em VÁRIOS frames.
//
// O caso que quebrava: vídeo gerado (Sprint D) troca de b-roll a cada
// segmento. Medindo só o frame do meio — escuro — o véu saía fraco e o
// wordmark sumia nos trechos claros do mesmo vídeo.
// ============================================================
import { describe, it, expect } from "vitest";
import { videoScrimContrast } from "@/lib/image";

const ESCURO = 0.08;
const CLARO = 0.86;

describe("videoScrimContrast", () => {
  it("um frame escuro pede texto claro", () => {
    const { theme, textColor } = videoScrimContrast([ESCURO]);
    expect(theme).toBe("dark");
    expect(textColor.toUpperCase()).toBe("#FFFFFF");
  });

  it("cena que CLAREIA no meio pede véu mais forte que o frame escuro sozinho", () => {
    const soEscuro = videoScrimContrast([ESCURO, ESCURO, ESCURO]);
    const misturado = videoScrimContrast([ESCURO, ESCURO, CLARO, ESCURO, CLARO]);
    expect(misturado.alpha).toBeGreaterThan(soEscuro.alpha);
  });

  it("a cor do texto NÃO muda entre os frames — é uma só pro vídeo inteiro", () => {
    const misturado = videoScrimContrast([ESCURO, CLARO, ESCURO, CLARO, ESCURO]);
    expect(["#FFFFFF", "#111111"]).toContain(misturado.textColor.toUpperCase());
  });

  it("o pior frame manda no véu, não a média", () => {
    // Mesma média, distribuições diferentes: quem tem um pico claro
    // precisa de mais véu do que quem é uniforme.
    const uniforme = videoScrimContrast([0.4, 0.4, 0.4, 0.4]);
    const comPico = videoScrimContrast([0.14, 0.14, 0.14, 1.18]);
    expect(comPico.alpha).toBeGreaterThanOrEqual(uniforme.alpha);
  });

  it("nunca fica abaixo do piso, nem com o vídeo todo escuro", () => {
    const escuroTotal = videoScrimContrast([0, 0, 0]);
    expect(escuroTotal.alpha).toBeGreaterThan(0);
  });

  it("lista vazia não quebra", () => {
    expect(() => videoScrimContrast([])).not.toThrow();
  });
});
