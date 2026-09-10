import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const SELECT = "*, customers(customer_name), projects(project_name), sales_order_lines(*, production_styles(name))";

export function useSalesOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sales_orders").select(SELECT).order("sequence");
    setOrders(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  return { orders, loading, refetch: fetchOrders };
}

// payload: { so_number, customer_id, earliest_start, due_date, priority, status, notes, lines:[{style_id,colour,size,quantity}] }
export async function createSalesOrder(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: so, error } = await supabase.from("sales_orders").insert({
    so_number: payload.so_number,
    customer_id: payload.customer_id || null,
    project_id: payload.project_id || null,
    earliest_start: payload.earliest_start || null,
    due_date: payload.due_date || null,
    customer_deadline: payload.customer_deadline || null,
    priority: Number(payload.priority) || 100,
    status: payload.status || "planned",
    notes: payload.notes || null,
    created_by: user?.id,
  }).select().single();
  if (error) throw error;
  await replaceLines(so.id, payload.lines);
  return so;
}

export async function updateSalesOrder(id, payload) {
  const { error } = await supabase.from("sales_orders").update({
    so_number: payload.so_number,
    customer_id: payload.customer_id || null,
    project_id: payload.project_id || null,
    earliest_start: payload.earliest_start || null,
    due_date: payload.due_date || null,
    customer_deadline: payload.customer_deadline || null,
    priority: Number(payload.priority) || 100,
    status: payload.status || "planned",
    notes: payload.notes || null,
  }).eq("id", id);
  if (error) throw error;
  await replaceLines(id, payload.lines);
}

async function replaceLines(soId, lines = []) {
  await supabase.from("sales_order_lines").delete().eq("sales_order_id", soId);
  const rows = lines
    .filter((l) => l.style_id && Number(l.quantity) > 0)
    .map((l) => ({
      sales_order_id: soId,
      style_id: l.style_id,
      colour: l.colour || null,
      size: l.size || null,
      quantity: Number(l.quantity),
      assigned_machines: l.assigned_machines ?? null,
    }));
  if (rows.length) {
    const { error } = await supabase.from("sales_order_lines").insert(rows);
    if (error) throw error;
  }
}

// Set the machine assignment for every line of one style within a sales order.
export async function setJobMachines(soId, styleId, machines) {
  const value = machines === "" || machines == null ? null : Number(machines);
  const { error } = await supabase
    .from("sales_order_lines")
    .update({ assigned_machines: value })
    .eq("sales_order_id", soId)
    .eq("style_id", styleId);
  if (error) throw error;
}

// Set the manual-worker assignment for every line of one style within a sales order.
export async function setJobWorkers(soId, styleId, workers) {
  const value = workers === "" || workers == null ? null : Number(workers);
  const { error } = await supabase
    .from("sales_order_lines")
    .update({ assigned_workers: value })
    .eq("sales_order_id", soId)
    .eq("style_id", styleId);
  if (error) throw error;
}

export async function deleteSalesOrder(id) {
  const { error } = await supabase.from("sales_orders").delete().eq("id", id);
  if (error) throw error;
}

// Production-readiness checklist items (a gate before an order should start).
export const READINESS_ITEMS = [
  { key: "sample_approved", label: "Sample approved" },
  { key: "po_received", label: "Customer PO received" },
  { key: "yarn_ready", label: "Yarn ready" },
  { key: "spec_ready", label: "Spec / tech pack complete" },
];

export async function saveReadiness(soId, readiness) {
  const { error } = await supabase.from("sales_orders").update({ readiness }).eq("id", soId);
  if (error) throw error;
}

// NOTE: manual per-stage progress entry (saveProgress) was removed — actual
// progress now syncs automatically from confirmed tukang handovers (PO
// Tukang). See src/hooks/useActualProgress.js and
// src/hooks/useProjectActualProgress.js.

// Archive hides a finished order from the main Planning list without
// deleting it — nothing else about the order changes. Unarchive brings it
// back. Both are simple, reversible flag flips.
export async function archiveSalesOrder(id) {
  const { error } = await supabase.from("sales_orders").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

export async function unarchiveSalesOrder(id) {
  const { error } = await supabase.from("sales_orders").update({ archived: false }).eq("id", id);
  if (error) throw error;
}
