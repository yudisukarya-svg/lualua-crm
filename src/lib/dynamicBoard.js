// =============================================================================
// dynamicBoard.js — Machine Board "Level B" dynamic tracking.
//
// PO Tukang confirms knitting handovers per SO with a free-text style label
// per line item (e.g. "Top Sunray - M (3)" or "Merlot Top - Cotton Beige
// 09-4B, 6ply - XS"). This module:
//   1. Matches that free text back to a production_styles.id (longest
//      prefix match, so trailing size/colour/ply text never confuses it).
//   2. Attributes each day's delivered qty for a given SO+style across all
//      of that SO+style's machine_blocks siblings using a LOCKED ratio
//      (each sibling's initial_qty / sum of all siblings' initial_qty) —
//      locked at block-creation/split time, not recomputed from current
//      remaining qty, so it stays stable as blocks get consumed unevenly.
//   3. From the per-block delivered total, derives remaining qty, the
//      cumulative-average actual pace (working days since first delivery),
//      and a projected ETA.
//
// Everything here is a pure function over already-fetched data — nothing in
// this file talks to Supabase. Computed fresh every time the board loads;
// nothing here is persisted except the eventual "mark done" write, which the
// caller (useDynamicBoard) performs separately.
// =============================================================================

// Find the production style whose name is the LONGEST matching prefix of
// styleRaw, requiring a word boundary right after the name (so "Top" can't
// wrongly match "Top Sunray"). Case-insensitive.
export function matchStyleId(styleRaw, stylesById) {
  if (!styleRaw) return null;
  const raw = styleRaw.trim().toLowerCase();
  let best = null, bestLen = -1;
  for (const [id, s] of Object.entries(stylesById)) {
    const name = (s.name || "").trim().toLowerCase();
    if (!name) continue;
    if (!raw.startsWith(name)) continue;
    const next = raw.slice(name.length, name.length + 1);
    if (next !== "" && next !== " " && next !== "-") continue; // not a clean boundary
    if (name.length > bestLen) { bestLen = name.length; best = id; }
  }
  return best;
}

// Sum actual delivered qty per (so_number, style_id, date) from raw
// po_style_actuals rows, resolving each row's free-text style to an id.
// Rows that don't match any known style are dropped (with a count, for
// visibility) rather than guessed at.
export function groupActualsByKey(actualRows, stylesById) {
  const byKey = {}; // `${so}:${styleId}` -> [{date, qty}]
  let unmatched = 0;
  (actualRows || []).forEach((r) => {
    const styleId = matchStyleId(r.style_raw, stylesById);
    if (!styleId) { unmatched++; return; }
    const key = `${r.so}:${styleId}`;
    (byKey[key] = byKey[key] || []).push({ date: r.tgl, qty: Number(r.aktual) || 0 });
  });
  return { byKey, unmatched };
}

// Working days elapsed from `start` to `today` inclusive of the start day
// itself (so a block that started and delivered today shows 1 day elapsed,
// not 0). Uses the same calendar the main scheduler uses.
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

// Main entry point. Returns { [blockId]: BlockActual } for every block that
// belongs to an SO+style with at least one matched actual delivery. Blocks
// with no actual data at all are simply absent from the result — callers
// should fall back to the static/planned display for those.
//
// BlockActual = {
//   deliveredQty, remainingQty, initialQty,
//   actualStartDate, pace (pcs/working-day), planPace,
//   etaDate, paceStatus: 'ahead' | 'onpace' | 'behind',
// }
export function computeBlockActuals({ blocks, stylesById, actualRows, calendar, today }) {
  const { byKey } = groupActualsByKey(actualRows, stylesById);

  // Group sibling blocks by so+style so we can compute the locked ratio.
  const siblingsByKey = {};
  (blocks || []).forEach((b) => {
    const k = `${b.sales_order_id}:${b.style_id}`;
    (siblingsByKey[k] = siblingsByKey[k] || []).push(b);
  });

  const result = {};
  Object.entries(siblingsByKey).forEach(([blocksKey, siblings]) => {
    // blocksKey is `${sales_order_id}:${style_id}` (uuids) — but actuals are
    // keyed by `${so_number}:${style_id}`. Resolve via any sibling's SO number,
    // which the caller attaches as `_soNumber` on each block.
    const soNumber = siblings[0]?._soNumber;
    if (!soNumber) return;
    const actualKey = `${soNumber}:${siblings[0].style_id}`;
    const daily = byKey[actualKey];
    if (!daily || daily.length === 0) return; // no data at all — stays static

    const totalInitial = siblings.reduce((s, b) => s + (Number(b.initial_qty) || Number(b.qty) || 0), 0);
    if (totalInitial <= 0) return;

    // Collapse to per-date totals, then find the first delivery date.
    const byDate = {};
    daily.forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + r.qty; });
    const dates = Object.keys(byDate).sort();
    const totalDelivered = Object.values(byDate).reduce((a, b) => a + b, 0);
    const firstDate = dates[0];

    siblings.forEach((b) => {
      const initialQty = Number(b.initial_qty) || Number(b.qty) || 0;
      const ratio = initialQty / totalInitial;
      const deliveredQty = Math.min(initialQty, totalDelivered * ratio);
      const remainingQty = Math.max(0, initialQty - deliveredQty);
      const days = elapsedWorkingDays(calendar, firstDate, today);
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

      result[b.id] = { deliveredQty, remainingQty, initialQty, actualStartDate: firstDate, pace, planPace, etaDate, paceStatus };
    });
  });

  return result;
}
