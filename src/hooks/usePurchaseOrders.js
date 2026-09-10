import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function usePurchaseOrders({ projectId } = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("purchase_orders")
      .select("*, file:project_files(id, file_name, storage_path)")
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    setOrders(data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  return { orders, loading, refetch: fetchOrders };
}

export async function createPurchaseOrder(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseOrder(id, payload) {
  const { data, error } = await supabase
    .from("purchase_orders").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePurchaseOrder(id) {
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) throw error;
}
