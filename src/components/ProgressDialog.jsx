import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { useQcRejects, addQcReject, deleteQcReject, QC_REJECT_REASONS } from "@/hooks/useQcRejects";
import { useActualProgress, toStagePercents } from "@/hooks/useActualProgress";
import { ACTUAL_STAGE_LABELS } from "@/lib/actualStages";
import StageProgress from "@/components/StageProgress";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export default function ProgressDialog({ open, onOpenChange, order }) {
  const { toast } = useToast();
  const { rejects, refetch: refetchRejects } = useQcRejects(order?.id);
  const [rejectForm, setRejectForm] = useState({ reason: QC_REJECT_REASONS[0], styleId: "", qty: "", note: "" });
  const [rejectBusy, setRejectBusy] = useState(false);

  const { bySo } = useActualProgress(open && order ? [order.so_number] : []);
  const totalQty = (order?.sales_order_lines || []).reduce((n, l) => n + (l.quantity || 0), 0);
  const stagePercents = toStagePercents(bySo[order?.so_number], totalQty);

  const styleOptions = Array.from(
    new Map((order?.sales_order_lines || []).map((l) => [l.style_id, l.production_styles?.name || "—"])).entries()
  );

  const submitReject = async () => {
    if (!(Number(rejectForm.qty) > 0)) return;
    setRejectBusy(true);
    try {
      await addQcReject({
        sales_order_id: order.id, style_id: rejectForm.styleId || null,
        reason: rejectForm.reason, qty: rejectForm.qty, note: rejectForm.note,
      });
      setRejectForm({ reason: QC_REJECT_REASONS[0], styleId: "", qty: "", note: "" });
      await refetchRejects();
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't log reject", description: e.message });
    } finally { setRejectBusy(false); }
  };

  const removeReject = async (id) => {
    try { await deleteQcReject(id); await refetchRejects(); }
    catch (e) { toast({ variant: "destructive", title: "Couldn't remove", description: e.message }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actual progress — {order?.so_number}</DialogTitle>
          <DialogDescription>
            Synced automatically from confirmed tukang handovers (PO Tukang) — order total: {totalQty} pcs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <StageProgress data={stagePercents} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
            {Object.entries(ACTUAL_STAGE_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2">
                <span>{label}</span>
                <span className="font-medium text-foreground">{stagePercents[key]}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          <Label className="text-sm">QC reject log</Label>
          {rejects.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {rejects.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs">
                  <span>
                    <span className="font-medium">{r.qty} pcs</span> — {r.reason}
                    {r.note ? ` (${r.note})` : ""}
                  </span>
                  <button onClick={() => removeReject(r.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={rejectForm.reason} onValueChange={(v) => setRejectForm((f) => ({ ...f, reason: v }))}>
              <SelectTrigger className="col-span-2 sm:col-span-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QC_REJECT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {styleOptions.length > 1 && (
              <Select value={rejectForm.styleId} onValueChange={(v) => setRejectForm((f) => ({ ...f, styleId: v }))}>
                <SelectTrigger><SelectValue placeholder="Style (optional)" /></SelectTrigger>
                <SelectContent>
                  {styleOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input type="number" min="1" placeholder="Qty" value={rejectForm.qty}
              onChange={(e) => setRejectForm((f) => ({ ...f, qty: e.target.value }))} />
            <Button variant="outline" size="sm" onClick={submitReject} disabled={rejectBusy || !(Number(rejectForm.qty) > 0)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <Input placeholder="Note (optional)" value={rejectForm.note}
            onChange={(e) => setRejectForm((f) => ({ ...f, note: e.target.value }))} />
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
