import { useState, useEffect } from "react";
import { poTukangClient } from "@/lib/supabasePoTukang";

// Real shipment history from the Dispatch and Return app — read-only, same
// project as PO Tukang. dispatch_activity_log is an event log (not a clean
// records table; dispatch_records/dispatch_returns are effectively unused),
// so we filter to the two action types that represent pieces physically
// leaving the workshop and pull the SO/qty out of the JSONB `detail` field.
// "kirim_ulang" (re-send, e.g. after a return) is additional pieces sent,
// not a correction of a prior "kirim" — both are summed.
export function useDispatchLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await poTukangClient
        .from("dispatch_activity_log")
        .select("action_type, detail, created_at")
        .in("action_type", ["kirim", "kirim_ulang"]);
      if (!cancelled) {
        setRows(error ? [] : (data || []));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rows, loading };
}
