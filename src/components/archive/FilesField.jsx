import { useRef, useState, useCallback } from "react";
import { UploadCloud, X, CheckCircle2, AlertTriangle, Loader2, Copy } from "lucide-react";
import { uploadArchiveFile, formatBytes } from "@/lib/archive";
import { cn } from "@/lib/utils";

// Picks files and later uploads them one by one, showing before/after size per file.
export function useBatchUpload() {
  const [items, setItems] = useState([]); // { file, status, before, after, error, step }

  const add = useCallback((list) => {
    const arr = Array.from(list || []);
    setItems((prev) => [...prev, ...arr.map((file) => ({ file, status: "waiting", before: file.size }))]);
  }, []);
  const remove = (i) => setItems((prev) => prev.filter((_, j) => j !== i));
  const reset = () => setItems([]);

  // metaFor(file, index) → meta for uploadArchiveFile
  const run = useCallback(async (metaFor) => {
    const out = { uploaded: 0, duplicate: 0, failed: 0, before: 0, after: 0 };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.status === "done" || it.status === "duplicate") continue;
      const setOne = (patch) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      setOne({ status: "busy" });
      try {
        const r = await uploadArchiveFile(it.file, metaFor(it.file, i), (step) => setOne({ step }));
        if (r.status === "duplicate") { out.duplicate++; setOne({ status: "duplicate" }); }
        else { out.uploaded++; out.before += r.before; out.after += r.after; setOne({ status: "done", after: r.after }); }
      } catch (e) {
        out.failed++; setOne({ status: "error", error: e.message });
      }
    }
    return out;
  }, [items]);

  return { items, add, remove, reset, run };
}

export default function FilesField({ uploader, accept = "image/*,.heic,.heif,application/pdf,.xlsx,.xls,.csv,.doc,.docx", hint, compact }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const { items, add, remove } = uploader;
  const busy = items.some((x) => x.status === "busy");

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={cn("flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-4" : "py-7", drag ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:bg-muted")}>
        <UploadCloud className="h-6 w-6 text-primary" />
        <span className="text-sm font-medium">Pilih atau seret file ke sini</span>
        <span className="text-xs text-muted-foreground">{hint || "Foto, screenshot, PDF, Excel · otomatis diperkecil tapi tetap terbaca"}</span>
      </button>
      <input ref={ref} type="file" multiple accept={accept} className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {items.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatBytes(it.before)}{it.status === "done" ? ` → ${formatBytes(it.after)}` : ""}
              </span>
              {it.status === "busy" && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{it.step}</span>}
              {it.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-700" aria-label="Tersimpan" />}
              {it.status === "duplicate" && <span className="flex items-center gap-1 text-xs text-amber-800"><Copy className="h-3.5 w-3.5" />Kembar, dilewati</span>}
              {it.status === "error" && <span className="flex items-center gap-1 text-xs text-destructive" title={it.error}><AlertTriangle className="h-3.5 w-3.5" />{it.error}</span>}
              {it.status === "waiting" && !busy && (
                <button type="button" onClick={() => remove(i)} aria-label={`Hapus ${it.file.name}`} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function summaryText(r) {
  const parts = [];
  if (r.uploaded) parts.push(`${r.uploaded} file disimpan (${formatBytes(r.before)} → ${formatBytes(r.after)})`);
  if (r.duplicate) parts.push(`${r.duplicate} kembar dilewati`);
  if (r.failed) parts.push(`${r.failed} gagal`);
  return parts.join(" · ") || "Tidak ada file baru";
}
