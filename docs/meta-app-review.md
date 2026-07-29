# App Review do Meta — dossiê de submissão

> Tudo que a submissão pede, escrito e conferido em 2026-07-29. O que
> depende de código já está no ar; o que sobra é preencher e gravar.
>
> **Por que isso trava a venda:** sem App Review, só contas cadastradas
> como "Testador do Instagram" no painel conseguem conectar. Ou seja:
> nenhum cliente pagante consegue usar o produto.

## 0. Dados do app

| Campo | Valor |
|---|---|
| Domínio de produção | `https://post-pilot-ai-seven.vercel.app` |
| Redirect URI do OAuth | `https://post-pilot-ai-seven.vercel.app/api/instagram/callback` |
| Política de Privacidade | `https://post-pilot-ai-seven.vercel.app/privacidade` |
| Termos de Uso | `https://post-pilot-ai-seven.vercel.app/termos` |
| Exclusão de dados | `https://post-pilot-ai-seven.vercel.app/exclusao-de-dados` |
| Permissões pedidas | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights` |

As três permissões estão em `src/app/api/instagram/connect/route.ts` — se
alguém acrescentar escopo lá, este documento e a submissão ficam
desatualizados no mesmo instante.

## 1. Descrição do app (campo do painel)

> PostPilot é uma ferramenta de criação de conteúdo para pequenas marcas e
> agências. O usuário cadastra as fontes de notícia do seu nicho (RSS) e a
> identidade visual da marca (cores, fonte, logotipo). O sistema acompanha
> essas fontes, seleciona os assuntos com maior potencial de engajamento e
> monta posts prontos — imagem, carrossel ou vídeo — já dentro da
> identidade da marca. Todo post fica numa fila de aprovação: nada é
> publicado sem o usuário aprovar. Depois de aprovado, o usuário pode
> baixar a arte ou publicar diretamente na conta Instagram Business que
> ele mesmo conectou, e acompanhar as métricas daquele post.

**Categoria sugerida:** Business / Productivity (ou "Publishing"), conforme
a lista do painel. Evite "Social" — o app não é uma rede social.

## 2. Justificativa por permissão

O revisor lê isso literalmente. Cada texto abaixo diz **o que o app faz**,
**onde o usuário vê acontecer** e **por que a permissão é indispensável**.

### 2.1 `instagram_business_basic`

> O usuário conecta a própria conta Instagram Business ou Creator pelo
> botão "Conectar Instagram", em Ajustes. Usamos esta permissão para
> identificar a conta conectada — id da conta e nome de usuário público —
> e exibir na interface qual conta está vinculada, para que ele saiba em
> qual perfil o conteúdo será publicado. Sem ela não há como confirmar a
> identidade da conta e o usuário publicaria às cegas. Também é a
> permissão base exigida para as outras duas.

### 2.2 `instagram_business_content_publish`

> O app monta posts (imagem única, carrossel ou vídeo) a partir das
> fontes e da identidade visual configuradas pelo usuário. Cada post
> passa por uma fila de aprovação manual: nada é publicado
> automaticamente. Quando o usuário aprova e escolhe publicar ou agendar,
> usamos esta permissão para criar o container de mídia e publicá-lo na
> conta que ele conectou. É o núcleo do produto — sem ela, o usuário
> precisaria baixar cada arte e postar à mão, que é exatamente o trabalho
> que a ferramenta existe para eliminar.

### 2.3 `instagram_business_manage_insights`

> Depois que um post é publicado por nós, coletamos as métricas
> agregadas daquele post — alcance, curtidas, comentários, salvamentos e
> compartilhamentos — 24h e 72h após a publicação, e mostramos ao usuário
> o desempenho do conteúdo dentro do próprio app. Só lemos métricas de
> posts publicados pelo próprio app, na conta do próprio usuário. Não
> acessamos dados de seguidores individuais, mensagens diretas nem lista
> de contatos. Sem isso o usuário não tem como saber que tipo de conteúdo
> funciona para a marca dele.

## 3. Roteiro do screencast

Um vídeo só, contínuo, mostrando as três permissões em uso — do login
até a publicação. Grave com uma conta de teste real. Não corte no meio de
uma ação: o revisor precisa ver causa e efeito na mesma tomada.

1. **Login** — abra `https://post-pilot-ai-seven.vercel.app`, faça login.
   Mostre a tela inicial já autenticado.
