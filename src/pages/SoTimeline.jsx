import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import SoTimelineView from "@/components/sotimeline/SoTimelineView";
import { searchSo, fmtShort } from "@/lib/soTimeline";

// /timeline        → search an SO
// /timeline/:so    → the timeline of one SO
export default function SoTimeline() {
  const { so } = useParams();
  if (so) {
    return (
      <>
        <Link to="/timeline" className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Cari SO lain</Link>
        <SoTimelineView so={decodeURIComponent(so)} />
      </>
    );
  }
  return <SoSearch />;
}

function SoSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const h = setTimeout(() => { searchSo(q.trim()).then((r) => { setRows(r); setErr(null); }).catch((e) => setErr(e.message)); }, 250);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <>
      <PageHeader title="Timeline SO" subtitle="Riwayat lengkap per SO: benang, produksi per gelombang, kirim, sampai lunas." />
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/timeline/${encodeURIComponent(q.trim())}`); }} className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nomor SO atau nama customer…" className="pl-9" aria-label="Cari SO" />
      </form>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!rows ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p> : (
        <Card className="divide-y">
          {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Tidak ada SO yang cocok.</p>}
          {rows.map((r) => (
            <Link key={r.so} to={`/timeline/${encodeURIComponent(r.so)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
              <span><b>{r.so}</b> · {r.customer}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtShort(r.so_date)} · {r.status}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
