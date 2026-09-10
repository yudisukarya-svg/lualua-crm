import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { createShipment, updateShipment } from "@/hooks/useShipments";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SHIPMENT_STATUSES } from "@/lib/constants";
import { humanize } from "@/lib/utils";

const EMPTY = {
  shipping_date: "", courier: "", tracking_number: "",
  destination_country: "", status: "pending",
};

export default function ShipmentDialog({ open, onOpenChange, shipment, projectId, customerId, defaultCountry, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(shipment);

  useEffect(() => {
    if (open) setForm(shipment ? { ...EMPTY, ...shipment } : { ...EMPTY, destination_country: defaultCountry || "" });
  }, [open, shipment, defaultCountry]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        project_id: projectId,
        customer_id: customerId ?? null,
        shipping_date: form.shipping_date || null,
        courier: form.courier || null,
        tracking_number: form.tracking_number || null,
        destination_country: form.destination_country || null,
        status: form.status,
      };
      if (editing) await updateShipment(shipment.id, payload);
      else await createShipment(payload);
      toast({ title: editing ? "Shipment updated" : "Shipment created" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit shipment" : "New shipment"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Shipping date</Label>
            <Input type="date" value={form.shipping_date || ""} onChange={set("shipping_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Courier</Label>
            <Input value={form.courier} onChange={set("courier")} placeholder="DHL, FedEx…" />
          </div>
          <div className="space-y-1.5">
            <Label>Tracking number</Label>
            <Input value={form.tracking_number} onChange={set("tracking_number")} />
          </div>
          <div className="space-y-1.5">
            <Label>Destination country</Label>
            <Input value={form.destination_country} onChange={set("destination_country")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIPMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Invoice and packing-list documents can be attached from the Files tab (Shipping Documents folder).
          </p>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save" : "Create shipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
