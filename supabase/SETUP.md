# 13 Paarbon Authentication Setup

The React project contains the authentication UI and permission-aware behavior. Supabase still needs the backend configuration below.

## 1. Apply the database migration

Run:

`supabase/migrations/202609220001_authentication_system.sql`

in the Supabase SQL editor (or through the Supabase CLI migrations workflow).

## 2. Create the first Admin

There must be one protected first Admin before Admin applications can be approved.

- Create the first Admin user from Supabase Authentication > Users.
- Copy that user's UUID.
- Use `supabase/bootstrap_first_admin.sql` to set that account to the initial active Admin.
- Do this only once.

After that, new Admins use the Admin application + approval flow in the app.

## 3. Authentication settings

In Supabase Authentication settings:

- Enable Email provider.
- Keep email confirmation enabled.
- Do not enable Phone authentication for registration.
- Phone/SMS is not required by the application.
- Configure your application Site URL and redirect URLs for `/login`.
- Enable Google provider and add the Google OAuth client ID/secret.

The frontend uses Supabase `signInWithOAuth({ provider: 'google' })`.

## 4. Google OAuth

In Google Cloud, configure the web OAuth client and add your production origin and the Supabase Auth callback URL shown in the Supabase Google provider settings.

## 5. Phone verification

Phone verification is intentionally **not part of account registration**.

Registration now uses:

```text
Manual signup → Gmail OTP → account completion
Google login → Google-authenticated email → account completion
```

For an Editor account, completion creates one pending Editor application for Admin approval. Repeated logins do not create duplicate applications.

The existing `supabase/functions/send-sms` and `supabase/functions/account-phone-otp` files are retained for compatibility with the project history, but they are not required by the registration flow. MSG91/DLT configuration is therefore not required for creating User or Editor accounts.

## 6. Admin application email

Deploy `supabase/functions/notify-admins` and configure:

- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge Functions runtime; do not put them in a `VITE_` environment variable.

The function emails active Admins when a verified Editor/Admin application is submitted or re-submitted.

## 7. Environment variables

Copy `.env.example` to `.env.local` and provide only the Supabase URL and publishable key in browser-visible variables.

Never expose:

- Supabase service-role key
- MSG91 auth key
- Resend API key
- Google OAuth client secret

## 8. Existing Pujo data

The migration keeps public read access for `pujos` and `photos`, while restricting Pujo creation/editing/photo uploads/deletion to active Editors and Admins.

The existing `pujo-images` bucket remains public for viewing; write/delete access is protected by Storage policies.

## 9. Role behavior

- User: public browsing, personal account, self-delete.
- Editor: approved editorial account; Pujo create/edit/delete, description editing, photo upload/delete.
- Admin: all Editor actions plus user/editor/admin management.
- Editor applications can be rejected and re-submitted only after 24 hours.
- An Admin can only deactivate/delete an Admin they personally approved.
- The last active Admin cannot be removed.

## 10. Email OTP — OTP ONLY

The registration UI is OTP-only. Do **not** use the confirmation-link version of the Supabase template.

1. Open **Supabase Dashboard → Authentication → Email Templates → Confirm signup**.
2. Replace the template with `supabase/email-templates/confirm-signup-otp.html` from this project.
3. Make sure the template contains exactly `{{ .Token }}` where the 6-digit code should appear.
4. Save the template.
5. Keep email confirmation enabled.
6. Register a brand-new test account and enter the 6-digit code from the email.

The frontend verifies it with `verifyOtp({ email, token, type: 'email' })`. No confirmation link is required by the application.

## 11. pgcrypto note

The role-ID generator explicitly calls `extensions.gen_random_bytes(5)` because Supabase keeps pgcrypto in the `extensions` schema. This avoids Auth user-creation failures when the Auth role search path is `auth`.

## 12. Authentication hardening migration

After the original authentication migration, also run:

`supabase/migrations/202609220002_authentication_hardening.sql`

This keeps the existing design and data model but fixes Google onboarding, role/public-ID lifecycle, secure profile editing, Admin approval relationships, and account-bound OTP challenges.

## 13. Account-bound recovery/delete OTP function

Deploy:

`supabase/functions/account-phone-otp`

Configure the same Edge Function secrets used by the SMS adapter:

- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Edge Functions runtime.

This function deliberately does **not** use `auth.signInWithOtp()` for recovery or account deletion. It verifies that the requested phone belongs to the currently authenticated/recovery account before sending an OTP, so a phone number belonging to another account cannot switch the browser session.

## 13. Remove phone verification migration

After the previous authentication migrations, also run:

`supabase/migrations/202609220004_remove_phone_verification.sql`

This removes the phone-verification requirement from registration/finalization, updates registration validation to use username only, and backfills pending Editor/Admin applications that may have been missed by the previous phone-verification flow.
