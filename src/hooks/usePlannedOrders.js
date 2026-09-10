import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function usePlannedOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("planned_orders")
      .select("*, customers(customer_name), production_styles(name)")
      .order("sequence");
    setOrders(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  return { orders, loading, refetch: fetchOrders };
}

export async function createPlannedOrder(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("planned_orders").insert({
    order_code: payload.order_code || null,
    customer_id: payload.customer_id || null,
    project_id: payload.project_id || null,
    style_id: payload.style_id,
    quantity: Number(payload.quantity),
    earliest_start: payload.earliest_start || null,
    due_date: payload.due_date || null,
    status: payload.status || "planned",
    created_by: user?.id,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlannedOrder(id, payload) {
  const row = {};
  ["order_code", "customer_id", "project_id", "style_id", "earliest_start", "due_date", "status"].forEach((k) => {
    if (k in payload) row[k] = payload[k] || null;
  });
  if ("quantity" in payload) row.quantity = Number(payload.quantity);
  const { data, error } = await supabase.from("planned_orders").update(row).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlannedOrder(id) {
  const { error } = await supabase.from("planned_orders").delete().eq("id", id);
  if (error) throw error;
}

// Shape DB rows into the scheduler's expected order objects.
export function toSchedulerOrders(rows) {
  return rows.map((o) => ({
    id: o.id,
    sequence: o.sequence,
    orderCode: o.order_code || o.id.slice(0, 8),
    customerName: o.customers?.customer_name || "—",
    styleName: o.production_styles?.name || "—",
    styleId: o.style_id,
    quantity: o.quantity,
    earliestStart: o.earliest_start,
    dueDate: o.due_date,
    status: o.status,
  }));
}
