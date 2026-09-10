import { useState } from "react";
import { Plus, Trash2, CalendarDays, Loader2 } from "lucide-react";
import { usePlanningCalendar, updateSettings, addHoliday, deleteHoliday } from "@/hooks/usePlanningCalendar";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDate, humanize } from "@/lib/utils";

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 disabled:opacity-60"
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

export default function PlanningCalendar() {
  const { settings, holidays, loading, refetch } = usePlanningCalendar();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState("holiday");
  const [busy, setBusy] = useState(false);

  const toggle = async (key, value) => {
    try { await updateSettings({ [key]: value }); refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Save failed", description: e.message }); }
  };

  const add = async () => {
    if (!newDate) { toast({ variant: "destructive", title: "Pick a date" }); return; }
    setBusy(true);
    try {
      await addHoliday({ date: newDate, label: newLabel, kind: newKind });
      setNewDate(""); setNewLabel(""); setNewKind("holiday");
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not add", description: e.message });
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await deleteHoliday(id); refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <PageHeader title="Production calendar" subtitle="Non-working days are skipped automatically by the scheduler" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-6">
          <h3 className="text-sm font-semibold">Weekly days off</h3>
          <Toggle checked={settings.sunday_off} onChange={(v) => toggle("sunday_off", v)} label="Sunday off" disabled={!isAdmin} />
          <Toggle checked={settings.saturday_off} onChange={(v) => toggle("saturday_off", v)} label="Saturday off" disabled={!isAdmin} />
          <div className="space-y-1.5 border-t pt-3">
            <label className="text-sm font-medium">Working hours per day</label>
            <input type="number" min="1" max="24" step="0.5" defaultValue={settings.work_hours_per_day ?? 8} disabled={!isAdmin}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== Number(settings.work_hours_per_day)) toggle("work_hours_per_day", v); }}
              className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" />
            <p className="text-xs text-muted-foreground">Used to convert reserved sample/maintenance hours into lost machine output.</p>
          </div>
          {!isAdmin && <p className="text-xs text-muted-foreground">Only admins can change calendar settings.</p>}
        </Card>

        <Card className="space-y-4 p-6">
          <h3 className="text-sm font-semibold">Add holiday / shutdown</h3>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Label (optional)</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Nyepi, Factory maintenance" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={newKind} onValueChange={setNewKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">Holiday</SelectItem>
                <SelectItem value="shutdown">Factory shutdown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add date
          </Button>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <h3 className="mb-3 text-sm font-semibold">Holidays & shutdowns</h3>
        {holidays.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No dates added" description="Add public holidays or factory shutdown dates above." />
        ) : (
          <ul className="divide-y">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{formatDate(h.date)}</p>
                  <p className="text-xs text-muted-foreground">{humanize(h.kind)}{h.label ? ` · ${h.label}` : ""}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(h.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
