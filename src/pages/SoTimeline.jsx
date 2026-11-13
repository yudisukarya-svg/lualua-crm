import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import SoTimelineView from "@/components/sotimeline/SoTimelineView";
import { searchSo, soStatusCounts, soStatusLabel, SO_STATUS, PAGE_SIZE, fmtShort } from "@/lib/soTimeline";
import { cn } from "@/lib/utils";

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
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [res, setRes] = useState(null);       // { rows, total }
  const [counts, setCounts] = useState({});
  const [err, setErr] = useState(null);

  // new search text or status → back to first page
  useEffect(() => { setPage(0); }, [q, status]);
  useEffect(() => {
    let alive = true; // ignore late answers from an older search
    const h = setTimeout(() => {
      searchSo(q.trim(), status, page).then((r) => { if (alive) { setRes(r); setErr(null); } }).catch((e) => alive && setErr(e.message));
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q, status, page]);
  useEffect(() => {
    const h = setTimeout(() => { soStatusCounts(q.trim()).then(setCounts).catch(() => {}); }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const all = Object.values(counts).reduce((a, n) => a + n, 0);
  const total = res?.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <PageHeader title="Timeline SO" subtitle="Riwayat lengkap per SO: benang, produksi per gelombang, kirim, sampai lunas." />
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/timeline/${encodeURIComponent(q.trim())}`); }} className="relative mb-3 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nomor SO atau nama customer…" className="pl-9" aria-label="Cari SO" />
      </form>

      <div role="group" aria-label="Filter status SO" className="mb-3 flex flex-wrap gap-1.5">
        {[{ value: "", label: "Semua", hint: "semua status" }, ...SO_STATUS].map((st) => {
          const n = st.value ? counts[st.value] ?? 0 : all;
          return (
            <button key={st.value || "all"} type="button" title={st.hint} aria-pressed={status === st.value} onClick={() => setStatus(st.value)}
              className={cn("rounded-full border px-3 py-1.5 text-sm", status === st.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
              {st.label} <span className="opacity-70">({n.toLocaleString("id-ID")})</span>
            </button>
          );
        })}
      </div>

      {pages > 1 && <Pager page={page} pages={pages} total={total} onPage={setPage} />}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!res ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p> : (
        <Card className="divide-y">
          {res.rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Tidak ada SO yang cocok.</p>}
          {res.rows.map((r) => (
            <Link key={r.so} to={`/timeline/${encodeURIComponent(r.so)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
              <span className="min-w-0 truncate"><b>{r.so}</b> · {r.customer}</span>
              <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                {fmtShort(r.so_date)}
                <span className={cn("rounded-full px-2 py-0.5", STATUS_TONE[r.status] ?? "bg-muted")}>{soStatusLabel(r.status)}</span>
              </span>
            </Link>
          ))}
        </Card>
      )}
      {pages > 1 && <div className="mt-3"><Pager page={page} pages={pages} total={total} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></div>}
    </>
  );
}

const STATUS_TONE = {
  draft: "bg-amber-100 text-amber-900",
  overdue: "bg-red-100 text-red-900",
  open: "bg-blue-100 text-blue-900",
  partially_invoiced: "bg-violet-100 text-violet-900",
  invoiced: "bg-green-100 text-green-900",
};

// buttons "1–100", "101–200", …
function Pager({ page, pages, total, onPage }) {
  return (
    <div role="group" aria-label="Halaman" className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="mr-1 text-muted-foreground">Tampilkan:</span>
      {Array.from({ length: pages }, (_, i) => (
        <button key={i} type="button" aria-pressed={page === i} onClick={() => onPage(i)}
          className={cn("rounded-md border px-2.5 py-1", page === i ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
          {i * PAGE_SIZE + 1}–{Math.min((i + 1) * PAGE_SIZE, total)}
        </button>
      ))}
      <span className="ml-1 text-muted-foreground">dari {total.toLocaleString("id-ID")} SO</span>
    </div>
  );
}
