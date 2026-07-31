# PostPilot AI — Plano de Lançamento (zero orçamento)

> Regra: 10 usuários reais que usam todo dia > 1.000 cadastros que não voltam.

> ⚠️ **O checklist do §1 está desatualizado** (vários itens já estão prontos).
> A versão viva dele, em portões, está em
> **[`ESTADO-DO-PROJETO.md`](./ESTADO-DO-PROJETO.md) §7**. As seções §2–§6
> daqui (canais, roteiro do dia, funil, feedback, métrica) continuam válidas.

---

## 1. Checklist de pré-lançamento

### Bloqueadores (sem isso o link NÃO circula)

- [ ] **Onboarding de usuário novo** — hoje quem cria conta chega num app vazio (sem `notification_configs`, sem fontes, fila vazia). Implementar: signup cria config default + 4 fontes padrão + dispara primeiro scan. Aha moment: 2-3 posts na fila em ~10 min após o cadastro.
- [ ] **Marca "feito com PostPilot" na arte do plano free** — definida no plano de monetização (`customClosingPage: false` em `plans.ts`), mas a renderização não existe em `image.ts`. É o loop viral: cada post free publicado divulga o app.
- [ ] **Deploy em produção** (Vercel) + env vars + migrations 001–009 no Supabase de produção.
- [ ] **Stripe live mode**: chaves `sk_live_`, produtos recriados, webhook endpoint no dashboard → domínio real (`/api/stripe/webhook`) + novo `STRIPE_WEBHOOK_SECRET`.
- [ ] **Caps de gasto** na Anthropic e Fal.ai (freemium sem cap = fatura surpresa). Free ≈ R$3/usuário/mês.
- [ ] Cota free testada em produção (6º post não gera; notícia fica `candidate` esperando upgrade).

### Verificações (2h)

- [ ] Fluxo completo em aba anônima + celular: cadastro → ajustes → scan → aprovar → baixar → checkout (cartão teste).
- [ ] `/pricing` acessível deslogado ou landing mínima com CTA de cadastro.
- [ ] E-mail de confirmação do Supabase chegando (checar spam).
- [ ] Vercel Analytics ligado (sem medição, a métrica dos 7 dias não existe).

---

## 2. Os 3 canais de distribuição gratuita

| Canal | Por quê | Ação específica |
|---|---|---|
| **1. Perfil @joaorodrigues.ia** | O produto vendendo o produto — todo post ali É demo ao vivo | Reel fixado de 30s mostrando a fila + CTA "comenta PILOTO". Bio: "Este perfil roda no piloto automático → PostPilot" |
| **2. Grupos WhatsApp/Telegram de social media e IA (BR)** | Onde mora a dor (quem gerencia perfil próprio/de cliente) | Mensagem formato "construí pra minha dor, 10 vagas de teste com acompanhamento" — pedir feedback converte 10x mais que vender. 3-5 grupos, texto adaptado por grupo |
| **3. X/Twitter tech BR (build in public)** | Comunidade compartilha ferramenta de quem constrói em público | Thread com prints e números reais + responder TODO comentário nas primeiras 4h |

Bônus: LinkedIn (alcance orgânico alto pra SaaS BR) — versão da thread em post único.

---

## 3. Sequência de lançamento — 24 horas

### Véspera, 20h — IG Story (teaser)
Enquete: **"Quanto tempo você gasta por SEMANA criando conteúdo?"** [ -2h | 2-5h | 5-10h | nem conto mais ]
Frame 2: *"Amanhã 8h eu mostro como eu reduzi o meu pra 10 minutos por dia. 👀"*

### 08h00 — Reel no IG (peça principal)

> [Tela do app, fila cheia] **"Eu não crio mais nenhum post. E posto todo dia."**
> [você falando] "Todo dia de manhã, uma IA lê as principais notícias de IA do mundo, escolhe as que têm cara de viral, escreve o post no meu tom e desenha a arte com a minha identidade."
> [screen recording: fila → Aprovar → arte pronta] "Eu abro isso aqui, aperto Aprovar... e tá feito. 3 posts por dia, 10 minutos de trabalho."
> [você] "Eu construí essa ferramenta pra mim. Agora abri 10 vagas pra testar de graça, comigo te acompanhando. **Comenta PILOTO** que eu te chamo no direct."

### 08h15 — Comentário fixado no Reel
> PILOTO 🚀 = eu te chamo no direct com o link + 30 dias grátis do plano Criador (10 vagas)

### 09h00 — Thread no X

> 1/ Eu gastava 2h por dia criando conteúdo pro meu perfil de IA. Hoje gasto 10 minutos — aprovando conteúdo que uma ferramenta minha criou sozinha. Construí, uso todo dia, e agora abri pros primeiros 10 usuários. 🧵
>
> 2/ Perfil de nicho não morre por falta de ideia. Morre por inconsistência. O custo real é diário: garimpar notícia relevante, escrever legenda que engaja, montar arte decente. Todo. Santo. Dia.
>
> 3/ O PostPilot faz o ciclo inteiro: monitora fontes de notícia de IA → pontua o potencial viral de cada uma → escreve hook, legenda e hashtags no seu tom → gera a arte com a SUA identidade visual → entrega tudo numa fila de aprovação. [print da fila]
>
> 4/ Você decide em 1 clique: aprovar, editar ou descartar. Aprovou → baixa → posta. O meu perfil (@joaorodrigues.ia) roda 100% assim — é a prova viva. [print de post publicado]
>
> 5/ Grátis: 5 posts/mês pra sentir. Founding users: 30 dias do plano Criador grátis + eu configuro tudo com você em 15 min. Só 10 vagas, em troca de feedback sincero. Chama na DM ou entra aqui: [link]

