import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useMachines() {
  const [machines, setMachines] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: b }, { data: r }] = await Promise.all([
      supabase.from("machines").select("*").order("position"),
      supabase.from("machine_blocks").select("*").order("seq"),
      supabase.from("machine_reservations").select("*").order("date"),
    ]);
    setMachines(m ?? []);
    setBlocks(b ?? []);
    setReservations(r ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { machines, blocks, reservations, loading, refetch: load };
}

// Reserve hours on a machine for a day (sample, maintenance, trial run).
// Optionally tied to a sales order so samples are official, not just a note.
export async function addReservation({ machine_id, date, hours, kind = "sample", label, so_number, zoho_salesorder_id, style_name }) {
  let sales_order_id = null;
  if (so_number) {
    const { data } = await supabase.from("sales_orders").select("id").eq("so_number", so_number).maybeSingle();
    sales_order_id = data?.id ?? null;
  }
  let style_id = null;
  if (style_name) {
    const { data } = await supabase.from("production_styles").select("id").ilike("name", style_name).limit(1).maybeSingle();
    style_id = data?.id ?? null;
  }
  const { error } = await supabase.from("machine_reservations").insert({
    machine_id, date, hours: Number(hours) || 0, kind, label: label || null,
    so_number: so_number || null, zoho_salesorder_id: zoho_salesorder_id || null, sales_order_id,
    style_name: style_name || null, style_id,
  });
  if (error) throw error;
}

export async function removeReservation(id) {
  const { error } = await supabase.from("machine_reservations").delete().eq("id", id);
  if (error) throw error;
}

export async function setMachineActive(id, active) {
  const { error } = await supabase.from("machines").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function renameMachine(id, name) {
  const { error } = await supabase.from("machines").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function removeBlock(blockId) {
  const { error } = await supabase.from("machine_blocks").delete().eq("id", blockId);
  if (error) throw error;
}

// Mark a block as finished (knitting actually done on the machine floor).
// Unlike removeBlock, this keeps the row — it stops consuming forecast
// machine time going forward, but its qty still counts as already-knitted
// so downstream stages (linking, finishing, ...) don't wait on it forever,
// and it doesn't reappear in Unplaced orders.
export async function completeBlock(blockId) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("machine_blocks")
    .update({ status: "done", completed_at: new Date().toISOString(), completed_by: auth?.user?.id ?? null })
    .eq("id", blockId);
  if (error) throw error;
}

// Pause a block in place — e.g. waiting for customer approval or a spec
// change. Stays visible on its machine (not removed, not re-added to
// Unplaced), and stops consuming forecast machine time until resumed.
export async function holdBlock(blockId, reason) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("machine_blocks")
    .update({ status: "hold", hold_reason: reason || null, held_at: new Date().toISOString(), held_by: auth?.user?.id ?? null })
    .eq("id", blockId);
  if (error) throw error;
}

export async function resumeBlock(blockId) {
  const { error } = await supabase
    .from("machine_blocks")
    .update({ status: "active", hold_reason: null, held_at: null, held_by: null })
    .eq("id", blockId);
  if (error) throw error;
}

// Move a block to the end of another machine's queue.
export async function moveBlock(blockId, newMachineId, newSeq) {
  const { error } = await supabase.from("machine_blocks").update({ machine_id: newMachineId, seq: newSeq }).eq("id", blockId);
  if (error) throw error;
}

export async function setBlockSeq(blockId, seq) {
  const { error } = await supabase.from("machine_blocks").update({ seq }).eq("id", blockId);
  if (error) throw error;
}