2. **Conectar a conta** (`instagram_business_basic`) — vá em Ajustes,
   clique em "Conectar Instagram", passe pelo diálogo de autorização da
   Meta **mostrando a tela de permissões**, e volte ao app. Mostre o nome
   de usuário conectado aparecendo na interface. Este é o trecho que mais
   reprova quando falta: o revisor quer ver o consentimento acontecendo.
3. **Mostrar a fila** — abra a Fila de aprovação. Deixe claro que os
   posts ficam parados esperando decisão humana. Abra um post, mostre a
   prévia e os ajustes (fundo, formato, rótulo).
4. **Aprovar e publicar** (`instagram_business_content_publish`) —
   aprove um post e publique. Espere a confirmação dentro do app e
   **abra o Instagram mostrando o post publicado na conta de teste**.
5. **Métricas** (`instagram_business_manage_insights`) — mostre a tela
   com o desempenho de um post já publicado (alcance, curtidas,
   comentários, salvamentos). Se as métricas de 24h ainda não existirem
   para o post recém-publicado, use um post publicado antes.
6. **Exclusão de dados** — mostre `/exclusao-de-dados` e o caminho de
   desconectar o Instagram em Ajustes. Não é obrigatório no screencast,
   mas responde antes a pergunta que o revisor costuma devolver.

Dicas que evitam reprovação: grave em português **com legendas em
inglês** ou narre em inglês; mostre a barra de endereço (o revisor
confere que é o mesmo domínio da submissão); nada de corte entre
autorizar e o resultado.

## 4. Verificação de negócio (Business Verification)

É o passo mais lento — comece por ele, roda em paralelo com o resto.
Costuma exigir CNPJ, comprovante de endereço da empresa e um meio de
contato verificável (telefone ou e-mail no domínio). Se a operação for
como pessoa física, verifique no painel qual caminho a Meta oferece hoje
para a sua região antes de montar a papelada.

## 5. Checklist antes de apertar "Submit"

- [ ] Abrir `/privacidade`, `/termos` e `/exclusao-de-dados` **no domínio
      de produção** e confirmar que carregam (o revisor navega o site;
      link quebrado reprova sozinho).
- [ ] Conferir que `NEXT_PUBLIC_APP_URL` em Production bate exatamente
      com `https://post-pilot-ai-seven.vercel.app` — divergência gera
      "Invalid redirect_uri" no meio da revisão (já aconteceu, ver §4.3
      do PROGRESSO).
- [ ] Remover do painel da Meta as redirect URIs de teste
      (localhost/túnel morto) — sobra de desenvolvimento no app de
      produção chama atenção do revisor.
- [ ] Ícone, categoria e descrição preenchidos (§1).
- [ ] Conta de teste funcionando, com pelo menos um post já publicado
      pelo app (pro trecho de métricas do screencast).
- [ ] As três justificativas coladas nos campos certos (§2).
- [ ] Screencast subido, mostrando as três permissões (§3).

## 6. O que já está pronto no código

Nada aqui é trabalho pendente — é o que o revisor vai encontrar:

- `/privacidade` — `src/app/privacidade/page.tsx`. Descreve dados
  coletados, uso do token (cifrado em repouso, AES-256-GCM, só no
  servidor), métricas agregadas coletadas 24h/72h, e o que **não** é
  coletado (seguidores, DMs, contatos).
- `/termos` — `src/app/termos/page.tsx`.
- `/exclusao-de-dados` — `src/app/exclusao-de-dados/page.tsx`. É a URL de
  instruções, a mais simples das duas opções que a Meta aceita (a outra é
  callback de deleção).
- Rodapé da landing (`public/index.html`) aponta para as três.
- Desconectar o Instagram: Ajustes → marca a conexão como
  `disconnected` sem apagar o histórico.
