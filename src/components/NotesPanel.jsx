import { useState } from "react";
import { Trash2, Loader2, Paperclip } from "lucide-react";
import { useNotes, createNote, deleteNote } from "@/hooks/useNotes";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import EmptyState from "@/components/EmptyState";
import { formatDateTime, initials } from "@/lib/utils";

export default function NotesPanel({ projectId, customerId }) {
  const [search, setSearch] = useState("");
  const { notes, loading, refetch } = useNotes({ projectId, customerId, search });
  const { profile, isAdmin } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await createNote({ body: body.trim(), projectId, customerId });
      setBody("");
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not add note", description: e.message });
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await deleteNote(id); refetch(); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          rows={3}
          placeholder="Write an internal note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <Button onClick={add} disabled={busy || !body.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add note
          </Button>
        </div>
      </div>

      <Input
        placeholder="Search notes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Internal notes are visible to your whole team." />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const canDelete = isAdmin || n.created_by === profile?.id;
            return (
              <li key={n.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initials(n.author?.full_name || "?")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.author?.full_name || "Unknown"} · {formatDateTime(n.created_at)}
                    </p>
                    {n.attachment_file_id && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="h-3 w-3" /> Attachment
                      </span>
                    )}
                  </div>
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(n.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
