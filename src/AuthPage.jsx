import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import {
  ROLES, roleLabel, getCurrentProfile, requestReactivation, signInWithUsername, signInWithGoogle, beginGoogleRoleApplication,
  signUpWithEmail, resendEmailVerification, verifyEmailOtp, finalizeRegistration, requestEditorReapply,
  sendPasswordReset, updatePassword, updateOwnProfile, signOut, selfDeleteAccount,
  adminListEditorApplications, adminListAdminApplications, adminListPeople,
  adminDecideEditor, adminDecideAdmin, adminSetStatus, adminChangeRole, adminDeactivateAdmin, adminDeleteAccount,
} from './auth';

const BACKGROUND = '/images/auth-bg.jpg';
const TEXTURE = '/images/auth-texture.jpg';

function AuthNav({ loggedIn }) {
  return <nav className="auth-nav"><a href="/">HOME</a><a href="/pujo">PUJO</a><a href="/blog">BLOG</a><a href="/about">ABOUT</a>{loggedIn ? <a href="#" onClick={e => { e.preventDefault(); signOut(); }}>LOGOUT</a> : <a href="/login">LOGIN</a>}</nav>;
}

function AuthButton({ children, ...props }) {
  return <button className="auth-outline-button" {...props}>{children}</button>;
}

function Field({ label, ...props }) {
  return <label className="auth-field"><span>{label}</span><input {...props} /></label>;
}

function showAuthPopup(message, type='error') {
  if (typeof window !== 'undefined' && message) {
    window.dispatchEvent(new CustomEvent('13paarbon-auth-popup', { detail: { message: String(message), type } }));
  }
}

function Message({ type='error', children }) {
  useEffect(() => {
    if (children) showAuthPopup(children, type);
  }, [children, type]);
  return null;
}

function AuthPopup() {
  const [popup, setPopup] = useState(null);
  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      setPopup({ message: detail.message || 'Something went wrong.', type: detail.type || 'error' });
    };
    window.addEventListener('13paarbon-auth-popup', handler);
    return () => window.removeEventListener('13paarbon-auth-popup', handler);
  }, []);
  if (!popup) return null;
  return <div className="auth-popup-backdrop" role="alertdialog" aria-live="assertive">
    <div className={`auth-popup-shell auth-popup-${popup.type}`}>
      <div className="auth-popup-mark">{popup.type === 'success' ? '✓' : '!'}</div>
      <div className="auth-popup-copy">{popup.message}</div>
      <button type="button" className="auth-outline-button auth-popup-close" onClick={() => setPopup(null)}>OK</button>
    </div>
  </div>;
}

function RoleCard({ role, hiddenish, onLogin, onRegister }) {
  const title = role === ROLES.ADMIN ? 'ADMIN LOGIN' : role === ROLES.EDITOR ? 'Editor LOGIN' : 'USER LOGIN';
  return <article className={`auth-role-card ${hiddenish ? 'auth-role-card-admin' : ''}`}>
    <div className="auth-role-title">{title}</div>
    <div className="auth-role-actions">
      <AuthButton onClick={onLogin}>Sign in</AuthButton>
      <div className="auth-or">/</div>
      <AuthButton onClick={onRegister}>Create a<br/>Account</AuthButton>
    </div>
  </article>;
}

