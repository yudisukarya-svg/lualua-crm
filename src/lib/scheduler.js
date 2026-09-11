// =============================================================================
// scheduler.js — finite-capacity, overlapping-flow scheduler (v4).
// Knitting is gauge-aware: a manual worker pool + one machine pool per gauge.
// Machine styles run only on their gauge; an order can use up to all machines
// of that gauge, OR a specific number the operator assigned (assignedMachines).
// Other stages: automatic allocation by priority. Progress reported as of today.
// =============================================================================

const DAY_MS = 86400000;
export const STAGES = ["knitting", "linking", "finishing", "steam", "label", "qc", "packing"];
export const STAGE_LABELS = {
  knitting: "Knitting", linking: "Linking", finishing: "Finishing", steam: "Steam",
  label: "Label Sewing", qc: "Final QC", packing: "Packing",
};
export const GAUGES = ["5", "7", "12"];

const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * DAY_MS);
const dow = (dt) => dt.getUTCDay();

export function makeCalendar({ sundayOff = true, saturdayOff = false, holidays = [] } = {}) {
  const off = new Set(holidays);
  const cal = {
    isWorkingDay(dt) {
      if (sundayOff && dow(dt) === 0) return false;
      if (saturdayOff && dow(dt) === 6) return false;
      if (off.has(fmt(dt))) return false;
      return true;
    },
    next(dt) { let c = dt; while (!cal.isWorkingDay(c)) c = addDays(c, 1); return c; },
    workingDaysBetween(a, b) { let n = 0, c = toDate(a); const end = toDate(b); while (c < end) { c = addDays(c, 1); if (cal.isWorkingDay(c)) n++; } return n; },
  };
  return cal;
}

// Knitting pools available from the resources map (machine_*g are already net of reserved).
export function knittingPools(resources) {
  const pools = [];
  if ((resources.knitting_manual || 0) > 0) pools.push({ key: "manual", label: "Knitting — Manual", avail: resources.knitting_manual, unit: "workers", method: "manual" });
  GAUGES.forEach((g) => {
    const c = resources["machine_" + g + "g"] || 0;
    if (c > 0) pools.push({ key: g + "g", label: `Knitting — ${g}g`, avail: c, unit: "machines", method: "machine", gauge: g });
  });
  return pools;
}

function poolsFor(stage, resources) { return [{ workers: resources[stage] || 0, rateKey: stage }]; }
export function stageWorkerCount(stage, resources) {
  if (stage === "knitting") return knittingPools(resources).reduce((n, p) => n + p.avail, 0);
  return resources[stage] || 0;
}

