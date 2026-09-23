# Password recovery setup (not yet activated)

The UI and email template are prepared. Do not announce working delivery or deploy the login link until the provider, template and reset page have been configured and an end-to-end test has passed.

## Free sender

Resend Free currently includes 3,000 transactional emails/month with a 100/day limit. Do not enable a paid plan or paid overages. These quotas are shared by all authentication emails (including signup/notifications), not just password resets. Pricing checked 2026-09-23: https://resend.com/pricing.

1. The owner creates/signs into a free Resend account.
2. Add yamachat.eu as a sending domain. Copy the actual verification DNS entries shown by Resend into VEDOS. Never invent DNS values, replace existing root mail/web records or add a second SPF TXT record to an existing hostname. Prefer the provider's designated sending/return-path subdomain and preserve the GitHub Pages A/CNAME records. Enable DKIM/SPF verification and review DMARC for that sender.
3. Once the domain is verified, create a sending-only API key restricted to this domain. Enter it directly in Supabase SMTP settings, never in source or frontend code.
4. Supabase project bxjvmjdppmqgbxfcowpf → Authentication → Email/SMTP: host smtp.resend.com, port 465, username resend, password the API key. Sender name Yamachat; sender address noreply@yamachat.eu. This does not create an inbox. Disable email link/open tracking.
5. Keep current Auth rate limits restrictive and review them against the 100/day shared provider cap. Review CAPTCHA separately before public rollout; the frontend button lock is not server-side abuse protection.

SMTP documentation: https://resend.com/docs/send-with-supabase-smtp

## Recovery template and deployment

1. Deploy reset-password.html, build/password-recovery.js, vendor/supabase.js and the existing icon to https://yamachat.eu before enabling the custom recovery email.
2. Add the exact redirect URL https://yamachat.eu/reset-password.html to the existing Supabase redirect allow list; preserve other redirect URLs and site URL.
3. Set Recovery subject to **Obnova hesla do Yamachatu** and HTML body to email/recovery.html. Preserve `{{ .TokenHash }}` exactly. The template uses a fixed trusted origin and fragment token, so it works across devices and does not place the token in HTTP request paths/referrers. It requires this custom template; the default ConfirmationURL template is not interchangeable.
4. The page verifies the recovery token only when the user submits matching new passwords. It does not consume links on initial page load. The temporary session has persistSession=false and detectSessionInUrl=false, and does not touch the main app's session. Reloading after the fragment has been cleared requires reopening the email or requesting a fresh link.
5. Send one test recovery to an owner-controlled registered account only with authorization. Verify actual delivery, sender, spam placement, button + fallback link, invalid/used token handling and login with the new password. Confirm it works when the request is made on one device and opened on another. The existing-account and unknown-address result must be the same.
6. Once the end-to-end check passes, release the shared login link to web/mobile and build a new Windows release. Existing Android/Windows installs do not receive HTML changes without an app update.

No production SMTP settings, auth templates, DNS records, passwords or account rows have been changed by this branch. No real recovery email has been sent.

## Tests

Run node scripts/check.mjs and node tests/password-recovery.cjs (Playwright). The latter uses the real vendored Supabase client with intercepted Auth responses: request, unknown address, rate limit, offline, success, expired token, weak-password retry, mismatch, wrong token type. Checks include no token consumption on page load, no duplicate submissions, and no changes to the existing app's localStorage.

Before changes, backup/before-password-recovery-20260923 was created. Work branch: feat/password-recovery-20260923. No deployment is performed before configuring the email provider.
