import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useShipments({ projectId, salesOrderId } = {}) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("shipments")
      .select(
        "*, invoice:project_files!shipments_invoice_file_id_fkey(id, file_name, storage_path)," +
        " packing:project_files!shipments_packing_list_file_id_fkey(id, file_name, storage_path)"
      )
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    if (salesOrderId) q = q.eq("sales_order_id", salesOrderId);
    const { data } = await q;
    setShipments(data ?? []);
    setLoading(false);
  }, [projectId, salesOrderId]);

  useEffect(() => { fetchShipments(); }, [fetchShipments]);
  return { shipments, loading, refetch: fetchShipments };
}

export async function createShipment(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("shipments")
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateShipment(id, payload) {
  const { data, error } = await supabase
    .from("shipments").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteShipment(id) {
  const { error } = await supabase.from("shipments").delete().eq("id", id);
  if (error) throw error;
}

// Total pieces already dispatched for a sales order, across all its shipments.
export async function getDispatchedQty(soId) {
  const { data, error } = await supabase.from("shipments").select("qty").eq("sales_order_id", soId);
  if (error) throw error;
  return (data || []).reduce((n, r) => n + (Number(r.qty) || 0), 0);
}

// One-step dispatch from Planning: creates the shipment record for `qty` pieces of this
// order, and — once the running total reaches the order's full quantity — marks the
// order "done" and (if linked) the project "shipped". Partial dispatches just add up;
// status is left alone until the order is fully dispatched.
export async function dispatchFromPacking(order, payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const totalQty = (order.sales_order_lines || []).reduce((n, l) => n + (l.quantity || 0), 0);
  const already = await getDispatchedQty(order.id);

  const { data, error } = await supabase.from("shipments").insert({
    sales_order_id: order.id,
    project_id: order.project_id || null,
    customer_id: order.customer_id || null,
    qty: Number(payload.qty) || 0,
    shipping_date: payload.shipping_date || null,
    courier: payload.courier || null,
    tracking_number: payload.tracking_number || null,
    destination_country: payload.destination_country || null,
    status: "pending",
    created_by: user?.id,
  }).select().single();
  if (error) throw error;

  const nowDispatched = already + (Number(payload.qty) || 0);
  if (nowDispatched >= totalQty && totalQty > 0) {
    await supabase.from("sales_orders").update({ status: "done" }).eq("id", order.id);
    if (order.project_id) {
      await supabase.from("projects").update({ status: "shipped", progress: 100 }).eq("id", order.project_id);
    }
  }
  return { shipment: data, dispatchedQty: nowDispatched, totalQty };
}
