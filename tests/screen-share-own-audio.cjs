const assert = require('node:assert/strict');
const fs = require('node:fs');

const browserClients = [
  'index.html',
  'products/yamaportal/preview/dist/modules/yamachat/index.html',
];

for (const file of browserClients) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /audio:\{restrictOwnAudio:false,suppressLocalAudioPlayback:false\}/, `${file} must capture audio from YamaSearch itself`);
  assert.match(source, /systemAudio:'include'/, `${file} must request system audio`);
  assert.match(source, /windowAudio:'system'/, `${file} must offer audio while a window is selected`);
  assert.doesNotMatch(source, /restrictOwnAudio:true/, `${file} must not filter another YamaSearch tab`);
}

const desktop = fs.readFileSync('desktop/desktop-client.html', 'utf8');
assert.match(desktop, /audio:\{restrictOwnAudio:true\}/, 'desktop must exclude Yamachat voice from its separate native process-audio track');
assert.match(desktop, /windowAudio:'system'/, 'desktop must request window audio selection');

console.log('Screen-share own-audio contract verified.');
