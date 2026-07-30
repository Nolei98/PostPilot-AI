// ============================================================
// Planos e limites — fonte única da verdade para gating.
// Preço mora no Stripe (Price IDs via env); aqui só limites e
// metadados de exibição.
// ============================================================

export type PlanId = "free" | "criador" | "pro";

export interface PlanLimits {
  /** posts gerados por mês (ciclo = mês calendário) */
  postsPerMonth: number;
  /** fontes RSS ativas POR CLIENTE (o custo de varredura é por fonte) */
  maxSources: number;
  /**
   * Clientes (marcas) que o dono pode ter.
   *
   * Existe porque `maxSources` sozinho não segura nada: sem teto de
   * cliente, criar N marcas multiplica as fontes e a triagem — e a
   * triagem gasta IA por notícia a cada 3h, ANTES do teto de posts, que
   * só vale na geração. Ver docs/auditoria-lancamento.md §2.1–2.3.
   */
  maxClients: number;
  /** contra-capa sem marca "feito com PostPilot" */
  customClosingPage: boolean;
  /** re-render automático da fila ao salvar Ajustes */
  autoSync: boolean;
  /** idiomas além de pt-BR */
  multiLanguage: boolean;
}

export const PLANS: Record<PlanId, PlanLimits & { label: string; priceBRL: number }> = {
  free: {
    label: "Radar",
    priceBRL: 0,
    postsPerMonth: 5,
    maxSources: 2,
    maxClients: 1,
    customClosingPage: false,
    autoSync: false,
    multiLanguage: false,
  },
  criador: {
    label: "Criador",
    priceBRL: 79,
    postsPerMonth: 30,
    maxSources: 5,
    maxClients: 3,
    customClosingPage: true,
    autoSync: true,
    multiLanguage: true,
  },
  pro: {
    label: "Pro",
    priceBRL: 149,
    postsPerMonth: 90,
    maxSources: Infinity,
    maxClients: Infinity,
    customClosingPage: true,
    autoSync: true,
    multiLanguage: true,
  },
};

/** Stripe Price IDs (criados no dashboard do Stripe, colados no .env) */
export const STRIPE_PRICES: Record<Exclude<PlanId, "free">, string | undefined> = {
  criador: process.env.STRIPE_PRICE_CRIADOR,
  pro: process.env.STRIPE_PRICE_PRO,
};
