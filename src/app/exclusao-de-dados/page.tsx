// ============================================================
// /exclusao-de-dados — instruções de exclusão de dados do usuário.
//
// O Meta exige, na configuração do app, uma URL de "Data Deletion
// Instructions" (ou um callback). Esta página é essa URL. Precisa
// abrir SEM login — ver allowlist em src/middleware.ts.
// ============================================================
import type { Metadata } from "next";
import { LegalPage, LegalSection, CONTATO_EMAIL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Exclusão de dados — PostPilot",
  description:
    "Como desconectar o Instagram, apagar conteúdo ou excluir sua conta do PostPilot.",
};

export default function ExclusaoDeDadosPage() {
  return (
    <LegalPage title="Exclusão de dados" updatedAt="27 de julho de 2026">
      <LegalSection title="Desconectar o Instagram (imediato)">
        <p>
          Entre no PostPilot, abra <strong className="text-content">Ajustes</strong>{" "}
          e clique em <strong className="text-content">Desconectar Instagram</strong>.
          O token de acesso da sua conta é apagado do nosso banco na hora, e
          nenhum post agendado será publicado depois disso.
        </p>
        <p>
          Você também pode revogar o acesso pelo próprio Instagram, em{" "}
          <em>Configurações → Aplicativos e sites</em>, removendo o PostPilot da
          lista. Nesse caso o token deixa de funcionar imediatamente do lado da
          Meta, e você pode nos pedir a remoção do registro pelo e-mail abaixo.
        </p>
      </LegalSection>

      <LegalSection title="Apagar posts específicos">
        <p>
          Na fila de aprovação, cada post pode ser descartado individualmente. O
          descarte remove o post e as artes geradas para ele.
        </p>
      </LegalSection>

      <LegalSection title="Excluir a conta inteira">
        <p>
          Envie um e-mail para{" "}
          <a href={`mailto:${CONTATO_EMAIL}`} className="text-content underline">
            {CONTATO_EMAIL}
          </a>{" "}
          com o assunto <strong className="text-content">&quot;Excluir minha
          conta&quot;</strong>, a partir do endereço cadastrado. Confirmamos o
          pedido e apagamos, em até 30 dias:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>cadastro e dados de acesso;</li>
          <li>marca, cores, logotipo e fontes de notícia;</li>
          <li>posts, cards de carrossel, imagens e vídeos enviados;</li>
          <li>conexões com redes sociais e tokens;</li>
          <li>métricas coletadas dos posts publicados.</li>
        </ul>
        <p>
          Mantemos apenas o que a lei exigir — por exemplo, registros fiscais de
          pagamentos já realizados. Assinaturas ativas são canceladas junto.
        </p>
      </LegalSection>

      <LegalSection title="Prazo e confirmação">
        <p>
          Confirmamos o recebimento em até 15 dias e a conclusão da exclusão em
          até 30 dias, por e-mail. Se você não receber resposta, escreva de novo
          — pode ter caído em spam.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
