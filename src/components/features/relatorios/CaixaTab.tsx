import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, exportCaixaPDF, exportCSV } from "./relatorioPdf";
import { Filters, ExportBtns } from "./types";

export interface CaixaTabProps {
  filterProps: any;
  caixaData: any[];
  caixaStats: any;
  currentPeriodLabel: string;
  currentStoreName: string;
}

export const CaixaTab: React.FC<CaixaTabProps> = ({
  filterProps,
  caixaData,
  caixaStats,
  currentPeriodLabel,
  currentStoreName,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters {...filterProps} />
        <ExportBtns
          onCSV={() => exportCSV(caixaData, "caixa.csv")}
          onPDF={() => exportCaixaPDF(caixaData, caixaStats, currentPeriodLabel, currentStoreName)}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Caixas", value: String(caixaStats.total ?? 0), color: "" },
          { label: "Fechados", value: String(caixaStats.fechados ?? 0), color: "text-primary" },
          { label: "Abertos", value: String(caixaStats.abertos ?? 0), color: "text-yellow-500" },
          {
            label: "Total Diferenca",
            value: formatCurrency(Math.abs(caixaStats.totalDiferenca ?? 0)),
            color: (caixaStats.totalDiferenca ?? 0) === 0 ? "text-primary" : "text-destructive",
          },
        ].map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
              <p className={"font-display text-xl font-bold mt-1 " + k.color}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm">Historico de Caixas</CardTitle>
        </CardHeader>
        <CardContent>
          {caixaData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    {["Data", "Loja", "Status", "Abertura", "Fechamento", "Esperado", "Diferenca", "Motivo"].map(
                      (h) => (
                        <th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {caixaData.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2 px-2 whitespace-nowrap">{r.data}</td>
                      <td className="py-2 px-2">{r.loja}</td>
                      <td className="py-2 px-2">
                        <Badge
                          variant="outline"
                          className={
                            "text-[10px] " +
                            (r.status === "Aberto"
                              ? "text-yellow-500 border-yellow-500/30"
                              : "text-primary border-primary/30")
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">{formatCurrency(r.abertura)}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {r.status === "Fechado" ? formatCurrency(r.fechamento) : "—"}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {r.status === "Fechado" ? formatCurrency(r.esperado) : "—"}
                      </td>
                      <td
                        className={
                          "py-2 px-2 whitespace-nowrap font-bold " +
                          (Math.abs(r.diferenca) > 5 ? "text-destructive" : "text-primary")
                        }
                      >
                        {r.status === "Fechado" ? formatCurrency(r.diferenca) : "—"}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{r.motivo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum caixa no periodo</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
