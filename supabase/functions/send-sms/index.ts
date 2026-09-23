import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('not allowed', { status: 400 });
    const secret = Deno.env.get('SEND_SMS_HOOK_SECRET')?.replace('v1,whsec_', '');
    const authKey = Deno.env.get('MSG91_AUTH_KEY');
    const templateId = Deno.env.get('MSG91_OTP_TEMPLATE_ID');
    if (!secret || !authKey || !templateId) return new Response('{}', { status: 500 });

    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(secret);
    const { user, sms } = wh.verify(payload, headers) as { user: { phone: string }; sms: { otp: string } };
    const phone = user?.phone;
    const otp = sms?.otp;
    if (!phone || !otp) return new Response(JSON.stringify({ error: { http_code: 400, message: 'Missing phone or OTP' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', templateId);
    url.searchParams.set('mobile', phone.replace(/\s+/g, ''));
    url.searchParams.set('otp', otp);

    const response = await fetch(url, { method: 'POST', headers: { authkey: authKey, accept: 'application/json' } });
    if (!response.ok) {
      const body = await response.text();
      return new Response(JSON.stringify({ error: { http_code: 502, message: body || 'MSG91 failed to send OTP' } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: { http_code: 401, message: error instanceof Error ? error.message : 'Invalid hook request' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
});
