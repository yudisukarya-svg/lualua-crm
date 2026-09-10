-- =============================================================================
-- 0005_planning.sql — Production Planning module
-- Adds styles, resources, working calendar and planned orders.
-- Safe to run on the existing Lualua CRM database (no existing tables touched).
-- =============================================================================

-- ---- Resources: editable worker / machine counts per stage pool --------------
create table if not exists public.production_resources (
  id          text primary key,             -- e.g. 'knitting_manual', 'linking'
  label       text not null,
  stage       text not null,                -- knitting | linking | finishing | steam | label | qc | packing
  count       integer not null default 0 check (count >= 0),
  updated_at  timestamptz not null default now()
);

-- Seed with the factory's current resources (admin can edit later).
insert into public.production_resources (id, label, stage, count) values
  ('knitting_manual',  'Knitting — Manual (workers)',  'knitting',  8),
  ('knitting_machine', 'Knitting — Machine (machines)','knitting',  9),
  ('linking',          'Linking (workers)',            'linking',   4),
  ('finishing',        'Finishing (workers)',          'finishing', 5),
  ('steam',            'Steam (workers)',              'steam',     2),
  ('label',            'Label Sewing (workers)',       'label',     1),
  ('qc',               'Final QC (workers)',           'qc',        2),
  ('packing',          'Packing (workers)',            'packing',   2)
on conflict (id) do nothing;

-- ---- Styles: per-stage production rate (pcs per resource per day) ------------
create table if not exists public.production_styles (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  knitting_manual  numeric not null default 0,   -- pcs / operator / day
  knitting_machine numeric not null default 0,   -- pcs / machine / day
  linking          numeric not null default 0,
  finishing        numeric not null default 0,
  steam            numeric not null default 0,
  label            numeric not null default 0,
  qc               numeric not null default 0,
  packing          numeric not null default 0,
  notes            text,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---- Calendar: settings (single row) + holiday / shutdown dates --------------
create table if not exists public.planning_settings (
  id            integer primary key default 1,
  sunday_off    boolean not null default true,
  saturday_off  boolean not null default false,
  updated_at    timestamptz not null default now(),
  constraint planning_settings_single_row check (id = 1)
);
insert into public.planning_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.planning_holidays (
  id     uuid primary key default gen_random_uuid(),
  date   date not null,
  label  text,
  kind   text not null default 'holiday'   -- 'holiday' | 'shutdown'
);

-- ---- Planned orders: what we schedule ----------------------------------------
create table if not exists public.planned_orders (
  id              uuid primary key default gen_random_uuid(),
  sequence        bigserial,                -- FIFO ordering (earlier = first served)
  order_code      text,
  customer_id     uuid references public.customers(id) on delete set null,
  project_id      uuid references public.projects(id) on delete set null,
  style_id        uuid references public.production_styles(id) on delete restrict,
  quantity        integer not null check (quantity > 0),
  earliest_start  date,                     -- earliest we can begin (material ready)
  due_date        date,
  status          text not null default 'planned', -- planned | in_production | done | cancelled
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_planned_orders_sequence  on public.planned_orders (sequence);
create index if not exists idx_planned_orders_style     on public.planned_orders (style_id);
create index if not exists idx_planned_orders_customer  on public.planned_orders (customer_id);
create index if not exists idx_planned_orders_status    on public.planned_orders (status);

-- ---- updated_at triggers (reuse existing helper from 0002) -------------------
create trigger touch_production_styles  before update on public.production_styles
  for each row execute function public.touch_updated_at();
create trigger touch_planned_orders     before update on public.planned_orders
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row-Level Security — same model as the rest of the app:
-- any authenticated user can read/insert/update; only admins can delete.
-- =============================================================================
alter table public.production_resources enable row level security;
alter table public.production_styles    enable row level security;
alter table public.planning_settings    enable row level security;
alter table public.planning_holidays    enable row level security;
alter table public.planned_orders       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'production_resources','production_styles','planning_settings',
    'planning_holidays','planned_orders'
  ] loop
    execute format('create policy %I_sel on public.%I for select to authenticated using (true);', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (true);', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using (true) with check (true);', t, t);
    execute format('create policy %I_del on public.%I for delete to authenticated using (public.is_admin());', t, t);
  end loop;
end $$;
