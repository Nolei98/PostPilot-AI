// ============================================================
// /termos — Termos de Uso públicos.
//
// Exigidos pelo App Review do Meta para app comercial e pela própria
// cobrança via Stripe. Texto descreve o serviço como ele funciona hoje.
// ============================================================
import type { Metadata } from "next";
import { LegalPage, LegalSection, CONTATO_EMAIL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Termos de Uso — PostPilot",
  description:
    "Regras de uso do PostPilot: o que o serviço faz, o que você garante e como cancelar.",
};

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="27 de julho de 2026">
      <LegalSection title="O que o serviço faz">
        <p>
          O PostPilot acompanha fontes de notícia que você escolhe, gera posts
          (texto e arte) com a identidade visual da sua marca e os coloca numa
          fila para a sua aprovação. Se você conectar uma conta Instagram
          Business/Creator, o serviço também publica os posts aprovados no
          horário que você agendar e traz as métricas depois.
        </p>
        <p>
          Nada é publicado sem a sua ação: você aprova o conteúdo e escolhe o
          horário. Você continua responsável pelo que sai no seu perfil.
        </p>
      </LegalSection>

      <LegalSection title="Conta">
        <p>
          Você precisa ter 18 anos ou mais e fornecer informações verdadeiras. É
          sua a responsabilidade de guardar as credenciais de acesso. Avise-nos
          se suspeitar de uso indevido da sua conta.
        </p>
      </LegalSection>

      <LegalSection title="Conteúdo gerado por inteligência artificial">
        <p>
          Textos e imagens são produzidos por modelos de IA de terceiros a
          partir de notícias públicas. Isso significa que o resultado{" "}
          <strong className="text-content">pode conter erros, imprecisões ou
          afirmações desatualizadas</strong>. Revise antes de aprovar — a etapa
          de aprovação existe exatamente para isso. Não nos responsabilizamos
          por conteúdo publicado após a sua aprovação.
        </p>
        <p>
          Você declara que tem direito de usar as imagens, vídeos e marcas que
          enviar ao serviço.
        </p>
      </LegalSection>

      <LegalSection title="Uso aceitável">
        <p>Você concorda em não usar o PostPilot para:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>publicar conteúdo ilegal, difamatório, discriminatório ou enganoso;</li>
          <li>violar direitos autorais ou marcas de terceiros;</li>
          <li>
            burlar as regras das plataformas conectadas — inclusive as Políticas
            da Plataforma e os Termos da Meta, que continuam valendo para a sua
            conta do Instagram;
          </li>
          <li>automatizar spam ou engajamento artificial.</li>
        </ul>
        <p>
          Podemos suspender contas que violem estas regras, com aviso sempre que
          possível.
        </p>
      </LegalSection>

      <LegalSection title="Planos, cobrança e cancelamento">
        <p>
          Há um plano gratuito com limite mensal de posts e planos pagos com
          limites maiores. A cobrança é recorrente, processada pelo Stripe, e
          renova automaticamente até você cancelar. O cancelamento vale para o
          próximo ciclo — o período já pago continua disponível até o fim.
        </p>
        <p>
          Você pode cancelar a qualquer momento pelo portal de assinatura dentro
          da aplicação.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidade e limites de responsabilidade">
        <p>
          O serviço é oferecido &quot;como está&quot;. Dependemos de terceiros
          (provedores de IA, Meta, hospedagem) e não garantimos disponibilidade
          ininterrupta nem que uma publicação agendada sempre será aceita pela
          rede social. Na medida permitida pela lei, nossa responsabilidade fica
          limitada ao valor pago por você nos últimos 12 meses.
        </p>
      </LegalSection>

      <LegalSection title="Encerramento">
        <p>
          Você pode encerrar a conta quando quiser — veja a página{" "}
          <a href="/exclusao-de-dados" className="text-content underline">
            Exclusão de dados
          </a>
          . Encerrada a conta, o acesso cessa e os dados são apagados conforme a{" "}
          <a href="/privacidade" className="text-content underline">
            Política de Privacidade
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Lei aplicável e contato">
        <p>
          Estes termos são regidos pela lei brasileira. Dúvidas ou pedidos:{" "}
          <a href={`mailto:${CONTATO_EMAIL}`} className="text-content underline">
            {CONTATO_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
