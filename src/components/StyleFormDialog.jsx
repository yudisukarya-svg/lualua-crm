import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createStyle, updateStyle } from "@/hooks/useStyles";
import { useCustomers } from "@/hooks/useCustomers";
import { useYarns, getStyleBom, saveStyleBom } from "@/hooks/useYarns";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { GAUGES } from "@/lib/scheduler";

const DOWNSTREAM = [
  { key: "linking", label: "Linking" },
  { key: "finishing", label: "Finishing" },
  { key: "steam", label: "Steam" },
  { key: "label", label: "Label Sewing" },
  { key: "qc", label: "Final QC" },
  { key: "packing", label: "Packing" },
];

const EMPTY = { name: "", customer_id: "", knitting_method: "manual", knitting_gauge: "", notes: "", yarn_wastage_pct: "", knitting_manual: "", knitting_machine: "", linking: "", finishing: "", steam: "", label: "", qc: "", packing: "" };

export default function StyleFormDialog({ open, onOpenChange, style, onSaved }) {
  const { toast } = useToast();
  const { customers } = useCustomers();
  const { yarns } = useYarns();
  const [form, setForm] = useState(EMPTY);
  const [bom, setBom] = useState([]);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(style);

  useEffect(() => {
    if (!open) return;
    setForm(style ? { ...EMPTY, ...style, customer_id: style.customer_id || "", notes: style.notes || "" } : EMPTY);
    if (style) getStyleBom(style.id).then((rows) => setBom(rows.map((r) => ({ yarn_id: r.yarn_id, grams_per_pc: r.grams_per_pc }))));
    else setBom([]);
  }, [open, style]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const setBomLine = (i, k, v) => setBom((b) => b.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addBomLine = () => setBom((b) => [...b, { yarn_id: "", grams_per_pc: "" }]);
  const removeBomLine = (i) => setBom((b) => b.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ variant: "destructive", title: "Style name is required" }); return; }
    setBusy(true);
    try {
      let styleId;
      if (editing) { await updateStyle(style.id, form); styleId = style.id; }
      else { const created = await createStyle(form); styleId = created.id; }
      await saveStyleBom(styleId, bom);
      toast({ title: editing ? "Style updated" : "Style created" });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit style" : "New style"}</DialogTitle>
          <DialogDescription>How many pieces one worker (or machine) can complete per day at each stage.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Style name</Label>
              <Input value={form.name} onChange={set("name")} placeholder="e.g. Cable Knit Cardigan" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={set("customer_id")}>
                <SelectTrigger><SelectValue placeholder="Which customer owns this style" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Knitting method</Label>
              <Select value={form.knitting_method} onValueChange={set("knitting_method")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (workers)</SelectItem>
                  <SelectItem value="machine">Automatic machine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.knitting_method === "machine" && (
              <div className="space-y-1.5">
                <Label>Gauge</Label>
                <Select value={form.knitting_gauge} onValueChange={set("knitting_gauge")}>
                  <SelectTrigger><SelectValue placeholder="Choose gauge" /></SelectTrigger>
                  <SelectContent>
                    {GAUGES.map((g) => <SelectItem key={g} value={g}>{g} gauge</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {form.knitting_method === "machine" ? (
              <div className="space-y-1.5">
                <Label className="text-sm">Knitting — Machine</Label>
                <Input type="number" min="0" step="0.1" value={form.knitting_machine} onChange={set("knitting_machine")} placeholder="0" />
                <p className="text-xs text-muted-foreground">pcs / machine / day</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-sm">Knitting — Manual</Label>
                <Input type="number" min="0" step="0.1" value={form.knitting_manual} onChange={set("knitting_manual")} placeholder="0" />
                <p className="text-xs text-muted-foreground">pcs / worker / day</p>
              </div>
            )}
            {DOWNSTREAM.map((r) => (
              <div key={r.key} className="space-y-1.5">
                <Label className="text-sm">{r.label}</Label>
                <Input type="number" min="0" step="0.1" value={form[r.key]} onChange={set(r.key)} placeholder="0" />
                <p className="text-xs text-muted-foreground">pcs / worker / day</p>
              </div>
            ))}
          </div>

          {/* Yarn / bill of materials */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Yarn (bill of materials)</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Wastage %</Label>
                <Input type="number" min="0" step="0.5" className="h-8 w-20" value={form.yarn_wastage_pct} onChange={set("yarn_wastage_pct")} placeholder="0" />
              </div>
            </div>
            {bom.length === 0 && <p className="text-xs text-muted-foreground">No yarn added. Add the yarns this style uses and grams per piece.</p>}
            {bom.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={l.yarn_id} onValueChange={(v) => setBomLine(i, "yarn_id", v)}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Choose yarn" /></SelectTrigger>
                  <SelectContent>
                    {yarns.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.colour ? ` · ${y.colour}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" min="0" step="0.1" className="w-28" value={l.grams_per_pc} onChange={(e) => setBomLine(i, "grams_per_pc", e.target.value)} placeholder="g / pc" />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeBomLine(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addBomLine}><Plus className="h-4 w-4" /> Add yarn</Button>
            {yarns.length === 0 && <p className="text-xs text-amber-600">No yarns in the master list yet. Add them in the Yarns page first.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={set("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save style" : "Create style"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
