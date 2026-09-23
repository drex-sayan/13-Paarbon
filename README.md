# 13 Paarbon — Durga Puja Website

This project preserves the existing 13 Paarbon Home, Pujo and About experience and adds the requested role-based authentication system.

## Run

```bash
npm install
npm run dev
```

## Authentication

See:

- `AUTH_HANDOFF_PROMPT.md` — complete project specification/handoff for another AI coding agent.
- `supabase/SETUP.md` — Supabase/Auth/Google/MSG91/Resend setup instructions.
- `supabase/migrations/202609220001_authentication_system.sql` — database, RLS, RPC and Storage security foundation.
- `supabase/migrations/202609220002_authentication_hardening.sql` — authentication hardening, Google onboarding, role-ID lifecycle, secure profile updates and account-bound OTP challenges.
- `supabase/bootstrap_first_admin.sql` — one-time protected first Admin bootstrap.
- `supabase/functions/send-sms` — MSG91 adapter for Supabase Auth's Send SMS Hook.
- `supabase/functions/notify-admins` — Admin application email notification function.
- `supabase/functions/account-phone-otp` — account-bound recovery/deletion phone OTP function.
- `demo/authentication-demo.html` — visual-only authentication design demo.

## Environment

Copy `.env.example` to `.env.local` and provide the Supabase project URL and publishable key.

Do not put service-role, SMS, email-provider or OAuth secrets into `VITE_` variables.

## Existing site preservation

Home, Pujo and About are kept as the existing baseline. Authentication is scoped separately, with only permission-dependent controls added to the existing Pujo interface.


### Authentication validation migration
Run `supabase/migrations/202609220003_authentication_validation.sql` after the two existing authentication migrations.
