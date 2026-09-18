import { useState } from "react";
import { useReports } from "@/hooks/useReports";
import { useSchedule } from "@/hooks/useSchedule";
import { useDailyActuals } from "@/hooks/useDailyActuals";
import { useMachineDailyNotes } from "@/hooks/useMachineDailyNotes";
import { useShipments } from "@/hooks/useShipments";
import { computeOnTimeReport } from "@/lib/onTimeReport";
import { STAGE_LABELS, makeCalendar } from "@/lib/scheduler";
import { computeDailyProductionGrid, segmentsFromDays } from "@/lib/dailyProductionGrid";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { FileDown, FileSpreadsheet, FileText, Users, Package, Factory, ChevronLeft, ChevronRight, MessageSquare, MessageSquarePlus, CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { humanize, formatDate, addDaysLocal, todayLocalStr } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const PIE_COLORS = ["#9c4221", "#c05621", "#dd6b20", "#ed8936", "#f6ad55", "#fbd38d", "#a0aec0", "#718096", "#4a5568", "#2d3748", "#e53e3e"];
const ACCENT = "#9c4221";

function ChartCard({ title, children }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

export default function Reports() {
  const r = useReports();
  const { shipments } = useShipments();
  const { schedule, raw } = useSchedule();
  const onTimeReport = computeOnTimeReport({ salesOrders: raw?.salesOrders || [], shipments });
  const { toast } = useToast();
  const [dpmStart, setDpmStart] = useState(() => addDaysLocal(todayLocalStr(), -6));
  const dpmEnd = addDaysLocal(dpmStart, 13);
  const { rows: dailyActualRows, loading: dpmLoading } = useDailyActuals(dpmStart, dpmEnd);
  const { notes: dpmNotes, saveNote: saveDpmNote } = useMachineDailyNotes(dpmStart, dpmEnd);
  const [noteDialog, setNoteDialog] = useState({ open: false, machineId: null, machineName: "", date: null, reason: "", saving: false });
  const dpmCalendar = makeCalendar({ sundayOff: raw?.settings?.sunday_off ?? true, saturdayOff: raw?.settings?.saturday_off ?? false, holidays: raw?.holidays || [] });
  const soById = {}; (raw?.salesOrders || []).forEach((so) => { soById[so.id] = so; });
  const dpmGrid = computeDailyProductionGrid({
    machines: raw?.machines || [], board: schedule?.board || [], rawBlocks: raw?.blocks || [], stylesById: raw?.styles || {},
    actualRows: dailyActualRows, soById, startDate: dpmStart, endDate: dpmEnd, calendar: dpmCalendar,
  });
  const dpmDates = Object.values(dpmGrid)[0]?.days.map((d) => d.date) || [];
  const shiftDpmWindow = (weeks) => {
    setDpmStart(addDaysLocal(dpmStart, weeks * 14));
  };
  const openNoteDialog = (machineId, machineName, date) => {
    const existing = dpmNotes[`${machineId}:${date}`];
    setNoteDialog({ open: true, machineId, machineName, date, reason: existing?.reason || "", saving: false });
  };
  const submitNote = async () => {
    if (!noteDialog.reason.trim()) return;
    setNoteDialog((s) => ({ ...s, saving: true }));
    try {
      await saveDpmNote(noteDialog.machineId, noteDialog.date, noteDialog.reason.trim());
      toast({ title: "Catatan tersimpan" });
      setNoteDialog({ open: false, machineId: null, machineName: "", date: null, reason: "", saving: false });
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal simpan", description: e.message });
      setNoteDialog((s) => ({ ...s, saving: false }));
    }
  };


  const prodOrders = schedule?.orders ?? [];
  const prodCapacity = schedule?.capacity ?? [];
  const prodLate = prodOrders.filter((o) => o.delayRisk);
  const statusOf = (o) => (o.delayRisk ? "LATE" : o.completionDate ? "On time" : "—");

  const exportProductionPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Lualua — Production Schedule", 14, 18);
      doc.setFontSize(10); doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 14, 25);
      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text(`Orders: ${prodOrders.length}    Late: ${prodLate.length}    Bottleneck: ${schedule?.bottleneckStage ? STAGE_LABELS[schedule.bottleneckStage] : "—"}`, 14, 34);

      autoTable(doc, {
        startY: 40,
        head: [["Order", "Customer", "Qty", "Start", "Forecast finish", "Due", "Status", "Reject panels"]],
        body: prodOrders.map((o) => [o.soNumber, o.customerName, o.quantity, o.startDate ? formatDate(o.startDate) : "—", o.completionDate ? formatDate(o.completionDate) : "—", o.dueDate ? formatDate(o.dueDate) : "—", statusOf(o), o.rejectPanels ?? 0]),
        headStyles: { fillColor: [156, 66, 33] }, styles: { fontSize: 8 },
      });
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Stage / pool", "Capacity", "Peak used", "Peak util %", "Fully booked days"]],
        body: prodCapacity.map((c) => [c.label, `${c.workersAvail} ${c.unit === "machines" ? "mach." : "wkrs"}`, c.peakUsed, c.peakUtil, c.fullDays]),
        headStyles: { fillColor: [156, 66, 33] }, styles: { fontSize: 8 },
      });
      doc.save("lualua-production-schedule.pdf");
    } catch (e) {
      toast({ variant: "destructive", title: "PDF export failed", description: e.message });
    }
  };

  const exportProductionExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        prodOrders.map((o) => ({ Order: o.soNumber, Customer: o.customerName, Qty: o.quantity, Start: o.startDate || "", "Forecast finish": o.completionDate || "", Due: o.dueDate || "", Status: statusOf(o), "Reject panels": o.rejectPanels ?? 0 }))
      ), "Schedule");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        prodCapacity.map((c) => ({ "Stage/pool": c.label, Capacity: c.workersAvail, Unit: c.unit, "Peak used": c.peakUsed, "Peak util %": c.peakUtil, "Fully booked days": c.fullDays }))
      ), "Capacity");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        (prodLate.length ? prodLate : [{}]).map((o) => o.soNumber ? ({ Order: o.soNumber, Customer: o.customerName, "Forecast finish": o.completionDate || "", Due: o.dueDate || "" }) : ({ Note: "No late orders" }))
      ), "Late orders");
      XLSX.writeFile(wb, "lualua-production-schedule.xlsx");
    } catch (e) {
      toast({ variant: "destructive", title: "Excel export failed", description: e.message });
    }
  };

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Lualua Crochet & Knitting — CRM Report", 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 14, 25);
      doc.setTextColor(0);

      doc.setFontSize(11);
      doc.text(`Total customers: ${r.totalCustomers}    Total projects: ${r.totalProjects}`, 14, 34);

      autoTable(doc, {
        startY: 40,
        head: [["Project Status", "Count"]],
        body: r.byStatus.map((s) => [humanize(s.status), s.count]),
        headStyles: { fillColor: [156, 66, 33] },
      });
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Top Customers", "Projects"]],
        body: r.topCustomers.map((c) => [c.name, c.projects]),
        headStyles: { fillColor: [156, 66, 33] },
      });
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Shipments", "Count"]],
        body: r.shipmentsByMonth.map((m) => [m.month, m.count]),
        headStyles: { fillColor: [156, 66, 33] },
      });
      doc.save("lualua-crm-report.pdf");
    } catch (e) {
      toast({ variant: "destructive", title: "PDF export failed", description: e.message });
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        [{ Metric: "Total customers", Value: r.totalCustomers }, { Metric: "Total projects", Value: r.totalProjects }]
      ), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        r.byStatus.map((s) => ({ Status: humanize(s.status), Count: s.count }))
      ), "By Status");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        r.topCustomers.map((c) => ({ Customer: c.name, Projects: c.projects }))
      ), "Top Customers");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        r.shipmentsByMonth.map((m) => ({ Month: m.month, Shipments: m.count }))
      ), "Shipments");
      XLSX.writeFile(wb, "lualua-crm-report.xlsx");
    } catch (e) {
      toast({ variant: "destructive", title: "Excel export failed", description: e.message });
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Section", "Label", "Value"],
      ["Summary", "Total customers", r.totalCustomers],
      ["Summary", "Total projects", r.totalProjects],
      ...r.byStatus.map((s) => ["Status", humanize(s.status), s.count]),
      ...r.topCustomers.map((c) => ["Top Customer", c.name, c.projects]),
      ...r.shipmentsByMonth.map((m) => ["Shipments", m.month, m.count]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lualua-crm-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Overview of customers, projects and production">
        <Button variant="outline" onClick={exportCSV}><FileText className="h-4 w-4" /> CSV</Button>
        <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
        <Button onClick={exportPDF}><FileDown className="h-4 w-4" /> PDF</Button>
      </PageHeader>

      {r.loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Building reports…</p>
      ) : (
        <div className="space-y-4">
          {/* Production schedule */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Factory className="h-4 w-4 text-primary" /> Production schedule</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportProductionExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                <Button size="sm" onClick={exportProductionPDF}><FileDown className="h-4 w-4" /> PDF</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                {prodOrders.length} order(s) · <span className={prodLate.length ? "text-rose-600" : "text-emerald-600"}>{prodLate.length} late</span> · bottleneck: {schedule?.bottleneckStage ? STAGE_LABELS[schedule.bottleneckStage] : "—"}
              </p>
              {prodOrders.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No sales orders to schedule yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead><TableHead>Customer</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead>Forecast finish</TableHead><TableHead>Due</TableHead>
                        <TableHead>Status</TableHead><TableHead className="text-center">Reject panels</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prodOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.soNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{o.customerName}</TableCell>
                          <TableCell className="text-center">{o.quantity}</TableCell>
                          <TableCell className="text-muted-foreground">{o.completionDate ? formatDate(o.completionDate) : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{o.dueDate ? formatDate(o.dueDate) : "—"}</TableCell>
                          <TableCell className={o.delayRisk ? "text-rose-600" : "text-emerald-600"}>{statusOf(o)}</TableCell>
                          <TableCell className="text-center">{o.rejectPanels ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Daily production per machine — confirmed PO Tukang handovers vs schedule */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Factory className="h-4 w-4 text-primary" /> Daily production per machine</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => shiftDpmWindow(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="whitespace-nowrap px-1 text-xs text-muted-foreground">{formatDate(dpmStart)} – {formatDate(dpmEnd)}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => shiftDpmWindow(1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">Confirmed knitting handovers from PO Tukang against what each machine was scheduled to run. A red "0" means a day the board expected production but no handover was confirmed.</p>
              {dpmLoading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Loading actuals…</p>
              ) : (
                <div className="space-y-4">
                  {(raw?.machines || []).map((m) => {
                    const days = dpmGrid[m.id]?.days || [];
                    const segments = segmentsFromDays(days);
                    return (
                      <div key={m.id}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-medium">{m.name}</span>
                          {segments.length === 0 && <span className="text-xs text-muted-foreground">Nothing scheduled this window</span>}
                        </div>
                        {segments.length > 0 && (
                          <p className="mb-1 truncate text-xs text-muted-foreground">
                            {segments.map((s, i) => (
                              <span key={i}>{i > 0 ? " · " : ""}{s.soNumber}{s.customerName ? ` · ${s.customerName}` : ""}{s.styleName ? ` · ${s.styleName}` : ""}</span>
                            ))}
                          </p>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr>
                                {days.map((d) => (
                                  <th key={d.date} className={`whitespace-nowrap px-2 py-1 text-center font-normal ${new Date(d.date + "T00:00:00").getDay() === 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {days.map((d) => {
                                  const note = dpmNotes[`${m.id}:${d.date}`];
                                  const needsNote = d.isWorkingDay && (d.missing || !d.scheduled) && !note;
                                  return (
                                    <td key={d.date}
                                      onClick={() => openNoteDialog(m.id, m.name, d.date)}
                                      title={d.scheduled
                                        ? `${d.soNumber}${d.customerName ? " · " + d.customerName : ""}${d.styleName ? " · " + d.styleName : ""}${d.target ? ` (target ${d.target}/hari)` : ""}${note ? " — " + note.reason : ""}`
                                        : `Tidak ada jadwal di mesin ini${note ? " — " + note.reason : " — klik untuk isi alasan"}`}
                                      className={`cursor-pointer whitespace-nowrap px-2 py-2 text-center hover:ring-1 hover:ring-primary/40 ${!d.scheduled ? "text-muted-foreground/50" : d.missing ? "bg-rose-50 font-medium text-rose-700" : "text-foreground"}`}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        {d.scheduled ? d.pcs : "—"}
                                        {note && <MessageSquare className="h-3 w-3 shrink-0 text-primary" />}
                                        {needsNote && <MessageSquarePlus className="h-3 w-3 shrink-0 text-rose-400" />}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* On-time delivery performance — historical, fully-dispatched orders only */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">On-time delivery performance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-xs text-muted-foreground">
                Order yang sudah <strong>selesai dikirim penuh</strong> (fully dispatched), dibandingkan <strong>customer deadline</strong> — tanggal pengiriman terakhir vs deadline asli ke customer. Terlambat = maks 7 hari lewat deadline. Sangat terlambat = lebih dari 7 hari.
              </p>
              {onTimeReport.total === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada order selesai yang punya customer deadline tercatat.</p>
              ) : (
                <div className="grid items-center gap-6 lg:grid-cols-[220px_1fr]">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Tepat waktu", value: onTimeReport.onTime, color: "#38a169" },
                            { name: "Terlambat", value: onTimeReport.late, color: "#dd6b20" },
                            { name: "Sangat terlambat", value: onTimeReport.veryLate, color: "#c53030" },
                          ].filter((d) => d.value > 0)}
                          dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}
                        >
                          {[
                            { color: "#38a169" }, { color: "#dd6b20" }, { color: "#c53030" },
                          ].map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                      <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
                      <p className="text-2xl font-semibold text-emerald-700">{onTimeReport.pctOnTime}%</p>
                      <p className="text-xs text-muted-foreground">Tepat waktu ({onTimeReport.onTime})</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-center">
                      <AlertTriangle className="mx-auto mb-1 h-5 w-5 text-amber-600" />
                      <p className="text-2xl font-semibold text-amber-700">{onTimeReport.pctLate}%</p>
                      <p className="text-xs text-muted-foreground">Terlambat ({onTimeReport.late})</p>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-center">
                      <AlertOctagon className="mx-auto mb-1 h-5 w-5 text-rose-600" />
                      <p className="text-2xl font-semibold text-rose-700">{onTimeReport.pctVeryLate}%</p>
                      <p className="text-xs text-muted-foreground">Sangat terlambat ({onTimeReport.veryLate})</p>
                    </div>
                    <p className="col-span-3 text-xs text-muted-foreground">Dari {onTimeReport.total} order selesai dengan customer deadline tercatat.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-primary/10 p-3"><Users className="h-6 w-6 text-primary" /></div>
                <div>
                  <p className="text-2xl font-semibold">{r.totalCustomers}</p>
                  <p className="text-sm text-muted-foreground">Total customers</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-primary/10 p-3"><Package className="h-6 w-6 text-primary" /></div>
                <div>
                  <p className="text-2xl font-semibold">{r.totalProjects}</p>
                  <p className="text-sm text-muted-foreground">Total projects</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Projects by status">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.byStatus} margin={{ top: 8, right: 8, bottom: 40, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="status" tickFormatter={humanize} angle={-35} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [v, "Projects"]} labelFormatter={humanize} />
                  <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Production progress distribution">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={r.progressBuckets} dataKey="count" nameKey="bucket" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.bucket}: ${e.count}`}>
                    {r.progressBuckets.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Shipments by month">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.shipmentsByMonth} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top customers by projects">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={r.topCustomers} margin={{ top: 8, right: 8, bottom: 8, left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="projects" fill={ACCENT} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      <Dialog open={noteDialog.open} onOpenChange={(o) => setNoteDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catatan — {noteDialog.machineName}, {noteDialog.date ? formatDate(noteDialog.date) : ""}</DialogTitle>
            <DialogDescription>Apa yang terjadi hari itu? (dicek langsung ke operator)</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Contoh: mesin macet 3 jam, operator izin sakit, benang telat datang, dll."
            value={noteDialog.reason}
            onChange={(e) => setNoteDialog((s) => ({ ...s, reason: e.target.value }))}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog((s) => ({ ...s, open: false }))}>Batal</Button>
            <Button onClick={submitNote} disabled={noteDialog.saving || !noteDialog.reason.trim()}>
              {noteDialog.saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
