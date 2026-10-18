# YamaSearch account and sync architecture

Status: isolated backend deployed. Google sign-in and Windows session restoration are verified for the Windows 0.3.21 release; sync and additional provider registrations remain disabled until their individual release gates pass.

## Audited baseline

- Source baseline: `main` at `24b31bfbc3c141ad17a31145d7761db1744039e2`.
- Windows YamaSearch is a .NET 8/WPF application using a persistent WebView2 profile. WebView2 stores website passwords; YamaSearch does not read them.
- Android YamaSearch is a native Java browser around Android WebView. Its browser profile, favorites, history and settings are local only.
- The iOS build is a PWA and stores its current state locally.
- The existing `yamachat` Supabase project has Yamachat users and a trigger that creates a Yamachat profile for every new Auth user. It has no YamaSearch sync tables and was deliberately left unchanged.
- A separate Free-plan project named `YamaSearch` was created in the same organization and EU Central region. Its project ref is `bdfrzupieygsutraxyjx`; it contains only the YamaSearch account/sync schema.

## Provider support verified on 2026-10-18

| Provider | Decision | Required setup |
| --- | --- | --- |
| Google/Gmail | Supported by Supabase Auth | Google web OAuth client; callback `https://<yamasearch-project>.supabase.co/auth/v1/callback`; only `openid`, `email`, `profile` scopes. Store the client secret only in Supabase. |
| Microsoft/Outlook/Hotmail/Live | Supported by Supabase Auth as Azure | Entra app registration allowing personal Microsoft accounts (and work/school accounts if desired); Supabase callback; request `email`. Store the client secret only in Supabase. |
| Seznam.cz/Email.cz | Supported as a custom OAuth2 provider | Register at `https://vyvojari.seznam.cz/oauth/admin`; use authorization, token and userinfo endpoints from Seznam documentation and only the mandatory `identity` scope. Store the client secret only in Supabase. Keep PKCE enabled unless an integration test proves Seznam rejects it. |
| Apple | Technically supported | Apple Developer membership, primary App ID, Services ID, verified domain and signing key. This is deferred until those registrations exist. |
| GitHub | Supported by Supabase Auth | GitHub OAuth App with the Supabase callback. Request only basic profile and verified email access. |
| Discord | Supported by Supabase Auth | Discord OAuth application with the Supabase callback. Request only `identify` and `email`. |
| Facebook | Supported by Supabase Auth | Meta app with Facebook Login for Business, a valid privacy policy and the Supabase callback. Request only public profile and email. |
| mojeID | Technically possible as custom OIDC | Register a relying party and validate its discovery metadata in a separate integration test. Optional, not a priority-provider substitute. |
| Centrum.cz / Atlas.cz | Not supported | No public official OAuth2/OIDC developer integration was found. No buttons should be shown. |

Provider availability must be read from the Auth service at runtime. Built-in providers are discovered through `/auth/v1/settings`. That endpoint does not expose custom providers, so `custom:seznam` additionally requires an explicit public deployment configuration. A client must never display a sign-in button for a provider that has not been enabled in that configuration.

Primary references:

- Supabase social providers: https://supabase.com/docs/guides/auth/social-login
- Supabase custom providers: https://supabase.com/docs/guides/auth/custom-oauth-providers
- Supabase identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- Google setup: https://supabase.com/docs/guides/auth/social-login/auth-google
- Microsoft setup: https://supabase.com/docs/guides/auth/social-login/auth-azure
- Seznam OAuth: https://vyvojari.seznam.cz/oauth/doc
- Apple web setup: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web

## Backend isolation and cost

A dedicated Supabase project now exists in the existing organization and the EU Central region. Creation was quoted and confirmed at $0/month on the organization's Free plan. Its health, API URL, public publishable key, migration history, RLS and guarded RPC behavior were verified on 2026-10-18. Pricing must be checked again immediately before upgrading or enabling paid features.

The existing Yamachat project must not receive this migration.

## Authentication flow

1. The client queries `/auth/v1/settings` and shows only configured providers.
2. Native clients open the provider in the system browser, never an embedded WebView.
3. Use Authorization Code with PKCE and a one-time callback nonce.
4. Windows receives the callback on a loopback address and verifies the nonce before exchanging the code.
5. Android uses a verified app link or custom callback handled by the app and launches the authorization screen through a Custom Tab.
6. The PWA uses an HTTPS callback on its own origin.
7. Provider passwords never enter YamaSearch. Only minimal identity scopes are requested; no mail-reading scopes are allowed.
8. Native refresh tokens are stored in Windows Credential Manager or Android Keystore-backed storage. Access tokens remain short-lived and in memory where practical.

