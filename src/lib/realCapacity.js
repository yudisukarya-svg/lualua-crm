// =============================================================================
// realCapacity.js — each later stage's capacity from what the floor ACTUALLY
// handed over recently (PO Tukang), not only from Resources × style speeds.
//
// Why: in Nov 2026 the configured capacity (workers in Resources × pcs/day in
// Styles) was 1.5–2.5× lower than real output — e.g. Steam configured ≈45
// pcs/day vs ≈115 really handed over — so every forecast and quote came out
// months too late.
//
// Rule: capacity = the HIGHER of (configured) and (real average per working
// day over the last 30 days). Taking the higher keeps stages that PO Tukang
// only partly records (QC Final; Packing comes from Dispatch) from being
// dragged down by missing data.
//
// For a stage on real capacity, the team is modelled as a shared pool of
// pcs/day: every style moves through it at the same speed. The per-style
// speeds in Styles (many set at 5–10 pcs/worker/day) are NOT used for that
// stage — they made one slow-rated order hog the whole team for days and
// created gaps between stages that don't happen on the floor (checked Nov
// 2026). The engine still thinks in "workers × pcs/day", so the pool is
// expressed as (real pcs/day ÷ a common speed) equivalent workers, with every
// style's speed for that stage set to that common speed.
// =============================================================================
import { makeCalendar } from "@/lib/scheduler";

export const WINDOW_DAYS = 30;
const LATER_STAGES = ["linking", "finishing", "steam", "label", "qc", "packing"];
const TIPE_TO_STAGE = { Linking: "linking", Finishing: "finishing", Steam: "steam", Labelling: "label", "QC Final": "qc" };

const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);

export function windowStart(today) {
  return fmt(new Date(toDate(today).getTime() - WINDOW_DAYS * 86400000));
}

// dailyRows: po_daily_actuals { tipe, tgl, aktual } (tgl >= windowStart)
// dispatchRows: dispatch_activity_log { detail: { totalQty }, created_at }
// → { linking: pcsPerWorkingDay, ..., packing }
export function realPcsPerDay({ dailyRows, dispatchRows, today, settings = {}, holidays = [] }) {
  const from = windowStart(today);
  const cal = makeCalendar({ sundayOff: settings.sunday_off ?? true, saturdayOff: settings.saturday_off ?? false, holidays });
  const workingDays = Math.max(1, cal.workingDaysBetween(from, today));
  const sums = Object.fromEntries(LATER_STAGES.map((s) => [s, 0]));
  (dailyRows || []).forEach((r) => {
    const s = TIPE_TO_STAGE[r.tipe];
    if (!s || !r.tgl || r.tgl < from || r.tgl >= today) return;
    sums[s] += Number(r.aktual) || 0;
  });
  (dispatchRows || []).forEach((r) => {
    const d = (r.created_at || "").slice(0, 10);
    if (!d || d < from || d >= today) return;
    sums.packing += Number(r.detail?.totalQty) || 0;
  });
  const perDay = Object.fromEntries(LATER_STAGES.map((s) => [s, Math.round(sums[s] / workingDays)]));
  // QC Final is only partly recorded in PO Tukang (Nov 2026: ~620 pcs in 30
  // days vs ~2,970 shipped). Every shipped piece passed final QC, so QC
  // handled at least as much as was shipped.
  perDay.qc = Math.max(perDay.qc, perDay.packing);
  return perDay;
}

// resources: configured map (workers per stage). jobs: open jobs (buildJobs).
// → { resources: adjusted map, uniformRates: { stage: commonSpeed } for stages
//     on real capacity, basis: { stage: { configuredPcs, realPcs, usedPcs, source } } }
export function calibrateResources(resources, jobs, realPerDay) {
  const out = { ...resources };
  const basis = {};
  const uniformRates = {};
  LATER_STAGES.forEach((s) => {
    // qty-weighted average speed of open orders that go through this stage
    let q = 0, qr = 0;
    (jobs || []).forEach((j) => {
      if ((j.style?.skipStages || []).includes(s)) return;
      const rate = Number(j.style?.[s]) || 0;
      if (rate <= 0) return;
      q += j.quantity; qr += j.quantity * rate;
    });
    const avgRate = q > 0 ? qr / q : 0;
    const workers = Number(resources[s]) || 0;
    const configuredPcs = Math.round(workers * avgRate);
    const realPcs = realPerDay?.[s] || 0;
    if (avgRate > 0 && realPcs > configuredPcs) {
      out[s] = realPcs / avgRate;
      uniformRates[s] = avgRate;
      basis[s] = { configuredPcs, realPcs, usedPcs: realPcs, source: "real" };
    } else {
      basis[s] = { configuredPcs, realPcs, usedPcs: configuredPcs, source: "configured" };
    }
  });
  return { resources: out, basis, uniformRates };
}

// stylesMap with each real-capacity stage's speed replaced by the common speed
// (a style whose speed is 0 for that stage keeps 0).
export function applyUniformRates(stylesMap, uniformRates) {
  const keys = Object.keys(uniformRates || {});
  if (keys.length === 0) return stylesMap;
  const out = {};
  Object.entries(stylesMap || {}).forEach(([id, st]) => {
    const c = { ...st };
    keys.forEach((s) => { if ((Number(c[s]) || 0) > 0) c[s] = uniformRates[s]; });
    out[id] = c;
  });
  return out;
}
