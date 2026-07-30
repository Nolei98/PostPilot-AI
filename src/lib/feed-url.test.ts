// SSRF pela URL de fonte RSS.
//
// `scan-news` busca `source_configs.feed_url` NO SERVIDOR. Sem validação,
// cadastrar uma "fonte" era o mesmo que mandar o servidor fazer uma
// requisição pra qualquer endereço — rede interna, localhost, endpoint de
// metadados de nuvem (169.254.169.254, que devolve credenciais em vários
// provedores). Ver docs/auditoria-lancamento.md §2.5.
import { describe, it, expect } from "vitest";
import { validateFeedUrl } from "@/lib/feed-url";

describe("validateFeedUrl — checagem sintática", () => {
  it("aceita feed público normal", () => {
    for (const url of [
      "https://techcrunch.com/feed/",
      "http://exemplo.com.br/rss.xml",
      "https://sub.dominio.com/path?a=1",
    ]) {
      expect(validateFeedUrl(url)).toEqual({ ok: true });
    }
  });

  it("recusa esquema que não seja http(s)", () => {
    // file: lê disco; gopher: e dict: já foram vetores clássicos de SSRF.
    for (const url of ["file:///etc/passwd", "gopher://x/1", "dict://localhost:11211/"]) {
      expect(validateFeedUrl(url).ok).toBe(false);
    }
  });

  it("recusa localhost em todas as formas", () => {
    for (const url of [
      "http://localhost/feed",
      "http://localhost:3000/feed",
      "http://algo.localhost/feed",
      "http://127.0.0.1/feed",
      "http://127.0.0.53:8080/x",
      "http://[::1]/feed",
    ]) {
      expect(validateFeedUrl(url).ok).toBe(false);
    }
  });

  it("recusa faixas privadas de IPv4", () => {
    for (const url of [
      "http://10.0.0.5/feed",
      "http://172.16.0.1/feed",
      "http://172.31.255.254/feed",
      "http://192.168.1.1/feed",
      "http://0.0.0.0/feed",
    ]) {
      expect(validateFeedUrl(url).ok).toBe(false);
    }
  });

  it("recusa o endpoint de metadados de nuvem", () => {
    // 169.254.169.254 devolve credenciais da instância em AWS/GCP/Azure.
    expect(validateFeedUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
  });

  it("aceita 172.32 — está FORA da faixa privada (172.16–172.31)", () => {
    // Testa a borda: errar isso barraria endereço público de verdade.
    expect(validateFeedUrl("http://172.32.0.1/feed").ok).toBe(true);
    expect(validateFeedUrl("http://172.15.0.1/feed").ok).toBe(true);
  });

  it("recusa domínio interno (.local, .internal)", () => {
    expect(validateFeedUrl("http://servidor.local/feed").ok).toBe(false);
    expect(validateFeedUrl("http://api.internal/feed").ok).toBe(false);
  });

  it("recusa credenciais embutidas na URL", () => {
    expect(validateFeedUrl("https://user:senha@exemplo.com/feed").ok).toBe(false);
  });

  it("recusa vazio e lixo", () => {
    expect(validateFeedUrl("").ok).toBe(false);
    expect(validateFeedUrl("   ").ok).toBe(false);
    expect(validateFeedUrl("não é url").ok).toBe(false);
  });

  it("devolve mensagem em português, pra aparecer no formulário", () => {
    const r = validateFeedUrl("file:///etc/passwd");
    expect(r.error).toMatch(/http/i);
  });
});
