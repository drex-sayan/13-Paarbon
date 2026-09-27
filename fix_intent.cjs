const fs = require('fs');

let authJs = fs.readFileSync('src/auth.js', 'utf8');

authJs = authJs.replace(
  /export async function signInWithGoogle\(role\) \{[\s\S]*?sessionStorage\.setItem\('13paarbon_oauth_role', role\);/,
  \`export async function signInWithGoogle(role, isSignUp = false) {
  if (!Object.values(ROLES).includes(role)) {
    throw new Error('Invalid account role for Google sign-in.');
  }

  sessionStorage.setItem('13paarbon_oauth_role', role);
  sessionStorage.setItem('13paarbon_oauth_intent', isSignUp ? 'signup' : 'login');\`
);

authJs = authJs.replace(
  /if \(error\) \{[\s\S]*?sessionStorage\.removeItem\('13paarbon_oauth_role'\);/,
  \`if (error) {
    sessionStorage.removeItem('13paarbon_oauth_role');
    sessionStorage.removeItem('13paarbon_oauth_intent');\`
);

fs.writeFileSync('src/auth.js', authJs);

let authPage = fs.readFileSync('src/AuthPage.jsx', 'utf8');

authPage = authPage.replace(
  /const intended=sessionStorage\.getItem\('13paarbon_oauth_role'\);\s*if\(\!session \|\| \!profile \|\| \!intended\) return;\s*sessionStorage\.removeItem\('13paarbon_oauth_role'\);/,
  \`const intended=sessionStorage.getItem('13paarbon_oauth_role');
      const intent=sessionStorage.getItem('13paarbon_oauth_intent');
      if(!session || !profile || !intended) return;
      sessionStorage.removeItem('13paarbon_oauth_role');
      sessionStorage.removeItem('13paarbon_oauth_intent');\`
);

authPage = authPage.replace(
  /const isUnassignedGoogle=profile\.oauth_unassigned && profile\.role===ROLES\.USER && profile\.status==='pending' && !profile\.username;\s*if\(isUnassignedGoogle\)\{/,
  \`const isUnassignedGoogle=profile.oauth_unassigned && profile.role===ROLES.USER && profile.status==='pending' && !profile.username;
      if (intent === 'login' && isUnassignedGoogle) {
          selfDeleteAccount().then(() => {
              setError('No account associated with that Gmail. Please create an account first.');
              setProfile(null);
              setSession(null);
          }).catch(err => {
              supabase.auth.signOut().then(() => {
                  setError('No account associated with that Gmail. Please create an account first.');
                  setProfile(null);
                  setSession(null);
              });
          });
          return;
      }
      if(isUnassignedGoogle){\`
);

// Update all occurrences of signInWithGoogle(role) to pass isSignUp correctly.

authPage = authPage.replace(
  /signInWithGoogle\(ROLES\.USER\)/g,
  "signInWithGoogle(ROLES.USER, false)"
);

authPage = authPage.replace(
  /signInWithGoogle\(ROLES\.EDITOR\)/g,
  "signInWithGoogle(ROLES.EDITOR, false)"
);

authPage = authPage.replace(
  /signInWithGoogle\(ROLES\.ADMIN\)/g,
  "signInWithGoogle(ROLES.ADMIN, false)"
);

// Now fix the "Create one with Google" buttons to pass true instead.
// For User Login
authPage = authPage.replace(
  /Don't have an account\? <button className="auth-link-button" onClick=\{async\(\)=>\{ setError\(''\); try\{ await signInWithGoogle\(ROLES\.USER, false\) \} catch\(e\)\{ setError\(e\?\.message\|\|'Google sign in failed\.'\) \} \}\}>Create one with Google<\/button>/,
  \`Don't have an account? <button className="auth-link-button" onClick={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.USER, true) } catch(e){ setError(e?.message||'Google sign in failed.') } }}>Create one with Google</button>\`
);

// For RoleCard: We need to pass both onGoogleSignIn (login) and onGoogleSignUp (signup).
// Let's modify RoleCard definition:
authPage = authPage.replace(
  /function RoleCard\(\{ role, hiddenish, onGoogleSignIn \}\) \{/,
  \`function RoleCard({ role, hiddenish, onGoogleSignIn, onGoogleSignUp }) {\`
);

authPage = authPage.replace(
  /Don't have an account\? <button className="auth-link-button" onClick=\{onGoogleSignIn\}>Create one with Google<\/button>/,
  \`Don't have an account? <button className="auth-link-button" onClick={onGoogleSignUp}>Create one with Google</button>\`
);

// And update RoleCard invocations
authPage = authPage.replace(
  /<RoleCard role=\{ROLES\.EDITOR\} onGoogleSignIn=\{async\(\)=>\{ setError\(''\); try\{ await signInWithGoogle\(ROLES\.EDITOR, false\) \} catch\(e\)\{ setError\(e\?\.message\|\|'Google sign in failed\.'\) \} \}\} \/>/,
  \`<RoleCard role={ROLES.EDITOR} onGoogleSignIn={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.EDITOR, false) } catch(e){ setError(e?.message||'Google sign in failed.') } }} onGoogleSignUp={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.EDITOR, true) } catch(e){ setError(e?.message||'Google sign in failed.') } }} />\`
);

authPage = authPage.replace(
  /<RoleCard role=\{ROLES\.ADMIN\} hiddenish onGoogleSignIn=\{async\(\)=>\{ setError\(''\); try\{ await signInWithGoogle\(ROLES\.ADMIN, false\) \} catch\(e\)\{ setError\(e\?\.message\|\|'Google sign in failed\.'\) \} \}\} \/>/,
  \`<RoleCard role={ROLES.ADMIN} hiddenish onGoogleSignIn={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.ADMIN, false) } catch(e){ setError(e?.message||'Google sign in failed.') } }} onGoogleSignUp={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.ADMIN, true) } catch(e){ setError(e?.message||'Google sign in failed.') } }} />\`
);

fs.writeFileSync('src/AuthPage.jsx', authPage);
