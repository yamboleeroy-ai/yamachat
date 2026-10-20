'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const { HOSTS, makeHandler, parseUrl } = require('../server.cjs');

test('URL validation accepts supported HTTPS domains and rejects unsafe targets', () => {
  assert.equal(parseUrl('https://youtu.be/abc').hostname, 'youtu.be');
  assert.equal(parseUrl('https://www.tiktok.com/@user/video/123').hostname, 'www.tiktok.com');
  assert.equal(parseUrl('https://soundcloud.com/artist/track').hostname, 'soundcloud.com');
  assert.equal(parseUrl('https://www.bilibili.com/video/BV123').hostname, 'www.bilibili.com');
  for (const domain of HOSTS) assert.equal(parseUrl(`https://${domain}/video`).hostname, domain, domain);
  for (const url of [
    'http://youtube.com/watch?v=abc',
    'https://youtube.com.evil.example/watch?v=abc',
    'https://127.0.0.1/private',
    'https://localhost/',
    'https://user:pass@youtube.com/watch?v=abc',
    'https://youtube.com:444/watch?v=abc',
    'https://example.com/video',
  ]) assert.throws(() => parseUrl(url), undefined, url);
});

async function request(handler, { method = 'GET', url = '/api/status', headers = {}, body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  const res = new PassThrough();
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.headers = {};
  res.writeHead = (statusCode, responseHeaders = {}) => {
    res.statusCode = statusCode;
    res.headers = Object.fromEntries(Object.entries(responseHeaders).map(([key, value]) => [key.toLowerCase(), value]));
    res.headersSent = true;
    return res;
  };
  const finished = once(res, 'finish');
  const operation = handler(req, res);
  if (body !== undefined) {
    req.emit('data', Buffer.from(body));
    req.emit('end');
  }
  await operation;
  await finished;
  return { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) };
}

const origin = 'https://yamachat.eu';
const env = { ALLOWED_ORIGINS: origin, SUPABASE_URL: 'https://auth.example.test', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
const authFetch = async (url, options) => {
  assert.equal(url, 'https://auth.example.test/auth/v1/user');
  assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.match(options.headers.authorization, /^Bearer /);
  return { ok: true, json: async () => ({ id: '12345678-1234-1234-1234-1234567890ab' }) };
};

test('status endpoint exposes the bounded service and reflects only the configured origin', async () => {
  const handler = makeHandler({ env, fetchImpl: authFetch });
  const response = await request(handler, { headers: { origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], origin);
  assert.deepEqual(JSON.parse(response.body), { socialDownloads: true, maxBytes: 100 * 1024 * 1024 });
  const denied = await request(handler, { headers: { origin: 'https://other.example' } });
  assert.equal(denied.status, 403);
});

test('download API requires Yamaportal authorization and a per-request rights confirmation', async () => {
  const handler = makeHandler({ env, fetchImpl: authFetch });
  const anonymous = await request(handler, {
    method: 'POST', url: '/api/social-download', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://youtu.be/abc', format: 'video/mp4', rightsConfirmed: true }),
  });
  assert.equal(anonymous.status, 401);
  const unchecked = await request(handler, {
    method: 'POST', url: '/api/social-download', headers: { origin, 'content-type': 'application/json', authorization: 'Bearer fake-access-token-12345678' },
    body: JSON.stringify({ url: 'https://youtu.be/abc', format: 'video/mp4' }),
  });
  assert.equal(unchecked.status, 400);
  assert.match(JSON.parse(unchecked.body).error, /Potvrď/);
});

test('download returns the converted bytes, preserves format selection, and removes temporary files', async () => {
  let spawnArgs;
  let workingDirectory;
  const spawnImpl = (_command, args, options) => {
    spawnArgs = args;
    workingDirectory = options.cwd;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(async () => {
      const file = path.join(options.cwd, 'source.mp4');
      await fs.writeFile(file, Buffer.from('test-video'));
      child.stdout.emit('data', Buffer.from(`${file}\n`));
      child.emit('close', 0);
    });
    return child;
  };
  const handler = makeHandler({ env, fetchImpl: authFetch, spawnImpl });
  const response = await request(handler, {
    method: 'POST', url: '/api/social-download', headers: { origin, 'content-type': 'application/json', authorization: 'Bearer fake-access-token-12345678' },
    body: JSON.stringify({ url: 'https://youtu.be/abc', format: 'video/mp4', rightsConfirmed: true }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'video/mp4');
  assert.equal(response.headers['access-control-allow-origin'], origin);
  assert.deepEqual(response.body, Buffer.from('test-video'));
  assert.ok(spawnArgs.includes('--no-playlist'));
  assert.ok(spawnArgs.includes('--max-filesize'));
  assert.ok(spawnArgs.includes('--remote-components'));
  assert.ok(spawnArgs.includes('ejs:npm'));
  assert.ok(spawnArgs.includes('--js-runtimes'));
  assert.ok(spawnArgs.includes('node'));
  assert.ok(spawnArgs.includes('bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'));
  await new Promise(resolve => setTimeout(resolve, 30));
  await assert.rejects(fs.access(workingDirectory));
});

test('download reports automated-access checks separately from private content', async () => {
  const spawnImpl = (_command, _args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      child.stderr.emit('data', Buffer.from("Sign in to confirm you're not a bot"));
      child.emit('close', 1);
    });
    return child;
  };
  const handler = makeHandler({ env, fetchImpl: authFetch, spawnImpl });
  const response = await request(handler, {
    method: 'POST', url: '/api/social-download', headers: { origin, 'content-type': 'application/json', authorization: 'Bearer fake-access-token-12345678' },
    body: JSON.stringify({ url: 'https://youtu.be/abc', format: 'video/mp4', rightsConfirmed: true }),
  });
  assert.equal(response.status, 422);
  assert.match(JSON.parse(response.body).error, /serveru.*kontrolou automatizovaného přístupu/i);
});

