import { useState, useEffect } from "react";
import { poTukangClient } from "@/lib/supabasePoTukang";

export function useDailyActuals(startDate, endDate) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    poTukangClient
      .from("po_daily_actuals")
      .select("so, tgl, aktual, mesin")
      .gte("tgl", startDate)
      .lte("tgl", endDate)
      .then(({ data, error }) => {
        if (cancelled) return;
        setRows(error ? [] : data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return { rows, loading };
}
