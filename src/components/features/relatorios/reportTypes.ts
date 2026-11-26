// Formatos dos dados que a página de Relatórios monta e entrega para cada aba.
import type { Product, Sale, ServiceOrderItem, Store, Transaction } from "@/types/db";

export interface FilterProps {
  period: string;
  setPeriod: (v: string) => void;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: Store[];
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  specificDay: string;
  setSpecificDay: (v: string) => void;
  userRole: string | null;
}

export type DreData = Partial<{
  receitaAparelhos: number;
  receitaAcessorios: number;
  receitaOS: number;
  totalReceita: number;
  cmvAparelhos: number;
  cmvAcessorios: number;
  cmvPecasOS: number;
  totalCmv: number;
  lucroBruto: number;
  despesasPJ: number;
  despesasPF: number;
  proLabore: number;
  totalDespesas: number;
  lucroLiquido: number;
  qtdVendasAparelhos: number;
  qtdVendasAcessorios: number;
  qtdOS: number;
}>;

export interface DreLine {
  label: string;
  value: number;
  sub?: string;
  type: "income" | "expense" | "total" | "result";
  bold?: boolean;
}

export interface MonthlyRow { name: string; receita: number; despesa: number; lucro: number }
export interface StoreBreakdownRow { name: string; vendas: number; lucro: number }

export interface SalesDetailRow {
  _raw: Sale;
  _product: Product | undefined;
  data: string;
  produto: string;
  marca: string;
  loja: string;
  cliente: string;
  valor: number;
  custo: number;
  lucro: number;
  margem: number;
  dinheiro: number;
  cartao: number;
  pix: number;
  troca: string;
  comissao: string;
}

export interface ProductRankRow { produto: string; marca: string; qtd: number; total: number; lucro: number }

export interface OsTechStat {
  tecnico: string;
  techId: string | null;
  total: number;
  entregues: number;
  receita: number;
  custoPecas: number;
  lucroBruto: number;
  comissao: number;
}

export type OsStats = Partial<{
  total: number;
  recebidas: number;
  delivered: number;
  cancelled: number;
  open: number;
  totalReceita: number;
  custoPecas: number;
  lucroBruto: number;
  ticketMedio: number;
  byTech: OsTechStat[];
  byService: { name: string; value: number }[];
}>;

export interface CaixaRow {
  data: string;
  loja: string;
  status: "Aberto" | "Fechado";
  abertura: number;
  fechamento: number;
  esperado: number;
  diferenca: number;
  motivo: string;
}

export type CaixaStats = Partial<{ total: number; abertos: number; fechados: number; totalDiferenca: number; comDiferenca: number }>;

/** Linha do ranking / comissões por colaborador. */
export interface SellerStat {
  uid: string;
  nome: string;
  role: string;
  totalVendas: number;
  qtdVendas: number;
  lucro: number;
  comissoes: number;
  comissoesPendentes: number;
  comissoesLiquidadas: number;
  comissoesVendas: number;
  comissoesOS: number;
  osEntregues: number;
  totalServicos: number;
}

export interface LeadsData { total: number; bySource: { name: string; value: number }[]; conversion: number }

export interface FinanceiroRow {
  _raw: Transaction;
  data: string;
  descricao: string;
  categoria: string;
  tipo: string;
  isEntrada: boolean;
  conta: string;
  valor: number;
}

export interface FinanceiroStats { totalEntradas: number; totalSaidas: number; saldoLiquido: number }

export interface DiarioData {
  date: string;
  qtdVendas: number;
  receitaVendas: number;
  qtdOS: number;
  osEntregues: number;
  receitaOS: number;
  receitaTotal: number;
  despesas: number;
  lucro: number;
  totalDinheiro: number;
  totalCartao: number;
  totalPix: number;
  caixasAbertos: number;
  caixasFechados: number;
  totalCaixa: number;
  entradasCaixa: number;
  saidasCaixa: number;
  topSellers: { nome: string; total: number }[];
  qtdTxs: number;
}

/** Peças de OS como a página busca (só as colunas usadas no cálculo). */
export type OsItemCost = Pick<ServiceOrderItem, "service_order_id" | "unit_cost" | "quantity">;

export interface PdfKpi { label: string; value: string; color?: [number, number, number] }
export interface PdfCol { label: string; w: number }
