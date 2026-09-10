import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useYarns() {
  const [yarns, setYarns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("yarns").select("*").order("name");
    setYarns(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { yarns, loading, refetch: load };
}

export async function createYarn(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("yarns").insert({
    name: payload.name, colour: payload.colour || null, unit: payload.unit || "kg",
    notes: payload.notes || null, created_by: user?.id,
  });
  if (error) throw error;
}

export async function updateYarn(id, payload) {
  const { error } = await supabase.from("yarns").update({
    name: payload.name, colour: payload.colour || null, unit: payload.unit || "kg",
    notes: payload.notes || null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteYarn(id) {
  const { error } = await supabase.from("yarns").delete().eq("id", id);
  if (error) throw error;
}

// Bill of materials for one style.
export async function getStyleBom(styleId) {
  const { data } = await supabase
    .from("style_yarns")
    .select("*, yarns(name, colour, unit)")
    .eq("style_id", styleId);
  return data ?? [];
}

// Replace a style's BOM with the given lines [{ yarn_id, grams_per_pc }].
export async function saveStyleBom(styleId, lines = []) {
  await supabase.from("style_yarns").delete().eq("style_id", styleId);
  const rows = lines
    .filter((l) => l.yarn_id && Number(l.grams_per_pc) > 0)
    .map((l) => ({ style_id: styleId, yarn_id: l.yarn_id, grams_per_pc: Number(l.grams_per_pc) }));
  if (rows.length) {
    const { error } = await supabase.from("style_yarns").insert(rows);
    if (error) throw error;
  }
}

// All BOM rows (for the requirements page), keyed by style_id.
export async function getAllBoms() {
  const { data } = await supabase.from("style_yarns").select("*, yarns(name, colour, unit)");
  const map = {};
  (data ?? []).forEach((r) => { (map[r.style_id] = map[r.style_id] || []).push(r); });
  return map;
}
