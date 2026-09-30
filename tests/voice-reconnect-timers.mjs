import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

for (const file of ['desktop/desktop-client.html', 'index.html', 'mobile/www/index.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const source = html.split('\n').find(line => line.startsWith('function voicePeer(peerId)'));
  for (const event of ['connection', 'ice']) for (const outcome of ['failed', 'recovered', 'replaced', 'removed']) {
    const timers = [], restarted = [];
    const ctx = {
      console, voiceIceServers: [], voiceStream: null, screenAudioMixedTrack: null,
      screenShareStream: null, screenShareActive: false,
      RTCPeerConnection: class {
        connectionState = 'new'; iceConnectionState = 'new';
        addTransceiver() { return {sender: {}}; }
        addEventListener() {}
      },
      setTimeout(fn, delay) { timers.push({fn, delay}); },
      restartVoicePeer(id) { restarted.push(id); },
      updateVoiceConnectionStatus() {}, ycTuneMicPc() {},
    };
    for (const name of ['voicePeers', 'voiceScreenSenders', 'screenShareViewers', 'voicePeerStates',
      'voiceIceRestarted', 'voiceMissingSince', 'voiceRelayCandidates', 'voiceIceGatherDone']) {
      ctx[name] = ['voicePeers', 'voiceScreenSenders', 'voicePeerStates', 'voiceMissingSince'].includes(name) ? new Map() : new Set();
    }
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    const pc = vm.runInContext("voicePeer('peer')", ctx);
    if (event === 'connection') { pc.connectionState = 'failed'; pc.onconnectionstatechange(); }
    else { pc.iceConnectionState = 'failed'; pc.oniceconnectionstatechange(); }
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 350, 'Recovery delay must stay unchanged');
    if (outcome === 'recovered') { pc.connectionState = 'connected'; pc.iceConnectionState = 'connected'; }
    if (outcome === 'replaced') ctx.voicePeers.set('peer', {});
    if (outcome === 'removed') ctx.voicePeers.delete('peer');
    timers[0].fn();
    assert.deepEqual(restarted, outcome === 'failed' ? ['peer'] : [], event + '/' + outcome);
  }
  console.log('PASS ' + file + ': both reconnect timers restart only the current failed peer (8 cases)');
}
