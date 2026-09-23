# Account Phone OTP

This Edge Function handles the account-bound phone OTP used by:

- password recovery after the Supabase recovery link has established a recovery session
- self-service account deletion

It intentionally does not call `supabase.auth.signInWithOtp()`. That method is a sign-in flow and can switch the browser session to a different account that owns the submitted phone number. This function instead:

1. validates the current Supabase access token
2. verifies the submitted phone exactly matches the current Auth user's verified phone
3. generates a short-lived OTP server-side
4. stores only a SHA-256 hash of the OTP
5. sends the OTP through MSG91
6. verifies the OTP against the same authenticated user and purpose

## Secrets

- `SUPABASE_URL` — supplied by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — supplied by Supabase
- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`

The function does not use browser-visible `VITE_` secrets.
