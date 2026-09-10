import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useProjects({ customerId } = {}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("projects")
      .select("*, customers(customer_name, country)")
      .order("created_at", { ascending: false });
    if (customerId) q = q.eq("customer_id", customerId);
    const { data } = await q;
    setProjects(data ?? []);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  return { projects, loading, refetch: fetchProjects };
}

export async function getProject(id) {
  const { data, error } = await supabase
    .from("projects")
    .select("*, customers(id, customer_name, country, contact_person)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createProject(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, payload) {
  const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}
