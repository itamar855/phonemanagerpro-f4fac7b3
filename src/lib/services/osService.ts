import { supabase } from "@/integrations/supabase/client";

export const deleteServiceOrder = async (id: string, reason?: string) => {
  const { error } = await supabase.rpc("cancel_service_order" as any, {
    p_service_order_id: id,
    p_reason: reason,
  });
  if (error) throw error;
};

export const updateServiceOrderStore = async (orderId: string, storeId: string) => {
  const { error } = await supabase.from("service_orders").update({ store_id: storeId } as any).eq("id", orderId);
  if (error) throw error;
};

export const getServiceOrdersQuery = () => {
  return supabase.from("service_orders").select("*");
};
