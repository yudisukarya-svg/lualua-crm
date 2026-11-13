import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import EmptyState from "@/components/EmptyState";
import {
  fetchSoTimeline, buildWaves, summarize, STAGES, MAIN_STAGES, STAGE_COLOR,
  toDate, daysBetween, fmtShort, fmtRp,
} from "@/lib/soTimeline";
import { cn } from "@/lib/utils";

const ICON = {
  so: "📄", yarn_calc: "🧮", yarn_order: "🛒", yarn_in: "🧶", yarn_stock: "📦", yarn_return: "↩️",
  reject: "⚠️", invoice: "🧾", payment: "💳", paid: "✅", ship: "🚚", return: "↩️", wave: "🏭",
};
// same-day order: SO first, then yarn, production, problems, shipping, money
const KIND_RANK = { so: 0, yarn_calc: 1, yarn_order: 2, yarn_in: 3, yarn_stock: 4, wave: 5, reject: 6, yarn_return: 7, ship: 8, return: 9, invoice: 10, payment: 11, paid: 12 };

function Chip({ tone, children }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs",
      tone === "bad" && "border-red-200 bg-red-50 text-red-800",
      tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
      tone === "ok" && "border-green-200 bg-green-50 text-green-800",
      !tone && "bg-background")}>{children}</span>
  );
}

export default function SoTimelineView({ so }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetchSoTimeline(so).then((d) => alive && setT(d)).catch((e) => alive && setErr(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [so]);

  const waves = useMemo(() => buildWaves(t?.production ?? []), [t]);
  if (loading) return <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat timeline…</p>;
  if (err) return <EmptyState title="Gagal memuat" description={err} />;
  if (!t || (!t.so_date && !t.events.length && !t.production.length)) return <EmptyState title="SO tidak ditemukan" description={`Tidak ada data untuk ${so}.`} />;

  const s = summarize(t, waves);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t.so}{t.customer && ` · ${t.customer}`}</h2>
        <p className="text-xs text-muted-foreground">Sumber: Zoho · YarnTrack · PO Tukang · Dispatch</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {t.so_date && <Chip>SO dibuat <b>{fmtShort(t.so_date)}</b></Chip>}
          {s.deadline && <Chip>{s.deadlineLabel} <b>{fmtShort(s.deadline)}</b></Chip>}
          {t.last_ship
            ? <Chip tone={s.lateDays > 0 ? "bad" : "ok"}>Dikirim <b>{fmtShort(t.last_ship)}</b>{s.lateDays > 0 ? ` · terlambat ${s.lateDays} hari` : s.lateDays != null ? " · tepat waktu" : ""}</Chip>
            : <Chip>Belum dikirim</Chip>}
          {t.paid_date ? <Chip tone="ok">Lunas <b>{fmtShort(t.paid_date)}</b>{s.paidDays != null && ` · ${s.paidDays} hari dari SO`}</Chip> : <Chip>Belum lunas</Chip>}
          {s.reorders > 0 && <Chip tone="warn">Benang tambahan <b>{s.reorders}×</b></Chip>}
          {s.stock > 0 && <Chip tone="warn">Ambil stok <b>{s.stock}×</b></Chip>}
          {s.rerajut > 0 && <Chip tone="warn">Rajut ulang <b>{s.rerajut}×</b></Chip>}
          {s.rejectPcs > 0 && <Chip tone="bad">Reject <b>{s.rejectPcs} pcs</b></Chip>}
          {!t.has_yarn_records && <Chip tone="warn">Belum ada catatan benang di YarnTrack</Chip>}
        </div>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold">A. Peta waktu (gelombang produksi)</h3>
        <p className="text-xs text-muted-foreground">Setiap kotak = satu gelombang produksi. Batang = tahap, dari serah terima pertama sampai terakhir. Arahkan kursor ke batang/titik untuk detail.</p>
        <Legend />
        <Gantt t={t} waves={waves} deadline={s.deadline} />
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold">B. Kronologi (urut tanggal)</h3>
        <p className="text-xs text-muted-foreground">Gelombang muncul di tanggal mulainya — klik untuk lihat serah terima per hari. Jeda 7 hari atau lebih ditandai.</p>
        <Chronology t={t} waves={waves} />
      </Card>
    </div>
  );
}

function Legend() {
  return (
    <div className="my-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {MAIN_STAGES.map((s) => <span key={s} className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: STAGE_COLOR[s] }} />{s}</span>)}
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" />benang datang</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />dari stok</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rotate-45 bg-red-600" />benang tambahan</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-700" />kirim</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-green-800" />lunas</span>
    </div>
  );
}

