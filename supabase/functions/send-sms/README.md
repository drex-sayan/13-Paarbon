# send-sms

Supabase Auth Send SMS Hook adapter for MSG91's V5 OTP API. Supabase supplies the OTP in the hook payload; the function forwards the same OTP to MSG91, so OTP verification remains handled by Supabase Auth.

Required Edge Function secrets:
- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`

The MSG91 template must be approved for the application's SMS use case and include the OTP variable. In India, the sender/template setup should follow the applicable DLT requirements.
