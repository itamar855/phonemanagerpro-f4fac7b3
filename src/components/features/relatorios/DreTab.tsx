import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { FileText, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatPct, exportDREPDF, exportCSV, COLORS } from "./relatorioPdf";
import { Filters, ExportBtns } from "./types";

export interface DreTabProps {
  filterProps: any;
  dreLines: any[];
  dre: any;
  currentPeriodLabel: string;
  currentStoreName: string;
  monthlyData: any[];
  storeBreakdown: any[];
}

export const DreTab: React.FC<DreTabProps> = ({
  filterProps,
  dreLines,
  dre,
  currentPeriodLabel,
  currentStoreName,
  monthlyData,
  storeBreakdown,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters {...filterProps} />
        <ExportBtns
          onCSV={() =>
            exportCSV(
              dreLines.map((l) => ({ item: l.label, valor: formatCurrency(Math.abs(l.value)) })),
              "dre.csv"
            )
          }
          onPDF={() => exportDREPDF(dreLines, dre, currentPeriodLabel, currentStoreName)}
        />
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> DRE Simplificado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {dreLines.map((line, i) => (
              <div
                key={i}
                className={
                  "flex items-center justify-between py-2 px-3 rounded-lg text-sm " +
                  (line.bold ? "bg-muted/50 font-semibold " : "") +
                  (line.type === "result" ? "bg-primary/10 text-primary font-bold text-base" : "")
                }
              >
                <div>
                  <span className={line.bold ? "" : "text-muted-foreground"}>{line.label}</span>
                  {(line as any).sub && (
                    <span className="text-[10px] text-muted-foreground ml-2">({(line as any).sub})</span>
                  )}
                </div>
                <span
                  className={
                    line.type === "result"
                      ? line.value >= 0
                        ? "text-primary"
                        : "text-destructive"
                      : line.type === "expense"
                      ? "text-destructive"
                      : ""
                  }
                >
                  {line.type === "expense" ? "- " : ""}
                  {formatCurrency(Math.abs(line.value))}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Margem Bruta",
            value:
              (dre.totalReceita ?? 0) > 0
                ? formatPct(((dre.lucroBruto ?? 0) / dre.totalReceita) * 100)
                : "0%",
            color: "text-primary",
          },
          {
            label: "Margem Liquida",
            value:
              (dre.totalReceita ?? 0) > 0
                ? formatPct(((dre.lucroLiquido ?? 0) / dre.totalReceita) * 100)
                : "0%",
            color: (dre.lucroLiquido ?? 0) >= 0 ? "text-primary" : "text-destructive",
          },
          {
            label: "Ticket Medio",
            value:
              (dre.qtdVendasAparelhos ?? 0) > 0
                ? formatCurrency((dre.receitaAparelhos ?? 0) / dre.qtdVendasAparelhos)
                : formatCurrency(0),
            color: "",
          },
          { label: "Receita Total", value: formatCurrency(dre.totalReceita ?? 0), color: "text-primary" },
        ].map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
              <p className={"font-display text-xl font-bold mt-1 " + k.color}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Receita vs Despesas (6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.some((d) => d.receita > 0 || d.despesa > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="receita" fill={COLORS[0]} radius={[4, 4, 0, 0]} name="Receita" />
                  <Bar dataKey="despesa" fill={COLORS[4]} radius={[4, 4, 0, 0]} name="Despesas" />
                  <Bar dataKey="lucro" fill={COLORS[1]} radius={[4, 4, 0, 0]} name="Lucro" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-xs">
                Sem dados para o periodo
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Resultado por Loja</CardTitle>
          </CardHeader>
          <CardContent>
            {storeBreakdown.length > 0 ? (
              <div className="space-y-3">
                {storeBreakdown.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">Vendas: {formatCurrency(s.vendas)}</p>
                    </div>
                    <div className="text-right">
                      <p className={"font-bold text-sm " + (s.lucro >= 0 ? "text-primary" : "text-destructive")}>
                        {formatCurrency(s.lucro)}
                      </p>
                      <div className="flex items-center gap-1 justify-end">
                        {s.lucro >= 0 ? (
                          <TrendingUp className="h-3 w-3 text-primary" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                        <span className="text-[10px] text-muted-foreground">lucro</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-xs">
                Sem dados
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
