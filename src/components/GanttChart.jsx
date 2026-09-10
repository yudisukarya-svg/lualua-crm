import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STAGES, STAGE_LABELS } from "@/lib/scheduler";
import { formatDate } from "@/lib/utils";

const STAGE_COLOR = {
  knitting: "bg-[hsl(9,53%,39%)]",
  linking: "bg-[hsl(20,60%,45%)]",
  finishing: "bg-[hsl(30,65%,50%)]",
  steam: "bg-[hsl(40,70%,52%)]",
  label: "bg-[hsl(150,30%,45%)]",
  qc: "bg-[hsl(200,45%,45%)]",
  packing: "bg-[hsl(255,30%,50%)]",
};

const DAY_MS = 86400000;
const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);

export default function GanttChart({ orders }) {
  const { days, dayIndex, hasData, months } = useMemo(() => {
    let min = null, max = null;
    orders.forEach((o) => {
      STAGES.forEach((s) => {
        const a = o.stageStart[s], b = o.stageFinish[s];
        if (a && (!min || a < min)) min = a;
        if (b && (!max || b > max)) max = b;
      });
    });
    if (!min || !max) return { days: [], dayIndex: {}, hasData: false, months: [] };
    const days = [];
    const idx = {};
    let c = toDate(min); const end = toDate(max);
    let i = 0;
    while (c <= end) { const k = fmt(c); days.push(k); idx[k] = i++; c = new Date(c.getTime() + DAY_MS); }
    // group consecutive days by year-month
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months = [];
    days.forEach((d) => {
      const dt = toDate(d);
      const label = `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
      const last = months[months.length - 1];
      if (last && last.label === label) last.span += 1;
      else months.push({ label, span: 1 });
    });
    return { days, dayIndex: idx, hasData: true, months };
  }, [orders]);

  if (!hasData) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No scheduled orders to chart yet.</p>;
  }

  const COL = 26; // px per day
  const scrollRef = useRef(null);
  const scrollBy = (px) => { if (scrollRef.current) scrollRef.current.scrollLeft += px; };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {STAGES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm ${STAGE_COLOR[s]}`} />{STAGE_LABELS[s]}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => scrollBy(-COL * 7)} className="rounded-md border p-1 hover:bg-muted" title="Scroll earlier"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => scrollBy(COL * 7)} className="rounded-md border p-1 hover:bg-muted" title="Scroll later"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[65vh] overflow-auto rounded-lg border">
        <div style={{ minWidth: 220 + days.length * COL }}>
          {/* Frozen header: month band + date row stay visible while scrolling down through orders */}
          <div className="sticky top-0 z-20 bg-card">
            {/* Month band */}
            <div className="flex border-b bg-muted/60 text-[11px] font-medium">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r bg-muted/60 px-3 py-1" />
              {months.map((m, i) => (
                <div key={i} style={{ width: m.span * COL }} className="shrink-0 border-r px-2 py-1 last:border-r-0">
                  {m.label}
                </div>
              ))}
            </div>
            {/* Date header */}
            <div className="flex border-b bg-muted/40 text-[10px] text-muted-foreground">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r bg-muted/40 px-3 py-1.5 font-medium">Order</div>
              {days.map((d) => {
                const wd = toDate(d).getUTCDay();
                const weekend = wd === 0 || wd === 6;
                return (
                  <div key={d} style={{ width: COL }} className={`shrink-0 py-1.5 text-center ${weekend ? "bg-muted/60" : ""}`}>
                    {toDate(d).getUTCDate()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order rows */}
          {orders.map((o) => (
            <div key={o.id} className="flex border-b last:border-b-0">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r bg-card px-3 py-2">
                <p className="truncate text-sm font-medium">{o.soNumber || o.orderCode}</p>
                <p className="truncate text-xs text-muted-foreground">{o.customerName} · {o.quantity} pcs</p>
              </div>
              <div className="relative shrink-0" style={{ width: days.length * COL }}>
                {/* weekend shading */}
                {days.map((d, i) => {
                  const wd = toDate(d).getUTCDay();
                  if (wd !== 0 && wd !== 6) return null;
                  return <div key={d} className="absolute top-0 h-full bg-muted/40" style={{ left: i * COL, width: COL }} />;
                })}
                {/* stage lanes */}
                <div className="relative py-1.5">
                  {STAGES.map((s) => {
                    const a = o.stageStart[s], b = o.stageFinish[s];
                    if (!(a in dayIndex) || !(b in dayIndex)) {
                      return <div key={s} className="h-2 mb-0.5" />;
                    }
                    const left = dayIndex[a] * COL;
                    const width = (dayIndex[b] - dayIndex[a] + 1) * COL;
                    return (
                      <div key={s} className="relative h-2 mb-0.5">
                        <div
                          className={`absolute h-2 rounded-sm ${STAGE_COLOR[s]}`}
                          style={{ left, width: Math.max(width - 2, 4) }}
                          title={`${STAGE_LABELS[s]}: ${formatDate(a)} – ${formatDate(b)}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
