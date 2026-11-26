import { supabase } from "@/integrations/supabase/client";

export const triggerWebhook = async (eventType: string, storeId: string, payload) => {
  try {
    const { data: webhooks } = await supabase
      .from("webhooks")
      .select("url")
      .eq("store_id", storeId)
      .eq("event_type", eventType)
      .eq("is_active", true);

    if (!webhooks || webhooks.length === 0) return;

    // Fire all webhooks asynchronously without blocking the UI
    webhooks.forEach(async (webhook) => {
      try {
        await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "no-cors", // Prevent CORS issues blocking the UI
          body: JSON.stringify({
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload,
          }),
        });
      } catch (err) {
        console.error("Webhook trigger failed for", webhook.url, err);
      }
    });
  } catch (error) {
    console.error("Error fetching webhooks:", error);
  }
};
