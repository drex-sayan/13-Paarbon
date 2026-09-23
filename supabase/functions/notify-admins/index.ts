import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response('Unauthorized', { status: 401 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('NOTIFICATION_FROM_EMAIL');
    if (!resendKey || !from) return Response.json({ ok: false, skipped: true, reason: 'Email provider is not configured.' });

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) return new Response('Unauthorized', { status: 401 });

    const { data: requester } = await adminClient.from('profiles').select('id,role,status,name,username,email,public_id').eq('id', userData.user.id).maybeSingle();
    const { data: authRecord } = await adminClient.auth.admin.getUserById(userData.user.id);
    const authUser = authRecord?.user;
    if (!requester || requester.status !== 'pending' || !['editor','admin'].includes(requester.role) || !authUser?.email_confirmed_at || !authUser?.phone_confirmed_at) {
      return new Response('Forbidden', { status: 403 });
    }

    const { data: admins } = await adminClient.from('profiles').select('email,name').eq('role','admin').eq('status','active').not('email','is',null);
    const recipients = (admins || []).map((a: {email:string}) => a.email).filter(Boolean);
    if (!recipients.length) return Response.json({ ok: true, sent: 0 });

    const applicationType = requester.role === 'admin' ? 'Admin' : 'Editor';
    const subject = `13 Paarbon — New ${applicationType} application`;
    const html = `<div style="font-family:monospace;line-height:1.7"><h2>New ${applicationType} application</h2><p><b>Name:</b> ${escapeHtml(requester.name || '')}</p><p><b>Username:</b> ${escapeHtml(requester.username || '')}</p><p><b>Email:</b> ${escapeHtml(requester.email || '')}</p><p><b>Public ID:</b> ${escapeHtml(requester.public_id || 'Pending')}</p><p>Please open the 13 Paarbon Admin Management panel to review this request.</p></div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });
    if (!response.ok) return new Response(await response.text(), { status: 502 });
    return Response.json({ ok: true, sent: recipients.length });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' } as Record<string,string>)[char]);
}
