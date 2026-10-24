const assert = require('node:assert/strict');
const fs = require('node:fs');

const clients = [
  'index.html',
  'desktop/desktop-client.html',
  'products/yamaportal/preview/dist/modules/yamachat/index.html',
];

for (const file of clients) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /audio:\{restrictOwnAudio:false,suppressLocalAudioPlayback:false\}/, `${file} must capture audio from YamaSearch itself`);
  assert.match(source, /systemAudio:'include'/, `${file} must request system audio`);
  assert.match(source, /windowAudio:'system'/, `${file} must offer audio while a window is selected`);
  assert.doesNotMatch(source, /restrictOwnAudio:true/, `${file} must not filter another YamaSearch tab`);
}

console.log('Screen-share own-audio contract verified.');
