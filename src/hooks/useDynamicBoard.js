import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { poTukangClient } from "@/lib/supabasePoTukang";
import { completeBlock } from "@/hooks/useMachines";
import { computeBlockActuals } from "@/lib/dynamicBoard";
import { makeCalendar } from "@/lib/scheduler";
import { todayLocalStr } from "@/lib/utils";

// Tracks actual knitting delivery (from PO Tukang) against active/hold
// machine blocks, so the board can show real remaining qty, pace, and ETA
// instead of the static plan. Everything is recomputed fresh on every load —
// nothing here is cached or persisted except the final "mark done" write
// once a block's remaining qty reaches 0.
//
// soNumbers: array of distinct SO numbers currently on the board (used to
// scope the PO Tukang query so we never pull more than we need).
// blocks: raw.blocks from useSchedule (all statuses — done blocks are
// filtered out internally since they're already locked).
// stylesById: raw.styles from useSchedule (needs .name, added there).
// settings: raw.settings (for the working-day calendar).
export function useDynamicBoard({ soNumbers, blocks, stylesById, holidays, settings, onAutoCompleted }) {
  const [actualRows, setActualRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const completingRef = useRef(new Set()); // guards against double-firing completeBlock

  const load = useCallback(async () => {
    if (!soNumbers || soNumbers.length === 0) { setActualRows([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await poTukangClient
        .from("po_style_actuals")
        .select("so, tgl, mesin, style_raw, aktual")
        .in("so", soNumbers);
      if (err) throw err;
      setActualRows(data || []);
    } catch (e) {
      setError(e.message || String(e));
      setActualRows([]);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(soNumbers || [])]);

  useEffect(() => { load(); }, [load]);

  const today = todayLocalStr();
  const calendar = makeCalendar({ sundayOff: settings?.sunday_off ?? true, saturdayOff: settings?.saturday_off ?? false, holidays: holidays || [] });

  const dynamic = computeBlockActuals({ blocks: blocks || [], stylesById, actualRows, calendar, today });

  // Auto-complete: any ACTIVE (not already hold/done) block whose remaining
  // qty has hit 0 gets marked done, same as a manual click on the checkmark
  // — this just fires it automatically instead of waiting for a person.
  //
  // Before actually writing, this re-verifies against a FRESH, targeted
  // query — not the `blocks`/`actualRows` this hook was handed, which can
  // be stale if the tab has been open a while and something changed
  // elsewhere (another session split this block's sibling, added a new
  // one, etc.). A destructive write like this must be correct even if the
  // page's cached view of the world isn't.
  useEffect(() => {
    Object.entries(dynamic).forEach(([blockId, info]) => {
      const block = (blocks || []).find((b) => b.id === blockId);
      if (!block || block.status !== "active") return;
      if (info.remainingQty > 0) return;
      if (completingRef.current.has(blockId)) return;
      completingRef.current.add(blockId);
      verifyStillDone(block)
        .then((confirmed) => {
          if (!confirmed) { completingRef.current.delete(blockId); return; }
          return completeBlock(blockId).then(() => { onAutoCompleted?.(blockId); });
        })
        .catch(() => { completingRef.current.delete(blockId); });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Object.keys(dynamic))]);

  const verifyStillDone = async (block) => {
    try {
      const [siblingsRes, actualsRes] = await Promise.all([
        supabase.from("machine_blocks").select("*").eq("sales_order_id", block.sales_order_id).eq("style_id", block.style_id),
        block._soNumber ? poTukangClient.from("po_style_actuals").select("so, tgl, mesin, style_raw, aktual").eq("so", block._soNumber) : Promise.resolve({ data: [] }),
      ]);
      const freshSiblings = (siblingsRes.data || []).map((b) => ({ ...b, _soNumber: block._soNumber, _planRate: block._planRate }));
      const freshDynamic = computeBlockActuals({ blocks: freshSiblings, stylesById, actualRows: actualsRes.data || [], calendar, today: todayLocalStr() });
      const info = freshDynamic[block.id];
      return !!info && info.remainingQty <= 0;
    } catch {
      return false; // any doubt at all — don't complete it
    }
  };

  return { dynamic, loading, error, refetch: load };
}
