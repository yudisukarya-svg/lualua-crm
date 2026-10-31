import { createClient } from "@supabase/supabase-js";

// Read-only connection to the older ERP project (kbruhnaeligfqbywlhlt), used
// solely to read the `po_stage_actuals` view — a restricted view that
// excludes tukang cost/pricing data (ongkos, total, grandtotal). Do not use
// this client for anything beyond that view; it should never be given
// write access or exposed to broader po_history data.
const POTUKANG_URL = "https://kbruhnaeligfqbywlhlt.supabase.co";
const POTUKANG_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticnVobmFlbGlnZnFieXdsaGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MzA2NDIsImV4cCI6MjA5NDIwNjY0Mn0.OF_cADlTidNpJZpXLzkord9_AbsYT0bhy_IKwy2Fw8c";

export const poTukangClient = createClient(POTUKANG_URL, POTUKANG_ANON_KEY, {
  auth: { persistSession: false },
});

// Supabase returns at most 1000 rows per request. PO Tukang handover data
// passed that long ago (3,300+ rows for active SOs alone), so a plain
// .select() silently dropped most of it — Planning's Actual % showed 0 for
// most orders. This fetches page by page until everything is in.
//
// makeQuery: () => a fresh query builder (from/select/filters, no range).
// orderCols: columns to sort by so pages never overlap or skip. Use ALL the
//   selected columns when the view has no unique id — rows that tie on
//   every column are identical, so which page they land on doesn't matter.
const PAGE = 1000;
export async function fetchAllRows(makeQuery, orderCols) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    let q = makeQuery();
    (orderCols || []).forEach((c) => { q = q.order(c, { ascending: true, nullsFirst: true }); });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) return { data: all, error: null };
  }
}
