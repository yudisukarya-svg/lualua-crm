// =============================================================================
// dynamicBoard.js — Machine Board "Level B" dynamic tracking (v2).
//
// v1 attributed each day's delivered qty across sibling blocks (same SO+
// style) by a LOCKED RATIO of initial_qty. That was wrong for blocks that
// are sequential batches on the same machine rather than a parallel split
// across different machines — e.g. a 9-pc block queued before a 33-pc block
// for the same SO+style+machine. The ratio approach credited the later
// block with a share of production before the earlier one was actually
// finished, which caused blocks to be marked "done" prematurely.
//
// v2 instead:
//   1. Only uses delivery rows where PO Tukang recorded WHICH MACHINE did
//      the work ("mesin" field). Rows with no machine recorded are not
//      guessed at or split — they simply aren't counted here. A block with
//      no machine-attributed deliveries stays on the static plan.
//   2. Within a single machine, sibling blocks for the same SO+style are
//      consumed in QUEUE ORDER (seq) — the earliest-queued block absorbs
//      delivered qty first, up to its own qty, before any overflow counts
//      toward the next block. This mirrors how the floor actually works:
//      you finish what's queued first before starting the next.
//
// Everything here is a pure function over already-fetched data — nothing in
// this file talks to Supabase. Computed fresh every time the board loads.
// =============================================================================

export function matchStyleId(styleRaw, stylesById) {
  if (!styleRaw) return null;
  const raw = styleRaw.trim().toLowerCase();
  let best = null, bestLen = -1;
  for (const [id, s] of Object.entries(stylesById)) {
    const name = (s.name || "").trim().toLowerCase();
    if (!name) continue;
    if (!raw.startsWith(name)) continue;
    const next = raw.slice(name.length, name.length + 1);
    if (next !== "" && next !== " " && next !== "-") continue;
    if (name.length > bestLen) { bestLen = name.length; best = id; }
  }
  return best;
}

// Sum machine-attributed daily delivered qty, keyed by
// `${so}:${styleId}:${mesin}:${date}`. Rows with no mesin are dropped
// (returned separately as `unattributed` for visibility, never guessed at).
export function groupActualsByMachineDay(actualRows, stylesById) {
  const byKey = {};
  let unmatchedStyle = 0, noMachine = 0;
  (actualRows || []).forEach((r) => {
    const styleId = matchStyleId(r.style_raw, stylesById);
    if (!styleId) { unmatchedStyle++; return; }
    if (!r.mesin) { noMachine++; return; }
    const key = `${r.so}:${styleId}:${r.mesin}`;
    (byKey[key] = byKey[key] || {})[r.tgl] = ((byKey[key] || {})[r.tgl] || 0) + (Number(r.aktual) || 0);
  });
  return { byKey, unmatchedStyle, noMachine };
}

function elapsedWorkingDays(calendar, start, today) {
  if (!start) return 0;
  if (start >= today) return 1;
  return calendar.workingDaysBetween(start, today) + 1;
}

function addWorkingDays(calendar, fromDate, n) {
  let d = calendar.next(new Date(fromDate + "T00:00:00"));
  let remaining = n;
  while (remaining > 1) {
    d = calendar.next(new Date(d.getTime() + 86400000));
    remaining--;
  }
  return d.toISOString().slice(0, 10);
}

// blocks: machine_blocks rows enriched with `_soNumber` and `_machineName`
//   (attached by the caller), plus the usual id/seq/initial_qty/qty/
//   sales_order_id/style_id/status.
// Returns { [blockId]: { deliveredQty, remainingQty, initialQty,
//   actualStartDate, pace, planPace, etaDate, paceStatus } } — only for
// blocks that received at least one machine-attributed delivery. Blocks
// absent from the result should fall back to the static/planned display.
export function computeBlockActuals({ blocks, stylesById, actualRows, calendar, today }) {
  const { byKey } = groupActualsByMachineDay(actualRows, stylesById);

  // Group blocks by (sales_order_id, style_id, machine_id) — these are the
  // ones that genuinely compete for the same machine-attributed delivery
  // stream, consumed in seq order.
  const groups = {};
  (blocks || []).forEach((b) => {
    const k = `${b.sales_order_id}:${b.style_id}:${b.machine_id}`;
    (groups[k] = groups[k] || []).push(b);
  });

  const result = {};
  Object.values(groups).forEach((siblings) => {
    const first = siblings[0];
    const soNumber = first._soNumber, machineName = first._machineName;
    if (!soNumber || !machineName) return;
    const actualKey = `${soNumber}:${first.style_id}:${machineName}`;
    const daily = byKey[actualKey];
    if (!daily) return; // no machine-attributed data at all for this SO+style+machine — stays static

    const ordered = [...siblings].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.created_at || "").localeCompare(b.created_at || ""));
    const dates = Object.keys(daily).sort();

    // Day-by-day cumulative consumption, sequential across ordered blocks.
    let cumulative = 0;
    const firstCreditDate = {}; // blockId -> first date this block started receiving credit
    const deliveredAsOf = {}; // blockId -> running delivered total
    ordered.forEach((b) => { deliveredAsOf[b.id] = 0; });

    dates.forEach((date) => {
      cumulative += daily[date];
      let priorCapacity = 0;
      for (const b of ordered) {
        const cap = Number(b.initial_qty) || Number(b.qty) || 0;
        const deliveredForThisBlock = Math.max(0, Math.min(cap, cumulative - priorCapacity));
        if (deliveredForThisBlock > 0 && firstCreditDate[b.id] === undefined) firstCreditDate[b.id] = date;
        deliveredAsOf[b.id] = deliveredForThisBlock;
        priorCapacity += cap;
      }
    });

    ordered.forEach((b) => {
      const deliveredQty = deliveredAsOf[b.id] || 0;
      if (deliveredQty <= 0) return; // this sibling hasn't started receiving credit yet — stays static
      const initialQty = Number(b.initial_qty) || Number(b.qty) || 0;
      const remainingQty = Math.max(0, initialQty - deliveredQty);
      const startDate = firstCreditDate[b.id];
      const days = elapsedWorkingDays(calendar, startDate, today);
      const pace = days > 0 ? deliveredQty / days : 0;
      const planPace = Number(b._planRate) || 0;
      let paceStatus = "onpace";
      if (planPace > 0) {
        if (pace >= planPace * 1.1) paceStatus = "ahead";
        else if (pace <= planPace * 0.85) paceStatus = "behind";
      }
      let etaDate = null;
      if (remainingQty <= 0) etaDate = today;
      else if (pace > 0) etaDate = addWorkingDays(calendar, today, Math.ceil(remainingQty / pace));
      else if (planPace > 0) etaDate = addWorkingDays(calendar, today, Math.ceil(remainingQty / planPace));

      result[b.id] = { deliveredQty, remainingQty, initialQty, actualStartDate: startDate, pace, planPace, etaDate, paceStatus };
    });
  });

  return result;
}
