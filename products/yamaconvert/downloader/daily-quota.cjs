'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DAILY_BYTES = 100 * 1024 * 1024;
const RESERVATION_TTL_MS = 30 * 60 * 1000;

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function resetAt(timestamp) {
  const next = new Date(timestamp);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function createDailyQuotaStore({ filePath, now = Date.now } = {}) {
  let state;
  let pending = Promise.resolve();

  const serialize = operation => {
    const result = pending.then(operation, operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };

  async function load() {
    if (state) return;
    if (!filePath) { state = { version: 1, days: [] }; return; }
    try {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (parsed?.version !== 1 || !Array.isArray(parsed.days)) throw new Error('Invalid quota ledger');
      state = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { version: 1, days: [] };
    }
  }

  async function persist() {
    if (!filePath) return;
    const directory = path.dirname(filePath);
    await fs.promises.mkdir(directory, { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
      try { await fs.promises.rename(temporary, filePath); }
      catch (error) {
        if (process.platform !== 'win32' || !['EEXIST', 'EPERM'].includes(error.code)) throw error;
        await fs.promises.copyFile(temporary, filePath);
      }
    } finally { await fs.promises.rm(temporary, { force: true }).catch(() => {}); }
  }

  function activeDay(userId, day) {
    let record = state.days.find(item => item.userId === userId && item.day === day);
    if (!record) {
      record = { userId, day, usedBytes: 0, reservations: [] };
      state.days.push(record);
    }
    return record;
  }

  function prune(timestamp) {
    const today = utcDay(timestamp);
    const yesterday = utcDay(timestamp - 24 * 60 * 60 * 1000);
    state.days = state.days.filter(item => item.day === today || item.day === yesterday);
    for (const record of state.days) {
      const active = [];
      for (const reservation of record.reservations) {
        if (reservation.expiresAt > timestamp) active.push(reservation);
        else record.usedBytes = Math.min(DAILY_BYTES, record.usedBytes + reservation.bytes);
      }
      record.reservations = active;
    }
  }

  function snapshot(userId, timestamp = now()) {
    const day = utcDay(timestamp);
    const record = state.days.find(item => item.userId === userId && item.day === day);
    const usedBytes = record?.usedBytes || 0;
    const reservedBytes = (record?.reservations || []).reduce((total, item) => total + item.bytes, 0);
    return {
      limitBytes: DAILY_BYTES,
      usedBytes,
      reservedBytes,
      remainingBytes: Math.max(0, DAILY_BYTES - usedBytes - reservedBytes),
      resetAt: resetAt(timestamp),
    };
  }

  return Object.freeze({
    get(userId) {
      return serialize(async () => {
        await load();
        const timestamp = now();
        prune(timestamp);
        await persist();
        return snapshot(userId, timestamp);
      });
    },
    reserve(userId, bytes) {
      return serialize(async () => {
        await load();
        const timestamp = now();
        prune(timestamp);
        if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > DAILY_BYTES) throw new Error('Invalid quota reservation');
        const record = activeDay(userId, utcDay(timestamp));
        const current = snapshot(userId, timestamp);
        if (bytes > current.remainingBytes) return { ok: false, quota: current };
        const id = crypto.randomUUID();
        record.reservations.push({ id, bytes, expiresAt: timestamp + RESERVATION_TTL_MS });
        await persist();
        return { ok: true, id, quota: snapshot(userId, timestamp) };
      });
    },
    settle(userId, id, transferredBytes) {
      return serialize(async () => {
        await load();
        const timestamp = now();
        prune(timestamp);
        if (!Number.isSafeInteger(transferredBytes) || transferredBytes < 0) throw new Error('Invalid transferred byte count');
        const record = state.days.find(item => item.userId === userId && item.reservations.some(reservation => reservation.id === id));
        if (!record) return false;
        const index = record.reservations.findIndex(reservation => reservation.id === id);
        const [reservation] = record.reservations.splice(index, 1);
        const consumed = Math.min(transferredBytes, reservation.bytes, Math.max(0, DAILY_BYTES - record.usedBytes));
        record.usedBytes += consumed;
        await persist();
        return true;
      });
    },
  });
}

module.exports = { DAILY_BYTES, createDailyQuotaStore, resetAt, utcDay };
