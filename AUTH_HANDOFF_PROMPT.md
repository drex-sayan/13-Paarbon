# 13 Paarbon — Complete Authentication Implementation Handoff Prompt

You are taking over an existing React/Vite website called **13 Paarbon**, a Bengali Durga Puja / cultural website.

## CRITICAL PRESERVATION RULE

The existing project is the source of truth.

**Do not redesign, rewrite, replace, or casually refactor anything that already exists.**

In particular:

- Home must remain visually and functionally unchanged.
- Pujo listing/detail pages must remain visually and functionally unchanged except where authentication/authorization genuinely requires a control to appear/disappear or a secure permission check to be added.
- About must remain unchanged.
- Existing Pujo data, gallery, Supabase Storage behavior, images, layouts, cinematic/parallax behavior, search, directions, and popup designs must be preserved.
- Do not replace the existing site with a generic dashboard or SaaS design.
- Add authentication around the existing product rather than rebuilding the product.

The user explicitly asked that existing work not be changed.

---

# EXISTING PROJECT

Stack:

- React 19
- Vite 7
- JavaScript/JSX
- Supabase JS
- Supabase PostgreSQL
- Supabase Storage

Existing important files include:

- `src/main.jsx`
- `src/styles.css`
- `src/supabaseClient.js`
- `public/images/*`

Existing Pujo tables are expected to include:

- `pujos`
- `photos`

Existing Storage bucket:

- `pujo-images`

Existing Pujo image paths use the Pujo ID as a directory.

---

# AUTHENTICATION DESIGN SOURCE OF TRUTH

The supplied authentication screenshots are the visual source of truth.

The supplied assets are:

- Login/authentication background: `public/images/auth-bg.jpg`
- Red texture: `public/images/auth-texture.jpg`
- Font: **Intel One Mono**

Visual requirements:

- Red textured authentication surfaces.
- Thin white borders.
- Large photographic background.
- Monospaced Intel One Mono typography.
- Rounded role cards.
- Minimal navigation.
- Role cards for Admin, User, Editor.
- Role-specific sign-in and registration forms.
- Authentication forms appear as centered popup/modal surfaces over the background.
- The design must not become a generic modern SaaS login page.
- Add subtle 3D depth, hover, perspective, parallax, background movement, and elevation effects.
- Effects must remain restrained/cinematic, not flashy.
- Support `prefers-reduced-motion`.
- On small screens, preserve the same visual design language rather than creating a completely different mobile UI.
- Long forms should scroll internally inside the popup instead of breaking the page.

The Admin card should be slightly less prominent/less obvious, but it must still exist.

---

# ROLE SYSTEM

There are exactly three roles for now:

1. User
2. Editor
3. Admin

Permanent IDs are separate from usernames.

Example formats:

- `USR-XXXXXXXX`
- `EDT-XXXXXXXX`
- `ADM-XXXXXXXX`

The username is unique and separate from the permanent role ID.

---

# USER REGISTRATION

Anyone can create a User account.

Fields:

- Name
- Gmail/email
- Phone number
- Username
- Password
- Confirm password

Requirements:

- Email verification is required.
- Phone verification is required.
- User becomes active only after required verification is complete.
- User receives a permanent User ID.
- User can use username + password to log in.
- User can use Google login.
- User can recover the password through the email + verified phone security flow.
- User can delete their own account.

---

# EDITOR APPLICATION

Anyone can click the Editor card and apply.

Fields:

- Name
- Gmail/email
- Phone number
- Username
- Password
- Confirm password

Requirements:

1. Email verification.
2. Phone verification.
3. After verification, Editor application becomes `Pending`.
4. Admin sees the pending application.
5. Admin approves or rejects.
6. If approved:
   - role becomes Editor
   - account becomes active
   - permanent Editor ID is generated/assigned
7. If rejected:
   - applicant can log in and see the rejected state
   - applicant can apply again only after **24 hours**
   - the 24-hour rule is enforced server-side, not just in the frontend
8. Email notification to active Admins should be sent for new/re-submitted Editor applications.
9. Editor cannot view the user list or other user accounts.

Editor capabilities:

- Add Pujo
- Edit Pujo name
- Edit theme
- Edit theme description
- Edit location/Google Maps link
- Upload photos
- Delete photos
- Reorder photos if the existing system supports it
- Edit descriptions
- Delete Pujo
- Use all existing Pujo editorial functionality

Editor cannot:

- View user management
- Manage Admins
- Manage roles/users

---

# ADMIN SYSTEM

Admin access is intentionally less prominent in the visual design.

There is an Admin login card and an Admin registration/application screen.

## Initial Admin

The first Admin is created through a protected one-time setup process, not an open public self-approval path.

A protected SQL bootstrap function/setup script exists for this.

After the first Admin exists, all future Admin applications must be approved by an existing Admin.

## Admin application

An applicant must:

- verify email
- verify phone
- submit Admin application
- wait for an existing Admin to approve

After approval:

- role becomes Admin
- account becomes active
- permanent Admin ID is assigned

Admin application email notifications should go to active Admins.

## Admin approval relationship

