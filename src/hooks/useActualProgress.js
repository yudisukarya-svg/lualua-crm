import { useState, useEffect, useCallback } from "react";
import { poTukangClient } from "@/lib/supabasePoTukang";
import { ACTUAL_STAGES, TIPE_TO_STAGE } from "@/lib/actualStages";

const emptyStages = () => Object.fromEntries(ACTUAL_STAGES.map((s) => [s, 0]));

// Fetches confirmed (serah terima) tukang handover pieces for the given SO
// numbers, from PO Tukang, and sums them per stage.
// Returns: { bySo: { [so_number]: { knitting: 12, linking: 8, ... } }, loading }
export function useActualProgress(soNumbers) {
  const [bySo, setBySo] = useState({});
  const [loading, setLoading] = useState(true);
  const key = (soNumbers || []).slice().sort().join(",");

  const fetchAll = useCallback(async () => {
    if (!soNumbers || soNumbers.length === 0) { setBySo({}); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await poTukangClient
      .from("po_stage_actuals")
      .select("so, tipe, aktual")
      .in("so", soNumbers);

    const map = {};
    if (error) {
      console.error("Couldn't load PO Tukang actuals:", error.message);
    } else {
      (data ?? []).forEach((row) => {
        const stage = TIPE_TO_STAGE[row.tipe];
        if (!stage) return; // e.g. "Aksesories" — not part of the tracked sequence
        if (!map[row.so]) map[row.so] = emptyStages();
        map[row.so][stage] += Number(row.aktual) || 0;
      });
    }
    setBySo(map);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  return { bySo, loading, refetch: fetchAll };
}

// Sums raw stage piece-counts across several SOs (e.g. all SOs linked to one project).
export function aggregateStageSums(bySo, soNumbers) {
  const sums = emptyStages();
  (soNumbers || []).forEach((so) => {
    const s = bySo[so];
    if (!s) return;
    ACTUAL_STAGES.forEach((stage) => { sums[stage] += s[stage] || 0; });
  });
  return sums;
}

// Converts raw per-stage piece counts into % complete for a given order qty.
export function toStagePercents(stageSums, totalQty) {
  if (!totalQty) return emptyStages();
  return Object.fromEntries(
    ACTUAL_STAGES.map((s) => [s, Math.min(100, Math.round(((stageSums?.[s] || 0) / totalQty) * 100))])
  );
}

// Blended overall % across all 9 stages (mirrors the old formula's intent).
export function overallActualPercent(stageSums, totalQty) {
  if (!totalQty) return 0;
  const sum = ACTUAL_STAGES.reduce((n, s) => n + Math.min(stageSums?.[s] || 0, totalQty), 0);
  return Math.min(100, Math.round((sum / (totalQty * ACTUAL_STAGES.length)) * 100));
}
