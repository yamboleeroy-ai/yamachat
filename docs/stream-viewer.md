# Independent stream viewer — local test implementation

## Verified starting points, 27 September 2026

- Web/Android: `main`, `7c1ed3234b7af60c6264ce2b5466dc7263659b09` (rechecked on GitHub after implementation).
- Latest published Windows release: `v1.0.96`, `653d01fb81fd5410908bcb3a3aedc2d9eb7859c0`.
- Android version advertised by main: `1.1.0.430`, code `200430`.
- Main's Windows update manifest still says 1.0.94. This unrelated discrepancy was recorded, not changed.
- `fix/web-notification-scroll-20260927` is ahead of main in a separate branch; it was not silently merged.
- Full pre-change history is saved in `yamachat-before-stream-viewer.bundle`; local backup branches preserve main and Windows 1.0.96. No remote refs, releases, update manifests, production data or installed applications were changed.

## Audit and replacement

The old `renderScreenShareStage()` placed `#screenShareStage` inside `.chat` and rebuilt videos with `innerHTML`. Chat-specific flex sizing, resize handlers, volume observers, dead-video cleanup, multi-stream enhancements and two fullscreen/overlay systems then mutated that same subtree. Navigation could hide the enclosing chat; a render could destroy the playing video even though its RTC peer still existed.

`web/stream-viewer.js` now owns a body-level layer with a session map and stable video element per peer. The existing opt-in watch protocol supplies tracks to that map. Navigation does not own this layer. Desktop floating/resize/drag/maximize/fullscreen/mini and mobile full-area/mini modes use the same controller. Desktop mode is explicitly selected for the Windows client, even in a narrow window. Resize, viewport changes and mini placement never alter chat geometry.

The mini-player avoids the measured composer, voice panels, global navigation and server rail. It can be dragged and restored by clicking its video. Layout is clamped to the visual viewport and CSS safe-area. Multiple viewers share the layer. If an exceptionally small viewport is entirely occupied by protected controls, a non-overlapping video rectangle may be physically impossible; this extreme case still needs device testing.

The builder removes the old stage renderer, overlay, resize/fullscreen/multi-viewer extensions, volume observer and dead-card cleanup, together with their CSS. Historical reference files remain immutable; none of their old viewers execute in the generated client. Discovery badges and hover previews remain because they are entry points, not the removed chat viewer.

Existing RTC signaling, voice peers, video/audio senders, stream audio path, codec/quality selection, watch ordering and timeouts remain. Closing a viewer requests stop-watching and releases its DOM/listeners; it never stops receiver tracks or closes the voice peer. Local preview dismissal does not stop broadcasting. No `getDisplayMedia` check gates viewing.

Brief track mute keeps the MediaStream binding. Pending/offline/autoplay states are visible. Frozen playback requests a bounded retry and closes after 18 seconds without progress while online. Existing stream-end and peer-leave events remove viewers. The existing iOS voice-rejoin path now retains still-open viewing intents during recovery and does not reopen a viewer the user closed.

## Building and tests

Requires Node and a full Git checkout (the pinned Windows commit must be present).

```
node scripts/check.mjs
node scripts/build-desktop-client.mjs
node tests/stream-transport.mjs
node tests/stream-viewer.cjs
```

`build-web.mjs` applies the shared transformer after the current web/mobile adapters. `build-desktop-client.mjs` now delegates to `build-stream-desktop.mjs`, which transforms the exact Windows 1.0.96 client. It does not regenerate desktop from the older mobile reference. Output is an internal test HTML, not an installer. Desktop shell, main/preload, tray, WNS, updater and packaging are unchanged. The next desktop adoption must explicitly update the pinned baseline to a newly verified release; do not replace newer desktop code with this older pin.

Browser tests require Playwright; `BROWSER_EXECUTABLE` can select an installed Chromium browser and `STREAM_TEST_OUTPUT` redirects test evidence. Tests block production network requests and inject fixture data only into the in-memory test HTML. The test bridge is never included in generated application files. CI runs the same tests; nothing was pushed to trigger CI during this task.

## Completed validation

- Original reference SHA-256 checks; generated script syntax and assets.
- Byte comparisons of nine key transport functions against both starting clients: voice peer, signaling, renegotiation, ordered screen-watch, start/stop sharing, screen audio, voice audio and capture capability helper.
- Real local RTCPeerConnection sender/receiver with canvas video and advancing playback time. This is not a production two-account or TURN test.
- Four configurations in Edge/Chromium on Windows: web, Windows client HTML, Android touch dimensions and iOS-like touch dimensions. Windows remains in desktop mode at 650×500. Resizes include 900×620 and 1920×1080; touch rotation includes 390×844, 844×390 and 320×568.
- Same video element and RTC peer after text channel, server, Friends, DM and settings navigation; unchanged chat geometry when minimized.
- Mini exclusion rectangles, restore, pointer drag, keyboard resize, maximize, fullscreen, pending/resumed state, brief offline/online transition, recovery intent, explicit close, stream stop and peer leave.
- Viewing works with `getDisplayMedia` removed in the test context.
- Existing profile actions/layout, password recovery, account/admin messaging, social panels and mobile Friends drawer suites passed. They use fixtures and do not prove live login or production writes.

## Release gates still open

No preview installer/APK or production release has been prepared. Before packaging, test the actual Electron shell and two live accounts, TURN/NAT, stream audio and concurrent voice, real Android portrait/landscape/background/keyboard, and real iOS Safari/PWA safe-area, autoplay, native fullscreen and background/foreground recovery. Chromium touch emulation does not verify WebKit or operating-system suspension. Tray, auto-update, notifications and real authentication were not exercised end-to-end; their implementation was left unchanged.

Native Picture-in-Picture is optional and not implemented. The in-app mini-player is the baseline. System fullscreen uses feature detection, including `webkitEnterFullscreen`, with an in-app maximized fallback. Browsers/OSes that suspend the whole application cannot guarantee continuous background playback. iOS may restrict programmatic volume changes; mute/system volume behavior needs real-device verification.
