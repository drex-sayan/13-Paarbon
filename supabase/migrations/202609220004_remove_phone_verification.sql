-- 13 Paarbon: remove phone verification as a registration requirement.
-- Email verification is the only required verification for manual signup.
-- Google-authenticated accounts are already email-verified.
--
-- Existing phone columns/functions are intentionally retained for data
-- compatibility, but registration no longer requires or collects a phone
-- number. Existing phone/SMS edge functions can remain deployed but are no
-- longer part of signup, password recovery, or account deletion.

create or replace function public.validate_registration_identity(
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  clean_username text := lower(trim(p_username));
begin
  if clean_username is null or clean_username = '' then
    return jsonb_build_object('ok',false,'field','username','message','Username is required.');
  end if;

  if exists(
    select 1 from public.profiles
    where lower(username)=clean_username
  ) then
    return jsonb_build_object(
      'ok',false,
      'field','username',
      'message','This username already exists. Please choose another username.'
    );
  end if;

  return jsonb_build_object('ok',true);
end;
$$;

drop function if exists public.validate_registration_identity(text,text);
grant execute on function public.validate_registration_identity(text) to anon, authenticated;

create or replace function public.finalize_registration()
returns jsonb
language plpgsql
security definer
set search_path=public
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

  if nullif(trim(coalesce(p.username,'')),'') is null then
    raise exception 'Username is required';
  end if;

  if exists(
    select 1
    from public.profiles x
    where lower(x.username)=lower(trim(p.username))
      and x.id<>p.id
  ) then
    raise exception 'Username is already in use';
  end if;

  final_role := p.requested_role;

  if final_role='admin' then
    update public.profiles
      set email=au.email,
          role='admin',
          status='pending',
          public_id=null,
          oauth_unassigned=false
      where id=au.id;
  elsif final_role='editor' then
    update public.profiles
      set email=au.email,
          role='editor',
          status='pending',
          public_id=null,
          oauth_unassigned=false
      where id=au.id;

    insert into public.editor_applications(user_id,status,submitted_at)
      values(au.id,'pending',now())
      on conflict(user_id) do update set
        status='pending',
        submitted_at=now(),
        decision_by=null,
        decision_at=null,
        available_after=null;
  else
    update public.profiles
      set email=au.email,
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
        status='pending',
        submitted_at=now(),
        decision_by=null,
        decision_at=null;
  end if;

  select jsonb_build_object(
    'public_id',public_id,
    'role',role,
    'status',status,
    'username',username,
    'name',name
  )
  into result
  from public.profiles
  where id=au.id;

  return result;
end;
$$;

grant execute on function public.finalize_registration() to authenticated;

-- Repair Editor accounts that were created by the previous phone-verification
-- flow but never received an application because phone verification was not
-- completed.
insert into public.editor_applications(user_id,status,submitted_at)
select p.id, 'pending', now()
from public.profiles p
where p.role='editor'
  and p.requested_role='editor'
  and p.status='pending'
  and not exists (
    select 1 from public.editor_applications ea where ea.user_id=p.id
  )
on conflict(user_id) do nothing;

-- Same repair for pending Admin applications, if an account reached the
-- pre-approval state before phone verification was removed.
insert into public.admin_applications(user_id,status,submitted_at)
select p.id, 'pending', now()
from public.profiles p
where p.role='admin'
  and p.requested_role='admin'
  and p.status='pending'
  and not exists (
    select 1 from public.admin_applications aa where aa.user_id=p.id
  )
on conflict(user_id) do nothing;
