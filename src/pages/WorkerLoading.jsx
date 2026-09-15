import { useState, useMemo } from "react";
import { Users, Wand2 } from "lucide-react";
import { useSchedule } from "@/hooks/useSchedule";
import { STAGES, STAGE_LABELS } from "@/lib/scheduler";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatDate, todayLocalStr } from "@/lib/utils";

const POOLS = [
  ["knitting_machine", "Knitting — Machine"], ["knitting_manual", "Knitting — Manual"],
  ["linking", "Linking"], ["finishing", "Finishing"], ["steam", "Steam"],
  ["label", "Label Sewing"], ["qc", "Final QC"], ["packing", "Packing"],
];

export default function WorkerLoading() {
  const { schedule, loading, runCapacityWhatIf } = useSchedule();
  const [date, setDate] = useState("");
  const [extra, setExtra] = useState({});
  const [whatIf, setWhatIf] = useState(null);

  const today = todayLocalStr();
  const dayList = schedule?.daily ?? [];

  // default day: today if present, else first working day in the plan
  const selectedDate = useMemo(() => {
    if (date) return date;
    if (dayList.some((d) => d.date === today)) return today;
    return dayList[0]?.date || "";
  }, [date, dayList, today]);

  const dayEntry = dayList.find((d) => d.date === selectedDate) || null;

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Calculating…</p>;
  if (!schedule || schedule.orders.length === 0) {
    return (
      <>
        <PageHeader title="Worker loading" subtitle="Who is working on what, and who is free" />
        <EmptyState icon={Users} title="No active orders" description="Add sales orders in Planning to see worker allocation." />
      </>
    );
  }

  const calc = () => setWhatIf(runCapacityWhatIf(extra));
  const setExtraVal = (k, v) => setExtra((s) => ({ ...s, [k]: v }));

  // before/after finish per SO for the what-if
  const beforeById = {}; schedule.orders.forEach((o) => { beforeById[o.id] = o; });

  return (
    <>
      <PageHeader title="Worker loading" subtitle="Who is working on what each day, and how many workers are free" />

      <div className="mb-4 flex items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Show day</Label>
          <Input type="date" className="w-44" value={selectedDate} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">Pick any working day in the plan to see that day's allocation.</p>
      </div>

      {!dayEntry ? (
        <Card className="p-6"><p className="text-sm text-muted-foreground">No production scheduled on {formatDate(selectedDate)} (it may be a day off or outside the plan).</p></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {STAGES.map((s) => {
            const u = dayEntry.util[s];
            return (
              <Card key={s} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{STAGE_LABELS[s]}</h3>
                  <span className="text-xs text-muted-foreground">
                    {u.workersUsed}/{u.workersAvail} working · <span className={u.free > 0 ? "text-emerald-600" : "text-muted-foreground"}>{u.free} free</span>
                  </span>
                </div>
                {u.alloc.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No work at this stage today — all {u.workersAvail} workers free for other orders.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {u.alloc.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="truncate">
                          <span className="font-medium">{a.soNumber}</span>
                          <span className="text-muted-foreground"> · {a.styleName}{a.pool && a.pool !== "-" ? ` · ${a.pool}` : ""}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {a.count} {a.unit === "machines" ? (a.count > 1 ? "machines" : "machine") : (a.count > 1 ? "workers" : "worker")} · {a.pieces} pcs
                        </span>
                      </li>
                    ))}
                    {u.free > 0 && <li className="text-xs text-emerald-600">+ {u.free} free for other orders</li>}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Extra-workers what-if */}
      <Card className="mt-6 p-6">
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">What-if: add extra workers</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Enter how many <em>extra</em> workers/machines to add temporarily at each stage, then Calculate to preview the effect. This does not change your saved resources (do that in Resources).
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POOLS.map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input type="number" min="0" placeholder="+0" value={extra[k] ?? ""} onChange={(e) => setExtraVal(k, e.target.value)} />
            </div>
          ))}
        </div>
        <Button className="mt-3" variant="outline" onClick={calc}>Calculate effect</Button>

        {whatIf && (
          <div className="mt-4">
            <p className="mb-2 text-sm">
              New bottleneck: <strong>{whatIf.bottleneckStage ? STAGE_LABELS[whatIf.bottleneckStage] : "—"}</strong> ({whatIf.bottleneckUtil}% avg).
              {whatIf.overCapacityDays.length === 0 ? <span className="text-emerald-600"> Within capacity.</span> : <span className="text-rose-600"> Still over capacity on {whatIf.overCapacityDays.length} day(s).</span>}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">SO</th><th className="px-3 py-2 text-left">Finish now</th><th className="px-3 py-2 text-left">Finish with extra</th></tr>
                </thead>
                <tbody>
                  {whatIf.orders.map((o) => {
                    const before = beforeById[o.id];
                    const improved = before?.completionDate && o.completionDate && o.completionDate < before.completionDate;
                    return (
                      <tr key={o.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{o.soNumber}</td>
                        <td className="px-3 py-2 text-muted-foreground">{before?.completionDate ? formatDate(before.completionDate) : "—"}</td>
                        <td className={`px-3 py-2 ${improved ? "font-medium text-emerald-600" : "text-muted-foreground"}`}>{o.completionDate ? formatDate(o.completionDate) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
