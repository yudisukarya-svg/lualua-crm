import { useState, useMemo } from "react";
import { Cpu, Loader2, Save } from "lucide-react";
import { useSchedule } from "@/hooks/useSchedule";
import { useResources } from "@/hooks/useResources";
import { setJobMachines } from "@/hooks/useSalesOrders";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default function MachinePlanning() {
  const { raw, schedule, loading, refetch, runMachineWhatIf } = useSchedule();
  const { resources } = useResources();
  const { toast } = useToast();
  const [picks, setPicks] = useState({}); // `${soId}:${styleId}` -> machines (string)
  const [busy, setBusy] = useState(false);

  // Machine-knit jobs derived from sales orders.
  const jobs = useMemo(() => {
    if (!raw) return [];
    const out = [];
    raw.salesOrders.forEach((so) => {
      if (so.status === "cancelled" || so.status === "done") return;
      const byStyle = {};
      (so.sales_order_lines || []).forEach((l) => {
        const st = raw.styles[l.style_id];
        if (!st || st.method !== "machine") return;
        if (!byStyle[l.style_id]) byStyle[l.style_id] = { qty: 0, name: l.production_styles?.name || "—", assigned: null };
        byStyle[l.style_id].qty += Number(l.quantity) || 0;
        if (l.assigned_machines != null) byStyle[l.style_id].assigned = l.assigned_machines;
      });
      Object.entries(byStyle).forEach(([styleId, info]) => {
        const st = raw.styles[styleId];
        out.push({
          key: `${so.id}:${styleId}`, soId: so.id, styleId, soNumber: so.so_number,
          customerName: so.customers?.customer_name || "—", styleName: info.name,
          gauge: st.gauge, rate: st.knitting_machine || 0, qty: info.qty,
          assigned: info.assigned,
          available: raw.resources[`machine_${st.gauge}g`] || 0,
        });
      });
    });
    return out;
  }, [raw]);

  // Live preview using the operator's current picks.
  const preview = useMemo(() => {
    const override = {};
    Object.entries(picks).forEach(([k, v]) => { if (v !== "" && v != null) override[k] = Number(v); });
    return runMachineWhatIf(override);
  }, [picks, runMachineWhatIf]);

  const finishById = {};
  (preview?.orders ?? schedule?.orders ?? []).forEach((o) => { finishById[o.id] = o.completionDate; });

  const machinePools = (resources || []).filter((r) => r.id.startsWith("machine_"));

  const pickFor = (j) => (picks[j.key] ?? (j.assigned != null ? String(j.assigned) : ""));
  const knitDays = (j) => {
    const m = Number(pickFor(j)) || j.available;
    if (!m || !j.rate) return null;
    return Math.ceil(j.qty / (m * j.rate));
  };

  const saveOne = async (j) => {
    setBusy(true);
    try {
      const v = picks[j.key];
      await setJobMachines(j.soId, j.styleId, v === "" ? null : v);
      toast({ title: `Saved machines for ${j.soNumber}` });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally { setBusy(false); }
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <PageHeader title="Machine planning" subtitle="Decide how many machines each order uses — the schedule updates from your choice" />

      {/* Pool summary */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {machinePools.map((p) => (
          <Card key={p.id} className="p-4">
            <p className="text-sm font-medium">{p.label}</p>
            <p className="mt-1 text-2xl font-semibold text-primary">{Math.max(0, p.count - (p.reserved || 0))}</p>
            <p className="text-xs text-muted-foreground">available · {p.count} total{p.reserved ? `, ${p.reserved} for sampling` : ""}</p>
          </Card>
        ))}
      </div>

      {jobs.length === 0 ? (
        <EmptyState icon={Cpu} title="No machine orders"
          description="Orders using a machine-knit style will appear here. Set a style's knitting method to 'Automatic machine' in Styles." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Order</th>
                <th className="px-3 py-2 text-left">Style</th>
                <th className="px-3 py-2 text-center">Gauge</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-center">Available</th>
                <th className="px-3 py-2 text-center">Machines to use</th>
                <th className="px-3 py-2 text-center">≈ Knit days</th>
                <th className="px-3 py-2 text-left">Forecast finish</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.key} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">{j.soNumber}<span className="block text-xs font-normal text-muted-foreground">{j.customerName}</span></td>
                  <td className="px-3 py-2 text-muted-foreground">{j.styleName}</td>
                  <td className="px-3 py-2 text-center">{j.gauge}g</td>
                  <td className="px-3 py-2 text-center">{j.qty}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{j.available}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number" min="1" max={j.available}
                      className="mx-auto w-20 text-center"
                      placeholder={`all ${j.available}`}
                      value={picks[j.key] ?? (j.assigned != null ? String(j.assigned) : "")}
                      onChange={(e) => setPicks((s) => ({ ...s, [j.key]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">{knitDays(j) ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{finishById[j.soId] ? formatDate(finishById[j.soId]) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => saveOne(j)}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Leave "Machines to use" blank to let an order use all available machines of its gauge. "≈ Knit days" is a quick estimate; the Forecast finish (after you Save) is the full schedule including every stage and other orders.
      </p>
    </>
  );
}