function LoginForm({ role, onClose, onForgot, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = role === ROLES.ADMIN ? 'Admin Sign-in' : role === ROLES.EDITOR ? 'Editor Sign-in' : 'User Sign-in';

  const submit = async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await signInWithUsername({ username, password, role }); onSuccess(); }
    catch (err) { setError(err?.message || 'Sign in failed.'); }
    finally { setBusy(false); }
  };

  return <div className="auth-modal-shell">
    <button className="auth-close" onClick={onClose}>×</button>
    <div className="auth-modal-title">{title}</div>
    <form className="auth-form" onSubmit={submit}>
      <Field label={`Enter your ${role === ROLES.ADMIN ? 'Admin' : role === ROLES.EDITOR ? 'Editor' : 'User'} ID / Username`} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required />
      <Field label="Enter Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required />
      <AuthButton type="submit" disabled={busy}>{busy ? 'Signing In…' : 'Sign In'}</AuthButton>
      <button type="button" className="auth-link-button" onClick={onForgot}>Forgot Password?</button>
      <div className="auth-or-text">OR</div>
      <AuthButton type="button" onClick={async()=>{setError('');try{await signInWithGoogle(role)}catch(e){setError(e?.message||'Google sign in failed.')}}}>SIGN-IN WITH GOOGLE</AuthButton>
      <Message>{error}</Message>
      {error.toLowerCase().includes('disabled') && <button type="button" className="auth-link-button" onClick={async()=>{try{await requestReactivation(username,role);setError('');showAuthPopup('Reactivation request sent to Admin.','success')}catch(e){setError(e?.message||'Could not request reactivation.')}}}>REQUEST REACTIVATION</button>}
    </form>
  </div>;
}

function RegistrationForm({ role, onClose, onSuccess }) {
  const [form,setForm]=useState({name:'',email:'',username:'',password:'',confirm:''});
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [sent,setSent]=useState(false); const [emailOtp,setEmailOtp]=useState(''); const [emailVerified,setEmailVerified]=useState(false);
  const set=(key)=>(e)=>setForm(v=>({...v,[key]:e.target.value}));
  const submit=async e=>{
    e.preventDefault(); setError('');
    if(form.password.length<8){setError('Password must be at least 8 characters.');return;}
    if(form.password!==form.confirm){setError('Passwords do not match.');return;}
    setBusy(true);
    try { await signUpWithEmail({...form,role}); setSent(true); }
    catch(err){setError(err?.message||'Could not create account.');}
    finally{setBusy(false)}
  };
  const roleText=roleLabel(role);
  const verifyEmail=async()=>{setError('');setBusy(true);try{await verifyEmailOtp(form.email,emailOtp);setEmailVerified(true)}catch(e){setError(e?.message||'Invalid email OTP.')}finally{setBusy(false)}};
  return <div className="auth-modal-shell auth-register-shell">
    <button className="auth-close" onClick={onClose}>×</button>
    <div className="auth-modal-title">{roleText} Create Account</div>
    {sent && !emailVerified ? <div className="auth-success-stage">
      <h3>VERIFY YOUR GMAIL</h3><p>We sent a verification code to <strong>{form.email}</strong>.</p><Field label="Enter OTP" inputMode="numeric" value={emailOtp} onChange={e=>setEmailOtp(e.target.value)}/><AuthButton onClick={verifyEmail} disabled={busy}>{busy?'VERIFYING…':'VERIFY'}</AuthButton><div className="auth-inline-buttons"><button className="auth-link-button" onClick={async()=>{try{await resendEmailVerification(form.email);setError('Email OTP resent.')}catch(e){setError(e?.message||'Could not resend email.')}}}>RESEND OTP</button></div><p className="auth-small-copy">Enter the 6-digit OTP sent to your Gmail.</p><Message>{error}</Message>
    </div> : sent && emailVerified ? <EmailVerifiedCompletion role={role} onComplete={onSuccess}/> : <form className="auth-form" onSubmit={submit}>
      <Field label="Enter Your Name" value={form.name} onChange={set('name')} required />
      <Field label="Enter your Gmail ID" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
      <Field label={`Enter a ${roleText} Username`} value={form.username} onChange={set('username')} autoComplete="username" required />
      <Field label="Create Password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
      <Field label="Confirm Password" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
      <AuthButton type="submit" disabled={busy}>{busy?'Creating Account…':'Create Account'}</AuthButton>
      <div className="auth-or-text">OR</div>
      <AuthButton type="button" onClick={async()=>{setError('');try{await signInWithGoogle(role)}catch(e){setError(e?.message||'Google sign in failed.')}}}>LOGIN WITH GOOGLE</AuthButton>
      <Message>{error}</Message>
    </form>}
  </div>;
}

