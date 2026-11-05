import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import FilesField, { useBatchUpload, summaryText } from "@/components/archive/FilesField";
import {
  ENTRY_KINDS, PHOTO_CATEGORIES, LABEL_ITEMS, NOTE_TOPICS, PO_STATUS, PROGRAM_BUCKET,
  todayStr, fmtDate, formatBytes,
} from "@/lib/archive";

// Native <select> keeps this light and accessible.
function Sel({ id, value, onChange, options, className = "" }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-md border border-input bg-background px-3 text-sm ${className}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Field({ label, htmlFor, children, hint }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function useSaver(onOpenChange, onSaved) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function save(fn) {
    setBusy(true);
    try {
      const msg = await fn();
      toast({ title: "Tersimpan", description: msg });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: e.message });
    } finally { setBusy(false); }
  }
  return { busy, save };
}

// ---------------- Entri riwayat style ----------------
export function EntryDialog({ open, onOpenChange, style, customerId, entry, onSaved }) {
  const up = useBatchUpload();
  const [f, setF] = useState({});
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => {
    if (open) {
      setF({ entry_date: entry?.entry_date ?? todayStr(), kind: entry?.kind ?? "sample", moq: entry?.moq ?? "", notes: entry?.notes ?? "", category: "sample" });
      up.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => save(async () => {
    if (!f.entry_date) throw new Error("Tanggal wajib diisi.");
    const payload = { style_id: style.id, entry_date: f.entry_date, kind: f.kind, moq: f.moq === "" ? null : Number(f.moq), notes: f.notes || null };
    let id = entry?.id;
    if (id) {
      const { error } = await supabase.from("style_entries").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("style_entries").insert(payload).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    const r = await up.run(() => ({ customerId, styleId: style.id, entryId: id, section: "photo", category: f.category, mediaDate: f.entry_date }));
    return summaryText(r);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Ubah entri" : "Entri baru"} · {style?.name}</DialogTitle>
          <DialogDescription>Biaya rajut, linking, finishing dan steam terisi otomatis dari PO Tukang sesuai tanggal entri.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tanggal (wajib)" htmlFor="en-date"><Input id="en-date" type="date" value={f.entry_date || ""} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></Field>
          <Field label="Jenis entri" htmlFor="en-kind"><Sel id="en-kind" value={f.kind || "sample"} onChange={(v) => setF({ ...f, kind: v })} options={ENTRY_KINDS} /></Field>
          <Field label="MOQ (pcs)" htmlFor="en-moq"><Input id="en-moq" type="number" min="0" value={f.moq ?? ""} onChange={(e) => setF({ ...f, moq: e.target.value })} /></Field>
        </div>
        <Field label="Catatan" htmlFor="en-notes"><Textarea id="en-notes" rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="mis. customer minta panjang +3 cm" /></Field>
        <Field label="Kategori foto" htmlFor="en-cat"><Sel id="en-cat" value={f.category || "sample"} onChange={(v) => setF({ ...f, category: v })} options={PHOTO_CATEGORIES} /></Field>
        <FilesField uploader={up} accept="image/*,.heic,.heif" hint="Foto otomatis diubah ke ±250 KB + versi kecil 20 KB" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Spek ----------------
const DEFAULT_SPEC_LABELS = ["Benang", "Warna", "Gauge", "Ukuran", "Berat per pcs", "Catatan teknis"];
export function SpecDialog({ open, onOpenChange, style, specs = [], onSaved }) {
  const [rows, setRows] = useState([]);
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => {
    if (open) setRows(specs.length ? specs.map((s) => ({ ...s })) : DEFAULT_SPEC_LABELS.map((l, i) => ({ label: l, value: "", sort_order: i })));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => save(async () => {
    const keep = rows.filter((r) => r.label?.trim());
    const removed = specs.filter((s) => !keep.some((k) => k.id === s.id)).map((s) => s.id);
    if (removed.length) {
      const { error } = await supabase.from("style_specs").delete().in("id", removed);
      if (error) throw error;
    }
    const payload = keep.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), style_id: style.id, label: r.label.trim(), value: r.value || null, sort_order: i, updated_at: new Date().toISOString() }));
    const withId = payload.filter((p) => p.id), noId = payload.filter((p) => !p.id);
    if (withId.length) { const { error } = await supabase.from("style_specs").upsert(withId); if (error) throw error; }
    if (noId.length) { const { error } = await supabase.from("style_specs").insert(noId); if (error) throw error; }
    return `${keep.length} baris spek`;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Spek · {style?.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Label" className="w-40" value={r.label} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <Input aria-label={`Nilai ${r.label}`} className="flex-1" value={r.value ?? ""} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <Button variant="ghost" size="icon" aria-label="Hapus baris" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { label: "", value: "" }])}><Plus className="h-4 w-4" /> Tambah baris</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Spec sheet / file umum ----------------
export function DocDialog({ open, onOpenChange, customerId, styleId, section = "spec_sheet", title, onSaved }) {
  const up = useBatchUpload();
  const [date, setDate] = useState(todayStr());
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => { if (open) { setDate(todayStr()); up.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => save(async () => {
    if (!up.items.length) throw new Error("Pilih file dulu.");
    const r = await up.run(() => ({ customerId, styleId, section, mediaDate: date }));
    return summaryText(r);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {section === "spec_sheet" && <DialogDescription>Setiap upload menjadi versi baru (v1, v2, …). Versi lama tetap tersimpan.</DialogDescription>}
        </DialogHeader>
        <Field label="Tanggal (wajib)" htmlFor="doc-date"><Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <FilesField uploader={up} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Label, tag & packing ----------------
export function LabelDialog({ open, onOpenChange, customerId, styles = [], initial, onSaved }) {
  const up = useBatchUpload();
  const [f, setF] = useState({});
  const { busy, save } = useSaver(onOpenChange, onSaved);
  const def = LABEL_ITEMS.find((x) => x.value === f.item) ?? LABEL_ITEMS[0];
  useEffect(() => {
    if (open) {
      setF({ item: initial?.item ?? "brand_label", style_id: initial?.style_id ?? "", effective_date: todayStr(), details: { ...(initial?.details ?? {}) }, notes: initial?.notes ?? "", photoCat: (LABEL_ITEMS.find((x) => x.value === (initial?.item ?? "brand_label"))?.photos ?? [])[0] });
      up.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => save(async () => {
    if (!f.effective_date) throw new Error("Tanggal berlaku wajib diisi.");
    const { data, error } = await supabase.from("label_packing").insert({
      customer_id: customerId, style_id: f.style_id || null, item: f.item, effective_date: f.effective_date, details: f.details, notes: f.notes || null,
    }).select("id").single();
    if (error) throw error;
    const r = await up.run(() => ({ customerId, styleId: f.style_id || null, labelId: data.id, section: "label_packing", category: f.photoCat, caption: f.photoCat, mediaDate: f.effective_date }));
    return `Versi baru berlaku ${fmtDate(f.effective_date)} · ${summaryText(r)}`;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Label, tag & packing</DialogTitle>
          <DialogDescription>Setiap simpan membuat versi baru bertanggal; versi lama tetap jadi riwayat.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Item" htmlFor="lp-item"><Sel id="lp-item" value={f.item || "brand_label"} onChange={(v) => setF({ ...f, item: v, photoCat: LABEL_ITEMS.find((x) => x.value === v)?.photos[0] })} options={LABEL_ITEMS} /></Field>
          <Field label="Berlaku untuk" htmlFor="lp-style">
            <Sel id="lp-style" value={f.style_id || ""} onChange={(v) => setF({ ...f, style_id: v })}
              options={[{ value: "", label: "Standar customer (semua style)" }, ...styles.map((s) => ({ value: s.id, label: `Pengecualian: ${s.name}` }))]} />
          </Field>
          <Field label="Berlaku sejak (wajib)" htmlFor="lp-date"><Input id="lp-date" type="date" value={f.effective_date || ""} onChange={(e) => setF({ ...f, effective_date: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {def.fields.map((k) => (
            <Field key={k} label={k} htmlFor={`lp-${k}`}>
              <Input id={`lp-${k}`} value={f.details?.[k] ?? ""} onChange={(e) => setF({ ...f, details: { ...f.details, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>
        <Field label="Catatan" htmlFor="lp-notes"><Textarea id="lp-notes" rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Field label="Jenis foto" htmlFor="lp-cat"><Sel id="lp-cat" value={f.photoCat || def.photos[0]} onChange={(v) => setF({ ...f, photoCat: v })} options={def.photos.map((p) => ({ value: p, label: p }))} /></Field>
        <FilesField uploader={up} accept="image/*,.heic,.heif" hint="Close-up dibuat lebih tajam supaya tulisan label & jahitan terbaca (±400 KB)" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Percakapan penting (screenshot WA) ----------------
export function NoteDialog({ open, onOpenChange, customerId, styles = [], defaultStyleId, onSaved }) {
  const up = useBatchUpload();
  const [f, setF] = useState({});
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => {
    if (open) { setF({ note_date: todayStr(), topic: "warna_bahan", title: "", summary: "", style_id: defaultStyleId ?? "", so_number: "" }); up.reset(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => save(async () => {
    if (!f.note_date || !f.title.trim()) throw new Error("Tanggal dan judul wajib diisi.");
    const { data, error } = await supabase.from("customer_notes").insert({
      customer_id: customerId, style_id: f.style_id || null, so_number: f.so_number || null, note_date: f.note_date,
      topic: f.topic, title: f.title.trim(), summary: f.summary || null,
    }).select("id").single();
    if (error) throw error;
    const r = await up.run(() => ({ customerId, styleId: f.style_id || null, noteId: data.id, section: "whatsapp", category: "screenshot", mediaDate: f.note_date }));
    return summaryText(r);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Simpan percakapan penting</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tanggal percakapan (wajib)" htmlFor="nt-date"><Input id="nt-date" type="date" value={f.note_date || ""} onChange={(e) => setF({ ...f, note_date: e.target.value })} /></Field>
          <Field label="Topik" htmlFor="nt-topic"><Sel id="nt-topic" value={f.topic || "lainnya"} onChange={(v) => setF({ ...f, topic: v })} options={NOTE_TOPICS} /></Field>
          <Field label="Style terkait" htmlFor="nt-style"><Sel id="nt-style" value={f.style_id || ""} onChange={(v) => setF({ ...f, style_id: v })} options={[{ value: "", label: "— tidak spesifik —" }, ...styles.map((s) => ({ value: s.id, label: s.name }))]} /></Field>
          <Field label="SO terkait" htmlFor="nt-so"><Input id="nt-so" placeholder="SO-0xxxx" value={f.so_number || ""} onChange={(e) => setF({ ...f, so_number: e.target.value })} /></Field>
        </div>
        <Field label="Judul singkat (wajib)" htmlFor="nt-title"><Input id="nt-title" placeholder="mis. Customer setuju warna Pearl" value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Ringkasan" htmlFor="nt-sum"><Textarea id="nt-sum" rows={2} value={f.summary || ""} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <FilesField uploader={up} accept="image/*,.heic,.heif" hint="Screenshot WhatsApp · ±100 KB, teks tetap tajam" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- PO asli customer ----------------
export function PoDialog({ open, onOpenChange, customerId, onSaved }) {
  const up = useBatchUpload();
  const [f, setF] = useState({});
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => { if (open) { setF({ po_date: todayStr(), po_number: "", so_number: "", status: "aktif", notes: "" }); up.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => save(async () => {
    if (!f.po_date) throw new Error("Tanggal PO wajib diisi.");
    if (!up.items.length) throw new Error("Upload file PO-nya.");
    const { data, error } = await supabase.from("customer_pos").insert({
      customer_id: customerId, po_date: f.po_date, po_number: f.po_number || null, so_number: f.so_number || null, status: f.status, notes: f.notes || null,
    }).select("id").single();
    if (error) throw error;
    const r = await up.run(() => ({ customerId, poId: data.id, section: "customer_po", category: "po", mediaDate: f.po_date }));
    return summaryText(r);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Upload PO customer</DialogTitle><DialogDescription>PDF, Excel, foto, atau screenshot email/WhatsApp. Revisi PO disimpan sebagai PO baru.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tanggal PO (wajib)" htmlFor="po-date"><Input id="po-date" type="date" value={f.po_date || ""} onChange={(e) => setF({ ...f, po_date: e.target.value })} /></Field>
          <Field label="No. PO customer" htmlFor="po-no"><Input id="po-no" value={f.po_number || ""} onChange={(e) => setF({ ...f, po_number: e.target.value })} /></Field>
          <Field label="SO Lualua (Zoho)" htmlFor="po-so"><Input id="po-so" placeholder="SO-0xxxx" value={f.so_number || ""} onChange={(e) => setF({ ...f, so_number: e.target.value })} /></Field>
          <Field label="Status" htmlFor="po-st"><Sel id="po-st" value={f.status || "aktif"} onChange={(v) => setF({ ...f, status: v })} options={PO_STATUS} /></Field>
        </div>
        <Field label="Catatan" htmlFor="po-notes"><Textarea id="po-notes" rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <FilesField uploader={up} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Program mesin ----------------
export function ProgramDialog({ open, onOpenChange, style, customerName, suggestions = [], onSaved }) {
  const [picked, setPicked] = useState([]);
  const [file, setFile] = useState(null);
  const [orderNo, setOrderNo] = useState("");
  const [rev, setRev] = useState("");
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => { if (open) { setPicked([]); setFile(null); setOrderNo(""); setRev(""); } }, [open]);

  const submit = () => save(async () => {
    const ids = [...picked];
    if (file) {
      if (file.size > 10 * 1024 * 1024) throw new Error("File program lebih dari 10 MB.");
      const folder = (customerName || "LAINNYA").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      const path = `${folder}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: e1 } = await supabase.storage.from(PROGRAM_BUCKET).upload(path, file, { contentType: "application/octet-stream", cacheControl: "31536000" });
      if (e1) throw e1;
      const { data, error } = await supabase.from("machine_program_files").insert({
        order_no: orderNo || null, revision: rev || null, style_name: style.name, customer_name: customerName,
        original_filename: file.name, storage_path: path, file_size: file.size, is_latest: true,
      }).select("id").single();
      if (error) throw error;
      ids.push(data.id);
    }
    if (!ids.length) throw new Error("Pilih program dari arsip atau upload file .rar baru.");
    const { error } = await supabase.from("style_programs").upsert(ids.map((id) => ({ style_id: style.id, program_id: id })));
    if (error) throw error;
    return `${ids.length} program ditautkan ke ${style.name}`;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Program mesin · {style?.name}</DialogTitle>
          <DialogDescription>Pilih dari Arsip Program Mesin (saran berdasarkan nama customer), atau upload file .rar baru. File yang sudah ada tidak di-upload ulang.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {suggestions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Tidak ada saran untuk customer ini.</p> : (
            <ul className="divide-y text-sm">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                    <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">Order {p.order_no || "—"} · REV {p.revision || "—"} · {fmtDate(p.date)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Atau upload program baru (.rar)</p>
          <input type="file" accept=".rar,.zip,.7z,.dat,.000" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" aria-label="File program" />
          {file && <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="No. order" aria-label="No. order" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            <Input placeholder="Revisi (mis. T)" aria-label="Revisi" value={rev} onChange={(e) => setRev(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Style baru ----------------
export function StyleDialog({ open, onOpenChange, customerId, onSaved }) {
  const [f, setF] = useState({});
  const { busy, save } = useSaver(onOpenChange, onSaved);
  useEffect(() => { if (open) setF({ name: "", knitting_method: "machine", knitting_gauge: "" }); }, [open]);
  const submit = () => save(async () => {
    if (!f.name.trim()) throw new Error("Nama style wajib diisi.");
    const { error } = await supabase.from("production_styles").insert({
      name: f.name.trim(), customer_id: customerId, knitting_method: f.knitting_method, knitting_gauge: f.knitting_gauge || null,
    });
    if (error) throw error;
    return `Style ${f.name.trim()} ditambahkan`;
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Style baru</DialogTitle>
          <DialogDescription>Pakai nama yang sama dengan nama item di Zoho / PO Tukang supaya ongkos tukang dan SO tersambung otomatis.</DialogDescription>
        </DialogHeader>
        <Field label="Nama style (wajib)" htmlFor="st-name"><Input id="st-name" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Granita Maxi Dress" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Metode rajut" htmlFor="st-method"><Sel id="st-method" value={f.knitting_method || "machine"} onChange={(v) => setF({ ...f, knitting_method: v })} options={[{ value: "machine", label: "Mesin" }, { value: "manual", label: "Manual" }]} /></Field>
          <Field label="Gauge" htmlFor="st-gauge"><Input id="st-gauge" value={f.knitting_gauge || ""} onChange={(e) => setF({ ...f, knitting_gauge: e.target.value })} placeholder="mis. 7" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
