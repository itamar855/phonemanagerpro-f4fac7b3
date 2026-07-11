import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;
type Sale = any;

const emptyCustomerForm = { name: "", phone: "", cpf: "", address: "", email: "", birth: "" };

export const useCustomerManager = (customers: Customer[], activeStoreId: string | null, user: any, setLoading: (loading: boolean) => void, onCustomerCreated?: (customer: Customer) => void) => {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(emptyCustomerForm);
  const [customerSalesHistory, setCustomerSalesHistory] = useState<Sale[]>([]);

  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); return; }
    const q = customerSearch.toLowerCase();
    setCustomerResults(
      customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(customerSearch)) ||
        (c.cpf && c.cpf.includes(customerSearch))
      ).slice(0, 5)
    );
  }, [customerSearch, customers]);

  const selectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setCustomerResults([]);
    setShowNewCustomerForm(false);
    
    const storeFilter = activeStoreId && activeStoreId !== "all" ? activeStoreId : null;
    let histQuery = supabase.from("sales").select("*")
      .or(`customer_id.eq.${c.id},customer_phone.eq.${c.phone ?? ""}`);
    if (storeFilter) histQuery = histQuery.eq("store_id", storeFilter);
    const { data } = await histQuery.order("created_at", { ascending: false }).limit(5);
    setCustomerSalesHistory((data as unknown as Sale[]) ?? []);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerSalesHistory([]);
    setShowCustomerHistory(false);
  };

  const handleCreateCustomer = async () => {
    if (!user || !newCustomerForm.name) return;
    setLoading(true);
    const { data, error } = await supabase.from("customers").insert({
      name: newCustomerForm.name, phone: newCustomerForm.phone || null,
      cpf: newCustomerForm.cpf || null, address: newCustomerForm.address || null,
      email: newCustomerForm.email || null, created_by: user.id
    }).select().single();
    
    if (error) {
      toast.error(`Erro ao criar cliente: ${error.message}`);
    } else {
      toast.success("Cliente criado!");
      setNewCustomerForm(emptyCustomerForm);
      setShowNewCustomerForm(false);
      selectCustomer(data as Customer);
      if (onCustomerCreated) onCustomerCreated(data as Customer);
    }
    setLoading(false);
  };

  return {
    customerSearch, setCustomerSearch,
    customerResults, setCustomerResults,
    selectedCustomer, setSelectedCustomer,
    showCustomerHistory, setShowCustomerHistory,
    showNewCustomerForm, setShowNewCustomerForm,
    newCustomerForm, setNewCustomerForm,
    customerSalesHistory, setCustomerSalesHistory,
    selectCustomer, clearCustomer, handleCreateCustomer
  };
};
