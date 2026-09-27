const fs = require('fs');

let content = fs.readFileSync('src/AuthPage.jsx', 'utf8');

const targetRoleCard = `function RoleCard({ role, hiddenish, onLogin }) {
  const title = role === ROLES.ADMIN ? 'ADMIN LOGIN' : role === ROLES.EDITOR ? 'EDITOR LOGIN' : 'USER LOGIN';
  const subtitle = role === ROLES.ADMIN ? 'Sign in to access the admin dashboard.' : 'Sign in to manage and review content.';
  
  return (
    <article className={\`auth-user-login-card animate-reveal \${hiddenish ? 'auth-role-card-admin' : ''}\`} style={{ margin: '15px auto', width: 'min(400px, 94vw)', padding: '30px 20px' }}>
      <div className="auth-user-card-inner">
        <div className="auth-dhak-icon" style={{ marginBottom: '15px' }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
             {role === ROLES.ADMIN ? (
               <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
             ) : (
               <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
             )}
          </svg>
        </div>
        <h1 className="auth-user-title" style={{ fontSize: '20px' }}>{title}</h1>
        <p className="auth-user-subtitle" style={{ marginBottom: '25px', fontSize: '13px' }}>{subtitle}</p>
        
        <button className="auth-google-main-btn" onClick={onLogin} style={{ background: 'rgba(255, 215, 0, 0.15)', borderColor: 'rgba(255, 215, 0, 0.3)' }}>
          Sign In
        </button>
      </div>
    </article>
  );
}`;

const replacementRoleCard = `function RoleCard({ role, hiddenish, onGoogleSignIn }) {
  const title = role === ROLES.ADMIN ? 'ADMIN LOGIN' : role === ROLES.EDITOR ? 'EDITOR LOGIN' : 'USER LOGIN';
  const subtitle = role === ROLES.ADMIN ? 'Sign in to access the admin dashboard.' : 'Sign in to manage and review content.';
  
  return (
    <article className={\`auth-user-login-card animate-reveal \${hiddenish ? 'auth-role-card-admin' : ''}\`} style={{ margin: '15px auto', width: 'min(400px, 94vw)', padding: '30px 20px' }}>
      <div className="auth-user-card-inner">
        <div className="auth-dhak-icon" style={{ marginBottom: '15px' }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
             {role === ROLES.ADMIN ? (
               <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
             ) : (
               <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
             )}
          </svg>
        </div>
        <h1 className="auth-user-title" style={{ fontSize: '20px' }}>{title}</h1>
        <p className="auth-user-subtitle" style={{ marginBottom: '25px', fontSize: '13px' }}>{subtitle}</p>
        
        <button className="auth-google-main-btn" onClick={onGoogleSignIn}>
          <svg width="20" height="20" viewBox="0 0 48 48" style={{marginRight: '12px'}}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>
        <p className="auth-small-copy" style={{ marginTop: '16px', opacity: 0.9 }}>
          Don't have an account? <button className="auth-link-button" onClick={onGoogleSignIn}>Create one with Google</button>
        </p>
      </div>
    </article>
  );
}`;

content = content.replace(targetRoleCard, replacementRoleCard);

// Update RoleCard invocations
content = content.replace(
  `<RoleCard role={ROLES.EDITOR} onLogin={()=>setModal({type:'login',role:ROLES.EDITOR})} />`,
  `<RoleCard role={ROLES.EDITOR} onGoogleSignIn={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.EDITOR) } catch(e){ setError(e?.message||'Google sign in failed.') } }} />`
);

content = content.replace(
  `<RoleCard role={ROLES.ADMIN} hiddenish onLogin={()=>setModal({type:'login',role:ROLES.ADMIN})} />`,
  `<RoleCard role={ROLES.ADMIN} hiddenish onGoogleSignIn={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.ADMIN) } catch(e){ setError(e?.message||'Google sign in failed.') } }} />`
);

// Remove LoginForm and ForgotPassword definitions
content = content.replace(/function LoginForm\(\{ role, onClose, onForgot, onSuccess \}\) \{[\s\S]*?(?=function AdminDashboard)/, '');

// Remove modals at the bottom of AuthPage
content = content.replace(/\{modal\?\.type==='login'&&<div className="auth-modal-backdrop"><LoginForm[^>]*><\/div>\}/, '');
content = content.replace(/\{forgotRole&&<div className="auth-modal-backdrop"><ForgotPassword[^>]*><\/div>\}/, '');

fs.writeFileSync('src/AuthPage.jsx', content);
