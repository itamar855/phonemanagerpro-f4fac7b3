import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, FileText, MessageCircle } from "lucide-react";
import { formatCurrency, formatPct, exportVendasPDF, exportCSV } from "./relatorioPdf";
import { Filters, ExportBtns } from "./types";

export interface VendasTabProps {
  filterProps: any;
  salesDetail: any[];
  rankingProducts: any[];
  currentPeriodLabel: string;
  currentStoreName: string;
  notaLoading: string | null;
  handleGerarNota: (r: any, sendWhatsApp: boolean) => void;
}

export const VendasTab: React.FC<VendasTabProps> = ({
  filterProps,
  salesDetail,
  rankingProducts,
  currentPeriodLabel,
  currentStoreName,
  notaLoading,
  handleGerarNota,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters {...filterProps} />
        <ExportBtns
          onCSV={() =>
            exportCSV(
              salesDetail.map((r) => ({
                data: r.data,
                produto: r.produto,
                marca: r.marca,
                loja: r.loja,
                cliente: r.cliente,
                valor: formatCurrency(r.valor),
                custo: formatCurrency(r.custo),
                lucro: formatCurrency(r.lucro),
                margem: formatPct(r.margem),
                troca: r.troca,
              })),
              "vendas.csv"
            )
          }
          onPDF={() => exportVendasPDF(salesDetail, currentPeriodLabel, currentStoreName)}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total Vendido",
            value: formatCurrency(salesDetail.reduce((s, r) => s + r.valor, 0)),
            color: "text-primary",
          },
          {
            label: "Lucro Total",
            value: formatCurrency(salesDetail.reduce((s, r) => s + r.lucro, 0)),
            color: "text-primary",
          },
          { label: "Qtd. Vendas", value: String(salesDetail.length), color: "" },
          {
            label: "Ticket Medio",
            value:
              salesDetail.length > 0
                ? formatCurrency(salesDetail.reduce((s, r) => s + r.valor, 0) / salesDetail.length)
                : formatCurrency(0),
            color: "",
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

      {rankingProducts.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" /> Top 10 Produtos Mais Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rankingProducts.map((p, i) => (
                <div key={p.produto} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}o</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.produto}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.marca} - {p.qtd} venda{p.qtd !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">{formatCurrency(p.total)}</p>
                    <p className="text-[10px] text-muted-foreground">lucro: {formatCurrency(p.lucro)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm">
            Detalhamento de Vendas ({salesDetail.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {salesDetail.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    {["Data", "Produto", "Marca", "Cliente", "Valor", "Lucro", "Margem", "Nota"].map((h) => (
                      <th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salesDetail.map((r, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2 px-2 whitespace-nowrap">{r.data}</td>
                      <td className="py-2 px-2 font-medium">{r.produto}</td>
                      <td className="py-2 px-2">{r.marca}</td>
                      <td className="py-2 px-2">{r.cliente}</td>
                      <td className="py-2 px-2 text-primary font-bold whitespace-nowrap">
                        {formatCurrency(r.valor)}
                      </td>
                      <td
                        className={
                          "py-2 px-2 font-bold whitespace-nowrap " +
                          (r.lucro >= 0 ? "text-primary" : "text-destructive")
                        }
                      >
                        {formatCurrency(r.lucro)}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">{formatPct(r.margem)}</td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          <Button
                            className="h-7 text-[9px] px-2 bg-transparent border border-border text-foreground hover:bg-muted"
                            onClick={() => handleGerarNota(r, false)}
                            disabled={notaLoading === r._raw?.id}
                          >
                            <FileText className="h-2.5 w-2.5" /> PDF
                          </Button>
                          {r._raw?.customer_phone && (
                            <Button
                              className="h-7 text-[9px] px-2 bg-transparent border border-green-500/30 text-green-500 hover:bg-green-500/10"
                              onClick={() => handleGerarNota(r, true)}
                              disabled={notaLoading === r._raw?.id}
                            >
                              <MessageCircle className="h-2.5 w-2.5" /> WA
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma venda no periodo</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
