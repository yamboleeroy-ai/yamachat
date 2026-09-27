const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(p,'utf8');
const main=read('desktop/main.js');
const preload=read('desktop/preload.js');
const shell=read('desktop/desktop.html');
const client=read('desktop/desktop-client.html');
const helper=read('windows/process-audio/ProcessAudioCapture.cpp');
const pkg=JSON.parse(read('desktop/package.json'));

assert(main.includes("const { execFile, spawn } = require('child_process')"),'desktop main does not spawn native process-audio helper');
assert(main.includes("function parseDesktopWindowHandle(sourceId)"),'desktop source HWND parser missing');
assert(main.includes("String(source.id || '').startsWith('window:')"),'window source detection missing');
assert(!main.includes("audio: 'loopback'"),'capture must not use unfiltered system loopback');
assert(main.includes("['--hwnd', selection.windowHandle]"),'native process-audio helper is not started from selected HWND');
assert(main.includes("'yamachat:process-audio-start'"),'process-audio start IPC missing');
assert(main.includes("'yamachat:process-audio-stop'"),'process-audio stop IPC missing');
assert(main.includes("'yamachat:process-audio-chunk'"),'process-audio PCM forwarding missing');

assert(preload.includes('startProcessAudioCapture'), 'preload startProcessAudioCapture bridge missing');
assert(preload.includes('stopProcessAudioCapture'), 'preload stopProcessAudioCapture bridge missing');
assert(preload.includes('onProcessAudioChunk'), 'preload PCM event bridge missing');

assert(shell.includes('window.YamachatDesktopProcessAudio = Object.freeze({'),'desktop process-audio shell bridge missing');
assert(shell.includes('createMediaStreamDestination()'),'Web Audio MediaStream destination missing');
assert(shell.includes('createBuffer(2, frames, sampleRate)'),'PCM -> Web Audio buffer conversion missing');
assert(shell.includes('return { ...result, track: ycProcessAudioTrack }'),'process-only MediaStreamTrack is not returned to stream client');

assert(client.includes('async function ycPrepareDesktopProcessAudio(stream)'), 'generated desktop client process-audio attach helper missing');
assert(client.includes("window.__ycDesktopProcessAudioMode='process'"),'generated desktop client does not mark process-only audio mode');
assert(client.includes('stream.addTrack(result.track)'), 'generated desktop client does not attach process-only audio track');
assert(client.includes('await ycStopDesktopProcessAudio()'), 'generated desktop client does not stop native audio with stream');

assert(helper.includes('AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK'),'native helper is not using process loopback activation');
assert(helper.includes('PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE'),'native helper is not restricted to target process tree');
assert(helper.includes('PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE'),'screen capture must exclude Yamachat tree');
assert(main.includes("['--exclude-pid', String(process.pid)]"),'exclusion must use root Electron PID');
assert(helper.includes('GetWindowThreadProcessId'),'native helper does not resolve selected HWND to PID');
assert(helper.includes('AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM'),'native helper PCM conversion missing');

assert(pkg.build.files.includes('process-audio/**/*'),'desktop package does not include native process-audio helper');

console.log('PASS Windows app-only stream audio architecture: selected window -> HWND/PID -> process loopback -> PCM -> dedicated MediaStreamTrack; no window-share system-loopback fallback.');
