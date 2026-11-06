import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Loader2, Plus, Copy, Check, History, ExternalLink, Pencil, StickyNote } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import MediaGrid, { useThumbUrls } from "@/components/archive/MediaGrid";
import { LabelDialog, NoteDialog, PoDialog, StyleDialog } from "@/components/archive/Dialogs";
import { fetchCustomerPage, markCustomerRead, fmtDate, LABEL_ITEMS, NOTE_TOPICS, PO_STATUS, labelOf } from "@/lib/archive";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "styles", label: "Style" },
  { key: "label", label: "Label & packing" },
  { key: "notes", label: "Percakapan & PO" },
];

export default function ArchiveCustomer() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "styles";
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => fetchCustomerPage(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  // Ambil update dari admin lain sejak kunjungan terakhir, lalu tandai sudah dibaca
  const [updates, setUpdates] = useState([]);
  useEffect(() => { setUpdates([]); markCustomerRead(id).then((u) => setUpdates(u ?? [])).catch(() => {}); }, [id]);
  const newStyles = useMemo(() => new Set(updates.map((u) => u.style_id).filter(Boolean)), [updates]);

  if (error) return <EmptyState title="Gagal memuat" description={error} />;
  if (!data) return <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>;
  const c = data.customer;
  const openNotes = data.notes.filter((n) => n.status === "open").length;

  return (
    <>
      <Link to="/archive" className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Arsip Customer</Link>
      <PageHeader title={c?.customer_name}
        subtitle={[`${data.styles.length} style`, c?.country, c?.contact_person && `kontak: ${c.contact_person}`].filter(Boolean).join(" · ")}>
        <Button variant="outline" asChild><Link to={`/customers/${id}`}>Buka di Customers</Link></Button>
      </PageHeader>

      {updates.length > 0 && <UpdatesCard updates={updates} onClose={() => setUpdates([])} />}

      <div role="tablist" aria-label="Bagian arsip" className="mb-5 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm", tab === t.key ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}{t.key === "notes" && openNotes > 0 ? ` (${openNotes})` : ""}
          </button>
        ))}
      </div>

      {tab === "styles" && <StylesTab styles={data.styles} customerId={id} onSaved={load} newStyles={newStyles} />}
      {tab === "label" && <LabelTab customerId={id} rows={data.label_packing} styles={data.styles} onSaved={load} />}
      {tab === "notes" && <NotesTab customer={c} notes={data.notes} pos={data.pos} styles={data.styles} onSaved={load} />}
    </>
  );
}

