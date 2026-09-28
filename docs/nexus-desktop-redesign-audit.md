# Yamachat Nexus desktop redesign audit

Branch: `test/nexus-desktop-redesign-20260928`
Baseline: Yamachat 1.0.105 release commit `366eb4366a7596c5dd6deeb65acb6a94a693fe21`

## Scope

This branch changes Windows desktop presentation only. It does not change Supabase schema, auth contracts, production release metadata, or main.

## Presentation surfaces

- `desktop/desktop.html`: Electron shell/titlebar and srcdoc host for the desktop client.
- `desktop/desktop-client.html`: existing application DOM, render functions and UI modules.
- `desktop/nexus-ui.css`: Nexus visual system and responsive desktop layout.
- `desktop/nexus-ui.js`: layout composition and UI-only navigation/browser surface.
- `web/stream-viewer.css` and existing in-client `.yc-stream-viewer` styles: presentation of the existing stream viewer.

## Voice / stream no-touch boundary

The redesign must not replace, duplicate, or reinitialize any of the following:

- WebRTC peer creation, offers/answers/ICE and peer lifecycle.
- Existing MediaStream and MediaStreamTrack ownership.
- Voice join/leave, participant rows and reconnect flow.
- Microphone/output device selection and device-change handling.
- Mute/deafen, microphone test hold and output volume state.
- Electron process-audio capture, display capture selection and audio routing.
- Stream start/stop, viewer attach/detach, stream audio, fullscreen lifecycle and reopen logic.
- Electron IPC channels in `desktop/main.js` / `desktop/preload.js`.

Nexus moves existing DOM nodes and invokes existing UI entry points. It does not create a second voice or stream implementation.

## Server Browser policy

Public servers are loaded through the existing `list_public_communities` RPC and joined through the existing `join_public_community` RPC. The private tab only lists private servers already accessible to the signed-in user; it does not expose undiscoverable private communities. Invite-code joining remains the existing `join_community_by_code` path.

## Regression targets

- voice join / leave
- text/server navigation while voice remains connected
- mute / deafen
- microphone and output device controls
- stream start / stop
- stream watch
- minimize / move / fullscreen / exit fullscreen
- stream audio
- close / reopen viewer
- normal text messaging
