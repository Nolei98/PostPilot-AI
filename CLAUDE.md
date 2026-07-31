# Regras do projeto — PostPilot AI

## Execute você, não devolva tarefa

O usuário não quer executar passos manuais. Se dá pra fazer com as
ferramentas disponíveis, **faça** — não descreva o que ele deveria fazer.

Vale para: rodar comandos, subir e derrubar servidores, abrir arquivos e
pastas (`explorer.exe <pasta>`, `Start-Process <arquivo>`), extrair frames
pra conferir resultado visual, commitar quando o trabalho está verificado,
limpar temporários. Terminou algo que produz artefato pra olhar (vídeo,
imagem, relatório)? **Abra o artefato**, não mande o caminho.

Só devolve pro usuário o que é genuinamente impossível daqui:

- SQL no painel do Supabase (não há credencial de banco no ambiente) —
  entregue o SQL pronto pra colar, com uma conferência que devolva linha;
- login interativo, senha, 2FA, aprovação em painel de terceiro;
- decisão de produto, de custo, ou que mexe em dado de outra pessoa;
- `git push` e qualquer coisa que publique — pedir antes.

Antes de agir sozinho em algo destrutivo ou irreversível (apagar dado,
sobrescrever arquivo de produção, mexer em conta que não é do usuário),
confirme. O resto: faça e relate o resultado.

## Documentação sempre em dia

A documentação deste projeto é o ativo que sobrevive à sessão. Código sem o
*porquê* registrado custa refazer o mesmo erro meses depois. Duas regras:

### Regra 1 — ao encerrar, atualizar antes de sair

Quando o usuário sinalizar fim de sessão — **"encerrar"**, "fechar", "por hoje
é só", "pode parar", "terminamos", "vou dormir", "salva tudo" — **atualize a
documentação ANTES de dar a resposta final.** Não perguntar se pode; é parte
de encerrar. A resposta final diz, em uma linha, o que foi atualizado.

Se nada mudou na sessão (só leitura, só perguntas), não invente registro —
responda que não houve mudança a documentar.

### Regra 2 — se for complexo, atualizar assim que terminar

Não esperar o fim da sessão. Atualizar **no momento em que o trabalho fechar**.

Conta como complexo se bater em qualquer um destes:
- migration nova, ou mudança de schema/contrato de dados;
- job do Inngest novo ou com disparo alterado;
- item de `docs/auditoria-lancamento.md` mudando de estado;
- decisão de produto ou de provider (custo, standby, adiamento);
- mudança que toca **mais de 3 arquivos**;
- qualquer coisa cujo *porquê* não seja óbvio lendo o diff.

Trabalho pequeno e óbvio (typo, ajuste de cópia, rename mecânico) não precisa
de registro próprio — entra no resumo do encerramento.

### Onde escrever o quê

| Arquivo | Atualizar quando | O que escrever |
|---|---|---|
| `PROGRESSO-2.0.md` | houve mudança de código ou decisão | seção nova de sessão no TOPO (padrão `## 0-X. Sessão AAAA-MM-DD — título`), com o **porquê**, não só o quê. É o diário técnico. |
| `ESTADO-DO-PROJETO.md` | o estado de pronto/pendente mudou | §4 (pronto), §5 (falta), data e commit de referência do cabeçalho |
| `docs/auditoria-lancamento.md` | item da auditoria foi corrigido ou surgiu risco novo | marcar ✅ + linha de como foi corrigido e em qual commit |
| `README.md` | setup, env var, script ou comando mudou | só isso — README não guarda estado do projeto |
| `.env.example` | apareceu `process.env.NOVA_VAR` no código | a variável + comentário de onde pegar e o que quebra sem ela |
| `docs/layouts-spec.md` | geometria ou regra de layout mudou | a regra, e rodar `npx tsx scripts/build-layouts-html.ts` |
| `LANCAMENTO.md` | canal, texto ou funil de divulgação mudou | não mexer no checklist §1 (vive em `ESTADO-DO-PROJETO.md` §7) |

Datas em formato absoluto (`2026-07-30`), nunca "ontem" ou "semana passada".

### Como escrever

Registrar **decisão e motivo**, não narrativa. O leitor futuro quer saber por
que a opção óbvia foi descartada.

- ❌ "Corrigido bug no vídeo."
- ✅ "Vídeo era composto duas vezes: o job de render disparava de novo ao voltar
  pra fila. Guard por `render_status`. Não deu pra usar `updated_at` porque a
  aprovação em lote mexe em todos na mesma transação."

Não apagar histórico do `PROGRESSO-2.0.md`. Seção nova vai no topo; as antigas
ficam como estão, mesmo quando a decisão foi revertida — a reversão vira
registro novo apontando pro anterior.
