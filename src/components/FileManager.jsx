import { useState } from "react";
import {
  File, FileText, FileImage, Download, Eye, Trash2, History, Loader2, X,
} from "lucide-react";
import { useFiles, getSignedUrl, deleteFile, getFileVersions } from "@/hooks/useFiles";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import FileUpload from "@/components/FileUpload";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FILE_FOLDERS } from "@/lib/constants";
import { humanize, formatDateTime, bytes } from "@/lib/utils";

function iconFor(mime = "") {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("text")) return FileText;
  return File;
}

export default function FileManager({ projectId, customerId, defaultFolder }) {
  const [folder, setFolder] = useState(defaultFolder || "all");
  const activeFolder = folder === "all" ? undefined : folder;
  const { files, loading, refetch } = useFiles({ projectId, customerId, folder: activeFolder });
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [preview, setPreview] = useState(null); // { url, file }
  const [versions, setVersions] = useState(null); // { group, list }
  const [working, setWorking] = useState(false);

  const open = async (file, download = false) => {
    setWorking(true);
    try {
      const url = await getSignedUrl(file.storage_path);
      if (download) {
        const a = document.createElement("a");
        a.href = url; a.download = file.file_name; a.click();
      } else if ((file.mime_type || "").startsWith("image/") || (file.mime_type || "").includes("pdf")) {
        setPreview({ url, file });
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Could not open file", description: e.message });
    } finally { setWorking(false); }
  };

  const remove = async (file) => {
    try { await deleteFile(file); refetch(); toast({ title: "File deleted" }); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  const showVersions = async (file) => {
    const list = await getFileVersions(file.version_group);
    setVersions({ group: file.version_group, list });
  };

  // Group current files by folder for display.
  const current = files.filter((f) => f.is_current);
  const grouped = current.reduce((acc, f) => {
    (acc[f.folder] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Folder" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All folders</SelectItem>
            {FILE_FOLDERS.map((f) => <SelectItem key={f} value={f}>{humanize(f)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <FileUpload
        projectId={projectId}
        customerId={customerId}
        folder={activeFolder || "design_files"}
        onUploaded={refetch}
        compact
      />

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading files…</p>
      ) : current.length === 0 ? (
        <EmptyState icon={File} title="No files yet" description="Drag and drop above to upload your first document." />
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([fld, list]) => (
            <div key={fld}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {humanize(fld)} <span className="text-muted-foreground/60">({list.length})</span>
              </h4>
              <ul className="divide-y rounded-lg border">
                {list.map((f) => {
                  const Icon = iconFor(f.mime_type);
                  return (
                    <li key={f.id} className="flex items-center gap-3 p-3">
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          v{f.version} · {bytes(f.size_bytes)} · {f.uploaded_by_user?.full_name || "Unknown"} · {formatDateTime(f.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Preview"
                          onClick={() => open(f)} disabled={working}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"
                          onClick={() => open(f, true)} disabled={working}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Version history"
                          onClick={() => showVersions(f)}>
                          <History className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete"
                            onClick={() => remove(f)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="truncate pr-8">{preview?.file?.file_name}</DialogTitle></DialogHeader>
          {preview && ((preview.file.mime_type || "").startsWith("image/") ? (
            <img src={preview.url} alt={preview.file.file_name} className="max-h-[70vh] w-full rounded-md object-contain" />
          ) : (
            <iframe title="preview" src={preview.url} className="h-[70vh] w-full rounded-md border" />
          ))}
        </DialogContent>
      </Dialog>

      {/* Version history dialog */}
      <Dialog open={!!versions} onOpenChange={(o) => !o && setVersions(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
          <ul className="divide-y">
            {versions?.list.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    v{v.version} {v.is_current && <span className="text-xs text-primary">(current)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.uploaded_by_user?.full_name || "Unknown"} · {formatDateTime(v.created_at)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => open(v, true)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
