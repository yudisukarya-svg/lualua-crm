import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("production_resources").select("*").order("stage");
    setResources(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchResources(); }, [fetchResources]);
  return { resources, loading, refetch: fetchResources };
}

export async function updateResourceCount(id, count) {
  const { error } = await supabase
    .from("production_resources")
    .update({ count: Number(count) || 0, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateResource(id, fields) {
  const row = { updated_at: new Date().toISOString() };
  if ("count" in fields) row.count = Number(fields.count) || 0;
  if ("reserved" in fields) row.reserved = Number(fields.reserved) || 0;
  const { error } = await supabase.from("production_resources").update(row).eq("id", id);
  if (error) throw error;
}

// Turn resource rows into the map the scheduler expects.
// Machine pools are reduced by however many are reserved (e.g. sampling-only).
export function resourcesToMap(rows) {
  const map = {};
  rows.forEach((r) => { map[r.id] = Math.max(0, (r.count || 0) - (r.reserved || 0)); });
  return map;
}
