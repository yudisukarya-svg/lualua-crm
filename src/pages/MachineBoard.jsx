import { useState } from "react";
import { Wand2, Loader2, X, Power, ArrowRightLeft, Cpu, Plus, ChevronUp, ChevronDown, Printer, Split, Clock, Check, Pause, Play, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchedule, buildJobs } from "@/hooks/useSchedule";
import { useMachines, autoFillBoard, moveBlock, removeBlock, setMachineActive, addBlock, setBlockSeq, splitBlock, addReservation, removeReservation, completeBlock, holdBlock, resumeBlock } from "@/hooks/useMachines";
import { useDynamicBoard } from "@/hooks/useDynamicBoard";
import { computeSchedule } from "@/lib/scheduler";
import { printMachineBoard } from "@/lib/printPlan";
import MachineTimeline from "@/components/MachineTimeline";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const fmtDate = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");
const GAUGE_LABEL = { "7": "7 gauge", "5": "5 gauge", "12": "12 gauge" };

export default function MachineBoard() {
  const { schedule, raw, loading, refetch } = useSchedule();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [splitState, setSplitState] = useState({ open: false, block: null, qty: "", target: "", startAfter: "" });
  const [resState, setResState] = useState({ open: false, machine: null, date: new Date().toISOString().slice(0, 10), hours: 2, label: "", so_number: "", zoho_salesorder_id: "", style_name: "" });
  const [soPicker, setSoPicker] = useState({ open: false, list: [], loading: false, q: "", step: "so", so: null, styles: [] });
  const [holdDialog, setHoldDialog] = useState({ open: false, block: null, reason: "" });

  // Enrich blocks with the fields the dynamic-tracking hook needs (SO number
  // to query PO Tukang by, planned pace to judge ahead/behind). Safe with
  // raw == null (still loading) — the hook just won't have anything to do yet.
  const soByIdEarly = {}; (raw?.salesOrders || []).forEach((so) => { soByIdEarly[so.id] = so; });
  const machineByIdEarly = {}; (raw?.machines || []).forEach((m) => { machineByIdEarly[m.id] = m; });
  const enrichedBlocks = (raw?.blocks || []).map((b) => ({
    ...b,
    _soNumber: soByIdEarly[b.sales_order_id]?.so_number || null,
    _machineName: machineByIdEarly[b.machine_id]?.name || null,
    _planRate: raw?.styles?.[b.style_id]?.knitting_machine || 0,
  }));
  const soNumbers = [...new Set(enrichedBlocks.map((b) => b._soNumber).filter(Boolean))];

  const { dynamic, refetch: refetchDynamic } = useDynamicBoard({
    soNumbers, blocks: enrichedBlocks, stylesById: raw?.styles || {},
    holidays: raw?.holidays, settings: raw?.settings,
    onAutoCompleted: () => { refetch(); refetchDynamic(); },
  });

  // A second, local schedule run using actual remaining qty in place of the
  // static plan qty for any block with real delivery data. Machines still
  // process their queue in the same order — a block that's genuinely ahead
  // or behind naturally finishes sooner/later in this simulation, which
  // pushes every later block on that machine forward or back with it. That
  // cascading isn't separate logic — it's the same day-by-day engine the
  // rest of the app already relies on, just fed different numbers.
  const dynamicBoardResult = raw ? computeSchedule({
    jobs: buildJobs(raw.salesOrders, raw.styles),
    resources: raw.resources, settings: raw.settings, holidays: raw.holidays,
    today: new Date().toISOString().slice(0, 10), priorityMode: raw.settings?.priority_mode || "fifo",
    machines: raw.machines,
    blocks: enrichedBlocks
      .filter((b) => (b.status || "active") === "active")
      .map((b) => dynamic[b.id] ? { ...b, qty: Math.max(0, Math.ceil(dynamic[b.id].remainingQty)) } : b),
    reservations: raw.reservations,
  }) : null;

  if (loading || !raw) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;

  const machines = raw.machines || [];
  const workHours = Number(raw.settings?.work_hours_per_day) > 0 ? Number(raw.settings.work_hours_per_day) : 8;
  const board = dynamicBoardResult?.board || schedule?.board || [];
  // group board blocks by machine
  const blocksByMachine = {};
  (raw.blocks || []).forEach((b) => { (blocksByMachine[b.machine_id] = blocksByMachine[b.machine_id] || []).push(b); });
  const resByMachine = {};
  (raw.reservations || []).forEach((r) => { (resByMachine[r.machine_id] = resByMachine[r.machine_id] || []).push(r); });
  // schedule dates keyed by block id (a machine can hold several styles of one SO)
  const dates = {};
  board.forEach((b) => { dates[b.blockId] = b; });

  const soById = {}; (raw.salesOrders || []).forEach((so) => { soById[so.id] = so; });
  const styleName = (styleId) => raw.salesOrders.flatMap((so) => so.sales_order_lines || []).find((l) => l.style_id === styleId)?.production_styles?.name || "—";

  const runAutoFill = async () => {
    setBusy(true);
    try {
      const n = await autoFillBoard(raw.salesOrders, raw.styles, machines);
      toast({ title: "Board auto-filled", description: `${n} block(s) placed.` });
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Auto-fill failed", description: e.message }); }
    finally { setBusy(false); }
  };

  const doMove = async (block, targetMachineId) => {
    try {
      const targetQueue = (blocksByMachine[targetMachineId] || []);
      const nextSeq = targetQueue.length ? Math.max(...targetQueue.map((b) => b.seq)) + 1 : 0;
      await moveBlock(block.id, targetMachineId, nextSeq);
      toast({ title: "Block moved" });
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Move failed", description: e.message }); }
  };

  const doRemove = async (block) => {
    try { await removeBlock(block.id); toast({ title: "Block removed" }); await refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Remove failed", description: e.message }); }
  };

  const doComplete = async (block) => {
    try { await completeBlock(block.id); toast({ title: "Marked as done", description: "Knitting finished — cleared from the queue." }); await refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Failed", description: e.message }); }
  };

  const doHold = async () => {
    try {
      await holdBlock(holdDialog.block.id, holdDialog.reason.trim());
      toast({ title: "Order put on hold", description: "It stays on this machine, but won't consume forecast time until resumed." });
      setHoldDialog({ open: false, block: null, reason: "" });
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: e.message }); }
  };

  const doResume = async (block) => {
    try { await resumeBlock(block.id); toast({ title: "Resumed" }); await refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Failed", description: e.message }); }
  };

  // Reorder within a machine: swap seq with the neighbour, then dates recompute.
  const reorder = async (queue, idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= queue.length) return;
    const a = queue[idx], b = queue[j];
    try {
      await setBlockSeq(a.id, b.seq);
      await setBlockSeq(b.id, a.seq);
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Reorder failed", description: e.message }); }
  };

  const doPrint = () => {
    printMachineBoard({ machines, board, blocks: (raw.blocks || []).filter((b) => (b.status || "active") === "active"), soById, styleNameFn: styleName, reservations: raw.reservations || [], stylesMap: raw.styles || {} });
  };

  const openSoPicker = async () => {
    setSoPicker({ open: true, list: [], loading: true, q: "", step: "so", so: null, styles: [] });
    const { data, error } = await supabase.rpc("list_zoho_orders");
    if (error) toast({ variant: "destructive", title: "Couldn't load orders", description: error.message });
    setSoPicker((s) => ({ ...s, list: data || [], loading: false }));
  };

  const pickSo = async (row) => {
    setSoPicker((s) => ({ ...s, step: "style", so: row, loading: true, styles: [], q: "" }));
    const { data, error } = await supabase.rpc("list_zoho_order_styles", { p_zoho_id: row.zoho_id });
    if (error) toast({ variant: "destructive", title: "Couldn't load styles", description: error.message });
    setSoPicker((s) => ({ ...s, styles: data || [], loading: false }));
  };

  const pickStyle = (st) => {
    setResState((s) => ({ ...s, so_number: soPicker.so.so_number, zoho_salesorder_id: soPicker.so.zoho_id, style_name: st.style_name }));
    setSoPicker((s) => ({ ...s, open: false }));
  };

  const doAddReservation = async () => {
    try {
      await addReservation({ machine_id: resState.machine.id, date: resState.date, hours: resState.hours, label: resState.label, so_number: resState.so_number, zoho_salesorder_id: resState.zoho_salesorder_id, style_name: resState.style_name });
      toast({ title: "Hours reserved", description: `${resState.hours}h on ${resState.machine.name}.` });
      setResState((s) => ({ ...s, open: false, label: "", so_number: "", zoho_salesorder_id: "", style_name: "" }));
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Reserve failed", description: e.message }); }
  };

  const doRemoveReservation = async (id) => {
    try { await removeReservation(id); toast({ title: "Reservation removed" }); await refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Remove failed", description: e.message }); }
  };

  const doSplit = async () => {
    const { block, qty, target, startAfter } = splitState;
    try {
      const q = (blocksByMachine[target] || []);
      const nextSeq = q.length ? Math.max(...q.map((b) => b.seq)) + 1 : 0;
      await splitBlock(block, Number(qty), target, nextSeq, startAfter || null);
      toast({ title: "Block split" });
      setSplitState({ open: false, block: null, qty: "", target: "", startAfter: "" });
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Split failed", description: e.message }); }
  };

  const toggleActive = async (m) => {
    try { await setMachineActive(m.id, !m.active); toast({ title: m.active ? "Machine marked broken" : "Machine active" }); await refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Update failed", description: e.message }); }
  };

  // Machine-knit quantities not yet on the board — either never placed, or short after
  // an order's quantity changed. Re-add without disturbing the rest of the board.
  const placedQtyByKey = {};
  (raw.blocks || []).forEach((b) => {
    const k = `${b.sales_order_id}:${b.style_id}`;
    placedQtyByKey[k] = (placedQtyByKey[k] || 0) + (Number(b.qty) || 0);
  });
  const unplaced = [];
  (raw.salesOrders || []).forEach((so) => {
    if (so.status === "cancelled" || so.status === "done") return;
    const byStyle = {};
    (so.sales_order_lines || []).forEach((l) => {
      const st = raw.styles[l.style_id];
      if (!st || st.method !== "machine") return;
      byStyle[l.style_id] = (byStyle[l.style_id] || 0) + (Number(l.quantity) || 0);
    });
    Object.entries(byStyle).forEach(([styleId, qty]) => {
      const placed = placedQtyByKey[`${so.id}:${styleId}`] || 0;
      const remaining = qty - placed;
      if (remaining <= 0) return;
      unplaced.push({ soId: so.id, soNumber: so.so_number, customerName: so.customers?.customer_name || "—", styleId, styleName: styleName(styleId), qty: remaining, ordered: qty, placed, gauge: raw.styles[styleId].gauge });
    });
  });

  const doAdd = async (item, machineId) => {
    try {
      const q = (blocksByMachine[machineId] || []);
      const nextSeq = q.length ? Math.max(...q.map((b) => b.seq)) + 1 : 0;
      await addBlock(machineId, item.soId, item.styleId, item.qty, nextSeq);
      toast({ title: "Order placed", description: `${item.soNumber} added.` });
      await refetch();
    } catch (e) { toast({ variant: "destructive", title: "Add failed", description: e.message }); }
  };

  // group machines by gauge for display
  const gauges = ["7", "5", "12"].filter((g) => machines.some((m) => m.gauge === g));

  return (
    <>
      <PageHeader title="Machine board" subtitle="Each machine's knitting queue. This drives the knitting forecast.">
        <Button variant="outline" onClick={doPrint}><Printer className="h-4 w-4" /> Print</Button>
        <Button onClick={runAutoFill} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Auto-fill</Button>
      </PageHeader>

      {machines.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No machines set up yet.</Card>
      ) : (
        <div className="space-y-6">
          {unplaced.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-amber-800">Unplaced orders ({unplaced.length})</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                <p className="mb-1 text-xs text-amber-700">These machine quantities aren't on any machine yet (removed, held, or the order quantity changed after auto-fill). Add them to a machine — the rest of the board stays as is.</p>
                {unplaced.map((item) => {
                  const targets = machines.filter((m) => m.gauge === item.gauge && m.active);
                  return (
                    <div key={`${item.soId}:${item.styleId}`} className="flex items-center justify-between rounded-md border bg-white p-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{item.soNumber} <span className="font-normal text-muted-foreground">· {item.qty} pcs · {item.gauge}g</span></div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.customerName ? `${item.customerName} · ` : ""}{item.styleName}{item.placed > 0 ? ` — ${item.placed} of ${item.ordered} pcs already on machines` : ""}
                        </div>
                      </div>
                      {targets.length > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="shrink-0"><Plus className="h-4 w-4" /> Add to…</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Add to machine</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {targets.map((tm) => <DropdownMenuItem key={tm.id} onClick={() => doAdd(item, tm.id)}>{tm.name}</DropdownMenuItem>)}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">No active {item.gauge}g machine</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          {gauges.map((g) => (
            <div key={g}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{GAUGE_LABEL[g]}</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {machines.filter((m) => m.gauge === g).map((m) => {
                  const queue = (blocksByMachine[m.id] || []).filter((b) => (b.status || "active") !== "done").sort((a, b) => a.seq - b.seq);
                  const otherMachines = machines.filter((x) => x.gauge === g && x.id !== m.id && x.active);
                  return (
                    <Card key={m.id} className={m.active ? "" : "opacity-60"}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-semibold">{m.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          {!m.active && <Badge variant="destructive" className="text-[10px]">Broken</Badge>}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Reserve hours (sample / maintenance)"
                            onClick={() => setResState((s) => ({ ...s, open: true, machine: m }))}>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title={m.active ? "Mark broken" : "Mark active"} onClick={() => toggleActive(m)}>
                            <Power className={`h-4 w-4 ${m.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1.5">
                        {(resByMachine[m.id] || []).sort((a, b) => a.date.localeCompare(b.date)).map((r) => (
                          <div key={r.id} className="flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 p-2 text-sm">
                            <div className="min-w-0">
                              <div className="font-medium text-sky-900">
                                {r.hours}h · {r.so_number ? r.so_number : (r.kind === "sample" ? "Sample" : r.kind)}
                              </div>
                              <div className="truncate text-xs text-sky-700">
                                {fmtDate(r.date)}{r.style_name ? ` · ${r.style_name}` : (r.so_number ? " · Sample" : "")}{r.label ? ` · ${r.label}` : ""}
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Remove reservation" onClick={() => doRemoveReservation(r.id)}><X className="h-4 w-4" /></Button>
                          </div>
                        ))}
                        {queue.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">Idle — no blocks.</p>
                        ) : (
                          queue.map((b, idx) => {
                            const d = dates[b.id];
                            const so = soById[b.sales_order_id];
                            const rate = raw.styles?.[b.style_id]?.knitting_machine || 0;
                            const dyn = dynamic[b.id];
                            let daySpan = null;
                            if (d?.start && d?.finish) {
                              daySpan = Math.round((new Date(d.finish + "T00:00:00") - new Date(d.start + "T00:00:00")) / 86400000) + 1;
                            }
                            const isHold = b.status === "hold";
                            return (
                              <div key={b.id} className={`flex items-center justify-between rounded-md border p-2 text-sm ${isHold ? "border-amber-300 bg-amber-50/60" : dyn ? (dyn.paceStatus === "behind" ? "border-red-200" : dyn.paceStatus === "ahead" ? "border-emerald-200" : "") : ""}`}>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    {so?.so_number || "—"}{" "}
                                    <span className="font-normal text-muted-foreground">
                                      · {dyn ? `${Math.ceil(dyn.remainingQty)} of ${dyn.initialQty} pcs left` : `${b.qty} pcs`}
                                    </span>
                                    {isHold && <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700">On hold</Badge>}
                                    {!isHold && dyn && dyn.paceStatus === "ahead" && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" titleAccess="Ahead of plan" />}
                                    {!isHold && dyn && dyn.paceStatus === "behind" && <TrendingDown className="h-3.5 w-3.5 text-red-500" titleAccess="Behind plan" />}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {so?.customers?.customer_name ? `${so.customers.customer_name} · ` : ""}{styleName(b.style_id)}
                                  </div>
                                  {isHold ? (
                                    <div className="truncate text-xs text-amber-700">{b.hold_reason || "Paused — no reason given"}</div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">{fmtDate(d?.start)} → {fmtDate(d?.finish)}</div>
                                  )}
                                  {!isHold && dyn ? (
                                    <div className={`text-xs ${dyn.paceStatus === "behind" ? "text-red-600" : dyn.paceStatus === "ahead" ? "text-emerald-600" : "text-muted-foreground"}`}>
                                      {dyn.pace.toFixed(1)} pcs/day actual (plan {rate}){dyn.etaDate ? ` • ETA ${fmtDate(dyn.etaDate)}` : ""}
                                    </div>
                                  ) : (
                                    !isHold && rate > 0 && (
                                      <div className="text-xs text-muted-foreground">
                                        {rate} pcs/day{daySpan ? ` • ~${daySpan} day${daySpan === 1 ? "" : "s"}` : ""}
                                      </div>
                                    )
                                  )}
                                </div>
                                <div className="grid shrink-0 grid-cols-2 gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} title="Move up" onClick={() => reorder(queue, idx, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === queue.length - 1} title="Move down" onClick={() => reorder(queue, idx, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                                  {otherMachines.length > 0 && b.qty > 1 ? (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Split to another machine"
                                      onClick={() => setSplitState({ open: true, block: b, qty: Math.floor(b.qty / 2), target: otherMachines[0].id, startAfter: new Date().toISOString().slice(0, 10) })}>
                                      <Split className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : <span />}
                                  {otherMachines.length > 0 ? (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Move to another machine"><ArrowRightLeft className="h-3.5 w-3.5" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {otherMachines.map((tm) => (
                                          <DropdownMenuItem key={tm.id} onClick={() => doMove(b, tm.id)}>{tm.name}</DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  ) : <span />}
                                  {isHold ? (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-600 hover:text-amber-700" title="Resume — bring this order back into the active queue" onClick={() => doResume(b)}><Play className="h-3.5 w-3.5" /></Button>
                                  ) : (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-600 hover:text-amber-700" title="Hold — pause here (waiting for approval, spec change, etc.)" onClick={() => setHoldDialog({ open: true, block: b, reason: "" })}><Pause className="h-3.5 w-3.5" /></Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-600 hover:text-emerald-700" title="Mark as done (knitting finished)" onClick={() => doComplete(b)}><Check className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Remove block" onClick={() => doRemove(b)}><X className="h-3.5 w-3.5" /></Button>
                                  <span />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {machines.length > 0 && (
        <div className="mt-6">
          <MachineTimeline machines={machines} board={board} reservations={raw.reservations || []} settings={raw.settings || {}} />
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Auto-fill spreads machine-knit orders across the least-busy machines by due date. You can move a block to another machine of the same gauge, remove it, or mark a machine broken (its work then needs moving). The forecast on the Planning page reflects this board.
      </p>
      <Dialog open={splitState.open} onOpenChange={(o) => setSplitState((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split block</DialogTitle>
            <DialogDescription>
              {splitState.block ? `${soById[splitState.block.sales_order_id]?.so_number || ""} · ${splitState.block.qty} pcs — move part of it to another machine so they run in parallel.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pieces to move</Label>
              <Input type="number" min="1" max={splitState.block ? splitState.block.qty - 1 : 1}
                value={splitState.qty} onChange={(e) => setSplitState((s) => ({ ...s, qty: e.target.value }))} />
              {splitState.block && (
                <p className="text-xs text-muted-foreground">
                  Stays here: {Math.max(0, splitState.block.qty - (Number(splitState.qty) || 0))} pcs · Moves: {Number(splitState.qty) || 0} pcs
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Move to machine</Label>
              <Select value={splitState.target} onValueChange={(v) => setSplitState((s) => ({ ...s, target: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose machine" /></SelectTrigger>
                <SelectContent>
                  {splitState.block && machines
                    .filter((m) => m.active && m.id !== splitState.block.machine_id &&
                      m.gauge === machines.find((x) => x.id === splitState.block.machine_id)?.gauge)
                    .map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Starts on (target machine)</Label>
              <Input type="date" value={splitState.startAfter}
                onChange={(e) => setSplitState((s) => ({ ...s, startAfter: e.target.value }))} />
              <p className="text-xs text-muted-foreground">
                The moved portion won't be scheduled before this date — set it to when the machine actually becomes free.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitState({ open: false, block: null, qty: "", target: "", startAfter: "" })}>Cancel</Button>
            <Button onClick={doSplit} disabled={!splitState.target || !(Number(splitState.qty) > 0)}>Split</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={holdDialog.open} onOpenChange={(o) => setHoldDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold order</DialogTitle>
            <DialogDescription>
              {holdDialog.block ? `${soById[holdDialog.block.sales_order_id]?.so_number || ""} stays on this machine, but stops consuming forecast time until you resume it.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (optional, but shows on the board so anyone knows why it's stuck)</Label>
            <Input placeholder="e.g. Waiting for customer approval, spec change" value={holdDialog.reason}
              onChange={(e) => setHoldDialog((s) => ({ ...s, reason: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialog({ open: false, block: null, reason: "" })}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={doHold}><Pause className="h-4 w-4" /> Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={resState.open} onOpenChange={(o) => setResState((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reserve hours — {resState.machine?.name}</DialogTitle>
            <DialogDescription>Block time on this machine for a sample, trial, or maintenance. Production that day drops by the reserved share of the {workHours}-hour day.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={resState.date} onChange={(e) => setResState((s) => ({ ...s, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Hours</Label>
                <Input type="number" min="0.5" max={workHours} step="0.5" value={resState.hours} onChange={(e) => setResState((s) => ({ ...s, hours: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sales order and style</Label>
              <div className="flex items-center gap-2">
                <Input readOnly placeholder="No order selected" value={resState.so_number ? `${resState.so_number}${resState.style_name ? " · " + resState.style_name : ""}` : ""} className="flex-1" />
                <Button type="button" variant="outline" onClick={openSoPicker}>Choose</Button>
                {resState.so_number && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" title="Clear"
                    onClick={() => setResState((s) => ({ ...s, so_number: "", zoho_salesorder_id: "", style_name: "" }))}><X className="h-4 w-4" /></Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Pick the order, then the style — so the sample is official and traceable.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input placeholder="e.g. size set, second trial" value={resState.label} onChange={(e) => setResState((s) => ({ ...s, label: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">
              That day this machine works {Math.max(0, workHours - (Number(resState.hours) || 0))} of {workHours} hours on production.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResState((s) => ({ ...s, open: false }))}>Cancel</Button>
            <Button onClick={doAddReservation} disabled={!(Number(resState.hours) > 0)}>Reserve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={soPicker.open} onOpenChange={(o) => setSoPicker((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{soPicker.step === "so" ? "Choose sales order" : `Choose style — ${soPicker.so?.so_number}`}</DialogTitle>
            <DialogDescription>
              {soPicker.step === "so" ? "Step 1 of 2 — pick the order this sample belongs to." : "Step 2 of 2 — pick which style the sample is for."}
            </DialogDescription>
          </DialogHeader>

          {soPicker.step === "style" && (
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setSoPicker((s) => ({ ...s, step: "so", q: "" }))}>
              ← Back to orders
            </Button>
          )}

          <Input placeholder={soPicker.step === "so" ? "Search SO number or customer…" : "Search style…"}
            value={soPicker.q} onChange={(e) => setSoPicker((s) => ({ ...s, q: e.target.value }))} />

          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {soPicker.loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : soPicker.step === "so" ? (
              soPicker.list
                .filter((r) => { const s = soPicker.q.toLowerCase(); return !s || (r.so_number || "").toLowerCase().includes(s) || (r.customer_name || "").toLowerCase().includes(s); })
                .map((r) => (
                  <button key={r.zoho_id} type="button" onClick={() => pickSo(r)}
                    className="flex w-full items-center justify-between rounded-md border p-2.5 text-left text-sm hover:bg-muted/50">
                    <span><span className="font-medium">{r.so_number}</span> · {r.customer_name}</span>
                    <span className="flex items-center gap-2">
                      {r.imported && <Badge variant="secondary" className="text-[10px]">In CRM</Badge>}
                      <span className="text-xs text-muted-foreground">{r.item_count} item(s) →</span>
                    </span>
                  </button>
                ))
            ) : (
              soPicker.styles
                .filter((st) => { const s = soPicker.q.toLowerCase(); return !s || (st.style_name || "").toLowerCase().includes(s); })
                .map((st, i) => (
                  <button key={i} type="button" onClick={() => pickStyle(st)}
                    className="flex w-full items-center justify-between rounded-md border p-2.5 text-left text-sm hover:bg-muted/50">
                    <span className="font-medium">{st.style_name}</span>
                    <span className="text-xs text-muted-foreground">{Number(st.qty)} pcs on order</span>
                  </button>
                ))
            )}
            {!soPicker.loading && soPicker.step === "style" && soPicker.styles.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No styles found on this order.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
