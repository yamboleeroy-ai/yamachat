const fs=require('node:fs'),assert=require('node:assert/strict');
const main=fs.readFileSync('desktop/main.js','utf8');
const preload=fs.readFileSync('desktop/preload.js','utf8');
const shell=fs.readFileSync('desktop/desktop.html','utf8');

for(const marker of [
  "function restoreMainWindowInteractivity(win, reason = 'activate')",
  "win.setIgnoreMouseEvents(false)",
  "win.setFocusable(true)",
  "win.webContents.focus()",
  "frame?.contentWindow?.focus?.()",
  "type: 'yamachat:desktop-window-reactivated'",
  "restoreMainWindowInteractivity(mainWindow, 'show-main-window')",
  "restoreMainWindowInteractivity(win, 'restore')",
  "restoreMainWindowInteractivity(win, 'show')",
  "restoreMainWindowInteractivity(win, 'focus')",
  "} else {\n      showMainWindow();"
]) assert(main.includes(marker),'Desktop taskbar restore marker missing: '+marker);

// The failed delayed-focus workaround must be gone. It did not address the freeze.
assert(!main.includes('repairVoiceTaskbarActivation'),'Obsolete delayed taskbar focus workaround must be removed');

// Keep voice-safe background behavior and preserve live media.
assert(main.includes("if (!desktopState.voiceConnected || ycVoiceSafeMinimizeBusy) return;"),
  'Voice-safe minimize guard changed');
assert(main.includes("win.hide();\n          if (win.isMinimized()) win.restore();"),
  'Voice-safe hidden restore path changed');
const recoveryStart=main.indexOf("function restoreMainWindowInteractivity");
const recoveryEnd=main.indexOf("\nfunction showMainWindow()",recoveryStart);
assert(recoveryStart>=0&&recoveryEnd>recoveryStart,'Restore helper boundary missing');
const recovery=main.slice(recoveryStart,recoveryEnd);
for(const forbidden of ['reload(','reloadIgnoringCache','leaveVoiceChannel','stopProcessAudioCapture','destroy()'])
  assert(!recovery.includes(forbidden),'Restore helper must preserve live renderer/voice/stream state: '+forbidden);

// Critical regression: while voice is active Electron main must not continuously
// inject JS into the renderer. State is pushed outward through a narrow IPC bridge.
for(const forbidden of [
  "const delay = desktopState.voiceConnected ? 250 : 900",
  "await readDesktopState()",
  "window.__ycLastDesktopVoiceWake",
  "frame.contentWindow.postMessage({ type: 'yamachat:desktop-voice-wake'"
]) assert(!main.includes(forbidden),'Continuous main->renderer voice polling remains: '+forbidden);

assert(main.includes("handleClientIpc('yamachat:desktop-state-update'"),
  'Main process desktop state update IPC missing');
assert(main.includes('function applyDesktopStateUpdate(next)'),
  'Sanitized main-process desktop state receiver missing');
assert(preload.includes("updateDesktopState: (state) => ipcRenderer.invoke('yamachat:desktop-state-update'"),
  'Preload desktop state push bridge missing');
for(const marker of [
  'async function ycPushDesktopState(force = false)',
  "window.yamachatDesktop?.updateDesktopState?.(next)",
  "ycDesktopStatePushTimer = setInterval(() => void ycPushDesktopState(false), 350)",
  "if (!force && signature === ycDesktopStateLast) return false",
  'ycStartDesktopStatePush();'
]) assert(shell.includes(marker),'Renderer-side push state marker missing: '+marker);

console.log('PASS Windows taskbar restore: no active-voice main->renderer polling; tray state is pushed on change while live voice/stream state and normal focus recovery stay intact.');