function comparator(mode) {
  if (mode === "edd") return (a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") || (a.sequence ?? 0) - (b.sequence ?? 0);
  if (mode === "priority") return (a, b) => (a.priority ?? 100) - (b.priority ?? 100) || (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") || (a.sequence ?? 0) - (b.sequence ?? 0);
  return (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0);
}

const zero = () => Object.fromEntries(STAGES.map((s) => [s, 0]));

export function computeSchedule({ jobs, resources, settings = {}, holidays = [], today, priorityMode = "fifo", horizonDays = 600, machines = [], blocks = [], reservations = [] }) {
  const calendar = makeCalendar({ sundayOff: settings.sunday_off ?? true, saturdayOff: settings.saturday_off ?? false, holidays });

  const boardMode = Array.isArray(blocks) && blocks.length > 0 && Array.isArray(machines) && machines.length > 0;

  let kpDefs;
  if (boardMode) {
    const byG = {}; machines.forEach((m) => { if (m.active) byG[m.gauge] = (byG[m.gauge] || 0) + 1; });
    kpDefs = [];
    if ((resources.knitting_manual || 0) > 0) kpDefs.push({ key: "manual", label: "Knitting — Manual", avail: resources.knitting_manual, unit: "workers", method: "manual" });
    GAUGES.forEach((g) => { if (byG[g] > 0) kpDefs.push({ key: g + "g", label: `Knitting — ${g}g`, avail: byG[g], unit: "machines", method: "machine", gauge: g }); });
  } else {
    kpDefs = knittingPools(resources);
  }

  // Blocks marked "done" are already knitted on the machine floor — their qty
  // must count toward completed.knitting from day one, or downstream stages
  // (linking, finishing, ...) would wait on knitting that has, in reality,
  // already happened. "hold" blocks are the opposite: genuinely paused, so
  // they contribute nothing yet.
  const doneKnittedByKey = {};
  (blocks || []).forEach((b) => {
    if (b.status !== "done") return;
    const k = `${b.sales_order_id}:${b.style_id}`;
    doneKnittedByKey[k] = (doneKnittedByKey[k] || 0) + (Number(b.qty) || 0);
  });

  const live = jobs
    .filter((j) => j.style && j.quantity > 0 && j.status !== "cancelled" && j.status !== "done")
    .map((j) => {
      const completed = zero();
      const doneQty = Math.min(doneKnittedByKey[j.id] || 0, j.quantity);
      completed.knitting = doneQty;
      return { ...j, completed, asOfToday: zero(), stageStart: {}, stageFinish: {}, startDate: null, completionDate: null, done: false };
    })
    .sort(comparator(priorityMode));

  const todayStr = today || fmt(calendar.next(new Date()));
  const earliestSimDay = live.reduce((min, o) => { const es = o.earliestStart || todayStr; return es < min ? es : min; }, todayStr);

  // Board state: each active machine keeps an ordered queue of blocks it works through.
  let machineState = null;
  if (boardMode) {
    const jobByKey = {}; live.forEach((o) => { jobByKey[o.id] = o; });
    machineState = machines.filter((m) => m.active).map((m) => ({
      id: m.id, gauge: m.gauge,
      queue: blocks.filter((b) => b.machine_id === m.id && (b.status || "active") === "active").sort((a, b) => (a.seq - b.seq)).map((b) => {
        const key = `${b.sales_order_id}:${b.style_id}`;
        const job = jobByKey[key];
        return { id: b.id, key, job, qty: Number(b.qty) || 0, done: 0, rate: job ? (Number(job.style.knitting_machine) || 0) : 0, startAfter: b.start_after || null };
      }).filter((x) => x.job),
    }));
  }

  // Reserved hours (samples, maintenance) per machine per day.
  const workHours = Number(settings.work_hours_per_day) > 0 ? Number(settings.work_hours_per_day) : 8;
  const reservedHours = {};
  (reservations || []).forEach((r) => {
    const k = `${r.machine_id}|${r.date}`;
    reservedHours[k] = (reservedHours[k] || 0) + (Number(r.hours) || 0);
  });

  let day = calendar.next(toDate(earliestSimDay));
  const daily = [];
  let guard = 0;

  while (live.some((o) => !o.done) && guard < horizonDays * 2 + 50) {
    guard++;
    const dStr = fmt(day);
    const snap = live.map((o) => ({ completed: { ...o.completed } }));
    const util = {};

    STAGES.forEach((stage, i) => {
      const alloc = [];

      if (stage === "knitting") {
        if (boardMode) {
          const machineUsedByGauge = {};
          // Machines advance their queues (machine-knit orders).
          machineState.forEach((m) => {
            // Hours taken by samples/maintenance on this machine today reduce its output.
            const taken = reservedHours[`${m.id}|${dStr}`] || 0;
            const factor = Math.max(0, (workHours - taken) / workHours);
            if (factor <= 0) return;
            let blk = null;
            for (const b of m.queue) {
              if (b.done >= b.qty || b.rate <= 0 || b.job.completed.knitting >= b.job.quantity) continue; // permanently unworkable — skip for good
              // This is the earliest-queued block that can still produce.
              // Either we work it today, or the machine waits for it — we
              // never jump ahead to a later-queued block just because it
              // happens to be date-eligible sooner. Queue order (seq, set
              // by the up/down arrows on the board) is the source of truth
              // for schedule order, not whichever block's earliest_start
              // happens to have passed first.
              const jobStart = b.job.earliestStart || null;
              const blockStart = b.startAfter || null;
              const effectiveStart = (jobStart && blockStart) ? (jobStart > blockStart ? jobStart : blockStart) : (jobStart || blockStart);
              if (dStr >= (effectiveStart || dStr)) blk = b;
              break;
            }
            if (!blk) return;
            const o = blk.job;
            const dayRate = factor >= 1 ? blk.rate : Math.max(0, Math.floor(blk.rate * factor));
            if (dayRate <= 0) return;
            const produce = Math.min(dayRate, blk.qty - blk.done, o.quantity - o.completed.knitting);
            if (produce <= 0) return;
            if (!o.stageStart.knitting) o.stageStart.knitting = dStr;
            o.completed.knitting += produce; blk.done += produce;
            if (!blk.start) blk.start = dStr;
            if (blk.done >= blk.qty && !blk.finish) blk.finish = dStr;
            if (!o.startDate) o.startDate = dStr;
            if (o.completed.knitting >= o.quantity && !o.stageFinish.knitting) o.stageFinish.knitting = dStr;
            o.knitUnit = "machines";
            machineUsedByGauge[m.gauge] = (machineUsedByGauge[m.gauge] || 0) + 1;
            alloc.push({ soId: o.soId, soNumber: o.soNumber, styleName: o.styleName, pool: m.gauge + "g", unit: "machines", count: 1, pieces: produce });
          });
          // Manual-knit orders still use the worker pool.
          let manualFree = resources.knitting_manual || 0, manualUsed = 0;
          for (const o of live) {
            if (o.style.method === "machine") continue;
            if (dStr < (o.earliestStart || dStr)) continue;
            const remaining = o.quantity - o.completed.knitting; if (remaining <= 0) continue;
            const rate = o.style.knitting_manual || 0; if (rate <= 0 || manualFree <= 0) continue;
            let cap = manualFree;
            if (o.assignedWorkers != null && o.assignedWorkers > 0) cap = Math.min(cap, o.assignedWorkers);
            const give = Math.min(Math.ceil(remaining / rate), cap); if (give <= 0) continue;
            const produced = Math.min(remaining, give * rate);
            if (!o.stageStart.knitting) o.stageStart.knitting = dStr;
            o.completed.knitting += produced;
            if (!o.startDate) o.startDate = dStr;
            if (o.completed.knitting >= o.quantity && !o.stageFinish.knitting) o.stageFinish.knitting = dStr;
            o.knitUnit = "workers"; o.peakKnit = Math.max(o.peakKnit || 0, give);
            manualFree -= give; manualUsed += give;
            alloc.push({ soId: o.soId, soNumber: o.soNumber, styleName: o.styleName, pool: "Manual", unit: "workers", count: give, pieces: produced });
          }
          const pools = {}; let totalAvail = 0, totalUsed = 0;
          kpDefs.forEach((p) => {
            const used = p.key === "manual" ? manualUsed : (machineUsedByGauge[p.gauge] || 0);
            pools[p.key] = { label: p.label, avail: p.avail, used, unit: p.unit, demand: 0, assigned: 0, over: 0 };
            totalAvail += p.avail; totalUsed += used;
          });
          util.knitting = { workersAvail: totalAvail, workersUsed: totalUsed, demandWorkers: 0, free: Math.max(0, totalAvail - totalUsed), utilization: totalAvail ? Math.round((totalUsed / totalAvail) * 1000) / 10 : 0, overCapacity: 0, alloc, pools, assignedByPool: {}, shortEvents: [] };
          return;
        }

        const freeBy = {}, usedBy = {}, demandBy = {};
        kpDefs.forEach((p) => { freeBy[p.key] = p.avail; usedBy[p.key] = 0; demandBy[p.key] = 0; });

        const waiting = live.map((o, idx) => {
          const upstream = (dStr >= (o.earliestStart || dStr)) ? o.quantity : 0;
          const avail = Math.max(0, upstream - snap[idx].completed.knitting);
          return { idx, avail, o };
        }).filter((w) => w.avail > 0);

        waiting.forEach((w) => {
          const st = w.o.style;
          if (st.method === "machine" && st.gauge) { const key = st.gauge + "g"; const rate = st.knitting_machine || 0; if (rate > 0 && key in demandBy) demandBy[key] += Math.ceil(w.avail / rate); }
          else { const rate = st.knitting_manual || 0; if (rate > 0 && "manual" in demandBy) demandBy.manual += Math.ceil(w.avail / rate); }
        });

        const assignedByPool = {}; kpDefs.forEach((p) => { assignedByPool[p.key] = 0; });
        waiting.forEach((w) => {
          const st = w.o.style;
          const isM = st.method === "machine" && st.gauge;
          const key = isM ? st.gauge + "g" : "manual";
          const want = isM ? w.o.assignedMachines : w.o.assignedWorkers;
          if (want != null && want > 0 && key in assignedByPool) assignedByPool[key] += want;
        });
        const shortEvents = [];

        for (const w of waiting) {
          const o = w.o, st = o.style, remaining = w.avail;
          let key, rate, isMachine;
          if (st.method === "machine" && st.gauge) { key = st.gauge + "g"; rate = st.knitting_machine || 0; isMachine = true; }
          else { key = "manual"; rate = st.knitting_manual || 0; isMachine = false; }
          if (!(key in freeBy) || rate <= 0) continue;
          const want = isMachine ? o.assignedMachines : o.assignedWorkers;
          const free = freeBy[key];
          let cap = free;
          if (want != null && want > 0) cap = Math.min(cap, want);
          const need = Math.ceil(remaining / rate);
          const give = Math.min(need, cap);
          // operator asked for `want` but the pool couldn't supply it today → record short
          if (want != null && want > 0) {
            const intended = Math.min(want, need);
            if (give < intended) shortEvents.push({ jobId: o.id, soNumber: o.soNumber, styleName: o.styleName, pool: key, want, got: give });
          }
          if (give <= 0) continue;
          const produced = Math.min(remaining, give * rate);
          if (produced > 0 && !o.stageStart.knitting) o.stageStart.knitting = dStr;
          o.completed.knitting += produced;
          if (!o.startDate) o.startDate = dStr;
          if (o.completed.knitting >= o.quantity && !o.stageFinish.knitting) o.stageFinish.knitting = dStr;
          o.peakKnit = Math.max(o.peakKnit || 0, give);
          o.knitUnit = isMachine ? "machines" : "workers";
          o.stagePeak = o.stagePeak || {};
          o.stagePeak.knitting = o.peakKnit;
          freeBy[key] -= give; usedBy[key] += give;
          alloc.push({ soId: o.soId, soNumber: o.soNumber, styleName: o.styleName, pool: key, unit: isMachine ? "machines" : "workers", count: give, pieces: produced });
        }

        const pools = {};
        kpDefs.forEach((p) => { pools[p.key] = { label: p.label, avail: p.avail, used: usedBy[p.key], unit: p.unit, demand: demandBy[p.key], assigned: assignedByPool[p.key], over: Math.max(0, demandBy[p.key] - p.avail) }; });
        const totalAvail = kpDefs.reduce((n, p) => n + p.avail, 0);
        const totalUsed = kpDefs.reduce((n, p) => n + usedBy[p.key], 0);
        const totalDemand = kpDefs.reduce((n, p) => n + demandBy[p.key], 0);
        const totalOver = kpDefs.reduce((n, p) => n + Math.max(0, demandBy[p.key] - p.avail), 0);
        util.knitting = { workersAvail: totalAvail, workersUsed: totalUsed, demandWorkers: totalDemand, free: Math.max(0, totalAvail - totalUsed), utilization: totalAvail ? Math.round((totalUsed / totalAvail) * 1000) / 10 : 0, overCapacity: totalOver, alloc, pools, assignedByPool, shortEvents };
        return;
      }

      // ---- Stages this style doesn't go through at all: pull straight
      // through to match upstream, every day, using no worker capacity. ----
      live.forEach((o, idx) => {
        if (!(o.style.skipStages || []).includes(stage)) return;
        const upstream = o.completed[STAGES[i - 1]]; // live/same-day value — a skipped stage takes zero time
        if (upstream <= o.completed[stage]) return;
        if (!o.stageStart[stage]) o.stageStart[stage] = dStr;
        o.completed[stage] = upstream;
        if (o.completed[stage] >= o.quantity && !o.stageFinish[stage]) o.stageFinish[stage] = dStr;
      });

      // ---- Generic single-pool stage ----
      const pool = poolsFor(stage, resources)[0];
      const workersAvail = pool.workers;
      let workersUsed = 0, demandWorkers = 0;
      const waiting = live.map((o, idx) => {
        if ((o.style.skipStages || []).includes(stage)) return { idx, avail: 0, style: o.style, workers: 0, pieces: 0 };
        const upstream = snap[idx].completed[STAGES[i - 1]];
        const avail = Math.max(0, upstream - snap[idx].completed[stage]);
        return { idx, avail, style: o.style, workers: 0, pieces: 0 };
      }).filter((w) => w.avail > 0);

      waiting.forEach((w) => { const rate = w.style[stage] || 0; if (rate > 0) demandWorkers += Math.ceil(w.avail / rate); });

      let free = workersAvail;
      for (const w of waiting) {
        if (free <= 0) break;
        const rate = w.style[stage] || 0; if (rate <= 0) continue;
        const give = Math.min(Math.ceil(w.avail / rate), free);
        if (give <= 0) continue;
        const produced = Math.min(w.avail, give * rate);
        const o = live[w.idx];
        if (produced > 0 && !o.stageStart[stage]) o.stageStart[stage] = dStr;
        o.completed[stage] += produced;
        if (o.completed[stage] >= o.quantity && !o.stageFinish[stage]) o.stageFinish[stage] = dStr;
        w.workers = give; w.pieces = produced;
        free -= give; workersUsed += give;
        o.stagePeak = o.stagePeak || {};
        o.stagePeak[stage] = Math.max(o.stagePeak[stage] || 0, give);
        alloc.push({ soId: o.soId, soNumber: o.soNumber, styleName: o.styleName, pool: "-", unit: "workers", count: give, pieces: produced });
      }
      util[stage] = { workersAvail, workersUsed, demandWorkers, free: Math.max(0, workersAvail - workersUsed), utilization: workersAvail ? Math.round((workersUsed / workersAvail) * 1000) / 10 : 0, overCapacity: Math.max(0, demandWorkers - workersAvail), alloc };
    });

    live.forEach((o) => { if (!o.done && o.completed.packing >= o.quantity) { o.done = true; o.completionDate = dStr; } });
    if (dStr <= todayStr) live.forEach((o) => { o.asOfToday = { ...o.completed }; });

    let bottleneck = null, best = -1;
    STAGES.forEach((s) => { if (util[s].utilization > best) { best = util[s].utilization; bottleneck = s; } });
    daily.push({ date: dStr, util, bottleneck, overCapacity: STAGES.filter((s) => util[s].overCapacity > 0) });
    day = calendar.next(addDays(day, 1));
  }

  // ---- Per-job progress as of today ----
  const boardResult = [];
  if (boardMode) {
    const machinesByJob = {};
    machineState.forEach((m) => {
      m.queue.forEach((blk) => {
        (machinesByJob[blk.key] = machinesByJob[blk.key] || new Set()).add(m.id);
        boardResult.push({ blockId: blk.id, machineId: m.id, gauge: m.gauge, jobKey: blk.key, soId: blk.job.soId, soNumber: blk.job.soNumber, styleName: blk.job.styleName, qty: blk.qty, start: blk.start || null, finish: blk.finish || null });
      });
    });
    live.forEach((o) => { if (machinesByJob[o.id]) { o.peakKnit = machinesByJob[o.id].size; o.knitUnit = "machines"; } });
  }

  const jobResults = live.map((o) => {
    let currentIdx = STAGES.length, started = o.asOfToday.knitting > 0;
    for (let k = 0; k < STAGES.length; k++) { if (o.asOfToday[STAGES[k]] < o.quantity) { currentIdx = k; break; } }
    const completedToday = o.asOfToday.packing >= o.quantity;
    const progressUnits = STAGES.reduce((n, s) => n + o.asOfToday[s], 0);
    return { soId: o.soId, soNumber: o.soNumber, customerName: o.customerName, styleName: o.styleName, quantity: o.quantity, packedToday: o.asOfToday.packing, progressUnits, dueDate: o.dueDate, priority: o.priority, startDate: o.startDate, completionDate: o.completionDate, stageStart: o.stageStart, stageFinish: o.stageFinish, stagePeak: o.stagePeak || {}, currentIdx: Math.min(currentIdx, STAGES.length - 1), started, completedToday, done: o.done, jobId: o.id, peakKnit: o.peakKnit || 0, knitUnit: o.knitUnit || (o.style.method === "machine" ? "machines" : "workers") };
  });

  const soMap = new Map();
  const jobDetails = {};
  jobResults.forEach((j) => {
    jobDetails[j.jobId] = { peakKnit: j.peakKnit, unit: j.knitUnit, completionDate: j.completionDate, soId: j.soId, soNumber: j.soNumber, customerName: j.customerName, styleName: j.styleName, quantity: j.quantity, dueDate: j.dueDate, stageStart: j.stageStart, stageFinish: j.stageFinish, stagePeak: j.stagePeak };
    let so = soMap.get(j.soId);
    if (!so) { so = { soId: j.soId, soNumber: j.soNumber, customerName: j.customerName, dueDate: j.dueDate, priority: j.priority, quantity: 0, packedToday: 0, progressUnits: 0, rejectPanels: 0, startDate: null, allDone: true, anyStarted: false, allCompletedToday: true, stageStart: {}, stageFinish: {}, currentIdx: STAGES.length - 1 }; soMap.set(j.soId, so); }
    so.quantity += j.quantity; so.packedToday += j.packedToday; so.progressUnits += j.progressUnits; so.rejectPanels += j.peakKnit;
    if (j.startDate && (!so.startDate || j.startDate < so.startDate)) so.startDate = j.startDate;
    so.currentIdx = Math.min(so.currentIdx, j.currentIdx);
    if (!j.done) so.allDone = false;
    if (j.started) so.anyStarted = true;
    if (!j.completedToday) so.allCompletedToday = false;
    STAGES.forEach((s) => {
      if (j.stageStart[s] && (!so.stageStart[s] || j.stageStart[s] < so.stageStart[s])) so.stageStart[s] = j.stageStart[s];
      if (j.stageFinish[s] && (!so.stageFinish[s] || j.stageFinish[s] > so.stageFinish[s])) so.stageFinish[s] = j.stageFinish[s];
    });
  });

  const orders = [...soMap.values()].map((so) => {
    const completionDate = so.allDone ? (so.stageFinish.packing || null) : null;
    let currentStage = "completed";
    if (!so.anyStarted) currentStage = "not_started";
    else if (!so.allCompletedToday) currentStage = STAGES[so.currentIdx];
    return { id: so.soId, soNumber: so.soNumber, customerName: so.customerName, quantity: so.quantity, dueDate: so.dueDate, priority: so.priority, startDate: so.startDate, completionDate, stageStart: so.stageStart, stageFinish: so.stageFinish, currentStage, rejectPanels: so.rejectPanels, percent: Math.min(100, Math.round((so.progressUnits / (so.quantity * STAGES.length)) * 100)), daysRemaining: completionDate ? calendar.workingDaysBetween(todayStr, completionDate) : null, delayRisk: completionDate && so.dueDate ? completionDate > so.dueDate : false };
  });
  orders.sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));

  // ---- Capacity (knitting expanded per pool) ----
  const capacity = [];
  const peakUnit = (getUsed, getAvail, getDemand, label, unit) => {
    let peakUsed = 0, peakUtil = 0, demandPeak = 0, avail = getAvail(), fullDays = 0, firstFullDate = null;
    daily.forEach((d) => {
      const u = getUsed(d);
      peakUsed = Math.max(peakUsed, u);
      demandPeak = Math.max(demandPeak, getDemand(d));
      const ut = avail ? (u / avail) * 100 : 0;
      peakUtil = Math.max(peakUtil, ut);
      if (avail > 0 && u >= avail) { fullDays++; if (!firstFullDate) firstFullDate = d.date; }
    });
    return { label, unit, workersAvail: avail, peakUsed, peakUtil: Math.round(peakUtil * 10) / 10, demandPeak, fullDays, firstFullDate };
  };
  STAGES.forEach((s) => {
    if (s === "knitting") {
      kpDefs.forEach((p) => {
        capacity.push({ stage: "knitting", key: p.key, ...peakUnit(
          (d) => d.util.knitting.pools[p.key]?.used || 0,
          () => p.avail,
          (d) => d.util.knitting.pools[p.key]?.demand || 0,
          p.label, p.unit) });
      });
    } else {
      const avail = stageWorkerCount(s, resources);
      capacity.push({ stage: s, key: s, ...peakUnit((d) => d.util[s].workersUsed, () => avail, (d) => d.util[s].demandWorkers, STAGE_LABELS[s], "workers") });
    }
  });

  const avgUtil = {};
  STAGES.forEach((s) => { const vals = daily.map((d) => d.util[s].utilization); avgUtil[s] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0; });
  let bottleneckStage = null, bestAvg = -1;
  STAGES.forEach((s) => { if (avgUtil[s] > bestAvg) { bestAvg = avgUtil[s]; bottleneckStage = s; } });

  // ---- Over-allocation warnings (knitting): assigned > available on overlapping days ----
  const allocWarnings = [];
  kpDefs.forEach((p) => {
    let peak = 0; const overDates = []; const shortMap = {};
    daily.forEach((d) => {
      const a = d.util.knitting.assignedByPool?.[p.key] || 0;
      if (a > peak) peak = a;
      if (a > p.avail) overDates.push(d.date);
      (d.util.knitting.shortEvents || []).forEach((ev) => {
        if (ev.pool !== p.key) return;
        if (!shortMap[ev.jobId]) shortMap[ev.jobId] = { soNumber: ev.soNumber, styleName: ev.styleName, want: ev.want, minGot: ev.got };
        else shortMap[ev.jobId].minGot = Math.min(shortMap[ev.jobId].minGot, ev.got);
      });
    });
    if (peak > p.avail) {
      allocWarnings.push({ pool: p.key, label: p.label, unit: p.unit, avail: p.avail, peakAssigned: peak, firstDate: overDates[0] || null, days: overDates.length, shorted: Object.values(shortMap) });
    }
  });

  return { orders, daily, capacity, avgUtil, jobDetails, allocWarnings, board: boardResult, boardMode, bottleneckStage, bottleneckUtil: bestAvg, overCapacityDays: daily.filter((d) => d.overCapacity.length > 0), finished: live.every((o) => o.done) };
}
