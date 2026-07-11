import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, Trophy } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

interface RelatorioDiarioTabProps {
  diarioDay: string;
  setDiarioDay: (day: string) => void;
  userRole: string;
  storeId: string;
  setStoreId: (id: string) => void;
  stores: any[];
  diarioLoading: boolean;
  diarioData: any;
  currentStoreName: string;
  formatCurrency: (v: number) => string;
  pdfHeader: (doc: jsPDF, titulo: string, subtitulo: string, periodo: string) => number;
  pdfKpiRow: (doc: jsPDF, y: number, kpis: any[]) => number;
  pdfTableHead: (doc: jsPDF, y: number, cols: any[]) => number;
  pdfCheckPage: (doc: jsPDF, y: number, pg: any) => number;
  pdfTableRow: (doc: jsPDF, y: number, cols: any[], vals: string[], even: boolean) => number;
  pdfFooter: (doc: jsPDF, pg: number) => void;
  PDF_GREEN: [number, number, number];
  PDF_RED: [number, number, number];
  PDF_PRIMARY: [number, number, number];
}

export const RelatorioDiarioTab: React.FC<RelatorioDiarioTabProps> = ({
  diarioDay,
  setDiarioDay,
  userRole,
  storeId,
  setStoreId,
  stores,
  diarioLoading,
  diarioData,
  currentStoreName,
  formatCurrency,
  pdfHeader,
  pdfKpiRow,
  pdfTableHead,
  pdfCheckPage,
  pdfTableRow,
  pdfFooter,
  PDF_GREEN,
  PDF_RED,
  PDF_PRIMARY,
}) => {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Selecionar Dia</Label>
            <Input type="date" value={diarioDay} onChange={e => setDiarioDay(e.target.value)} className="h-9 w-44" />
          </div>
          {userRole === "admin" && (
            <div className="space-y-1">
              <Label className="text-xs">Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button
          className="h-9 text-xs gap-1.5"
          onClick={() => {
            if (!diarioData) return;
            const doc = new jsPDF({ unit: "mm", format: "a4" });
            const pg = { n: 1 };
            let y = pdfHeader(doc, "Relatorio Diário", currentStoreName, diarioData.date);
            y = pdfKpiRow(doc, y, [
              { label: "Receita Total", value: formatCurrency(diarioData.receitaTotal), color: PDF_GREEN },
              { label: "Despesas", value: formatCurrency(diarioData.despesas), color: PDF_RED },
              { label: "Lucro Liquido", value: formatCurrency(diarioData.lucro), color: diarioData.lucro >= 0 ? PDF_GREEN : PDF_RED },
              { label: "Qtd. Vendas", value: String(diarioData.qtdVendas) },
            ]);
            y += 6;
            doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...PDF_PRIMARY);
            doc.text("DETALHAMENTO", 12, y); y += 8;
            const rows = [
              ["Vendas", String(diarioData.qtdVendas), formatCurrency(diarioData.receitaVendas)],
              ["OS Entregues", String(diarioData.osEntregues) + " / " + diarioData.qtdOS, formatCurrency(diarioData.receitaOS)],
              ["Despesas", "—", "-" + formatCurrency(diarioData.despesas)],
              ["Entradas Caixa", "—", formatCurrency(diarioData.entradasCaixa)],
              ["Saidas Caixa", "—", "-" + formatCurrency(diarioData.saidasCaixa)],
            ];
            const cols = [{label:"ITEM",w:80},{label:"QTD",w:60},{label:"VALOR",w:46}];
            y = pdfTableHead(doc, y, cols);
            rows.forEach((r, i) => { y = pdfCheckPage(doc, y, pg); y = pdfTableRow(doc, y, cols, r, i % 2 === 0); });
            pdfFooter(doc, pg.n);
            doc.save("Diario-" + diarioData.date.replace(/\//g, "-") + ".pdf");
            toast.success("PDF Diário gerado!");
          }}
          disabled={!diarioData}
        >
          <Download className="h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

      {diarioLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mr-3" /> Carregando...
        </div>
      ) : !diarioData ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground text-sm">Selecione um dia para ver o relatório.</CardContent></Card>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Receita Total", value: formatCurrency(diarioData.receitaTotal), color: "text-primary" },
              { label: "Despesas", value: formatCurrency(diarioData.despesas), color: "text-destructive" },
              { label: "Lucro Liquido", value: formatCurrency(diarioData.lucro), color: diarioData.lucro >= 0 ? "text-primary" : "text-destructive" },
              { label: "Qtd. Vendas", value: String(diarioData.qtdVendas), color: "" },
            ].map(k => (
              <Card key={k.label} className="border-border/50">
                <CardContent className="p-4">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className={"font-display text-xl font-bold mt-1 " + k.color}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Receitas */}
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Receitas do Dia</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Vendas de Aparelhos", value: diarioData.receitaVendas, sub: diarioData.qtdVendas + " venda(s)" },
                  { label: "Ordens de Servico", value: diarioData.receitaOS, sub: diarioData.osEntregues + " OS entregue(s)" },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{r.label}</p>
                      <p className="text-[10px] text-muted-foreground">{r.sub}</p>
                    </div>
                    <p className="font-bold text-primary">{formatCurrency(r.value)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
                  <p className="text-sm font-semibold">Total</p>
                  <p className="font-bold text-lg text-primary">{formatCurrency(diarioData.receitaTotal)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Formas de pagamento */}
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="font-display text-sm">Formas de Pagamento (Vendas)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Dinheiro", value: diarioData.totalDinheiro, color: "text-primary" },
                  { label: "Cartao", value: diarioData.totalCartao, color: "text-purple-500" },
                  { label: "PIX", value: diarioData.totalPix, color: "text-blue-500" },
                ].map(pm => (
                  <div key={pm.label} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm">{pm.label}</p>
                    <p className={"font-bold text-sm " + pm.color}>{formatCurrency(pm.value)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Caixa */}
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="font-display text-sm">Resumo do Caixa</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Entradas Confirmadas", value: diarioData.entradasCaixa, color: "text-primary" },
                  { label: "Saidas / Sangrias", value: diarioData.saidasCaixa, color: "text-destructive" },
                  { label: "Caixas Abertos", value: diarioData.caixasAbertos, isCount: true, color: "text-yellow-500" },
                  { label: "Caixas Fechados", value: diarioData.caixasFechados, isCount: true, color: "text-primary" },
                ].map(c => (
                  <div key={c.label} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm">{c.label}</p>
                    <p className={"font-bold text-sm " + c.color}>{(c as any).isCount ? c.value : formatCurrency(c.value as number)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top vendedores */}
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Top Vendedores do Dia</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {diarioData.topSellers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sem vendas neste dia.</p>
                ) : diarioData.topSellers.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}º</span>
                      <p className="text-sm font-medium">{s.nome}</p>
                    </div>
                    <p className="font-bold text-primary text-sm">{formatCurrency(s.total)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
};
