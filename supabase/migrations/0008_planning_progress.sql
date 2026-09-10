-- =============================================================================
-- 0008_planning_progress.sql — link Sales Orders to Projects + actual progress.
-- Additive only: two new columns, nothing removed.
-- =============================================================================

-- Optional link from a sales order to an existing CRM project.
alter table public.sales_orders
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- Actual pieces completed at each stage, entered by the team.
-- Shape: { "knitting": 200, "linking": 150, ... }  (separate from the forecast)
alter table public.sales_orders
  add column if not exists actual_progress jsonb not null default '{}'::jsonb;

create index if not exists idx_sales_orders_project on public.sales_orders (project_id);
