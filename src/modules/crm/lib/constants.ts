import type { Channel, OriginChannel } from "./types";

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", instagram: "Instagram" };

export const ORIGIN_LABEL: Record<OriginChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  manual: "Manual",
  os_vendas: "OS / Vendas",
  import: "Importado",
};
