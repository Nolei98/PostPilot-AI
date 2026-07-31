// ============================================================
// Contrato comum dos coletores do Viral Radar (Sprint E).
//
// Existe pra que a fonte seja trocável: hoje só o Hacker News responde
// sem credencial (o `.json` público do Reddit passou a devolver 403 e
// agora exige OAuth). Quando o app do Reddit existir, ele entra como
// mais um `RadarCollector` — o job, o score e a tela não mudam.
// ============================================================

export type RadarPlatform = "hackernews" | "reddit" | "youtube";

/** Item bruto, como a plataforma devolveu. Nada de score aqui: o número
 *  medido e a fórmula que o interpreta vivem separados de propósito. */
export interface RadarItem {
  platform: RadarPlatform;
  externalId: string;
  url: string;
  title: string;
  author: string | null;
  /** Consulta ou comunidade que trouxe o item — serve de rastro. */
  topic: string;
  points: number;
  comments: number;
  publishedAt: string | null;
}

export interface RadarCollector {
  platform: RadarPlatform;
  /**
   * Busca referências de um tema. Nunca lança por falha de rede: fonte
   * fora do ar não pode derrubar a varredura inteira — mesma regra do
   * scan-news.ts com feed quebrado.
   */
  collect(topic: string, opts: { desde: Date; limite: number }): Promise<RadarItem[]>;
}
