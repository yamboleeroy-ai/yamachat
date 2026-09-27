# Windows per-application stream audio

Status: experimental Windows-only stream audio path. This branch is based on the tested Windows stream-lifecycle preview and must not be merged or released until a two-account physical Windows test passes.

## Goal

When the user shares an application window, Yamachat should send audio rendered by that application's process tree only. Yamachat voice chat and unrelated system audio must not be present in the stream.

The existing screen-video track, voice peer, screen-video sender, stream viewer, updater, WNS identity, auth, tray and mobile clients remain unchanged.

## Windows API

Use WASAPI process loopback:

- `ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, ...)`
- `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`
- `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE`
- target PID resolved from the selected Electron window handle.

The helper requests 48 kHz, 16-bit, stereo PCM with `AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM` and `AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY`, matching WebRTC/Opus's natural 48 kHz clock.

Minimum documented Windows support: build 20348. Unsupported systems must fail closed to video-only for window sharing; they must not silently fall back to whole-system audio.

## Data path

1. Electron desktop picker returns `window:XX:YY`; `XX` is the window ID/handle on Windows.
2. Main process stores only the current display-capture selection.
3. For a selected window, Chromium's `audio: 'loopback'` is deliberately omitted.
4. A packaged native helper resolves HWND -> PID with `GetWindowThreadProcessId`.
5. The helper captures only the PID + child-process render streams and writes raw PCM to stdout.
6. Electron main forwards PCM chunks to the trusted desktop shell via IPC.
7. The desktop shell converts PCM into a Web Audio `MediaStreamAudioDestinationNode` track.
8. The existing Yamachat screen-audio sender uses that track exactly as it currently uses a display-capture audio track.
9. Stopping screen share kills the helper, stops only the process-audio track, and leaves voice/microphone WebRTC untouched.

## Full-screen sharing

For `screen:...` sources, per-process capture is not meaningful because there is no single target process. The existing system-audio path with Yamachat own-audio exclusion remains available for entire-screen sharing.

## Failure behavior

- Window source + helper unavailable/unsupported: video continues, stream audio is disabled, and the UI reports that app-only audio is unavailable.
- Never fall back from window process audio to whole-system loopback automatically.
- Helper exit, selected-window exit or app shutdown stops only the process-audio path.
- A new share always tears down any old process-audio helper before starting another.

## Release gate

Before release:

- native helper compiles in Windows CI;
- packaged portable contains the helper;
- static guards confirm a window source does not request Electron system loopback;
- same voice/WebRTC peer is preserved;
- two-account physical test: streamer + viewer in Yamachat voice, shared app plays sound, streamer speaks, unrelated app plays sound;
- viewer hears shared app only, not streamer's Yamachat voice and not unrelated app;
- stop/restart stream restores app audio;
- full-screen share behavior remains unchanged.
