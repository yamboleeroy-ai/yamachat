import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {withVoiceHotPathCleanup} from '../scripts/voice-hot-path.mjs';

const clients = ['desktop/desktop-client.html', 'index.html'];
if (fs.existsSync(new URL('../mobile/www/index.html', import.meta.url))) clients.push('mobile/www/index.html');
for (const file of clients) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!match[2].trim()) continue;
    const result = spawnSync(process.execPath, ['--check', '--input-type=' + (match[1].includes('module') ? 'module' : 'commonjs')], {input: match[2], encoding: 'utf8'});
    assert.equal(result.status, 0, file + ': ' + result.stderr);
  }
  assert.equal(withVoiceHotPathCleanup(html), html, 'Transform must be idempotent');
  const functionLine = name => html.split('\n').find(line => line.startsWith('function ' + name + '('));
  let writes = 0, markup = '', text = '', presence = 'online';
  const avatar = {
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; writes++; },
    get textContent() { return text; },
    set textContent(value) { text = value; markup = ''; writes++; },
  };
  const box = {classList: {remove() {}, toggle() {}}, dataset: {}};
  const context = vm.createContext({
    $: id => id === 'voiceControls' ? box : id === 'voiceSelfAvatar' ? avatar : null,
    window: {}, voiceChannel: null, voiceMuted: false, voiceDeafened: false,
    profile: {username: 'A'}, myStats: {xp: 0}, voiceChannelDefs: [],
    ycOwnPresenceState: () => presence,
    rankAvatarHtml: (p, stats, cls, state) => `<span>${p.username}:${stats.xp}:${state}</span>`,
    initials: name => name.slice(0, 1), renderVoiceChannels() {},
  });
  vm.runInContext(functionLine('renderVoiceControls'), context);
  vm.runInContext('renderVoiceControls()', context);
  assert.equal(writes, 1);
  context.voiceMuted = true;
  for (let i = 0; i < 20; i++) vm.runInContext('renderVoiceControls()', context);
  assert.equal(writes, 1, 'Mute/repeated controls refresh must preserve the avatar node');
  presence = 'afk';
  vm.runInContext('renderVoiceControls()', context);
  assert.equal(writes, 2, 'Presence change must repaint');
  context.profile.username = 'B';
  context.myStats.xp = 100;
  vm.runInContext('renderVoiceControls()', context);
  assert.equal(markup, '<span>B:100:afk</span>');
  context.profile = null;
  vm.runInContext('renderVoiceControls();renderVoiceControls()', context);
  assert.equal(writes, 4, 'Guest fallback must also avoid duplicate writes');

  // Run the actual peer-close and room-leave functions with audio nodes whose
  // disconnect operations are observable, including a failing source node.
  for (const mode of ['peer', 'leave']) {
    const calls = [];
    const nodes = Object.fromEntries(['src', 'compressor', 'gain'].map(key => [key, {
      disconnect() { calls.push(key); if (key === 'src') throw new Error('already detached'); },
    }]));
    const cleanup = {
      console, $: () => null, user: {id: 'self'}, voiceChannel: null,
      voiceStream: null, voiceSessionId: '', voiceRouteMode: '',
      voicePeers: new Map(), voiceAudioNodes: new Map([['peer', nodes]]),
      voiceRemoteVadStops: new Map(), screenWatchTimers: new Map(),
      voicePresenceByChannel: {}, voiceChannelDefs: [],
      ycVoiceKeepMicDuringSwitch: false,
      window: {},
    };
    for (const name of ['voiceMissingSince', 'voiceScreenSenders', 'screenShareViewers',
      'screenWatchingByUser', 'screenWatchPendingByUser', 'remoteScreenStreams',
      'voiceScreenActiveByUser', 'voicePeerStates', 'voicePeerSessions',
      'voiceRelayCandidates', 'voiceIceGatherDone', 'voiceIceRestarted', 'voiceIceQueues']) cleanup[name] = new Map();
    for (const name of ['ycStopRemoteVoiceActivityDetector', 'ycClearScreenWatchTimer',
      'ycRemoveScreenAudioElement', 'ycSyncStreamViewer', 'renderVoiceChannels',
      'updateVoiceConnectionStatus', 'cleanupSoundboardVoice', 'stopVoiceParticipantSubscription',
      'renderVoiceControls', 'stopVoiceSignals']) cleanup[name] = () => {};
    cleanup.stopScreenShare = async () => {};
    const ctx = vm.createContext(cleanup);
    if (mode === 'peer') {
      vm.runInContext(functionLine('closeVoicePeer'), ctx);
      vm.runInContext("closeVoicePeer('peer')", ctx);
    } else {
      const start = html.indexOf('async function leaveVoiceChannel(');
      const end = html.indexOf('\nfunction cleanupVoiceRooms(', start);
      vm.runInContext(html.slice(start, end), ctx);
      await vm.runInContext('leaveVoiceChannel(true)', ctx);
    }
    assert.deepEqual(calls, ['src', 'compressor', 'gain'], mode + ' must release all nodes even if source disconnect fails');
    assert.equal(cleanup.voiceAudioNodes.size, 0);
  }
  console.log('PASS ' + file + ': stable avatar, changed avatar, peer and room audio cleanup');
}
