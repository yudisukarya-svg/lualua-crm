import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { useResources, updateResource } from "@/hooks/useResources";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Resources() {
  const { resources, loading, refetch } = useResources();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const init = {};
    resources.forEach((r) => { init[r.id] = { count: r.count, reserved: r.reserved || 0 }; });
    setEdits(init);
  }, [resources]);

  const save = async () => {
    setBusy(true);
    try {
      await Promise.all(resources
        .filter((r) => Number(edits[r.id]?.count) !== r.count || Number(edits[r.id]?.reserved || 0) !== (r.reserved || 0))
        .map((r) => updateResource(r.id, edits[r.id])));
      toast({ title: "Resources updated" });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally { setBusy(false); }
  };

  const isMachine = (id) => id.startsWith("machine_");
  const setField = (id, field, v) => setEdits((s) => ({ ...s, [id]: { ...s[id], [field]: v } }));

  return (
    <>
      <PageHeader title="Resources" subtitle="Workers and machines available at each stage">
        {isAdmin && (
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Card className="p-6">
          {!isAdmin && (
            <p className="mb-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Only admins can change resource counts. You can view the current setup below.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => (
              <div key={r.id} className="space-y-1.5 rounded-lg border p-3">
                <Label className="text-sm">{r.label}</Label>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <p className="mb-1 text-xs text-muted-foreground">{isMachine(r.id) ? "Machines" : "Workers"}</p>
                    <Input type="number" min="0" value={edits[r.id]?.count ?? ""} onChange={(e) => setField(r.id, "count", e.target.value)} disabled={!isAdmin} />
                  </div>
                  {isMachine(r.id) && (
                    <div className="flex-1">
                      <p className="mb-1 text-xs text-muted-foreground">For sampling</p>
                      <Input type="number" min="0" value={edits[r.id]?.reserved ?? 0} onChange={(e) => setField(r.id, "reserved", e.target.value)} disabled={!isAdmin} />
                    </div>
                  )}
                </div>
                {isMachine(r.id) && (
                  <p className="text-xs text-emerald-600">
                    {Math.max(0, (Number(edits[r.id]?.count) || 0) - (Number(edits[r.id]?.reserved) || 0))} available for production
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
