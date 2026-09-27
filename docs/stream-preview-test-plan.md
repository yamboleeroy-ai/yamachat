# Yamachat 1.0.99 stream/voice preview — NOT a public release

Extract the ZIP into a separate folder and run Yamachat.exe. It uses a separate
Yamachat-Stream-Preview profile, does not install updates, register the production
protocol or request the production WNS channel. Do not copy it over your installation.
Login is separate. Android debug preview uses eu.yamachat.preview and a debug key.

Automated gates cover actual voice object selection/fallback, PCM split frames,
updater concurrency/throttle/offline/resume, viewer volume/restore, syntax and
existing transport, interactions, microphone-test and notification behavior.

## Required hardware checks before any release

- Two PCs: share a game with sound, including a game launched through a child process.
  Confirm the viewer hears the game and never hears their own voice returned.
- Share entire display with music plus a remote voice call. Confirm music reaches
  the viewer, Yamachat playback does not, and normal voice stays connected.
- Test normal/normal, elevated/elevated, elevated/normal and normal/elevated
  Yamachat/game combinations. Record native helper HRESULT and helper/target
  integrity levels. Do not disable UAC, the sandbox or use uiAccess to bypass them.
- Missing/unsupported helper: image continues, clear audio error, no system fallback.
- Test stream fullscreen, volume and Escape from normal and maximized windows.
  Bounds/maximization must stay exactly unchanged; close/reopen must keep audio.
- iPhone Safari and installed PWA: try element fullscreen where supported, then
  safe viewport fallback; verify playback, volume and return after rotation.
- Windows/Android/iOS: male/female/Auto, voices loading late, one voice, zero voices,
  join/leave names, cue-only/off, existing TTS/join/leave/microphone tests.

The SpeechSynthesis API exposes no gender attribute. Known voice-name hints select
real installed voices; the UI reports the actual selection and fallback. Both
genders cannot be guaranteed on a device that only supplies one voice.

## Known verification limits

The packaged 1.0.99 helper started and emitted PCM on the development Windows host.
This does not prove non-silent game audio or admin compatibility. The precise
reported admin failure has not yet been reproduced with the user's target game.
New diagnostics must establish whether it is capture, activation or permissions.
The original 4.5s parent deadline was shorter than the helper's 5s activation
deadline; the preview allows 8s. PCM framing and startup generation races are fixed.

Preview artifacts and green CI are necessary, not sufficient, for public release.
User approval of preview and the hardware matrix remain mandatory.

## Hardware evidence, 2026-09-27

The real packaged Electron runtime booted outside the restricted test sandbox;
preview updater was disabled and its fullscreen bridge preserved native bounds.
The native include-tree helper captured a 997 Hz tone from a child PowerShell
process (amplitude 0.05489). Exclude-tree on this host still captured the tone
(0.08730). FxSound and virtual devices are installed; rerendering outside the
excluded process tree is a likely cause, not yet a proven complete diagnosis.
Screen audio now refuses known virtual default outputs (or unknown endpoints),
with a direct-device/app-share explanation. App-only include-tree is preserved.
Physical-output exclusion, elevated capture and real iOS remain release gates.
