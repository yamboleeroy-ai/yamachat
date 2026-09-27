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
  "function repairVoiceTaskbarActivation(win, reason = 'taskbar-focus')",
  "repairVoiceTaskbarActivation(win, 'taskbar-focus')",
  "if (typeof win.setEnabled === 'function') win.setEnabled(true)",
  "win.show();\n      win.focus();",
  "restoreMainWindowInteractivity(win, reason + '-settled')",
  "restoreMainWindowInteractivity(win, reason + '-final')",
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

const taskbarRepairStart=main.indexOf("function repairVoiceTaskbarActivation");
const taskbarRepairEnd=main.indexOf("\nfunction showMainWindow()",taskbarRepairStart);
assert(taskbarRepairStart>=0&&taskbarRepairEnd>taskbarRepairStart,'Voice taskbar activation repair boundary missing');
const taskbarRepair=main.slice(taskbarRepairStart,taskbarRepairEnd);
assert(taskbarRepair.includes("!desktopState.voiceConnected"),'Taskbar repair must stay scoped to active voice');
assert(taskbarRepair.includes("!win.isFocused()"),'Delayed taskbar repair must not steal focus after the user leaves Yamachat');
assert(taskbarRepair.includes("setTimeout(() =>"),'Taskbar repair must run after native Windows activation settles');
assert(taskbarRepair.includes("}, 120);"),'Taskbar repair needs a final compositor/input hand-off pass');
for(const forbidden of ['reload(','reloadIgnoringCache','leaveVoiceChannel','stopProcessAudioCapture','destroy()','win.hide()'])
  assert(!taskbarRepair.includes(forbidden),'Taskbar repair must preserve live renderer/voice/stream state: '+forbidden);

console.log('PASS Windows taskbar restore: active voice gets a delayed native show/focus/input repair matching the working tray path, without reload or media disconnect.');
