-- 13 Paarbon authentication + authorization foundation
-- Run this migration in the project's Supabase SQL editor/migrations.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('user','editor','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('pending','active','disabled','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_id text unique,
  username text unique,
  name text not null default '',
  email text,
  phone text,
  role public.app_role not null default 'user',
  status public.account_status not null default 'pending',
  requested_role public.app_role not null default 'user',
  oauth_unassigned boolean not null default false,
  reactivation_requested_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[A-Za-z0-9._-]{3,32}$')
);

create table if not exists public.editor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status public.application_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  decision_by uuid references public.profiles(id) on delete set null,
  decision_at timestamptz,
  available_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status public.application_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  decision_by uuid references public.profiles(id) on delete set null,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_approvals (
  approved_admin_id uuid not null references public.profiles(id) on delete cascade,
  created_admin_id uuid not null unique references public.profiles(id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (approved_admin_id, created_admin_id)
);

create index if not exists profiles_role_status_idx on public.profiles(role,status);
create index if not exists editor_applications_status_idx on public.editor_applications(status,submitted_at);
create index if not exists admin_applications_status_idx on public.admin_applications(status,submitted_at);

create or replace function public.generate_role_id(p_role public.app_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text := case p_role when 'user' then 'USR' when 'editor' then 'EDT' else 'ADM' end;
  candidate text;
begin
  loop
    candidate := prefix || '-' || upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,8));
    exit when not exists(select 1 from public.profiles where public_id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.app_role := case when (new.raw_user_meta_data->>'requested_role') in ('editor','admin') then (new.raw_user_meta_data->>'requested_role')::public.app_role else 'user'::public.app_role end;
  uname text := nullif(trim(new.raw_user_meta_data->>'username'),'');
  display_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''), split_part(coalesce(new.email,''),'@',1));
  role_value public.app_role := case when requested='admin' then 'user' else requested end;
  status_value public.account_status := 'pending';
  pid text;
begin
  pid := public.generate_role_id(role_value);
  insert into public.profiles(id,public_id,username,name,email,phone,role,status,requested_role)
  values(new.id,pid,uname,display_name,new.email,new.phone,role_value,status_value,requested)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists editor_applications_touch_updated_at on public.editor_applications;
create trigger editor_applications_touch_updated_at before update on public.editor_applications for each row execute function public.touch_updated_at();
drop trigger if exists admin_applications_touch_updated_at on public.admin_applications;
create trigger admin_applications_touch_updated_at before update on public.admin_applications for each row execute function public.touch_updated_at();

create or replace function public.request_reactivation(p_username text, p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare p public.profiles;
begin
  select * into p from public.profiles where lower(username)=lower(trim(p_username)) and role=p_role limit 1;
  if p.id is null then raise exception 'No matching account was found'; end if;
  if p.status<>'disabled' then raise exception 'This account does not need reactivation'; end if;
  update public.profiles set reactivation_requested_at=now() where id=p.id;
  return jsonb_build_object('requested',true);
end;
$$;

create or replace function public.resolve_login_email(p_username text, p_role public.app_role)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.profiles
  where lower(username)=lower(trim(p_username))
    and role=p_role
    and email is not null
  limit 1;
$$;

create or replace function public.finalize_registration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  au auth.users;
  result jsonb;
begin
  select * into au from auth.users where id=auth.uid();
  if au.id is null then raise exception 'Not authenticated'; end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null then raise exception 'Profile not found'; end if;

  if au.email_confirmed_at is null then
    raise exception 'Email verification is required';
  end if;
  if au.phone_confirmed_at is null then
    raise exception 'Phone verification is required';
  end if;

  update public.profiles
    set email=au.email, phone=au.phone, status=case when requested_role='user' then 'active' else 'pending' end, oauth_unassigned=false
  where id=au.id;

  if p.requested_role='editor' then
    insert into public.editor_applications(user_id,status,submitted_at)
    values(au.id,'pending',now())
    on conflict(user_id) do update set status='pending',submitted_at=now(),decision_by=null,decision_at=null,available_after=null;
  elsif p.requested_role='admin' then
    update public.profiles set status='pending', role='admin' where id=au.id;
    insert into public.admin_applications(user_id,status,submitted_at)
    values(au.id,'pending',now())
    on conflict(user_id) do update set status='pending',submitted_at=now(),decision_by=null,decision_at=null;
  end if;

  select jsonb_build_object('public_id',public_id,'role',role,'status',status,'username',username,'name',name)
  into result from public.profiles where id=au.id;
  return result;
end;
$$;

create or replace function public.my_profile()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce((select to_jsonb(p) from public.profiles p where p.id=auth.uid()), '{}'::jsonb);
$$;

create or replace function public.begin_google_role_application(p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare p public.profiles;
begin
  if p_role not in ('editor','admin') then return jsonb_build_object('accepted',false); end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null then raise exception 'Profile not found'; end if;
  if p.role<>'user' or p.requested_role<>'user' or p.username is not null or p.status<>'pending' or not p.oauth_unassigned then
    raise exception 'This Google account is already associated with an existing account';
  end if;
  update public.profiles set role=p_role,status='pending',requested_role=p_role,oauth_unassigned=false where id=p.id;
  if p_role='editor' then
    insert into public.editor_applications(user_id,status) values(p.id,'pending') on conflict(user_id) do update set status='pending',submitted_at=now();
  else
    insert into public.admin_applications(user_id,status) values(p.id,'pending') on conflict(user_id) do update set status='pending',submitted_at=now();
  end if;
  return jsonb_build_object('accepted',true,'role',p_role);
end;
$$;

create or replace function public.editor_reapply()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare app public.editor_applications; p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null then raise exception 'Profile not found'; end if;
  select * into app from public.editor_applications where user_id=auth.uid();
  if app.id is null then
    insert into public.editor_applications(user_id,status) values(auth.uid(),'pending') returning * into app;
  elsif app.status='rejected' and coalesce(app.available_after, now()) <= now() then
    update public.editor_applications set status='pending',submitted_at=now(),decision_by=null,decision_at=null,available_after=null where id=app.id returning * into app;
  elsif app.status='rejected' then
    raise exception 'You can reapply after %', app.available_after;
  else
    raise exception 'No reapplication is available right now';
  end if;
  update public.profiles set status='pending',requested_role='editor',role='editor' where id=auth.uid();
  return jsonb_build_object('status',app.status,'available_after',app.available_after);
end;
$$;

create or replace function public.admin_list_applications()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by submitted_at desc),'[]'::jsonb)
  from (
    select ea.id,ea.user_id,ea.status,ea.submitted_at,ea.decision_at,ea.available_after,p.public_id,p.username,p.name,p.email,p.phone
    from public.editor_applications ea join public.profiles p on p.id=ea.user_id
    where exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin' and me.status='active')
      and ea.status='pending'
  ) x;
