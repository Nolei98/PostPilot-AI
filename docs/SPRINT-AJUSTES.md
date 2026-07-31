# Sprint G — Auditoria da tela de Ajustes

> Criada em 2026-07-31 a pedido do João: testar se tudo em Ajustes
> funciona, verificar se cada controle é necessário, corrigir o que estiver
> errado e **remover o que não serve** — perguntando antes de remover.
>
> Este documento é o inventário e a proposta. **Nada foi removido ainda.**

## Critério

Um controle fica se responde SIM às três:

1. **Chega no produto?** O valor salvo altera algo que o usuário vê.
2. **Funciona hoje?** Não depende de chave/serviço que não existe em produção.
3. **É decisão do usuário?** Se só existe uma resposta certa, é padrão, não opção.

---

## Inventário

### A. Perfil e marca — todos passam

| Controle | Chega no produto? | Verdito |
|---|---|---|
| `ig_display_name`, `ig_handle` | chip de perfil e rótulo dos cards | **manter** |
| `ig_verified` | selo azul no chip | **manter** |
| `show_profile_chip` | chip na capa (a contra-capa passou a assinar sempre, 31/07) | **manter** |
| `brand_name` | fallback do wordmark | **manter** |
| `logo_url` + `show_brand_logo` | `image.ts:413` e `:1800` desenham a camada | **manter** |
| `post_font_family` | tipografia da arte | **manter** |
| Identidade visual (cores) | tudo na arte, e agora também nos **fundos gerados** | **manter** |
| `layout_preset` | os 8 presets | **manter** |
| `single_post_style` | capa vs frase centralizada | **manter** |
| Template Studio (seleção por superfície) | `render-spec` → render | **manter** |

### B. Operação — todos passam

| Controle | Chega no produto? | Veredito |
|---|---|---|
| `auto_generate` | pausa o piloto (`scan-news.ts`) | **manter** |
| `default_format` | single vs carrossel | **manter** |
| `niche` | fontes semeadas + tom do texto + consultas do Radar | **manter** |
| `post_language` | idioma do texto gerado | **manter** |
| Fontes RSS (nome, URL, threshold) | a varredura inteira | **manter** |
| Instagram conectado (Sprint C) | publicação agendada | **manter** |

### C. Onde está o problema — providers

Chaves que **existem** em produção: `NVIDIA_API_KEY`, `GEMINI_API_KEY`,
`PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `TELEGRAM_BOT_TOKEN`.
Chaves que **não existem**: `ANTHROPIC_API_KEY`, `FAL_KEY`,
`POLLINATIONS_API_KEY`.

| Opção oferecida | Estado real | Proposta |
|---|---|---|
| Texto → **NVIDIA** | funciona (é o provider ativo) | manter |
| Texto → **Gemini** | funciona, teto de 20/dia | manter |
| Texto → **Claude** | **sem chave em produção** — escolher cai no fallback | **remover** |
| Texto → **Pollinations** | **sem chave** e exige crédito pago. Foi o que parou a fila por dias em julho | **remover** |
| Imagem → **stock** | funciona (Pexels/Unsplash) | manter |
| Imagem → **Gemini** | **pago por imagem** — fura a política de custo zero | **remover** |
| Imagem → **Fal.ai** | **sem chave** e pago | **remover** |
| Imagem → **Pollinations** | **sem chave** e pago | **remover** |

**Por que remover e não só avisar:** o rótulo já avisa ("exige créditos
pagos") e mesmo assim a armadilha funcionou — dois clientes ficaram em
`pollinations` e a fila parou calada por dias (§0-C.6). Opção que não pode
ser escolhida com segurança não é opção, é risco.

**Consequência de remover:** `image_provider` fica com um valor só. Aí ele
deixa de ser um campo e vira um padrão — o que reduz a tela e a superfície
de erro. O código dos providers **não** precisa sair junto: fica no lugar,
pronto pra voltar à interface no dia em que houver chave e decisão de gasto.

### D. Dúvidas que preciso que você responda

Estas eu **não** decido sozinho:

1. **Telegram** — a chave existe e o código funciona, mas você chegou a
   receber notificação? Se nunca usou, é campo pedindo `chat_id` obtido por
   uma receita de 3 passos com `getUpdates`. Manter, ou remover a seção e
   deixar a fila como único aviso?
2. **`image_provider` com um valor só** — vira padrão fixo (recomendo) ou
   você quer manter o seletor visível pensando em ligar Gemini/Fal depois?
3. **`ig_verified`** — o selo azul é decorativo: marca como verificado quem
   não é. Isso combina com o produto ou sai?
4. **Template Studio** — vale uma pergunta à parte: são 3 seletores de
   superfície + galeria. Você usa, ou o `layout_preset` já resolve?

---

## Execução (depois das respostas)

1. **Passagem clicada em Ajustes**, controle por controle, com a extensão:
   salvar cada campo e conferir no banco que o valor gravou. É o "testar se
   tudo funciona" do pedido — nunca foi feito de ponta a ponta.
2. Aplicar as remoções aprovadas.
3. Corrigir o que a passagem revelar quebrado.
4. Registrar em `PROGRESSO-2.0.md`.
