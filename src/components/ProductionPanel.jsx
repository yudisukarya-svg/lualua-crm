import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { updateProject } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

// Suggested milestone presets from the brief.
const MILESTONES = [
  { pct: 10, label: "Sampling Started" },
  { pct: 30, label: "Yarn Arrived" },
  { pct: 50, label: "Knitting Running" },
  { pct: 80, label: "QC" },
  { pct: 100, label: "Finished" },
];

export default function ProductionPanel({ project, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    yarn_type: project.yarn_type || "",
    yarn_supplier: project.yarn_supplier || "",
    gauge: project.gauge || "",
    machine_type: project.machine_type || "",
    production_start: project.production_start || "",
    production_end: project.production_end || "",
    progress: project.progress ?? 0,
    production_notes: project.production_notes || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const save = async (overrides = {}) => {
    setBusy(true);
    try {
      const next = { ...form, ...overrides };
      const payload = {
        yarn_type: next.yarn_type || null,
        yarn_supplier: next.yarn_supplier || null,
        gauge: next.gauge || null,
        machine_type: next.machine_type || null,
        production_start: next.production_start || null,
        production_end: next.production_end || null,
        progress: Number(next.progress) || 0,
        production_notes: next.production_notes || null,
      };
      await updateProject(project.id, payload);
      setForm(next);
      toast({ title: "Production updated" });
      onSaved?.();
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Current progress</span>
          <span className="text-sm font-semibold text-primary">{form.progress}%</span>
        </div>
        <Progress value={form.progress} />
        <div className="mt-3 flex flex-wrap gap-2">
          {MILESTONES.map((m) => (
            <Button
              key={m.pct}
              size="sm"
              variant={Number(form.progress) >= m.pct ? "default" : "outline"}
              disabled={busy}
              onClick={() => save({ progress: m.pct })}
            >
              {m.pct}% {m.label}
            </Button>
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          <Label className="text-xs">Set custom %</Label>
          <Input type="number" min="0" max="100" value={form.progress} onChange={set("progress")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Yarn type</Label>
          <Input value={form.yarn_type} onChange={set("yarn_type")} />
        </div>
        <div className="space-y-1.5">
          <Label>Yarn supplier</Label>
          <Input value={form.yarn_supplier} onChange={set("yarn_supplier")} />
        </div>
        <div className="space-y-1.5">
          <Label>Gauge</Label>
          <Input value={form.gauge} onChange={set("gauge")} placeholder="e.g. 12gg" />
        </div>
        <div className="space-y-1.5">
          <Label>Machine type</Label>
          <Input value={form.machine_type} onChange={set("machine_type")} />
        </div>
        <div className="space-y-1.5">
          <Label>Production start</Label>
          <Input type="date" value={form.production_start || ""} onChange={set("production_start")} />
        </div>
        <div className="space-y-1.5">
          <Label>Production end</Label>
          <Input type="date" value={form.production_end || ""} onChange={set("production_end")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Production notes</Label>
          <Textarea rows={3} value={form.production_notes} onChange={set("production_notes")} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save production
        </Button>
      </div>
    </div>
  );
}
