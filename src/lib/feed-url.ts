// ============================================================
// Validação de URL de fonte RSS (2026-07-30).
//
// `scan-news` faz `parser.parseURL(source.feed_url)` NO SERVIDOR. Num app
// fechado isso é inofensivo; aberto ao público vira requisição
// server-side para qualquer endereço que o usuário digitar — incluindo
// `http://localhost`, a rede interna do provedor e os endpoints de
// metadados de nuvem, que costumam devolver credenciais.
// Ver docs/auditoria-lancamento.md §2.5.
//
// Duas camadas, porque uma só não resolve:
//
//  1. `validateFeedUrl` — sintática, sem rede. Roda no cadastro da fonte
//     e dá erro imediato pra quem digitou errado.
//  2. `assertPublicHost` — resolve o DNS e conferere o IP. Precisa
//     existir porque um domínio público pode apontar pra 127.0.0.1: só
//     olhar o texto da URL não pega isso.
//
// A segunda roda também na VARREDURA, não só no cadastro: as fontes já
// gravadas nunca passaram por validação nenhuma, e o DNS de um domínio
// pode mudar depois do cadastro.
// ============================================================
import { lookup } from "node:dns/promises";

export interface FeedUrlCheck {
  ok: boolean;
  error?: string;
}

/** Faixas privadas/reservadas de IPv4, em notação CIDR conferida na mão. */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8 privada
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // link-local + metadados de nuvem
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 privada
    (a === 192 && b === 168) || // 192.168.0.0/16 privada
    (a === 192 && b === 0) || // 192.0.0.0/24 IETF
    a >= 224 // multicast e reservado
  );
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  // Mapeado de IPv4 (::ffff:127.0.0.1) — o texto muda, o destino não.
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    s.startsWith("fc") || // fc00::/7 único local
    s.startsWith("fd") ||
    s.startsWith("fe80") // link-local
  );
}

/**
 * Checagem SINTÁTICA, sem rede. Serve pro cadastro dar erro na hora.
 */
export function validateFeedUrl(raw: string): FeedUrlCheck {
  const texto = (raw ?? "").trim();
  if (!texto) return { ok: false, error: "Informe o endereço do feed." };

  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, error: "Endereço inválido. Use uma URL completa, com https://" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    // `file:`, `gopher:` e afins leem disco/serviços locais.
    return { ok: false, error: "Só endereços http:// ou https:// são aceitos." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Endereço com usuário/senha embutidos não é aceito." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Endereço da rede local não é aceito." };
  }
  // IP literal já dá pra barrar aqui, sem esperar o DNS.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIPv4(host)) {
    return { ok: false, error: "Endereço de rede interna não é aceito." };
  }
  if (host.includes(":") && isPrivateIPv6(host)) {
    return { ok: false, error: "Endereço de rede interna não é aceito." };
  }

  return { ok: true };
}

/**
 * Checagem de REDE: resolve o host e recusa se apontar pra endereço
 * privado. É o que pega o domínio público apontando pra 127.0.0.1.
 *
 * Falha de DNS devolve erro (não "ok"): feed que não resolve não serve
 * pra nada mesmo, e deixar passar abriria a porta pelo lado do erro.
 */
export async function assertPublicHost(raw: string): Promise<FeedUrlCheck> {
  const sintatica = validateFeedUrl(raw);
  if (!sintatica.ok) return sintatica;

  const host = new URL(raw.trim()).hostname.replace(/^\[|\]$/g, "");
  try {
    const enderecos = await lookup(host, { all: true });
    for (const { address, family } of enderecos) {
      const privado = family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
      if (privado) return { ok: false, error: "O endereço aponta para a rede interna." };
    }
  } catch {
    return { ok: false, error: "Não consegui resolver esse endereço." };
  }
  return { ok: true };
}
