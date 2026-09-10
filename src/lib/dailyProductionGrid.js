// Daily Production per Machine — cross-references the Machine Board's
// schedule (what SO/style was supposed to be running on each machine on
// each day) against PO Tukang's confirmed knitting handovers (what actually
// got delivered), so a day that was scheduled but shows zero confirmed
// production stands out immediately.
//
// PO Tukang's daily actuals are per SO+date only (no machine/style
// breakdown). When an SO is split across multiple machine_blocks — possibly
// on different machines — that day's total must be divided across the
// blocks, not shown in full on every one of them. Same locked-ratio
// approach as the dynamic Machine Board feature: each block's share of
// initial_qty out of the SO's total initial_qty across all its blocks.

function dateRange(startDate, endDate) {
  const out = [];
  let d = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

// machines: [{id, name}]
// board: schedule.board entries ({ blockId, machineId, soId, soNumber, styleName, start, finish })
// rawBlocks: raw.blocks ({ id, sales_order_id, initial_qty, qty, ... }) — used
//   only to compute each block's locked share of its SO's total qty.
// actualRows: raw po_daily_actuals rows ({ so, tgl, aktual }).
// Returns { [machineId]: { machineName, days: [{ date, scheduled, pcs, missing, soNumber, customerName, styleName }] } }
export function computeDailyProductionGrid({ machines, board, rawBlocks, actualRows, soById, startDate, endDate, calendar }) {
  const days = dateRange(startDate, endDate);

  const actualByKey = {};
  (actualRows || []).forEach((r) => {
    const k = `${r.so}:${r.tgl}`;
    actualByKey[k] = (actualByKey[k] || 0) + (Number(r.aktual) || 0);
  });

  // Each block's locked share of its SO's total qty (sum across ALL of that
  // SO's blocks, any machine/status/style — po_daily_actuals can't tell us
  // which style a day's qty belongs to, so this is the best available split).
  const totalInitialBySoId = {};
  (rawBlocks || []).forEach((b) => {
    totalInitialBySoId[b.sales_order_id] = (totalInitialBySoId[b.sales_order_id] || 0) + (Number(b.initial_qty) || Number(b.qty) || 0);
  });
  const initialByBlockId = {};
  (rawBlocks || []).forEach((b) => { initialByBlockId[b.id] = Number(b.initial_qty) || Number(b.qty) || 0; });

  const result = {};
  (machines || []).forEach((m) => {
    const blocksForMachine = (board || []).filter((b) => b.machineId === m.id && b.start && b.finish);
    const dayCells = days.map((date) => {
      const isWorkingDay = calendar ? calendar.isWorkingDay(new Date(date + "T00:00:00")) : true;
      const active = isWorkingDay ? blocksForMachine.find((b) => date >= b.start && date <= b.finish) : null;
      if (!active) return { date, scheduled: false, pcs: 0, missing: false, soNumber: null, customerName: null, styleName: null };

      const so = soById[active.soId];
      const soTotalActual = actualByKey[`${active.soNumber}:${date}`] || 0;
      const soTotalInitial = totalInitialBySoId[active.soId] || 0;
      const blockShare = soTotalInitial > 0 ? (initialByBlockId[active.blockId] || 0) / soTotalInitial : 1;
      const pcs = Math.round(soTotalActual * blockShare * 10) / 10;

      return {
        date, scheduled: true, pcs, missing: pcs <= 0,
        soNumber: active.soNumber, customerName: so?.customers?.customer_name || null, styleName: active.styleName || null,
      };
    });
    result[m.id] = { machineName: m.name, days: dayCells };
  });
  return result;
}

// Groups consecutive same-SO day cells into segments, for the "SO ·
// customer · style" labels shown above each machine's day grid. Gaps
// (non-working days, or genuine re-scheduling breaks) start a new segment,
// but immediately-adjacent identical segments are merged in the label so
// the same SO never appears to repeat back-to-back for no visible reason.
export function segmentsFromDays(days) {
  const raw = [];
  days.forEach((d) => {
    const last = raw[raw.length - 1];
    if (d.scheduled && last && last.soNumber === d.soNumber && last.end === prevDate(d.date)) {
      last.end = d.date;
    } else if (d.scheduled) {
      raw.push({ soNumber: d.soNumber, customerName: d.customerName, styleName: d.styleName, start: d.date, end: d.date });
    }
  });
  // Merge segments that are for the same SO even across a gap (e.g. a
  // weekend, or a short pause) so the header doesn't repeat the same
  // "SO · customer · style" label multiple times in a row.
  const merged = [];
  raw.forEach((seg) => {
    const last = merged[merged.length - 1];
    if (last && last.soNumber === seg.soNumber) { last.end = seg.end; }
    else merged.push({ ...seg });
  });
  return merged;
}

function prevDate(dateStr) {
  return new Date(new Date(dateStr + "T00:00:00").getTime() - 86400000).toISOString().slice(0, 10);
}
