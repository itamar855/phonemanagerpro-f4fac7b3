import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { Trophy } from "lucide-react";
import { formatCurrency, exportRankingPDF, exportCSV, COLORS } from "./relatorioPdf";
import { RankBadge, PeriodSelect, ExportBtns } from "./types";

export interface RankingTabProps {
  rankPeriod: string;
  setRankPeriod: (v: string) => void;
  rankSpecificDay: string;
  setRankSpecificDay: (v: string) => void;
  isAdmin: boolean;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: any[];
  ranking: any[];
  currentRankPeriodLabel: string;
  currentStoreName: string;
}

export const RankingTab: React.FC<RankingTabProps> = ({
  rankPeriod,
  setRankPeriod,
  rankSpecificDay,
  setRankSpecificDay,
  isAdmin,
  storeId,
  setStoreId,
  stores,
  ranking,
  currentRankPeriodLabel,
  currentStoreName,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Periodo</Label>
            <PeriodSelect value={rankPeriod} onChange={setRankPeriod} includeCustom={false} />
          </div>
          {rankPeriod === "day" && (
            <div className="space-y-1">
              <Label className="text-xs">Dia</Label>
              <Input
                type="date"
                value={rankSpecificDay}
                onChange={(e) => setRankSpecificDay(e.target.value)}
                className="h-9 w-36"
              />
            </div>
          )}
          {isAdmin && (
            <div className="space-y-1">
              <Label className="text-xs">Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <ExportBtns
          onCSV={() =>
            exportCSV(
              ranking.map((v, i) => ({
                posicao: i + 1 + "o",
                vendedor: v.nome,
                vendas: v.qtdVendas,
                total_vendido: formatCurrency(v.totalVendas),
                lucro: formatCurrency(v.lucro),
                comissao: formatCurrency(v.comissoes),
                os_entregues: v.osEntregues,
              })),
              "ranking.csv"
            )
          }
          onPDF={() => exportRankingPDF(ranking, currentRankPeriodLabel, currentStoreName)}
        />
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" /> Ranking de Vendedores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ranking.length > 0 ? (
            <div className="space-y-2">
              {ranking.map((v, i) => (
                <div
                  key={v.uid}
                  className={
                    "flex items-center gap-3 rounded-lg p-3 border " +
                    (i === 0
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : i === 1
                      ? "border-slate-400/30 bg-slate-400/5"
                      : i === 2
                      ? "border-amber-600/30 bg-amber-600/5"
                      : "border-border/50 bg-muted/30")
                  }
                >
                  <div className="shrink-0 w-7 flex justify-center">
                    <RankBadge pos={i + 1} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{v.nome}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {v.qtdVendas} venda{v.qtdVendas !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{v.osEntregues} OS</span>
                      <span className="text-[10px] text-muted-foreground">
                        lucro: {formatCurrency(v.lucro)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-base text-primary">
                      {formatCurrency(v.totalVendas)}
                    </p>
                    {v.comissoes > 0 && (
                      <p className="text-[10px] text-yellow-500">comissao: {formatCurrency(v.comissoes)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Sem vendas no periodo</p>
          )}
        </CardContent>
      </Card>

      {ranking.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Comparativo de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ranking.map((v) => ({ nome: v.nome.split(" ")[0], vendas: v.totalVendas, lucro: v.lucro }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="vendas" fill={COLORS[0]} radius={[4, 4, 0, 0]} name="Vendas" />
                <Bar dataKey="lucro" fill={COLORS[1]} radius={[4, 4, 0, 0]} name="Lucro" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
