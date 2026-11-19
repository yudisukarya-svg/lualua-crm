import { useState, useEffect, useMemo } from "react";
import { DISPATCH_ACTIONS, buildDispatchLedger } from "@/lib/dispatchLedger";
import { poTukangClient, fetchAllRows } from "@/lib/supabasePoTukang";

// Real shipment history from the Dispatch and Return app — read-only, same
// project as PO Tukang. dispatch_activity_log is an event log (not a clean
// records table; dispatch_records/dispatch_returns are effectively unused),
// so we fetch the shipment-related action types and replay them in
// buildDispatchLedger (deletes, edits, returns and re-sends included).
export function useDispatchLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await fetchAllRows(() => poTukangClient
        .from("dispatch_activity_log")
        .select("action_type, detail, created_at")
        .in("action_type", DISPATCH_ACTIONS), ["id"]);
      if (!cancelled) {
        setRows(error ? [] : (data || []));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Clean per-SO numbers (deletes/edits applied, SO read out of free text,
  // re-sends kept apart from first-time shipments) — see lib/dispatchLedger.
  const ledger = useMemo(() => buildDispatchLedger(rows), [rows]);

  return { rows, ledger, loading };
}
