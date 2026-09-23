# notify-admins

Sends an application email to active Admins using Resend.

Required Supabase Edge Function secrets:
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase-managed secret; never expose to the browser)
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

The frontend invokes this only after the applicant has authenticated and completed the required verification steps. Email delivery failure does not block the application itself.
