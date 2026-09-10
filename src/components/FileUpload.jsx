import { useState, useRef, useCallback } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { uploadFile } from "@/hooks/useFiles";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function FileUpload({ projectId, customerId, folder = "design_files", versionGroup, onUploaded, compact = false }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const { toast } = useToast();

  const handleFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      setBusy(true);
      try {
        for (const f of files) {
          await uploadFile(f, { projectId, customerId, folder, versionGroup });
        }
        toast({ title: "Upload complete", description: `${files.length} file(s) added.` });
        onUploaded?.();
      } catch (e) {
        toast({ variant: "destructive", title: "Upload failed", description: e.message });
      } finally {
        setBusy(false);
      }
    },
    [projectId, customerId, folder, versionGroup, onUploaded, toast]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "gap-1 p-4" : "gap-2 p-8",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <UploadCloud className={cn("text-muted-foreground", compact ? "h-5 w-5" : "h-7 w-7")} />
      )}
      <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
        {busy ? "Uploading…" : "Drop files here or click to upload"}
      </p>
      {!compact && <p className="text-xs text-muted-foreground">Stored securely in Supabase Storage</p>}
    </div>
  );
}
