import { useState, useEffect } from "react";
import { poTukangClient } from "@/lib/supabasePoTukang";
import { matchStyleId } from "@/lib/dynamicBoard";
import { makeCalendar } from "@/lib/scheduler";

const STALE_WORKING_DAYS = 3; // flag an active block if nothing's been confirmed in this many working days

export function useAttentionItems({ raw }) {
  const [actualRows, setActualRows] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);

  const soNumbersKey = JSON.stringify([...new Set((raw?.salesOrders || []).map((so) => so.so_number))].sort());

  useEffect(() => {
    let cancelled = false;
    const soNums = JSON.parse(soNumbersKey);
    if (soNums.length === 0) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      const [actualsRes, samplesRes] = await Promise.all([
        poTukangClient.from("po_style_actuals").select("so, tgl, style_raw, aktual").in("so", soNums),
        poTukangClient.from("sm_samples")
          .select("id, so, customer, style, deadline, tgl_masuk, tgl_approval, pending, pending_reason, pending_since, archived, status")
          .or("archived.is.null,archived.eq.false"),
      ]);
      if (cancelled) return;
      setActualRows(actualsRes.data || []);
      setSamples((samplesRes.data || []).filter((s) => !["selesai", "done", "cancelled", "batal"].includes((s.status || "").toLowerCase())));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [soNumbersKey]);

  const today = new Date().toISOString().slice(0, 10);
  const calendar = makeCalendar({ sundayOff: raw?.settings?.sunday_off ?? true, saturdayOff: raw?.settings?.saturday_off ?? false, holidays: raw?.holidays || [] });
  const soById = {}; (raw?.salesOrders || []).forEach((so) => { soById[so.id] = so; });

  // Last confirmed delivery date per (so_number, style_id).
  const lastDeliveryByKey = {};
  actualRows.forEach((r) => {
    const styleId = matchStyleId(r.style_raw, raw?.styles || {});
    if (!styleId) return;
    const k = `${r.so}:${styleId}`;
    if (!lastDeliveryByKey[k] || r.tgl > lastDeliveryByKey[k]) lastDeliveryByKey[k] = r.tgl;
  });

  const staleBlocks = (raw?.blocks || [])
    .filter((b) => (b.status || "active") === "active")
    .map((b) => {
      const so = soById[b.sales_order_id];
      if (!so) return null;
      const last = lastDeliveryByKey[`${so.so_number}:${b.style_id}`];
      const sinceDate = last || (b.created_at || "").slice(0, 10);
      if (!sinceDate) return null;
      const daysSince = calendar.workingDaysBetween(sinceDate, today);
      return { block: b, so, styleId: b.style_id, lastDelivery: last || null, daysSince };
    })
    .filter((x) => x && x.daysSince >= STALE_WORKING_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince);

  const pendingSamples = samples
    .filter((s) => s.pending)
    .map((s) => ({ ...s, daysPending: s.pending_since ? calendar.workingDaysBetween(s.pending_since, today) : null }))
    .sort((a, b) => (b.daysPending || 0) - (a.daysPending || 0));

  const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const approvalNeeded = samples
    .filter((s) => !s.pending && (!s.tgl_approval || s.tgl_approval === "") && s.deadline && s.deadline <= in3)
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));

  return { loading, staleBlocks, pendingSamples, approvalNeeded };
}
