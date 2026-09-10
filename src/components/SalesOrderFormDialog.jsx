import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, Trash2, CloudDownload, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createSalesOrder, updateSalesOrder } from "@/hooks/useSalesOrders";
import { createProject } from "@/hooks/useProjects";
import { useStyles, createStyle } from "@/hooks/useStyles";
import { useCustomers } from "@/hooks/useCustomers";
import { useProjects } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const PRIORITIES = [{ v: 10, label: "High" }, { v: 100, label: "Normal" }, { v: 1000, label: "Low" }];
const blankLine = () => ({ style_id: "", style_name: "", colour: "", size: "", quantity: "", assigned_machines: null });
const EMPTY = { so_number: "", customer_id: "", project_id: "", earliest_start: "", due_date: "", customer_deadline: "", priority: 100, status: "planned", lines: [blankLine()] };

export default function SalesOrderFormDialog({ open, onOpenChange, order, onSaved }) {
  const { toast } = useToast();
  const { styles } = useStyles();
  const { customers } = useCustomers();
  const [form, setForm] = useState(EMPTY);
  const { projects } = useProjects({ customerId: form.customer_id || undefined });
  const [busy, setBusy] = useState(false);
  const [extraCustomers, setExtraCustomers] = useState([]);
  const [extraStyles, setExtraStyles] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [zohoList, setZohoList] = useState([]);
  const [zohoLoading, setZohoLoading] = useState(false);
  const [zohoQ, setZohoQ] = useState("");
  const [prefilling, setPrefilling] = useState(false);
  const editing = Boolean(order);

  useEffect(() => {
    if (!open) return;
    setExtraCustomers([]); setExtraStyles([]); setPickerOpen(false); setZohoQ("");
    if (order) {
      setForm({
        so_number: order.so_number || "",
        customer_id: order.customer_id || "",
        project_id: order.project_id || "",
        earliest_start: order.earliest_start || "",
        due_date: order.due_date || "",
        customer_deadline: order.customer_deadline || "",
        priority: order.priority || 100,
        status: order.status || "planned",
        lines: (order.sales_order_lines || []).map((l) => ({
          style_id: l.style_id || "", style_name: l.production_styles?.name || "", colour: l.colour || "", size: l.size || "", quantity: l.quantity ?? "", assigned_machines: l.assigned_machines ?? null,
        })),
      });
    } else {
      setForm({ ...EMPTY, earliest_start: new Date().toISOString().slice(0, 10), lines: [blankLine()] });
    }
  }, [open, order]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  // Styles available for the chosen customer (plus any with no customer set), including freshly-created Zoho styles.
  const customerStyles = useMemo(() => {
    const base = styles.filter((s) => !form.customer_id || !s.customer_id || s.customer_id === form.customer_id);
    const ids = new Set(base.map((s) => s.id));
    return [...base, ...extraStyles.filter((s) => !ids.has(s.id))];
  }, [styles, form.customer_id, extraStyles]);

  const allCustomers = useMemo(() => {
    const ids = new Set(customers.map((c) => c.id));
    return [...customers, ...extraCustomers.filter((c) => !ids.has(c.id))];
  }, [customers, extraCustomers]);

  const openPicker = async () => {
    setPickerOpen(true); setZohoLoading(true);
    const { data, error } = await supabase.rpc("list_zoho_orders");
    if (error) toast({ variant: "destructive", title: "Couldn't load Zoho orders", description: error.message });
    setZohoList((data || []).filter((r) => !r.imported));
    setZohoLoading(false);
  };

  const prefill = async (row) => {
    setPrefilling(true);
    try {
      const { data, error } = await supabase.rpc("get_zoho_order", { p_zoho_id: row.zoho_id });
      if (error) throw error;
      setExtraCustomers(data.customer_id ? [{ id: data.customer_id, customer_name: data.customer_name || "—" }] : []);
      setExtraStyles((data.styles || []).map((s) => ({ id: s.id, name: s.name, customer_id: data.customer_id })));
      setForm((f) => ({
        ...f,
        so_number: data.so_number || f.so_number,
        customer_id: data.customer_id || f.customer_id,
        due_date: data.shipment_date || f.due_date,
        earliest_start: f.earliest_start || new Date().toISOString().slice(0, 10),
        project_id: "",
        lines: (data.lines || []).map((l) => ({ style_id: l.style_id, style_name: l.style_name || "", colour: l.colour || "", size: l.size || "", quantity: l.quantity || "", assigned_machines: null })),
      }));
      setPickerOpen(false);
      toast({ title: "Prefilled from Zoho", description: `${data.so_number} — review, then save.` });
    } catch (e) { toast({ variant: "destructive", title: "Prefill failed", description: e.message }); }
    finally { setPrefilling(false); }
  };

  const setLine = (i, k, v) => setForm((f) => {
    const lines = f.lines.slice();
    lines[i] = { ...lines[i], [k]: v };
    return { ...f, lines };
  });
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }));
  const removeLine = (i) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  const totalQty = form.lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.so_number.trim()) { toast({ variant: "destructive", title: "SO number is required" }); return; }
    const usable = form.lines.filter((l) => (l.style_name?.trim() || l.style_id) && Number(l.quantity) > 0);
    if (usable.length === 0) { toast({ variant: "destructive", title: "Add at least one line with a style and quantity" }); return; }
    setBusy(true);
    try {
      // Resolve each line's style name -> style id (match existing, else create as manual).
      const known = [...styles, ...extraStyles];
      const findByName = (nm) => known.find((s) => s.name?.trim().toLowerCase() === nm.trim().toLowerCase() && (!s.customer_id || !form.customer_id || s.customer_id === form.customer_id));
      const valid = [];
      for (const l of usable) {
        let sid = null;
        const nm = (l.style_name || "").trim();
        if (nm) {
          const m = findByName(nm);
          if (m) sid = m.id;
          else { const created = await createStyle({ name: nm, customer_id: form.customer_id || null }); sid = created.id; known.push({ id: created.id, name: nm, customer_id: form.customer_id || null }); }
        } else if (l.style_id) sid = l.style_id;
        if (sid) valid.push({ style_id: sid, colour: l.colour, size: l.size, quantity: l.quantity, assigned_machines: l.assigned_machines });
      }

      let projectId = form.project_id;
      if (!editing && !projectId && form.customer_id) {
        const proj = await createProject({ project_name: form.so_number.trim(), customer_id: form.customer_id, quantity: totalQty || null });
        projectId = proj.id;
      }
      const payload = { ...form, project_id: projectId || null, lines: valid };
      if (editing) await updateSalesOrder(order.id, payload);
      else await createSalesOrder(payload);
      toast({ title: editing ? "Sales order updated" : "Sales order created" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? "Edit sales order" : "New sales order"}</DialogTitle></DialogHeader>
        {!editing && (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5">
            <span className="text-sm text-muted-foreground">Start from a Zoho Books order — fills in styles, colours, sizes & quantities.</span>
            <Button type="button" variant="outline" size="sm" onClick={openPicker}><CloudDownload className="h-4 w-4" /> Prefill from Zoho</Button>
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>SO number</Label>
              <Input value={form.so_number} onChange={set("so_number")} placeholder="e.g. SO-1001" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={set("customer_id")}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {allCustomers.map((c) => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={String(form.priority)} onValueChange={(v) => set("priority")(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.v} value={String(p.v)}>{p.label}</SelectItem>)}
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
              <p className="text-xs text-muted-foreground">From Zoho shipment date.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Customer deadline</Label>
              <Input type="date" value={form.customer_deadline || ""} onChange={set("customer_deadline")} />
              <p className="text-xs text-muted-foreground">The real deadline agreed with the customer.</p>
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Linked project (optional)</Label>
              <Select value={form.project_id} onValueChange={set("project_id")}>
                <SelectTrigger><SelectValue placeholder={form.customer_id ? "Choose a project for this customer" : "Pick a customer first"} /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.project_name}{p.project_number ? ` (${p.project_number})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{editing ? "Linking lets actual progress update the project automatically." : "Leave empty to auto-create a new project for this order. Progress will update it automatically."}</p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Order lines (style · colour · size · qty)</Label>
              <span className="text-xs text-muted-foreground">Total: {totalQty} pcs</span>
            </div>
            <div className="space-y-2">
              {form.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <Input list="style-suggestions" className="col-span-4" placeholder="Style" value={l.style_name ?? ""} onChange={(e) => setLine(i, "style_name", e.target.value)} />
                  <Input className="col-span-3" placeholder="Colour" value={l.colour} onChange={(e) => setLine(i, "colour", e.target.value)} />
                  <Input className="col-span-2" placeholder="Size" value={l.size} onChange={(e) => setLine(i, "size", e.target.value)} />
                  <Input className="col-span-2" type="number" min="1" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
                  <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-foreground" onClick={() => removeLine(i)} aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <datalist id="style-suggestions">
              {customerStyles.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Type a style name — pick an existing one from the suggestions, or type a new one and it'll be created automatically.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save order" : "Create order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Choose a Zoho order</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search SO number or customer…" value={zohoQ} onChange={(e) => setZohoQ(e.target.value)} />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {zohoLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            zohoList
              .filter((r) => { const s = zohoQ.toLowerCase(); return !s || (r.so_number || "").toLowerCase().includes(s) || (r.customer_name || "").toLowerCase().includes(s); })
              .map((r) => (
                <button key={r.zoho_id} type="button" disabled={prefilling} onClick={() => prefill(r)}
                  className="flex w-full items-center justify-between rounded-md border p-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-50">
                  <span><span className="font-medium">{r.so_number}</span> · {r.customer_name} · {r.item_count} item(s)</span>
                  {prefilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                </button>
              ))
          )}
          {!zohoLoading && zohoList.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No un-imported Zoho orders.</p>}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