function ForgotPassword({ role, onClose }) {
  const [username,setUsername]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const submit=async e=>{e.preventDefault();setBusy(true);setMessage('');setError('');try{await sendPasswordReset(username,role);setMessage('Password reset instructions have been sent to the verified email address on this account.');}catch(err){setError(err?.message||'Could not start password recovery.')}finally{setBusy(false)}};
  return <div className="auth-modal-shell"><button className="auth-close" onClick={onClose}>×</button><div className="auth-modal-title">Forgot Password</div><form className="auth-form" onSubmit={submit}><Field label={`${roleLabel(role)} Username`} value={username} onChange={e=>setUsername(e.target.value)} required/><p className="auth-small-copy">Recovery uses the verified email address on this account.</p><AuthButton disabled={busy}>{busy?'Sending…':'SEND RESET EMAIL'}</AuthButton><Message type="success">{message}</Message><Message>{error}</Message></form></div>;
}

function EmailVerifiedCompletion({ role, onComplete }) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const complete=async()=>{
    setBusy(true); setError('');
    try {
      await finalizeRegistration();
      onComplete();
    } catch (e) {
      setError(e?.message || 'Could not complete account registration.');
    } finally { setBusy(false); }
  };
  useEffect(()=>{ complete(); },[]);
  return <div className="auth-verification-stage">
    <div className="auth-modal-title">EMAIL VERIFIED</div>
    <p>{role === ROLES.EDITOR ? 'Your email is verified. Your Editor application is being submitted to the Admin team.' : role === ROLES.ADMIN ? 'Your email is verified. Your Admin application is being submitted for approval.' : 'Your email is verified. Your account is being activated.'}</p>
    {busy && <p className="auth-small-copy">Please wait…</p>}
    <Message>{error}</Message>
    {error && <AuthButton type="button" onClick={complete} disabled={busy}>{busy?'TRYING…':'CONTINUE'}</AuthButton>}
  </div>;
}

