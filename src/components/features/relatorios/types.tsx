import React from "react";
import { Crown, Medal, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTHS } from "./relatorioPdf";

export const getPeriodDates = (period: string, customStart: string, customEnd: string, specificDay?: string) => {
  const now = new Date();
  if (period === "today") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    return { start: s, end: e };
  }
  if (period === "day" && specificDay) {
    const d = new Date(specificDay + "T00:00:00");
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    return { start: s, end: e };
  }
  if (period === "custom") {
    return {
      start: customStart ? new Date(customStart).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      end: customEnd ? new Date(customEnd + "T23:59:59").toISOString() : now.toISOString(),
    };
  }
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { start: d.toISOString(), end: now.toISOString() };
  }
  if (period === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: now.toISOString() };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), q, 1).toISOString(), end: now.toISOString() };
  }
  return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: now.toISOString() };
};

export const getPeriodLabel = (period: string, customStart: string, customEnd: string, specificDay?: string) => {
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
  if (period === "today") return "Hoje - " + fmt(new Date());
  if (period === "day" && specificDay) return "Dia " + fmt(new Date(specificDay + "T12:00:00"));
  if (period === "week") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return fmt(d) + " a " + fmt(new Date());
  }
  if (period === "month") {
    const n = new Date();
    return MONTHS[n.getMonth()] + "/" + n.getFullYear();
  }
  if (period === "quarter") {
    const n = new Date();
    const q = Math.floor(n.getMonth() / 3) + 1;
    return q + "o Trimestre " + n.getFullYear();
  }
  if (period === "year") return "Ano " + new Date().getFullYear();
  if (period === "custom") return (customStart || "?") + " a " + (customEnd || "?");
  return "";
};

export const RankBadge = ({ pos }: { pos: number }) => {
  if (pos === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
  if (pos === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (pos === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground text-sm font-bold w-5 text-center">{pos}o</span>;
};

export const PeriodSelect = ({
  value,
  onChange,
  includeCustom = true,
}: {
  value: string;
  onChange: (v: string) => void;
  includeCustom?: boolean;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-9 w-40">
      <SelectValue />
    </SelectTrigger>
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

export const Filters = ({
  period,
  setPeriod,
  storeId,
  setStoreId,
  stores,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  specificDay,
  setSpecificDay,
  userRole,
}: any) => (
  <div className="flex flex-wrap gap-2 items-end">
    <div className="space-y-1">
      <Label className="text-xs">Periodo</Label>
      <PeriodSelect value={period} onChange={setPeriod} />
    </div>
    {period === "day" && (
      <div className="space-y-1">
        <Label className="text-xs">Dia</Label>
        <Input
          type="date"
          value={specificDay}
          onChange={(e) => setSpecificDay(e.target.value)}
          className="h-9 w-36"
        />
      </div>
    )}
    {period === "custom" && (
      <>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ate</Label>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-9 w-36"
          />
        </div>
      </>
    )}
    {userRole === "admin" && (
      <div className="space-y-1">
        <Label className="text-xs">Loja (Filtro Local)</Label>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lojas</SelectItem>
            {stores.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )}
  </div>
);

export const ExportBtns = ({ onCSV, onPDF }: { onCSV: () => void; onPDF: () => void }) => (
  <div className="flex gap-2">
    <Button
      className="gap-1.5 h-9 bg-transparent border border-border text-foreground hover:bg-muted text-xs"
      onClick={onCSV}
    >
      <Download className="h-3.5 w-3.5" /> CSV
    </Button>
    <Button
      className="gap-1.5 h-9 text-xs bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
      onClick={onPDF}
    >
      <FileText className="h-3.5 w-3.5" /> PDF
    </Button>
  </div>
);
