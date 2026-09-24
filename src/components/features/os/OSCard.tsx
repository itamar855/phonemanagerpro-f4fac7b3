import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, Phone, Calendar, Smartphone, Wrench } from "lucide-react";

interface OSCardProps {
  order: any;
  statusConfig: Record<string, { label: string; color: string; icon: any }>;
  storeMap: Map<string, string>;
  profileMap: Map<string, string>;
  formatCurrency: (v: number) => string;
  totalPaid: (order: any) => number;
  onClick: () => void;
  onWhatsApp?: (order: any) => void;
}

export const OSCard: React.FC<OSCardProps> = ({
  order,
  statusConfig,
  storeMap,
  profileMap,
  formatCurrency,
  totalPaid,
  onClick,
  onWhatsApp
}) => {
  const sc = statusConfig[order.status] || statusConfig.open;
  const rawPhone = (order.customer_phone || "").replace(/\D/g, "");

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onWhatsApp) {
      onWhatsApp(order);
    } else if (rawPhone) {
      const msg = encodeURIComponent(
        `Olá ${order.customer_name}! Sobre sua Ordem de Serviço #${order.order_number} (${order.device_brand || ""} ${order.device_model || ""}): Status atual: ${sc.label}.`
      );
      window.open(`https://wa.me/55${rawPhone}?text=${msg}`, "_blank");
    }
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (rawPhone) {
      window.location.href = `tel:${rawPhone}`;
    }
  };

  return (
    <Card 
      className="border-border/60 shadow-sm active:scale-[0.99] transition-all cursor-pointer hover:border-primary/40 bg-card/95 hover:bg-card touch-manipulation" 
      onClick={onClick}
    >
      <CardContent className="p-3.5 sm:p-4 space-y-3">
        {/* Linha superior: OS Number, Cliente, Badge de Status e Valor */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono font-semibold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                #{order.order_number}
              </span>
              <p className="font-semibold text-sm text-foreground truncate max-w-[180px] sm:max-w-none">
                {order.customer_name}
              </p>
              <Badge className={`text-[10px] px-2 py-0.5 border font-medium ${sc.color}`}>
                {sc.label}
              </Badge>
              {order.device_is_off && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-500/30 text-red-500 bg-red-500/10">
                  Desligado
                </Badge>
              )}
            </div>

            {/* Aparelho e Serviço */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 font-medium text-foreground/90">
                <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {order.device_brand} {order.device_model}
              </span>
              {order.device_imei && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  · IMEI: {order.device_imei.slice(-6)}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Wrench className="h-3 w-3 shrink-0" />
              <span className="truncate">{order.requested_service}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="truncate text-[11px]">{storeMap.get(order.store_id || "") || "Matriz"}</span>
              {order.technician_id && profileMap.get(order.technician_id) && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="truncate text-[11px] text-primary/80">Téc: {profileMap.get(order.technician_id)}</span>
                </>
              )}
            </p>
          </div>

          {/* Preço e Total Pago */}
          <div className="text-right shrink-0">
            <p className="font-display font-bold text-sm sm:text-base text-foreground">
              {formatCurrency(Number(order.final_price || order.estimated_price || 0))}
            </p>
            {totalPaid(order) > 0 ? (
              <p className="text-[10px] font-semibold text-emerald-500">
                Pago: {formatCurrency(totalPaid(order))}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">Pendente</p>
            )}
            <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1 mt-1">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(order.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {/* Barra de Ações Rápidas Mobile */}
        {rawPhone && (
          <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 active:scale-95 transition-transform"
                onClick={handleWhatsAppClick}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">WhatsApp</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
                onClick={handleCallClick}
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="text-[11px]">Ligar</span>
              </Button>
            </div>

            <span className="text-[10px] text-muted-foreground/80 font-mono">
              Toque p/ detalhes →
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

