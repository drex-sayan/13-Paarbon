-- ONE-TIME FIRST ADMIN BOOTSTRAP
-- 1) Create the first Admin user through Supabase Authentication > Users > Add user.
-- 2) Give that account a verified email. Phone verification can be completed after login.
-- 3) Replace the UUID below and run this file once in the Supabase SQL editor.
-- 4) After the first Admin exists, all future Admin applications are handled from the Admin Management panel.

-- Replace the UUID below and uncomment/run:
-- select public.bootstrap_first_admin('00000000-0000-0000-0000-000000000000', 'admin_username', 'Admin Name');

-- Verify:
-- select id, public_id, username, name, email, role, status from public.profiles where role='admin';
