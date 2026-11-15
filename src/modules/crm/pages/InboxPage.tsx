import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ChannelTab, InboxFilter } from "../api/inbox";
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

  useCrmRealtime(storeId, conversationId);

  const open = (id: string) => navigate(`/crm/inbox/${id}`);
  const toggleDetails = () => {
    if (window.matchMedia("(min-width: 1280px)").matches) setDetailsOpen((v) => !v);
    else setSheetOpen(true);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Lista: sempre no desktop; no celular só quando nenhuma conversa está aberta */}
      <aside
        className={cn(
          "h-full min-h-0 w-full border-r border-border/50 md:w-[340px] md:shrink-0 lg:w-[360px]",
          conversationId ? "hidden md:block" : "block",
        )}
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

      <section className={cn("h-full min-h-0 min-w-0 flex-1", conversationId ? "block" : "hidden md:block")} aria-label="Conversa">
        {conversationId ? (
          <ConversationView
            key={conversationId}
            conversationId={conversationId}
            userId={userId}
            onBack={() => navigate("/crm/inbox")}
            onToggleDetails={toggleDetails}
            detailsOpen={detailsOpen}
          />
        ) : (
          <EmptyState icon={MessagesSquare} title="Selecione uma conversa" description="Escolha uma conversa na lista para responder, anotar ou atribuir." />
        )}
      </section>

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
