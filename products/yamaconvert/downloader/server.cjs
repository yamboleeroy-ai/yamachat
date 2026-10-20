'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_BODY = 16 * 1024;
const MAX_ACTIVE = 2;
const DAILY_LIMIT = 10;
const TIMEOUT_MS = 10 * 60 * 1000;
const HOSTS = fs.readFileSync(path.join(__dirname, 'supported-sites.txt'), 'utf8')
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));

function parseUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('Vlož platný odkaz na veřejný příspěvek.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password ||
      !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error('Podporované jsou jen veřejné HTTPS odkazy bez přihlašovacích údajů.');
  }
  if (!HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error('Tento web downloader zatím nepodporuje.');
  }
  return url;
}

function send(res, status, payload, origin) {
  if (res.headersSent || res.destroyed) return;
  const body = Buffer.from(JSON.stringify(payload));
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(body);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = Number(req.headers['content-length']) > MAX_BODY;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) oversized = true;
      else if (!oversized) chunks.push(chunk);
    });
    req.once('error', () => reject(Object.assign(new Error('Požadavek se nepodařilo přečíst.'), { status: 400 })));
    req.once('end', () => {
      if (oversized) { reject(Object.assign(new Error('Požadavek je příliš dlouhý.'), { status: 413 })); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Požadavek nemá platný JSON.'), { status: 400 })); }
    });
  });
}

async function verifyUser(token, env, fetchImpl) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw Object.assign(new Error('Přihlášení stahovací služby není nastavené.'), { status: 503 });
  }
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) throw Object.assign(new Error('Přihlas se znovu přes Yamaportal.'), { status: 401 });
    const user = await response.json();
    if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) {
      throw Object.assign(new Error('Účet Yamaportal se nepodařilo ověřit.'), { status: 401 });
    }
    return user.id;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('Ověření účtu Yamaportal se nepodařilo.'), { status: 503 });
  } finally { clearTimeout(timer); }
}

