import { Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceFormRow } from "./osPdfRules";
import { formatCurrency } from "./osPdf";

interface Props {
  services: ServiceFormRow[];
  discount: string;
  partsTotal: number;
  finalPrice: string;
  onChange: (next: { services: ServiceFormRow[]; discount_amount: string }) => void;
}

/**
 * Serviços executados no aparelho (o técnico descreve cada um, valor opcional) e o desconto.
 * Tudo aparece para o cliente no PDF da OS.
 */
export function ServicesPerformedEditor({ services, discount, partsTotal, finalPrice, onChange }: Props) {
  const rows = services.length ? services : [{ description: "", price: "" }];
  const set = (i: number, patch: Partial<ServiceFormRow>) =>
    onChange({ services: rows.map((r, k) => (k === i ? { ...r, ...patch } : r)), discount_amount: discount });
  const add = () => onChange({ services: [...rows, { description: "", price: "" }], discount_amount: discount });
  const remove = (i: number) => onChange({ services: rows.filter((_, k) => k !== i), discount_amount: discount });

  const priced = rows.filter((r) => r.price !== "" && !Number.isNaN(Number(r.price)));
  const servicesSum = priced.reduce((a, r) => a + Number(r.price), 0);
  const disc = Number(discount) || 0;

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Serviços executados
        <span className="text-[10px] font-normal text-muted-foreground">(aparecem para o cliente no PDF)</span>
      </Label>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2">
            <Textarea
              aria-label={`Serviço ${i + 1}`}
              value={r.description}
              onChange={(e) => set(i, { description: e.target.value })}
              placeholder={i === 0 ? "Ex.: Substituição do módulo frontal" : "Outro serviço feito no aparelho"}
              className="min-h-[40px] flex-1 text-sm"
              rows={1}
            />
            <Input
              aria-label={`Valor do serviço ${i + 1} (opcional)`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={r.price}
              onChange={(e) => set(i, { price: e.target.value })}
              placeholder="R$ (opc.)"
              className="h-10 w-28 shrink-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
              disabled={rows.length === 1 && !r.description && !r.price}
              aria-label={`Remover serviço ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Adicionar serviço
      </Button>

      <div className="flex flex-wrap items-end gap-3 pt-1">
        <div className="space-y-1.5">
          <Label htmlFor="os-discount" className="text-xs">Desconto (R$)</Label>
          <Input
            id="os-discount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={discount}
            onChange={(e) => onChange({ services: rows, discount_amount: e.target.value })}
            placeholder="0,00"
            className="h-9 w-32"
          />
        </div>
        {(priced.length > 0 || disc > 0) && (
          <p className="pb-2 text-[11px] text-muted-foreground">
            {priced.length > 0 ? (
              <>
                {partsTotal > 0 && <>Peças {formatCurrency(partsTotal)} + </>}
                Serviços {formatCurrency(servicesSum)}
                {disc > 0 && <> − Desconto {formatCurrency(disc)}</>}
                {" = "}
              </>
            ) : (
              <>Valor final com o desconto: </>
            )}
            <span className="font-semibold text-foreground">{formatCurrency(Number(finalPrice) || 0)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
