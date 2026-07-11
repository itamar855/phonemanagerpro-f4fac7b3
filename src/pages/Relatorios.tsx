import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  FileText, TrendingUp, TrendingDown, ShoppingBag, Wrench,
  Wallet, Trophy, Medal, Download, Star, Crown, Users, MessageCircle, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { gerarNotaFiscalInterna, type NotaFiscalData } from "@/utils/notaFiscalInterna";
import { logAction } from "@/utils/auditLogger";
import { RelatorioDiarioTab } from "@/components/features/relatorios/RelatorioDiarioTab";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const formatPct = (v: number) => `${v.toFixed(1)}%`;

const MONTHS = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const COLORS = ["hsl(152,60%,45%)","hsl(38,92%,50%)","hsl(210,80%,55%)","hsl(280,60%,55%)","hsl(0,62%,50%)"];

const PDF_PRIMARY: [number,number,number] = [17,24,39];
const PDF_ACCENT: [number,number,number] = [16,185,129];
const PDF_TEXT: [number,number,number] = [30,30,30];
const PDF_LIGHT: [number,number,number] = [107,114,128];
const PDF_BG: [number,number,number] = [249,250,251];
const PDF_BORDER: [number,number,number] = [229,231,235];
const PDF_WHITE: [number,number,number] = [255,255,255];
const PDF_RED: [number,number,number] = [239,68,68];
const PDF_GREEN: [number,number,number] = [16,185,129];

function pdfHeader(doc: jsPDF, titulo: string, subtitulo: string, periodo: string): number {
  const W = 210; const M = 12;
  doc.setFillColor(...PDF_PRIMARY); doc.rect(0,0,W,32,"F");
  doc.setFillColor(...PDF_ACCENT); doc.rect(0,32,W,2,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...PDF_WHITE);
  doc.text("CELL PRO 360", M, 13);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text("Sistema de Gestao Comercial", M, 20);
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...PDF_ACCENT);
  doc.text(titulo.toUpperCase(), W-M, 12, { align:"right" });
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...PDF_WHITE);
  doc.text(subtitulo, W-M, 19, { align:"right" });
  doc.text("Periodo: " + periodo, W-M, 26, { align:"right" });
  doc.setFont("helvetica","italic"); doc.setFontSize(7.5);
  doc.text("Gerado em: " + new Date().toLocaleString("pt-BR"), M, 28);
  return 42;
}

function pdfFooter(doc: jsPDF, pg: number) {
  const y = 290;
  doc.setDrawColor(...PDF_BORDER); doc.setLineWidth(0.2); doc.line(12,y-4,198,y-4);
  doc.setFont("helvetica","italic"); doc.setFontSize(7); doc.setTextColor(...PDF_LIGHT);
  doc.text("Cell Pro 360 - Relatorio gerado automaticamente - Uso interno", 12, y);
  doc.text("Pagina " + pg, 198, y, { align:"right" });
}

function pdfKpiRow(doc: jsPDF, y: number, kpis: {label:string;value:string;color?:[number,number,number]}[]): number {
  const M=12; const CW=186; const bw=CW/kpis.length;
  kpis.forEach((k,i)=>{
    const x=M+i*bw;
    doc.setFillColor(...PDF_BG); doc.rect(x,y,bw-2,18,"F");
    doc.setDrawColor(...PDF_BORDER); doc.rect(x,y,bw-2,18);
    doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(...PDF_LIGHT);
    doc.text(k.label.toUpperCase(),x+4,y+6);
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...(k.color??PDF_TEXT));
    doc.text(k.value,x+4,y+14);
  });
  return y+22;
}

function pdfTableHead(doc: jsPDF, y: number, cols:{label:string;w:number}[]): number {
  const M=12; const H=8;
  doc.setFillColor(...PDF_PRIMARY);
  let x=M; cols.forEach(c=>{ doc.rect(x,y,c.w,H,"F"); x+=c.w; });
  x=M; doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...PDF_WHITE);
  cols.forEach(c=>{ doc.text(c.label,x+2,y+5.5); x+=c.w; });
  return y+H;
}

function pdfTableRow(doc: jsPDF, y: number, cols:{w:number}[], vals: string[], even: boolean): number {
  const M=12; const RH=7;
  if(even){ doc.setFillColor(...PDF_BG); let x2=M; cols.forEach(c=>{ doc.rect(x2,y,c.w,RH,"F"); x2+=c.w; }); }
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...PDF_TEXT);
  let x=M;
  cols.forEach((c,i)=>{
    const lines=doc.splitTextToSize(vals[i]??"",c.w-4);
    doc.text(lines[0]??"",x+2,y+4.5); x+=c.w;
  });
  return y+RH;
}

function pdfCheckPage(doc: jsPDF, y: number, pg: {n:number}): number {
  if(y>272){ pdfFooter(doc,pg.n); doc.addPage(); pg.n++; return 18; }
  return y;
}

