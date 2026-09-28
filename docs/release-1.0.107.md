# Yamachat 1.0.107

- Stability hardening after the multi-user voice crash: Supabase Presence feedback storm removed from the active voice membership path, participant lease heartbeat is bounded, signaling can recover after a dead realtime channel, and stale WebRTC peers are cleaned up after the participant lease expires.
- Rapid mute/deafen changes are coalesced so repeated clicks do not create an unbounded queue of participant writes.
- Join/leave announcements use the refreshed participant roster as the single authoritative source, with duplicate suppression to prevent repeated arrival/departure announcements.
- Multi-client regression coverage includes 10 simultaneous clients, multiple servers and voice rooms, login/logout cycles, realtime text chat, reconnects, voice + stream lifecycle and cleanup checks.
- Android now offers the same Microsoft Azure Natural voice catalogue used by Windows, including Czech Vlasta and Antonín when available. The Azure secret remains server-side in the authenticated Supabase Edge Function; the existing Android/system TTS remains the automatic fallback.
- The Microsoft Natural Android integration is applied only to the generated Android bundle. Web/PWA, iOS/PWA and Windows keep their existing platform-specific voice implementation and layout.
- Existing voice, stream, WebRTC, chat, Friends/DM, servers, channels, notifications, updater, profiles and platform layouts are preserved.

The release pipeline must pass Web/PWA, Android, iOS and Windows checks before publication. Android also verifies the existing package/signing certificate and requires a strictly higher versionCode so the APK updates the installed Yamachat instead of installing as a separate app.
