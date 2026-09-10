import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { createPurchaseOrder, updatePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PO_STATUSES } from "@/lib/constants";
import { humanize } from "@/lib/utils";

const EMPTY = {
  po_number: "", po_date: "", quantity: "", unit_price: "",
  total_amount: "", currency: "USD", status: "draft",
};

export default function PurchaseOrderDialog({ open, onOpenChange, order, projectId, customerId, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(order);

  useEffect(() => {
    if (open) setForm(order ? { ...EMPTY, ...order } : EMPTY);
  }, [open, order]);

  const set = (k) => (e) => setForm((f) => {
    const next = { ...f, [k]: e?.target ? e.target.value : e };
    // Auto-fill total when qty + unit price present and total untouched
    if ((k === "quantity" || k === "unit_price") && next.quantity && next.unit_price) {
      next.total_amount = (Number(next.quantity) * Number(next.unit_price)).toFixed(2);
    }
    return next;
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        project_id: projectId,
        customer_id: customerId ?? null,
        po_number: form.po_number || null,
        po_date: form.po_date || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        unit_price: form.unit_price ? Number(form.unit_price) : null,
        total_amount: form.total_amount ? Number(form.total_amount) : null,
        currency: form.currency,
        status: form.status,
      };
      if (editing) await updatePurchaseOrder(order.id, payload);
      else await createPurchaseOrder(payload);
      toast({ title: editing ? "PO updated" : "PO created" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit purchase order" : "New purchase order"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>PO number</Label>
            <Input value={form.po_number} onChange={set("po_number")} />
          </div>
          <div className="space-y-1.5">
            <Label>PO date</Label>
            <Input type="date" value={form.po_date || ""} onChange={set("po_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" min="0" value={form.quantity} onChange={set("quantity")} />
          </div>
          <div className="space-y-1.5">
            <Label>Unit price</Label>
            <Input type="number" step="0.01" min="0" value={form.unit_price} onChange={set("unit_price")} />
          </div>
          <div className="space-y-1.5">
            <Label>Total amount</Label>
            <Input type="number" step="0.01" min="0" value={form.total_amount} onChange={set("total_amount")} />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={form.currency} onChange={set("currency")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save" : "Create PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
