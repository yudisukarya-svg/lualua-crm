import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useNotes({ projectId, customerId, search } = {}) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("notes")
      .select("*, author:users!notes_created_by_fkey(full_name)")
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    if (customerId) q = q.eq("customer_id", customerId);
    if (search) q = q.ilike("body", `%${search}%`);
    const { data } = await q;
    setNotes(data ?? []);
    setLoading(false);
  }, [projectId, customerId, search]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  return { notes, loading, refetch: fetchNotes };
}

export async function createNote({ body, projectId, customerId, attachmentFileId }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("notes").insert({
    body, project_id: projectId ?? null, customer_id: customerId ?? null,
    attachment_file_id: attachmentFileId ?? null, created_by: user?.id,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}
