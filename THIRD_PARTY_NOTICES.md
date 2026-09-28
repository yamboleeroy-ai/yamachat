# Yamachat Third-Party Notices

Yamachat is proprietary software, but it incorporates, bundles, builds with or
depends on third-party software. Those components remain subject to their own
licences and terms.

The Yamachat Proprietary License does not replace, narrow or revoke rights
granted by a third-party licence.

## Major components

### Supabase JavaScript client

- Package: `@supabase/supabase-js`
- Desktop resolved version: 2.95.0
- Licence: MIT
- Browser bundle present at: `vendor/supabase.js`
- Upstream copyright notice: Copyright (c) 2020 Supabase

The Supabase MIT licence requires preservation of its copyright and permission
notice in copies or substantial portions of the software.

The Yamachat Edge Function also imports a Supabase JavaScript client package at
runtime. That third-party package remains under its upstream licence.

### Electron

- Package: `electron`
- Resolved version: 44.3.0
- Licence: MIT

Electron also incorporates Chromium, Node.js and other third-party components
with their own notices.

### electron-updater

- Package: `electron-updater`
- Resolved version: 6.8.9
- Licence: MIT

### electron-builder

- Package: `electron-builder`
- Resolved version: 26.16.1
- Licence: MIT
- Role: build tooling

### Capacitor

Current resolved mobile components include:

- `@capacitor/core` 8.5.2 — MIT
- `@capacitor/android` 8.5.2 — MIT
- `@capacitor/ios` 8.5.2 — MIT
- `@capacitor/app` 8.1.1 — MIT
- `@capacitor/keyboard` 8.0.5 — MIT
- `@capacitor/local-notifications` 8.3.1 — MIT
- `@capacitor/push-notifications` 8.1.2 — MIT
- `@capacitor/splash-screen` 8.0.2 — MIT
- `@capacitor/status-bar` 8.0.3 — MIT

### esbuild

- Package: `esbuild`
- Resolved version: 0.25.12
- Licence: MIT
- Role: build tooling

### RNNoise and wrapper

RNNoise-related Yamachat assets are stored under `audio/`.

The corresponding licence texts are retained in:

- `audio/LICENSE-rnnoise.txt`
- `audio/LICENSE-wrapper.txt`

The RNNoise component uses the BSD-style licence contained in
`audio/LICENSE-rnnoise.txt`. The wrapper uses the MIT licence contained in
`audio/LICENSE-wrapper.txt`.

Neither RNNoise nor its wrapper is claimed as proprietary Yamachat code.

### Web Push

The Yamachat Edge Function imports:

- Package: `@mmmike/web-push`
- Version: 1.3.0

The package remains governed by its upstream licence.

### Google authentication library

The Yamachat Edge Function dynamically imports:

- Package: `google-auth-library`
- Version: 10.3.0
- Licence: Apache-2.0

The package remains governed by its upstream licence.

## Additional npm dependencies

The exact dependency sets used by the desktop and mobile projects are recorded
in:

- `desktop/package-lock.json`
- `mobile/package-lock.json`

Those lockfiles currently record permissive and other third-party licences
including MIT, ISC, BSD, Apache-2.0, 0BSD, BlueOak, Unlicense and Python-2.0.
For example, the current desktop dependency graph includes `argparse` 2.0.1,
which declares Python-2.0.

The licence attached to any individual third-party package controls that
package regardless of this summary.

## External services

Yamachat interoperates with hosted external services. These services are not
claimed as Yamachat-owned software merely because Yamachat connects to them,
and they remain governed by their own service, licence and privacy terms.

Current integrations verified in the project include:

- **Supabase** — authentication, PostgreSQL database access, Realtime, Storage
  and Edge Functions used by the Yamachat backend.
- **Cloudflare Realtime TURN** — temporary ICE/TURN credentials and relay
  infrastructure used when WebRTC connectivity requires a relay.
- **Metered TURN** — TURN/STUN relay infrastructure used as an additional
  WebRTC connectivity provider.
- **Google Firebase Cloud Messaging (FCM)** — Android push-notification
  delivery.
- **Microsoft Windows Push Notification Services (WNS)** — Windows desktop
  push-notification delivery.
- **Microsoft Azure Speech** — optional text-to-speech processing for supported
  Yamachat voice-announcement features when that integration is configured and
  used.
- **Web Push infrastructure** — browser/PWA push subscriptions and delivery via
  the user's browser/platform push service.

The project also relies on email-delivery infrastructure for authentication
emails. The concrete delivery provider is configuration-dependent and is not
asserted in this notice where it cannot be verified from the repository.

## Distribution rule

Where an upstream licence requires that its copyright notice, permission text,
NOTICE file or licence text accompany redistribution, Yamachat distributions
must preserve that material.

This file is an index. It does not replace any full upstream licence text that
must accompany a redistributed component.
