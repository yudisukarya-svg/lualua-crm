import { useState, useEffect } from "react";
import { createProject, updateProject } from "@/hooks/useProjects";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PROJECT_STATUSES, PRODUCT_CATEGORIES } from "@/lib/constants";
import { humanize } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const EMPTY = {
  project_name: "", product_category: "knitwear", collection_name: "",
  quantity: "", target_price: "", currency: "USD", status: "inquiry",
  sampling_date: "", production_date: "", shipping_date: "", customer_id: "",
};

export default function ProjectFormDialog({ open, onOpenChange, project, fixedCustomerId, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(project);

  useEffect(() => {
    if (!open) return;
    setForm(project ? { ...EMPTY, ...project, customer_id: project.customer_id }
                     : { ...EMPTY, customer_id: fixedCustomerId || "" });
    if (!fixedCustomerId) {
      supabase.from("customers").select("id, customer_name").order("customer_name")
        .then(({ data }) => setCustomers(data ?? []));
    }
  }, [open, project, fixedCustomerId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) { toast({ variant: "destructive", title: "Pick a customer" }); return; }
    setBusy(true);
    try {
      const payload = {
        customer_id: form.customer_id, project_name: form.project_name,
        product_category: form.product_category, collection_name: form.collection_name || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        target_price: form.target_price ? Number(form.target_price) : null,
        currency: form.currency, status: form.status,
        sampling_date: form.sampling_date || null,
        production_date: form.production_date || null,
        shipping_date: form.shipping_date || null,
      };
      const saved = editing ? await updateProject(project.id, payload) : await createProject(payload);
      toast({ title: editing ? "Project updated" : "Project created" });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {!fixedCustomerId && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Select value={form.customer_id} onValueChange={set("customer_id")}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Project name <span className="text-destructive">*</span></Label>
            <Input required value={form.project_name} onChange={set("project_name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Product category</Label>
            <Select value={form.product_category} onValueChange={set("product_category")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{humanize(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Collection name</Label>
            <Input value={form.collection_name} onChange={set("collection_name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" min="0" value={form.quantity} onChange={set("quantity")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Target price</Label>
              <Input type="number" step="0.01" min="0" value={form.target_price} onChange={set("target_price")} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={set("currency")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Sampling date</Label>
            <Input type="date" value={form.sampling_date || ""} onChange={set("sampling_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Production date</Label>
            <Input type="date" value={form.production_date || ""} onChange={set("production_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Shipping date</Label>
            <Input type="date" value={form.shipping_date || ""} onChange={set("shipping_date")} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
