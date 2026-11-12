import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteArchiveRecord } from "@/lib/archive";

// Trash button + confirmation. table: "style_entries" | "customer_notes" | "customer_pos"
export default function DeleteButton({ table, id, what = "entri ini", detail, fileCount = 0, onDeleted, label = "Hapus", size = "sm", iconOnly = false }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const r = await deleteArchiveRecord(table, id);
      toast({ title: "Terhapus", description: r.files ? `${r.files} foto/file ikut dihapus.` : undefined });
      setOpen(false);
      onDeleted?.();
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menghapus", description: e.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <Button size={size} variant="ghost" aria-label={`Hapus ${what}`} title={`Hapus ${what}`}
        className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />{!iconOnly && ` ${label}`}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus {what}?</DialogTitle>
            <DialogDescription>
              {detail && <span className="mb-1 block font-medium text-foreground">{detail}</span>}
              {fileCount > 0 ? `${fileCount} foto/file di dalamnya ikut dihapus permanen. ` : ""}Tindakan ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Batal</Button>
            <Button variant="destructive" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
