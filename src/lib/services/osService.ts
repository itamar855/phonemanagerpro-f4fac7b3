import { supabase } from "@/integrations/supabase/client";

export const deleteServiceOrder = async (id: string) => {
  const { error } = await supabase.from("service_orders").delete().eq("id", id);
  if (error) throw error;
};

export const updateServiceOrderStore = async (orderId: string, storeId: string) => {
  const { error } = await supabase.from("service_orders").update({ store_id: storeId } as any).eq("id", orderId);
  if (error) throw error;
};

export const getServiceOrdersQuery = () => {
  return supabase.from("service_orders").select("*");
};
