import { useState } from "react";
import { useReports } from "@/hooks/useReports";
import { useSchedule } from "@/hooks/useSchedule";
import { useDailyActuals } from "@/hooks/useDailyActuals";
import { STAGE_LABELS, makeCalendar } from "@/lib/scheduler";
import { computeDailyProductionGrid, segmentsFromDays } from "@/lib/dailyProductionGrid";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { FileDown, FileSpreadsheet, FileText, Users, Package, Factory, ChevronLeft, ChevronRight } from "lucide-react";
import { humanize, formatDate } from "@/lib/utils";
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
  const { schedule, raw } = useSchedule();
  const { toast } = useToast();
  const [dpmStart, setDpmStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const dpmEnd = (() => {
    const d = new Date(dpmStart + "T00:00:00"); d.setDate(d.getDate() + 13);
    return d.toISOString().slice(0, 10);
  })();
  const { rows: dailyActualRows, loading: dpmLoading } = useDailyActuals(dpmStart, dpmEnd);
  const dpmCalendar = makeCalendar({ sundayOff: raw?.settings?.sunday_off ?? true, saturdayOff: raw?.settings?.saturday_off ?? false, holidays: raw?.holidays || [] });
  const soById = {}; (raw?.salesOrders || []).forEach((so) => { soById[so.id] = so; });
  const dpmGrid = computeDailyProductionGrid({
    machines: raw?.machines || [], board: schedule?.board || [], actualRows: dailyActualRows,
    soById, startDate: dpmStart, endDate: dpmEnd, calendar: dpmCalendar,
  });
  const dpmDates = Object.values(dpmGrid)[0]?.days.map((d) => d.date) || [];
  const shiftDpmWindow = (weeks) => {
    const d = new Date(dpmStart + "T00:00:00"); d.setDate(d.getDate() + weeks * 14);
    setDpmStart(d.toISOString().slice(0, 10));
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
                                {days.map((d) => (
                                  <td key={d.date}
                                    title={d.scheduled ? `${d.soNumber}${d.customerName ? " · " + d.customerName : ""}${d.styleName ? " · " + d.styleName : ""}` : "Not scheduled that day"}
                                    className={`whitespace-nowrap px-2 py-2 text-center ${!d.scheduled ? "text-muted-foreground/50" : d.missing ? "bg-rose-50 font-medium text-rose-700" : "text-foreground"}`}
                                  >
                                    {d.scheduled ? (d.missing ? "0" : d.pcs) : "—"}
                                  </td>
                                ))}
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
    </>
  );
}
