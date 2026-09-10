import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Shared preset list — editable inline via the "Other" free-text option.
export const QC_REJECT_REASONS = [
  "Dropped stitch", "Stitch fault", "Staining", "Hole", "Wrong size",
  "Wrong colour", "Uneven tension", "Yarn defect", "Other",
];

export function useQcRejects(soId) {
  const [rejects, setRejects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRejects = useCallback(async () => {
    if (!soId) { setRejects([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("qc_rejects")
      .select("*")
      .eq("sales_order_id", soId)
      .order("created_at", { ascending: false });
    setRejects(data ?? []);
    setLoading(false);
  }, [soId]);

  useEffect(() => { fetchRejects(); }, [fetchRejects]);
  return { rejects, loading, refetch: fetchRejects };
}

export async function addQcReject({ sales_order_id, style_id, reason, qty, note }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("qc_rejects").insert({
    sales_order_id, style_id: style_id || null, reason,
    qty: Number(qty), note: note || null, created_by: user?.id,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteQcReject(id) {
  const { error } = await supabase.from("qc_rejects").delete().eq("id", id);
  if (error) throw error;
}
