# O que só você resolve

> Escrito em 2026-07-31, depois de fechar tudo que dava pra fechar sem
> você. Cada item aqui está aberto por **um motivo específico**: exige
> login, senha, cartão, decisão de produto ou aprovação de terceiro.
> Nenhum está aberto por falta de código.
>
> Ordem pensada pra você "passar o rodo": o item 1 leva semanas de espera
> de terceiro, então começa por ele e os outros correm em paralelo.

---

## 1. App Review do Meta — comece por aqui

**Por que só você:** exige login na sua conta de desenvolvedor, verificação
de identidade da empresa e gravação de tela mostrando o app.

**Por que primeiro:** é o único item com prazo de TERCEIRO. A Meta leva
semanas. Tudo o mais nesta lista é trabalho de horas.

**O que destrava:** publicação automática no Instagram (hoje só funciona em
conta de teste), o item que sobrou da Sprint D, o preenchimento de
`post_metrics` — que hoje tem **1 linha** — e, de quebra, o
`business_discovery` que daria ao Radar a fonte do Instagram.

**Onde está o material:** `docs/meta-app-review.md`, pronto. As três URLs
legais já respondem 200 no domínio de produção.

**Falta:** Business Verification, screencast, ícone e categoria, e colar as
justificativas de cada permissão.

---

## 2. Stripe em live mode

**Por que só você:** exige as chaves `sk_live_` da sua conta e um cartão
real pra testar de ponta a ponta.

**O que destrava:** receita. Hoje ninguém consegue virar pagante, todo
mundo fica no plano free, e por isso os tetos de plano são decorativos.

**Passos:** trocar as chaves na Vercel, recriar os produtos em live,
apontar o webhook pro domínio real (`/api/stripe/webhook`) e gravar o novo
`STRIPE_WEBHOOK_SECRET`. Depois: uma compra de verdade, do começo ao fim.

⚠️ **Não me passe as chaves pelo chat.** Se quiser que eu grave na Vercel,
copie o valor e me diga "copiei" — eu leio da área de transferência e
escrevo direto no destino, sem o valor aparecer aqui. Foi assim que a chave
da NVIDIA foi rotacionada hoje.

---

## 3. Testar a exclusão de conta no browser

**Por que só você:** exige criar uma conta (e-mail + senha), e criar conta
com senha é passo seu, não meu.

**Por que importa:** a ação é irreversível e nunca foi exercida. Hoje eu
encontrei — lendo o código, não testando — que ela deixava a **logo** e o
**avatar de contas antigas** públicos no Storage depois de "excluir conta".
Corrigido, mas corrigido sem nunca ter rodado.

**Como fazer:** cadastre com um e-mail descartável, gere um post e suba uma
foto (pra ter arquivo no Storage), vá em Ajustes → excluir conta → digite
`EXCLUIR`. Depois me chame: eu confiro no painel do Supabase que sumiu dos
dois buckets e que a cascata levou o resto.

**Não use sua conta.** Ela tem 491 posts do mês e o kit configurado.

---

## 4. App do Reddit para o Radar

**Por que só você:** exige criar um app na sua conta Reddit.

**Por que vale:** o Reddit é a fonte com mais sinal pro seu nicho — das 202
notícias que o r/artificial trouxe por RSS, 46 viraram candidatas. Hoje o
Radar só lê Hacker News, porque o endpoint `.json` público do Reddit passou
a devolver 403 e agora exige OAuth.

**Como fazer:** `reddit.com/prefs/apps` → create app → tipo **script** →
grátis, sem review. Guarde `client_id` e `secret`.

**Depois:** me avise. O coletor encaixa atrás da interface que já existe
(`RadarCollector`) sem tocar no job, no score nem na tela. E vale o mesmo
aviso do item 2: não cole as credenciais aqui — copie e diga "copiei".

---

## 5. Decisões de produto (não são trabalho, são escolha)

| Decisão | O que muda |
|---|---|
| **Lançar sem publicação automática?** | Sem o item 1 aprovado, o produto entrega *até o download da arte*. Isso é vendável — mas não é o que a landing promete hoje. Ou você lança assim e liga a publicação quando a Meta liberar, ou segura tudo. |
| **Presets de nicho** (confeitaria, saúde, advocacia) | Prontos e congelados desde 30/07. Ligar ou enterrar. |
| **Cota: descarte devolve cota?** | Hoje sim (mudei em 31/07: post descartado não conta). Ficou possível gerar muito e descartar tudo sem consumir cota. Se o custo apertar, o caminho é limitar geração por dia — não voltar a contar descarte. |
| **Radar sem Instagram serve?** | Hoje ele responde "o que bombou no Hacker News no tema", não "o que o @fulano publicou". Pro seu nicho é quase equivalente. Pro preset de confeitaria seria lista vazia. |

---

## O que eu já fiz e não precisa da sua mão

Pra você não gastar tempo revisando o que está fechado:

- Os 8 itens de código da auditoria de lançamento — todos no ar.
- Os 2 defeitos de arte de 31/07 — e em ambos a causa registrada antes
  estava errada; a correção foi na causa real.
- Contra-capa: sem convite a deslizar, com chip sempre, ancorado no texto.
- Sprint D fechada no aceite (Reel gerado, aprovado, com marca).
- Sprint E inteira: Radar no ar com 134 referências + brief de remix.
- Rotação das chaves da NVIDIA (4 revogadas, 1 ativa) e o BOM que ela
  introduziu em produção.
- Teto de concorrência no `scan-news`, que era a única função sem um.
- Documentação: `PROGRESSO-2.0.md` §0-J a §0-M, `LANCAMENTO.md` revisado
  contra a realidade, `ESTADO-DO-PROJETO.md` §5 atualizado.

**559 testes passam. `tsc` limpo. Produção no ar.**
