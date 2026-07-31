// ============================================================
// Normalização do provider de TEXTO salvo em Ajustes.
//
// O caso que quebrava (Sprint G, 31/07): a ação tinha a lista escrita à
// mão — aceitava 'claude' e 'pollinations' e jogava TODO o resto em
// 'gemini'. Escolher NVIDIA na tela salvava Gemini, calado. O kit do
// cliente só estava em 'nvidia' porque foi setado por script.
// ============================================================
import { describe, it, expect } from "vitest";
import { resolveTextProvider } from "@/lib/ai/provider";

describe("provider de texto salvo em Ajustes", () => {
  it("preserva NVIDIA — o caso que a lista manual perdia", () => {
    expect(resolveTextProvider("nvidia")).toBe("nvidia");
  });

  it("preserva os outros providers conhecidos", () => {
    for (const p of ["gemini", "claude", "pollinations"]) {
      expect(resolveTextProvider(p)).toBe(p);
    }
  });

  it("desconhecido e vazio caem no default", () => {
    expect(resolveTextProvider("qualquer-coisa")).toBe("gemini");
    expect(resolveTextProvider(null)).toBe("gemini");
    expect(resolveTextProvider(undefined)).toBe("gemini");
  });
});