### 10h00 — Mensagem nos grupos (adaptar por grupo, nunca colar igual)

> Fala pessoal! 👋 Construí uma ferramenta pra resolver uma dor minha: manter perfil de conteúdo postando TODO dia sem gastar 2h/dia nisso. Ela monitora as notícias de IA, escolhe as mais quentes, escreve o post e gera a arte — eu só aprovo no celular. Meu perfil roda 100% nela há [X semanas].
> Tô abrindo **10 vagas de teste** com acompanhamento pessoal (30 dias do plano pago, grátis) em troca de feedback sincero de quem usa de verdade. Se você cuida de perfil próprio ou de cliente e quer testar, me chama no privado 🙌

### 12h00 — IG Stories (3 frames de bastidor)
Print da notícia real de hoje → print do post que a IA gerou → post publicado.
Texto: *"da notícia ao post publicado: 0 minutos meus."*

### 15h00 — LinkedIn (bônus)
Versão da thread em post único, tom "o que aprendi automatizando meu conteúdo".

### 18h00 — Story social proof
*"3 vagas já foram 🔥 — 7 restantes"* (só se for verdade; nunca inventar).

### 22h00 — Story recap
Repost do Reel + última chamada founding users.

---

## 4. Primeiros 10 usuários em 48h (caça nomeada + concierge)

1. **Lista de 30 alvos nomeados** (hoje): quem comenta/reage no perfil; social medias e criadores tech conhecidos; membros ativos dos grupos; quem respondeu a enquete.
2. **DM 1-a-1** — a 1ª frase tem que provar que você conhece a pessoa:

> Oi [nome]! Vi que você [posta sobre IA / cuida do perfil X / comentou no meu post Y]. Construí o PostPilot: ele monitora as notícias de IA, escreve o post e gera a arte — você só aprova. Tô escolhendo 10 pessoas pros 30 dias grátis do plano pago, com meu acompanhamento direto. Em troca só quero feedback sincero de quem usa de verdade. Topa? Te configuro tudo hoje em 15 min de call.

3. **Onboarding concierge**: call de 15 min, VOCÊ configura junto (perfil, contra-capa, fontes). Meta inegociável: **a pessoa aprova o primeiro post ainda na call.**
4. Funil esperado: 30 DMs → ~15 respostas → ~10 calls. Faltou? Segunda leva de 20 alvos no dia 2.
5. Todos entram no grupo **"PostPilot Founders"** — canal de feedback + social proof.

---

## 5. Sistema de feedback (sem travar o crescimento)

### Coletar
- Grupo Founders: observação diária + dia 3: *"o que quase te fez não voltar?"* + dia 7: *"se o PostPilot sumisse amanhã, o que você sentiria falta?"*
- **Dados > opinião**: taxa de descarte por usuário (alta = geração ruim pro nicho dele); dias desde a última aprovação (3+ dias parado = DM pessoal no mesmo dia).
- Dia 7: call de 15 min com os 3 usuários mais ativos.

### Priorizar (filtro de 2 perguntas)
(a) Impede o uso diário? (b) Pedido por 2+ pessoas?
- Sim + sim → faz agora
- Sim + não → essa semana
- Não + não → backlog público no grupo ("anotado! 👀")
- Bug na fila/geração/aprovação = **P0 sempre** (é o core loop)

### Implementar sem travar
- Manhã = 1 melhoria/dia no máximo (shipar e avisar no grupo — pedido virando feature em 24h É retenção).
- Tarde = growth (DMs, conteúdo, calls).
- **Regra de ferro da semana 1: nenhuma feature de mais de 1 dia.** Pedido grande → backlog.

---

## 6. A métrica dos primeiros 7 dias

> **Aprovadores consistentes: usuários que aprovaram ≥1 post em ≥4 dos primeiros 7 dias.**
> **Meta: 5 de 10 founding users.**

Cadastro é vaidade, MRR é cedo. O produto vende UM hábito — abrir a fila e aprovar, todo dia. Quem aprova 4+ dias na semana 1 substituiu o fluxo antigo: é quem estoura a cota free e paga.

```sql
-- Supabase SQL Editor
select user_id, count(distinct date(approved_at)) as dias_ativos
from posts
where approved_at >= now() - interval '7 days'
group by user_id
having count(distinct date(approved_at)) >= 4;
```

| Resultado | Leitura | Ação |
|---|---|---|
| **≥5/10** | Tração real | Repetir playbook em mais grupos, subir volume, abrir vagas |
| **3–4/10** | Ativação ok, retenção fraca | Falar com quem parou e corrigir ANTES de escalar |
| **<3/10** | Problema é produto, não distribuição | Corrigir qualidade da geração/fricção; divulgar agora queima audiência |
