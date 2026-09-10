-- =============================================================================
-- 0010_yarn_bom.sql — Yarn master + bill of materials per style + wastage %.
-- Lets the app compute how much yarn each sales order needs. Stock is checked
-- manually (in YarnTrack); this only calculates requirements.
-- =============================================================================

create table if not exists public.yarns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  colour text,
  unit text not null default 'kg',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.style_yarns (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.production_styles(id) on delete cascade,
  yarn_id  uuid not null references public.yarns(id) on delete cascade,
  grams_per_pc numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (style_id, yarn_id)
);

create index if not exists idx_style_yarns_style on public.style_yarns (style_id);

-- Yarn wastage allowance (%) applied to a style's requirement (e.g. 7 = +7%).
alter table public.production_styles
  add column if not exists yarn_wastage_pct numeric not null default 0;

-- RLS: any signed-in staff can read/write; only admins can delete (same as the rest).
do $$
declare t text;
begin
  foreach t in array array['yarns','style_yarns'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I_sel on public.%I for select to authenticated using (true);', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (true);', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using (true) with check (true);', t, t);
    execute format('create policy %I_del on public.%I for delete to authenticated using (public.is_admin());', t, t);
  end loop;
end $$;
