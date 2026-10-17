import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Search } from "lucide-react";
import { formatCurrency, exportOSPDF, exportCSV, COLORS } from "./relatorioPdf";
import { Filters, ExportBtns } from "./types";
import { getStatusLabel, getStatusColor, ALL_OS_STATUSES } from "@/utils/osStatus";

export interface OsTabProps {
  filterProps: any;
  filteredOSData: any[];
  osStats: any;
  profileMap: Map<string, string>;
  currentPeriodLabel: string;
  currentStoreName: string;
  osFilterTechId: string;
  setOsFilterTechId: (v: string) => void;
  profiles: any[];
  osFilterStatus: string;
  setOsFilterStatus: (v: string) => void;
  osDateMode: "delivery" | "entry";
  setOsDateMode: (v: "delivery" | "entry") => void;
  osSearch: string;
  setOsSearch: (v: string) => void;
}

export const OsTab: React.FC<OsTabProps> = ({
  filterProps,
  filteredOSData,
  osStats,
  profileMap,
  currentPeriodLabel,
  currentStoreName,
  osFilterTechId,
  setOsFilterTechId,
  profiles,
  osFilterStatus,
  setOsFilterStatus,
  osDateMode,
  setOsDateMode,
  osSearch,
  setOsSearch,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters {...filterProps} />
        <ExportBtns
          onCSV={() =>
            exportCSV(
              filteredOSData.map((o: any) => ({
                numero: o.order_number,
                cliente: o.customer_name,
                aparelho: (o.device_brand || "") + " " + (o.device_model || ""),
                servico: o.requested_service,
                status: getStatusLabel(o.status),
                tecnico: profileMap.get(o.technician_id) ?? "Sem técnico",
                estimado: formatCurrency(Number(o.estimated_price || 0)),
                final: formatCurrency(Number(o.final_price || 0)),
                data_entrada: new Date(o.created_at).toLocaleDateString("pt-BR"),
                data_entrega: o.delivered_at ? new Date(o.delivered_at).toLocaleDateString("pt-BR") : "—",
              })),
              "os.csv"
            )
          }
          onPDF={() => exportOSPDF(filteredOSData, osStats, profileMap, currentPeriodLabel, currentStoreName)}
        />
      </div>

      {/* Filtros específicos de OS */}
      <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-xl border border-border/60 bg-muted/20">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground uppercase font-semibold">Técnico</Label>
          <Select value={osFilterTechId} onValueChange={setOsFilterTechId}>
            <SelectTrigger className="h-8 w-[160px] text-xs bg-card">
              <SelectValue placeholder="Todos os técnicos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os técnicos</SelectItem>
              <SelectItem value="unassigned">Sem técnico</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.display_name || "Técnico"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground uppercase font-semibold">Status</Label>
          <Select value={osFilterStatus} onValueChange={setOsFilterStatus}>
            <SelectTrigger className="h-8 w-[150px] text-xs bg-card">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {ALL_OS_STATUSES.map((st) => (
                <SelectItem key={st} value={st}>
                  {getStatusLabel(st)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground uppercase font-semibold">Critério da Data</Label>
          <Select value={osDateMode} onValueChange={(v: any) => setOsDateMode(v)}>
            <SelectTrigger className="h-8 w-[180px] text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delivery">Data de Entrega (Conclusão)</SelectItem>
              <SelectItem value="entry">Data de Entrada (Recepção)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-[11px] text-muted-foreground uppercase font-semibold">Buscar OS</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={osSearch}
              onChange={(e) => setOsSearch(e.target.value)}
              placeholder="Cliente, aparelho, IMEI ou Nº OS..."
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>
        </div>

        {(osFilterTechId !== "all" || osFilterStatus !== "all" || osDateMode !== "delivery" || osSearch) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs self-end text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOsFilterTechId("all");
              setOsFilterStatus("all");
              setOsDateMode("delivery");
              setOsSearch("");
            }}
          >
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* Grid de KPIs de OS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Receita de OS",
            value: formatCurrency(osStats.totalReceita ?? 0),
            color: "text-primary",
            sub: "OS Entregues no período",
          },
          {
            label: "Custo Peças (OS)",
            value: formatCurrency(osStats.custoPecas ?? 0),
            color: "text-orange-400",
            sub: "Peças consumidas",
          },
          {
            label: "Margem da OS",
            value: formatCurrency(osStats.lucroBruto ?? 0),
            color: "text-emerald-500",
            sub: "Lucro Bruto da OS",
          },
          {
            label: "Ticket Médio",
            value: formatCurrency(osStats.ticketMedio ?? 0),
            color: "",
            sub: "Média por OS entregue",
          },
          {
            label: "Entregues no Período",
            value: String(osStats.delivered ?? 0),
            color: "text-primary",
            sub: "Produtividade de saída",
          },
          {
            label: "Recebidas no Período",
            value: String(osStats.recebidas ?? 0),
            color: "text-blue-400",
            sub: "Novas entradas",
          },
          {
            label: "Em Aberto (Bancada)",
            value: String(osStats.open ?? 0),
            color: "text-yellow-500",
            sub: "Aguardando conclusão",
          },
          {
            label: "Canceladas",
            value: String(osStats.cancelled ?? 0),
            color: "text-destructive",
            sub: "Sem reparo",
          },
        ].map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-3.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
              <p className={"font-display text-lg sm:text-xl font-bold mt-0.5 " + k.color}>{k.value}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Produção por Técnico</CardTitle>
          </CardHeader>
          <CardContent>
            {(osStats.byTech ?? []).length > 0 ? (
              <div className="space-y-2">
                {(osStats.byTech ?? []).map((t: any) => (
                  <div key={t.tecnico} className="rounded-lg bg-muted/40 p-3 border border-border/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{t.tecnico}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {t.entregues} / {t.total} concluídas
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-border/30">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Receita</p>
                        <p className="font-bold text-primary">{formatCurrency(t.receita)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Margem da OS</p>
                        <p className="font-bold text-emerald-500">{formatCurrency(t.lucroBruto)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Comissão Est.</p>
                        <p className="font-bold text-yellow-500">{formatCurrency(t.comissao)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Sem dados de técnicos no período</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Serviços Mais Solicitados</CardTitle>
          </CardHeader>
          <CardContent>
            {(osStats.byService ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={osStats.byService}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {(osStats.byService ?? []).map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-sm">Ordens de Serviço ({filteredOSData.length})</CardTitle>
            <span className="text-[11px] text-muted-foreground">
              Modo: {osDateMode === "delivery" ? "Entregas no período" : "Entradas no período"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOSData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    {["Nr OS", "Cliente", "Aparelho", "Serviço", "Técnico", "Status", "Entrada", "Entrega", "Valor Final"].map(
                      (h) => (
                        <th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredOSData.map((o: any, i: number) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2 px-2 whitespace-nowrap font-mono font-bold text-foreground">
                        #{o.order_number ?? "-"}
                      </td>
                      <td className="py-2 px-2">{o.customer_name}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {o.device_brand} {o.device_model}
                      </td>
                      <td className="py-2 px-2">{o.requested_service}</td>
                      <td className="py-2 px-2">{profileMap.get(o.technician_id) ?? "—"}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-[10px] ${getStatusColor(o.status)}`}>
                          {getStatusLabel(o.status)}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap font-medium">
                        {o.delivered_at ? new Date(o.delivered_at).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap font-bold text-primary">
                        {formatCurrency(Number(o.final_price || o.estimated_price || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhuma OS encontrada com os filtros selecionados
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
