import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { createPlannedOrder, updatePlannedOrder } from "@/hooks/usePlannedOrders";
import { useStyles } from "@/hooks/useStyles";
import { useCustomers } from "@/hooks/useCustomers";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const EMPTY = { order_code: "", customer_id: "", style_id: "", quantity: "", earliest_start: "", due_date: "", status: "planned" };

export default function PlannedOrderFormDialog({ open, onOpenChange, order, onSaved }) {
  const { toast } = useToast();
  const { styles } = useStyles();
  const { customers } = useCustomers();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(order);

  useEffect(() => {
    if (open) {
      setForm(order
        ? { ...EMPTY, ...order, customer_id: order.customer_id || "", style_id: order.style_id || "" }
        : { ...EMPTY, earliest_start: new Date().toISOString().slice(0, 10) });
    }
  }, [open, order]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.style_id) { toast({ variant: "destructive", title: "Please choose a style" }); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast({ variant: "destructive", title: "Quantity must be greater than 0" }); return; }
    setBusy(true);
    try {
      if (editing) await updatePlannedOrder(order.id, form);
      else await createPlannedOrder(form);
      toast({ title: editing ? "Order updated" : "Order added to plan" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit planned order" : "New planned order"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Order code</Label>
            <Input value={form.order_code} onChange={set("order_code")} placeholder="e.g. ORD-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Quantity (pcs)</Label>
            <Input type="number" min="1" value={form.quantity} onChange={set("quantity")} />
          </div>
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={set("customer_id")}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Style</Label>
            <Select value={form.style_id} onValueChange={set("style_id")}>
              <SelectTrigger><SelectValue placeholder="Choose a style" /></SelectTrigger>
              <SelectContent>
                {styles.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Earliest start</Label>
            <Input type="date" value={form.earliest_start || ""} onChange={set("earliest_start")} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={form.due_date || ""} onChange={set("due_date")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="in_production">In production</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {styles.length === 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 sm:col-span-2">
              You have no styles yet. Create a style first (Planning → Styles) so the system knows production speeds.
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save" : "Add to plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