function AccountPanel({ profile, onRefresh }) {
  const [editing,setEditing]=useState(false); const [name,setName]=useState(profile?.name||''); const [username,setUsername]=useState(profile?.username||''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  useEffect(()=>{
    setName(profile?.name||'');
    setUsername(profile?.username||'');
  },[profile?.name,profile?.username]);
  const [newPassword,setNewPassword]=useState(''); const [confirmPassword,setConfirmPassword]=useState(''); const [deleting,setDeleting]=useState(false); const [deletePassword,setDeletePassword]=useState('');
  const save=async()=>{setBusy(true);setError('');try{await updateOwnProfile({name,username});setEditing(false);await onRefresh();setMessage('Profile updated.')}catch(e){setError(e?.message||'Could not update profile.')}finally{setBusy(false)}};
  const password=async()=>{if(newPassword.length<8||newPassword!==confirmPassword){setError('Passwords must match and be at least 8 characters.');return}setBusy(true);try{await updatePassword(newPassword);setNewPassword('');setConfirmPassword('');setMessage('Password updated.')}catch(e){setError(e?.message||'Could not update password.')}finally{setBusy(false)}};
  const deleteMe=async()=>{if(!window.confirm('Delete your account? This cannot be undone.'))return;if(!deletePassword){setError('Enter your current password before deleting the account.');return}setDeleting(true);try{const {data:sessionData}=await supabase.auth.getSession();if(!sessionData.session)throw new Error('Your session has expired. Please sign in again.');const {data:userData}=await supabase.auth.getUser();if(!userData.user||userData.user.id!==profile.id)throw new Error('Your account session could not be verified.');const {data:reauthData,error:reauthError}=await supabase.auth.signInWithPassword({email:profile.email,password:deletePassword});if(reauthError)throw reauthError;if(reauthData?.user?.id!==profile.id)throw new Error('The password did not authenticate this account.');await selfDeleteAccount();window.location.href='/login';}catch(e){setError(e?.message||'Could not delete account.')}finally{setDeleting(false)}};
  const [reapplying,setReapplying]=useState(false);
  const reapply=async()=>{setReapplying(true);setError('');try{await requestEditorReapply();await onRefresh();setMessage('Editor application submitted again.')}catch(e){setError(e?.message||'You cannot reapply yet.')}finally{setReapplying(false)}};
  return <div className="account-panel"><div className="account-header"><span>ACCOUNT</span><button className="auth-close-inline" onClick={signOut}>SIGN OUT</button></div><div className="account-grid"><div><span>NAME</span>{editing?<input value={name} onChange={e=>setName(e.target.value)}/>:<strong>{profile.name||'—'}</strong>}</div><div><span>USERNAME</span>{editing?<input value={username} onChange={e=>setUsername(e.target.value)}/>:<strong>{profile.username||'—'}</strong>}</div><div><span>ROLE</span><strong>{roleLabel(profile.role)}</strong></div><div><span>ID</span><strong>{profile.public_id||'Pending approval'}</strong></div><div><span>EMAIL</span><strong>{profile.email||'—'}</strong></div><div><span>PHONE</span><strong>{profile.phone||'Not verified'}</strong></div><div><span>STATUS</span><strong>{profile.status}</strong></div></div>{profile.role===ROLES.EDITOR&&profile.status==='rejected'&&<div className="account-actions"><AuthButton onClick={reapply} disabled={reapplying}>{reapplying?'CHECKING…':'RE-APPLY FOR EDITOR'}</AuthButton></div>}<div className="account-actions">{editing?<><AuthButton onClick={save} disabled={busy}>SAVE</AuthButton><AuthButton onClick={()=>setEditing(false)}>CANCEL</AuthButton></>:<AuthButton onClick={()=>setEditing(true)}>EDIT PROFILE</AuthButton>}</div><div className="account-password"><div className="account-section-title">CHANGE PASSWORD</div><Field label="New Password" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><Field label="Confirm Password" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/><AuthButton onClick={password} disabled={busy}>CHANGE PASSWORD</AuthButton></div><div className="account-danger"><div className="account-section-title">DELETE ACCOUNT — PASSWORD REQUIRED</div><Field label="Current Password" type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)}/><AuthButton onClick={deleteMe} disabled={deleting}>{deleting?'Deleting…':'DELETE MY ACCOUNT'}</AuthButton></div><Message type="success">{message}</Message><Message>{error}</Message></div>;
}

