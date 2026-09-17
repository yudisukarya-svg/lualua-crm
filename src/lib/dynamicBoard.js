// =============================================================================
// dynamicBoard.js — Machine Board "Level B" dynamic tracking (v3).
//
// v1 attributed each day's delivered qty across sibling blocks (same SO+
// style) by a LOCKED RATIO of initial_qty. That was wrong for blocks that
// are sequential batches rather than a genuine parallel split — it credited
// a later block with a share of production before the earlier one was
// actually finished, causing blocks to be marked "done" prematurely.
//
// v2 restricted attribution to the block's CURRENT machine only, matching
// PO Tukang's "mesin" field. That fixed the ratio bug, but undercounted:
// production for a given SO+style often moves across machines over the
// life of an order (a block gets moved, or the queue gets re-shuffled by
// Auto-fill), so real historical delivery on a machine the block used to
// sit on — or never sat on, if the block itself is a fresh Auto-fill
// recreation — was being silently excluded. Verified against a manual
// WO-by-WO audit from PO Tukang: SO-02573 Shorts Sunray's true remaining
// (63 of 168) only reconciles when counting confirmed deliveries across
// ALL machines, not just the block's current one.
//
// v3: remaining-qty tracking is an ORDER-completion question ("how much of
// this SO+style is left, in total"), not a per-machine attribution question
// — that's what the separate Daily Production per Machine report (Reports
// page) is for, and it correctly keeps using the real "mesin" field for
// that different purpose. Here, v3 sums every confirmed delivery for the
// SO+style regardless of which machine did it, and still consumes it
// SEQUENTIALLY across sibling blocks in queue order (seq / created_at) —
// that ordering is what actually prevents the original ratio bug, and it
// remains correct whether siblings are on the same machine or different
// ones.
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

// Sum ALL confirmed daily delivered qty (any machine — mesin is not used
// here), keyed by `${so}:${styleId}`.
export function groupActualsByDay(actualRows, stylesById) {
  const byKey = {};
  let unmatchedStyle = 0;
  (actualRows || []).forEach((r) => {
    const styleId = matchStyleId(r.style_raw, stylesById);
    if (!styleId) { unmatchedStyle++; return; }
    const key = `${r.so}:${styleId}`;
    (byKey[key] = byKey[key] || {})[r.tgl] = ((byKey[key] || {})[r.tgl] || 0) + (Number(r.aktual) || 0);
  });
  return { byKey, unmatchedStyle };
}

function elapsedWorkingDays(calendar, start, today) {
  if (!start) return 0;
  if (start >= today) return 1;
  return calendar.workingDaysBetween(start, today) + 1;
}

function addWorkingDays(calendar, fromDate, n) {
  let d = calendar.next(new Date(fromDate + "T00:00:00Z"));
  let remaining = n;
  while (remaining > 1) {
    d = calendar.next(new Date(d.getTime() + 86400000));
    remaining--;
  }
  return d.toISOString().slice(0, 10);
}

// blocks: machine_blocks rows enriched with `_soNumber` (attached by the
//   caller), plus the usual id/seq/initial_qty/qty/sales_order_id/style_id.
// Returns { [blockId]: { deliveredQty, remainingQty, initialQty,
//   actualStartDate, pace, planPace, etaDate, paceStatus } } — only for
// blocks whose SO+style has at least one confirmed delivery. Blocks absent
// from the result should fall back to the static/planned display.
export function computeBlockActuals({ blocks, stylesById, actualRows, calendar, today }) {
  const { byKey } = groupActualsByDay(actualRows, stylesById);

  // Group ALL blocks (any machine) sharing the same SO+style — they
  // compete for the same overall delivery stream, consumed in queue order.
  const groups = {};
  (blocks || []).forEach((b) => {
    const k = `${b.sales_order_id}:${b.style_id}`;
    (groups[k] = groups[k] || []).push(b);
  });

  const result = {};
  Object.values(groups).forEach((siblings) => {
    const first = siblings[0];
    const soNumber = first._soNumber;
    if (!soNumber) return;
    const actualKey = `${soNumber}:${first.style_id}`;
    const daily = byKey[actualKey];
    if (!daily) return; // no confirmed data at all for this SO+style — stays static

    const ordered = [...siblings].sort((a, b) => {
      const aDone = a.status === "done" ? 0 : 1;
      const bDone = b.status === "done" ? 0 : 1;
      if (aDone !== bDone) return aDone - bDone; // done siblings always claim their capacity first, regardless of seq
      return (a.seq ?? 0) - (b.seq ?? 0) || (a.created_at || "").localeCompare(b.created_at || "");
    });
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
      if (b.status === "done") return; // locked — capacity above still counted, but no dynamic info needed
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
