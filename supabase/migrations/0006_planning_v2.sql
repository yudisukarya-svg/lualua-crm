-- =============================================================================
-- 0006_planning_v2.sql — Sales Orders model + priority modes
-- Additive: creates new tables and adds columns. Does not delete existing data.
-- =============================================================================

-- Styles now belong to a customer (item 3). Existing styles keep customer = null.
alter table public.production_styles
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

-- Priority mode for the scheduler: 'fifo' | 'edd' | 'priority'
alter table public.planning_settings
  add column if not exists priority_mode text not null default 'fifo';

-- ---- Sales orders (the SO number — one per customer order) -------------------
create table if not exists public.sales_orders (
  id              uuid primary key default gen_random_uuid(),
  sequence        bigserial,                        -- FIFO ordering
  so_number       text not null,
  customer_id     uuid references public.customers(id) on delete set null,
  earliest_start  date,
  due_date        date,
  priority        integer not null default 100,     -- lower = more urgent (High=10, Normal=100, Low=1000)
  status          text not null default 'planned',  -- planned | in_production | done | cancelled
  notes           text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---- Sales order lines (style + colour + size + qty) -------------------------
create table if not exists public.sales_order_lines (
  id              uuid primary key default gen_random_uuid(),
  sales_order_id  uuid not null references public.sales_orders(id) on delete cascade,
  style_id        uuid references public.production_styles(id) on delete restrict,
  colour          text,
  size            text,
  quantity        integer not null check (quantity > 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_sales_orders_sequence on public.sales_orders (sequence);
create index if not exists idx_sales_orders_customer on public.sales_orders (customer_id);
create index if not exists idx_sales_orders_status   on public.sales_orders (status);
create index if not exists idx_so_lines_order        on public.sales_order_lines (sales_order_id);
create index if not exists idx_so_lines_style        on public.sales_order_lines (style_id);

create trigger touch_sales_orders before update on public.sales_orders
  for each row execute function public.touch_updated_at();

-- ---- Row-Level Security (same model: all auth read/write, admin delete) ------
alter table public.sales_orders      enable row level security;
alter table public.sales_order_lines enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sales_orders','sales_order_lines'] loop
    execute format('create policy %I_sel on public.%I for select to authenticated using (true);', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (true);', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using (true) with check (true);', t, t);
    execute format('create policy %I_del on public.%I for delete to authenticated using (public.is_admin());', t, t);
  end loop;
end $$;
