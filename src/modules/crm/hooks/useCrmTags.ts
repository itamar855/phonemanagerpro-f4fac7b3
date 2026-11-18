import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTags } from "../api/tags";
import { tagColorMap, tagKey } from "../lib/labels";

export const crmTagsKey = ["crm", "tags"] as const;

/** Etiquetas prontas (todas as lojas acessíveis) e a busca de cor por loja + nome. */
export function useCrmTags() {
  const q = useQuery({ queryKey: crmTagsKey, queryFn: listTags, staleTime: 10 * 60_000 });
  const tags = useMemo(() => q.data ?? [], [q.data]);
  const colors = useMemo(() => tagColorMap(tags), [tags]);
  const colorOf = (storeId: string, name: string) => colors.get(tagKey(storeId, name)) ?? null;
  return { tags, colorOf, loading: q.isLoading };
}
