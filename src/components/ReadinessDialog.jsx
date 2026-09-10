import { useState, useEffect } from "react";
import { Loader2, CheckSquare, Square } from "lucide-react";
import { saveReadiness, READINESS_ITEMS } from "@/hooks/useSalesOrders";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export default function ReadinessDialog({ open, onOpenChange, order, onSaved }) {
  const { toast } = useToast();
  const [state, setState] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && order) setState({ ...(order.readiness || {}) });
  }, [open, order]);

  const toggle = (key) => setState((s) => ({ ...s, [key]: !s[key] }));

  const submit = async () => {
    setBusy(true);
    try {
      await saveReadiness(order.id, state);
      toast({ title: "Readiness saved" });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally { setBusy(false); }
  };

  const done = READINESS_ITEMS.filter((i) => state[i.key]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Readiness — {order?.so_number}</DialogTitle>
          <DialogDescription>Tick what's done before this order starts. {done} of {READINESS_ITEMS.length} ready.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {READINESS_ITEMS.map((i) => (
            <button key={i.key} type="button" onClick={() => toggle(i.key)}
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted/50">
              {state[i.key] ? <CheckSquare className="h-5 w-5 text-emerald-600" /> : <Square className="h-5 w-5 text-muted-foreground" />}
              <span className={state[i.key] ? "font-medium" : ""}>{i.label}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
