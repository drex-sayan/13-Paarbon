const fs = require('fs');
let authPage = fs.readFileSync('src/AuthPage.jsx', 'utf8');

const regex = /const intended=sessionStorage\.getItem\('13paarbon_oauth_role'\);\s*if\(!session \|\| !profile \|\| !intended\) return;\s*sessionStorage\.removeItem\('13paarbon_oauth_role'\);\s*const isUnassignedGoogle=profile\.oauth_unassigned && profile\.role===ROLES\.USER && profile\.status==='pending' && !profile\.username;\s*if\(isUnassignedGoogle\)\{/g;

const replacement = `const intended=sessionStorage.getItem('13paarbon_oauth_role');
    const urlIntent = new URLSearchParams(window.location.search).get('intent');
    const storageIntent = sessionStorage.getItem('13paarbon_oauth_intent');
    const intent = urlIntent || storageIntent || 'login';
    if(!session || !profile || !intended) return;
    sessionStorage.removeItem('13paarbon_oauth_role');
    sessionStorage.removeItem('13paarbon_oauth_intent');
    
    // Clean up the URL so the intent parameter doesn't stick around if they refresh
    if (urlIntent) {
       const url = new URL(window.location);
       url.searchParams.delete('intent');
       window.history.replaceState({}, '', url);
    }
    
    const isUnassignedGoogle=profile.oauth_unassigned && profile.role===ROLES.USER && profile.status==='pending' && !profile.username;
    
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
    
    if(isUnassignedGoogle){`;

if (regex.test(authPage)) {
    console.log("Matched! Replacing...");
    authPage = authPage.replace(regex, replacement);
    fs.writeFileSync('src/AuthPage.jsx', authPage);
    console.log("Written successfully.");
} else {
    console.log("Regex did not match!");
}
