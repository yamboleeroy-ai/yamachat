const fs=require('node:fs'),assert=require('node:assert/strict');
const main=fs.readFileSync('desktop/main.js','utf8');
const preload=fs.readFileSync('desktop/preload.js','utf8');
const shell=fs.readFileSync('desktop/desktop.html','utf8');

for(const marker of [
  "function restoreMainWindowInteractivity(win, reason = 'activate')",
  "function repairVoiceTaskbarInputAfterRestore(win, reason = 'taskbar-return')",
  "let voiceTaskbarInputResetPending = false",
  "let voiceTaskbarInputResetBusy = false",
  "win.setIgnoreMouseEvents(false)",
  "win.setFocusable(true)",
  "win.setEnabled(true)",
  "voiceTaskbarInputResetPending = true",
  "voiceTaskbarInputResetPending = false",
  "if (!repairVoiceTaskbarInputAfterRestore(win, 'restore'))",
  "if (!repairVoiceTaskbarInputAfterRestore(win, 'show'))",
  "if (!repairVoiceTaskbarInputAfterRestore(win, 'focus'))",
  "restoreMainWindowInteractivity(mainWindow, 'show-main-window')",
  "} else {\n      showMainWindow();"
]) assert(main.includes(marker),'Desktop taskbar restore marker missing: '+marker);

assert(!main.includes('repairVoiceTaskbarActivation'),'Obsolete delayed taskbar focus workaround must stay removed');

// Voice-safe minimize must keep the renderer alive, restore the hidden native window,
// then arm exactly one Windows taskbar input reset for the next native return.
const minimizeStart=main.indexOf("let ycVoiceSafeMinimizeBusy = false");
const minimizeEnd=main.indexOf("\n  win.on('restore'",minimizeStart);
assert(minimizeStart>=0&&minimizeEnd>minimizeStart,'Voice-safe minimize boundary missing');
const minimize=main.slice(minimizeStart,minimizeEnd);
assert(minimize.includes("win.hide();\n          if (win.isMinimized()) win.restore();"),
  'Voice-safe hidden restore path changed');
assert(minimize.indexOf("if (win.isMinimized()) win.restore();") < minimize.indexOf("voiceTaskbarInputResetPending = true"),
  'Taskbar reset must arm only after the hidden native restore');

// The taskbar repair itself is a native hide -> mouse/focus enable -> show -> focus cycle.
// It must consume pending state before the native cycle, and never reload/destroy media state.
const repairStart=main.indexOf("function repairVoiceTaskbarInputAfterRestore");
const repairEnd=main.indexOf("\nfunction showMainWindow()",repairStart);
assert(repairStart>=0&&repairEnd>repairStart,'Taskbar input repair boundary missing');
const repair=main.slice(repairStart,repairEnd);
for(const marker of [
  "if (voiceTaskbarInputResetBusy) return true",
  "voiceTaskbarInputResetPending = false",
  "voiceTaskbarInputResetBusy = true",
  "win.hide()",
  "win.setIgnoreMouseEvents(false)",
  "win.setFocusable(true)",
  "win.setEnabled(true)",
  "win.show()",
  "win.focus()",
  "restoreMainWindowInteractivity(win, 'taskbar-input-reset-' + reason)"
]) assert(repair.includes(marker),'Taskbar input repair marker missing: '+marker);
assert(repair.indexOf("voiceTaskbarInputResetPending = false") < repair.indexOf("win.hide()"),
  'Taskbar repair must consume pending state before hide/show to prevent recursion');
for(const forbidden of ['reload(','reloadIgnoringCache','leaveVoiceChannel','stopProcessAudioCapture','destroy()','loadFile('])
  assert(!repair.includes(forbidden),'Taskbar repair must preserve live renderer/voice/stream state: '+forbidden);

// Tray is the known-good activation path. It explicitly cancels taskbar-only recovery.
const showStart=main.indexOf("function showMainWindow()");
const showEnd=main.indexOf("\nfunction normalizePresenceMode",showStart);
const showMain=main.slice(showStart,showEnd);
assert(showMain.includes("voiceTaskbarInputResetPending = false"),
  'Tray/showMainWindow must cancel taskbar-only reset');
assert(showMain.includes("mainWindow.show();\n  mainWindow.focus();"),
  'Known-good tray show/focus path changed');

// Disconnecting voice invalidates a pending taskbar-only reset.
const stateStart=main.indexOf("function applyDesktopStateUpdate(next)");
const stateEnd=main.indexOf("\napp.commandLine.appendSwitch",stateStart);
assert(main.slice(stateStart,stateEnd).includes("if (!nextVoiceConnected) {\n    voiceTaskbarInputResetPending = false;"),
  'Voice disconnect must clear pending taskbar reset');

// Critical regression: Electron main must not continuously inject JS while voice is active.
for(const forbidden of [
  "const delay = desktopState.voiceConnected ? 250 : 900",
  "await readDesktopState()",
  "window.__ycLastDesktopVoiceWake",
  "frame.contentWindow.postMessage({ type: 'yamachat:desktop-voice-wake'"
]) assert(!main.includes(forbidden),'Continuous main->renderer voice polling remains: '+forbidden);

assert(main.includes("handleClientIpc('yamachat:desktop-state-update'"),
  'Main process desktop state update IPC missing');
assert(preload.includes("updateDesktopState: (state) => ipcRenderer.invoke('yamachat:desktop-state-update'"),
  'Preload desktop state push bridge missing');
for(const marker of [
  'async function ycPushDesktopState(force = false)',
  "window.yamachatDesktop?.updateDesktopState?.(next)",
  "ycDesktopStatePushTimer = setInterval(() => void ycPushDesktopState(false), 350)",
  "if (!force && signature === ycDesktopStateLast) return false",
  'ycStartDesktopStatePush();'
]) assert(shell.includes(marker),'Renderer-side push state marker missing: '+marker);

console.log('PASS Windows taskbar restore: active voice arms one native hide/show/focus input reset on taskbar return, tray stays unchanged, and renderer/voice/stream are never reloaded.');