function AdminDashboard({ profile }) {
  const [tab,setTab]=useState('editor'); const [editors,setEditors]=useState([]); const [activeEditors,setActiveEditors]=useState([]); const [admins,setAdmins]=useState([]); const [users,setUsers]=useState([]); const [adminApps,setAdminApps]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const refresh=async()=>{setLoading(true);setError('');try{const [e,a,u,aa,ae]=await Promise.all([adminListEditorApplications(),adminListPeople(ROLES.ADMIN,null),adminListPeople(ROLES.USER,null),adminListAdminApplications(),adminListPeople(ROLES.EDITOR,'active')]);setEditors(e);setAdmins(a);setUsers(u);setAdminApps(aa);setActiveEditors(ae)}catch(err){setError(err?.message||'Could not load Admin data.')}finally{setLoading(false)}};
  useEffect(()=>{refresh()},[]);
  const decideEditor=async(id,approve)=>{try{await adminDecideEditor(id,approve);await refresh()}catch(e){setError(e?.message||'Could not decide application.')}};
  const decideAdmin=async(id,approve)=>{try{await adminDecideAdmin(id,approve);await refresh()}catch(e){setError(e?.message||'Could not decide Admin application.')}};
  const changeRole=async(p,role)=>{try{await adminChangeRole(p.id,role);await refresh()}catch(e){setError(e?.message||'Could not change role.')}};
  const disable=async(p)=>{try{if(p.role==='admin')await adminDeactivateAdmin(p.id);else await adminSetStatus(p.id,'disabled');await refresh()}catch(e){setError(e?.message||'Could not disable account.')}};
  const removeAdmin=async(p)=>{try{await adminDeleteAccount(p.id);await refresh()}catch(e){setError(e?.message||'Could not delete Admin.')}};
  const reactivate=async(p)=>{try{await adminSetStatus(p.id,'active');await refresh()}catch(e){setError(e?.message||'Could not reactivate account.')}};
  return <div className="admin-dashboard"><div className="admin-dashboard-title">ADMIN MANAGEMENT</div><div className="admin-tabs"><button className={tab==='editor'?'active':''} onClick={()=>setTab('editor')}>EDITOR REQUESTS</button><button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>ADMIN REQUESTS</button><button className={tab==='users'?'active':''} onClick={()=>setTab('users')}>USERS</button><button className={tab==='editors'?'active':''} onClick={()=>setTab('editors')}>EDITORS</button><button className={tab==='admins'?'active':''} onClick={()=>setTab('admins')}>ADMINS</button></div>{loading?<p className="admin-empty">Loading…</p>:<div className="admin-list">
    {tab==='editor' && (editors.length?editors.map(a=><div className="admin-row" key={a.id}><div><strong>{a.name}</strong><span>{a.username} · {a.email} · {a.phone||'No phone'}</span></div><div className="admin-row-actions"><button onClick={()=>decideEditor(a.id,true)}>APPROVE</button><button onClick={()=>decideEditor(a.id,false)}>REJECT</button></div></div>):<p className="admin-empty">No pending Editor applications.</p>)}
    {tab==='admin' && (adminApps.length?adminApps.map(a=><div className="admin-row" key={a.id}><div><strong>{a.name}</strong><span>{a.username} · {a.email} · {a.phone||'No phone'}</span></div><div className="admin-row-actions"><button onClick={()=>decideAdmin(a.id,true)}>APPROVE</button><button onClick={()=>decideAdmin(a.id,false)}>REJECT</button></div></div>):<p className="admin-empty">No pending Admin applications.</p>)}
    {tab==='users' && (users.length?users.map(p=><div className="admin-row" key={p.id}><div><strong>{p.name} <small>{p.public_id}</small></strong><span>{p.username} · {p.email} · {p.status}</span></div><div className="admin-row-actions">{p.status==='disabled'?<button onClick={()=>reactivate(p)}>REACTIVATE</button>:p.id!==profile.id&&<button onClick={()=>disable(p)}>DISABLE</button>}{p.id!==profile.id&&<><button onClick={()=>removeAdmin(p)}>DELETE</button>{p.role==='user'&&<button onClick={()=>changeRole(p,ROLES.EDITOR)}>MAKE EDITOR</button>}{p.role!=='admin'&&<button onClick={()=>changeRole(p,ROLES.ADMIN)}>MAKE ADMIN</button>}</>}</div></div>):<p className="admin-empty">No users.</p>)}
    {tab==='editors' && (activeEditors.length?activeEditors.map(a=><div className="admin-row" key={a.id}><div><strong>{a.name} <small>{a.public_id}</small></strong><span>{a.username} · {a.email} · {a.status}</span></div><div className="admin-row-actions">{a.status==='disabled'?<button onClick={()=>reactivate(a)}>REACTIVATE</button>:<button onClick={()=>disable(a)}>DISABLE</button>}<button onClick={()=>removeAdmin(a)}>DELETE</button><button onClick={()=>changeRole(a,ROLES.USER)}>MAKE USER</button><button onClick={()=>changeRole(a,ROLES.ADMIN)}>MAKE ADMIN</button></div></div>):<p className="admin-empty">No active Editors.</p>)}
    {tab==='admins' && (admins.length?admins.map(p=><div className="admin-row" key={p.id}><div><strong>{p.name} <small>{p.public_id}</small></strong><span>{p.username} · {p.email} · {p.status}</span></div><div className="admin-row-actions">{p.id!==profile.id&&p.approved_by===profile.id&&p.status==='active'&&<><button onClick={()=>disable(p)}>DISABLE</button><button onClick={()=>removeAdmin(p)}>DELETE</button><button onClick={()=>changeRole(p,ROLES.EDITOR)}>MAKE EDITOR</button><button onClick={()=>changeRole(p,ROLES.USER)}>MAKE USER</button></>}{p.id!==profile.id&&p.approved_by===profile.id&&p.status==='disabled'&&<button onClick={()=>reactivate(p)}>REACTIVATE</button>}{p.id!==profile.id&&!p.approved_by&&p.status!=='active'&&<><button onClick={()=>removeAdmin(p)}>DELETE</button><button onClick={()=>changeRole(p,ROLES.USER)}>MAKE USER</button></>}</div></div>):<p className="admin-empty">No Admin accounts.</p>)}
  </div>}<Message>{error}</Message></div>;
}


