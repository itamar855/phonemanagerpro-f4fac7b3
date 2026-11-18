import { BadgeCheck, ShoppingBag, UserRound, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrmTags } from "../../hooks/useCrmTags";
import { leadKinds, tagTone, visibleTags, type KindId } from "../../lib/labels";

const chip = "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none";
const KIND_ICON: Record<KindId, typeof Wrench> = { assistencia: Wrench, venda: ShoppingBag, cliente: BadgeCheck };

/** Responsável pelo lead: primeiro nome (ou "Você"); sem responsável fica apagado. */
export function OwnerChip({ label, className }: { label: string | null; className?: string }) {
  return (
    <span
      className={cn(chip, label ? "bg-muted text-foreground/80" : "border border-dashed border-border text-muted-foreground", className)}
      title={label ? `Responsável: ${label}` : "Sem responsável"}
    >
      <UserRound className="h-3 w-3" aria-hidden="true" />
      {label ?? "Sem responsável"}
    </span>
  );
}

/** Assistência / Venda / Cliente. */
export function KindChips({ contact, className }: { contact: { lead_kind?: string | null; customer_id?: string | null }; className?: string }) {
  const kinds = leadKinds(contact);
  if (!kinds.length) return null;
  return (
    <>
      {kinds.map((k) => {
        const Icon = KIND_ICON[k.id];
        return (
          <span key={k.id} className={cn(chip, k.tone, className)}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {k.label}
          </span>
        );
      })}
    </>
  );
}

/** Etiquetas do contato com a cor da lista da loja; as que não couberem viram "+N". */
export function TagChips({ storeId, tags, max = 2, className }: { storeId: string; tags: string[]; max?: number; className?: string }) {
  const { colorOf } = useCrmTags();
  if (!tags?.length) return null;
  const { shown, more } = visibleTags(tags, max);
  return (
    <>
      {shown.map((t) => (
        <span key={t} className={cn(chip, tagTone(colorOf(storeId, t)), className)}>{t}</span>
      ))}
      {more > 0 && (
        <span className={cn(chip, "bg-muted text-muted-foreground", className)} title={tags.slice(max).join(", ")}>+{more}</span>
      )}
    </>
  );
}
