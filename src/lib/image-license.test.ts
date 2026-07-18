import { describe, it, expect } from "vitest";
import { checkImageLicenseHint } from "@/lib/image-license";

describe("checkImageLicenseHint", () => {
  it("retorna null quando não há URL", () => {
    expect(checkImageLicenseHint(null)).toBeNull();
  });

  it("marca domínios de banco livre como likely_free", () => {
    expect(checkImageLicenseHint("https://images.pexels.com/x.jpg")).toBe("likely_free");
    expect(checkImageLicenseHint("https://unsplash.com/a.jpg")).toBe("likely_free");
    expect(checkImageLicenseHint("https://upload.wikimedia.org/b.png")).toBe("likely_free");
  });

  it("ignora o prefixo www.", () => {
    expect(checkImageLicenseHint("https://www.pexels.com/x.jpg")).toBe("likely_free");
  });

  it("trata domínios .gov / .gov.br como likely_free", () => {
    expect(checkImageLicenseHint("https://nasa.gov/img.jpg")).toBe("likely_free");
    expect(checkImageLicenseHint("https://dados.gov.br/foto.jpg")).toBe("likely_free");
  });

  it("marca sites de veículo de notícia como verify", () => {
    expect(checkImageLicenseHint("https://techcrunch.com/wp/x.jpg")).toBe("verify");
    expect(checkImageLicenseHint("https://www.theverge.com/y.png")).toBe("verify");
  });

  it("cai em verify quando a URL é inválida", () => {
    expect(checkImageLicenseHint("nao-e-uma-url")).toBe("verify");
  });

  it("não confunde domínio livre usado como substring de outro host", () => {
    // 'pexels.com.evil.com' NÃO deve virar likely_free
    expect(checkImageLicenseHint("https://pexels.com.evil.com/x.jpg")).toBe("verify");
  });
});
