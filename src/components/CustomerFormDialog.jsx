import { useState, useEffect } from "react";
import { createCustomer, updateCustomer } from "@/hooks/useCustomers";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CUSTOMER_TYPES } from "@/lib/constants";
import { humanize } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const EMPTY = {
  customer_name: "", company_name: "", country: "", contact_person: "",
  email: "", phone: "", whatsapp: "", website: "", customer_type: "new_lead", notes: "",
};

export default function CustomerFormDialog({ open, onOpenChange, customer, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(customer);

  useEffect(() => {
    if (open) setForm(customer ? { ...EMPTY, ...customer } : EMPTY);
  }, [open, customer]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        customer_name: form.customer_name, company_name: form.company_name, country: form.country,
        contact_person: form.contact_person, email: form.email, phone: form.phone,
        whatsapp: form.whatsapp, website: form.website, customer_type: form.customer_type, notes: form.notes,
      };
      if (editing) await updateCustomer(customer.id, payload);
      else await createCustomer(payload);
      toast({ title: editing ? "Customer updated" : "Customer created" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" required value={form.customer_name} onChange={set("customer_name")} />
          <Field label="Company name" value={form.company_name} onChange={set("company_name")} />
          <Field label="Country" value={form.country} onChange={set("country")} />
          <Field label="Contact person" value={form.contact_person} onChange={set("contact_person")} />
          <Field label="Email" type="email" value={form.email} onChange={set("email")} />
          <Field label="Phone" value={form.phone} onChange={set("phone")} />
          <Field label="WhatsApp" value={form.whatsapp} onChange={set("whatsapp")} />
          <Field label="Website" value={form.website} onChange={set("website")} />
          <div className="space-y-1.5">
            <Label>Customer type</Label>
            <Select value={form.customer_type} onValueChange={set("customer_type")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} rows={3} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input required={required} {...props} />
    </div>
  );
}
