const fs=require('node:fs'),assert=require('node:assert/strict');
const main=fs.readFileSync('desktop/main.js','utf8');

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

// Keep the existing voice-safe background behavior. The fix must repair activation,
// not destroy/reload the renderer or disconnect live voice/stream state.
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

console.log('PASS Windows taskbar restore: native restore/show/focus and tray activation share input/focus recovery without renderer reload or media disconnect.');
