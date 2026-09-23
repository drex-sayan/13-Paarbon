-- 13 Paarbon registration validation hardening
-- Apply after 202609220002_authentication_hardening.sql.

-- Fast lookup indexes. The registration RPC performs the user-facing
-- case-insensitive duplicate checks without rewriting existing records.
create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

create index if not exists profiles_phone_idx
  on public.profiles (phone)
  where phone is not null;

-- Keep login lookup available because Supabase password authentication needs
-- the underlying Auth email after the user supplies username + password.
-- The function must return only the email for the exact username + role match.
create or replace function public.resolve_login_email(p_username text, p_role public.app_role)
returns text
language sql
security definer
set search_path=public
as $$
  select email
  from public.profiles
  where lower(username)=lower(trim(p_username))
    and role=p_role
    and status <> 'disabled'
  limit 1;
$$;

grant execute on function public.resolve_login_email(text,public.app_role) to anon, authenticated;

-- Friendly duplicate validation for the authenticated onboarding session.
create or replace function public.validate_registration_identity(
  p_username text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  clean_username text := lower(trim(p_username));
  clean_phone text := regexp_replace(trim(p_phone), '[^0-9+]', '', 'g');
begin
  if exists(select 1 from public.profiles where lower(username)=clean_username) then
    return jsonb_build_object('ok',false,'field','username','message','This username already exists. Please choose another username.');
  end if;
  if exists(select 1 from public.profiles where phone=clean_phone) then
    return jsonb_build_object('ok',false,'field','phone','message','This phone number is already in use. Please use another verified phone number.');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.validate_registration_identity(text,text) to anon, authenticated;
