import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invokeFn } from "../api/db";
import { avatarUsable } from "../lib/avatar";

type Row = { id: string; phone: string | null; avatar_url: string | null };

// Contatos já pedidos nesta sessão do navegador (o servidor ainda limita a 1 consulta/dia por contato)
const asked = new Set<string>();

/**
 * Pede ao servidor a foto de perfil do WhatsApp dos contatos na tela que estão
 * sem foto ou com o link vencido. Não bloqueia nada: a foto aparece quando chega.
 */
export function useAvatarRefresh(rows: Row[], storeId: string | null) {
  const qc = useQueryClient();
  const ids = useMemo(
    () => rows.filter((r) => r.phone && !avatarUsable(r.avatar_url) && !asked.has(r.id)).map((r) => r.id).slice(0, 40),
    [rows],
  );
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    const t = setTimeout(() => {
      list.forEach((id) => asked.add(id));
      invokeFn<{ updated: number }>("crm-channel", { action: "refresh-avatars", contact_ids: list, storeId })
        .then((r) => {
          if (!r?.updated) return;
          for (const k of ["conversations", "conversation", "contacts", "contact", "board"]) qc.invalidateQueries({ queryKey: ["crm", k] });
        })
        .catch(() => { /* WhatsApp fora do ar: mostra as iniciais */ });
    }, 800);
    return () => clearTimeout(t);
  }, [key, storeId, qc]);
}
