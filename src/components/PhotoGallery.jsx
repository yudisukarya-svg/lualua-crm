import { useState, useMemo } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { useFiles, getSignedUrl } from "@/hooks/useFiles";
import { useToast } from "@/components/ui/use-toast";
import FileUpload from "@/components/FileUpload";
import EmptyState from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "@/lib/utils";

// Lightweight thumbnail that resolves its own signed URL.
function Thumb({ file, onOpen }) {
  const [url, setUrl] = useState(null);
  useMemo(() => { getSignedUrl(file.storage_path).then(setUrl).catch(() => {}); }, [file.storage_path]);
  return (
    <button
      onClick={() => onOpen(file, url)}
      className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
    >
      {url ? (
        <img src={url} alt={file.file_name} loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      ) : (
        <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {file.uploaded_by_user?.full_name || "Unknown"} · {formatDate(file.created_at)}
      </span>
    </button>
  );
}

export default function PhotoGallery({ projectId, customerId }) {
  const { files, loading, refetch } = useFiles({ projectId, customerId, folder: "photos" });
  const { toast } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState(null);

  const photos = useMemo(() => {
    return files.filter((f) => {
      if (!(f.mime_type || "").startsWith("image/")) return true; // photos folder, keep all
      const d = new Date(f.created_at);
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [files, from, to]);

  const openPreview = async (file, url) => {
    try {
      const full = url || (await getSignedUrl(file.storage_path));
      setPreview({ file, url: full });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not open photo", description: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <FileUpload projectId={projectId} customerId={customerId} folder="photos" onUploaded={refetch} compact />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button className="pb-2 text-xs text-primary hover:underline" onClick={() => { setFrom(""); setTo(""); }}>
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading photos…</p>
      ) : photos.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No photos yet" description="Upload product, sample or QC photos to build the gallery." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => <Thumb key={p.id} file={p} onOpen={openPreview} />)}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          {preview && (
            <div className="space-y-2">
              <img src={preview.url} alt={preview.file.file_name} className="max-h-[70vh] w-full rounded-md object-contain" />
              <p className="text-sm font-medium">{preview.file.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {preview.file.uploaded_by_user?.full_name || "Unknown"} · {formatDateTime(preview.file.created_at)}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
