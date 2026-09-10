import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Users, Scissors, Factory, PackageCheck, CheckCircle2, Clock, FileText, StickyNote, AlertTriangle, CalendarClock, Layers, ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useDashboard } from "@/hooks/useDashboard";
import { useActivities } from "@/hooks/useActivities";
import { useSchedule } from "@/hooks/useSchedule";
import { STAGE_LABELS } from "@/lib/scheduler";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatDateTime, bytes } from "@/lib/utils";

function Stat({ icon: Icon, label, value, tone = "text-primary", to }) {
  const body = (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={`rounded-lg bg-muted p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const { stats } = useDashboard();
  const { activities } = useActivities({ limit: 8 });
  const { schedule } = useSchedule();
  const [deadlines, setDeadlines] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [notes, setNotes] = useState([]);

  const orders = schedule?.orders ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const lateOrders = orders.filter((o) => o.delayRisk);
  const dueSoon = orders.filter((o) => o.dueDate && o.dueDate >= todayStr && o.dueDate <= in7);
  const totalReject = orders.reduce((n, o) => n + (o.rejectPanels || 0), 0);
  const onTime = orders.filter((o) => o.completionDate && !o.delayRisk).length;

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    (async () => {
      const [dl, up, nt] = await Promise.all([
        supabase.from("projects")
          .select("id, project_name, project_number, shipping_date, status, customers(customer_name)")
          .gte("shipping_date", today)
          .not("status", "in", "(completed,cancelled,shipped)")
          .order("shipping_date", { ascending: true }).limit(6),
        supabase.from("project_files")
          .select("id, file_name, folder, created_at, size_bytes, project_id, uploaded_by_user:users!project_files_uploaded_by_fkey(full_name)")
          .order("created_at", { ascending: false }).limit(6),
        supabase.from("notes")
          .select("id, body, created_at, project_id, customer_id, author:users!notes_created_by_fkey(full_name)")
          .order("created_at", { ascending: false }).limit(5),
      ]);
      setDeadlines(dl.data ?? []);
      setUploads(up.data ?? []);
      setNotes(nt.data ?? []);
    })();
  }, []);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Production at a glance" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat icon={Users} label="Total Customers" value={stats.customers} to="/customers" />
        <Stat icon={Scissors} label="In Sampling" value={stats.sampling} tone="text-amber-600" to="/projects?status=sampling" />
        <Stat icon={Factory} label="In Production" value={stats.production} tone="text-blue-600" to="/projects?status=production" />
        <Stat icon={PackageCheck} label="Ready to Ship" value={stats.readyShip} tone="text-teal-600" to="/projects?status=ready_shipment" />
        <Stat icon={CheckCircle2} label="Completed" value={stats.completed} tone="text-emerald-600" to="/projects?status=completed" />
      </div>

      {/* Production at a glance */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">PRODUCTION</h2>
          <p className="text-xs text-muted-foreground">
            Bottleneck stage: <span className="font-medium text-foreground">{schedule?.bottleneckStage ? STAGE_LABELS[schedule.bottleneckStage] : "—"}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat icon={ClipboardList} label="Active orders" value={orders.length} to="/planning" />
          <Stat icon={AlertTriangle} label="At risk (late)" value={lateOrders.length} tone={lateOrders.length ? "text-rose-600" : "text-emerald-600"} to="/planning" />
          <Stat icon={CalendarClock} label="Due within 7 days" value={dueSoon.length} tone="text-amber-600" to="/planning" />
          <Stat icon={CheckCircle2} label="On time" value={onTime} tone="text-emerald-600" to="/planning" />
          <Stat icon={Layers} label="Reject panels" value={totalReject} tone="text-blue-600" to="/planning/knitting" />
        </div>

        {lateOrders.length > 0 && (
          <Card className="mt-4 border-rose-200">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-rose-700"><AlertTriangle className="h-4 w-4" /> Orders forecast to finish late</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {lateOrders.map((o) => (
                <Link key={o.id} to="/planning" className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-muted/50">
                  <span className="font-medium">{o.soNumber} <span className="font-normal text-muted-foreground">· {o.customerName}</span></span>
                  <span className="text-muted-foreground">finishes {o.completionDate ? formatDate(o.completionDate) : "—"} · due {formatDate(o.dueDate)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm">{a.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.actor?.full_name || "System"} · {formatDateTime(a.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Upcoming deadlines */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Upcoming Deadlines</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {deadlines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing due soon.</p>
            ) : deadlines.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-md border p-3 hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{p.project_name}</span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.customers?.customer_name} · ships {formatDate(p.shipping_date)}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Recent uploads */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Recent Uploads</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {uploads.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No files yet.</p>
            ) : uploads.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.uploaded_by_user?.full_name || "—"} · {formatDate(f.created_at)} · {bytes(f.size_bytes)}
                  </p>
                </div>
                {f.project_id && <Link to={`/projects/${f.project_id}`} className="shrink-0 text-xs text-primary hover:underline">View</Link>}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent notes */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><StickyNote className="h-4 w-4" /> Recent Notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No notes yet.</p>
            ) : notes.map((n) => (
              <div key={n.id} className="rounded-md border p-2.5">
                <p className="line-clamp-2 text-sm">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.author?.full_name || "—"} · {formatDateTime(n.created_at)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
