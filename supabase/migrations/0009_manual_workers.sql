-- =============================================================================
-- 0009_manual_workers.sql — operator-driven worker assignment for manual knitting.
-- Additive: one new column.
-- =============================================================================

-- How many manual knitting workers to use for this line's style (NULL = use all
-- available). Mirrors assigned_machines for the automatic-machine styles.
alter table public.sales_order_lines
  add column if not exists assigned_workers integer;