function exportDREPDF(dreLines: any[], dre: any, periodo: string, loja: string) {
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const M=12; const W=210; const CW=W-M*2; const pg={n:1};
  let y=pdfHeader(doc,"DRE - Demonstrativo de Resultado",loja,periodo);
  y=pdfKpiRow(doc,y,[
    {label:"Receita Total",value:formatCurrency(dre.totalReceita??0),color:PDF_GREEN},
    {label:"Lucro Bruto",value:formatCurrency(dre.lucroBruto??0),color:PDF_GREEN},
    {label:"Lucro Liquido",value:formatCurrency(dre.lucroLiquido??0),color:(dre.lucroLiquido??0)>=0?PDF_GREEN:PDF_RED},
    {label:"Margem Liquida",value:(dre.totalReceita??0)>0?formatPct(((dre.lucroLiquido??0)/dre.totalReceita)*100):"0%"},
  ]);
  y+=4;
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...PDF_PRIMARY);
  doc.text("DEMONSTRATIVO DE RESULTADO DO EXERCICIO",M,y+5); y+=10;
  dreLines.forEach((line,i)=>{
    y=pdfCheckPage(doc,y,pg);
    const isResult=line.type==="result"; const isTotal=line.bold&&!isResult;
    const rh=isResult?10:8;
    if(isResult){ doc.setFillColor(...PDF_ACCENT); doc.rect(M,y,CW,rh,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...PDF_WHITE); }
    else if(isTotal){ doc.setFillColor(...PDF_BG); doc.rect(M,y,CW,rh,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...PDF_PRIMARY); }
    else{ if(i%2===0){doc.setFillColor(252,252,252);doc.rect(M,y,CW,rh,"F");} doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...PDF_TEXT); }
    doc.text(line.label,M+4,y+(isResult?6.5:5.5));
    const vs=line.type==="expense"?"- "+formatCurrency(Math.abs(line.value)):formatCurrency(Math.abs(line.value));
    if(!isResult&&line.type==="expense") doc.setTextColor(...PDF_RED);
    doc.text(vs,W-M-4,y+(isResult?6.5:5.5),{align:"right"});
    y+=rh;
  });
  pdfFooter(doc,pg.n);
  doc.save("DRE-"+periodo.replace(/\//g,"-")+".pdf");
  toast.success("PDF do DRE gerado!");
}

function exportVendasPDF(rows: any[], periodo: string, loja: string) {
  const doc=new jsPDF({unit:"mm",format:"a4",orientation:"landscape"});
  const pg={n:1};
  let y=pdfHeader(doc,"Relatorio de Vendas",loja,periodo);
  const total=rows.reduce((s:number,r:any)=>s+r.valor,0);
  const lucro=rows.reduce((s:number,r:any)=>s+r.lucro,0);
  y=pdfKpiRow(doc,y,[
    {label:"Total Vendido",value:formatCurrency(total),color:PDF_GREEN},
    {label:"Lucro Total",value:formatCurrency(lucro),color:lucro>=0?PDF_GREEN:PDF_RED},
    {label:"Qtd. Vendas",value:String(rows.length)},
    {label:"Ticket Medio",value:rows.length>0?formatCurrency(total/rows.length):formatCurrency(0)},
    {label:"Margem Media",value:total>0?formatPct((lucro/total)*100):"0%"},
  ]);
  y+=4;
  const cols=[
    {label:"DATA",w:22},{label:"PRODUTO / MARCA",w:54},{label:"CLIENTE",w:38},{label:"LOJA",w:30},
    {label:"DINHEIRO",w:26},{label:"CARTAO",w:26},{label:"PIX",w:22},
    {label:"VALOR",w:28},{label:"LUCRO",w:25},{label:"MARGEM",w:22},
  ];
  y=pdfTableHead(doc,y,cols);
  rows.forEach((r:any,i:number)=>{
    y=pdfCheckPage(doc,y,pg);
    y=pdfTableRow(doc,y,cols,[
      r.data,r.produto+" / "+r.marca,r.cliente,r.loja,
      r.dinheiro>0?formatCurrency(r.dinheiro):"-",
      r.cartao>0?formatCurrency(r.cartao):"-",
      r.pix>0?formatCurrency(r.pix):"-",
      formatCurrency(r.valor),formatCurrency(r.lucro),formatPct(r.margem),
    ],i%2===0);
  });
  pdfFooter(doc,pg.n);
  doc.save("Vendas-"+periodo.replace(/\//g,"-")+".pdf");
  toast.success("PDF de Vendas gerado!");
}

function exportOSPDF(osData: any[], osStats: any, profileMap: Map<string,string>, periodo: string, loja: string) {
  const doc=new jsPDF({unit:"mm",format:"a4",orientation:"landscape"});
  const pg={n:1};
  let y=pdfHeader(doc,"Relatorio de OS - Servicos",loja,periodo);
  y=pdfKpiRow(doc,y,[
    {label:"Total OS",value:String(osStats.total??0)},
    {label:"Entregues",value:String(osStats.delivered??0),color:PDF_GREEN},
    {label:"Em Aberto",value:String(osStats.open??0)},
    {label:"Receita OS",value:formatCurrency(osStats.totalReceita??0),color:PDF_GREEN},
    {label:"Ticket Medio",value:formatCurrency(osStats.ticketMedio??0)},
  ]);
  y+=4;
  const cols=[
    {label:"Nr OS",w:28},{label:"CLIENTE",w:40},{label:"APARELHO",w:40},{label:"SERVICO",w:46},
    {label:"TECNICO",w:36},{label:"STATUS",w:25},{label:"ESTIMADO",w:28},{label:"FINAL",w:28},{label:"DATA",w:22},
  ];
  y=pdfTableHead(doc,y,cols);
  const sm:Record<string,string>={open:"Aberto",in_progress:"Em andamento",waiting_parts:"Aguard. peca",completed:"Concluido",delivered:"Entregue",cancelled:"Cancelado"};
  osData.forEach((o:any,i:number)=>{
    y=pdfCheckPage(doc,y,pg);
    y=pdfTableRow(doc,y,cols,[
      o.order_number??"-",o.customer_name??"-",
      ((o.device_brand??"")+" "+(o.device_model??"")).trim()||"-",
      o.requested_service??"-",profileMap.get(o.technician_id)??"???",
      sm[o.status]??o.status,formatCurrency(Number(o.estimated_price||0)),
      formatCurrency(Number(o.final_price||0)),new Date(o.created_at).toLocaleDateString("pt-BR"),
    ],i%2===0);
  });
  pdfFooter(doc,pg.n);
  doc.save("OS-"+periodo.replace(/\//g,"-")+".pdf");
  toast.success("PDF de OS gerado!");
}

function exportCaixaPDF(caixaData: any[], caixaStats: any, periodo: string, loja: string) {
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pg={n:1};
  let y=pdfHeader(doc,"Relatorio de Caixa",loja,periodo);
  y=pdfKpiRow(doc,y,[
    {label:"Total Caixas",value:String(caixaStats.total??0)},
    {label:"Fechados",value:String(caixaStats.fechados??0),color:PDF_GREEN},
    {label:"Abertos",value:String(caixaStats.abertos??0)},
    {label:"Total Diferenca",value:formatCurrency(Math.abs(caixaStats.totalDiferenca??0)),color:(caixaStats.totalDiferenca??0)===0?PDF_GREEN:PDF_RED},
  ]);
  y+=4;
  const cols=[
    {label:"DATA",w:28},{label:"LOJA",w:42},{label:"STATUS",w:24},
    {label:"ABERTURA",w:30},{label:"FECHAMENTO",w:30},{label:"ESPERADO",w:30},{label:"DIFERENCA",w:28},
  ];
  y=pdfTableHead(doc,y,cols);
  caixaData.forEach((r:any,i:number)=>{
    y=pdfCheckPage(doc,y,pg);
    y=pdfTableRow(doc,y,cols,[
      r.data,r.loja,r.status,formatCurrency(r.abertura),
      r.status==="Fechado"?formatCurrency(r.fechamento):"-",
      r.status==="Fechado"?formatCurrency(r.esperado):"-",
      r.status==="Fechado"?formatCurrency(r.diferenca):"-",
    ],i%2===0);
  });
  pdfFooter(doc,pg.n);
  doc.save("Caixa-"+periodo.replace(/\//g,"-")+".pdf");
  toast.success("PDF de Caixa gerado!");
}

function exportRankingPDF(ranking: any[], periodo: string, loja: string) {
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pg={n:1};
  let y=pdfHeader(doc,"Ranking de Vendedores",loja,periodo);
  y=pdfKpiRow(doc,y,[
    {label:"Vendedores",value:String(ranking.length)},
    {label:"Total Vendido",value:formatCurrency(ranking.reduce((s,v)=>s+v.totalVendas,0)),color:PDF_GREEN},
    {label:"Total Comissoes",value:formatCurrency(ranking.reduce((s,v)=>s+v.comissoes,0))},
    {label:"OS Entregues",value:String(ranking.reduce((s,v)=>s+v.osEntregues,0))},
  ]);
  y+=4;
  const cols=[
    {label:"POS.",w:14},{label:"VENDEDOR",w:52},{label:"QTD. VENDAS",w:30},
    {label:"TOTAL VENDIDO",w:38},{label:"LUCRO GERADO",w:36},{label:"COMISSAO",w:30},{label:"OS ENTREGUES",w:28},
  ];
  y=pdfTableHead(doc,y,cols);
  ranking.forEach((v:any,i:number)=>{
    y=pdfCheckPage(doc,y,pg);
    y=pdfTableRow(doc,y,cols,[
      (i+1)+"o",v.nome,String(v.qtdVendas),
      formatCurrency(v.totalVendas),formatCurrency(v.lucro),
      v.comissoes>0?formatCurrency(v.comissoes):"-",String(v.osEntregues),
    ],i%2===0);
  });
  pdfFooter(doc,pg.n);
  doc.save("Ranking-"+periodo.replace(/\//g,"-")+".pdf");
  toast.success("PDF de Ranking gerado!");
}

function exportComissoesPDF(comissoes: any[], periodo: string, loja: string) {
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pg={n:1};
  let y=pdfHeader(doc,"Relatorio de Comissoes",loja,periodo);
  const tot=comissoes.reduce((s,c)=>s+c.comissoes,0);
  y=pdfKpiRow(doc,y,[
    {label:"Total a Pagar",value:formatCurrency(tot),color:PDF_RED},
    {label:"Vendedores",value:String(comissoes.length)},
    {label:"Total Vendido",value:formatCurrency(comissoes.reduce((s,c)=>s+c.totalVendas,0)),color:PDF_GREEN},
    {label:"Total Lucro",value:formatCurrency(comissoes.reduce((s,c)=>s+c.lucro,0)),color:PDF_GREEN},
  ]);
  y+=4;
  const cols=[
    {label:"POS.",w:14},{label:"VENDEDOR",w:55},{label:"QTD. VENDAS",w:30},
    {label:"TOTAL VENDIDO",w:38},{label:"LUCRO GERADO",w:36},{label:"% COMISSAO",w:28},{label:"COMISSAO (R$)",w:32},
  ];
  y=pdfTableHead(doc,y,cols);
  comissoes.forEach((v:any,i:number)=>{
    y=pdfCheckPage(doc,y,pg);
    const pct=v.totalVendas>0?formatPct((v.comissoes/v.totalVendas)*100):"0%";
    y=pdfTableRow(doc,y,cols,[
      (i+1)+"o",v.nome,String(v.qtdVendas),
      formatCurrency(v.totalVendas),formatCurrency(v.lucro),pct,formatCurrency(v.comissoes),
    ],i%2===0);
  });
  pdfFooter(doc,pg.n);
  doc.save("Comissoes-"+periodo.replace(/\//g,"-")+".pdf");
  toast.success("PDF de Comissoes gerado!");
}

function exportFinanceiroPDF(rows: any[], stats: any, period: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Relatorio Financeiro Detalhado", loja, period);
  
  y = pdfKpiRow(doc, y, [
    { label: "Total Entradas", value: formatCurrency(stats.totalEntradas), color: PDF_GREEN },
    { label: "Total Saidas", value: formatCurrency(stats.totalSaidas), color: PDF_RED },
    { label: "Saldo Liquido", value: formatCurrency(stats.saldoLiquido), color: stats.saldoLiquido >= 0 ? PDF_GREEN : PDF_RED },
    { label: "Movimentacoes", value: String(rows.length) },
  ]);
  
  y += 4;
  
  const cols = [
    { label: "DATA", w: 25 },
    { label: "DESCRICAO", w: 85 },
    { label: "CATEGORIA", w: 45 },
    { label: "CONTA", w: 55 },
    { label: "TIPO", w: 25 },
    { label: "VALOR", w: 35 },
  ];
  
  y = pdfTableHead(doc, y, cols);
  
  rows.forEach((r: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    y = pdfTableRow(doc, y, cols, [
      r.data,
      String(r.descricao || "").replace(/→/g, "-").replace(/—/g, "-"),
      r.categoria,
      r.conta,
      r.tipo,
      formatCurrency(r.valor),
    ], i % 2 === 0);
  });
  
  pdfFooter(doc, pg.n);
  doc.save("Financeiro-Detalhado-" + period.replace(/\//g, "-") + ".pdf");
  toast.success("PDF Financeiro gerado!");
}

// ─── PERIOD UTILS ────────────────────────────────────────────────────────────

const getPeriodDates = (period: string, customStart: string, customEnd: string, specificDay?: string) => {
  const now = new Date();
  if (period === "today") {
    const s = new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0).toISOString();
    const e = new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59).toISOString();
    return { start: s, end: e };
  }
  if (period === "day" && specificDay) {
    const d = new Date(specificDay + "T00:00:00");
    const s = new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0).toISOString();
    const e = new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59).toISOString();
    return { start: s, end: e };
  }
  if (period === "custom") {
    return {
      start: customStart ? new Date(customStart).toISOString() : new Date(now.getFullYear(),now.getMonth(),1).toISOString(),
      end: customEnd ? new Date(customEnd+"T23:59:59").toISOString() : now.toISOString(),
    };
  }
  if (period === "week") { const d=new Date(now); d.setDate(d.getDate()-7); return {start:d.toISOString(),end:now.toISOString()}; }
  if (period === "month") return { start: new Date(now.getFullYear(),now.getMonth(),1).toISOString(), end: now.toISOString() };
  if (period === "quarter") { const q=Math.floor(now.getMonth()/3)*3; return {start:new Date(now.getFullYear(),q,1).toISOString(),end:now.toISOString()}; }
  return { start: new Date(now.getFullYear(),0,1).toISOString(), end: now.toISOString() };
};

const getPeriodLabel = (period: string, customStart: string, customEnd: string, specificDay?: string) => {
  const fmt=(d:Date)=>d.toLocaleDateString("pt-BR");
  if (period==="today") return "Hoje - "+fmt(new Date());
  if (period==="day"&&specificDay) return "Dia "+fmt(new Date(specificDay+"T12:00:00"));
  if (period==="week") { const d=new Date(); d.setDate(d.getDate()-7); return fmt(d)+" a "+fmt(new Date()); }
  if (period==="month") { const n=new Date(); return MONTHS[n.getMonth()]+"/"+n.getFullYear(); }
  if (period==="quarter") { const n=new Date(); const q=Math.floor(n.getMonth()/3)+1; return q+"o Trimestre "+n.getFullYear(); }
  if (period==="year") return "Ano "+new Date().getFullYear();
  if (period==="custom") return (customStart||"?")+" a "+(customEnd||"?");
  return "";
};

const exportCSV = (rows: Record<string, any>[], filename: string) => {
  if (!rows.length) { toast.error("Sem dados para exportar"); return; }
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(";"), ...rows.map(r => keys.map(k => String(r[k] ?? "").replace(/;/g, ",")).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exportado!");
  logAction("DOWNLOAD_REPORT" as any, "reports", filename);
};

const RankBadge = ({ pos }: { pos: number }) => {
  if (pos === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
  if (pos === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (pos === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground text-sm font-bold w-5 text-center">{pos}o</span>;
};

const PeriodSelect = ({ value, onChange, includeCustom = true }: { value: string; onChange: (v: string) => void; includeCustom?: boolean }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="today">Diário (Hoje)</SelectItem>
      <SelectItem value="day">Diário (Outro Dia)</SelectItem>
      <SelectItem value="week">Esta Semana</SelectItem>
      <SelectItem value="month">Este Mês</SelectItem>
      <SelectItem value="quarter">Trimestre</SelectItem>
      <SelectItem value="year">Este Ano</SelectItem>
      {includeCustom && <SelectItem value="custom">Personalizado</SelectItem>}
    </SelectContent>
  </Select>
);

const Filters = ({ period, setPeriod, storeId, setStoreId, stores, customStart, setCustomStart, customEnd, setCustomEnd, specificDay, setSpecificDay, userRole }: any) => (
  <div className="flex flex-wrap gap-2 items-end">
    <div className="space-y-1">
      <Label className="text-xs">Periodo</Label>
      <PeriodSelect value={period} onChange={setPeriod} />
    </div>
    {period === "day" && (
      <div className="space-y-1">
        <Label className="text-xs">Dia</Label>
        <Input type="date" value={specificDay} onChange={e => setSpecificDay(e.target.value)} className="h-9 w-36" />
      </div>
    )}
    {period === "custom" && (
      <>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ate</Label>
          <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 w-36" />
        </div>
      </>
    )}
    {userRole === "admin" && (
      <div className="space-y-1">
        <Label className="text-xs">Loja (Filtro Local)</Label>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lojas</SelectItem>
            {stores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    )}
  </div>
);

const ExportBtns = ({ onCSV, onPDF }: { onCSV: ()=>void; onPDF: ()=>void }) => (
  <div className="flex gap-2">
    <Button className="gap-1.5 h-9 bg-transparent border border-border text-foreground hover:bg-muted text-xs" onClick={onCSV}>
      <Download className="h-3.5 w-3.5" /> CSV
    </Button>
    <Button className="gap-1.5 h-9 text-xs bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20" onClick={onPDF}>
      <FileText className="h-3.5 w-3.5" /> PDF
    </Button>
  </div>
);

const Relatorios = () => {
  const { user, userRole, activeStoreId } = useAuth();
  const [tab, setTab] = useState("dre");
  const [stores, setStores] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [period, setPeriod] = useState("today");
  const [storeId, setStoreId] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [specificDay, setSpecificDay] = useState(new Date().toISOString().split("T")[0]);
  const [rankPeriod, setRankPeriod] = useState("today");
  const [rankSpecificDay, setRankSpecificDay] = useState(new Date().toISOString().split("T")[0]);
  const [rankCustomStart] = useState("");
  const [rankCustomEnd] = useState("");
  const [notaLoading, setNotaLoading] = useState<string | null>(null);

  const [dre, setDre] = useState<any>({});
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [storeBreakdown, setStoreBreakdown] = useState<any[]>([]);
  const [salesDetail, setSalesDetail] = useState<any[]>([]);
  const [rankingProducts, setRankingProducts] = useState<any[]>([]);
  const [osData, setOsData] = useState<any[]>([]);
  const [osStats, setOsStats] = useState<any>({});
  const [caixaData, setCaixaData] = useState<any[]>([]);
  const [caixaStats, setCaixaStats] = useState<any>({});
  const [ranking, setRanking] = useState<any[]>([]);
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [leadsData, setLeadsData] = useState<any>({ total: 0, bySource: [], conversion: 0 });
  const [customerMap, setCustomerMap] = useState<Map<string, any>>(new Map());
  const [financeiroData, setFinanceiroData] = useState<any[]>([]);
  const [financeiroStats, setFinanceiroStats] = useState<any>({ totalEntradas: 0, totalSaidas: 0, saldoLiquido: 0 });

  // ─ Diário ───────────────────────────────────────
  const [diarioDay, setDiarioDay] = useState(new Date().toISOString().split("T")[0]);
  const [diarioData, setDiarioData] = useState<any>(null);
  const [diarioLoading, setDiarioLoading] = useState(false);

  useEffect(() => {
    supabase.from("stores").select("*").then(r => setStores(r.data ?? []));
    supabase.from("profiles").select("*").then(r => setProfiles(r.data ?? []));
  }, []);

  useEffect(() => {
    if (activeStoreId && userRole !== "admin") setStoreId(activeStoreId);
  }, [activeStoreId, userRole]);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.user_id, p.display_name ?? p.user_id])), [profiles]);
  const storeMap = useMemo(() => new Map(stores.map(s => [s.id, s])), [stores]);

  const currentStoreName = storeId !== "all" ? ((storeMap.get(storeId) as any)?.name ?? "Todas as Lojas") : "Todas as Lojas";
  const currentPeriodLabel = getPeriodLabel(period, customStart, customEnd, specificDay);
  const currentRankPeriodLabel = getPeriodLabel(rankPeriod, rankCustomStart, rankCustomEnd, rankSpecificDay);

  const fetchDRE = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    const q = (t: any) => effectiveStoreId && effectiveStoreId !== "all" ? t.eq("store_id", effectiveStoreId) : t;
    const [salesRes, productsRes, txRes, osRes] = await Promise.all([
      q(supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end)),
      supabase.from("products").select("*"),
      q(supabase.from("transactions").select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("service_orders").select("*").eq("status", "delivered").gte("created_at", start).lte("created_at", end)),
    ]);
    const sales = salesRes.data ?? [];
    const products = productsRes.data ?? [];
    const tx = txRes.data ?? [];
    const os = osRes.data ?? [];
    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const receitaAparelhos = sales.reduce((s: number, x: any) => s + Number(x.sale_price), 0);
    const receitaOS = os.reduce((s: number, x: any) => s + Number(x.final_price || x.estimated_price || 0), 0);
    const accSales = tx.filter((t: any) => t.type === "income" && t.category === "acessorio");
    const receitaAcessorios = accSales.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const cmvAparelhos = sales.reduce((s: number, x: any) => s + Number((productMap.get(x.product_id) as any)?.cost_price || 0), 0);
    const cmvAcessorios = tx.filter((t: any) => t.type === "expense_pj" && t.category === "acessorio").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalReceita = receitaAparelhos + receitaAcessorios + receitaOS;
    const totalCmv = cmvAparelhos + cmvAcessorios;
    const despesasPJ = tx.filter((t: any) => t.type === "expense_pj" && t.category !== "acessorio").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const despesasPF = tx.filter((t: any) => t.type === "expense_pf").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const proLabore = tx.filter((t: any) => t.type === "pro_labore").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const lucroBruto = totalReceita - totalCmv;
    const totalDespesas = despesasPJ + despesasPF + proLabore;
    const lucroLiquido = lucroBruto - totalDespesas;
    setDre({ receitaAparelhos, receitaAcessorios, receitaOS, totalReceita, cmvAparelhos, cmvAcessorios, totalCmv, lucroBruto, despesasPJ, despesasPF, proLabore, totalDespesas, lucroLiquido, qtdVendasAparelhos: sales.length, qtdVendasAcessorios: accSales.length });
    const now = new Date();
    const mMap: Record<string, any> = {};
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); mMap[MONTHS[d.getMonth()].substring(0, 3)] = { receita: 0, despesa: 0 }; }
    sales.forEach((s: any) => { const k = MONTHS[new Date(s.created_at).getMonth()].substring(0, 3); if (mMap[k]) mMap[k].receita += Number(s.sale_price); });
    tx.forEach((t: any) => { if (t.type !== "sale" && t.type !== "income") { const k = MONTHS[new Date(t.created_at).getMonth()].substring(0, 3); if (mMap[k]) mMap[k].despesa += Number(t.amount); } });
    setMonthlyData(Object.entries(mMap).map(([name, d]) => ({ name, receita: d.receita, despesa: d.despesa, lucro: d.receita - d.despesa })));
    const sStats: Record<string, any> = {};
    sales.forEach((s: any) => {
      const name = (storeMap.get(s.store_id) as any)?.name || "Sem loja";
      if (!sStats[name]) sStats[name] = { vendas: 0, lucro: 0 };
      sStats[name].vendas += Number(s.sale_price);
      sStats[name].lucro += Number(s.sale_price) - Number((productMap.get(s.product_id) as any)?.cost_price || 0);
    });
    setStoreBreakdown(Object.entries(sStats).map(([name, d]: any) => ({ name, ...d })));
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchVendas = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    const [salesRes, productsRes, customersRes] = await Promise.all([
      supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }),
      supabase.from("products").select("*"),
      supabase.from("customers").select("*"),
    ]);
    const sales = (salesRes.data ?? []).filter((s: any) => effectiveStoreId === "all" || s.store_id === effectiveStoreId);
    const productMap = new Map((productsRes.data ?? []).map((p: any) => [p.id, p]));
    const cMap = new Map((customersRes.data ?? []).map((c: any) => [c.id, c]));
    setCustomerMap(cMap);
    const rows = sales.map((s: any) => {
      const p: any = productMap.get(s.product_id);
      const lucro = Number(s.sale_price) - Number(p?.cost_price || 0);
      return { _raw: s, _product: p, data: new Date(s.created_at).toLocaleDateString("pt-BR"), produto: p?.name ?? "—", marca: p?.brand ?? "—", loja: (storeMap.get(s.store_id) as any)?.name ?? "—", cliente: s.customer_name ?? "—", valor: Number(s.sale_price), custo: Number(p?.cost_price || 0), lucro, margem: Number(s.sale_price) > 0 ? (lucro / Number(s.sale_price)) * 100 : 0, dinheiro: Number(s.payment_cash), cartao: Number(s.payment_card), pix: Number(s.payment_pix), troca: s.has_trade_in ? "Sim ("+formatCurrency(Number(s.trade_in_value || 0))+")" : "Nao", comissao: formatCurrency(Number(s.commission_value || 0)) };
    });
    setSalesDetail(rows);
    const prodRank: Record<string, any> = {};
    rows.forEach(r => { if (!prodRank[r.produto]) prodRank[r.produto] = { produto: r.produto, marca: r.marca, qtd: 0, total: 0, lucro: 0 }; prodRank[r.produto].qtd++; prodRank[r.produto].total += r.valor; prodRank[r.produto].lucro += r.lucro; });
    setRankingProducts(Object.values(prodRank).sort((a, b) => b.total - a.total).slice(0, 10));
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchOS = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    const { data } = await supabase.from("service_orders").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
    const all = ((data ?? []) as any[]).filter(o => effectiveStoreId === "all" || o.store_id === effectiveStoreId);
    setOsData(all);
    const delivered = all.filter(o => o.status === "delivered");
    const totalReceitaOS = delivered.reduce((s, o) => s + Number(o.final_price || o.estimated_price || 0), 0);
    const techStats: Record<string, any> = {};
    all.forEach(o => { const name = profileMap.get(o.technician_id) ?? "Sem tecnico"; if (!techStats[name]) techStats[name] = { tecnico: name, total: 0, entregues: 0, receita: 0 }; techStats[name].total++; if (o.status === "delivered") { techStats[name].entregues++; techStats[name].receita += Number(o.final_price || o.estimated_price || 0); } });
    const serviceStats: Record<string, number> = {};
    all.forEach(o => { serviceStats[o.requested_service] = (serviceStats[o.requested_service] || 0) + 1; });
    setOsStats({ total: all.length, delivered: delivered.length, cancelled: all.filter(o => o.status === "cancelled").length, open: all.filter(o => !["delivered","cancelled"].includes(o.status)).length, totalReceita: totalReceitaOS, ticketMedio: delivered.length > 0 ? totalReceitaOS / delivered.length : 0, byTech: Object.values(techStats).sort((a, b) => b.receita - a.receita), byService: Object.entries(serviceStats).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })) });
  }, [period, storeId, customStart, customEnd, specificDay, profileMap]);

  const fetchCaixa = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    const { data: registers } = await supabase.from("cash_registers" as any).select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
    const all = ((registers ?? []) as any[]).filter(r => effectiveStoreId === "all" || r.store_id === effectiveStoreId);
    const closed = all.filter(r => r.status === "closed");
    setCaixaData(all.map(r => ({ data: new Date(r.created_at).toLocaleDateString("pt-BR"), loja: (storeMap.get(r.store_id) as any)?.name ?? "—", status: r.status === "open" ? "Aberto" : "Fechado", abertura: Number(r.opening_amount || 0), fechamento: Number(r.closing_amount || 0), esperado: Number(r.expected_amount || 0), diferenca: Number(r.difference || 0), motivo: r.difference_reason ?? "" })));
    setCaixaStats({ total: all.length, abertos: all.filter(r => r.status === "open").length, fechados: closed.length, totalDiferenca: closed.reduce((s, r) => s + Number(r.difference || 0), 0), comDiferenca: closed.filter(r => Math.abs(Number(r.difference || 0)) > 5).length });
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchRanking = useCallback(async () => {
    const { start, end } = getPeriodDates(rankPeriod, rankCustomStart, rankCustomEnd, rankSpecificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    const [salesRes, productsRes, osRes] = await Promise.all([
      supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end),
      supabase.from("products").select("*"),
      supabase.from("service_orders").select("*").eq("status", "delivered").gte("delivered_at", start).lte("delivered_at", end),
    ]);
    const sales = ((salesRes.data ?? []) as any[]).filter(s => effectiveStoreId === "all" || s.store_id === effectiveStoreId);
    const productMap = new Map((productsRes.data ?? []).map((p: any) => [p.id, p]));
    const os = ((osRes.data ?? []) as any[]).filter(o => effectiveStoreId === "all" || o.store_id === effectiveStoreId);
    const stats: Record<string, any> = {};
    const ensure = (uid: string) => { if (!stats[uid]) stats[uid] = { uid, nome: profileMap.get(uid) ?? "Usuario", totalVendas: 0, qtdVendas: 0, lucro: 0, comissoes: 0, osEntregues: 0 }; };
    sales.forEach((s: any) => { ensure(s.created_by); stats[s.created_by].totalVendas += Number(s.sale_price); stats[s.created_by].qtdVendas++; const p: any = productMap.get(s.product_id); stats[s.created_by].lucro += Number(s.sale_price) - Number(p?.cost_price || 0); stats[s.created_by].comissoes += Number(s.commission_value || 0); });
    os.forEach((o: any) => { const uid = o.technician_id || o.created_by; ensure(uid); stats[uid].osEntregues++; });
    const sorted = Object.values(stats).sort((a, b) => b.totalVendas - a.totalVendas);
    setRanking(sorted);
    setComissoes(sorted.filter(s => s.comissoes > 0).sort((a, b) => b.comissoes - a.comissoes));
  }, [rankPeriod, storeId, rankCustomStart, rankCustomEnd, rankSpecificDay, profileMap]);

  const fetchLeads = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    let q = supabase.from("leads").select("*").gte("created_at", start).lte("created_at", end);
    if (effectiveStoreId && effectiveStoreId !== "all") q = q.eq("store_id", effectiveStoreId);
    const { data } = await q;
    if (!data) return;
    const total = data.length;
    const sourceMap: Record<string, number> = {};
    data.forEach(l => { const src = l.source || "outro"; sourceMap[src] = (sourceMap[src] || 0) + 1; });
    const bySource = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));
    const converted = data.filter(l => l.status === "concluido").length;
    setLeadsData({ total, bySource, conversion: total > 0 ? (converted / total) * 100 : 0 });
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchFinanceiro = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    
    let q = supabase
      .from("transactions")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
      
    if (effectiveStoreId && effectiveStoreId !== "all") {
      q = q.eq("store_id", effectiveStoreId);
    }
    
    const { data: txs, error } = await q;
    if (error) {
      console.error("Error fetching transactions for financeiro:", error);
      return;
    }
    
    const { data: accounts } = await supabase.from("store_bank_accounts").select("id, bank_name, owner_type");
    const accountMap = new Map((accounts ?? []).map(a => [a.id, a]));
    
    let totalEntradas = 0;
    let totalSaidas = 0;
    
    const mapped = (txs ?? []).map((t: any) => {
      const amt = Number(t.amount) || 0;
      const isEntrada = ["income", "sale", "entrada"].includes(t.type);
      if (isEntrada) {
        totalEntradas += amt;
      } else {
        totalSaidas += amt;
      }
      
      const srcAcc = t.source_account_id ? accountMap.get(t.source_account_id) : null;
      const destAcc = t.destination_account_id ? accountMap.get(t.destination_account_id) : null;
      const contaText = srcAcc 
        ? `${srcAcc.bank_name} (${srcAcc.owner_type})` 
        : destAcc 
          ? `${destAcc.bank_name} (${destAcc.owner_type})` 
          : "Dinheiro (Gaveta)";
          
      const tipoLabel = isEntrada ? "Entrada" : "Saída";
      
      return {
        _raw: t,
        data: new Date(t.created_at).toLocaleDateString("pt-BR"),
        descricao: t.description || t.category || "Sem descrição",
        categoria: t.category || "Outros",
        tipo: tipoLabel,
        isEntrada,
        conta: contaText,
        valor: amt
      };
    });
    
    setFinanceiroData(mapped);
    setFinanceiroStats({
      totalEntradas,
      totalSaidas,
      saldoLiquido: totalEntradas - totalSaidas
    });
  }, [period, storeId, customStart, customEnd, specificDay, activeStoreId, userRole]);

  useEffect(() => { if (tab === "dre") fetchDRE(); }, [tab, fetchDRE]);
  useEffect(() => { if (tab === "vendas") fetchVendas(); }, [tab, fetchVendas]);
  useEffect(() => { if (tab === "os") fetchOS(); }, [tab, fetchOS]);
  useEffect(() => { if (tab === "caixa") fetchCaixa(); }, [tab, fetchCaixa]);
  useEffect(() => { if (tab === "ranking" || tab === "comissoes") fetchRanking(); }, [tab, fetchRanking]);
  useEffect(() => { if (tab === "leads") fetchLeads(); }, [tab, fetchLeads]);
  useEffect(() => { if (tab === "financeiro") fetchFinanceiro(); }, [tab, fetchFinanceiro]);

  // Fetch diário consolidado
  const fetchDiario = useCallback(async () => {
    setDiarioLoading(true);
    const d = new Date(diarioDay + "T00:00:00");
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    const effectiveStoreId = userRole === "admin" ? storeId : activeStoreId;
    const q = (t: any) => effectiveStoreId && effectiveStoreId !== "all" ? t.eq("store_id", effectiveStoreId) : t;

    const [salesRes, osRes, caixaRes, txRes] = await Promise.all([
      q(supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("service_orders").select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("cash_registers" as any).select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("transactions").select("*").gte("created_at", start).lte("created_at", end)),
    ]);

    const sales = salesRes.data ?? [];
    const os = osRes.data ?? [];
    const caixas = (caixaRes.data ?? []) as any[];
    const txs = txRes.data ?? [];

    const receitaVendas = sales.reduce((s: number, x: any) => s + Number(x.sale_price), 0);
    const receitaOS = (os as any[]).filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + Number(o.final_price || o.estimated_price || 0), 0);
    const despesas = (txs as any[]).filter((t: any) => ["expense", "expense_pj", "expense_pf", "saida"].includes(t.type)).reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalCaixa = caixas.filter(c => c.status === "closed").reduce((s, c) => s + Number(c.closing_amount || 0), 0);

    // Cash entries totals (confirmed only)
    const cashIds = caixas.map((c: any) => c.id);
    let cashEntries: any[] = [];
    if (cashIds.length > 0) {
      const { data: ce } = await supabase.from("cash_entries" as any)
        .select("*")
        .in("cash_register_id", cashIds)
        .eq("confirmed", true);
      cashEntries = ce ?? [];
    }
    const entradas = cashEntries.filter((e: any) => ["entrada"].includes(e.type)).reduce((s, e) => s + Number(e.amount), 0);
    const saidas = cashEntries.filter((e: any) => ["saida", "sangria"].includes(e.type)).reduce((s, e) => s + Number(e.amount), 0);

    // Sales by payment method
    const totalDinheiro = sales.reduce((s: number, x: any) => s + Number(x.payment_cash || 0), 0);
    const totalCartao = sales.reduce((s: number, x: any) => s + Number(x.payment_card || 0), 0);
    const totalPix = sales.reduce((s: number, x: any) => s + Number(x.payment_pix || 0), 0);

    // Top sellers
    const sellerMap: Record<string, number> = {};
    (sales as any[]).forEach((s: any) => {
      const uid = s.created_by;
      sellerMap[uid] = (sellerMap[uid] || 0) + Number(s.sale_price);
    });
    const topSellers = Object.entries(sellerMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([uid, total]) => ({ nome: profileMap.get(uid) ?? "Usuário", total }));

    setDiarioData({
      date: d.toLocaleDateString("pt-BR"),
      qtdVendas: sales.length,
      receitaVendas,
      qtdOS: os.length,
      osEntregues: (os as any[]).filter((o: any) => o.status === "delivered").length,
      receitaOS,
      receitaTotal: receitaVendas + receitaOS,
      despesas,
      lucro: receitaVendas + receitaOS - despesas,
      totalDinheiro, totalCartao, totalPix,
      caixasAbertos: caixas.filter(c => c.status === "open").length,
      caixasFechados: caixas.filter(c => c.status === "closed").length,
      totalCaixa,
      entradasCaixa: entradas,
      saidasCaixa: saidas,
      topSellers,
      qtdTxs: txs.length,
    });
    setDiarioLoading(false);
  }, [diarioDay, storeId, profileMap, userRole, activeStoreId]);

  useEffect(() => { if (tab === "diario") fetchDiario(); }, [tab, fetchDiario]);
  useEffect(() => { if (tab === "diario") fetchDiario(); }, [diarioDay]);

  const handleGerarNota = async (row: any, enviarWhatsApp = false) => {
    const sale = row._raw; const product = row._product;
    const store = storeMap.get(sale.store_id) as any;
    setNotaLoading(sale.id);
    try {
      const numeroNota = "VND-" + sale.id.slice(0, 8).toUpperCase();
      const customer = sale.customer_id ? customerMap.get(sale.customer_id) : null;
      const data: NotaFiscalData = {
        numeroNota, dataVenda: new Date(sale.created_at).toLocaleString("pt-BR"),
        lojaNome: store?.name ?? "Loja", lojaCnpj: store?.cnpj, lojaEndereco: store?.address,
        lojaTelefone: store?.phone, lojaWhatsapp: store?.whatsapp, lojaInstagram: store?.instagram, lojaLogoUrl: store?.logo_url,
        clienteNome: sale.customer_name || customer?.name || undefined,
        clienteCpf: sale.customer_cpf || customer?.cpf || undefined,
        clienteTelefone: sale.customer_phone || customer?.phone || undefined,
        clienteEndereco: sale.customer_address || customer?.address || undefined,
        produtoNome: product?.name ?? "Produto", produtoMarca: product?.brand ?? "",
        produtoModelo: product?.model, produtoImei: product?.imei ?? undefined, produtoCor: product?.color ?? undefined,
        valorVenda: Number(sale.sale_price), valorDinheiro: Number(sale.payment_cash) || undefined,
        valorCartao: Number(sale.payment_card) || undefined, valorPix: Number(sale.payment_pix) || undefined,
        tradeIn: sale.has_trade_in, tradeInValor: sale.trade_in_value ? Number(sale.trade_in_value) : undefined,
        tradeInNome: sale.trade_in_device_name ?? undefined, observacoes: sale.notes ?? undefined,
      };
      const doc = await gerarNotaFiscalInterna(data);
      if (enviarWhatsApp) {
        if (!sale.customer_phone) { toast.error("Cliente sem telefone!"); setNotaLoading(null); return; }
        const pdfBlob = doc.output("blob");
        const { data: uploadData, error } = await supabase.storage.from("comprovantes").upload("notas/"+numeroNota+"-"+Date.now()+".pdf", pdfBlob, { upsert: true, contentType: "application/pdf" });
        if (error) { toast.error("Erro ao enviar PDF"); setNotaLoading(null); return; }
        const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
        const phone = sale.customer_phone.replace(/\D/g, "");
        const msg = encodeURIComponent("Ola " + (sale.customer_name || "") + "! Segue o comprovante da sua compra. Comprovante No " + numeroNota + ": " + urlData.publicUrl);
        window.open("https://wa.me/55" + phone + "?text=" + msg, "_blank");
        toast.success("WhatsApp aberto!");
      } else {
        doc.save("nota-" + numeroNota + ".pdf");
        toast.success("Nota gerada!");
      }
    } catch { toast.error("Erro ao gerar nota."); }
    setNotaLoading(null);
  };

  const filterProps = { period, setPeriod, storeId, setStoreId, stores, customStart, setCustomStart, customEnd, setCustomEnd, specificDay, setSpecificDay, userRole };

  const dreLines = [
    { label: "Receita de Aparelhos", value: dre.receitaAparelhos ?? 0, sub: (dre.qtdVendasAparelhos ?? 0) + " vendas", type: "income" },
    { label: "Receita de Acessorios", value: dre.receitaAcessorios ?? 0, sub: (dre.qtdVendasAcessorios ?? 0) + " vendas", type: "income" },
    { label: "Receita de Servicos (OS)", value: dre.receitaOS ?? 0, type: "income" },
    { label: "= Receita Total", value: dre.totalReceita ?? 0, type: "total", bold: true },
    { label: "(-) CMV Aparelhos", value: -(dre.cmvAparelhos ?? 0), type: "expense" },
    { label: "(-) CMV Acessorios", value: -(dre.cmvAcessorios ?? 0), type: "expense" },
    { label: "= Lucro Bruto", value: dre.lucroBruto ?? 0, type: "total", bold: true },
    { label: "(-) Despesas PJ (Operacionais)", value: -(dre.despesasPJ ?? 0), type: "expense" },
    { label: "(-) Despesas PF (Pessoais)", value: -(dre.despesasPF ?? 0), type: "expense" },
    { label: "(-) Pro-labore", value: -(dre.proLabore ?? 0), type: "expense" },
    { label: "= Total de Despesas", value: -(dre.totalDespesas ?? 0), type: "total", bold: true },
    { label: "= LUCRO LIQUIDO", value: dre.lucroLiquido ?? 0, type: "result", bold: true },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Relatorios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Analises financeiras e operacionais</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 w-full">
          <TabsTrigger value="diario" className="text-xs gap-1.5">📅 Diário</TabsTrigger>
          <TabsTrigger value="dre" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" /> DRE</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs gap-1.5"><Wallet className="h-3.5 w-3.5" /> Financeiro</TabsTrigger>
          <TabsTrigger value="vendas" className="text-xs gap-1.5"><ShoppingBag className="h-3.5 w-3.5" /> Vendas</TabsTrigger>
          <TabsTrigger value="os" className="text-xs gap-1.5"><Wrench className="h-3.5 w-3.5" /> OS</TabsTrigger>
          <TabsTrigger value="caixa" className="text-xs gap-1.5"><Wallet className="h-3.5 w-3.5" /> Caixa</TabsTrigger>
          <TabsTrigger value="ranking" className="text-xs gap-1.5"><Trophy className="h-3.5 w-3.5" /> Ranking</TabsTrigger>
          <TabsTrigger value="comissoes" className="text-xs gap-1.5"><Star className="h-3.5 w-3.5" /> Comissoes</TabsTrigger>
          <TabsTrigger value="leads" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Leads</TabsTrigger>
        </TabsList>

        {/* ── DIÁRIO ─────────────────────────────────────────── */}
        <TabsContent value="diario" className="space-y-4 mt-4">
          <RelatorioDiarioTab
            diarioDay={diarioDay}
            setDiarioDay={setDiarioDay}
            userRole={userRole}
            storeId={storeId}
            setStoreId={setStoreId}
            stores={stores}
            diarioLoading={diarioLoading}
            diarioData={diarioData}
            currentStoreName={currentStoreName}
            formatCurrency={formatCurrency}
            pdfHeader={pdfHeader}
            pdfKpiRow={pdfKpiRow}
            pdfTableHead={pdfTableHead}
            pdfCheckPage={pdfCheckPage}
            pdfTableRow={pdfTableRow}
            pdfFooter={pdfFooter}
            PDF_GREEN={PDF_GREEN}
            PDF_RED={PDF_RED}
            PDF_PRIMARY={PDF_PRIMARY}
          />
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Filters {...filterProps} />
            <ExportBtns onCSV={() => exportCSV(financeiroData.map((t: any) => ({ data: t.data, descricao: t.descricao, categoria: t.categoria, tipo: t.tipo, conta: t.conta, valor: t.valor })), "financeiro.csv")} onPDF={() => exportFinanceiroPDF(financeiroData, financeiroStats, currentPeriodLabel, currentStoreName)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Entradas</p><p className="font-display text-xl font-bold mt-1 text-primary">{formatCurrency(financeiroStats.totalEntradas)}</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Saidas</p><p className="font-display text-xl font-bold mt-1 text-destructive">{formatCurrency(financeiroStats.totalSaidas)}</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Saldo Liquido</p><p className="font-display text-xl font-bold mt-1">{formatCurrency(financeiroStats.saldoLiquido)}</p></CardContent></Card>
          </div>
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Transacoes ({financeiroData.length})</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted-foreground">{["Data", "Descricao", "Categoria", "Conta", "Tipo", "Valor"].map(h => (<th key={h} className="text-left py-2 px-2 font-medium">{h}</th>))}</tr></thead><tbody>{financeiroData.map((t: any, i: number) => (<tr key={i} className="border-b border-border/30 hover:bg-muted/30"><td className="py-2 px-2">{t.data}</td><td className="py-2 px-2 font-medium">{t.descricao}</td><td className="py-2 px-2">{t.categoria}</td><td className="py-2 px-2">{t.conta}</td><td className="py-2 px-2"><Badge variant="outline" className={t.isEntrada ? "text-primary border-primary/30" : "text-destructive border-destructive/30"}>{t.tipo}</Badge></td><td className={"py-2 px-2 font-bold " + (t.isEntrada ? "text-primary" : "text-destructive")}>{formatCurrency(t.valor)}</td></tr>))}</tbody></table></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="leads" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><Filters {...filterProps} /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="text-sm font-display">Conversao de Leads</CardTitle></CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-6">
                  <div className="text-4xl font-bold text-primary">{leadsData.conversion.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Taxa de fechamento</p>
                </CardContent></Card>
              <Card className="border-border/50 md:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm font-display text-pink-500 flex items-center gap-2"><Camera className="h-4 w-4" /> Origem dos Leads</CardTitle></CardHeader>
                <CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={leadsData.bySource} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" fill="hsl(330, 80%, 60%)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
            </div>
            <div className="rounded-lg bg-pink-500/5 border border-pink-500/10 p-4">
              <h4 className="text-sm font-bold text-pink-700 mb-2">Dica de Performance</h4>
              <p className="text-xs text-pink-800/80">Leads vindos do Instagram costumam ter uma taxa de conversao 20% maior quando respondidos em menos de 5 minutos.</p>
            </div>
          </TabsContent>

        <TabsContent value="dre" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Filters {...filterProps} />
            <ExportBtns onCSV={()=>exportCSV(dreLines.map(l=>({item:l.label,valor:formatCurrency(Math.abs(l.value))})),"dre.csv")} onPDF={()=>exportDREPDF(dreLines,dre,currentPeriodLabel,currentStoreName)} />
          </div>
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> DRE Simplificado</CardTitle></CardHeader>
            <CardContent><div className="space-y-1">
              {dreLines.map((line, i) => (
                <div key={i} className={"flex items-center justify-between py-2 px-3 rounded-lg text-sm " + (line.bold ? "bg-muted/50 font-semibold " : "") + (line.type === "result" ? "bg-primary/10 text-primary font-bold text-base" : "")}>
                  <div><span className={line.bold ? "" : "text-muted-foreground"}>{line.label}</span>{(line as any).sub && <span className="text-[10px] text-muted-foreground ml-2">({(line as any).sub})</span>}</div>
                  <span className={line.type === "result" ? (line.value >= 0 ? "text-primary" : "text-destructive") : line.type === "expense" ? "text-destructive" : ""}>{line.type === "expense" ? "- " : ""}{formatCurrency(Math.abs(line.value))}</span>
                </div>
              ))}
            </div></CardContent></Card>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Margem Bruta", value: (dre.totalReceita??0)>0?formatPct(((dre.lucroBruto??0)/dre.totalReceita)*100):"0%", color:"text-primary" },
              { label: "Margem Liquida", value: (dre.totalReceita??0)>0?formatPct(((dre.lucroLiquido??0)/dre.totalReceita)*100):"0%", color:(dre.lucroLiquido??0)>=0?"text-primary":"text-destructive" },
              { label: "Ticket Medio", value: (dre.qtdVendasAparelhos??0)>0?formatCurrency((dre.receitaAparelhos??0)/dre.qtdVendasAparelhos):formatCurrency(0), color:"" },
              { label: "Receita Total", value: formatCurrency(dre.totalReceita??0), color:"text-primary" },
            ].map(k => (<Card key={k.label} className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p><p className={"font-display text-xl font-bold mt-1 " + k.color}>{k.value}</p></CardContent></Card>))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Receita vs Despesas (6 meses)</CardTitle></CardHeader>
              <CardContent>{monthlyData.some(d=>d.receita>0||d.despesa>0)?(<ResponsiveContainer width="100%" height={220}><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="name" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} /><Tooltip formatter={(v:number)=>formatCurrency(v)} /><Bar dataKey="receita" fill={COLORS[0]} radius={[4,4,0,0]} name="Receita" /><Bar dataKey="despesa" fill={COLORS[4]} radius={[4,4,0,0]} name="Despesas" /><Bar dataKey="lucro" fill={COLORS[1]} radius={[4,4,0,0]} name="Lucro" /></BarChart></ResponsiveContainer>):<div className="flex items-center justify-center h-[220px] text-muted-foreground text-xs">Sem dados para o periodo</div>}</CardContent></Card>
            <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Resultado por Loja</CardTitle></CardHeader>
              <CardContent>{storeBreakdown.length>0?(<div className="space-y-3">{storeBreakdown.map(s=>(<div key={s.name} className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><div><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-muted-foreground">Vendas: {formatCurrency(s.vendas)}</p></div><div className="text-right"><p className={"font-bold text-sm "+(s.lucro>=0?"text-primary":"text-destructive")}>{formatCurrency(s.lucro)}</p><div className="flex items-center gap-1 justify-end">{s.lucro>=0?<TrendingUp className="h-3 w-3 text-primary"/>:<TrendingDown className="h-3 w-3 text-destructive"/>}<span className="text-[10px] text-muted-foreground">lucro</span></div></div></div>))}</div>):<div className="flex items-center justify-center h-[220px] text-muted-foreground text-xs">Sem dados</div>}</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="vendas" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Filters {...filterProps} />
            <ExportBtns onCSV={()=>exportCSV(salesDetail.map(r=>({data:r.data,produto:r.produto,marca:r.marca,loja:r.loja,cliente:r.cliente,valor:formatCurrency(r.valor),custo:formatCurrency(r.custo),lucro:formatCurrency(r.lucro),margem:formatPct(r.margem),troca:r.troca})),"vendas.csv")} onPDF={()=>exportVendasPDF(salesDetail,currentPeriodLabel,currentStoreName)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[{label:"Total Vendido",value:formatCurrency(salesDetail.reduce((s,r)=>s+r.valor,0)),color:"text-primary"},{label:"Lucro Total",value:formatCurrency(salesDetail.reduce((s,r)=>s+r.lucro,0)),color:"text-primary"},{label:"Qtd. Vendas",value:String(salesDetail.length),color:""},{label:"Ticket Medio",value:salesDetail.length>0?formatCurrency(salesDetail.reduce((s,r)=>s+r.valor,0)/salesDetail.length):formatCurrency(0),color:""}].map(k=>(<Card key={k.label} className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p><p className={"font-display text-xl font-bold mt-1 "+k.color}>{k.value}</p></CardContent></Card>))}
          </div>
          {rankingProducts.length > 0 && (<Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Top 10 Produtos Mais Vendidos</CardTitle></CardHeader><CardContent><div className="space-y-2">{rankingProducts.map((p,i)=>(<div key={p.produto} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"><div className="flex items-center gap-3 min-w-0"><span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i+1}o</span><div className="min-w-0"><p className="text-sm font-medium truncate">{p.produto}</p><p className="text-[10px] text-muted-foreground">{p.marca} - {p.qtd} venda{p.qtd!==1?"s":""}</p></div></div><div className="text-right shrink-0"><p className="text-sm font-bold text-primary">{formatCurrency(p.total)}</p><p className="text-[10px] text-muted-foreground">lucro: {formatCurrency(p.lucro)}</p></div></div>))}</div></CardContent></Card>)}
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Detalhamento de Vendas ({salesDetail.length})</CardTitle></CardHeader>
            <CardContent>{salesDetail.length>0?(<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted-foreground">{["Data","Produto","Marca","Cliente","Valor","Lucro","Margem","Nota"].map(h=>(<th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">{h}</th>))}</tr></thead><tbody>{salesDetail.map((r,i)=>(<tr key={i} className="border-b border-border/30 hover:bg-muted/30"><td className="py-2 px-2 whitespace-nowrap">{r.data}</td><td className="py-2 px-2 font-medium">{r.produto}</td><td className="py-2 px-2">{r.marca}</td><td className="py-2 px-2">{r.cliente}</td><td className="py-2 px-2 text-primary font-bold whitespace-nowrap">{formatCurrency(r.valor)}</td><td className={"py-2 px-2 font-bold whitespace-nowrap "+(r.lucro>=0?"text-primary":"text-destructive")}>{formatCurrency(r.lucro)}</td><td className="py-2 px-2 whitespace-nowrap">{formatPct(r.margem)}</td><td className="py-2 px-2"><div className="flex gap-1"><Button className="h-7 text-[9px] px-2 bg-transparent border border-border text-foreground hover:bg-muted" onClick={()=>handleGerarNota(r,false)} disabled={notaLoading===r._raw?.id}><FileText className="h-2.5 w-2.5" /> PDF</Button>{r._raw?.customer_phone&&(<Button className="h-7 text-[9px] px-2 bg-transparent border border-green-500/30 text-green-500 hover:bg-green-500/10" onClick={()=>handleGerarNota(r,true)} disabled={notaLoading===r._raw?.id}><MessageCircle className="h-2.5 w-2.5" /> WA</Button>)}</div></td></tr>))}</tbody></table></div>):<p className="text-xs text-muted-foreground text-center py-8">Nenhuma venda no periodo</p>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="os" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Filters {...filterProps} />
            <ExportBtns onCSV={()=>exportCSV(osData.map((o:any)=>({numero:o.order_number,cliente:o.customer_name,aparelho:o.device_brand+" "+o.device_model,servico:o.requested_service,status:o.status,tecnico:profileMap.get(o.technician_id)??"—",estimado:formatCurrency(Number(o.estimated_price||0)),final:formatCurrency(Number(o.final_price||0)),data:new Date(o.created_at).toLocaleDateString("pt-BR")})),"os.csv")} onPDF={()=>exportOSPDF(osData,osStats,profileMap,currentPeriodLabel,currentStoreName)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[{label:"Total OS",value:String(osStats.total??0),color:""},{label:"Entregues",value:String(osStats.delivered??0),color:"text-primary"},{label:"Em Aberto",value:String(osStats.open??0),color:"text-yellow-500"},{label:"Receita OS",value:formatCurrency(osStats.totalReceita??0),color:"text-primary"}].map(k=>(<Card key={k.label} className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p><p className={"font-display text-xl font-bold mt-1 "+k.color}>{k.value}</p></CardContent></Card>))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Por Tecnico</CardTitle></CardHeader>
              <CardContent>{(osStats.byTech??[]).length>0?(<div className="space-y-2">{(osStats.byTech??[]).map((t:any)=>(<div key={t.tecnico} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"><div><p className="text-sm font-medium">{t.tecnico}</p><p className="text-[10px] text-muted-foreground">{t.total} OS - {t.entregues} entregues</p></div><p className="text-sm font-bold text-primary">{formatCurrency(t.receita)}</p></div>))}</div>):<p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>}</CardContent></Card>
            <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Servicos Mais Solicitados</CardTitle></CardHeader>
              <CardContent>{(osStats.byService??[]).length>0?(<ResponsiveContainer width="100%" height={200}><PieChart><Pie data={osStats.byService} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name,percent})=>`${(percent*100).toFixed(0)}%`}>{(osStats.byService??[]).map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip /></PieChart></ResponsiveContainer>):<p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>}</CardContent></Card>
          </div>
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Ordens de Servico ({osData.length})</CardTitle></CardHeader>
            <CardContent>{osData.length>0?(<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted-foreground">{["Nr OS","Cliente","Aparelho","Servico","Tecnico","Status","Estimado","Final","Data"].map(h=>(<th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">{h}</th>))}</tr></thead><tbody>{osData.map((o:any,i:number)=>{const sm:Record<string,string>={open:"Aberto",in_progress:"Em andamento",waiting_parts:"Aguard. peca",completed:"Concluido",delivered:"Entregue",cancelled:"Cancelado"};return(<tr key={i} className="border-b border-border/30 hover:bg-muted/30"><td className="py-2 px-2 whitespace-nowrap font-mono">{o.order_number??"-"}</td><td className="py-2 px-2">{o.customer_name}</td><td className="py-2 px-2 whitespace-nowrap">{o.device_brand} {o.device_model}</td><td className="py-2 px-2">{o.requested_service}</td><td className="py-2 px-2">{profileMap.get(o.technician_id)??"—"}</td><td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{sm[o.status]??o.status}</Badge></td><td className="py-2 px-2 whitespace-nowrap">{formatCurrency(Number(o.estimated_price||0))}</td><td className="py-2 px-2 whitespace-nowrap font-bold text-primary">{formatCurrency(Number(o.final_price||0))}</td><td className="py-2 px-2 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td></tr>);})}</tbody></table></div>):<p className="text-xs text-muted-foreground text-center py-8">Nenhuma OS no periodo</p>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="caixa" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Filters {...filterProps} />
            <ExportBtns onCSV={()=>exportCSV(caixaData,"caixa.csv")} onPDF={()=>exportCaixaPDF(caixaData,caixaStats,currentPeriodLabel,currentStoreName)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[{label:"Total Caixas",value:String(caixaStats.total??0),color:""},{label:"Fechados",value:String(caixaStats.fechados??0),color:"text-primary"},{label:"Abertos",value:String(caixaStats.abertos??0),color:"text-yellow-500"},{label:"Total Diferenca",value:formatCurrency(Math.abs(caixaStats.totalDiferenca??0)),color:(caixaStats.totalDiferenca??0)===0?"text-primary":"text-destructive"}].map(k=>(<Card key={k.label} className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p><p className={"font-display text-xl font-bold mt-1 "+k.color}>{k.value}</p></CardContent></Card>))}
          </div>
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Historico de Caixas</CardTitle></CardHeader>
            <CardContent>{caixaData.length>0?(<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted-foreground">{["Data","Loja","Status","Abertura","Fechamento","Esperado","Diferenca","Motivo"].map(h=>(<th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">{h}</th>))}</tr></thead><tbody>{caixaData.map((r:any,i:number)=>(<tr key={i} className="border-b border-border/30 hover:bg-muted/30"><td className="py-2 px-2 whitespace-nowrap">{r.data}</td><td className="py-2 px-2">{r.loja}</td><td className="py-2 px-2"><Badge variant="outline" className={"text-[10px] "+(r.status==="Aberto"?"text-yellow-500 border-yellow-500/30":"text-primary border-primary/30")}>{r.status}</Badge></td><td className="py-2 px-2 whitespace-nowrap">{formatCurrency(r.abertura)}</td><td className="py-2 px-2 whitespace-nowrap">{r.status==="Fechado"?formatCurrency(r.fechamento):"—"}</td><td className="py-2 px-2 whitespace-nowrap">{r.status==="Fechado"?formatCurrency(r.esperado):"—"}</td><td className={"py-2 px-2 whitespace-nowrap font-bold "+(Math.abs(r.diferenca)>5?"text-destructive":"text-primary")}>{r.status==="Fechado"?formatCurrency(r.diferenca):"—"}</td><td className="py-2 px-2 text-muted-foreground">{r.motivo||"—"}</td></tr>))}</tbody></table></div>):<p className="text-xs text-muted-foreground text-center py-8">Nenhum caixa no periodo</p>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="ranking" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1"><Label className="text-xs">Periodo</Label><PeriodSelect value={rankPeriod} onChange={setRankPeriod} includeCustom={false} /></div>
              {rankPeriod==="day"&&(<div className="space-y-1"><Label className="text-xs">Dia</Label><Input type="date" value={rankSpecificDay} onChange={e=>setRankSpecificDay(e.target.value)} className="h-9 w-36" /></div>)}
              {userRole==="admin"&&(<div className="space-y-1"><Label className="text-xs">Loja</Label><Select value={storeId} onValueChange={setStoreId}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as lojas</SelectItem>{stores.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>)}
            </div>
            <ExportBtns onCSV={()=>exportCSV(ranking.map((v,i)=>({posicao:(i+1)+"o",vendedor:v.nome,vendas:v.qtdVendas,total_vendido:formatCurrency(v.totalVendas),lucro:formatCurrency(v.lucro),comissao:formatCurrency(v.comissoes),os_entregues:v.osEntregues})),"ranking.csv")} onPDF={()=>exportRankingPDF(ranking,currentRankPeriodLabel,currentStoreName)} />
          </div>
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Ranking {rankPeriod==="today"?"de Hoje":rankPeriod==="day"?"do dia "+rankSpecificDay:rankPeriod==="week"?"Semanal":rankPeriod==="month"?"Mensal":"do Periodo"}</CardTitle></CardHeader>
            <CardContent>{ranking.length>0?(<div className="space-y-2">{ranking.map((v,i)=>(<div key={v.uid} className={"flex items-center gap-3 rounded-lg p-3 border "+(i===0?"border-yellow-500/30 bg-yellow-500/5":i===1?"border-slate-400/30 bg-slate-400/5":i===2?"border-amber-600/30 bg-amber-600/5":"border-border/50 bg-muted/30")}><div className="shrink-0 w-7 flex justify-center"><RankBadge pos={i+1}/></div><div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{v.nome}</p><div className="flex flex-wrap gap-3 mt-0.5"><span className="text-[10px] text-muted-foreground">{v.qtdVendas} venda{v.qtdVendas!==1?"s":""}</span><span className="text-[10px] text-muted-foreground">{v.osEntregues} OS</span><span className="text-[10px] text-muted-foreground">lucro: {formatCurrency(v.lucro)}</span></div></div><div className="text-right shrink-0"><p className="font-display font-bold text-base text-primary">{formatCurrency(v.totalVendas)}</p>{v.comissoes>0&&<p className="text-[10px] text-yellow-500">comissao: {formatCurrency(v.comissoes)}</p>}</div></div>))}</div>):<p className="text-xs text-muted-foreground text-center py-8">Sem vendas no periodo</p>}</CardContent></Card>
          {ranking.length>0&&(<Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm">Comparativo de Vendas</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={220}><BarChart data={ranking.map(v=>({nome:v.nome.split(" ")[0],vendas:v.totalVendas,lucro:v.lucro}))}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="nome" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} /><Tooltip formatter={(v:number)=>formatCurrency(v)} /><Bar dataKey="vendas" fill={COLORS[0]} radius={[4,4,0,0]} name="Vendas" /><Bar dataKey="lucro" fill={COLORS[1]} radius={[4,4,0,0]} name="Lucro" /></BarChart></ResponsiveContainer></CardContent></Card>)}
        </TabsContent>

        <TabsContent value="comissoes" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1"><Label className="text-xs">Periodo</Label><PeriodSelect value={rankPeriod} onChange={setRankPeriod} includeCustom={false} /></div>
              {rankPeriod==="day"&&(<div className="space-y-1"><Label className="text-xs">Dia</Label><Input type="date" value={rankSpecificDay} onChange={e=>setRankSpecificDay(e.target.value)} className="h-9 w-36" /></div>)}
              {userRole==="admin"&&(<div className="space-y-1"><Label className="text-xs">Loja</Label><Select value={storeId} onValueChange={setStoreId}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{stores.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>)}
            </div>
            <ExportBtns onCSV={()=>exportCSV(comissoes.map((c,i)=>({posicao:i+1,vendedor:c.nome,vendas:c.qtdVendas,total_vendido:formatCurrency(c.totalVendas),lucro:formatCurrency(c.lucro),comissao:formatCurrency(c.comissoes)})),"comissoes.csv")} onPDF={()=>exportComissoesPDF(comissoes,currentRankPeriodLabel,currentStoreName)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total a Pagar</p><p className="font-display text-xl font-bold mt-1 text-primary">{formatCurrency(comissoes.reduce((s,c)=>s+c.comissoes,0))}</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Vendedores c/ Comissao</p><p className="font-display text-xl font-bold mt-1">{comissoes.length}</p></CardContent></Card>
          </div>
          <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><Star className="h-4 w-4 text-yellow-500" /> Comissoes por Vendedor</CardTitle></CardHeader>
            <CardContent>{comissoes.length>0?(<div className="space-y-3">{comissoes.map((v,i)=>(<div key={v.uid} className="rounded-lg border border-border/50 p-4 space-y-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><RankBadge pos={i+1}/><p className="font-semibold">{v.nome}</p></div><Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 font-bold">{formatCurrency(v.comissoes)}</Badge></div><div className="grid grid-cols-3 gap-3 text-xs"><div className="rounded bg-muted/50 p-2 text-center"><p className="text-muted-foreground">Vendas</p><p className="font-bold">{v.qtdVendas}</p></div><div className="rounded bg-muted/50 p-2 text-center"><p className="text-muted-foreground">Total Vendido</p><p className="font-bold text-primary">{formatCurrency(v.totalVendas)}</p></div><div className="rounded bg-muted/50 p-2 text-center"><p className="text-muted-foreground">Lucro Gerado</p><p className="font-bold text-primary">{formatCurrency(v.lucro)}</p></div></div><div><div className="flex justify-between text-[10px] text-muted-foreground mb-1"><span>Comissao / Total vendido</span><span>{v.totalVendas>0?formatPct((v.comissoes/v.totalVendas)*100):"0%"}</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-yellow-500 transition-all" style={{width:Math.min(100,v.totalVendas>0?(v.comissoes/v.totalVendas)*100*5:0)+"%"}} /></div></div></div>))}</div>):<p className="text-xs text-muted-foreground text-center py-8">Nenhuma comissao no periodo</p>}</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Relatorios;
