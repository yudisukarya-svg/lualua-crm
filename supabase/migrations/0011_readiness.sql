-- =============================================================================
-- 0011_readiness.sql — Production readiness checklist per sales order.
-- A gate (warning, not a hard block) before an order should start.
-- Shape: { "sample_approved": true, "po_received": false, ... }
-- =============================================================================

alter table public.sales_orders
  add column if not exists readiness jsonb not null default '{}'::jsonb;