// Split a block: keep `keepQty` on the current machine, move the rest to another machine.
// startAfter (optional "YYYY-MM-DD"): earliest date the split-off portion may start —
// use this when the target machine only becomes free later, so the forecast doesn't
// inherit the sales order's original earliest_start date.
export async function splitBlock(block, moveQty, targetMachineId, targetSeq, startAfter) {
  const keep = Number(block.qty) - Number(moveQty);
  if (keep <= 0 || moveQty <= 0) throw new Error("Split quantity must be between 1 and " + (Number(block.qty) - 1));
  const { error: e1 } = await supabase.from("machine_blocks").update({ qty: keep, initial_qty: keep }).eq("id", block.id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("machine_blocks").insert({
    machine_id: targetMachineId, sales_order_id: block.sales_order_id, style_id: block.style_id,
    qty: Number(moveQty), seq: targetSeq ?? 0, start_after: startAfter || null,
  });
  if (e2) throw e2;
}

// Manually place a single order onto a machine's queue (no auto-fill / no reshuffle).
export async function addBlock(machineId, soId, styleId, qty, seq) {
  const { error } = await supabase.from("machine_blocks").insert({
    machine_id: machineId, sales_order_id: soId, style_id: styleId, qty, seq: seq ?? 0,
  });
  if (error) throw error;
}

// Auto-fill the board: clear existing blocks and spread machine-knit orders across
// the least-loaded active machines of each gauge, by due date.
export async function autoFillBoard(salesOrders, styles, machines) {
  // Only clear ACTIVE blocks — done/hold blocks are a real production record
  // (or a deliberate pause) and must survive Auto-fill.
  const { data: existing } = await supabase.from("machine_blocks").select("id, sales_order_id, style_id, qty, status");
  const activeIds = (existing || []).filter((b) => (b.status || "active") === "active").map((b) => b.id);
  if (activeIds.length) {
    const { error: delErr } = await supabase.from("machine_blocks").delete().in("id", activeIds);
    if (delErr) throw delErr;
  }
  // Qty already covered by a done/hold block must not be scheduled again.
  const alreadyPlaced = {};
  (existing || []).forEach((b) => {
    if ((b.status || "active") === "active") return;
    const k = `${b.sales_order_id}:${b.style_id}`;
    alreadyPlaced[k] = (alreadyPlaced[k] || 0) + (Number(b.qty) || 0);
  });

  // machine-knit jobs
  const jobs = [];
  salesOrders.forEach((so) => {
    if (so.status === "cancelled" || so.status === "done") return;
    const byStyle = {};
    (so.sales_order_lines || []).forEach((l) => {
      const st = styles[l.style_id];
      if (!st || st.method !== "machine") return;
      if (!byStyle[l.style_id]) byStyle[l.style_id] = { qty: 0, assigned: null };
      byStyle[l.style_id].qty += Number(l.quantity) || 0;
      if (l.assigned_machines != null) byStyle[l.style_id].assigned = l.assigned_machines;
    });
    Object.entries(byStyle).forEach(([styleId, info]) => {
      const st = styles[styleId];
      const already = alreadyPlaced[`${so.id}:${styleId}`] || 0;
      const qty = info.qty - already;
      if (qty <= 0) return;
      jobs.push({ soId: so.id, styleId, gauge: st.gauge, rate: Number(st.knitting_machine) || 1, qty, assigned: info.assigned, due: so.due_date || "9999-99-99" });
    });
  });
  jobs.sort((a, b) => a.due.localeCompare(b.due));

  // machine load tracker per gauge
  const byGauge = {};
  machines.filter((m) => m.active).forEach((m) => { (byGauge[m.gauge] = byGauge[m.gauge] || []).push({ id: m.id, load: 0, queued: 0 }); });

  const rows = [];
  jobs.forEach((j) => {
    const pool = byGauge[j.gauge] || [];
    if (pool.length === 0) return; // no active machine of this gauge — order left unplaced
    const n = Math.max(1, Math.min(j.assigned || 1, pool.length));
    // pick n least-loaded machines
    const chosen = [...pool].sort((a, b) => a.load - b.load).slice(0, n);
    const base = Math.floor(j.qty / n);
    chosen.forEach((mc, i) => {
      const q = i === n - 1 ? j.qty - base * (n - 1) : base;
      if (q <= 0) return;
      rows.push({ machine_id: mc.id, sales_order_id: j.soId, style_id: j.styleId, seq: mc.queued, qty: q });
      mc.queued += 1;
      mc.load += q / j.rate;
    });
  });

  if (rows.length) {
    const { error } = await supabase.from("machine_blocks").insert(rows);
    if (error) throw error;
  }
  return rows.length;
}
