import { useMemo } from "react";

const CELL = 26; // px per day
const NAME_W = 92;

const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);
const dayNum = (s) => toDate(s).getUTCDate();
const monthLabel = (s) => toDate(s).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const nice = (s) => toDate(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

// Stable colour per sales order.
const PALETTE = [
  { bar: "bg-orange-500", soft: "bg-orange-100 text-orange-800" },
  { bar: "bg-sky-500", soft: "bg-sky-100 text-sky-800" },
  { bar: "bg-emerald-500", soft: "bg-emerald-100 text-emerald-800" },
  { bar: "bg-violet-500", soft: "bg-violet-100 text-violet-800" },
  { bar: "bg-amber-500", soft: "bg-amber-100 text-amber-800" },
  { bar: "bg-rose-500", soft: "bg-rose-100 text-rose-800" },
  { bar: "bg-teal-500", soft: "bg-teal-100 text-teal-800" },
];
const colourFor = (key) => {
  let h = 0;
  for (let i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) % 9973;
  return PALETTE[h % PALETTE.length];
};

export default function MachineTimeline({ machines = [], board = [], reservations = [], settings = {} }) {
  const sundayOff = settings.sunday_off ?? true;
  const saturdayOff = settings.saturday_off ?? false;

  const { dates, byMachine, resByMachineDate, freeFrom } = useMemo(() => {
    const withDates = board.filter((b) => b.start && b.finish);
    const starts = withDates.map((b) => b.start).concat((reservations || []).map((r) => r.date));
    const finishes = withDates.map((b) => b.finish).concat((reservations || []).map((r) => r.date));
    const todayStr = fmt(new Date());
    const min = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : todayStr;
    const max = finishes.length ? finishes.reduce((a, b) => (a > b ? a : b)) : todayStr;

    const from = toDate(min < todayStr ? min : todayStr);
    const to = addDays(toDate(max), 3);
    const list = [];
    for (let d = from; d <= to && list.length < 120; d = addDays(d, 1)) list.push(fmt(d));

    // date -> block, per machine
    const bm = {};
    withDates.forEach((b) => {
      const map = (bm[b.machineId] = bm[b.machineId] || {});
      for (let d = toDate(b.start); d <= toDate(b.finish); d = addDays(d, 1)) map[fmt(d)] = b;
    });

    const rm = {};
    (reservations || []).forEach((r) => {
      const map = (rm[r.machine_id] = rm[r.machine_id] || {});
      map[r.date] = (map[r.date] || 0) + Number(r.hours || 0);
    });

    // when each machine becomes free
    const ff = {};
    machines.forEach((m) => {
      const mine = withDates.filter((b) => b.machineId === m.id);
      ff[m.id] = mine.length ? fmt(addDays(toDate(mine.reduce((a, b) => (a.finish > b.finish ? a : b)).finish), 1)) : null;
    });

    return { dates: list, byMachine: bm, resByMachineDate: rm, freeFrom: ff };
  }, [board, reservations, machines]);

  if (machines.length === 0) return null;

  const isOff = (ds) => { const w = toDate(ds).getUTCDay(); return (w === 0 && sundayOff) || (w === 6 && saturdayOff); };
  const todayStr = fmt(new Date());

  // month header spans
  const months = [];
  dates.forEach((d) => {
    const label = monthLabel(d);
    const last = months[months.length - 1];
    if (last && last.label === label) last.span += 1;
    else months.push({ label, span: 1 });
  });

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Machine timeline</h3>
        <p className="text-xs text-muted-foreground">Coloured = blocked by an order · blue dot = sample/maintenance hours · grey = day off</p>
      </div>

      <div className="overflow-x-auto p-3">
        <div style={{ minWidth: NAME_W + dates.length * CELL }}>
          {/* month row */}
          <div className="flex">
            <div style={{ width: NAME_W }} />
            {months.map((m, i) => (
              <div key={i} style={{ width: m.span * CELL }} className="border-l pl-1 text-[11px] font-medium text-muted-foreground">
                {m.label}
              </div>
            ))}
          </div>

          {/* day numbers */}
          <div className="flex items-end">
            <div style={{ width: NAME_W }} />
            {dates.map((d) => (
              <div key={d} style={{ width: CELL }}
                className={`text-center text-[10px] ${d === todayStr ? "font-bold text-primary" : isOff(d) ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                {dayNum(d)}
              </div>
            ))}
          </div>

          {/* machine rows */}
          <div className="mt-1 space-y-1">
            {machines.map((m) => {
              const row = byMachine[m.id] || {};
              const res = resByMachineDate[m.id] || {};
              return (
                <div key={m.id} className="flex items-center">
                  <div style={{ width: NAME_W }} className="pr-2 text-xs">
                    <div className={`font-medium ${m.active ? "" : "text-muted-foreground line-through"}`}>{m.name}</div>
                    <div className="text-[10px] text-muted-foreground">{m.gauge}g</div>
                  </div>
                  {dates.map((d) => {
                    const b = row[d];
                    const hours = res[d];
                    const off = isOff(d);
                    const c = b ? colourFor(b.soNumber) : null;
                    const first = b && (!row[fmt(addDays(toDate(d), -1))] || row[fmt(addDays(toDate(d), -1))].blockId !== b.blockId);
                    return (
                      <div key={d} style={{ width: CELL }} className="relative h-8 px-[1px]">
                        <div
                          title={b ? `${b.soNumber} · ${b.styleName} · ${b.qty} pcs (${nice(b.start)} → ${nice(b.finish)})` : off ? "Day off" : "Free"}
                          className={`h-full rounded-sm ${b ? c.bar : off ? "bg-muted" : "bg-muted/30"} ${!m.active ? "opacity-40" : ""}`}
                        />
                        {first && (
                          <span className="pointer-events-none absolute left-1 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold text-white drop-shadow">
                            {b.soNumber}
                          </span>
                        )}
                        {hours > 0 && (
                          <span title={`${hours}h reserved (sample / maintenance)`}
                            className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-white bg-sky-500" />
                        )}
                        {d === todayStr && <span className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-primary/70" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* availability summary */}
      <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
        {machines.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs">
            <span className="font-medium">{m.name} <span className="font-normal text-muted-foreground">· {m.gauge}g</span></span>
            {!m.active ? (
              <span className="text-rose-600">Broken</span>
            ) : freeFrom[m.id] ? (
              <span className="text-muted-foreground">Free from {nice(freeFrom[m.id])}</span>
            ) : (
              <span className="text-emerald-600">Free now</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
