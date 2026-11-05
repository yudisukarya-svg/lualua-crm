import { useEffect, useState } from "react";
import { FileText, FileSpreadsheet, File as FileIcon, Image as ImageIcon, Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSignedUrls, isImage, formatBytes, fmtDate } from "@/lib/archive";
import { cn } from "@/lib/utils";

// Loads signed URLs for small thumbnails only (one request for the whole grid).
export function useThumbUrls(items) {
  const [urls, setUrls] = useState({});
  const key = items.map((m) => m.thumb).filter(Boolean).join("|");
  useEffect(() => {
    let alive = true;
    const paths = key ? key.split("|") : [];
    if (!paths.length) { setUrls({}); return; }
    getSignedUrls(paths).then((u) => { if (alive) setUrls(u); }).catch(() => {});
    return () => { alive = false; };
  }, [key]);
  return urls;
}

function fileIcon(m) {
  if (/pdf/.test(m.mime || "")) return FileText;
  if (/sheet|excel|csv/.test(m.mime || "") || /\.(xlsx?|csv)$/i.test(m.name || "")) return FileSpreadsheet;
  return FileIcon;
}

export async function openMedia(m) {
  const u = await getSignedUrls([m.path]);
  if (u[m.path]) window.open(u[m.path], "_blank", "noopener");
}

// Grid of thumbnails; the medium-size image is only fetched when clicked.
export default function MediaGrid({ media = [], size = "md", className, empty = null }) {
  const thumbs = useThumbUrls(media);
  const [open, setOpen] = useState(null);
  const [full, setFull] = useState(null);

  async function show(m) {
    if (!isImage(m.mime)) { openMedia(m); return; }
    setOpen(m); setFull(null);
    const u = await getSignedUrls([m.path]);
    setFull(u[m.path] ?? null);
  }

  if (!media.length) return empty;
  const box = size === "sm" ? "h-16 w-16" : size === "lg" ? "aspect-square w-full" : "h-24 w-24";
  return (
    <>
      <div className={cn(size === "lg" ? "grid grid-cols-3 gap-2 sm:grid-cols-6" : "flex flex-wrap gap-2", className)}>
        {media.map((m) => {
          const Icon = fileIcon(m);
          return (
            <button key={m.id} type="button" onClick={() => show(m)} title={`${m.name} · ${formatBytes(m.size)}`}
              className={cn("group relative overflow-hidden rounded-md border bg-muted", box)}>
              {m.thumb && thumbs[m.thumb] ? (
                <img src={thumbs[m.thumb]} alt={m.caption || m.category || m.name} loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              ) : m.thumb ? (
                <span className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></span>
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center">
                  <Icon className="h-6 w-6 text-muted-foreground" />
                  <span className="line-clamp-2 break-all text-[10px] leading-tight text-muted-foreground">{m.name}</span>
                </span>
              )}
              {(m.category || m.caption) && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">
                  {m.caption || m.category}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="pr-6 text-base">{open?.caption || open?.name}</DialogTitle>
          <div className="flex min-h-[200px] items-center justify-center rounded-md bg-muted">
            {full ? <img src={full} alt={open?.name} className="max-h-[75vh] w-auto rounded-md" />
                  : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{fmtDate(open?.date)} · {formatBytes(open?.size)}
              {open?.orig_size ? ` (asli ${formatBytes(open.orig_size)})` : ""}</span>
            {full && <a href={full} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Download className="h-4 w-4" /> Buka / unduh</a>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
