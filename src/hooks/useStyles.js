import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useStyles() {
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStyles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("production_styles").select("*, customers(customer_name)").order("name");
    setStyles(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchStyles(); }, [fetchStyles]);
  return { styles, loading, refetch: fetchStyles };
}

const RATE_FIELDS = ["knitting_manual", "knitting_machine", "linking", "finishing", "steam", "label", "qc", "packing"];

export async function createStyle(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = {
    name: payload.name, notes: payload.notes || null, customer_id: payload.customer_id || null,
    knitting_method: payload.knitting_method || "manual",
    knitting_gauge: payload.knitting_method === "machine" ? (payload.knitting_gauge || null) : null,
    yarn_wastage_pct: Number(payload.yarn_wastage_pct) || 0,
    created_by: user?.id,
  };
  RATE_FIELDS.forEach((f) => { row[f] = Number(payload[f]) || 0; });
  const { data, error } = await supabase.from("production_styles").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateStyle(id, payload) {
  const row = {
    name: payload.name, notes: payload.notes || null, customer_id: payload.customer_id || null,
    knitting_method: payload.knitting_method || "manual",
    knitting_gauge: payload.knitting_method === "machine" ? (payload.knitting_gauge || null) : null,
    yarn_wastage_pct: Number(payload.yarn_wastage_pct) || 0,
  };
  RATE_FIELDS.forEach((f) => { row[f] = Number(payload[f]) || 0; });
  const { data, error } = await supabase.from("production_styles").update(row).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteStyle(id) {
  const { error } = await supabase.from("production_styles").delete().eq("id", id);
  if (error) throw error;
}
