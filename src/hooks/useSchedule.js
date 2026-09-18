import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { poTukangClient } from "@/lib/supabasePoTukang";
import { computeSchedule, makeCalendar } from "@/lib/scheduler";
import { computeBlockActuals } from "@/lib/dynamicBoard";
import { resourcesToMap } from "@/hooks/useResources";
import { todayLocalStr } from "@/lib/utils";

const RATE_FIELDS = ["knitting_manual", "knitting_machine", "linking", "finishing", "steam", "label", "qc", "packing"];

function stylesToMap(rows) {
  const map = {};
  rows.forEach((s) => {
    map[s.id] = { name: s.name || "", method: s.knitting_method || "manual", gauge: s.knitting_gauge || null, wastage: Number(s.yarn_wastage_pct) || 0, skipStages: Array.isArray(s.skip_stages) ? s.skip_stages : [] };
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
    if (so.status === "cancelled" || so.status === "done" || so.archived) return;
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

  // A tab can be left open for hours (common on production-floor devices).
  // Without this, its view of machine_blocks/sales_orders/etc. only ever
  // updates from a LOCAL action (a button click that calls refetch()) —
  // changes made from any OTHER session (another tab, another device)
  // never arrive until someone manually reloads. That staleness is
  // harmless for most pages, but dangerous for anything that acts
  // automatically on this data (e.g. Machine Board's dynamic-tracking
  // auto-complete) — a decision made from hours-old data can be wrong even
  // though the logic itself is correct. Poll periodically so the window is
  // never more than a couple of minutes.
  useEffect(() => {
    const id = setInterval(() => { load(); }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Real knitting pace (from PO Tukang, cross-project) feeds into the
  // SHARED forecast so every page reflects reality, not just the static
  // plan — this is what previously only Machine Board itself knew about.
  // Deliberately NOT on the 2-minute poll: it's a separate project, so
  // refreshing it that often would add real network cost for something
  // that doesn't change minute to minute. Fetched once when data first
  // loads, plus on demand via refetchDynamic() (a manual "Refresh" button).
  const [dynamicInfo, setDynamicInfo] = useState({});
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const dynamicLoadedRef = useRef(false);

  const loadDynamic = useCallback(async () => {
    if (!raw) return;
    const soById = {}; raw.salesOrders.forEach((so) => { soById[so.id] = so; });
    const soNumbers = [...new Set(raw.blocks.map((b) => soById[b.sales_order_id]?.so_number).filter(Boolean))];
    if (soNumbers.length === 0) { setDynamicInfo({}); return; }
    setDynamicLoading(true);
    try {
      const { data, error } = await poTukangClient.from("po_style_actuals").select("so, tgl, mesin, style_raw, aktual").in("so", soNumbers);
      if (error) throw error;
      const calendar = makeCalendar({ sundayOff: raw.settings?.sunday_off ?? true, saturdayOff: raw.settings?.saturday_off ?? false, holidays: raw.holidays || [] });
      const enrichedBlocks = raw.blocks.map((b) => ({
        ...b,
        _soNumber: soById[b.sales_order_id]?.so_number || null,
        _planRate: raw.styles?.[b.style_id]?.knitting_machine || 0,
      }));
      setDynamicInfo(computeBlockActuals({ blocks: enrichedBlocks, stylesById: raw.styles, actualRows: data || [], calendar, today: todayLocalStr() }));
    } catch {
      // leave dynamicInfo as-is — the schedule just falls back to the static plan
    } finally {
      setDynamicLoading(false);
    }
  }, [raw]);

  useEffect(() => {
    if (raw && !dynamicLoadedRef.current) {
      dynamicLoadedRef.current = true;
      loadDynamic();
    }
  }, [raw, loadDynamic]);

  // raw.blocks with active blocks' qty swapped for real remaining qty where
  // we have PO Tukang data for them — this is what actually makes the
  // forecast reflect reality. A block with no real data yet keeps its
  // planned qty (falls back to the static plan, same as always).
  const effectiveBlocks = raw ? raw.blocks.map((b) => {
    if ((b.status || "active") !== "active") return b;
    const info = dynamicInfo[b.id];
    if (!info) return b;
    return { ...b, qty: Math.max(0, Math.ceil(info.remainingQty)) };
  }) : [];

  // The portion of an active block's qty already confirmed by PO Tukang —
  // reducing the block's own qty to "remaining" (above) only tells the
  // simulation about future capacity; without this credit the already-
  // produced portion would be forgotten and the job would never reach its
  // full original quantity.
  const extraKnittingCredit = {};
  (raw?.blocks || []).forEach((b) => {
    if ((b.status || "active") !== "active") return;
    const info = dynamicInfo[b.id];
    if (!info) return;
    const k = `${b.sales_order_id}:${b.style_id}`;
    extraKnittingCredit[k] = (extraKnittingCredit[k] || 0) + info.deliveredQty;
  });

  const today = todayLocalStr();

  const schedule = useMemo(() => {
    if (!raw) return null;
    const jobs = buildJobs(raw.salesOrders, raw.styles);
    return computeSchedule({
      jobs, resources: raw.resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: effectiveBlocks, reservations: raw.reservations, extraKnittingCredit,
    });
  }, [raw, today, effectiveBlocks, extraKnittingCredit]);

  // What-if: recompute with a single SO's earliest start overridden.
  const runWhatIf = useCallback((soId, earliestStart, priorityMode) => {
    if (!raw) return null;
    const orders = raw.salesOrders.map((so) => so.id === soId ? { ...so, earliest_start: earliestStart } : so);
    const jobs = buildJobs(orders, raw.styles);
    const res = computeSchedule({
      jobs, resources: raw.resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: priorityMode || raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: effectiveBlocks, reservations: raw.reservations, extraKnittingCredit,
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
      machines: raw.machines, blocks: effectiveBlocks, reservations: raw.reservations, extraKnittingCredit,
    });
  }, [raw, today]);

  // What-if: recompute with machine assignments overridden { `${soId}:${styleId}`: machines }.
  const runMachineWhatIf = useCallback((override = {}) => {
    if (!raw) return null;
    const jobs = buildJobs(raw.salesOrders, raw.styles, override);
    return computeSchedule({
      jobs, resources: raw.resources, settings: raw.settings,
      holidays: raw.holidays, today, priorityMode: raw.settings.priority_mode || "fifo",
      machines: raw.machines, blocks: effectiveBlocks, reservations: raw.reservations, extraKnittingCredit,
    });
  }, [raw, today]);

  return {
    schedule, raw, loading, refetch: load, runWhatIf, runCapacityWhatIf, runMachineWhatIf, runKnittingWhatIf: runMachineWhatIf,
    dynamic: dynamicInfo, dynamicLoading, refetchDynamic: loadDynamic,
  };
}
