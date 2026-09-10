import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const count = (status) =>
  supabase.from("projects").select("*", { count: "exact", head: true }).eq("status", status);

export function useDashboard() {
  const [stats, setStats] = useState({
    customers: 0, sampling: 0, production: 0, readyShip: 0, completed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [cust, sampling, production, ready, completed] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }),
        count("sampling"),
        count("production"),
        count("ready_shipment"),
        count("completed"),
      ]);
      setStats({
        customers: cust.count ?? 0,
        sampling: sampling.count ?? 0,
        production: production.count ?? 0,
        readyShip: ready.count ?? 0,
        completed: completed.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  return { stats, loading };
}
