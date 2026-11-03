// =============================================================================
// quoteSim.js — "If a customer places this order today, when can we finish?"
//
// Runs the SAME forecast engine as Planning / Machine Board, with one
// imaginary order added. Nothing is saved.
//
// Rules (agreed with Yudi):
//  - Queue: with a requested deadline, the new order waits behind every order
//    due on/before that deadline, and goes ahead of orders due later (or with
//    no due date). Without a deadline it goes behind everything. On each
//    machine it is placed after the last block of an earlier-due order.
//    Existing orders whose finish would move later are listed.
//  - Production can't start before: today + sampling days + yarn days
//    (working days, per the Planning calendar).
//  - Quoted date = forecast finish + safety margin (working days).
//  - Machine-knit orders: one option per number of machines (1, 2, 3 ...),
//    using the machines of that gauge that become free earliest.
// =============================================================================
import { computeSchedule, makeCalendar, STAGES } from "@/lib/scheduler";

export const QUOTE_ID = "__quote__";

const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);

// n working days after `from` (n = 0 → `from` itself, or the next working day).
export function addWorkingDays(calendar, from, n) {
  let d = calendar.next(toDate(from));
  for (let i = 0; i < (Number(n) || 0); i++) d = calendar.next(new Date(d.getTime() + 86400000));
  return fmt(d);
}

// Typical (median) pcs/day per worker for each later stage, from existing styles —
// used to pre-fill the quote form.
export function typicalStageRates(stylesMap) {
  const out = {};
  ["linking", "finishing", "steam", "label", "qc", "packing"].forEach((f) => {
    const vals = Object.values(stylesMap || {}).map((s) => Number(s[f]) || 0).filter((v) => v > 0).sort((a, b) => a - b);
    out[f] = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  });
  return out;
}

