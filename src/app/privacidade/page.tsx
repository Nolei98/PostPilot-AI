// ============================================================
// /privacidade — Política de Privacidade pública.
//
// Exigida pelo App Review do Meta (URL obrigatória na submissão) e pela
// LGPD. O texto descreve o que o sistema REALMENTE faz hoje; se o
// pipeline mudar (provider novo, dado novo coletado), atualize aqui.
// ============================================================
import type { Metadata } from "next";
import { LegalPage, LegalSection, CONTATO_EMAIL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de Privacidade — PostPilot",
  description:
    "Como o PostPilot coleta, usa, compartilha e apaga os dados de quem usa o serviço.",
};

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="27 de julho de 2026">
      <LegalSection title="Quem somos">
        <p>
          O PostPilot é um serviço que gera posts para redes sociais a partir de
          notícias do seu nicho e, se você autorizar, publica esses posts na sua
          conta do Instagram. Esta política explica quais dados o serviço trata,
          por quê, com quem compartilha e como você apaga tudo.
        </p>
        <p>
          Responsável pelo tratamento dos dados e canal de contato:{" "}
          <a href={`mailto:${CONTATO_EMAIL}`} className="text-content underline">
            {CONTATO_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Dados que coletamos">
        <p>
          <strong className="text-content">Cadastro.</strong> E-mail e senha (a
          senha é guardada apenas como hash pelo nosso provedor de autenticação,
          nunca em texto puro).
        </p>
        <p>
          <strong className="text-content">Conteúdo que você cria.</strong>{" "}
          Marca, cores, logotipo, nicho, fontes de notícia (RSS) e os posts
          gerados — textos, imagens, vídeos enviados por você e legendas.
        </p>
        <p>
          <strong className="text-content">Conexão com o Instagram.</strong> Se
          você conectar sua conta Instagram Business/Creator, guardamos o
          identificador da conta, o nome de usuário público e um token de acesso
          fornecido pela Meta. <strong className="text-content">O token é
          cifrado em repouso</strong> (AES-256-GCM) e usado só no servidor,
          nunca exposto ao navegador.
        </p>
        <p>
          <strong className="text-content">Métricas de publicação.</strong> Para
          posts publicados por nós, coletamos da API da Meta, 24h e 72h depois,
          números agregados do próprio post: alcance, salvamentos,
          compartilhamentos, curtidas e comentários. Não coletamos dados de
          seguidores individuais, mensagens diretas nem lista de contatos.
        </p>
        <p>
          <strong className="text-content">Pagamento.</strong> Assinaturas são
          processadas pelo Stripe. Não recebemos nem armazenamos número de
          cartão — guardamos apenas o identificador da assinatura e seu status.
        </p>
      </LegalSection>

      <LegalSection title="Para que usamos">
        <p>
          Para operar o serviço: gerar posts com a sua identidade visual,
          mostrar sua fila de aprovação, publicar no horário agendado quando
          você pedir, exibir as métricas dos posts publicados e cobrar a
          assinatura. Não vendemos seus dados e não usamos o seu conteúdo para
          treinar modelos de inteligência artificial próprios.
        </p>
      </LegalSection>

      <LegalSection title="Com quem compartilhamos">
        <p>
          Só com prestadores necessários para o serviço funcionar, cada um com o
          mínimo de dados de que precisa:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-content">Supabase</strong> — banco de dados
            e autenticação (armazena seu cadastro e seu conteúdo).
          </li>
          <li>
            <strong className="text-content">Vercel</strong> — hospedagem da
            aplicação.
          </li>
          <li>
            <strong className="text-content">Inngest</strong> — execução das
            tarefas em segundo plano (geração, publicação, coleta de métricas).
          </li>
          <li>
            <strong className="text-content">Meta (Instagram)</strong> — quando
            você conecta sua conta, para publicar e ler as métricas dos posts.
          </li>
          <li>
            <strong className="text-content">Provedores de IA</strong> (Google
            Gemini, Anthropic Claude ou Pollinations, conforme a configuração da
            sua conta) — recebem o texto da notícia e as instruções da sua marca
            para gerar a legenda e a arte.
          </li>
          <li>
            <strong className="text-content">Stripe</strong> — cobrança.
          </li>
          <li>
            <strong className="text-content">Telegram</strong> — apenas se você
            configurar as notificações por lá.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Por quanto tempo guardamos">
        <p>
          Seus dados ficam enquanto a conta existir. Ao desconectar o Instagram,
          o token de acesso é apagado imediatamente. Ao pedir a exclusão da
          conta, apagamos cadastro, marca, posts, mídias e métricas em até 30
          dias — exceto registros que a lei obrigue a manter, como comprovantes
          fiscais de pagamento.
        </p>
      </LegalSection>

      <LegalSection title="Seus direitos">
        <p>
          Pela LGPD, você pode pedir acesso, correção, portabilidade ou exclusão
          dos seus dados, e revogar consentimentos. Boa parte disso está na
          própria aplicação (editar a marca, apagar posts, desconectar o
          Instagram). Para o resto, escreva para{" "}
          <a href={`mailto:${CONTATO_EMAIL}`} className="text-content underline">
            {CONTATO_EMAIL}
          </a>{" "}
          — respondemos em até 15 dias.
        </p>
        <p>
          Instruções específicas de exclusão estão na página{" "}
          <a href="/exclusao-de-dados" className="text-content underline">
            Exclusão de dados
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Segurança">
        <p>
          Todo o tráfego é por HTTPS. O acesso ao banco é isolado por usuário
          (row-level security), de modo que uma conta não enxerga os dados de
          outra. Tokens de rede social são cifrados em repouso. Nenhum sistema é
          imune a incidentes: se ocorrer um vazamento que traga risco a você,
          avisaremos pelo e-mail cadastrado.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças nesta política">
        <p>
          Se o texto mudar de forma relevante, a data no topo muda e avisamos
          pelo e-mail cadastrado antes de a mudança valer.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
