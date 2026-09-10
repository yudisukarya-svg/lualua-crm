import { useState } from "react";
import { Plus, Pencil, Trash2, ClipboardList, AlertTriangle, TrendingUp, Wand2, Activity, Printer, Truck } from "lucide-react";
import { useSchedule } from "@/hooks/useSchedule";
import { deleteSalesOrder, READINESS_ITEMS } from "@/hooks/useSalesOrders";
import { useShipments } from "@/hooks/useShipments";
import { useActualProgress, overallActualPercent } from "@/hooks/useActualProgress";
import { updateSettings } from "@/hooks/usePlanningCalendar";
import { printOrderPlan, printDailySheet } from "@/lib/printPlan";
import ReadinessDialog from "@/components/ReadinessDialog";
import DispatchDialog from "@/components/DispatchDialog";
import { diagnoseOrder } from "@/lib/diagnose";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { STAGE_LABELS } from "@/lib/scheduler";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SalesOrderFormDialog from "@/components/SalesOrderFormDialog";
import ProgressDialog from "@/components/ProgressDialog";
import GanttChart from "@/components/GanttChart";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const MODE_LABEL = { fifo: "First in (FIFO)", edd: "Earliest due date", priority: "High priority first" };

function currentStageLabel(stage) {
  if (stage === "not_started") return "Not started";
  if (stage === "completed") return "Completed";
  return STAGE_LABELS[stage] || "—";
}

