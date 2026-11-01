const assert = require('node:assert/strict');
const fs = require('node:fs');

const relay = fs.readFileSync('products/yamasearch/WebViewAudioRelay.cs', 'utf8');
const project = fs.readFileSync('products/yamasearch/YamaSearch.csproj', 'utf8');
const main = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');

assert.match(main, /StartWebViewAudioRelay\(\(int\)core\.BrowserProcessId\)/, 'relay must target the actual WebView2 browser process tree');
assert.match(relay, /--pid \{_browserPid\}/, 'native process-loopback helper must capture the WebView2 tree');
assert.match(relay, /new WaveFormat\(48000, 16, 2\)/, 'relay PCM format must match the native helper');
assert.match(relay, /session\.SimpleAudioVolume\.Volume = 0f/, 'original WebView2 output must be silenced without setting user mute state');
assert.match(relay, /if \(!_captureReady\) return;/, 'WebView2 output must never be silenced before native capture is ready');
assert.match(relay, /_capture\.Exited[\s\S]*RestoreSourceMute/, 'source volume must be restored if native capture exits');
assert.match(relay, /_sourceVolumes\.TryGetValue[\s\S]*Volume = volume/, 'original session volumes must be restored');
assert.match(project, /YamaSearch\.ProcessAudioCapture\.exe/, 'native helper must ship with YamaSearch');

console.log('YamaSearch Discord process-audio relay contract verified.');
