import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchCustomerList, searchArchive, fmtDate } from "@/lib/archive";

const PAGE = 200;

export default function Archive() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [hits, setHits] = useState(null);
  const [onlyNew, setOnlyNew] = useState(false);

  useEffect(() => { fetchCustomerList().then(setRows).catch((e) => setError(e.message)); }, []);

  // Search styles & specs only after typing stops (saves requests & logs)
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => searchArchive(q.trim()).then(setHits).catch(() => setHits([])), 450);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = useMemo(() => {
    let r = rows ?? [];
    if (q.trim()) r = r.filter((c) => c.customer_name?.toLowerCase().includes(q.trim().toLowerCase()));
    if (onlyNew) r = r.filter((c) => Number(c.unread) > 0);
    if (sort === "name") r = [...r].sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    if (sort === "styles") r = [...r].sort((a, b) => b.styles - a.styles);
    return r;
  }, [rows, q, sort, onlyNew]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const totalStyles = (rows ?? []).reduce((a, c) => a + Number(c.styles), 0);
  const newCustomers = (rows ?? []).filter((c) => Number(c.unread) > 0).length;

  return (
    <>
      <PageHeader title="Arsip Customer"
        subtitle={rows ? `Spek, foto, program, label & packing per customer · ${rows.length} customer · ${totalStyles} style` : "Memuat…"} />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" aria-label="Cari" placeholder="Cari customer, style, atau isi spek (mis. merino 12GG)"
              value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <select aria-label="Urutkan" value={sort} onChange={(e) => setSort(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-56">
            <option value="recent">Urut: terbaru diupdate</option>
            <option value="name">Urut: nama A–Z</option>
            <option value="styles">Urut: jumlah style</option>
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm">
            <input type="checkbox" checked={onlyNew} onChange={(e) => { setOnlyNew(e.target.checked); setPage(0); }} />
            Hanya yang ada update{newCustomers ? ` (${newCustomers})` : ""}
          </label>
        </div>
        {hits && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Style yang cocok ({hits.length})</p>
            {hits.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada style yang cocok.</p> : (
              <div className="flex flex-wrap gap-2">
                {hits.map((h) => (
                  <Link key={h.id} to={`/archive/style/${h.id}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">
                    {h.name} <span className="text-muted-foreground">· {h.customer_name ?? "—"} · {h.matched_in}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {error ? <EmptyState title="Gagal memuat" description={error} /> :
       !rows ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p> :
       filtered.length === 0 ? <EmptyState title="Customer tidak ditemukan" /> : (
        <>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageRows.map((c) => {
              const unread = Number(c.unread) || 0;
              return (
                <Link key={c.id} to={`/archive/customer/${c.id}`}
                  className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted ${unread ? "border-primary/50 bg-primary/5" : "bg-card"}`}>
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${unread ? "font-semibold" : "font-medium"}`} title={c.customer_name}>{c.customer_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.styles} style{Number(c.photos) ? ` · ${c.photos} foto` : ""}{Number(c.files) ? ` · ${c.files} file` : ""}
                      {c.last_activity ? ` · ${fmtDate(c.last_activity)}` : ""}
                    </p>
                  </div>
                  {unread > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">{unread} baru</span>}
                  {Number(c.open_notes) > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900" title="Catatan aktif">{c.open_notes}</span>}
                </Link>
              );
            })}
          </div>
          {filtered.length > PAGE && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Menampilkan {page * PAGE + 1}–{Math.min(filtered.length, page * PAGE + PAGE)} dari {filtered.length}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Berikutnya</Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
