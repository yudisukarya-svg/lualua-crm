// Daily Production per Machine — cross-references the Machine Board's
// schedule (what SO/style was supposed to be running on each machine on
// each day) against PO Tukang's confirmed knitting handovers (what actually
// got delivered), so a day that was scheduled but shows zero confirmed
// production stands out immediately.

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

// actualRows: raw po_daily_actuals rows ({ so, tgl, aktual, mesin, tipe }).
// board: schedule.board entries ({ blockId, machineId, soId, soNumber, styleName, start, finish }).
// Returns { [machineId]: { machineName, days: [{ date, scheduled, pcs, missing, soNumber, customerName, styleName }] } }
export function computeDailyProductionGrid({ machines, board, actualRows, soById, styleNameByBlock, startDate, endDate, calendar }) {
  const days = dateRange(startDate, endDate);

  // Sum actual pcs per (so_number, date) — a day can have more than one WO
  // confirmed for the same SO.
  const actualByKey = {};
  (actualRows || []).forEach((r) => {
    const k = `${r.so}:${r.tgl}`;
    actualByKey[k] = (actualByKey[k] || 0) + (Number(r.aktual) || 0);
  });

  const result = {};
  (machines || []).forEach((m) => {
    const blocksForMachine = (board || []).filter((b) => b.machineId === m.id && b.start && b.finish);
    const dayCells = days.map((date) => {
      const isWorkingDay = calendar ? calendar.isWorkingDay(new Date(date + "T00:00:00")) : true;
      const active = isWorkingDay ? blocksForMachine.find((b) => date >= b.start && date <= b.finish) : null;
      if (!active) return { date, scheduled: false, pcs: 0, missing: false, soNumber: null, customerName: null, styleName: null };
      const so = soById[active.soId];
      const pcs = actualByKey[`${active.soNumber}:${date}`] || 0;
      return {
        date, scheduled: true, pcs, missing: pcs <= 0,
        soNumber: active.soNumber, customerName: so?.customers?.customer_name || null,
        styleName: active.styleName || styleNameByBlock?.[active.blockId] || null,
      };
    });
    result[m.id] = { machineName: m.name, days: dayCells };
  });
  return result;
}

// Groups consecutive same-SO day cells into segments, for the "SO ·
// customer · style" labels shown above each machine's day grid.
export function segmentsFromDays(days) {
  const segments = [];
  days.forEach((d) => {
    const last = segments[segments.length - 1];
    if (d.scheduled && last && last.soNumber === d.soNumber && last.end === prevDate(d.date)) {
      last.end = d.date;
    } else if (d.scheduled) {
      segments.push({ soNumber: d.soNumber, customerName: d.customerName, styleName: d.styleName, start: d.date, end: d.date });
    }
  });
  return segments;
}

function prevDate(dateStr) {
  return new Date(new Date(dateStr + "T00:00:00").getTime() - 86400000).toISOString().slice(0, 10);
}
