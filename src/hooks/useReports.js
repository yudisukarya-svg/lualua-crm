import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Aggregates the data needed for the reports dashboard in one place.
export function useReports() {
  const [data, setData] = useState({
    totalCustomers: 0,
    totalProjects: 0,
    byStatus: [],          // [{ status, count }]
    progressBuckets: [],   // [{ bucket, count }]
    shipmentsByMonth: [],  // [{ month, count }]
    topCustomers: [],      // [{ name, projects }]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ count: custCount }, projectsRes, shipmentsRes, customersRes] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("projects").select("id, status, progress, customer_id, customers(customer_name)"),
        supabase.from("shipments").select("shipping_date"),
        supabase.from("customers").select("id, customer_name"),
      ]);

      const projects = projectsRes.data ?? [];
      const shipments = shipmentsRes.data ?? [];

      // Projects by status
      const statusMap = {};
      projects.forEach((p) => { statusMap[p.status] = (statusMap[p.status] || 0) + 1; });
      const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

      // Progress buckets
      const buckets = { "0–25%": 0, "26–50%": 0, "51–75%": 0, "76–99%": 0, "100%": 0 };
      projects.forEach((p) => {
        const v = p.progress ?? 0;
        if (v === 100) buckets["100%"]++;
        else if (v >= 76) buckets["76–99%"]++;
        else if (v >= 51) buckets["51–75%"]++;
        else if (v >= 26) buckets["26–50%"]++;
        else buckets["0–25%"]++;
      });
      const progressBuckets = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

      // Shipments by month (last 6 months)
      const monthMap = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
        monthMap[key] = 0;
      }
      shipments.forEach((s) => {
        if (!s.shipping_date) return;
        const d = new Date(s.shipping_date);
        const key = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
        if (key in monthMap) monthMap[key]++;
      });
      const shipmentsByMonth = Object.entries(monthMap).map(([month, count]) => ({ month, count }));

      // Top customers by project count
      const custProjects = {};
      projects.forEach((p) => {
        const name = p.customers?.customer_name || "Unknown";
        custProjects[name] = (custProjects[name] || 0) + 1;
      });
      const topCustomers = Object.entries(custProjects)
        .map(([name, projects]) => ({ name, projects }))
        .sort((a, b) => b.projects - a.projects)
        .slice(0, 5);

      setData({
        totalCustomers: custCount ?? 0,
        totalProjects: projects.length,
        byStatus,
        progressBuckets,
        shipmentsByMonth,
        topCustomers,
      });
      setLoading(false);
    })();
  }, []);

  return { ...data, loading };
}