function GoogleOnboarding({ profile, intendedRole, onComplete }) {
  const [name,setName]=useState(profile?.name||'');
  const [username,setUsername]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const submit=async e=>{
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!username.trim()) throw new Error('Username is required.');
      await updateOwnProfile({name,username});
      await onComplete({intendedRole});
    } catch (err) { setError(err?.message || 'Could not continue with Google account setup.'); }
    finally { setBusy(false); }
  };
  return <div className="auth-modal-backdrop">
    <div className="auth-modal-shell auth-register-shell">
      <div className="auth-modal-title">Complete {roleLabel(intendedRole)} Account</div>
      <form className="auth-form" onSubmit={submit}>
        <p className="auth-small-copy">Your Google account is already verified. Add the account details required by 13 Paarbon before activation or approval.</p>
        <Field label="Enter Your Name" value={name} onChange={e=>setName(e.target.value)} required />
        <Field label={`Enter a ${roleLabel(intendedRole)} Username`} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required />
        <AuthButton type="submit" disabled={busy}>{busy?'CONTINUING…':'CONTINUE'}</AuthButton>
        <Message>{error}</Message>
      </form>
    </div>
  </div>;
}

function VerificationGate({ profile, onRefresh }) {
  if (profile.status==='pending' && profile.role==='editor') return <div className="auth-verification-stage"><div className="auth-modal-title">Editor Request Pending</div><p>Your email is verified and your Editor application has been sent to the Admin team.</p><p className="auth-small-copy">You will receive your permanent Editor ID after approval.</p><AuthButton onClick={signOut}>SIGN OUT</AuthButton></div>;
  if (profile.status==='pending' && profile.role==='admin') return <div className="auth-verification-stage"><div className="auth-modal-title">Admin Request Pending</div><p>Your email is verified and your Admin application is waiting for approval by an existing Admin.</p><p className="auth-small-copy">This account cannot use Admin privileges until it is approved.</p><AuthButton onClick={signOut}>SIGN OUT</AuthButton></div>;
  return null;
}

