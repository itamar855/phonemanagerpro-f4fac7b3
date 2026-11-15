import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ChannelTab, InboxFilter } from "../api/inbox";
import { MobileFullscreen } from "../components/shared/MobileFullscreen";
import { useIsMobile } from "../hooks/useViewport";
import { ContactPanel } from "../components/contact/ContactPanel";
import { ConversationList } from "../components/inbox/ConversationList";
import { ConversationView } from "../components/inbox/ConversationView";
import { EmptyState } from "../components/shared/EmptyState";
import { useConversation, useCrmContext, useCrmRealtime } from "../hooks/useInbox";

export default function InboxPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { storeId, userId } = useCrmContext();
  const [channel, setChannel] = useState<ChannelTab>("all");
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: conv } = useConversation(conversationId);
  const isMobile = useIsMobile();

  useCrmRealtime(storeId, conversationId);

  const open = (id: string) => navigate(`/crm/inbox/${id}`);
  const toggleDetails = () => {
    if (window.matchMedia("(min-width: 1280px)").matches) setDetailsOpen((v) => !v);
    else setSheetOpen(true);
  };

  const view = conversationId ? (
    <ConversationView
      key={conversationId}
      conversationId={conversationId}
      userId={userId}
      onBack={() => navigate("/crm/inbox")}
      onToggleDetails={toggleDetails}
      detailsOpen={detailsOpen}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Lista: no celular continua montada por baixo da conversa (volta na mesma posição) */}
      <aside
        className="block h-full min-h-0 w-full border-r border-border/50 md:w-[340px] md:shrink-0 lg:w-[360px]"
        aria-label="Lista de conversas"
      >
        <ConversationList
          storeId={storeId}
          userId={userId}
          selectedId={conversationId}
          onSelect={open}
          channel={channel}
          onChannelChange={setChannel}
          filter={filter}
          onFilterChange={setFilter}
        />
      </aside>

      <section className="hidden h-full min-h-0 min-w-0 flex-1 md:block" aria-label="Conversa">
        {!isMobile && (view ?? (
          <EmptyState icon={MessagesSquare} title="Selecione uma conversa" description="Escolha uma conversa na lista para responder, anotar ou atribuir." />
        ))}
      </section>

      {/* Celular: conversa em tela cheia, como no WhatsApp */}
      {isMobile && view && <MobileFullscreen label="Conversa">{view}</MobileFullscreen>}

      {/* Painel do contato: coluna fixa em telas largas, gaveta nas demais */}
      {conv && detailsOpen && (
        <aside className="hidden h-full min-h-0 w-[320px] shrink-0 overflow-y-auto border-l border-border/50 xl:block" aria-label="Detalhes do contato">
          <ContactPanel contactId={conv.contact_id} onOpenConversation={open} />
        </aside>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-border/50 px-4 py-3">
            <SheetTitle>Contato</SheetTitle>
          </SheetHeader>
          {conv && <ContactPanel contactId={conv.contact_id} onOpenConversation={(id) => { setSheetOpen(false); open(id); }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
