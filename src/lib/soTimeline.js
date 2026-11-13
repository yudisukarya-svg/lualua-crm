// Timeline SO — data loading + "gelombang" (production waves) logic.
// Data comes from 3 read-only database functions (no costs exposed):
//   so_timeline(p_so)            → summary + events (SO, benang, reject, kirim, invoice, bayar)
//   so_timeline_production(p_so) → serah terima per tahap · tanggal · style
//   so_timeline_search(p_q)      → SO list for the search box
import { supabase } from "@/lib/supabase";

export const STAGES = ["Rajut", "QC Rajut", "Linking", "QC Linking", "Finishing", "QC Finishing", "Steam", "Jahit", "Labelling", "QC Final"];
// stages drawn as bars on the map (QC steps are shown in the wave detail only)
export const MAIN_STAGES = ["Rajut", "Linking", "Finishing", "Steam", "Jahit", "Labelling", "QC Final"];
export const STAGE_COLOR = {
  "Rajut": "#7a5af8", "QC Rajut": "#b6a6fb", "Linking": "#0ba5ec", "QC Linking": "#7cd4fd",
  "Finishing": "#12b76a", "QC Finishing": "#75e0a7", "Steam": "#f79009", "Jahit": "#ee46bc",
  "Labelling": "#6172f3", "QC Final": "#98a2b3",
};

// Agreed rules (discussed with Yudi):
export const WAVE_RULES = {
  gapDays: 5,     // a style with no activity for >= 5 days starts a new wave
  mergeDays: 5,   // waves of different styles starting within 5 days are one wave
  smallPcs: 8,    // waves under 8 pcs in total = "Susulan / perbaikan"
};

const DAY = 864e5;
export const toDate = (s) => new Date(`${s}T00:00:00Z`);
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
export const fmtShort = (s) => (s ? toDate(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");
export const fmtRp = (n) => (n == null ? null : `Rp ${Number(n).toLocaleString("id-ID")}`);

export async function fetchSoTimeline(so) {
  const [a, b] = await Promise.all([
    supabase.rpc("so_timeline", { p_so: so }),
    supabase.rpc("so_timeline_production", { p_so: so }),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  if (!a.data) return null;
  return { ...a.data, events: (a.data.events ?? []).filter((e) => e.kind !== "prod"), production: b.data ?? [] };
}

export const PAGE_SIZE = 100;
// Zoho SO status → label shown in the app
export const SO_STATUS = [
  { value: "open", label: "Open", hint: "sudah dikonfirmasi, belum di-invoice" },
  { value: "overdue", label: "Overdue", hint: "lewat tanggal kirim di Zoho" },
  { value: "partially_invoiced", label: "Sebagian di-invoice", hint: "baru sebagian yang di-invoice" },
  { value: "invoiced", label: "Sudah di-invoice", hint: "sudah dibuatkan invoice" },
  { value: "draft", label: "Draft", hint: "belum dikonfirmasi di Zoho" },
];
export const soStatusLabel = (v) => SO_STATUS.find((x) => x.value === v)?.label ?? v;

// returns { rows, total }
export async function searchSo(q, status = "", page = 0) {
  const { data, error } = await supabase.rpc("so_timeline_search_v2", {
    p_q: q || "", p_status: status || "", p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE,
  });
  if (error) throw error;
  return { rows: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
}

export async function soStatusCounts(q) {
  const { data, error } = await supabase.rpc("so_timeline_status_counts", { p_q: q || "" });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.status, Number(r.n)]));
}

// rows: [{ stage, date, style, pcs }] → waves sorted by start date
export function buildWaves(rows, rules = WAVE_RULES) {
  const byStyle = {};
  for (const r of rows) (byStyle[r.style] ||= []).push({ ...r, pcs: Number(r.pcs) || 0 });

  // 1. per style: split when there is no activity for >= gapDays.
  //    A new wave = knitting (Rajut) starts again. A later segment WITHOUT Rajut is the
  //    continuation of that style's previous wave (e.g. QC Final / Labelling after a pause),
  //    unless it is tiny (< smallPcs) → shown separately as "Susulan / perbaikan".
  const raw = [];
  for (const [style, list] of Object.entries(byStyle)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const segs = [];
    let cur = null;
    for (const r of list) {
      if (!cur || daysBetween(cur.end, r.date) >= rules.gapDays) { cur = { start: r.date, end: r.date, rows: [] }; segs.push(cur); }
      cur.rows.push(r);
      cur.end = r.date;
    }
    let last = null; // last real wave of this style
    for (const seg of segs) {
      const pcs = seg.rows.reduce((a, r) => a + r.pcs, 0);
      const hasRajut = seg.rows.some((r) => r.stage === "Rajut");
      if (!hasRajut && pcs >= rules.smallPcs && last) {
        last.rows.push(...seg.rows);
        if (seg.end > last.end) last.end = seg.end;
        continue;
      }
      const w = { styles: [style], start: seg.start, end: seg.end, rows: seg.rows, small: !hasRajut && pcs < rules.smallPcs };
      raw.push(w);
      if (!w.small) last = w;
    }
  }

  // 2. merge waves of different styles that start together
  raw.sort((a, b) => a.start.localeCompare(b.start) || a.styles[0].localeCompare(b.styles[0]));
  const waves = [];
  for (const w of raw) {
    const m = !w.small && waves.find((x) => !x.small && Math.abs(daysBetween(x.start, w.start)) <= rules.mergeDays);
    if (m) {
      m.styles.push(...w.styles);
      m.rows.push(...w.rows);
      if (w.end > m.end) m.end = w.end;
    } else waves.push(w);
  }

  // 3. per-stage summary, labels, "rajut ulang"
  let n = 0;
  const seen = new Set();
  for (const w of waves) {
    w.stages = {};
    for (const r of w.rows) {
      const s = (w.stages[r.stage] ||= { start: r.date, end: r.date, pcs: 0 });
      if (r.date < s.start) s.start = r.date;
      if (r.date > s.end) s.end = r.date;
      s.pcs += r.pcs;
    }
    w.label = w.small ? "Susulan / perbaikan" : `Gelombang ${++n}`;
    const knitted = new Set(w.rows.filter((r) => r.stage === "Rajut").map((r) => r.style));
    w.rerajut = !w.small && [...knitted].some((st) => seen.has(st));
    if (!w.small) knitted.forEach((st) => seen.add(st));
    w.styles = [...new Set(w.styles)];
    w.name = w.styles.join(" + ");
    w.id = `${w.start}|${w.styles.join("|")}`;
  }
  return waves;
}

export function summarize(t, waves) {
  const deadline = t.customer_deadline || t.ship_target;
  const lateDays = t.last_ship && deadline ? daysBetween(deadline, t.last_ship) : null;
  const ev = t.events ?? [];
  return {
    deadline,
    deadlineLabel: t.customer_deadline ? "Deadline customer" : "Target kirim (Zoho)",
    lateDays,
    paidDays: t.paid_date && t.so_date ? daysBetween(t.so_date, t.paid_date) : null,
    reorders: ev.filter((e) => e.flag === "reorder").length,
    stock: ev.filter((e) => e.flag === "stock").length,
    rejectPcs: ev.filter((e) => e.kind === "reject").reduce((a, e) => a + (parseInt(e.detail, 10) || 0), 0),
    rerajut: waves.filter((w) => w.rerajut).length,
  };
}
