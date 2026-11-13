import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAttention, TEAMS, CHECKS } from "@/lib/attention";
import { fmtShort, fmtRp } from "@/lib/soTimeline";
import { cn } from "@/lib/utils";

const SHOW = 10; // rows per check before "lihat semua"

export default function Attention() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [team, setTeam] = useState("");
  const [expanded, setExpanded] = useState({});
  const load = () => { setRows(null); fetchAttention().then((r) => { setRows(r); setErr(null); }).catch((e) => setErr(e.message)); };
  useEffect(load, []);

  const byCode = useMemo(() => {
    const m = {};
    for (const r of rows ?? []) (m[r.code] ||= []).push(r);
    return m;
  }, [rows]);
  const teamCount = (t) => (rows ?? []).filter((r) => r.team === t).length;

  if (err) return <EmptyState title="Gagal memuat" description={err} />;
  return (
    <>
      <PageHeader title="Perlu Perhatian" subtitle="Daftar otomatis SO yang perlu ditindaklanjuti — dihitung dari Zoho, YarnTrack, PO Tukang & Dispatch. Tidak perlu input apa pun.">
        <Button variant="outline" onClick={load} disabled={!rows}><RefreshCw className="h-4 w-4" /> Muat ulang</Button>
      </PageHeader>

      {!rows ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memeriksa semua SO…</p> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {TEAMS.map((t) => {
              const n = teamCount(t.value);
              return (
                <button key={t.value} type="button" aria-pressed={team === t.value} onClick={() => setTeam(team === t.value ? "" : t.value)}
                  className={cn("rounded-xl border p-4 text-left transition-colors", team === t.value ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50")}>
                  <p className="text-sm text-muted-foreground">{t.label}</p>
                  <p className={cn("text-2xl font-bold", n ? "text-amber-700" : "text-green-700")}>{n}</p>
                  <p className="text-xs text-muted-foreground">{team === t.value ? "klik lagi untuk semua tim" : "klik untuk saring"}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {Object.entries(CHECKS).filter(([, c]) => !team || c.team === team).map(([code, c]) => {
              const list = byCode[code] ?? [];
              const open = !!expanded[code];
              return (
                <Card key={code} className="p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{c.title} <span className={cn("ml-1 rounded-full px-2 py-0.5 text-xs", list.length ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900")}>{list.length}</span></h2>
                      <p className="text-xs text-muted-foreground">{TEAMS.find((t) => t.value === c.team)?.label} · {c.help}</p>
                    </div>
                  </div>
                  {list.length === 0 ? (
                    <p className="flex items-center gap-1.5 text-sm text-green-800"><CheckCircle2 className="h-4 w-4" /> Beres — tidak ada SO di daftar ini.</p>
                  ) : (
                    <>
                      <ul className="divide-y text-sm">
                        {(open ? list : list.slice(0, SHOW)).map((r) => (
                          <li key={`${code}${r.so}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                            <Link to={`/timeline/${encodeURIComponent(r.so)}`} className="w-24 shrink-0 font-semibold text-primary hover:underline" title="Buka Timeline SO">{r.so}</Link>
                            <span className="w-40 shrink-0 truncate" title={r.customer}>{r.customer || "—"}</span>
                            <span className="min-w-0 flex-1 text-muted-foreground">{r.detail}</span>
                            {r.amount != null && <span className="whitespace-nowrap font-medium">{fmtRp(r.amount)}</span>}
                            {r.days != null && (
                              <span title={`${r.days} ${c.daysLabel}`}
                                className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs", r.days >= c.warnDays ? "bg-red-100 text-red-900" : "bg-muted text-muted-foreground")}>
                                {r.days} hari
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {list.length > SHOW && (
                        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setExpanded({ ...expanded, [code]: !open })}>
                          {open ? "Tampilkan lebih sedikit" : `Lihat semua ${list.length}`}
                        </Button>
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Diperbarui {fmtShort(new Date().toISOString().slice(0, 10))} · data Zoho disinkron tiap jam.</p>
        </>
      )}
    </>
  );
}