function makeHandler({ env = process.env, fetchImpl = fetch, spawnImpl = spawn } = {}) {
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  const activeUsers = new Set();
  const activeRequests = new Set();
  const dailyUse = new Map();

  async function handle(req, res) {
    const origin = req.headers.origin || '';
    const allowedOrigin = allowedOrigins.has(origin) ? origin : '';
    if (req.method === 'OPTIONS') {
      if (!allowedOrigin) { res.writeHead(403); res.end(); return; }
      res.writeHead(204, {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      });
      res.end();
      return;
    }
    if (!allowedOrigin) { send(res, 403, { error: 'Požadavek z této stránky není povolen.' }); return; }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/api/status') {
      const ready = Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
      send(res, 200, { socialDownloads: ready, maxBytes: MAX_BYTES }, allowedOrigin);
      return;
    }
    if (req.method !== 'POST' || pathname !== '/api/social-download') {
      send(res, 404, { error: 'Požadovaná funkce nebyla nalezena.' }, allowedOrigin);
      return;
    }

    const bearer = /^Bearer ([^\s]{20,8192})$/.exec(req.headers.authorization || '');
    if (!bearer) { send(res, 401, { error: 'Přihlas se přes Yamaportal.' }, allowedOrigin); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      send(res, 415, { error: 'Požadavek musí mít formát JSON.' }, allowedOrigin);
      return;
    }

    let input;
    try { input = await readJson(req); }
    catch (error) { send(res, error.status || 400, { error: error.message }, allowedOrigin); return; }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      send(res, 400, { error: 'Požadavek nemá platný formát.' }, allowedOrigin);
      return;
    }
    if (input.rightsConfirmed !== true) {
      send(res, 400, { error: 'Potvrď, že máš právo tento obsah stáhnout nebo použít.' }, allowedOrigin);
      return;
    }
    let url;
    try { url = parseUrl(input.url); }
    catch (error) { send(res, 400, { error: error.message }, allowedOrigin); return; }
    const requestedFormat = input.format;
    if (!['audio/mpeg', 'video/mp4', 'video/webm'].includes(requestedFormat)) {
      send(res, 400, { error: 'Vyber výstup MP3, MP4 nebo WEBM.' }, allowedOrigin);
      return;
    }

    let userId;
    try { userId = await verifyUser(bearer[1], env, fetchImpl); }
    catch (error) { send(res, error.status || 503, { error: error.message }, allowedOrigin); return; }
    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;
    const usage = (dailyUse.get(userId) || []).filter(item => item > windowStart);
    dailyUse.set(userId, usage);
    if (activeUsers.has(userId)) { send(res, 429, { error: 'Už pro tebe probíhá jedno stahování.' }, allowedOrigin); return; }
    if (activeRequests.size >= MAX_ACTIVE) { send(res, 429, { error: 'Stahovací služba je vytížená. Zkus to později.' }, allowedOrigin); return; }
    if (usage.length >= DAILY_LIMIT) { send(res, 429, { error: 'Dosáhl jsi denního limitu 10 stažení.' }, allowedOrigin); return; }

    const id = crypto.randomUUID();
    const dir = path.join(os.tmpdir(), `yamaconvert-${id}`);
    try { await fs.promises.mkdir(dir, { recursive: false, mode: 0o700 }); }
    catch { send(res, 500, { error: 'Dočasný adresář se nepodařilo připravit.' }, allowedOrigin); return; }
    activeUsers.add(userId);
    activeRequests.add(id);
    usage.push(now);
    dailyUse.set(userId, usage);

    const isAudio = requestedFormat === 'audio/mpeg';
    const selector = isAudio
      ? 'bestaudio/best'
      : requestedFormat === 'video/webm'
        ? 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best'
        : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    const args = [
      '--no-config', '--no-cache-dir', '--no-playlist', '--no-progress', '--no-warnings',
      '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1', '--concurrent-fragments', '4',
      '--max-filesize', '100M', '--format', selector,
      '--output', path.join(dir, 'source.%(ext)s'), '--print', 'after_move:filepath',
      '--remote-components', 'ejs:npm', '--js-runtimes', 'node',
    ];
    if (isAudio) args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '5');
    else args.push('--merge-output-format', requestedFormat === 'video/webm' ? 'webm' : 'mp4');
    args.push(url.href);

    let completed = false;
    let child;
    let stdout = '';
    let stderr = '';
    let timer;
    let sizeTimer;
    let timedOut = false;
    let downloadTooLarge = false;
    const cleanup = async () => {
      clearTimeout(timer);
      clearInterval(sizeTimer);
      activeUsers.delete(userId);
      activeRequests.delete(id);
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    };
    const abort = () => {
      if (completed) return;
      completed = true;
      child?.kill('SIGTERM');
      setTimeout(() => child?.kill('SIGKILL'), 2500).unref();
      void cleanup();
    };
    req.on('aborted', abort);
    res.on('close', () => { if (!res.writableEnded) abort(); });
    try {
      child = spawnImpl('yt-dlp', args, {
        cwd: dir,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: dir, TMPDIR: dir },
      });
    } catch {
      completed = true;
      await cleanup();
      send(res, 503, { error: 'Stahovací engine se nepodařilo spustit.' }, allowedOrigin);
      return;
    }
    timer = setTimeout(() => {
      if (completed) return;
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2500).unref();
    }, TIMEOUT_MS);
    sizeTimer = setInterval(async () => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        let total = 0;
        for (const entry of entries) if (entry.isFile()) total += (await fs.promises.stat(path.join(dir, entry.name))).size;
        if (total > MAX_BYTES) { downloadTooLarge = true; child.kill('SIGTERM'); }
      } catch {}
    }, 500);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-4000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
    child.once('error', async () => {
      if (completed) return;
      completed = true;
      await cleanup();
      send(res, 503, { error: 'Stahovací engine není dostupný.' }, allowedOrigin);
    });
    child.once('close', async code => {
      if (completed) return;
      completed = true;
      try {
        if (code !== 0) {
          const reason = timedOut
            ? 'Stahování překročilo časový limit 10 minut.'
            : downloadTooLarge || /max-filesize|file is larger|filesize/i.test(stderr)
            ? 'Zdroj je větší než limit 100 MB.'
            : /requested format is not available/i.test(stderr)
              ? 'Stránka nenabízí požadovaný formát.'
              : /sign in to confirm.*not a bot|confirm you.re not a bot|not a bot|captcha/i.test(stderr)
                ? 'YouTube nebo cílová platforma blokuje požadavek stahovacího serveru kontrolou automatizovaného přístupu. Stránku můžeš otevřít v její aplikaci; server tuto kontrolu nepřekonává.'
              : /sign in|login|required|private|members.only/i.test(stderr)
                ? 'Tento obsah vyžaduje přihlášení nebo není veřejný.'
                : 'Stránku se nepodařilo zpracovat. Může být nedostupná, změněná nebo chráněná.';
          send(res, timedOut ? 504 : 422, { error: reason }, allowedOrigin);
          return;
        }
        const filepath = stdout.trim().split(/\r?\n/).pop();
        if (!filepath || path.dirname(path.resolve(filepath)) !== path.resolve(dir)) {
          send(res, 500, { error: 'Stahovací engine nevrátil bezpečnou cestu k souboru.' }, allowedOrigin);
          return;
        }
        const stat = await fs.promises.stat(filepath);
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) {
          send(res, stat.size > MAX_BYTES ? 413 : 422, {
            error: stat.size > MAX_BYTES ? 'Stažený soubor překročil limit 100 MB.' : 'Stránka nevrátila použitelný soubor.',
          }, allowedOrigin);
          return;
        }
        const ext = path.extname(filepath).slice(1).toLowerCase();
        const allowedExtensions = isAudio ? ['mp3'] : ['mp4', 'm4v', 'webm', 'mkv', 'mov'];
        if (!allowedExtensions.includes(ext)) {
          send(res, 415, { error: 'Zdrojový formát se nepodařilo bezpečně předat převodníku.' }, allowedOrigin);
          return;
        }
        const mime = ({ mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', mp3: 'audio/mpeg' })[ext];
        res.writeHead(200, {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Expose-Headers': 'X-Yama-File-Extension',
          'Vary': 'Origin',
          'Content-Type': mime,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="yamaconvert.${isAudio ? 'mp3' : requestedFormat === 'video/webm' ? 'webm' : 'mp4'}"`,
          'X-Yama-File-Extension': isAudio ? 'mp3' : ext,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        const stream = fs.createReadStream(filepath);
        stream.once('error', () => { if (!res.destroyed) res.destroy(); });
        stream.once('close', () => { void cleanup(); });
        stream.pipe(res);
      } catch {
        send(res, 500, { error: 'Při přípravě staženého souboru došlo k chybě.' }, allowedOrigin);
      } finally {
        if (!res.headersSent || res.statusCode !== 200) await cleanup();
      }
    });
  }
  return handle;
}

function createServer(options) {
  const handler = makeHandler(options);
  return http.createServer((req, res) => { void handler(req, res); });
}

if (require.main === module) {
  const env = process.env;
  const handler = makeHandler({ env });
  const server = http.createServer((req, res) => { void handler(req, res); });
  const port = Number(env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => process.stdout.write(`YamaConvert downloader listening on ${port}\n`));
}

module.exports = { DAILY_LIMIT, HOSTS, MAX_BYTES, MAX_ACTIVE, makeHandler, parseUrl };

