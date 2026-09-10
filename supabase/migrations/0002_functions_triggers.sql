-- =====================================================================
-- Migration 0002: Functions & triggers
-- =====================================================================

-- Helper: current user's role (used by RLS policies) ------------------
create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

-- updated_at maintenance ----------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_po_touch on public.purchase_orders;
create trigger trg_po_touch before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_shipments_touch on public.shipments;
create trigger trg_shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

-- Auto project number  e.g. LUA-2026-0001 ----------------------------
create sequence if not exists public.project_number_seq;

create or replace function public.set_project_number()
returns trigger language plpgsql as $$
begin
  if new.project_number is null or new.project_number = '' then
    new.project_number :=
      'LUA-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.project_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_project_number on public.projects;
create trigger trg_project_number before insert on public.projects
  for each row execute function public.set_project_number();

-- New auth user -> profile row ----------------------------------------
-- First registered user becomes admin; everyone after is staff.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.users;
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when is_first then 'admin'::user_role else 'staff'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Activity logging + notification fan-out
-- ---------------------------------------------------------------------
-- Logs one activity row and notifies every user except the actor.
create or replace function public.log_activity(
  p_customer uuid, p_project uuid, p_action text, p_description text, p_link text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.activities (customer_id, project_id, actor_id, action, description)
  values (p_customer, p_project, v_actor, p_action, p_description);

  insert into public.notifications (user_id, title, body, link)
  select u.id, p_action, p_description, p_link
  from public.users u
  where u.id <> coalesce(v_actor, '00000000-0000-0000-0000-000000000000');
end $$;

-- New project ---------------------------------------------------------
create or replace function public.on_project_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(
    new.customer_id, new.id, 'New Project Created',
    'Created project ' || coalesce(new.project_number, '') || ' — ' || new.project_name,
    '/projects/' || new.id
  );
  return new;
end $$;
drop trigger if exists trg_project_insert on public.projects;
create trigger trg_project_insert after insert on public.projects
  for each row execute function public.on_project_insert();

-- Production / status change ------------------------------------------
create or replace function public.on_project_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.log_activity(
      new.customer_id, new.id, 'Production Updated',
      'Status changed to ' || replace(new.status::text, '_', ' ') ||
      ' on ' || new.project_name,
      '/projects/' || new.id
    );
  elsif new.progress is distinct from old.progress then
    perform public.log_activity(
      new.customer_id, new.id, 'Production Updated',
      'Progress set to ' || new.progress || '% on ' || new.project_name,
      '/projects/' || new.id
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_project_update on public.projects;
create trigger trg_project_update after update on public.projects
  for each row execute function public.on_project_update();

-- File upload ---------------------------------------------------------
create or replace function public.on_file_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(
    new.customer_id, new.project_id, 'File Uploaded',
    'Uploaded ' || new.file_name || ' to ' || replace(new.folder::text, '_', ' '),
    case when new.project_id is not null then '/projects/' || new.project_id else null end
  );
  return new;
end $$;
drop trigger if exists trg_file_insert on public.project_files;
create trigger trg_file_insert after insert on public.project_files
  for each row execute function public.on_file_insert();

-- New note ------------------------------------------------------------
create or replace function public.on_note_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(
    new.customer_id, new.project_id, 'New Note Added',
    'Added a note', null
  );
  return new;
end $$;
drop trigger if exists trg_note_insert on public.notes;
create trigger trg_note_insert after insert on public.notes
  for each row execute function public.on_note_insert();

-- Shipment created / updated ------------------------------------------
create or replace function public.on_shipment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(
    new.customer_id, new.project_id, 'Shipment Updated',
    'Shipment ' || coalesce(new.tracking_number, '') ||
    ' — ' || replace(new.status::text, '_', ' '),
    '/projects/' || new.project_id
  );
  return new;
end $$;
drop trigger if exists trg_shipment_insert on public.shipments;
create trigger trg_shipment_insert after insert on public.shipments
  for each row execute function public.on_shipment_change();
drop trigger if exists trg_shipment_update on public.shipments;
create trigger trg_shipment_update after update on public.shipments
  for each row when (new.status is distinct from old.status)
  execute function public.on_shipment_change();

-- When a new file version is added, demote previous versions ----------
create or replace function public.on_file_version()
returns trigger language plpgsql as $$
begin
  if new.is_current then
    update public.project_files
       set is_current = false
     where version_group = new.version_group
       and id <> new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_file_version on public.project_files;
create trigger trg_file_version after insert on public.project_files
  for each row execute function public.on_file_version();
