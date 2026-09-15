import { useState, useMemo } from "react";
import { Cpu, HandMetal, Loader2, Save, AlertTriangle } from "lucide-react";
import { useSchedule } from "@/hooks/useSchedule";
import { useResources } from "@/hooks/useResources";
import { setJobMachines, setJobWorkers } from "@/hooks/useSalesOrders";
import { makeCalendar } from "@/lib/scheduler";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, todayLocalStr } from "@/lib/utils";

export default function KnittingPlanning() {
  const { raw, schedule, loading, refetch, runKnittingWhatIf } = useSchedule();
  const { resources } = useResources();
  const { toast } = useToast();
  const [picks, setPicks] = useState({});
  const [busyKey, setBusyKey] = useState(null);

  const today = todayLocalStr();

  const jobs = useMemo(() => {
    if (!raw) return [];
    const cal = makeCalendar({ sundayOff: raw.settings.sunday_off, saturdayOff: raw.settings.saturday_off, holidays: raw.holidays });
    const out = [];
    raw.salesOrders.forEach((so) => {
      if (so.status === "cancelled" || so.status === "done") return;
      const byStyle = {};
      (so.sales_order_lines || []).forEach((l) => {
        const st = raw.styles[l.style_id];
        if (!st) return;
        if (!byStyle[l.style_id]) byStyle[l.style_id] = { qty: 0, name: l.production_styles?.name || "—", machines: null, workers: null };
        byStyle[l.style_id].qty += Number(l.quantity) || 0;
        if (l.assigned_machines != null) byStyle[l.style_id].machines = l.assigned_machines;
        if (l.assigned_workers != null) byStyle[l.style_id].workers = l.assigned_workers;
      });
      Object.entries(byStyle).forEach(([styleId, info]) => {
        const st = raw.styles[styleId];
        const isMachine = st.method === "machine";
        const available = isMachine ? (raw.resources[`machine_${st.gauge}g`] || 0) : (raw.resources.knitting_manual || 0);
        const rate = isMachine ? (st.knitting_machine || 0) : (st.knitting_manual || 0);
        // suggested = fewest resources to still meet the due date (quick estimate)
        let suggested = available;
        if (so.due_date && rate > 0) {
          const wd = cal.workingDaysBetween(today, so.due_date);
          if (wd > 0) suggested = Math.min(available, Math.max(1, Math.ceil(info.qty / (rate * wd))));
        }
        out.push({
          key: `${so.id}:${styleId}`, soId: so.id, styleId, soNumber: so.so_number,
          customerName: so.customers?.customer_name || "—", styleName: info.name,
          isMachine, gauge: st.gauge, rate, qty: info.qty, available, suggested,
          assigned: isMachine ? info.machines : info.workers,
        });
      });
    });
    return out;
  }, [raw, today]);

  const preview = useMemo(() => {
    const override = {};
    Object.entries(picks).forEach(([k, v]) => { if (v !== "" && v != null) override[k] = Number(v); });
    return runKnittingWhatIf(override);
  }, [picks, runKnittingWhatIf]);

  const finishBySo = {};
  (preview?.orders ?? schedule?.orders ?? []).forEach((o) => { finishBySo[o.id] = o.completionDate; });
  const rejectByJob = preview?.jobDetails ?? schedule?.jobDetails ?? {};
  const totalReject = Object.values(rejectByJob).reduce((n, d) => n + (d.peakKnit || 0), 0);
  const warnings = preview?.allocWarnings ?? schedule?.allocWarnings ?? [];

  const valFor = (j) => (picks[j.key] ?? (j.assigned != null ? String(j.assigned) : ""));
  const knitDays = (j) => { const m = Number(valFor(j)) || j.available; return m && j.rate ? Math.ceil(j.qty / (m * j.rate)) : null; };

  const save = async (j) => {
    setBusyKey(j.key);
    try {
      const v = picks[j.key];
      if (j.isMachine) await setJobMachines(j.soId, j.styleId, v === "" ? null : v);
      else await setJobWorkers(j.soId, j.styleId, v === "" ? null : v);
      toast({ title: `Saved ${j.soNumber}` });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally { setBusyKey(null); }
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;

  const manual = jobs.filter((j) => !j.isMachine);
  const machine = jobs.filter((j) => j.isMachine);
  const machinePools = (resources || []).filter((r) => r.id.startsWith("machine_"));

  const Section = ({ title, icon: Icon, list, unitLabel }) => (
    <Card className="mb-6 overflow-x-auto">
      <div className="flex items-center gap-2 border-b px-4 py-3"><Icon className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{title}</h3></div>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No {unitLabel} orders right now.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Style</th>
              {unitLabel === "machine" && <th className="px-3 py-2 text-center">Gauge</th>}
              <th className="px-3 py-2 text-center">Qty</th>
              <th className="px-3 py-2 text-center">Available</th>
              <th className="px-3 py-2 text-center">Suggested</th>
              <th className="px-3 py-2 text-center">{unitLabel === "machine" ? "Machines" : "Workers"} to use</th>
              <th className="px-3 py-2 text-center">≈ Knit days</th>
              <th className="px-3 py-2 text-left">Forecast finish</th>
              <th className="px-3 py-2 text-center">Reject panels</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.key} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-medium">{j.soNumber}<span className="block text-xs font-normal text-muted-foreground">{j.customerName}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{j.styleName}</td>
                {unitLabel === "machine" && <td className="px-3 py-2 text-center">{j.gauge}g</td>}
                <td className="px-3 py-2 text-center">{j.qty}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{j.available}</td>
                <td className="px-3 py-2 text-center"><span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{j.suggested}</span></td>
                <td className="px-3 py-2">
                  <Input type="number" min="1" max={j.available} className="mx-auto w-20 text-center"
                    placeholder={`all ${j.available}`}
                    value={picks[j.key] ?? (j.assigned != null ? String(j.assigned) : "")}
                    onChange={(e) => setPicks((s) => ({ ...s, [j.key]: e.target.value }))} />
                </td>
                <td className="px-3 py-2 text-center">{knitDays(j) ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{finishBySo[j.soId] ? formatDate(finishBySo[j.soId]) : "—"}</td>
                <td className="px-3 py-2 text-center">{rejectByJob[j.key]?.peakKnit ?? (Number(valFor(j)) || j.available)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" disabled={busyKey === j.key} onClick={() => save(j)}>
                    {busyKey === j.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader title="Knitting planning" subtitle="Choose workers/machines per order — fewer = more consistent & fewer reject panels, when time allows" />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm font-medium">Manual workers</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{raw?.resources.knitting_manual || 0}</p>
          <p className="text-xs text-muted-foreground">available</p>
        </Card>
        {machinePools.map((p) => (
          <Card key={p.id} className="p-4">
            <p className="text-sm font-medium">{p.label.replace("Knitting Machine — ", "")}</p>
            <p className="mt-1 text-2xl font-semibold text-primary">{Math.max(0, p.count - (p.reserved || 0))}</p>
            <p className="text-xs text-muted-foreground">{p.count} total{p.reserved ? `, ${p.reserved} sampling` : ""}</p>
          </Card>
        ))}
      </div>

      {(schedule?.boardMode) && (
        <div className="mb-5 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <div className="font-medium">The Machine Board now drives knitting.</div>
          <p className="mt-1 text-sky-800">
            Actual machine allocation and dates come from <strong>Machine Board</strong>. The machine numbers below are only a
            planning aid — they tell Auto-fill how many machines to spread an order across. Changing them here does not move work
            on its own.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-5 space-y-2">
          {warnings.map((w) => (
            <div key={w.pool} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {w.label}: assigned {w.peakAssigned} of {w.avail} {w.unit} on overlapping days
              </div>
              <p className="mt-1">
                Over by {w.peakAssigned - w.avail} {w.unit}{w.firstDate ? ` · first ${formatDate(w.firstDate)} (${w.days} day${w.days > 1 ? "s" : ""})` : ""}.
                {w.shorted.length > 0 && " On those days the system gives fewer than you set: "}
                {w.shorted.map((s, i) => (
                  <span key={i}>{i > 0 ? "; " : ""}<strong>{s.soNumber}</strong> · {s.styleName} got {s.minGot} of {s.want}</span>
                ))}
                {w.shorted.length > 0 ? "." : ""} Lower the numbers so the total fits {w.avail}.
              </p>
            </div>
          ))}
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState icon={Cpu} title="No knitting orders" description="Add sales orders in Planning to assign knitting resources here." />
      ) : (
        <>
          <Section title="Manual knitting" icon={HandMetal} list={manual} unitLabel="worker" />
          <Section title="Automatic machine knitting" icon={Cpu} list={machine} unitLabel="machine" />
          <p className="text-sm">Total setup / reject panels across all knitting orders: <strong>{totalReject}</strong> panels (one per worker or machine that runs a style).</p>
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        "Suggested" is the fewest resources that still meet the due date. Leave blank to use all available. Reject panels are shown to guide your choice — they don't change the schedule timing.
      </p>
    </>
  );
}
