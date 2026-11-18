import { Store } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { setCrmStoreFilter, useCrmStoreFilter, useCrmStores } from "../../hooks/useCrmStores";
import { ALL } from "../../lib/stores";

/** Etiqueta da loja. Só aparece quando a visão mistura lojas (filtro "Todas" e mais de uma loja). */
export function StoreTag({ storeId, className }: { storeId: string; className?: string }) {
  const { byId, multi } = useCrmStores();
  const filter = useCrmStoreFilter([...byId.values()]);
  const store = byId.get(storeId);
  if (!multi || filter !== ALL || !store) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none", store.tone, className)}>
      {store.label}
    </span>
  );
}

/** Seletor de loja do CRM: Todas · cada loja. Some quando só existe uma loja. */
export function StoreFilter() {
  const { stores, multi } = useCrmStores();
  const value = useCrmStoreFilter(stores);
  if (!multi) return null;
  return (
    <Select value={value} onValueChange={setCrmStoreFilter}>
      <SelectTrigger className="h-9 w-auto min-w-[150px] gap-2 text-sm" aria-label="Loja">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todas as lojas</SelectItem>
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
