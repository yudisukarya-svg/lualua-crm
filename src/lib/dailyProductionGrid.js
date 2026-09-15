// Daily Production per Machine — for each machine and day, shows the REAL
// confirmed pcs PO Tukang recorded against that specific machine (using the
// "Mesin yang dipakai" field workers fill in at handover confirmation), and
// cross-references it against what the Machine Board schedule expected, so
// a scheduled day with zero machine-confirmed production stands out.
//
// Deliberately NOT an estimate: if a handover wasn't attributed to a
// machine at confirmation time (the "mesin" field was left blank), that
// qty is not guessed at or split across candidate machines — it simply
// isn't counted for any machine here. This keeps the report honest, and
// doubles as a nudge to fill in "Mesin yang dipakai" consistently, since an
// unattributed handover will show up as a red "0" even though work did
// happen — the gap is real and worth surfacing, not papering over.

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

// machines: [{id, name}] — name must match PO Tukang's "mesin" text exactly
//   (e.g. "Mesin 3"), which is how the two systems are already aligned.
// board: schedule.board entries ({ blockId, machineId, soId, soNumber, styleName, start, finish })
//   — used only to know what the board expected to be running (for the
//   segment labels and the "missing" red flag), never for the qty itself.
// rawBlocks: raw.blocks — used only to look up each board entry's style_id
//   (board entries don't carry it) so we can find that style's daily rate.
// stylesById: raw.styles — needs .knitting_machine (the daily target for a
//   machine running that style).
// actualRows: raw po_daily_actuals rows ({ so, tgl, aktual, mesin }).
// Returns { [machineId]: { machineName, days: [{ date, scheduled, pcs, target, missing, soNumber, customerName, styleName }] } }
export function computeDailyProductionGrid({ machines, board, rawBlocks, stylesById, actualRows, soById, startDate, endDate, calendar }) {
  const days = dateRange(startDate, endDate);

  // Real, machine-attributed pcs only — rows with no "mesin" recorded are
  // excluded here (not split, not guessed).
  const actualByMachineDate = {};
  (actualRows || []).forEach((r) => {
    if (!r.mesin) return;
    const k = `${r.mesin}:${r.tgl}`;
    actualByMachineDate[k] = (actualByMachineDate[k] || 0) + (Number(r.aktual) || 0);
  });

  const styleIdByBlockId = {}; (rawBlocks || []).forEach((b) => { styleIdByBlockId[b.id] = b.style_id; });

  const result = {};
  (machines || []).forEach((m) => {
    const blocksForMachine = (board || []).filter((b) => b.machineId === m.id && b.start && b.finish);
    const dayCells = days.map((date) => {
      const isWorkingDay = calendar ? calendar.isWorkingDay(new Date(date + "T00:00:00")) : true;
      const active = isWorkingDay ? blocksForMachine.find((b) => date >= b.start && date <= b.finish) : null;
      const pcs = actualByMachineDate[`${m.name}:${date}`] || 0;

      if (!active) {
        // Nothing scheduled here per the board. If real confirmed pcs exist
        // anyway (unplanned work, or a board change after the fact), still
        // show the true number rather than hiding it — just don't flag it.
        return { date, scheduled: pcs > 0, pcs, target: 0, missing: false, isWorkingDay, soNumber: null, customerName: null, styleName: null };
      }
      const so = soById[active.soId];
      const target = Number(stylesById?.[styleIdByBlockId[active.blockId]]?.knitting_machine) || 0;
      return {
        date, scheduled: true, pcs, target, isWorkingDay,
        missing: target > 0 ? pcs < target : pcs <= 0,
        soNumber: active.soNumber, customerName: so?.customers?.customer_name || null, styleName: active.styleName || null,
      };
    });
    result[m.id] = { machineName: m.name, days: dayCells };
  });
  return result;
}

// Groups consecutive same-SO day cells into segments, for the "SO ·
// customer · style" labels shown above each machine's day grid. Adjacent
// segments for the same SO (e.g. separated only by a non-working day) are
// merged so the label doesn't repeat back-to-back.
export function segmentsFromDays(days) {
  const raw = [];
  days.forEach((d) => {
    const last = raw[raw.length - 1];
    if (d.scheduled && d.soNumber && last && last.soNumber === d.soNumber && last.end === prevDate(d.date)) {
      last.end = d.date;
    } else if (d.scheduled && d.soNumber) {
      raw.push({ soNumber: d.soNumber, customerName: d.customerName, styleName: d.styleName, start: d.date, end: d.date });
    }
  });
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
