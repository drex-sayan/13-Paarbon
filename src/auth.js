import { supabase } from './supabaseClient';


function friendlyAuthError(error) {
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('user already registered') || lower.includes('already registered') || lower.includes('email address is already registered')) {
    return 'This Gmail address is already in use. Please sign in or use another Gmail address.';
  }
  if (lower.includes('duplicate key') && lower.includes('username')) {
    return 'This username already exists. Please choose another username.';
  }
  if (lower.includes('username is already in use')) {
    return 'This username already exists. Please choose another username.';
  }
  if (lower.includes('phone') && (lower.includes('already') || lower.includes('duplicate'))) {
    return 'This phone number is already in use. Please use another verified phone number.';
  }
  if (lower.includes('invalid login credentials')) return 'The username or password is incorrect.';
  if (lower.includes('email not confirmed')) return 'Please verify your Gmail with the OTP before signing in.';
  if (lower.includes('rate limit') || lower.includes('too many requests')) return 'Too many attempts. Please wait a little and try again.';
  if (lower.includes('password should be at least')) return 'Password must meet the minimum length requirement.';
  if (lower.includes('email') && lower.includes('invalid')) return 'Please enter a valid Gmail address.';
  return raw || 'Something went wrong. Please try again.';
}

export const ROLES = {
  USER: 'user',
  EDITOR: 'editor',
  ADMIN: 'admin',
};

export function roleLabel(role) {
  return role === ROLES.ADMIN ? 'Admin' : role === ROLES.EDITOR ? 'Editor' : 'User';
}

export async function getCurrentProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const { data, error } = await supabase.rpc('my_profile');
  if (error) throw error;
  return data && data.id ? data : null;
}

export async function requestReactivation(username, role) {
  const { data, error } = await supabase.rpc('request_reactivation', { p_username: username.trim(), p_role: role });
  if (error) throw error;
  return data;
}

export async function resolveLoginEmail(username, role) {
  const { data, error } = await supabase.rpc('resolve_login_email', {
    p_username: username.trim(),
    p_role: role,
  });
  if (error) throw error;
  return data || null;
}

export async function signInWithUsername({ username, password, role }) {
  const email = await resolveLoginEmail(username, role);
  if (!email) throw new Error(`This is not a valid ${roleLabel(role)} account.`);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error));

  const profile = await getCurrentProfile();
  if (!profile || profile.role !== role) {
    await supabase.auth.signOut();
    throw new Error(`This account is not registered as a ${roleLabel(role)} account.`);
  }
  if (profile.status === 'disabled') {
    await supabase.auth.signOut();
    throw new Error('This account has been disabled. Please contact an Admin.');
  }
  if (profile.status === 'pending' || profile.status === 'rejected') {
    return { user: data.user, profile };
  }
  return { user: data.user, profile };
}

export async function signInWithGoogle(role) {
  if (!Object.values(ROLES).includes(role)) {
    throw new Error('Invalid account role for Google sign-in.');
  }

  sessionStorage.setItem('13paarbon_oauth_role', role);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/login`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) {
    sessionStorage.removeItem('13paarbon_oauth_role');
    throw new Error(friendlyAuthError(error));
  }
}


export async function beginGoogleRoleApplication(role) {
  const { data, error } = await supabase.rpc('begin_google_role_application', { p_role: role });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail({ name, email, username, password, role }) {
  const { data: validation, error: validationError } = await supabase.rpc('validate_registration_identity', {
    p_username: username.trim(),
  });
  if (validationError) throw new Error(friendlyAuthError(validationError));
  if (validation && validation.ok === false) throw new Error(validation.message);
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin + '/login',
      data: {
        name: name.trim(),
        username: username.trim(),
        requested_role: role,
      },
    },
  });
  if (error) throw new Error(friendlyAuthError(error));
  return data;
}

export async function verifyEmailOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw error;
  return data;
}

export async function resendEmailVerification(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: window.location.origin + '/login' } });
  if (error) throw error;
}

export async function finalizeRegistration() {
  const { data, error } = await supabase.rpc('finalize_registration');
  if (error) throw error;
  try { await supabase.functions.invoke('notify-admins'); } catch (_) {}
  return data;
}

export async function requestEditorReapply() {
  const { data, error } = await supabase.rpc('editor_reapply');
  if (error) throw error;
  try { await supabase.functions.invoke('notify-admins'); } catch (_) {}
  return data;
}

export async function sendPasswordReset(username, role) {
  const email = await resolveLoginEmail(username, role);
  if (!email) throw new Error(`No ${roleLabel(role)} account was found for that username.`);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login?reset=1',
  });
  if (error) throw error;
}


export async function updateOwnProfile({ name, username }) {
  const { data, error } = await supabase.rpc('update_own_profile', {
    p_name: name,
    p_username: username,
  });
  if (error) throw error;
  return data;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function selfDeleteAccount() {
  const { error } = await supabase.rpc('self_delete_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

export async function adminListEditorApplications() {
  const { data, error } = await supabase.rpc('admin_list_applications');
  if (error) throw error;
  return data || [];
}

export async function adminListAdminApplications() {
  const { data, error } = await supabase.rpc('admin_list_admin_applications');
  if (error) throw error;
  return data || [];
}

export async function adminListPeople(role = null, status = null) {
  const { data, error } = await supabase.rpc('admin_list_people', { p_role: role, p_status: status });
  if (error) throw error;
  return data || [];
}

export async function adminDecideEditor(id, approve) {
  const { data, error } = await supabase.rpc('admin_decide_editor', { p_application_id: id, p_approve: approve });
  if (error) throw error;
  return data;
}

export async function adminDecideAdmin(id, approve) {
  const { data, error } = await supabase.rpc('admin_decide_admin', { p_application_id: id, p_approve: approve });
  if (error) throw error;
  return data;
}

export async function adminChangeRole(id, role) {
  const { data, error } = await supabase.rpc('admin_change_role', { p_user_id: id, p_role: role });
  if (error) throw error;
  return data;
}

export async function adminSetStatus(id, status) {
  const { data, error } = await supabase.rpc('admin_set_account_status', { p_user_id: id, p_status: status });
  if (error) throw error;
  return data;
}

export async function adminDeleteAccount(id) {
  const { error } = await supabase.rpc('admin_delete_account', { p_user_id: id });
  if (error) throw error;
}

export async function adminDeactivateAdmin(id) {
  const { data, error } = await supabase.rpc('admin_deactivate_admin', { p_user_id: id });
  if (error) throw error;
  return data;
}
