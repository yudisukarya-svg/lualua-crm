import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { computeSchedule } from "@/lib/scheduler";
import { resourcesToMap } from "@/hooks/useResources";

const RATE_FIELDS = ["knitting_manual", "knitting_machine", "linking", "finishing", "steam", "label", "qc", "packing"];

function stylesToMap(rows) {
  const map = {};
  rows.forEach((s) => {
    map[s.id] = { name: s.name || "", method: s.knitting_method || "manual", gauge: s.knitting_gauge || null, wastage: Number(s.yarn_wastage_pct) || 0 };
    RATE_FIELDS.forEach((f) => { map[s.id][f] = Number(s[f]) || 0; });
  });
  return map;
}

// Build scheduler "jobs": one stream per distinct style within each sales order.
// override: optional { [`${soId}:${styleId}`]: count } to preview a resource choice
// (applied to machines for machine styles, workers for manual styles).
export function buildJobs(salesOrders, stylesMap, override = {}) {
  const jobs = [];
  salesOrders.forEach((so) => {
    const byStyle = {};
    (so.sales_order_lines || []).forEach((l) => {
      if (!l.style_id) return;
      if (!byStyle[l.style_id]) byStyle[l.style_id] = { qty: 0, name: l.production_styles?.name || "—", machines: null, workers: null };
      byStyle[l.style_id].qty += (Number(l.quantity) || 0);
      if (l.assigned_machines != null) byStyle[l.style_id].machines = Math.max(byStyle[l.style_id].machines ?? 0, l.assigned_machines);
      if (l.assigned_workers != null) byStyle[l.style_id].workers = Math.max(byStyle[l.style_id].workers ?? 0, l.assigned_workers);
    });
    Object.entries(byStyle).forEach(([styleId, info]) => {
      const style = stylesMap[styleId];
      if (!style || info.qty <= 0) return;
      const key = `${so.id}:${styleId}`;
      let assignedMachines = info.machines, assignedWorkers = info.workers;
      if (key in override) {
        if (style.method === "machine") assignedMachines = override[key];
        else assignedWorkers = override[key];
      }
      jobs.push({
        id: key, soId: so.id, soNumber: so.so_number,
        customerName: so.customers?.customer_name || "—", styleName: info.name,
        sequence: so.sequence, priority: so.priority, dueDate: so.due_date, earliestStart: so.earliest_start,
        quantity: info.qty, style, status: so.status,
        assignedMachines, assignedWorkers,
      });
    });
  });
  return jobs;
}

export function useSchedule() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [resR, styR, setR, holR, soR, macR, blkR, mresR] = await Promise.all([
      supabase.from("production_resources").select("*"),
      supabase.from("production_styles").select("*"),
      supabase.from("planning_settings").select("*").eq("id", 1).single(),
      supabase.from("planning_holidays").select("*"),
      supabase.from("sales_orders").select("*, customers(customer_name), sales_order_lines(*, production_styles(name))").order("sequence"),
      supabase.from("machines").select("*").order("position"),
      supabase.from("machine_blocks").select("*").order("seq"),
      supabase.from("machine_reservations").select("*").order("date"),
    ]);
    setRaw({
      resources: resourcesToMap(resR.data ?? []),
      styles: stylesToMap(styR.data ?? []),
      settings: setR.data ?? { sunday_off: true, saturday_off: false, priority_mode: "fifo" },
      holidays: (holR.data ?? []).map((h) => h.date),
      salesOrders: soR.data ?? [],
      machines: macR.data ?? [],
      blocks: blkR.data ?? [],
      reservations: mresR.data ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const schedule = useMemo(() => {
    if (!raw) return null;
    const jobs = buildJobs(raw.salesOrders, raw.styles);
    return computeSchedule({
      jobs, resources: raw.resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: raw.blocks, reservations: raw.reservations,
    });
  }, [raw, today]);

  // What-if: recompute with a single SO's earliest start overridden.
  const runWhatIf = useCallback((soId, earliestStart, priorityMode) => {
    if (!raw) return null;
    const orders = raw.salesOrders.map((so) => so.id === soId ? { ...so, earliest_start: earliestStart } : so);
    const jobs = buildJobs(orders, raw.styles);
    const res = computeSchedule({
      jobs, resources: raw.resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: priorityMode || raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: raw.blocks, reservations: raw.reservations,
    });
    return res.orders.find((o) => o.id === soId) || null;
  }, [raw, today]);

  // What-if: recompute with extra workers added to one or more stage pools.
  // extra: { knitting_manual?, knitting_machine?, linking?, ... } of additional counts.
  const runCapacityWhatIf = useCallback((extra = {}) => {
    if (!raw) return null;
    const resources = { ...raw.resources };
    Object.entries(extra).forEach(([k, v]) => { resources[k] = (resources[k] || 0) + (Number(v) || 0); });
    const jobs = buildJobs(raw.salesOrders, raw.styles);
    return computeSchedule({
      jobs, resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: raw.blocks, reservations: raw.reservations,
    });
  }, [raw, today]);

  // What-if: recompute with machine assignments overridden { `${soId}:${styleId}`: machines }.
  const runMachineWhatIf = useCallback((override = {}) => {
    if (!raw) return null;
    const jobs = buildJobs(raw.salesOrders, raw.styles, override);
    return computeSchedule({
      jobs, resources: raw.resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: raw.blocks, reservations: raw.reservations,
    });
  }, [raw, today]);

  return { schedule, raw, loading, refetch: load, runWhatIf, runCapacityWhatIf, runMachineWhatIf, runKnittingWhatIf: runMachineWhatIf };
}
