import { useSchedule } from "@/hooks/useSchedule";
import { STAGE_LABELS } from "@/lib/scheduler";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const utilColor = (u) => (u > 95 ? "text-rose-600" : u >= 80 ? "text-amber-600" : "text-emerald-600");
const barColor = (u) => (u > 95 ? "bg-rose-500" : u >= 80 ? "bg-amber-500" : "bg-emerald-500");

export default function Capacity() {
  const { schedule, loading } = useSchedule();
  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Calculating capacity…</p>;

  const cap = schedule?.capacity ?? [];
  const late = (schedule?.orders ?? []).filter((o) => o.delayRisk);
  const bottleneck = schedule?.bottleneckStage ? STAGE_LABELS[schedule.bottleneckStage] : null;

  return (
    <>
      <PageHeader title="Capacity planning" subtitle="Worker & machine load across the whole plan" />

      {late.length > 0 ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> {late.length} order(s) forecast to finish late</div>
          <p className="mt-1">
            Likely cause: the most-loaded stage is <strong>{bottleneck || "—"}</strong>. Try adding workers/machines there (Worker Loading → "add extra workers", or Machine Planning) and watch if the late orders turn on-time.
          </p>
          <ul className="mt-2 space-y-0.5">
            {late.map((o) => (
              <li key={o.id}>• <strong>{o.soNumber}</strong>: finishes {o.completionDate ? formatDate(o.completionDate) : "—"}, due {formatDate(o.dueDate)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> All orders are forecast to finish on time.
        </div>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-center">Capacity</TableHead>
              <TableHead className="text-center">Peak used</TableHead>
              <TableHead className="min-w-[180px]">Peak utilization</TableHead>
              <TableHead>Availability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cap.map((c) => (
              <TableRow key={c.key}>
                <TableCell className="font-medium">{c.label}</TableCell>
                <TableCell className="text-center">{c.workersAvail} {c.unit === "machines" ? "mach." : "wkrs"}</TableCell>
                <TableCell className="text-center">{c.peakUsed}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${barColor(c.peakUtil)}`} style={{ width: `${Math.min(100, c.peakUtil)}%` }} />
                    </div>
                    <span className={`w-14 text-right text-sm font-semibold ${utilColor(c.peakUtil)}`}>{c.peakUtil}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {c.fullDays > 0
                    ? <span className="text-amber-600">Fully booked {c.fullDays} day{c.fullDays > 1 ? "s" : ""}{c.firstFullDate ? ` · first ${formatDate(c.firstFullDate)}` : ""}</span>
                    : <span className="text-emerald-600">Has spare capacity</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Utilization shows how hard each stage is pushed (green &lt;80% · amber 80–95% · red &gt;95%). A stage being fully booked is normal — it only becomes a problem when it makes an order late, shown above.
      </p>
    </>
  );
}