export default function AuthPage() {
  const [profile,setProfile]=useState(null); const [session,setSession]=useState(null); const [modal,setModal]=useState(null); const [forgotRole,setForgotRole]=useState(null); const [googleRole,setGoogleRole]=useState(null); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const refresh=async()=>{try{const {data}=await supabase.auth.getSession();setSession(data.session);if(data.session){setProfile(await getCurrentProfile())}else setProfile(null)}catch(e){setError(e?.message||'Could not load account.')}};
  useEffect(()=>{
    refresh();
    const {data}=supabase.auth.onAuthStateChange(async(event)=>{
      if(event==='SIGNED_OUT') sessionStorage.removeItem('13paarbon_oauth_role');
      setTimeout(refresh,0);
    });
    return()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    const intended=sessionStorage.getItem('13paarbon_oauth_role');
    if(!session || !profile || !intended) return;
    sessionStorage.removeItem('13paarbon_oauth_role');
    const isUnassignedGoogle=profile.oauth_unassigned && profile.role===ROLES.USER && profile.status==='pending' && !profile.username;
    if(isUnassignedGoogle){
      setGoogleRole(intended);
      return;
    }
    if(profile.role!==intended){
      supabase.auth.signOut().then(()=>setError(`This Google account is registered as a ${roleLabel(profile.role)}, not a ${roleLabel(intended)}.`));
    }
  },[session,profile]);
  const resetParam=new URLSearchParams(window.location.search).get('reset');
  const [resetPassword,setResetPassword]=useState(''); const [resetConfirm,setResetConfirm]=useState('');
  const doReset=async()=>{if(resetPassword.length<8||resetPassword!==resetConfirm){setError('Passwords must match and be at least 8 characters.');return}try{await updatePassword(resetPassword);setNotice('Password updated successfully.');history.replaceState({},'', '/login');}catch(e){setError(e?.message||'Could not update password.')}};
  const completeGoogleOnboarding=async({intendedRole})=>{
    if(intendedRole!==ROLES.USER){
      await beginGoogleRoleApplication(intendedRole);
    } else {
      await finalizeRegistration();
    }
    setGoogleRole(null); await refresh();
  };
  const loggedIn = !!session && !!profile;
  const needsVerification = loggedIn && profile.status==='pending' && profile.role!=='admin' || loggedIn && profile.status==='pending' && profile.role==='admin';
  return <main className="auth-page" style={{'--auth-bg':`url(${BACKGROUND})`,'--auth-texture':`url(${TEXTURE})`}}>
    <div className="auth-background"/><div className="auth-background-depth"/><AuthNav loggedIn={loggedIn}/><AuthPopup/>
    {!loggedIn ? <section className="auth-role-stage"><RoleCard role={ROLES.ADMIN} hiddenish onLogin={()=>setModal({type:'login',role:ROLES.ADMIN})} onRegister={()=>setModal({type:'register',role:ROLES.ADMIN})}/><RoleCard role={ROLES.USER} onLogin={()=>setModal({type:'login',role:ROLES.USER})} onRegister={()=>setModal({type:'register',role:ROLES.USER})}/><RoleCard role={ROLES.EDITOR} onLogin={()=>setModal({type:'login',role:ROLES.EDITOR})} onRegister={()=>setModal({type:'register',role:ROLES.EDITOR})}/></section> : <section className="auth-account-stage">
      <AccountPanel profile={profile} onRefresh={refresh}/>
      {needsVerification && <VerificationGate profile={profile} onRefresh={refresh}/>}
      {!needsVerification && profile.role===ROLES.ADMIN && <AdminDashboard profile={profile}/>}
      <div className="auth-logged-actions"><AuthButton onClick={()=>window.location.href='/pujo'}>GO TO PUJO</AuthButton><AuthButton onClick={signOut}>SIGN OUT</AuthButton></div>
    </section>}
    {googleRole && !googleRole.startsWith('verify:') && profile && <GoogleOnboarding profile={profile} intendedRole={googleRole} onComplete={completeGoogleOnboarding}/>}
    {modal?.type==='login'&&<div className="auth-modal-backdrop"><LoginForm role={modal.role} onClose={()=>setModal(null)} onForgot={()=>{setForgotRole(modal.role);setModal(null)}} onSuccess={()=>{setModal(null);refresh()}}/></div>}
    {modal?.type==='register'&&<div className="auth-modal-backdrop"><RegistrationForm role={modal.role} onClose={()=>setModal(null)} onSuccess={()=>{setModal(null);refresh()}}/></div>}
    {forgotRole&&<div className="auth-modal-backdrop"><ForgotPassword role={forgotRole} onClose={()=>setForgotRole(null)}/></div>}
    {resetParam&&session&&<div className="auth-modal-backdrop"><div className="auth-modal-shell"><button className="auth-close" onClick={()=>history.replaceState({},'', '/login')}>×</button><div className="auth-modal-title">Reset Password</div><div className="auth-form"><p className="auth-small-copy">Your verified email link is being used to reset the password.</p><Field label="New Password" type="password" value={resetPassword} onChange={e=>setResetPassword(e.target.value)}/><Field label="Confirm Password" type="password" value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)}/><AuthButton onClick={doReset}>SAVE PASSWORD</AuthButton><Message type="success">{notice}</Message><Message>{error}</Message></div></div></div>}
    {error&&!modal&&!forgotRole&&!resetParam&&!loggedIn&&<div className="auth-global-message"><Message>{error}</Message></div>}
  </main>;
}
