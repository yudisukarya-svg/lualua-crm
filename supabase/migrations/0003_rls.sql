-- =====================================================================
-- Migration 0003: Row Level Security
-- =====================================================================
-- Model: 5 internal users, all authenticated.
--  * Any authenticated user can READ everything and CREATE/UPDATE most rows.
--  * Only admins can DELETE customers and projects (and related child rows).
--  * No anonymous access at all.
-- =====================================================================

alter table public.users            enable row level security;
alter table public.customers        enable row level security;
alter table public.projects         enable row level security;
alter table public.project_specs    enable row level security;
alter table public.project_files    enable row level security;
alter table public.purchase_orders  enable row level security;
alter table public.shipments        enable row level security;
alter table public.notes            enable row level security;
alter table public.activities       enable row level security;
alter table public.notifications    enable row level security;

-- USERS ---------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated using (true);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Helper macro pattern for "all authenticated can read/write, admin can delete"
-- CUSTOMERS -----------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using (true);

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated with check (true);

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated using (true) with check (true);

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated using (public.is_admin());

-- PROJECTS ------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (true);

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated with check (true);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated using (true) with check (true);

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated using (public.is_admin());

-- Generic "read+write, admin delete" for child tables -----------------
do $$
declare t text;
begin
  foreach t in array array[
    'project_specs','project_files','purchase_orders','shipments','notes'
  ] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (true);', t);

    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (true);', t);

    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (true) with check (true);', t);

    -- notes can be deleted by their author or an admin; everything else admin-only
    if t = 'notes' then
      execute 'drop policy if exists notes_delete on public.notes;';
      execute 'create policy notes_delete on public.notes for delete to authenticated using (created_by = auth.uid() or public.is_admin());';
    else
      execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
      execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_admin());', t);
    end if;
  end loop;
end $$;

-- ACTIVITIES (read-only to clients; written via security-definer fn) ---
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated using (true);

-- NOTIFICATIONS (each user sees & updates only their own) -------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());
