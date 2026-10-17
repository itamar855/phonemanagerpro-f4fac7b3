import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, exportFinanceiroPDF, exportCSV } from "./relatorioPdf";
import { Filters, ExportBtns } from "./types";

export interface FinanceiroTabProps {
  filterProps: any;
  financeiroData: any[];
  financeiroStats: any;
  currentPeriodLabel: string;
  currentStoreName: string;
}

export const FinanceiroTab: React.FC<FinanceiroTabProps> = ({
  filterProps,
  financeiroData,
  financeiroStats,
  currentPeriodLabel,
  currentStoreName,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters {...filterProps} />
        <ExportBtns
          onCSV={() =>
            exportCSV(
              financeiroData.map((t: any) => ({
                data: t.data,
                descricao: t.descricao,
                categoria: t.categoria,
                tipo: t.tipo,
                conta: t.conta,
                valor: t.valor,
              })),
              "financeiro.csv"
            )
          }
          onPDF={() => exportFinanceiroPDF(financeiroData, financeiroStats, currentPeriodLabel, currentStoreName)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Entradas</p>
            <p className="font-display text-xl font-bold mt-1 text-primary">
              {formatCurrency(financeiroStats.totalEntradas)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Saidas</p>
            <p className="font-display text-xl font-bold mt-1 text-destructive">
              {formatCurrency(financeiroStats.totalSaidas)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Saldo Liquido</p>
            <p className="font-display text-xl font-bold mt-1">
              {formatCurrency(financeiroStats.saldoLiquido)}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm">Transacoes ({financeiroData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {["Data", "Descricao", "Categoria", "Conta", "Tipo", "Valor"].map((h) => (
                    <th key={h} className="text-left py-2 px-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financeiroData.map((t: any, i: number) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-2 px-2">{t.data}</td>
                    <td className="py-2 px-2 font-medium">{t.descricao}</td>
                    <td className="py-2 px-2">{t.categoria}</td>
                    <td className="py-2 px-2">{t.conta}</td>
                    <td className="py-2 px-2">
                      <Badge
                        variant="outline"
                        className={
                          t.isEntrada
                            ? "text-primary border-primary/30"
                            : "text-destructive border-destructive/30"
                        }
                      >
                        {t.tipo}
                      </Badge>
                    </td>
                    <td
                      className={
                        "py-2 px-2 font-bold " + (t.isEntrada ? "text-primary" : "text-destructive")
                      }
                    >
                      {formatCurrency(t.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