function StylesTab({ styles, customerId, onSaved, newStyles }) {
  const thumbs = useThumbUrls(styles.map((s) => ({ thumb: s.cover_thumb })));
  const [open, setOpen] = useState(false);
  const dialog = <StyleDialog open={open} onOpenChange={setOpen} customerId={customerId} onSaved={onSaved} />;
  if (!styles.length) return (<>
    <EmptyState title="Belum ada style" description="Tambahkan style pertama untuk customer ini."
      action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Style baru</Button>} />{dialog}</>);
  return (
    <>
    <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Style baru</Button></div>
    {dialog}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {styles.map((s) => (
        <Link key={s.id} to={`/archive/style/${s.id}`} className="overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md">
          <div className="flex h-40 items-center justify-center bg-muted">
            {s.cover_thumb && thumbs[s.cover_thumb]
              ? <img src={thumbs[s.cover_thumb]} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
          </div>
          <div className="space-y-1 p-4">
            <p className="font-semibold">{s.name}{newStyles?.has(s.id) && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 align-middle text-[11px] font-semibold text-primary-foreground">baru</span>}</p>
            <p className="text-sm text-muted-foreground">
              {[s.knitting_method === "machine" ? "Mesin" : s.knitting_method === "manual" ? "Manual" : s.knitting_method, s.knitting_gauge && `gauge ${s.knitting_gauge}`].filter(Boolean).join(" · ") || "—"}
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5">{s.entries} entri</span>
              <span className="rounded-full bg-muted px-2 py-0.5">{s.photos} foto</span>
              {s.last_date && <span className="rounded-full bg-muted px-2 py-0.5">terakhir {fmtDate(s.last_date)}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
    </>
  );
}

function LabelCard({ row, def, onEdit }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{def.label}</h3>
          <p className="text-xs text-muted-foreground">{row ? `berlaku sejak ${fmtDate(row.effective_date)}` : "belum diisi"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}>{row ? "Perbarui" : "Isi"}</Button>
      </div>
      {row && <MediaGrid media={row.media} size="md" />}
      {row && (
        <dl className="divide-y text-sm">
          {def.fields.map((k) => (
            <div key={k} className="flex justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{row.details?.[k] || "—"}</dd>
            </div>
          ))}
          {row.notes && <p className="pt-2 text-muted-foreground">{row.notes}</p>}
        </dl>
      )}
    </Card>
  );
}

function LabelTab({ customerId, rows, styles, onSaved }) {
  const [dlg, setDlg] = useState(null);
  const [history, setHistory] = useState(false);
  const standard = useMemo(() => {
    const m = {};
    for (const r of rows) if (!r.style_id && !m[r.item]) m[r.item] = r; // rows come newest first
    return m;
  }, [rows]);
  const exceptions = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const r of rows) { const k = r.style_id + r.item; if (r.style_id && !seen.has(k)) { seen.add(k); out.push(r); } }
    return out;
  }, [rows]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Standar customer ini, dipakai semua style kecuali yang punya pengecualian.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setHistory(!history)}><History className="h-4 w-4" /> {history ? "Sembunyikan riwayat" : "Lihat riwayat perubahan"}</Button>
          <Button onClick={() => setDlg({})}><Plus className="h-4 w-4" /> Tambah / perbarui</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {LABEL_ITEMS.map((def) => <LabelCard key={def.value} def={def} row={standard[def.value]} onEdit={() => setDlg({ item: def.value, details: standard[def.value]?.details, notes: standard[def.value]?.notes })} />)}
      </div>
      <Card className="mt-4 border-amber-200 bg-amber-50/60 p-4">
        <h3 className="mb-2 font-semibold">Pengecualian per style</h3>
        {exceptions.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada pengecualian.</p> : (
          <ul className="space-y-2 text-sm">
            {exceptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Link to={`/archive/style/${r.style_id}`} className="font-medium text-primary hover:underline">{r.style_name}</Link>
                <span>— {labelOf(LABEL_ITEMS, r.item)}: {Object.values(r.details || {}).filter(Boolean).join(", ") || r.notes || "—"} · sejak {fmtDate(r.effective_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {history && (
        <Card className="mt-4 p-4">
          <h3 className="mb-2 font-semibold">Riwayat perubahan</h3>
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-2 py-2">
                <span className="w-28 text-muted-foreground">{fmtDate(r.effective_date)}</span>
                <span className="font-medium">{labelOf(LABEL_ITEMS, r.item)}</span>
                <span className="text-muted-foreground">{r.style_name ? `(${r.style_name})` : "(standar)"}</span>
                <span>{Object.entries(r.details || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <LabelDialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)} customerId={customerId} styles={styles} initial={dlg} onSaved={onSaved} />
    </>
  );
}

function NotesTab({ customer, notes, pos, styles, onSaved }) {
  const { toast } = useToast();
  const [noteDlg, setNoteDlg] = useState(null);   // { mode, note }
  const [poOpen, setPoOpen] = useState(false);
  const [topic, setTopic] = useState("all");
  const [order, setOrder] = useState("new");
  const [copied, setCopied] = useState(null);

  const list = useMemo(() => {
    let r = topic === "all" ? notes : notes.filter((n) => n.topic === topic);
    if (order === "old") r = [...r].reverse();
    return r;
  }, [notes, topic, order]);

  async function setStatus(table, id, status) {
    const { error } = await supabase.from(table).update({ status }).eq("id", id);
    if (error) toast({ variant: "destructive", title: "Gagal", description: error.message }); else onSaved();
  }
  async function copyReminder(n) {
    const text = `Halo ${customer?.contact_person || customer?.customer_name}, mengingatkan kembali percakapan kita tanggal ${fmtDate(n.note_date)}` +
      `${n.style_name ? ` mengenai ${n.style_name}` : ""}: ${n.title}.${n.summary ? ` ${n.summary}` : ""}` +
      `${(n.links ?? []).map((l) => `\n${l.label ? `${l.label}: ` : ""}${l.url}`).join("")}\nTerima kasih.`;
    try { await navigator.clipboard.writeText(text); setCopied(n.id); setTimeout(() => setCopied(null), 2000); }
    catch { toast({ title: "Salin manual", description: text }); }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setPoOpen(true)}><Plus className="h-4 w-4" /> Upload PO customer</Button>
        <Button variant="outline" onClick={() => setNoteDlg({ mode: "whatsapp" })}><Plus className="h-4 w-4" /> Simpan screenshot</Button>
        <Button onClick={() => setNoteDlg({ mode: "catatan" })}><StickyNote className="h-4 w-4" /> Catatan / link</Button>
      </div>

      <Card className="mb-5 p-4">
        <h3 className="mb-2 font-semibold">PO asli dari customer</h3>
        {pos.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada PO yang di-upload.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Tanggal PO</th><th className="py-2 pr-3 font-medium">No. PO customer</th>
                <th className="py-2 pr-3 font-medium">SO Lualua</th><th className="py-2 pr-3 font-medium">File</th><th className="py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3">{fmtDate(p.po_date)}</td>
                    <td className="py-2 pr-3 font-medium">{p.po_number || "—"}{p.notes && <p className="text-xs font-normal text-muted-foreground">{p.notes}</p>}</td>
                    <td className="py-2 pr-3">{p.so_number || "—"}</td>
                    <td className="py-2 pr-3"><MediaGrid media={p.media} size="sm" /></td>
                    <td className="py-2">
                      <select aria-label="Status PO" value={p.status} onChange={(e) => setStatus("customer_pos", p.id, e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                        {PO_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[{ value: "all", label: "Semua" }, ...NOTE_TOPICS].map((t) => (
          <button key={t.value} onClick={() => setTopic(t.value)}
            className={cn("rounded-full border px-3 py-1.5 text-sm", topic === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{t.label}</button>
        ))}
        <span className="flex-1" />
        <select aria-label="Urutkan" value={order} onChange={(e) => setOrder(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="new">Terbaru dulu</option><option value="old">Terlama dulu</option>
        </select>
      </div>

      {list.length === 0 ? <EmptyState title="Belum ada percakapan atau catatan" description="Simpan screenshot WhatsApp, atau tulis catatan dan link penting dari customer." /> : (
        <div className="space-y-3">
          {list.map((n) => (
            <Card key={n.id} className="flex flex-wrap gap-4 p-4">
              <MediaGrid media={n.media} size="md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{fmtDate(n.note_date)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{labelOf(NOTE_TOPICS, n.topic)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", n.status === "open" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900")}>
                    {n.status === "open" ? "Masih relevan" : "Selesai"}</span>
                </div>
                <p className="font-semibold">{n.kind === "catatan" && <StickyNote className="mr-1.5 inline h-4 w-4 text-muted-foreground" aria-label="Catatan" />}{n.title}</p>
                {n.summary && <p className="text-sm text-muted-foreground">{n.summary}</p>}
                {n.body && <p className="whitespace-pre-wrap break-words text-sm"><Linkify text={n.body} /></p>}
                {n.links?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {n.links.map((l, i) => (
                      <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-primary hover:bg-muted">
                        <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{l.label || hostOf(l.url)}</span>
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Terkait: {[n.style_name && <Link key="s" to={`/archive/style/${n.style_id}`} className="text-primary hover:underline">{n.style_name}</Link>, n.so_number].filter(Boolean).reduce((a, x, i) => (i ? [...a, " · ", x] : [x]), []) }
                  {!n.style_name && !n.so_number && "—"}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copyReminder(n)}>
                    {copied === n.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Salin pesan pengingat ke WhatsApp</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus("customer_notes", n.id, n.status === "open" ? "done" : "open")}>
                    {n.status === "open" ? "Tandai selesai" : "Buka lagi"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setNoteDlg({ note: n })}><Pencil className="h-4 w-4" /> Edit</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <NoteDialog open={!!noteDlg} onOpenChange={(o) => { if (!o) setNoteDlg(null); }} mode={noteDlg?.mode} note={noteDlg?.note}
        customerId={customer.id} styles={styles} onSaved={onSaved} />
      <PoDialog open={poOpen} onOpenChange={setPoOpen} customerId={customer.id} onSaved={onSaved} />
    </>
  );
}

const KIND_LABEL = { entri: "Entri", foto: "Foto", file: "File", spek: "Spek", label: "Label & packing", catatan: "Catatan", po: "PO customer", program: "Program mesin", style: "Style baru" };

function UpdatesCard({ updates, onClose }) {
  return (
    <Card className="mb-5 border-primary/40 bg-primary/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{updates.length} update baru sejak kunjungan terakhir Anda</p>
        <Button variant="ghost" size="sm" onClick={onClose}>Tutup</Button>
      </div>
      <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
        {updates.map((u, i) => (
          <li key={i} className="flex flex-wrap gap-x-2">
            <span className="text-muted-foreground">{fmtDate(u.at)} · {u.by}</span>
            <span className="font-medium">{KIND_LABEL[u.kind] ?? u.kind}</span>
            {u.style_id ? <Link to={`/archive/style/${u.style_id}`} className="text-primary hover:underline">{u.style_name}</Link> : null}
            {u.label && <span className="text-muted-foreground">— {u.label}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Ubah URL di dalam tulisan jadi link yang bisa diklik (tanpa HTML mentah)
function Linkify({ text }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-primary underline">{p}</a>
    : <span key={i}>{p}</span>));
}
