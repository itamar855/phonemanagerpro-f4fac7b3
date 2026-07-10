import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface KanbanBoardProps {
  orders: any[];
  statusConfig: Record<string, { label: string; color: string; icon: any }>;
  allStatuses: string[];
  storeMap: Map<string, string>;
  profileMap: Map<string, string>;
  formatCurrency: (v: number) => string;
  onOrderClick: (order: any) => void;
  onStatusChange: (orderId: string, newStatus: string, oldStatus: string) => void;
}

export function KanbanBoard({
  orders,
  statusConfig,
  allStatuses,
  profileMap,
  formatCurrency,
  onOrderClick,
  onStatusChange,
}: KanbanBoardProps) {
  const handleDragStart = (e: React.DragEvent, orderId: string, oldStatus: string) => {
    e.dataTransfer.setData("orderId", orderId);
    e.dataTransfer.setData("oldStatus", oldStatus);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Permitir drop
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData("orderId");
    const oldStatus = e.dataTransfer.getData("oldStatus");
    if (orderId && oldStatus !== newStatus) {
      onStatusChange(orderId, newStatus, oldStatus);
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 items-start h-[550px] md:h-[calc(100vh-270px)] min-h-[500px] scrollbar-none snap-x snap-mandatory">
      {allStatuses.map((status) => {
        const config = statusConfig[status];
        const statusOrders = orders.filter((o) => o.status === status);
        const Icon = config.icon;

        return (
          <div
            key={status}
            className="flex-shrink-0 w-[82vw] sm:w-[280px] flex flex-col gap-2.5 rounded-lg bg-muted/20 p-2.5 border border-border/40 h-full snap-center"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="flex items-center justify-between px-1 mb-0.5">
              <h3 className="font-semibold text-xs md:text-sm flex items-center gap-1.5 text-foreground/90 truncate">
                {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="truncate">{config.label}</span>
              </h3>
              <Badge variant="secondary" className="text-[10px] md:text-xs bg-muted/50 py-0 px-1.5 h-5">
                {statusOrders.length}
              </Badge>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 pb-10 scrollbar-none">
              {statusOrders.length === 0 && (
                <div className="h-16 border-2 border-dashed border-border/50 rounded-lg flex items-center justify-center text-muted-foreground/30 text-[10px]">
                  Solte OS aqui
                </div>
              )}
              {statusOrders.map((order) => (
                <Card
                   key={order.id}
                   draggable
                   onDragStart={(e) => handleDragStart(e, order.id, order.status)}
                   onClick={() => onOrderClick(order)}
                   className="cursor-pointer border-border/40 bg-card hover:border-primary/50 transition-all shadow-sm hover:shadow-md active:cursor-grabbing active:scale-[0.98]"
                >
                  <CardContent className="p-2.5 space-y-1.5">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] text-muted-foreground font-mono bg-muted px-1 py-0.2 rounded shrink-0">
                        #{order.order_number}
                      </span>
                      <p className="font-bold text-[11px] md:text-xs text-primary shrink-0">
                        {formatCurrency(Number(order.final_price || order.estimated_price || 0))}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold text-xs md:text-sm leading-tight truncate">
                        {order.customer_name}
                      </p>
                      <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                        {order.device_brand} {order.device_model}
                      </p>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 mt-1.5 border-t border-border/40 text-[9px] text-muted-foreground">
                      <span>{new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
                      {order.technician_id && (
                        <span className="truncate max-w-[80px] text-right">
                          {profileMap.get(order.technician_id)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