Every Admin created through the normal approval process records which Admin approved them.

If Admin A approves Admin B:

- Admin A may manage/deactivate/delete Admin B.
- Admin C may NOT delete/deactivate Admin B unless C also has an appropriate approval relationship.

The last active Admin must never be deleted or disabled.

Admin self-deletion must not remove the last active Admin and the initial Admin should remain protected by the setup relationship.

---

# ADMIN CAPABILITIES

Admin can:

- View Users
- View Editors
- View Admins
- View pending Editor applications
- Approve/reject Editors
- View pending Admin applications
- Approve/reject Admins
- Disable Users
- Reactivate Users
- Disable Editors
- Reactivate Editors
- Delete User accounts
- Delete Editor accounts
- Delete Admin accounts only when the Admin was approved by the acting Admin
- Change roles where permitted by the Admin approval rules
- Promote/demote accounts
- Manage Pujo content
- Upload/delete Pujo photos
- Delete Pujos

Editor must never see the user-management interface.

---

# LOGIN

Each role has its own login card/form.

The forms are visually role-specific but share the same authentication architecture.

Login method:

- Username + password

Phone number is NOT required on every login.

The verified phone number is an account security attribute and is used for recovery/verification.

---

# INVALID ROLE LOGIN

The selected login card does not grant the role.

The actual role comes from the secure database.

Example:

If a person owns a User account and clicks Editor Login:

- username/password lookup is restricted to the Editor role
- the User account must not be accepted as an Editor
- show an appropriate error such as:
  `This account is not registered as an Editor account.`

If a person tries Admin Login with a non-Admin account:

- do not grant Admin access
- show an invalid Admin account error

The frontend must never be trusted for authorization.

---

# GOOGLE LOGIN

Every role card contains a Google login button.

The actual database role is authoritative.

Rules:

- Existing User + User Google login → User flow.
- Existing Editor + Editor Google login → Editor flow.
- Existing Admin + Admin Google login → Admin flow.
- Existing User trying Editor Google login → error.
- Existing User trying Admin Google login → error.
- Existing Editor trying User/Admin login → role mismatch error.
- Existing Admin trying User/Editor login → role mismatch error.

For a brand-new Google identity, the selected role can be used to begin the corresponding User/Editor/Admin onboarding flow, but the final role still comes from the secure database and approval rules.

Google OAuth must be configured in Supabase and Google Cloud.

Never store Google client secrets in Vite/browser environment variables.

---

# EMAIL VERIFICATION

Email verification is required for User, Editor and Admin applications.

Supabase Auth handles the email verification process.

Supabase email confirmation must remain enabled.

---

# PHONE VERIFICATION

Phone verification is required for account creation/application.

The chosen SMS provider is **MSG91**.

Do not expose the MSG91 auth key in the browser.

Use a Supabase Auth Send SMS Hook / Edge Function adapter.

The Supabase-provided OTP should be forwarded to MSG91 so Supabase remains responsible for OTP verification.

Required server-side secrets include:

- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`

The MSG91 template must be configured/approved for the applicable Indian SMS/DLT requirements.

---

# PASSWORD RECOVERY

Forgot Password flow:

1. User enters username + selected role.
2. Backend resolves the matching account email without exposing unrelated accounts.
3. Supabase sends password recovery email.
4. User opens the reset link.
5. User must verify the account's phone with OTP as an additional recovery factor.
6. User sets the new password.

Do not implement recovery using only frontend state.

---

# ACCOUNT / PROFILE PAGE

After login or account creation, the authentication page should contain the account/profile section using the exact same visual language.

Show:

- Name
- Username
- Role
- Permanent ID
- Email
- Phone
- Status

Actions:

- Edit Profile
- Change Password
- Sign Out
- Delete My Account

Users and Editors may delete their own accounts.

Admin self-deletion must respect the Admin safeguards described above.

---

# ADMIN MANAGEMENT UI

The first version can be designed by the implementation agent using the existing authentication visual language.

Do not make it look like a generic enterprise dashboard.

Suggested sections:

- Editor Requests
- Admin Requests
- Users
- Editors
- Admins

Pending applications show:

- Name
- Username
- Email
- Phone
- Application status
- Approve
- Reject

No rejection reason is required in the first version.

Email notifications are preferred for Admin application awareness.

---

# DISABLED ACCOUNTS

Admin can disable a User or Editor.

Disabled accounts cannot use normal authenticated functionality.

The account owner can request reactivation.

Admin can reactivate the account.

Do not permanently delete an account merely because it was disabled.

---

# EDITOR 24-HOUR RULE

If an Editor application is rejected at time T:

- reapplication is unavailable until T + 24 hours
- enforcement must happen in PostgreSQL/RPC/backend logic
- frontend button state is only an additional convenience

No rejection reason is required.

---

# SUPABASE SECURITY

Use Supabase Auth + PostgreSQL RLS + Storage policies.

Do NOT rely on hiding React buttons.

Public visitors must be able to:

- browse Pujos
- search Pujos
- view individual Pujos
- view public gallery images
- use Directions

Only active Editor/Admin accounts may:

- create Pujos
- update Pujos
- delete Pujos
- upload Pujo images
- delete Pujo images

Users must not get editorial permissions.

Editors must not get user-management permissions.

Admin permissions must be enforced server-side.

---

# EXISTING PUJO UI INTEGRATION

The existing Pujo UI should remain visually unchanged.

Only authentication-dependent controls should change:

- Add Pujo visible to active Editor/Admin.
- Add Pujo hidden from public/User.
- Upload Photos visible to active Editor/Admin.
- Edit Description visible to active Editor/Admin.
- Delete Photo visible to active Editor/Admin.
- Delete Pujo visible to active Editor/Admin.
- Public visitors still see the cinematic Pujo presentation.

Do not redesign the Pujo page around the auth system.

---

# DATABASE OBJECTS

The authentication migration adds/uses:

- `profiles`
- `editor_applications`
- `admin_applications`
- `admin_approvals`

It also uses:

- `auth.users`
- existing `pujos`
- existing `photos`
- existing `pujo-images` Storage bucket

Profile fields include role/status/requested role, username, permanent ID, name, email, phone, approval relationship, and OAuth onboarding state.

---

# SERVER-SIDE FUNCTIONS

The project should use secure Postgres functions/RPCs for operations such as:

- resolving username to role-specific login email
- finalizing verified registration
- editor reapplication
- listing admin applications
- listing editor applications
- listing users/editors/admins for Admins
- approving/rejecting Editors
- approving/rejecting Admins
- disabling/reactivating accounts
- changing permitted roles
- deleting accounts
- bootstrapping the first Admin

Sensitive Admin operations must be SECURITY DEFINER or otherwise securely server-authorized and must not expose service-role credentials to the browser.

---

# EDGE FUNCTIONS

Included Edge Functions:

## `send-sms`

Supabase Auth Send SMS Hook adapter for MSG91.

Secrets:

- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`

