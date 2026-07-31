// ============================================================
// Resolve o provider de TEXTO gravado no Brand Kit para um valor que os
// módulos de IA entendem.
//
// Existe porque a mesma normalização estava copiada em três jobs, e a
// cópia tinha o defeito de listar os providers "conhecidos" um a um:
// toda vez que entra um provider novo (foi o caso da NVIDIA em 30/07),
// os três precisavam ser editados juntos — e esquecer um faz o cliente
// cair silenciosamente no default sem ninguém notar.
// ============================================================
import type { TextProvider } from "@/lib/types";

const CONHECIDOS: TextProvider[] = ["claude", "gemini", "pollinations", "nvidia"];

/** Valor do banco → provider válido. Desconhecido ou nulo cai em
 *  'gemini', que é o default da coluna. */
export function resolveTextProvider(valor: string | null | undefined): TextProvider {
  return CONHECIDOS.includes(valor as TextProvider) ? (valor as TextProvider) : "gemini";
}
