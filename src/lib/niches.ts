// ============================================================
// Nichos suportados — escolhido no cadastro, ajustável em Ajustes.
// Direciona o tom dos posts gerados (generate.ts) e, no cadastro,
// as fontes RSS padrão semeadas pelo trigger handle_new_user
// (migration 017) — mantenha as chaves sincronizadas com o SQL lá.
// ============================================================
export const NICHES: { key: string; label: string }[] = [
  { key: "tecnologia", label: "Tecnologia & IA" },
  { key: "marketing", label: "Marketing & Vendas" },
  { key: "financas", label: "Finanças & Investimentos" },
  { key: "saude", label: "Saúde & Bem-estar" },
  { key: "games", label: "Games & Entretenimento" },
  { key: "outro", label: "Outro" },
];

export function nicheLabel(key: string | null | undefined): string {
  return NICHES.find((n) => n.key === key)?.label ?? "seu nicho";
}