export default function Planning() {
  const { schedule, raw, loading, refetch, runWhatIf } = useSchedule();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [dialog, setDialog] = useState({ open: false, order: null });
  const [progressDialog, setProgressDialog] = useState({ open: false, order: null });
  const [dispatchDialog, setDispatchDialog] = useState({ open: false, order: null });
  const [readyDialog, setReadyDialog] = useState({ open: false, order: null });
  const [whyDialog, setWhyDialog] = useState({ open: false, order: null, issues: [] });
  const { shipments, refetch: refetchShipments } = useShipments();

  const dispatchedQty = (soId) => shipments.filter((s) => s.sales_order_id === soId).reduce((n, s) => n + (Number(s.qty) || 0), 0);

  const readyCount = (r) => READINESS_ITEMS.filter((i) => r.readiness?.[i.key]).length;

  const soNumbers = (raw?.salesOrders ?? []).map((r) => r.so_number);
  const { bySo: actualBySo } = useActualProgress(soNumbers);

  // "Actual %" now comes from confirmed tukang handovers (PO Tukang), not
  // manual entry — real ground truth, not a typed-in estimate.
  const actualPercent = (r) => {
    const qty = (r.sales_order_lines || []).reduce((n, l) => n + (l.quantity || 0), 0);
    return overallActualPercent(actualBySo[r.so_number], qty);
  };

  const [whatIfSo, setWhatIfSo] = useState("");
  const [whatIfDate, setWhatIfDate] = useState("");
  const [whatIfResult, setWhatIfResult] = useState(null);

  const mode = raw?.settings?.priority_mode || "fifo";
  const soRows = raw?.salesOrders ?? [];
  const byId = {};
  (schedule?.orders ?? []).forEach((o) => { byId[o.id] = o; });

  const changeMode = async (m) => {
    try { await updateSettings({ priority_mode: m }); refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Could not change mode", description: e.message }); }
  };

  const remove = async (id) => {
    try { await deleteSalesOrder(id); refetch(); toast({ title: "Order removed" }); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  const runWhatIfNow = () => {
    if (!whatIfSo || !whatIfDate) { toast({ variant: "destructive", title: "Pick an order and a start date" }); return; }
    setWhatIfResult(runWhatIf(whatIfSo, whatIfDate, mode));
  };

  return (
    <>
      <PageHeader title="Production planning" subtitle="Finite-capacity schedule across all live sales orders">
        <Button variant="outline" onClick={() => printDailySheet(schedule, new Date().toISOString().slice(0, 10))} disabled={!schedule}>
          <Printer className="h-4 w-4" /> Daily sheet
        </Button>
        <Button onClick={() => setDialog({ open: true, order: null })}><Plus className="h-4 w-4" /> New order</Button>
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Calculating schedule…</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Priority:</Label>
              <Select value={mode} onValueChange={changeMode}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">{MODE_LABEL.fifo}</SelectItem>
                  <SelectItem value="edd">{MODE_LABEL.edd}</SelectItem>
                  <SelectItem value="priority">{MODE_LABEL.priority}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {schedule && schedule.orders.length > 0 && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Bottleneck: <strong>{schedule.bottleneckStage ? STAGE_LABELS[schedule.bottleneckStage] : "—"}</strong> ({schedule.bottleneckUtil}%)
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 ${schedule.orders.some((o) => o.delayRisk) ? "border-rose-200 bg-rose-50 text-rose-700" : "bg-card"}`}>
                  <AlertTriangle className={`h-4 w-4 ${schedule.orders.some((o) => o.delayRisk) ? "text-rose-600" : "text-emerald-600"}`} />
                  {(() => { const n = schedule.orders.filter((o) => o.delayRisk).length; return n ? `${n} order(s) at risk of being late` : "All orders on time"; })()}
                </span>
              </div>
            )}
          </div>

          {soRows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No sales orders yet"
              description="Add a sales order to forecast when it can start and finish. Set up Styles and Resources first." />
          ) : (
            <Card className="mb-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO number</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Forecast finish</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-center">Days left</TableHead>
                    <TableHead>Current stage</TableHead>
                    <TableHead className="text-center">Forecast %</TableHead>
                    <TableHead className="text-center">Actual %</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soRows.map((r) => {
                    const f = byId[r.id];
                    const qty = (r.sales_order_lines || []).reduce((n, l) => n + (l.quantity || 0), 0);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.so_number}
                          <span className="block text-xs font-normal text-muted-foreground">{r.customers?.customer_name || "—"}</span>
                          {r.projects?.project_name && (
                            <Link to={`/projects/${r.project_id}`} className="block text-xs font-normal text-primary hover:underline">{r.projects.project_name}</Link>
                          )}
                          {(() => { const c = readyCount(r); const ok = c === READINESS_ITEMS.length;
                            return <button onClick={() => setReadyDialog({ open: true, order: r })}
                              className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {ok ? "Ready" : `Not ready · ${c}/${READINESS_ITEMS.length}`}
                            </button>; })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {qty}
                          {(() => {
                            const qcFinalQty = actualBySo[r.so_number]?.qc_final || 0;
                            const disp = dispatchedQty(r.id);
                            if (disp === 0 && qcFinalQty < qty) return null;
                            const full = disp >= qty && qty > 0;
                            return (
                              <span className={`mt-0.5 block text-[11px] font-medium ${full ? "text-emerald-700" : "text-muted-foreground"}`}>
                                {full ? "Dispatched" : `Dispatched ${disp}/${qty}`}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{f?.startDate ? formatDate(f.startDate) : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {f?.completionDate ? formatDate(f.completionDate) : (() => {
                            const issues = diagnoseOrder(r, { styles: raw.styles, resources: raw.resources, machines: raw.machines || [], blocks: raw.blocks || [], boardMode: schedule?.boardMode });
                            if (issues.length === 0) return "—";
                            return (
                              <button onClick={() => setWhyDialog({ open: true, order: r, issues })}
                                className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-200">
                                <AlertTriangle className="h-3 w-3" /> Why no forecast? ({issues.length})
                              </button>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {r.customer_deadline ? (() => {
                            const late = f?.completionDate && f.completionDate > r.customer_deadline;
                            return <span className={late ? "font-medium text-rose-600" : "text-muted-foreground"} title={late ? "Forecast finishes after the customer deadline" : undefined}>
                              {formatDate(r.customer_deadline)}
                            </span>;
                          })() : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">{f?.daysRemaining ?? "—"}</TableCell>
                        <TableCell>{f ? currentStageLabel(f.currentStage) : "—"}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{f?.percent ?? 0}%</TableCell>
                        <TableCell className="text-center font-medium">{actualPercent(r)}%</TableCell>
                        <TableCell>
                          {!r.due_date ? <span className="text-xs text-muted-foreground">No due date</span>
                            : f?.delayRisk ? <Badge className="bg-rose-100 text-rose-700">At risk</Badge>
                              : <Badge className="bg-emerald-100 text-emerald-700">On time</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Print plan sheet" onClick={() => printOrderPlan(r.id, schedule, raw)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Update actual progress" onClick={() => setProgressDialog({ open: true, order: r })}>
                            <Activity className="h-4 w-4" />
                          </Button>
                          {(actualBySo[r.so_number]?.qc_final || 0) >= qty && qty > 0 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Dispatch" onClick={() => setDispatchDialog({ open: true, order: r })}>
                              <Truck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setDialog({ open: true, order: r })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(r.id)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {soRows.length > 0 && (
            <Card className="mb-6 p-6">
              <div className="mb-3 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">What-if: try a different start date</h3>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Sales order</Label>
                  <Select value={whatIfSo} onValueChange={(v) => { setWhatIfSo(v); setWhatIfResult(null); }}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Choose an order" /></SelectTrigger>
                    <SelectContent>
                      {soRows.map((r) => <SelectItem key={r.id} value={r.id}>{r.so_number}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Trial start date</Label>
                  <Input type="date" className="w-44" value={whatIfDate} onChange={(e) => setWhatIfDate(e.target.value)} />
                </div>
                <Button type="button" variant="outline" onClick={runWhatIfNow}>Calculate</Button>
              </div>
              {whatIfResult && (
                <p className="mt-3 text-sm">
                  If <strong>{whatIfResult.soNumber}</strong> starts <strong>{formatDate(whatIfDate)}</strong>, forecast finish is{" "}
                  <strong>{whatIfResult.completionDate ? formatDate(whatIfResult.completionDate) : "—"}</strong>.
                  {whatIfResult.dueDate && (whatIfResult.delayRisk
                    ? <span className="text-rose-600"> That is after the due date ({formatDate(whatIfResult.dueDate)}).</span>
                    : <span className="text-emerald-600"> That meets the due date ({formatDate(whatIfResult.dueDate)}).</span>)}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Preview only — it doesn't change the order until you edit and save it.</p>
            </Card>
          )}

          {schedule && schedule.orders.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold">Production timeline (Gantt)</h3>
              <GanttChart orders={schedule.orders} />
            </Card>
          )}
        </>
      )}

      <SalesOrderFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        order={dialog.order}
        onSaved={refetch}
      />
      <ProgressDialog
        open={progressDialog.open}
        onOpenChange={(o) => setProgressDialog((s) => ({ ...s, open: o }))}
        order={progressDialog.order}
        onSaved={refetch}
      />
      <DispatchDialog
        open={dispatchDialog.open}
        onOpenChange={(o) => setDispatchDialog((s) => ({ ...s, open: o }))}
        order={dispatchDialog.order}
        onSaved={() => { refetch(); refetchShipments(); }}
      />
      <Dialog open={whyDialog.open} onOpenChange={(o) => setWhyDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why no forecast — {whyDialog.order?.so_number}</DialogTitle>
            <DialogDescription>Fill in the items below and the forecast will appear.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {whyDialog.issues.map((p, i) => (
              <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm">
                <div className="font-medium text-amber-900">{p.what}</div>
                <div className="text-xs text-amber-800">{p.fix}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ReadinessDialog
        open={readyDialog.open}
        onOpenChange={(o) => setReadyDialog((s) => ({ ...s, open: o }))}
        order={readyDialog.order}
        onSaved={refetch}
      />
    </>
  );
}
