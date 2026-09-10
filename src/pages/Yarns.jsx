import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { useYarns, createYarn, updateYarn, deleteYarn } from "@/hooks/useYarns";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = { name: "", colour: "", unit: "kg", notes: "" };

function YarnDialog({ open, onOpenChange, yarn, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(yarn);

  useEffect(() => {
    if (open) setForm(yarn ? { ...EMPTY, ...yarn } : EMPTY);
  }, [open, yarn]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) { toast({ variant: "destructive", title: "Yarn name is required" }); return; }
    setBusy(true);
    try {
      if (editing) await updateYarn(yarn.id, form); else await createYarn(form);
      toast({ title: editing ? "Yarn updated" : "Yarn added" });
      onSaved?.(); onOpenChange(false);
    } catch (e) { toast({ variant: "destructive", title: "Save failed", description: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit yarn" : "Add yarn"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name / type</Label><Input value={form.name} onChange={set("name")} placeholder="e.g. Cotton 2/28" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Colour</Label><Input value={form.colour} onChange={set("colour")} placeholder="e.g. Navy" /></div>
            <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={set("unit")} placeholder="kg" /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={set("notes")} placeholder="optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Yarns() {
  const { yarns, loading, refetch } = useYarns();
  const { toast } = useToast();
  const [dialog, setDialog] = useState({ open: false, yarn: null });

  const remove = async (y) => {
    if (!confirm(`Delete yarn "${y.name}"?`)) return;
    try { await deleteYarn(y.id); toast({ title: "Yarn deleted" }); refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  return (
    <>
      <PageHeader title="Yarns" subtitle="Master list of yarns used in styles">
        <Button onClick={() => setDialog({ open: true, yarn: null })}><Plus className="h-4 w-4" /> Add yarn</Button>
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : yarns.length === 0 ? (
        <EmptyState icon={Package} title="No yarns yet" description="Add the yarns you use, then attach them to styles (with grams per piece) to calculate yarn needed per order."
          action={<Button onClick={() => setDialog({ open: true, yarn: null })}><Plus className="h-4 w-4" /> Add yarn</Button>} />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name / type</TableHead><TableHead>Colour</TableHead><TableHead>Unit</TableHead><TableHead>Notes</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {yarns.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.name}</TableCell>
                  <TableCell className="text-muted-foreground">{y.colour || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{y.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{y.notes || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ open: true, yarn: y })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(y)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <YarnDialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))} yarn={dialog.yarn} onSaved={refetch} />
    </>
  );
}
