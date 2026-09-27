const fs = require('fs');
let authPage = fs.readFileSync('src/AuthPage.jsx', 'utf8');

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

// We need to fix the "Create one with Google" button which was also changed to false by the above replaces!
// Let's replace it carefully.
authPage = authPage.replace(
  /Don't have an account\? <button className="auth-link-button" onClick=\{async\(\)=>\{ setError\(''\); try\{ await signInWithGoogle\(ROLES\.USER, false\) \} catch\(e\)\{ setError\(e\?\.message\|\|'Google sign in failed\.'\) \} \}\}>Create one with Google<\/button>/,
  `Don't have an account? <button className="auth-link-button" onClick={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.USER, true) } catch(e){ setError(e?.message||'Google sign in failed.') } }}>Create one with Google</button>`
);

authPage = authPage.replace(
  /function RoleCard\(\{ role, hiddenish, onGoogleSignIn \}\) \{/,
  `function RoleCard({ role, hiddenish, onGoogleSignIn, onGoogleSignUp }) {`
);

authPage = authPage.replace(
  /Don't have an account\? <button className="auth-link-button" onClick=\{onGoogleSignIn\}>Create one with Google<\/button>/,
  `Don't have an account? <button className="auth-link-button" onClick={onGoogleSignUp}>Create one with Google</button>`
);

authPage = authPage.replace(
  /<RoleCard role=\{ROLES\.EDITOR\} onGoogleSignIn=\{async\(\)=>\{ setError\(''\); try\{ await signInWithGoogle\(ROLES\.EDITOR, false\) \} catch\(e\)\{ setError\(e\?\.message\|\|'Google sign in failed\.'\) \} \}\} \/>/,
  `<RoleCard role={ROLES.EDITOR} onGoogleSignIn={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.EDITOR, false) } catch(e){ setError(e?.message||'Google sign in failed.') } }} onGoogleSignUp={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.EDITOR, true) } catch(e){ setError(e?.message||'Google sign in failed.') } }} />`
);

authPage = authPage.replace(
  /<RoleCard role=\{ROLES\.ADMIN\} hiddenish onGoogleSignIn=\{async\(\)=>\{ setError\(''\); try\{ await signInWithGoogle\(ROLES\.ADMIN, false\) \} catch\(e\)\{ setError\(e\?\.message\|\|'Google sign in failed\.'\) \} \}\} \/>/,
  `<RoleCard role={ROLES.ADMIN} hiddenish onGoogleSignIn={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.ADMIN, false) } catch(e){ setError(e?.message||'Google sign in failed.') } }} onGoogleSignUp={async()=>{ setError(''); try{ await signInWithGoogle(ROLES.ADMIN, true) } catch(e){ setError(e?.message||'Google sign in failed.') } }} />`
);

fs.writeFileSync('src/AuthPage.jsx', authPage);