Identity linking uses Supabase's authenticated `linkIdentity` flow. Manual linking is currently a Supabase beta feature and must be enabled and tested before the UI exposes it. Unlinking is allowed only after reauthentication and only while another recovery identity remains. Automatic same-email linking is accepted only for provider-verified email addresses.

## Sync model

The migration `products/yamasearch/supabase/migrations/20261018020000_yamasearch_account_sync.sql` lives in a dedicated project root and defines isolated `yamasearch_*` tables with row-level security. It must never be deployed from the shared Yamachat Supabase root. An account can own multiple browser profiles. Sync is record-based, not a single growing JSON document:

- `bookmarks`: favorites/bookmarks and ordering metadata;
- `settings`: supported non-secret browser settings;
- `history`: disabled by default and opt-in;
- `open_tabs`: disabled by default and opt-in.

Each record has a server-owned revision, update time, schema version, optional tombstone and source device. Direct client mutation is revoked; a security-definer RPC checks ownership, category opt-in, size/quota limits and the expected revision. Clients use an overlap window plus primary-key/revision de-duplication and periodic full reconciliation because a timestamp alone is not a commit-safe cursor. Tombstones are retained for 90 days and purged only by a server role. Disabling a category transactionally purges its server rows. Bookmarks are independent records. Settings use last-confirmed field values. History is append-oriented. Open tabs are device snapshots.

Cookies, website sessions, downloads and private-window data remain deliberately excluded. WebView2 does not expose its built-in password database to YamaSearch, so existing WebView2 passwords cannot simply be uploaded. Password migration requires a separate, explicit import into a YamaSearch-owned vault.

The first vault implementation layer is now present in `PasswordVaultCrypto.cs`. It creates a random 256-bit vault key, wraps it with a key derived from a user-chosen synchronization passphrase (PBKDF2-HMAC-SHA256, currently 600,000 iterations and a random 256-bit salt), and encrypts each item independently with AES-256-GCM, a fresh 96-bit nonce and item-bound authenticated data. The passphrase and unwrapped vault key are never intended for Supabase; temporary key material is zeroed where managed-memory APIs allow it. Automated smoke tests cover Unicode round trips, wrong passphrases, ciphertext tampering, item-ID substitution and nonce reuse detection.

This cryptographic layer is not yet exposed in the UI and no password has been uploaded. Before rollout it still requires: a reviewed server schema that accepts ciphertext only, encrypted local storage, explicit CSV/browser import consent, save/autofill UI, recovery-key UX, cross-device tests and an external security review. Passkeys remain excluded because private keys are deliberately non-exportable and must be synchronized by the platform credential provider rather than copied by YamaSearch.

## Website sign-in compatibility

- Windows keeps WebView2 password autosave and enables WebView2 general autofill as a user-controlled setting.
- OAuth popup tabs must be attached as a real `NewWindow` WebView so `window.opener`, `postMessage` and `window.close()` continue to work.
- Android WebAuthn can be enabled for arbitrary websites only when YamaSearch holds the Android browser role. Credential providers such as Google Password Manager additionally require privileged-caller approval. Until that approval is granted, unsupported sites must receive a normal WebAuthn failure, not a fake success.
- Linking a provider to YamaSearch never signs the user into unrelated websites automatically.

## Data protection and deletion

- Every exposed table has RLS and an ownership predicate based on `(select auth.uid())`.
- The client contains only a publishable key. Service-role keys and OAuth client secrets stay server-side.
- Account deletion requires a separately reviewed reauthentication endpoint that deletes the Auth user; cascading foreign keys then delete all YamaSearch rows. It is not exposed by the initial migration because a freshly rotated access token is not proof of interactive reauthentication.
- Device/session UI must distinguish the device registry from actual Auth sessions. Remote token revocation is not claimed until a server endpoint implements it.
- Privacy text must describe optional sync categories, retention and deletion. Anonymous/local-only use remains the default and fully functional.

## Rollout gates

1. **Done:** create the isolated project after the user confirms the organization and the quoted cost.
2. **Done:** apply and lint the migrations; run transactional SQL smoke tests and Supabase security/performance advisors.
3. **Partial:** the restricted Windows loopback redirect allowlist and Google are configured; every additional provider must be registered, configured and enabled one at a time.
4. **Partial:** Google sign-in and Windows restart/refresh restoration pass; sign-out, offline/network failure, token expiry and every additional platform still require verification.
5. Enable manual identity linking only after provider-by-provider conflict and recovery tests.
6. Enable sync categories incrementally; history and open tabs remain off by default.
7. **Done for Windows 0.3.21:** publish only after explicit user approval. Additional providers and synchronization remain separate gated follow-up work.
