import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Save, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ---------- helpers ----------
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthLabel = (d) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(d);
const pct = (v, digits = 0) => (v == null ? "–" : `${(Number(v) * 100).toFixed(digits).replace(".", ",")}%`);
const num1 = (v) => (v == null ? "–" : Number(v).toFixed(1).replace(".", ","));
const rp = (v) => (v == null ? "–" : `Rp ${Math.round(Number(v)).toLocaleString("id-ID")}`);

function tierLabel(skor) {
  if (skor == null) return "Belum ada data";
  if (skor >= 90) return "Tier 100%";
  if (skor >= 80) return "Tier 75%";
  if (skor >= 70) return "Tier 50%";
  return "Di bawah 70";
}
function skorColor(skor) {
  if (skor == null) return "text-muted-foreground";
  if (skor >= 90) return "text-green-700";
  if (skor >= 80) return "text-emerald-700";
  if (skor >= 70) return "text-amber-700";
  return "text-red-700";
}
function barColor(nilai) {
  if (nilai == null) return "bg-muted";
  if (nilai >= 100) return "bg-green-600";
  if (nilai >= 80) return "bg-emerald-500";
  if (nilai >= 60) return "bg-amber-500";
  return "bg-red-500";
}

// ---------- page ----------
export default function Kpi() {
  const { toast } = useToast();
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [isOwner, setIsOwner] = useState(false);
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState([]);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [drafts, setDrafts] = useState({}); // key -> {aktual, catatan}
  const [saving, setSaving] = useState(null);
  const [bonusMax, setBonusMax] = useState("");

  const bulan = iso(month);
  const isCurrent = iso(firstOfMonth(new Date())) === bulan;

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const [own, hasil, ring] = await Promise.all([
        supabase.rpc("kpi_is_owner"),
        supabase.rpc("kpi_hasil", { p_bulan: bulan }),
        supabase.rpc("kpi_ringkasan", { p_bulan: bulan }),
      ]);
      if (hasil.error) throw hasil.error;
      if (ring.error) throw ring.error;
      setIsOwner(!!own.data);
      setRows(hasil.data ?? []);
      setSummary(ring.data ?? []);
      const max = ring.data?.find((r) => r.bonus_max != null)?.bonus_max;
      if (max != null) setBonusMax(String(Math.round(max)));
      setDrafts({});
    } catch (e) {
      setErr(e.message ?? String(e));
    }
  }, [bulan]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (summary.length && !summary.find((s) => s.karyawan === selected)) setSelected(summary[0].karyawan);
  }, [summary, selected]);

  const byKaryawan = useMemo(() => {
    const m = {};
    for (const r of rows ?? []) (m[r.karyawan] ||= []).push(r);
    return m;
  }, [rows]);

  const keyOf = (r) => `${r.karyawan}|${r.nama}`;

  async function saveManual(r) {
    const d = drafts[keyOf(r)] ?? {};
    const raw = d.aktual ?? (r.aktual == null ? "" : String(+(r.aktual * 100).toFixed(2)));
    const catatan = d.catatan ?? (r.keterangan ?? "");
    setSaving(keyOf(r));
    try {
      if (String(raw).trim() === "") {
        const { error } = await supabase.from("kpi_manual").delete().match({ bulan, karyawan: r.karyawan, nama: r.nama });
        if (error) throw error;
      } else {
        const v = Number(String(raw).replace(",", "."));
        if (!Number.isFinite(v) || v < 0 || v > 150) throw new Error("Isi angka 0–150 (dalam %).");
        const { error } = await supabase.from("kpi_manual").upsert(
          { bulan, karyawan: r.karyawan, nama: r.nama, aktual: v / 100, catatan: catatan || null, updated_at: new Date().toISOString() },
          { onConflict: "bulan,karyawan,nama" }
        );
        if (error) throw error;
      }
      toast({ title: "Tersimpan", description: `${r.karyawan} · ${r.nama}` });
      await load();
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function toggleFatal(s) {
    const next = !s.fatal;
    const { error } = await supabase.from("kpi_fatal").upsert(
      { bulan, karyawan: s.karyawan, fatal: next, updated_at: new Date().toISOString() },
      { onConflict: "bulan,karyawan" }
    );
    if (error) return toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    toast({ title: next ? "Kesalahan fatal dicatat" : "Kesalahan fatal dihapus", description: `${s.karyawan} · bonus ${next ? "dipotong 50%" : "normal"}` });
    load();
  }

  async function saveBonusMax() {
    const v = Number(String(bonusMax).replace(/\./g, ""));
    if (!Number.isFinite(v) || v < 0) return toast({ title: "Angka tidak valid", variant: "destructive" });
    const { error } = await supabase.from("kpi_settings").upsert({ id: 1, bonus_max: v, updated_at: new Date().toISOString() });
    if (error) return toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    toast({ title: "Bonus maksimal disimpan", description: rp(v) });
    load();
  }

  const header = (
    <PageHeader
      title={isOwner ? "KPI & Bonus" : "KPI Saya"}
      subtitle={isOwner
        ? "Skor KPI bulanan Arik, Tata dan Len. KPI otomatis dihitung dari Sample Management, PO Tukang, Dispatch, Zoho dan Stock Benang; KPI manual Anda isi di sini."
        : "Skor KPI bulanan Anda. Sebagian besar dihitung otomatis dari data aplikasi yang Anda isi setiap hari."}
    >
      <Button variant="outline" onClick={load} disabled={!rows}><RefreshCw className="h-4 w-4" /> Muat ulang</Button>
    </PageHeader>
  );

  const monthBar = (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Bulan sebelumnya"><ChevronLeft className="h-4 w-4" /></Button>
      <div className="min-w-[10rem] text-center text-lg font-semibold capitalize">{monthLabel(month)}</div>
      <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={isCurrent} aria-label="Bulan berikutnya"><ChevronRight className="h-4 w-4" /></Button>
      {isCurrent && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-900">Sementara · bulan berjalan</span>}
      {summary[0]?.uji_coba && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Uji coba · bonus tidak dibayar</span>}
    </div>
  );

  if (err) return <>{header}<EmptyState title="Gagal memuat KPI" description={err} /></>;
  if (!rows) return <>{header}{monthBar}<p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Menghitung KPI…</p></>;
  if (!rows.length) return <>{header}<EmptyState title="Tidak ada KPI untuk akun ini" description="KPI hanya tersedia untuk karyawan yang terdaftar di sistem bonus." /></>;

  const multi = summary.length > 1;
  const shown = selected ?? summary[0]?.karyawan;
  const list = byKaryawan[shown] ?? [];

  return (
    <>
      {header}
      {monthBar}

      {/* Summary cards */}
      <div className={cn("mb-5 grid gap-3", multi ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 sm:max-w-sm")}>
        {summary.map((s) => {
          const active = s.karyawan === shown;
          return (
            <Card key={s.karyawan}
              onClick={() => multi && setSelected(s.karyawan)}
              className={cn("p-4 transition-colors", multi && "cursor-pointer", active && multi ? "border-primary ring-1 ring-primary" : multi && "hover:bg-muted/40")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.karyawan}</p>
                  <p className="text-xs text-muted-foreground">{s.fokus}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-3xl font-bold leading-none", skorColor(s.skor))}>{num1(s.skor)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tierLabel(s.skor)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{s.kpi_terisi}/{s.kpi_total} KPI sudah ada nilai</p>
              {isOwner && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Bonus{s.fatal ? " (−50% fatal)" : ""}</p>
                    <p className="font-semibold">{rp(s.bonus_rp)}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!s.fatal} onChange={() => toggleFatal(s)} className="h-4 w-4" />
                    Kesalahan fatal
                  </label>
                </div>
              )}
              {!isOwner && s.fatal && (
                <p className="mt-3 flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Ada kesalahan fatal bulan ini</p>
              )}
            </Card>
          );
        })}
      </div>

      {/* KPI detail */}
      <h2 className="mb-3 font-semibold">KPI {shown}</h2>
      <div className="space-y-3">
        {list.map((r) => {
          const k = keyOf(r);
          const editable = isOwner && r.sumber === "manual";
          const d = drafts[k] ?? {};
          return (
            <Card key={k} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.nama}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.cara_ukur}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                  r.sumber === "auto" ? "bg-slate-100 text-slate-800" : "bg-yellow-100 text-yellow-900")}>
                  {r.sumber === "auto" ? "Otomatis" : "Manual"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Aktual</p><p className="font-semibold">{pct(r.aktual, 1)}</p></div>
                <div><p className="text-xs text-muted-foreground">Target</p><p>{pct(r.target)}</p></div>
                <div><p className="text-xs text-muted-foreground">Bobot</p><p>{pct(r.bobot)}</p></div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", barColor(r.nilai))} style={{ width: `${Math.min(100, r.nilai ?? 0)}%` }} />
                </div>
                <span className="w-24 text-right text-xs text-muted-foreground">nilai {num1(r.nilai)} · +{num1(r.skor)}</span>
              </div>

              {r.sumber === "auto" && r.keterangan && <p className="mt-2 text-xs text-muted-foreground">{r.keterangan}</p>}
              {r.sumber === "manual" && !editable && (
                <p className="mt-2 text-xs text-muted-foreground">{r.aktual == null ? "Belum diisi oleh owner." : r.keterangan}</p>
              )}

              {editable && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <div className="flex items-center gap-1">
                    <Input inputMode="decimal" className="w-20" placeholder="%"
                      value={d.aktual ?? (r.aktual == null ? "" : String(+(r.aktual * 100).toFixed(2)))}
                      onChange={(e) => setDrafts((x) => ({ ...x, [k]: { ...x[k], aktual: e.target.value } }))} />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <Input className="min-w-[10rem] flex-1" placeholder="Catatan (opsional)"
                    value={d.catatan ?? (r.keterangan ?? "")}
                    onChange={(e) => setDrafts((x) => ({ ...x, [k]: { ...x[k], catatan: e.target.value } }))} />
                  <Button size="sm" onClick={() => saveManual(r)} disabled={saving === k}>
                    {saving === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Rules + owner settings */}
      <Card className="mt-6 p-4 text-sm">
        <p className="font-semibold">Cara penilaian</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Nilai tiap KPI = aktual ÷ target × 100 (maksimal 100). Skor = jumlah nilai × bobot.</li>
          <li>Skor ≥90 = bonus 100% · 80–89 = 75% · 70–79 = 50% · di bawah 70 = tidak ada bonus.</li>
          <li>Kesalahan fatal di bulan itu memotong bonus 50%.</li>
          <li>KPI yang belum ada nilainya belum ikut dihitung, jadi skor bulan berjalan masih sementara.</li>
        </ul>
        {isOwner && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-sm">Bonus maksimal per orang</span>
            <Input inputMode="numeric" className="w-36" value={bonusMax} onChange={(e) => setBonusMax(e.target.value)} />
            <Button size="sm" variant="outline" onClick={saveBonusMax}><Save className="h-4 w-4" /> Simpan</Button>
          </div>
        )}
      </Card>
    </>
  );
}
