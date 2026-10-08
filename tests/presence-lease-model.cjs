const assert=require('node:assert/strict');

// Deterministic model of the shared user_presence row. It covers the values
// used by every generated client, independent of platform UI code.
const HEARTBEAT_MS=60_000;
const ACTIVE_LEASE_MS=120_000;
const STALE_MS=150_000;
const stateAt=(lastSeen,now,state='online')=>state==='offline'||now-lastSeen>STALE_MS?'offline':state;
const idleMayOverwriteActive=(lastSeen,now)=>now-lastSeen>=ACTIVE_LEASE_MS;

// A foreground client can have two delayed beats (timer throttling/network
// jitter) without being rendered offline on a one-minute social refresh.
for(let jitter=0;jitter<=29_000;jitter+=1_000){
  for(let now=0;now<=149_000;now+=1_000){
    const latestBeat=Math.floor(Math.max(0,now-jitter)/HEARTBEAT_MS)*HEARTBEAT_MS+jitter;
    assert.notEqual(stateAt(latestBeat,now),'offline','active client flickered offline with '+jitter+'ms jitter at '+now+'ms');
  }
}

// A silently disconnected client still ages out at a finite, exact boundary.
assert.equal(stateAt(0,STALE_MS),'online');
assert.equal(stateAt(0,STALE_MS+1),'offline');

// An AFK/minimized sibling must not clobber a live device's shared row. It may
// write AFK only after no device has refreshed within the bounded active lease.
for(let activeBeat=0;activeBeat<=360_000;activeBeat+=HEARTBEAT_MS){
  for(let siblingCheck=activeBeat;siblingCheck<activeBeat+ACTIVE_LEASE_MS;siblingCheck+=5_000)
    assert.equal(idleMayOverwriteActive(activeBeat,siblingCheck),false,'idle sibling clobbered active device');
}
assert.equal(idleMayOverwriteActive(0,ACTIVE_LEASE_MS),true);

console.log('PASS presence lease model: jitter-tolerant online state, bounded offline expiry, and multi-device AFK clobber prevention.');
