// Política de privacidade pública (exigida pela Meta para o app do Instagram).
// Revise o texto com quem cuida da parte jurídica da empresa.
const UPDATED = "15 de novembro de 2026";
const COMPANY = "Restaura Phone Brasil";

export default function Privacidade() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed md:py-16">
        <header className="space-y-2">
          <h1 className="font-display text-2xl font-bold md:text-3xl">Política de Privacidade</h1>
          <p className="text-muted-foreground">
            {COMPANY} · sistema de atendimento CellManagerPro · atualizada em {UPDATED}
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Quem somos</h2>
          <p>
            A {COMPANY} é uma loja de celulares, acessórios e assistência técnica. Usamos o sistema CellManagerPro para atender
            clientes que nos procuram pelo WhatsApp e pelo Instagram Direct.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Quais dados tratamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Nome e nome de usuário do perfil (Instagram) ou nome e número (WhatsApp) de quem nos envia mensagem;</li>
            <li>O conteúdo das mensagens, fotos, áudios e arquivos enviados na conversa;</li>
            <li>Dados que o próprio cliente informa durante o atendimento (ex.: modelo do aparelho, defeito, telefone para contato);</li>
            <li>Histórico de compras e ordens de serviço, quando a pessoa já é cliente da loja.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Para que usamos</h2>
          <p>
            Exclusivamente para responder às mensagens, fazer orçamentos, acompanhar vendas e serviços e dar suporte pós-venda.
            Não vendemos, alugamos nem compartilhamos esses dados com terceiros para publicidade.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Com quem compartilhamos</h2>
          <p>
            Apenas com os provedores necessários para o funcionamento do atendimento: a Meta (Instagram e WhatsApp), o provedor de
            hospedagem e banco de dados do sistema e, quando ativado, o provedor de inteligência artificial que ajuda a responder
            as primeiras mensagens. Todos tratam os dados somente para prestar esse serviço.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Por quanto tempo guardamos</h2>
          <p>
            Enquanto houver relacionamento com o cliente ou obrigação legal (por exemplo, garantia e documentos fiscais). Depois
            disso, os dados são excluídos ou anonimizados.
          </p>
        </section>

        <section className="space-y-2" id="exclusao">
          <h2 className="text-lg font-semibold">6. Como pedir a exclusão dos seus dados</h2>
          <p>
            Envie uma mensagem para a {COMPANY} pelo Instagram Direct ou pelo WhatsApp da loja com o texto
            <strong> "Quero excluir meus dados"</strong>. Confirmaremos sua identidade pela própria conversa e excluiremos as
            conversas e o cadastro de contato em até 30 dias, mantendo apenas o que a lei obriga a guardar (como notas fiscais).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Seus direitos (LGPD)</h2>
          <p>
            Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, exclusão, informação
            sobre compartilhamento e revogação do consentimento, pelos mesmos canais acima.
          </p>
        </section>
      </article>
    </main>
  );
}
