-- 13 Paarbon authentication hardening
-- Safe to run after 202609220001_authentication_system.sql.
-- This migration keeps the existing UI/data model and fixes account lifecycle,
-- Google onboarding, profile editing, and Admin approval bookkeeping.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.app_role := case
    when (new.raw_user_meta_data->>'requested_role') in ('editor','admin')
      then (new.raw_user_meta_data->>'requested_role')::public.app_role
    else 'user'::public.app_role
  end;
  uname text := nullif(trim(new.raw_user_meta_data->>'username'),'');
  display_name text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'),''),
    split_part(coalesce(new.email,''),'@',1),
    ''
  );
  is_google boolean := coalesce(new.raw_app_meta_data->>'provider','') = 'google';
  unassigned boolean := is_google and uname is null;
  role_value public.app_role := case
    when requested='admin' then 'admin'::public.app_role
    when requested='editor' then 'editor'::public.app_role
    else 'user'::public.app_role
  end;
begin
  insert into public.profiles(
    id, public_id, username, name, email, phone, role, status,
    requested_role, oauth_unassigned
  ) values (
    new.id,
    null,
    uname,
    display_name,
    new.email,
    new.phone,
    role_value,
    'pending',
    requested,
    unassigned
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = coalesce(excluded.phone, public.profiles.phone);
  return new;
end;
$$;

-- Existing Google profiles created by the earlier migration can be recovered
-- when they still have no username and are pending users.
update public.profiles p
set oauth_unassigned = true
where p.role='user'
  and p.status='pending'
  and p.username is null
  and exists (
    select 1 from auth.users u
    where u.id=p.id
      and coalesce(u.raw_app_meta_data->>'provider','')='google'
  );

create or replace function public.finalize_registration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  au auth.users;
  final_role public.app_role;
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
  if nullif(trim(coalesce(p.username,'')),'') is null then
    raise exception 'Username is required';
  end if;
  if exists(select 1 from public.profiles x where lower(x.username)=lower(trim(p.username)) and x.id<>p.id) then
    raise exception 'Username is already in use';
  end if;

  final_role := p.requested_role;
  if final_role='admin' then
    update public.profiles
      set email=au.email,
          phone=au.phone,
          role='admin',
          status='pending',
          public_id=null,
          oauth_unassigned=false
      where id=au.id;
  elsif final_role='editor' then
    update public.profiles
      set email=au.email,
          phone=au.phone,
          role='editor',
          status='pending',
          public_id=null,
          oauth_unassigned=false
      where id=au.id;
    insert into public.editor_applications(user_id,status,submitted_at)
      values(au.id,'pending',now())
      on conflict(user_id) do update set
        status='pending',submitted_at=now(),decision_by=null,decision_at=null,available_after=null;
  else
    update public.profiles
      set email=au.email,
          phone=au.phone,
          role='user',
          status='active',
          public_id=coalesce(public_id, public.generate_role_id('user')),
          oauth_unassigned=false
      where id=au.id;
  end if;

  if final_role='admin' then
    insert into public.admin_applications(user_id,status,submitted_at)
      values(au.id,'pending',now())
      on conflict(user_id) do update set
        status='pending',submitted_at=now(),decision_by=null,decision_at=null;
  end if;

  select jsonb_build_object(
    'public_id',public_id,'role',role,'status',status,
    'username',username,'name',name
  ) into result
  from public.profiles where id=au.id;
  return result;
end;
$$;

create or replace function public.begin_google_role_application(p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare p public.profiles;
begin
  if p_role not in ('user','editor','admin') then
    raise exception 'Unsupported role';
  end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null then raise exception 'Profile not found'; end if;
  if not p.oauth_unassigned or p.role<>'user' or p.status<>'pending' or p.username is null then
    raise exception 'This Google account is already associated with an existing account';
  end if;
  update public.profiles
    set role=p_role, requested_role=p_role, status='pending', public_id=null, oauth_unassigned=false
    where id=p.id;
  if p_role='editor' then
    insert into public.editor_applications(user_id,status)
      values(p.id,'pending')
      on conflict(user_id) do update set status='pending',submitted_at=now(),decision_by=null,decision_at=null,available_after=null;
  elsif p_role='admin' then
    insert into public.admin_applications(user_id,status)
      values(p.id,'pending')
      on conflict(user_id) do update set status='pending',submitted_at=now(),decision_by=null,decision_at=null;
  end if;
  return jsonb_build_object('accepted',true,'role',p_role);
end;
$$;

-- The profile update path is kept behind a function so a normal account can
-- never change its role, status, public ID, verified contact fields, or approval data.
create or replace function public.update_own_profile(p_name text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare p public.profiles; clean_username text;
begin
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null then raise exception 'Profile not found'; end if;
  if p.status='disabled' then raise exception 'This account is disabled'; end if;

  clean_username := nullif(trim(p_username),'');
  if clean_username is null or clean_username !~ '^[A-Za-z0-9._-]{3,32}$' then
    raise exception 'Username must be 3-32 characters and use only letters, numbers, dot, underscore, or hyphen';
  end if;
  if exists(select 1 from public.profiles x where lower(x.username)=lower(clean_username) and x.id<>p.id) then
    raise exception 'Username is already in use';
  end if;

  update public.profiles
    set name=coalesce(nullif(trim(p_name),''),name),
        username=clean_username
  where id=p.id;

  return (select to_jsonb(x) from public.profiles x where x.id=p.id);
end;
$$;

grant execute on function public.update_own_profile(text,text) to authenticated;

-- Do not expose private email addresses to anonymous callers. Username login still
-- needs this lookup before Supabase password authentication, so it remains callable
-- during login, but the frontend gives generic failure messages and the RPC returns
-- no information for invalid/mismatched roles.
revoke execute on function public.resolve_login_email(text,public.app_role) from anon;
grant execute on function public.resolve_login_email(text,public.app_role) to anon, authenticated;

create or replace function public.admin_decide_editor(p_application_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare app public.editor_applications; target public.profiles; me public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  select * into app from public.editor_applications where id=p_application_id for update;
  if app.id is null or app.status<>'pending' then raise exception 'Application is not pending'; end if;
  select * into target from public.profiles where id=app.user_id for update;
  if p_approve then
    update public.profiles
      set role='editor',status='active',approved_by=me.id,approved_at=now(),
          requested_role='editor',public_id=public.generate_role_id('editor')
      where id=target.id;
    update public.editor_applications set status='approved',decision_by=me.id,decision_at=now(),available_after=null where id=app.id;
  else
    update public.profiles
      set status='rejected',role='editor',approved_by=me.id,approved_at=null,public_id=null
      where id=target.id;
    update public.editor_applications
      set status='rejected',decision_by=me.id,decision_at=now(),available_after=now()+interval '24 hours'
      where id=app.id;
  end if;
  return jsonb_build_object('approved',p_approve,'user_id',target.id,'public_id',(select public_id from public.profiles where id=target.id),'available_after',(select available_after from public.editor_applications where id=app.id));
end;
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
    update public.profiles
      set role='admin',status='active',approved_by=me.id,approved_at=now(),
          requested_role='admin',public_id=public.generate_role_id('admin')
      where id=target.id;
    delete from public.admin_approvals where created_admin_id=target.id;
    insert into public.admin_approvals(approved_admin_id,created_admin_id) values(me.id,target.id);
    update public.admin_applications set status='approved',decision_by=me.id,decision_at=now() where id=app.id;
  else
    update public.profiles set status='rejected',role='admin',public_id=null,approved_by=null,approved_at=null where id=target.id;
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
  if p_role not in ('user','editor','admin') then raise exception 'Unsupported role'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.id=me.id then raise exception 'You cannot change your own Admin role'; end if;
  if target.role='admin' and not exists(select 1 from public.admin_approvals where approved_admin_id=me.id and created_admin_id=target.id) then
    raise exception 'You can only manage an Admin you approved';
  end if;
  if target.role='admin' and p_role<>'admin' then
    delete from public.admin_approvals where created_admin_id=target.id;
  end if;
  if p_role='admin' then
    update public.profiles set role='admin',status='active',requested_role='admin',approved_by=me.id,approved_at=now(),public_id=public.generate_role_id('admin') where id=target.id;
    delete from public.admin_approvals where created_admin_id=target.id;
    insert into public.admin_approvals(approved_admin_id,created_admin_id) values(me.id,target.id);
  else
    update public.profiles set role=p_role,status='active',requested_role=p_role,
      approved_by=case when p_role='editor' then me.id else null end,
      approved_at=case when p_role='editor' then now() else null end,
      public_id=public.generate_role_id(p_role)
      where id=target.id;
  end if;
  return jsonb_build_object('id',target.id,'role',p_role,'public_id',(select public_id from public.profiles where id=target.id));
end;
$$;

grant execute on function public.admin_decide_editor(uuid,boolean) to authenticated;
grant execute on function public.admin_decide_admin(uuid,boolean) to authenticated;
grant execute on function public.admin_change_role(uuid,public.app_role) to authenticated;

-- Account-bound OTP challenges for password recovery and self-delete.
-- This intentionally does not use auth.signInWithOtp(), because that can switch
-- the browser session to whichever account owns the submitted phone number.
create table if not exists public.account_phone_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('recovery','delete')),
  phone text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_phone_challenges_user_idx
  on public.account_phone_challenges(user_id,purpose,created_at desc);

alter table public.account_phone_challenges enable row level security;
revoke all on public.account_phone_challenges from anon, authenticated;

create or replace function public.cleanup_phone_challenges()
returns void
language sql
security definer
set search_path=public
as $$
  delete from public.account_phone_challenges
  where expires_at < now() or created_at < now() - interval '30 minutes';
$$;


create or replace function public.admin_set_account_status(p_user_id uuid, p_status public.account_status)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id=auth.uid() and role='admin' and status='active';
  if me.id is null then raise exception 'Admin access required'; end if;
  if p_status not in ('active','disabled') then raise exception 'Only active or disabled status can be set from Admin Management'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.id=me.id then raise exception 'You cannot change your own Admin account status here'; end if;
  if target.role='admin' and target.approved_by is distinct from me.id then raise exception 'You can only manage an Admin you approved'; end if;
  if target.role='admin' and p_status='disabled' and (select count(*) from public.profiles where role='admin' and status='active') <= 1 then raise exception 'The last active Admin cannot be disabled'; end if;
  update public.profiles set status=p_status where id=target.id;
  return jsonb_build_object('id',target.id,'status',p_status);
end;
$$;

grant execute on function public.admin_set_account_status(uuid,public.account_status) to authenticated;

-- Rejected/pending Admin applicants have not been approved by anyone yet. The
-- active Admin who is reviewing the application must still be able to cleanly
-- remove or convert those records.
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
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.id=me.id then raise exception 'You cannot delete your own Admin account here'; end if;
  if target.role='admin' and target.status='active' and target.approved_by is null then
    raise exception 'The initial Admin can only be changed through the protected setup process';
  end if;
  if target.role='admin' and target.approved_by is not null and target.approved_by is distinct from me.id then
    raise exception 'You can only delete an Admin you approved';
  end if;
  if target.role='admin' and target.status='active' and (select count(*) from public.profiles where role='admin' and status='active') <= 1 then
    raise exception 'The last active Admin cannot be deleted';
  end if;
  delete from auth.users where id=target.id;
end;
$$;

grant execute on function public.admin_delete_account(uuid) to authenticated;

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
  if p_role not in ('user','editor','admin') then raise exception 'Unsupported role'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if target.id is null then raise exception 'Account not found'; end if;
  if target.id=me.id then raise exception 'You cannot change your own Admin role'; end if;
  if target.role='admin' and target.status='active' and target.approved_by is null then
    raise exception 'The initial Admin can only be changed through the protected setup process';
  end if;
  if target.role='admin' and target.approved_by is not null and not exists(select 1 from public.admin_approvals where approved_admin_id=me.id and created_admin_id=target.id) then
    raise exception 'You can only manage an Admin you approved';
  end if;
  if target.role='admin' and p_role<>'admin' then
    delete from public.admin_approvals where created_admin_id=target.id;
  end if;
  if p_role='admin' then
    update public.profiles set role='admin',status='active',requested_role='admin',approved_by=me.id,approved_at=now(),public_id=public.generate_role_id('admin') where id=target.id;
    delete from public.admin_approvals where created_admin_id=target.id;
    insert into public.admin_approvals(approved_admin_id,created_admin_id) values(me.id,target.id);
  else
    update public.profiles set role=p_role,status='active',requested_role=p_role,
      approved_by=case when p_role='editor' then me.id else null end,
      approved_at=case when p_role='editor' then now() else null end,
      public_id=public.generate_role_id(p_role)
      where id=target.id;
  end if;
  return jsonb_build_object('id',target.id,'role',p_role,'public_id',(select public_id from public.profiles where id=target.id));
end;
$$;

grant execute on function public.admin_change_role(uuid,public.app_role) to authenticated;
