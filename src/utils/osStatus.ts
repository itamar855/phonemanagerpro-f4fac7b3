import { Clock, AlertCircle, Package, Wrench, CheckCircle2 } from "lucide-react";

export interface StatusConfigItem {
  label: string;
  color: string;
  icon: any;
}

export const OS_STATUS_CONFIG: Record<string, StatusConfigItem> = {
  open: {
    label: "Aberta",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    icon: Clock,
  },
  analyzing: {
    label: "Em Análise",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    icon: AlertCircle,
  },
  waiting_part: {
    label: "Aguardando Peça",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    icon: Package,
  },
  repairing: {
    label: "Em Reparo",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    icon: Wrench,
  },
  waiting_approval: {
    label: "Aguardando Aprovação",
    color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    icon: AlertCircle,
  },
  ready: {
    label: "Pronta p/ Retirada",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    icon: CheckCircle2,
  },
  delivered: {
    label: "Entregue",
    color: "bg-muted text-muted-foreground border-border",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-destructive/15 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
};

export const ALL_OS_STATUSES = Object.keys(OS_STATUS_CONFIG);

export const getStatusLabel = (status: string): string => {
  return OS_STATUS_CONFIG[status]?.label || status;
};

export const getStatusColor = (status: string): string => {
  return OS_STATUS_CONFIG[status]?.color || "bg-muted text-muted-foreground border-border";
};
