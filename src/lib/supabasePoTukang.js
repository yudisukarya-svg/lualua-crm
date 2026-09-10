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
