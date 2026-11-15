import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Search, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CONTACTS_PAGE, listContacts, type ContactFilter } from "../api/pipeline";
import { ContactDeals } from "../components/contact/ContactDeals";
import { ContactPanel } from "../components/contact/ContactPanel";
import { ContactAvatar } from "../components/shared/ContactAvatar";
import { EmptyState } from "../components/shared/EmptyState";
import { crmKeys, useCrmContext } from "../hooks/useInbox";
import { useAvatarRefresh } from "../hooks/useAvatarRefresh";
import { ORIGIN_LABEL } from "../lib/constants";
import { brl, relative } from "../lib/format";
import { formatPhone } from "../lib/phone";
import { getContactDetail } from "../api/inbox";

const FILTERS: { v: ContactFilter; l: string }[] = [
  { v: "all", l: "Todos" },
  { v: "customers", l: "Clientes" },
  { v: "leads", l: "Ainda não compraram" },
  { v: "ignored", l: "Não é cliente" },
];

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function ContactList() {
  const { storeId } = useCrmContext();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const search = useDebounced(input);
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search, filter, storeId]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["crm", "contacts", storeId, search, filter, page],
    queryFn: () => listContacts({ storeId, search, filter, page }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  useAvatarRefresh(rows, storeId);
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / CONTACTS_PAGE));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 px-3 py-3 md:px-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Buscar nome, @ ou telefone" aria-label="Buscar contatos" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Filtrar contatos">
          {FILTERS.map((f) => (
            <button key={f.v} role="radio" aria-checked={filter === f.v} onClick={() => setFilter(f.v)}
              className={cn("min-h-[34px] rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {f.l}
            </button>
          ))}
          {data && <span className="ml-auto self-center text-xs text-muted-foreground">{data.count} contato(s)</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 md:px-6">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="mb-2 h-16 w-full rounded-lg" />)}
        {isError && <EmptyState icon={Users} title="Não foi possível carregar" description={(error as Error).message} />}
        {!isLoading && !isError && rows.length === 0 && <EmptyState icon={Users} title="Nenhum contato encontrado" description={search ? "Tente outro nome ou número." : undefined} />}
        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50 bg-card empty:hidden">
          {rows.map((c) => {
            const open = c.deals.filter((d) => d.status === "open");
            const won = c.deals.filter((d) => d.status === "won").reduce((s, d) => s + Number(d.value || 0), 0);
            const lastConv = [...c.conversations].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))[0];
            return (
              <li key={c.id}>
                <button onClick={() => navigate(`/crm/contatos/${c.id}`)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                  <ContactAvatar name={c.name} avatarUrl={c.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.phone ? formatPhone(c.phone) : c.instagram_username ? `@${c.instagram_username}` : "Sem telefone"} · {ORIGIN_LABEL[c.origin_channel]}
                      {c.customer_id ? " · Cliente" : ""}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right text-xs sm:block">
                    {open.length > 0 && <p className="font-medium">{open.length} negócio(s) aberto(s)</p>}
                    {won > 0 && <p className="text-emerald-600 dark:text-emerald-400">{brl(won)} ganhos</p>}
                    {lastConv?.last_message_at && <p className="text-muted-foreground">conversa {relative(lastConv.last_message_at)}</p>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {pages > 1 && (
          <nav className="flex items-center justify-center gap-2 py-3" aria-label="Páginas">
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm tabular-nums">{page + 1} / {pages}</span>
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
          </nav>
        )}
      </div>
    </div>
  );
}

function ContactDetailView({ contactId }: { contactId: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: crmKeys.contact(contactId), queryFn: () => getContactDetail(contactId), staleTime: 30_000 });
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-3 py-3 md:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/crm/contatos")} className="mb-2"><ArrowLeft className="mr-1.5 h-4 w-4" /> Contatos</Button>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-border/50 bg-card">
            <ContactPanel contactId={contactId} showDeals={false} onOpenConversation={(id) => navigate(`/crm/inbox/${id}`)} />
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/50 bg-card p-4">
              {data && <ContactDeals contact={data.contact} />}
            </div>
            {data && data.conversations.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-border/50 bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversas</h3>
                {data.conversations.map((c) => (
                  <Link key={c.id} to={`/crm/inbox/${c.id}`} className="flex min-h-[40px] items-center gap-2 rounded-md border border-border/50 px-2 text-sm hover:bg-muted/50">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{c.channel === "instagram" ? "Instagram" : "WhatsApp"}</span>
                    <span className="text-xs text-muted-foreground">{relative(c.last_message_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const { contactId } = useParams();
  return contactId ? <ContactDetailView contactId={contactId} /> : <ContactList />;
}
