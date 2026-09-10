import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function usePlanningCalendar() {
  const [settings, setSettings] = useState({ sunday_off: true, saturday_off: false });
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: h }] = await Promise.all([
      supabase.from("planning_settings").select("*").eq("id", 1).single(),
      supabase.from("planning_holidays").select("*").order("date"),
    ]);
    if (s) setSettings(s);
    setHolidays(h ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  return { settings, holidays, loading, refetch: fetchAll };
}

export async function updateSettings(payload) {
  const { error } = await supabase
    .from("planning_settings")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

export async function addHoliday({ date, label, kind = "holiday" }) {
  const { error } = await supabase.from("planning_holidays").insert({ date, label: label || null, kind });
  if (error) throw error;
}

export async function deleteHoliday(id) {
  const { error } = await supabase.from("planning_holidays").delete().eq("id", id);
  if (error) throw error;
}