// raw: useSchedule raw data. effectiveBlocks / extraKnittingCredit / stageCredit
// builder: exactly what the live forecast uses. input: the quote form.
export function simulateQuote({ raw, today, buildJobs, effectiveBlocks, extraKnittingCredit, makeStageCredit, input }) {
  const settings = raw.settings || {};
  const calendar = makeCalendar({ sundayOff: settings.sunday_off ?? true, saturdayOff: settings.saturday_off ?? false, holidays: raw.holidays || [] });
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));
  const isMachine = input.method === "machine";
  const gauge = isMachine ? String(input.gauge || "") : null;
  const r = input.rates || {};

  const earliestStart = addWorkingDays(calendar, today, (Number(input.samplingDays) || 0) + (Number(input.yarnDays) || 0));

  const style = {
    name: "New order (quote)", method: isMachine ? "machine" : "manual", gauge, wastage: 0,
    skipStages: input.skipStages || [],
    knitting_machine: isMachine ? Number(r.knitting) || 0 : 0,
    knitting_manual: isMachine ? 0 : Number(r.knitting) || 0,
    linking: Number(r.linking) || 0, finishing: Number(r.finishing) || 0, steam: Number(r.steam) || 0,
    label: Number(r.label) || 0, qc: Number(r.qc) || 0, packing: Number(r.packing) || 0,
  };
  const styles = { ...raw.styles, [QUOTE_ID]: style };
  const quoteSo = {
    id: QUOTE_ID, so_number: "NEW ORDER", status: "planned", archived: false,
    sequence: 1e9, priority: 1e9, due_date: input.deadline || null, earliest_start: earliestStart,
    customers: { customer_name: "New customer" },
    sales_order_lines: [{ style_id: QUOTE_ID, quantity: qty, production_styles: { name: style.name } }],
  };

  const run = (orders, blocks) => {
    const jobs = buildJobs(orders, styles);
    return computeSchedule({
      jobs, resources: raw.resources, settings, holidays: raw.holidays, today,
      priorityMode: settings.priority_mode || "fifo",
      machines: raw.machines, blocks, reservations: raw.reservations, extraKnittingCredit,
      stageCredit: makeStageCredit(jobs),
      dueCutoff: input.deadline ? { soId: QUOTE_ID, deadline: input.deadline } : null,
    });
  };

  const baseline = run(raw.salesOrders, effectiveBlocks);
  const baseDates = {}; baseline.orders.forEach((o) => { baseDates[o.id] = o.completionDate; });

  const problems = [];
  if (qty <= 0) problems.push("Enter a quantity.");
  if (!(Number(r.knitting) > 0)) problems.push("Enter the knitting speed (pcs/day).");
  STAGES.filter((s) => s !== "knitting" && !style.skipStages.includes(s)).forEach((s) => {
    if (!(style[s] > 0)) problems.push(`Speed for ${s} is 0 — enter it, or tick it as skipped.`);
    if (!((raw.resources || {})[s] > 0)) problems.push(`No ${s} workers in Resources — this stage can't run.`);
  });

  // Machines of this gauge, earliest-free first (from the baseline forecast).
  const soDue = {}; (raw.salesOrders || []).forEach((so) => { soDue[so.id] = so.due_date || null; });
  const isEarly = (soId) => !!(input.deadline && soDue[soId] && soDue[soId] <= input.deadline);
  let candidates = [];
  if (isMachine) {
    // Per machine: the new block goes after the last block of an earlier-due
    // order (or at the end when there's no deadline). "Free from" = when the
    // block just before that slot finishes in today's forecast.
    const byMachine = {};
    (baseline.board || []).forEach((b) => { (byMachine[b.machineId] = byMachine[b.machineId] || []).push(b); });
    const slot = {}, freeFrom = {};
    (raw.machines || []).forEach((m) => {
      const q = byMachine[m.id] || [];
      let pos = q.length;
      if (input.deadline) { pos = 0; q.forEach((b, i) => { if (isEarly(b.soId)) pos = i + 1; }); }
      slot[m.id] = pos;
      freeFrom[m.id] = pos > 0 ? (q[pos - 1].finish || "9999-12-31") : null; // a block that never finishes keeps the machine busy
    });
    candidates = (raw.machines || []).filter((m) => m.active && String(m.gauge) === gauge)
      .map((m) => ({ ...m, freeFrom: freeFrom[m.id], slot: slot[m.id] }))
      .sort((a, b) => (a.freeFrom || "").localeCompare(b.freeFrom || "") || (a.position ?? 0) - (b.position ?? 0));
    if (candidates.length === 0) problems.push(`No active ${gauge}G machines.`);
  }
  if (problems.length) return { earliestStart, problems, options: [], candidates };

  const optionFor = (chosen) => {
    let blocks = effectiveBlocks;
    if (chosen) {
      const per = Math.floor(qty / chosen.length);
      let extra = qty - per * chosen.length;
      blocks = [...effectiveBlocks];
      chosen.forEach((m, i) => {
        // active queue on this machine in board order; slot the new block in
        const queue = effectiveBlocks.filter((b) => b.machine_id === m.id && (b.status || "active") === "active").sort((a, b) => (a.seq - b.seq));
        const pos = Math.min(m.slot ?? queue.length, queue.length);
        const before = pos > 0 ? Number(queue[pos - 1].seq) : null;
        const after = pos < queue.length ? Number(queue[pos].seq) : null;
        const seq = before == null && after == null ? 0 : after == null ? before + 1 : before == null ? after - 1 : (before + after) / 2;
        const q = per + (extra > 0 ? 1 : 0); if (extra > 0) extra--;
        if (q > 0) blocks.push({ id: `${QUOTE_ID}_${i}`, machine_id: m.id, sales_order_id: QUOTE_ID, style_id: QUOTE_ID, seq, qty: q, status: "active", start_after: null });
      });
    }
    const res = run([...raw.salesOrders, quoteSo], blocks);
    const o = res.orders.find((x) => x.id === QUOTE_ID);
    const delayed = res.orders
      .filter((x) => x.id !== QUOTE_ID && baseDates[x.id] && (!x.completionDate || x.completionDate > baseDates[x.id]))
      .map((x) => ({ soNumber: x.soNumber, before: baseDates[x.id], after: x.completionDate, dueDate: x.dueDate, nowLate: !!(x.dueDate && (!x.completionDate || x.completionDate > x.dueDate) && !(baseDates[x.id] > x.dueDate)) }));
    const finish = o?.completionDate || null;
    return {
      machines: chosen ? chosen.map((m) => m.name) : null,
      count: chosen ? chosen.length : null,
      startDate: o?.startDate || null,
      completionDate: finish,
      quotedDate: finish ? addWorkingDays(calendar, finish, Number(input.marginDays) || 0) : null,
      meetsDeadline: input.deadline && finish ? addWorkingDays(calendar, finish, Number(input.marginDays) || 0) <= input.deadline : null,
      stageStart: o?.stageStart || {}, stageFinish: o?.stageFinish || {},
      delayed,
    };
  };

  const options = isMachine
    ? candidates.map((_, i) => optionFor(candidates.slice(0, i + 1)))
    : [optionFor(null)];
  return { earliestStart, problems, options, candidates };
}
