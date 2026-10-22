'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { DAILY_BYTES, createDailyQuotaStore } = require('../daily-quota.cjs');

test('daily byte quota reserves atomically and charges transferred bytes only', async () => {
  const store = createDailyQuotaStore();
  const user = 'account-1';
  const [first, second] = await Promise.all([
    store.reserve(user, DAILY_BYTES - 10),
    store.reserve(user, 20),
  ]);
  assert.equal([first, second].filter(item => item.ok).length, 1);
  const allowed = first.ok ? first : second;
  const denied = first.ok ? second : first;
  assert.equal(denied.ok, false);
  await store.settle(user, allowed.id, 37);
  const snapshot = await store.get(user);
  assert.equal(snapshot.usedBytes, 37);
  assert.equal(snapshot.reservedBytes, 0);
  assert.equal(snapshot.remainingBytes, DAILY_BYTES - 37);
});

test('production container packages the quota store and keeps its ledger on a volume', () => {
  const directory = path.resolve(__dirname, '..');
  const dockerfile = readFileSync(path.join(directory, 'Dockerfile'), 'utf8');
  const compose = readFileSync(path.join(directory, 'compose.yaml'), 'utf8');
  assert.match(dockerfile, /COPY server\.cjs daily-quota\.cjs supported-sites\.txt/);
  assert.match(compose, /YAMACONVERT_QUOTA_FILE: \/data\/daily-quota\.json/);
  assert.match(compose, /- quota_data:\/data/);
});

test('daily quota survives process restart and resets at UTC midnight', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamaconvert-quota-test-'));
  const filePath = path.join(directory, 'quota.json');
  let timestamp = Date.parse('2026-10-21T23:59:00.000Z');
  try {
    const beforeRestart = createDailyQuotaStore({ filePath, now: () => timestamp });
    const reservation = await beforeRestart.reserve('account-2', 1024);
    assert.equal(reservation.ok, true);
    await beforeRestart.settle('account-2', reservation.id, 512);

    const afterRestart = createDailyQuotaStore({ filePath, now: () => timestamp });
    assert.equal((await afterRestart.get('account-2')).usedBytes, 512);
    timestamp = Date.parse('2026-10-22T00:00:00.000Z');
    const reset = await afterRestart.get('account-2');
    assert.equal(reset.usedBytes, 0);
    assert.equal(reset.remainingBytes, DAILY_BYTES);
    assert.equal(reset.resetAt, '2026-10-23T00:00:00.000Z');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('abandoned reservations after a crash settle conservatively instead of freeing quota', async () => {
  let timestamp = Date.parse('2026-10-21T12:00:00.000Z');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamaconvert-quota-crash-'));
  const filePath = path.join(directory, 'quota.json');
  try {
    const store = createDailyQuotaStore({ filePath, now: () => timestamp });
    const reservation = await store.reserve('account-crash', 4096);
    assert.equal(reservation.ok, true);
    timestamp += 31 * 60 * 1000;
    const recovered = await createDailyQuotaStore({ filePath, now: () => timestamp }).get('account-crash');
    assert.equal(recovered.usedBytes, 4096);
    assert.equal(recovered.reservedBytes, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
