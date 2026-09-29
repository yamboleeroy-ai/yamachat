# Yamachat 1.0.108

Stability release from the completed deep audit.

- Voice, WebRTC, Realtime and stream lifecycle cleanup hardened against duplicate listeners, stale callbacks, reconnect races and ghost state.
- Logout/login ordering and session cleanup hardened.
- Multi-client, responsive, Windows taskbar, stream and long-soak regression coverage passed on the audited runtime.
- Windows installer and automatic updates are moved from GitHub Releases to the official Yamachat Cloudflare distribution at `updates.yamachat.eu`.
- Android APK remains served from `yamachat.eu/download/`.
- Web/PWA and iOS/PWA continue from the same shared client on Cloudflare Pages.
- No UI redesign is included.
