// Termos de serviço públicos (informados no app da Meta). Revise com quem cuida da parte jurídica.
import { Link } from "react-router-dom";

const UPDATED = "15 de novembro de 2026";
const COMPANY = "Restaura Phone Brasil";

export default function Termos() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed md:py-16">
        <header className="space-y-2">
          <h1 className="font-display text-2xl font-bold md:text-3xl">Termos de Serviço</h1>
          <p className="text-muted-foreground">{COMPANY} · atendimento pelo WhatsApp e Instagram · atualizados em {UPDATED}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. O serviço</h2>
          <p>
            A {COMPANY} atende clientes pelo WhatsApp e pelo Instagram Direct para tirar dúvidas, enviar orçamentos, vender
            aparelhos e acessórios e acompanhar serviços de assistência técnica. As mensagens podem ser respondidas por nossa
            equipe ou, inicialmente, por um assistente automático, sempre com possibilidade de falar com uma pessoa.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Informações e orçamentos</h2>
          <p>
            Preços, prazos e disponibilidade informados na conversa são confirmados por um atendente e podem mudar até a
            efetivação da compra ou a aprovação do orçamento. Condições de garantia seguem o documento entregue na venda ou na
            ordem de serviço e o Código de Defesa do Consumidor.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Uso adequado</h2>
          <p>
            Pedimos que as conversas sejam respeitosas. Podemos deixar de responder mensagens ofensivas, spam ou que não tenham
            relação com nossos produtos e serviços.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Privacidade</h2>
          <p>
            O tratamento dos seus dados segue a nossa <Link to="/privacidade" className="text-primary underline underline-offset-2">Política de Privacidade</Link>,
            incluindo como pedir a exclusão dos seus dados.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Contato</h2>
          <p>Dúvidas sobre estes termos podem ser enviadas pelos mesmos canais de atendimento da loja.</p>
        </section>
      </article>
    </main>
  );
}
