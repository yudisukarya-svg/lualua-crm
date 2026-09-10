import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useActivities({ projectId, customerId, limit = 50 } = {}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("activities")
      .select("*, actor:users!activities_actor_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (projectId) q = q.eq("project_id", projectId);
    if (customerId) q = q.eq("customer_id", customerId);
    const { data } = await q;
    setActivities(data ?? []);
    setLoading(false);
  }, [projectId, customerId, limit]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);
  return { activities, loading, refetch: fetchActivities };
}