// ---------------- A. Gantt (inline SVG) ----------------
function Gantt({ t, waves, deadline }) {
  const dates = [t.so_date, deadline, ...t.events.map((e) => e.date), ...waves.flatMap((w) => [w.start, w.end])].filter(Boolean).sort();
  if (!dates.length) return null;
  const start = new Date(toDate(dates[0]).getTime() - 4 * 864e5).toISOString().slice(0, 10);
  const end = new Date(toDate(dates[dates.length - 1]).getTime() + 5 * 864e5).toISOString().slice(0, 10);
  const span = Math.max(daysBetween(start, end), 14);
  const L = 200, R = 70, W = Math.max(900, L + R + span * 9), rowH = 16;
  const x = (d) => L + (daysBetween(start, d) / span) * (W - L - R);
  const tip = (e) => `${fmtShort(e.date)} · ${e.title}${e.detail ? ` · ${e.detail}` : ""}${e.amount != null ? ` · ${fmtRp(e.amount)}` : ""}`;

  const parts = [];
  let y = 34;
  // weekly grid
  const ticks = [];
  for (let d = toDate(start).getTime(); d <= toDate(end).getTime(); d += 7 * 864e5) ticks.push(new Date(d).toISOString().slice(0, 10));

  // benang lane
  parts.push(<text key="yl" x={8} y={y + 11} fontSize="12.5" fontWeight="600">Benang</text>);
  parts.push(<text key="ys" x={8} y={y + 25} fontSize="11" fill="#6f6a62">datang · stok · tambahan</text>);
  t.events.filter((e) => e.kind.startsWith("yarn")).forEach((e, i) => {
    const xx = x(e.date), yy = y + 12;
    const c = e.flag === "reorder" ? "#d92d20" : e.flag === "stock" ? "#f79009" : e.kind === "yarn_in" ? "#12b76a" : "#98a2b3";
    parts.push(e.flag === "reorder"
      ? <path key={`y${i}`} d={`M${xx} ${yy - 7} L${xx + 7} ${yy} L${xx} ${yy + 7} L${xx - 7} ${yy}Z`} fill={c}><title>{tip(e)}</title></path>
      : <circle key={`y${i}`} cx={xx} cy={yy} r={5.5} fill={c}><title>{tip(e)}</title></circle>);
  });
  y += 40;

  if (!waves.length) {
    parts.push(<text key="np" x={L} y={y + 12} fontSize="12" fill="#6f6a62">Belum ada serah terima di PO Tukang.</text>);
    y += 30;
  }
  waves.forEach((w) => {
    const st = STAGES.filter((s) => w.stages[s] && MAIN_STAGES.includes(s));
    const h = Math.max(st.length, 2) * rowH + 30;
    parts.push(<rect key={`b${w.id}`} x={4} y={y - 4} width={W - 8} height={h} rx={8} fill={w.small ? "#fafafa" : "#fcfbf9"} stroke="#efebe5" />);
    parts.push(<text key={`l${w.id}`} x={12} y={y + 12} fontSize="12.5" fontWeight="600">{w.label}{w.rerajut && <tspan fill="#d92d20"> · rajut ulang</tspan>}</text>);
    parts.push(<text key={`n${w.id}`} x={12} y={y + 26} fontSize="11" fill="#6f6a62">{w.name.length > 30 ? `${w.name.slice(0, 29)}…` : w.name}<title>{w.name}</title></text>);
    st.forEach((s, i) => {
      const g = w.stages[s], yy = y + 4 + i * rowH, x1 = x(g.start), x2 = Math.max(x(g.end) + 6, x1 + 6);
      parts.push(<rect key={`${w.id}${s}`} x={x1} y={yy} width={x2 - x1} height={10} rx={3} fill={STAGE_COLOR[s]}><title>{`${s} · ${fmtShort(g.start)}–${fmtShort(g.end)} · ${g.pcs} pcs`}</title></rect>);
      parts.push(<text key={`${w.id}${s}t`} x={x2 + 4} y={yy + 9} fontSize="10.5" fill="#6f6a62">{s} {g.pcs}</text>);
    });
    y += h + 8;
  });

  // kirim & bayar lane
  parts.push(<text key="kl" x={8} y={y + 14} fontSize="12.5" fontWeight="600">Kirim & bayar</text>);
  t.events.filter((e) => ["ship", "return", "invoice", "payment", "paid"].includes(e.kind)).forEach((e, i) => {
    const xx = x(e.date), yy = y + 10;
    const c = e.kind === "ship" ? "#175cd3" : e.kind === "paid" ? "#067647" : e.kind === "return" ? "#d92d20" : "#98a2b3";
    parts.push(<rect key={`k${i}`} x={xx - 5} y={yy - 5} width={10} height={10} rx={e.kind === "ship" ? 2 : 5} fill={c}><title>{tip(e)}</title></rect>);
  });
  y += 32;

  const marks = [
    t.so_date && [t.so_date, `SO ${fmtShort(t.so_date)}`, "#1f1d1a"],
    deadline && [deadline, `Deadline ${fmtShort(deadline)}`, "#d92d20"],
    t.last_ship && [t.last_ship, `Kirim ${fmtShort(t.last_ship)}`, "#175cd3"],
  ].filter(Boolean);
  const H = y + 20;
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="block" role="img" aria-label={`Peta waktu ${t.so}`}>
        {ticks.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={22} y2={y} stroke="#efebe5" />
            <text x={x(d) + 2} y={16} fontSize="11" fill="#6f6a62">{fmtShort(d)}</text>
          </g>
        ))}
        {parts}
        {marks.map(([d, label, c], i) => (
          <g key={`m${i}`}>
            <line x1={x(d)} x2={x(d)} y1={22} y2={y} stroke={c} strokeDasharray="4 4" />
            <text x={x(d) + 3} y={y + 13} fontSize="11" fontWeight="600" fill={c}>{label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------- B. Kronologi ----------------
function Chronology({ t, waves }) {
  const [open, setOpen] = useState({});
  const items = [
    ...t.events.map((e) => ({ ...e })),
    ...waves.map((w) => ({ date: w.start, kind: "wave", w })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (KIND_RANK[a.kind] ?? 20) - (KIND_RANK[b.kind] ?? 20));

  let prev = null;
  const out = [];
  items.forEach((e, i) => {
    if (prev) {
      const g = daysBetween(prev, e.date);
      if (g >= 1) out.push(<div key={`g${i}`} className={cn("ml-[118px] py-0.5 text-xs", g >= 7 ? "font-semibold text-amber-700" : "text-muted-foreground")}>⏱ {g} hari{g >= 7 && " — tidak ada kegiatan tercatat"}</div>);
    }
    prev = e.date;
    if (e.kind === "wave") {
      const w = e.w, st = STAGES.filter((s) => w.stages[s]), span = daysBetween(w.start, w.end) || 1, isOpen = !!open[w.id];
      out.push(
        <Row key={w.id} icon={ICON.wave} date={<>{fmtShort(w.start)}<br /><span className="text-xs">s/d {fmtShort(w.end)}</span></>}>
          <button type="button" onClick={() => setOpen({ ...open, [w.id]: !isOpen })} className="flex items-center gap-1 text-left font-semibold hover:underline">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{w.label} · {w.name}
            {w.rerajut && <span className="ml-1 rounded-full bg-red-50 px-2 text-xs font-normal text-red-800">rajut ulang</span>}
          </button>
          <div className="mt-1 rounded-lg border bg-muted/30 px-3 py-2">
            {st.map((s) => {
              const g = w.stages[s];
              return (
                <div key={s} className="grid grid-cols-[96px_1fr_118px] items-center gap-2 py-0.5 text-sm">
                  <span>{s}</span>
                  <div className="relative h-2 rounded bg-muted">
                    <div className="absolute h-2 rounded" style={{ left: `${(daysBetween(w.start, g.start) / span) * 100}%`, width: `${Math.max((daysBetween(g.start, g.end) / span) * 100, 2)}%`, background: STAGE_COLOR[s] }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtShort(g.start)}{g.start !== g.end && `–${fmtShort(g.end)}`} · {g.pcs} pcs</span>
                </div>
              );
            })}
          </div>
          {isOpen && <WaveDetail w={w} />}
        </Row>,
      );
    } else {
      out.push(
        <Row key={`e${i}`} icon={ICON[e.kind] || "•"} date={fmtShort(e.date)}>
          <p className="font-semibold">{e.title}
            {e.flag === "reorder" && <span className="ml-2 rounded-full bg-red-50 px-2 text-xs font-normal text-red-800">beli lagi</span>}
            {e.flag === "stock" && <span className="ml-2 rounded-full bg-amber-50 px-2 text-xs font-normal text-amber-800">stok</span>}
          </p>
          {(e.detail || e.amount != null) && <p className="text-sm text-muted-foreground">{[e.detail, fmtRp(e.amount)].filter(Boolean).join(" · ")}</p>}
        </Row>,
      );
    }
  });
  return (
    <div className="relative mt-3">
      <div className="absolute bottom-0 left-[13px] top-0 w-0.5 bg-border" />
      {out}
    </div>
  );
}

function Row({ icon, date, children }) {
  return (
    <div className="relative flex gap-3 py-1.5">
      <div className="flex w-7 shrink-0 justify-center">
        <span className="z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-sm shadow-[0_0_0_1px_hsl(var(--border))]">{icon}</span>
      </div>
      <div className="w-[78px] shrink-0 pt-1 text-xs text-muted-foreground">{date}</div>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  );
}

function WaveDetail({ w }) {
  const days = {};
  for (const r of w.rows) ((days[r.date] ||= []).push(r));
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead><tr className="border-b bg-muted/50 text-left"><th className="px-2 py-1.5 font-medium">Tanggal</th><th className="px-2 py-1.5 font-medium">Tahap</th><th className="px-2 py-1.5 font-medium">Style</th><th className="px-2 py-1.5 text-right font-medium">Pcs</th></tr></thead>
        <tbody>
          {Object.keys(days).sort().flatMap((d) => days[d]
            .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.style.localeCompare(b.style))
            .map((r, i) => (
              <tr key={`${d}${r.stage}${r.style}`} className="border-b last:border-0">
                <td className="px-2 py-1 text-muted-foreground">{i === 0 ? fmtShort(d) : ""}</td>
                <td className="px-2 py-1"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[r.stage] }} />{r.stage}</td>
                <td className="px-2 py-1">{r.style}</td>
                <td className="px-2 py-1 text-right">{r.pcs}</td>
              </tr>
            )))}
        </tbody>
      </table>
    </div>
  );
}
