import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface OSCardProps {
  order: any;
  statusConfig: Record<string, { label: string; color: string; icon: any }>;
  storeMap: Map<string, string>;
  profileMap: Map<string, string>;
  formatCurrency: (v: number) => string;
  totalPaid: (order: any) => number;
  onClick: () => void;
}

export const OSCard: React.FC<OSCardProps> = ({
  order,
  statusConfig,
  storeMap,
  profileMap,
  formatCurrency,
  totalPaid,
  onClick
}) => {
  const sc = statusConfig[order.status] || statusConfig.open;
  return (
    <Card className="border-border/50 shadow-lg shadow-black/10 cursor-pointer hover:border-primary/30 transition-colors" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">#{order.order_number}</span>
              <p className="font-medium text-sm truncate">{order.customer_name}</p>
              <Badge className={`text-[10px] border ${sc.color}`}>{sc.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.device_brand} {order.device_model}{order.device_imei && ` · ${order.device_imei}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.requested_service} · {storeMap.get(order.store_id || "") || "—"}
              {order.technician_id && ` · ${profileMap.get(order.technician_id) ?? ""}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display font-bold text-sm">{formatCurrency(Number(order.final_price || order.estimated_price || 0))}</p>
            {totalPaid(order) > 0 && <p className="text-[10px] text-primary">Pago: {formatCurrency(totalPaid(order))}</p>}
            <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(order.created_at).toLocaleDateString("pt-BR")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
