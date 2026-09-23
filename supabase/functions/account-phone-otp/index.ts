import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const encoder = new TextEncoder();

function normalizePhone(value: string) {
  return value.replace(/[\s()-]/g, '');
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateOtp() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authKey = Deno.env.get('MSG91_AUTH_KEY');
    const templateId = Deno.env.get('MSG91_OTP_TEMPLATE_ID');
    if (!supabaseUrl || !serviceKey || !authKey || !templateId) {
      return json({ error: 'Phone OTP service is not configured.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required.' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Authentication required.' }, 401);

    const body = await req.json();
    const action = body?.action;
    const submittedPhone = normalizePhone(String(body?.phone || ''));
    const user = userData.user;
    const authPhone = normalizePhone(String(user.phone || ''));

    if (!submittedPhone || !/^\+[1-9]\d{7,14}$/.test(submittedPhone)) {
      return json({ error: 'Enter a valid phone number in international format.' }, 400);
    }

    const purpose = action === 'send_recovery' || action === 'verify_recovery'
      ? 'recovery'
      : action === 'send_delete' || action === 'verify_delete'
        ? 'delete'
        : null;
    if (!purpose) return json({ error: 'Unsupported OTP action.' }, 400);

    if (authPhone !== submittedPhone) {
      return json({ error: 'The phone number does not match the verified phone on this account.' }, 400);
    }

    if (action.startsWith('send_')) {
      await admin.rpc('cleanup_phone_challenges');
      const otp = generateOtp();
      const otpHash = await sha256(`${user.id}:${purpose}:${otp}`);

      await admin.from('account_phone_challenges')
        .delete()
        .eq('user_id', user.id)
        .eq('purpose', purpose);

      const { error: insertError } = await admin.from('account_phone_challenges').insert({
        user_id: user.id,
        purpose,
        phone: submittedPhone,
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (insertError) return json({ error: 'Could not create the OTP challenge.' }, 500);

      const url = new URL('https://control.msg91.com/api/v5/otp');
      url.searchParams.set('template_id', templateId);
      url.searchParams.set('mobile', submittedPhone);
      url.searchParams.set('otp', otp);
      const response = await fetch(url, {
        method: 'POST',
        headers: { authkey: authKey, accept: 'application/json' },
      });
      if (!response.ok) {
        await admin.from('account_phone_challenges').delete().eq('user_id', user.id).eq('purpose', purpose);
        const bodyText = await response.text();
        return json({ error: bodyText || 'SMS provider failed to send OTP.' }, 502);
      }
      return json({ ok: true });
    }

    const tokenValue = String(body?.token || '').trim();
    if (!/^\d{6}$/.test(tokenValue)) return json({ error: 'Enter the 6-digit OTP.' }, 400);

    const { data: challenge, error: challengeError } = await admin.from('account_phone_challenges')
      .select('id,otp_hash,expires_at,attempts,verified_at,phone')
      .eq('user_id', user.id)
      .eq('purpose', purpose)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError || !challenge) return json({ error: 'No active OTP challenge was found.' }, 400);
    if (challenge.verified_at) return json({ ok: true, verified: true });
    if (new Date(challenge.expires_at).getTime() < Date.now()) return json({ error: 'OTP expired. Request a new OTP.' }, 400);
    if (challenge.attempts >= 5) return json({ error: 'Too many incorrect attempts. Request a new OTP.' }, 429);

    const expected = await sha256(`${user.id}:${purpose}:${tokenValue}`);
    if (expected !== challenge.otp_hash) {
      await admin.from('account_phone_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id);
      return json({ error: 'Invalid OTP.' }, 400);
    }

    await admin.from('account_phone_challenges').update({ verified_at: new Date().toISOString() }).eq('id', challenge.id);
    return json({ ok: true, verified: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected OTP service error.' }, 500);
  }
});
