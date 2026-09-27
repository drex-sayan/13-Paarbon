const fs = require('fs');
let authPage = fs.readFileSync('src/AuthPage.jsx', 'utf8');

const target = "    const intended=sessionStorage.getItem('13paarbon_oauth_role');\n    if(!session || !profile || !intended) return;\n    sessionStorage.removeItem('13paarbon_oauth_role');\n    const isUnassignedGoogle=profile.oauth_unassigned && profile.role===ROLES.USER && profile.status==='pending' && !profile.username;\n    if(isUnassignedGoogle){";

const replacement = `    const intended=sessionStorage.getItem('13paarbon_oauth_role');
    const intent=sessionStorage.getItem('13paarbon_oauth_intent');
    if(!session || !profile || !intended) return;
    sessionStorage.removeItem('13paarbon_oauth_role');
    sessionStorage.removeItem('13paarbon_oauth_intent');
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

authPage = authPage.replace(target, replacement);

fs.writeFileSync('src/AuthPage.jsx', authPage);
