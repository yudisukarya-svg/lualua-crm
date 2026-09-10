import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { dispatchFromPacking, getDispatchedQty } from "@/hooks/useShipments";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export default function DispatchDialog({ open, onOpenChange, order, onSaved }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [dispatched, setDispatched] = useState(0);
  const [form, setForm] = useState({ qty: "", shipping_date: "", courier: "", tracking_number: "", destination_country: "" });

  const totalQty = (order?.sales_order_lines || []).reduce((n, l) => n + (l.quantity || 0), 0);

  useEffect(() => {
    if (open && order) {
      getDispatchedQty(order.id).then((already) => {
        setDispatched(already);
        setForm({
          qty: Math.max(0, totalQty - already) || "",
          shipping_date: new Date().toISOString().slice(0, 10),
          courier: "", tracking_number: "", destination_country: "",
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order]);

  const remaining = Math.max(0, totalQty - dispatched);

  const submit = async () => {
    if (!(Number(form.qty) > 0)) { toast({ variant: "destructive", title: "Enter a quantity to dispatch" }); return; }
    setBusy(true);
    try {
      const res = await dispatchFromPacking(order, form);
      const fully = res.dispatchedQty >= res.totalQty;
      toast({ title: "Dispatch recorded", description: fully ? "Fully dispatched — order marked done." : `${res.dispatchedQty}/${res.totalQty} pcs dispatched so far.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Dispatch failed", description: e.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch — {order?.so_number}</DialogTitle>
          <DialogDescription>
            {dispatched > 0 ? `${dispatched}/${totalQty} pcs already dispatched · ${remaining} remaining.` : `${totalQty} pcs total.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Pieces to dispatch</Label>
            <Input type="number" min="1" max={remaining || undefined} value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Shipping date</Label>
            <Input type="date" value={form.shipping_date}
              onChange={(e) => setForm((f) => ({ ...f, shipping_date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Courier</Label>
            <Input value={form.courier} onChange={(e) => setForm((f) => ({ ...f, courier: e.target.value }))} placeholder="e.g. DHL" />
          </div>
          <div className="space-y-1.5">
            <Label>Tracking number</Label>
            <Input value={form.tracking_number} onChange={(e) => setForm((f) => ({ ...f, tracking_number: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Destination country</Label>
            <Input value={form.destination_country} onChange={(e) => setForm((f) => ({ ...f, destination_country: e.target.value }))} />
          </div>
        </div>
        {Number(form.qty) > 0 && Number(form.qty) < remaining && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            This is a partial dispatch — {remaining - Number(form.qty)} pcs will still be marked undispatched after this.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Record dispatch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
