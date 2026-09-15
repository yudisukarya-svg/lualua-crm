import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useMachineDailyNotes(startDate, endDate) {
  const [notes, setNotes] = useState({}); // `${machine_id}:${date}` -> { id, reason, created_at }
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("machine_daily_notes")
      .select("id, machine_id, date, reason, created_at, updated_at")
      .gte("date", startDate)
      .lte("date", endDate);
    if (!error) {
      const map = {};
      (data || []).forEach((n) => { map[`${n.machine_id}:${n.date}`] = n; });
      setNotes(map);
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const saveNote = async (machineId, date, reason) => {
    const { error } = await supabase
      .from("machine_daily_notes")
      .upsert({ machine_id: machineId, date, reason, updated_at: new Date().toISOString() }, { onConflict: "machine_id,date" });
    if (error) throw error;
    await load();
  };

  const deleteNote = async (machineId, date) => {
    const { error } = await supabase.from("machine_daily_notes").delete().eq("machine_id", machineId).eq("date", date);
    if (error) throw error;
    await load();
  };

  return { notes, loading, saveNote, deleteNote };
}