$$;

create or replace function public.admin_list_people(p_role public.app_role default null, p_status public.account_status default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb)
  from public.profiles p
  where exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin' and me.status='active')
    and (p_role is null or p.role=p_role)
    and (p_status is null or p.status=p_status);
$$;

create or replace function public.admin_decide_editor(p_application_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare app public.editor_applications; target public.profiles; me public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into app from public.editor_applications where id=p_application_id for update;
  if app.id is null or app.status<>'pending' then raise exception 'Application is not pending'; end if;
  select * into target from public.profiles where id=app.user_id for update;
  if p_approve then
    update public.profiles set role='editor',status='active',approved_by=me.id,approved_at=now(),requested_role='editor',public_id=public.generate_role_id('editor') where id=target.id;
    update public.editor_applications set status='approved',decision_by=me.id,decision_at=now() where id=app.id;
  else
    update public.profiles set status='rejected',role='editor',approved_by=me.id,approved_at=null where id=target.id;
    update public.editor_applications set status='rejected',decision_by=me.id,decision_at=now(),available_after=now()+interval '24 hours' where id=app.id;
  end if;
  return jsonb_build_object('approved',p_approve,'user_id',target.id,'public_id',(select public_id from public.profiles where id=target.id),'available_after',(select available_after from public.editor_applications where id=app.id));
end;
$$;

create or replace function public.admin_list_admin_applications()
returns jsonb
language sql
security definer
set search_path=public
as $$
  select coalesce(jsonb_agg(x order by submitted_at desc),'[]'::jsonb)
  from (select aa.id,aa.user_id,aa.status,aa.submitted_at,p.public_id,p.username,p.name,p.email,p.phone
        from public.admin_applications aa join public.profiles p on p.id=aa.user_id
        where exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin' and me.status='active') and aa.status='pending') x;
$$;

create or replace function public.admin_decide_admin(p_application_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare app public.admin_applications; target public.profiles; me public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into app from public.admin_applications where id=p_application_id for update;
  if app.id is null or app.status<>'pending' then raise exception 'Application is not pending'; end if;
  select * into target from public.profiles where id=app.user_id for update;
  if p_approve then
    update public.profiles set role='admin',status='active',approved_by=me.id,approved_at=now(),requested_role='admin',public_id=public.generate_role_id('admin') where id=target.id;
    insert into public.admin_approvals(approved_admin_id,created_admin_id) values(me.id,target.id) on conflict do nothing;
    update public.admin_applications set status='approved',decision_by=me.id,decision_at=now() where id=app.id;
  else
    update public.profiles set status='rejected',role='admin' where id=target.id;
    update public.admin_applications set status='rejected',decision_by=me.id,decision_at=now() where id=app.id;
  end if;
  return jsonb_build_object('approved',p_approve,'public_id',(select public_id from public.profiles where id=target.id));
end;
$$;

create or replace function public.admin_change_role(p_user_id uuid, p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.id=me.id then raise exception 'You cannot change your own Admin role'; end if;
  if target.role='admin' and not exists(select 1 from public.admin_approvals where approved_admin_id=me.id and created_admin_id=target.id) then raise exception 'You can only manage an Admin you approved'; end if;
  if p_role='admin' then
    update public.profiles set role='admin',status='active',requested_role='admin',approved_by=me.id,approved_at=now(),public_id=public.generate_role_id('admin') where id=target.id;
    insert into public.admin_approvals(approved_admin_id,created_admin_id) values(me.id,target.id) on conflict do nothing;
  else
    update public.profiles set role=p_role,status='active',requested_role=p_role,approved_by=case when p_role='editor' then me.id else null end,approved_at=case when p_role='editor' then now() else null end,public_id=public.generate_role_id(p_role) where id=target.id;
  end if;
  return jsonb_build_object('id',target.id,'role',p_role);
end;
$$;

create or replace function public.admin_set_account_status(p_user_id uuid, p_status public.account_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.role='admin' and target.approved_by is distinct from me.id then raise exception 'You can only manage an Admin you approved'; end if;
  if target.id=me.id then raise exception 'You cannot disable your own Admin account here'; end if;
  update public.profiles set status=p_status where id=target.id;
  return jsonb_build_object('id',target.id,'status',p_status);
end;
$$;

create or replace function public.admin_approve_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null or target.role<>'admin' or target.status<>'pending' then raise exception 'Pending Admin not found'; end if;
  update public.profiles set status='active',approved_by=me.id,approved_at=now(),public_id=public.generate_role_id('admin') where id=target.id;
  insert into public.admin_approvals(approved_admin_id,created_admin_id) values(me.id,target.id) on conflict do nothing;
  return jsonb_build_object('public_id',(select public_id from public.profiles where id=target.id));
end;
$$;

create or replace function public.admin_deactivate_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.admin_approvals where approved_admin_id=me.id and created_admin_id=p_user_id) then raise exception 'You can only manage an Admin you approved'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null or target.role<>'admin' then raise exception 'Admin not found'; end if;
  if (select count(*) from public.profiles where role='admin' and status='active') <= 1 then raise exception 'The last active Admin cannot be disabled'; end if;
  update public.profiles set status='disabled' where id=target.id;
  return jsonb_build_object('status','disabled');
end;
$$;

create or replace function public.admin_delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into target from public.profiles where id=p_user_id;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.role='admin' and not exists(select 1 from public.admin_approvals where approved_admin_id=me.id and created_admin_id=target.id) then
    raise exception 'You can only delete an Admin you approved';
  end if;
  if target.role='admin' and (select count(*) from public.profiles where role='admin' and status='active') <= 1 then
    raise exception 'The last active Admin cannot be deleted';
  end if;
  delete from auth.users where id=target.id;
end;
$$;

create or replace function public.bootstrap_first_admin(p_user_id uuid, p_username text, p_name text default '')
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare p public.profiles;
begin
  if current_user <> 'postgres' then raise exception 'Bootstrap is only available from a protected SQL/admin context'; end if;
  if exists(select 1 from public.profiles where role='admin' and status='active') then raise exception 'An active Admin already exists'; end if;
  select * into p from public.profiles where id=p_user_id for update;
  if p.id is null then raise exception 'Profile not found'; end if;
  if exists(select 1 from public.profiles where lower(username)=lower(trim(p_username)) and id<>p_user_id) then raise exception 'Username already exists'; end if;
  update public.profiles set role='admin',status='active',requested_role='admin',public_id=public.generate_role_id('admin'),username=trim(p_username),name=coalesce(nullif(trim(p_name),''),name),approved_by=null,approved_at=now() where id=p_user_id;
  return jsonb_build_object('public_id',(select public_id from public.profiles where id=p_user_id));
end;
$$;

create or replace function public.self_delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.role='admin' then
    if p.approved_by is null then raise exception 'The initial Admin must be removed through a protected Admin setup process'; end if;
    if (select count(*) from public.profiles where role='admin' and status='active') <= 1 then raise exception 'The last active Admin cannot be deleted'; end if;
  end if;
  delete from auth.users where id=auth.uid();
end;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active');
$$;


create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('postgres','service_role') and auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
    new.requested_role := old.requested_role;
    new.public_id := old.public_id;
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    new.email := old.email;
    new.phone := old.phone;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
before update on public.profiles
for each row execute function public.protect_profile_security_fields();



create or replace function public.is_editor_or_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('editor','admin') and status='active');
$$;

-- Public Pujo reads remain available. Writes are now restricted to Editor/Admin.
grant select on public.pujos, public.photos to anon, authenticated;
grant insert, update, delete on public.pujos, public.photos to authenticated;
revoke insert, update, delete on public.pujos, public.photos from anon;

alter table public.pujos enable row level security;
alter table public.photos enable row level security;
alter table public.profiles enable row level security;
alter table public.editor_applications enable row level security;
alter table public.admin_applications enable row level security;
alter table public.admin_approvals enable row level security;

revoke all on public.profiles, public.editor_applications, public.admin_applications, public.admin_approvals from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.editor_applications to authenticated;
grant select on public.admin_applications, public.admin_approvals to authenticated;


do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in ('pujos','photos','profiles','editor_applications','admin_applications','admin_approvals') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

drop policy if exists "Public can read pujos" on public.pujos;
create policy "Public can read pujos" on public.pujos for select to anon,authenticated using (true);
drop policy if exists "Editors and admins can insert pujos" on public.pujos;
create policy "Editors and admins can insert pujos" on public.pujos for insert to authenticated with check(public.is_editor_or_admin());
drop policy if exists "Editors and admins can update pujos" on public.pujos;
create policy "Editors and admins can update pujos" on public.pujos for update to authenticated using(public.is_editor_or_admin()) with check(public.is_editor_or_admin());
drop policy if exists "Editors and admins can delete pujos" on public.pujos;
create policy "Editors and admins can delete pujos" on public.pujos for delete to authenticated using(public.is_editor_or_admin());

drop policy if exists "Public can read photos" on public.photos;
create policy "Public can read photos" on public.photos for select to anon,authenticated using(true);
drop policy if exists "Editors and admins can insert photos" on public.photos;
create policy "Editors and admins can insert photos" on public.photos for insert to authenticated with check(public.is_editor_or_admin());
drop policy if exists "Editors and admins can delete photos" on public.photos;
create policy "Editors and admins can delete photos" on public.photos for delete to authenticated using(public.is_editor_or_admin());

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using(id=auth.uid() and status<>'disabled') with check(id=auth.uid());

drop policy if exists "Users can read own applications" on public.editor_applications;
create policy "Users can read own applications" on public.editor_applications for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "Users can create own application" on public.editor_applications;
create policy "Users can create own application" on public.editor_applications for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "Admins can manage editor applications" on public.editor_applications;
create policy "Admins can manage editor applications" on public.editor_applications for update to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "Admins can read admin applications" on public.admin_applications;
create policy "Admins can read admin applications" on public.admin_applications for select to authenticated using(public.is_admin());
drop policy if exists "Admins can read approvals" on public.admin_approvals;
create policy "Admins can read approvals" on public.admin_approvals for select to authenticated using(public.is_admin());

-- Storage policies for the existing pujo-images bucket.
insert into storage.buckets(id,name,public) values('pujo-images','pujo-images',true) on conflict(id) do update set public=true;
revoke insert, update, delete on storage.objects from anon;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;
drop policy if exists "Public can view pujo images" on storage.objects;
create policy "Public can view pujo images" on storage.objects for select to anon,authenticated using(bucket_id='pujo-images');
drop policy if exists "Editors and admins can upload pujo images" on storage.objects;
create policy "Editors and admins can upload pujo images" on storage.objects for insert to authenticated with check(bucket_id='pujo-images' and public.is_editor_or_admin());
drop policy if exists "Editors and admins can delete pujo images" on storage.objects;
create policy "Editors and admins can delete pujo images" on storage.objects for delete to authenticated using(bucket_id='pujo-images' and public.is_editor_or_admin());

-- Permissions for RPCs.
grant execute on function public.request_reactivation(text,public.app_role) to anon,authenticated;
grant execute on function public.resolve_login_email(text,public.app_role) to anon,authenticated;
grant execute on function public.finalize_registration() to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.begin_google_role_application(public.app_role) to authenticated;
grant execute on function public.editor_reapply() to authenticated;
grant execute on function public.admin_list_applications() to authenticated;
grant execute on function public.admin_list_admin_applications() to authenticated;
grant execute on function public.admin_list_people(public.app_role,public.account_status) to authenticated;
grant execute on function public.admin_decide_editor(uuid,boolean) to authenticated;
grant execute on function public.admin_decide_admin(uuid,boolean) to authenticated;
grant execute on function public.admin_change_role(uuid,public.app_role) to authenticated;
grant execute on function public.admin_set_account_status(uuid,public.account_status) to authenticated;
grant execute on function public.admin_approve_admin(uuid) to authenticated;
grant execute on function public.admin_deactivate_admin(uuid) to authenticated;
grant execute on function public.admin_delete_account(uuid) to authenticated;
grant execute on function public.self_delete_account() to authenticated;

do $$ begin
  alter table public.profiles add constraint profiles_email_key unique(email);
exception when duplicate_object then null; end $$;
