import { Inbox } from "lucide-react";
import { EmptyState } from "../components/shared/EmptyState";

export default function InboxPage() {
  return <EmptyState icon={Inbox} title="Caixa de Entrada" description="As conversas de WhatsApp e Instagram aparecem aqui." />;
}
