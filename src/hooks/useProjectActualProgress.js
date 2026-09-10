import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { poTukangClient } from "@/lib/supabasePoTukang";
import { ACTUAL_STAGES, TIPE_TO_STAGE } from "@/lib/actualStages";

const emptyStages = () => Object.fromEntries(ACTUAL_STAGES.map((s) => [s, 0]));

// For a list of projects, finds their linked sales orders, pulls confirmed
// tukang-handover actuals for those SOs, and returns each project's % done
// per stage, plus one blended overall %, relative to the project's total qty.
// Returns: {
//   byProject: { [project_id]: { knitting: 40, linking: 0, ... } },
//   overallByProject: { [project_id]: 27 },
// }
export function useProjectActualProgress(projects) {
  const [byProject, setByProject] = useState({});
  const [overallByProject, setOverallByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const projectIds = (projects || []).map((p) => p.id).sort().join(",");

  const fetchAll = useCallback(async () => {
    if (!projects || projects.length === 0) { setByProject({}); setOverallByProject({}); setLoading(false); return; }
    setLoading(true);

    const ids = projects.map((p) => p.id);
    const { data: sos } = await supabase.from("sales_orders").select("so_number, project_id").in("project_id", ids);
    const soToProject = {};
    (sos ?? []).forEach((s) => { if (s.project_id) soToProject[s.so_number] = s.project_id; });
    const soNumbers = Object.keys(soToProject);

    const sums = {}; // project_id -> stage sums
    if (soNumbers.length > 0) {
      const { data: rows, error } = await poTukangClient
        .from("po_stage_actuals")
        .select("so, tipe, aktual")
        .in("so", soNumbers);
      if (error) console.error("Couldn't load PO Tukang actuals:", error.message);
      (rows ?? []).forEach((row) => {
        const stage = TIPE_TO_STAGE[row.tipe];
        const projectId = soToProject[row.so];
        if (!stage || !projectId) return;
        if (!sums[projectId]) sums[projectId] = emptyStages();
        sums[projectId][stage] += Number(row.aktual) || 0;
      });
    }

    const percents = {};
    const overall = {};
    projects.forEach((p) => {
      const qty = p.quantity || 0;
      const s = sums[p.id];
      percents[p.id] = qty && s
        ? Object.fromEntries(ACTUAL_STAGES.map((stage) => [stage, Math.min(100, Math.round((s[stage] / qty) * 100))]))
        : emptyStages();
      overall[p.id] = qty && s
        ? Math.min(100, Math.round((ACTUAL_STAGES.reduce((n, stage) => n + Math.min(s[stage] || 0, qty), 0) / (qty * ACTUAL_STAGES.length)) * 100))
        : 0;
    });
    setByProject(percents);
    setOverallByProject(overall);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  return { byProject, overallByProject, loading, refetch: fetchAll };
}