## `notify-admins`

Sends new Editor/Admin application email notifications to active Admins.

Uses Resend.

Secrets:

- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

Supabase supplies its own runtime secrets such as the service-role key; never expose those in Vite variables.

---

# PROVIDER CONFIGURATION

The project intentionally does not contain real provider credentials.

Create `.env.local` from `.env.example` with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only secrets belong in Supabase Edge Function secrets.

Never commit:

- Supabase service-role key
- database password
- MSG91 auth key
- Resend API key
- Google OAuth secret

---

# FIRST ADMIN BOOTSTRAP

The project includes:

`supabase/bootstrap_first_admin.sql`

Workflow:

1. Create the first Auth user in Supabase.
2. Copy the Auth user UUID.
3. Run the protected bootstrap function in the SQL editor with a chosen username/name.
4. That creates the first active Admin.
5. Afterward, normal Admin applications use the Admin approval workflow.

The first Admin must not be publicly self-approved.

---

# DEMO

The project includes:

`demo/authentication-demo.html`

This is a visual-only preview of the role cards, 3D hover, background, popup styling, registration/login forms, and account surface.

It is not a substitute for the real Supabase authentication implementation.

---

# FINAL ACCEPTANCE CRITERIA

Before delivery, verify:

- Existing Home looks unchanged.
- Existing Pujo looks unchanged except permission controls.
- Existing About looks unchanged.
- Authentication page matches supplied screenshots/assets.
- Intel One Mono is used for authentication UI.
- Background and red texture use supplied original assets.
- Role cards work.
- Admin card is subtly less prominent.
- Login popup works per role.
- Registration popup works per role.
- Password fields exist without changing the intended visual design.
- Email verification is required.
- Phone verification is required.
- Google login exists for all roles.
- Google role mismatch is rejected.
- Username + password login is role-specific.
- Forgot password requires email + phone verification.
- User account activates after verification.
- Editor application goes pending after verification.
- Admin can approve/reject Editor.
- Editor gets permanent ID only after approval.
- Editor rejection blocks reapplication for 24 hours.
- Admin application goes pending after verification.
- Existing Admin approves new Admin.
- Admin approval relationship is recorded.
- Admin can only delete/deactivate an Admin they approved.
- Last active Admin cannot be removed.
- Admin can manage Users/Editors.
- Editors cannot view user management.
- Public visitors can still browse Pujos without login.
- Add Pujo is restricted to Editor/Admin.
- Photo upload/delete is restricted to Editor/Admin.
- Pujo deletion is restricted to Editor/Admin.
- RLS protects all sensitive operations.
- Storage policies protect write/delete access.
- No secrets are exposed in the frontend.
- Setup documentation explains Supabase, Google, MSG91 and Resend configuration.
- Final project is delivered as a complete ZIP.

---

# IMPORTANT IMPLEMENTATION STYLE

Do not make assumptions that conflict with the existing project.

If an existing component can be extended safely, extend it.

If a new authentication component is needed, keep it scoped to authentication.

Do not globally alter CSS variables or existing page styles if that can affect Home/Pujo/About.

Keep authentication CSS under `.auth-*`, `.account-*`, and `.admin-*` scopes.

The final result should feel like **13 Paarbon gained a secure authentication system**, not like the original website was replaced by an authentication template.
