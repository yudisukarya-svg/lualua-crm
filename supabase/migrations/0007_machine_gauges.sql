-- =============================================================================
-- 0007_machine_gauges.sql — Automatic knitting machines by gauge + operator-driven
-- machine assignment. Additive except for swapping the single machine pool for
-- per-gauge pools (the old 'knitting_machine' resource row is replaced).
-- =============================================================================

-- Styles: knitting method (manual | machine) and gauge (for machine styles).
alter table public.production_styles
  add column if not exists knitting_method text not null default 'manual',
  add column if not exists knitting_gauge  text;

-- Resources: allow some machines to be reserved (e.g. sampling-only).
alter table public.production_resources
  add column if not exists reserved integer not null default 0 check (reserved >= 0);

-- Replace the single machine pool with per-gauge pools.
delete from public.production_resources where id = 'knitting_machine';

insert into public.production_resources (id, label, stage, count, reserved) values
  ('machine_7g',  'Knitting Machine — 7 gauge',  'knitting', 5, 1),  -- 1 reserved for sampling
  ('machine_12g', 'Knitting Machine — 12 gauge', 'knitting', 2, 0),
  ('machine_5g',  'Knitting Machine — 5 gauge',  'knitting', 2, 0)
on conflict (id) do nothing;

-- Per-line operator decision: how many machines to use for this knitting work.
-- NULL = use all available machines of the gauge (the system's suggestion).
alter table public.sales_order_lines
  add column if not exists assigned_machines integer;
