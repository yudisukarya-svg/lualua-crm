import { useState, useMemo } from "react";
import { CalendarCheck, Calculator, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useSchedule } from "@/hooks/useSchedule";
import { STAGES, STAGE_LABELS, GAUGES } from "@/lib/scheduler";
import { typicalStageRates } from "@/lib/quoteSim";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const LATER = ["linking", "finishing", "steam", "label", "qc", "packing"];
const fmt = (d) => (d ? formatDate(d) : "—");

// "If a customer orders this today, when can we finish?" — a preview only,
// nothing is saved. Logic lives in src/lib/quoteSim.js.
export default function OrderQuote() {
  const { raw, loading, runQuote, capacityBasis, dynamicLoading } = useSchedule();
  const typical = useMemo(() => (raw ? typicalStageRates(raw.styles) : {}), [raw]);

  const [form, setForm] = useState({
    qty: "", method: "machine", gauge: "7", knitting: "", deadline: "",
    samplingDays: "7", yarnDays: "5", marginDays: "3",
  });
  const [rates, setRates] = useState({}); // later-stage overrides; empty = typical
  const [skip, setSkip] = useState([]);
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState(0);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setResult(null); };
  const rateOf = (s) => (rates[s] !== undefined ? rates[s] : String(typical[s] ?? ""));

  const calc = () => {
    const input = {
      qty: form.qty, method: form.method, gauge: form.gauge, deadline: form.deadline || null,
      samplingDays: form.samplingDays, yarnDays: form.yarnDays, marginDays: form.marginDays,
      skipStages: skip,
      rates: { knitting: form.knitting, ...Object.fromEntries(LATER.map((s) => [s, rateOf(s)])) },
    };
    const r = runQuote(input);
    setResult(r);
    // default to the fewest machines that already gives the best finish date
    if (r?.options?.length) {
      const best = r.options.reduce((b, o) => (o.completionDate && (!b || o.completionDate < b) ? o.completionDate : b), null);
      setPick(Math.max(0, r.options.findIndex((o) => o.completionDate === best)));
    }
  };

  if (loading || !raw) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;

  const opt = result?.options?.[pick];

  return (
    <div className="space-y-6">
      <PageHeader title="Order quote" subtitle="If a customer orders this today, when can we finish it?" />

      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Quantity (pcs)</Label>
            <Input type="number" min="1" value={form.qty} onChange={(e) => set("qty", e.target.value)} placeholder="e.g. 100" />
          </div>
          <div className="space-y-1.5">
            <Label>Knitting method</Label>
            <Select value={form.method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="machine">Machine</SelectItem>
                <SelectItem value="manual">Manual (hand)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.method === "machine" && (
            <div className="space-y-1.5">
              <Label>Gauge</Label>
              <Select value={form.gauge} onValueChange={(v) => set("gauge", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GAUGES.map((g) => <SelectItem key={g} value={g}>{g}G</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Knitting speed (pcs/day per {form.method === "machine" ? "machine" : "worker"})</Label>
            <Input type="number" min="0" step="0.5" value={form.knitting} onChange={(e) => set("knitting", e.target.value)} placeholder="e.g. 10" />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Later stages — untick a stage this style doesn't go through. Stages marked "real team" use the whole team's actual output (last 30 days), shared with the orders ahead in the queue.</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {LATER.map((s) => {
              const skipped = skip.includes(s);
              const b = capacityBasis?.[s];
              const onReal = b?.source === "real";
              return (
                <div key={s} className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={!skipped} onChange={(e) => { setSkip((k) => e.target.checked ? k.filter((x) => x !== s) : [...k, s]); setResult(null); }} />
                    {STAGE_LABELS[s] || s}
                  </label>
                  {onReal ? (
                    <p className={`rounded-md border px-3 py-2 text-xs ${skipped ? "text-muted-foreground/50" : "text-muted-foreground"}`}>real team: <strong>{b.usedPcs}</strong> pcs/day</p>
                  ) : (
                    <Input type="number" min="0" disabled={skipped} value={skipped ? "" : rateOf(s)} onChange={(e) => { setRates((r) => ({ ...r, [s]: e.target.value })); setResult(null); }} placeholder="pcs/day per worker" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Sampling / approval (working days)</Label>
            <Input type="number" min="0" value={form.samplingDays} onChange={(e) => set("samplingDays", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Yarn arrival (working days)</Label>
            <Input type="number" min="0" value={form.yarnDays} onChange={(e) => set("yarnDays", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Safety margin (working days)</Label>
            <Input type="number" min="0" value={form.marginDays} onChange={(e) => set("marginDays", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Customer's requested date (optional)</Label>
            <Input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          With a requested date, the new order waits only behind orders due on or before that date. Without one, it waits behind every order.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" onClick={calc} disabled={dynamicLoading}><Calculator className="h-4 w-4" /> Calculate</Button>
          {dynamicLoading && <span className="text-xs text-muted-foreground">Loading latest progress from PO Tukang…</span>}
        </div>
      </Card>

      {result?.problems?.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <ul className="list-disc pl-4">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        </Card>
      )}

      {opt && (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date to give the customer</p>
                <p className="mt-1 flex items-center gap-2 text-2xl font-semibold"><CalendarCheck className="h-6 w-6 text-primary" /> {fmt(opt.quotedDate)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Forecast finish {fmt(opt.completionDate)} + {form.marginDays || 0} working days margin</p>
              </div>
              {form.deadline && opt.meetsDeadline !== null && (
                opt.meetsDeadline
                  ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Meets requested {fmt(form.deadline)}</Badge>
                  : <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Later than requested {fmt(form.deadline)}</Badge>
              )}
            </div>
            <p className="mt-4 text-sm">
              Earliest production start: <strong>{fmt(result.earliestStart)}</strong> (today + {Number(form.samplingDays || 0) + Number(form.yarnDays || 0)} working days for sampling and yarn).
            </p>

            {result.options.length > 1 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold">Machine options</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Machines</TableHead>
                      <TableHead>Knitting</TableHead>
                      <TableHead>Finish</TableHead>
                      <TableHead>Quote</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.options.map((o, i) => (
                      <TableRow key={i} className={i === pick ? "bg-muted/60" : "cursor-pointer"} onClick={() => setPick(i)}>
                        <TableCell><input type="radio" checked={i === pick} onChange={() => setPick(i)} /></TableCell>
                        <TableCell>{o.count} — {o.machines.join(", ")}</TableCell>
                        <TableCell className="text-muted-foreground">{fmt(o.stageStart.knitting)} → {fmt(o.stageFinish.knitting)}</TableCell>
                        <TableCell>{fmt(o.completionDate)}</TableCell>
                        <TableCell className="font-medium">{fmt(o.quotedDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-1 text-xs text-muted-foreground">Machines are tried in order of when they become free. More machines only helps if knitting is the slow part.</p>
              </div>
            )}

            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Per stage</p>
              <Table>
                <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead>Start</TableHead><TableHead>Finish</TableHead></TableRow></TableHeader>
                <TableBody>
                  {STAGES.filter((s) => !skip.includes(s)).map((s) => (
                    <TableRow key={s}>
                      <TableCell>{STAGE_LABELS[s] || s}</TableCell>
                      <TableCell className="text-muted-foreground">{fmt(opt.stageStart[s])}</TableCell>
                      <TableCell>{fmt(opt.stageFinish[s])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-6">
            <p className="mb-2 text-sm font-semibold">Effect on existing orders</p>
            {opt.delayed.length === 0 ? (
              <p className="text-sm text-emerald-700">No existing order finishes later because of this order.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>SO</TableHead><TableHead>Due</TableHead><TableHead>Finish now</TableHead><TableHead>With new order</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {opt.delayed.map((d) => (
                    <TableRow key={d.soNumber}>
                      <TableCell className="font-medium">{d.soNumber}</TableCell>
                      <TableCell>{fmt(d.dueDate)}</TableCell>
                      <TableCell>{fmt(d.before)}</TableCell>
                      <TableCell>{fmt(d.after)}</TableCell>
                      <TableCell>{d.nowLate ? <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Becomes late</Badge> : <span className="text-xs text-muted-foreground">still on time</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Card className="p-4 text-xs text-muted-foreground">
        <div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>Preview only — nothing is saved. Uses the same forecast as Planning: real progress of every open order (PO Tukang + Dispatch), the Machine Board queues, the Calendar, and each stage's capacity:</p>
            <p className="mt-1">
              {LATER.map((s) => {
                const b = capacityBasis?.[s];
                if (!b) return null;
                return <span key={s} className="mr-3 inline-block">{STAGE_LABELS[s] || s}: <strong>{b.usedPcs}</strong>/day {b.source === "real" ? "(real, last 30 days)" : "(from Resources)"}</span>;
              })}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
