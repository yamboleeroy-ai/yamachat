'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const EXE = path.join(__dirname, 'vendor', 'yt-dlp', 'yt-dlp.exe');
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_BODY = 16 * 1024;
const MAX_ACTIVE = 2;
const TIMEOUT_MS = 10 * 60 * 1000;
const LOCAL_PORT = Number(process.env.YAMACONVERT_PORT) || 4197;
const HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'tiktok.com',
  'instagram.com', 'facebook.com', 'fb.watch', 'vimeo.com',
  'dailymotion.com', 'x.com', 'twitter.com', 'reddit.com', 'redd.it', 'twitch.tv',
];
let active = 0;

function respond(res, status, payload) {
  if (res.headersSent) return;
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function parseUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('Vlož platný odkaz na veřejnou stránku s videem.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Podporované jsou jen veřejné HTTPS odkazy.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error('Tento odkaz není podporovaný.');
  }
  if (!HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error('Tuto stránku downloader zatím nepodporuje.');
  }
  return url;
}

function remove(dir) {
  return fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
}

function handler(req, res) {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && pathname === '/api/status') {
    respond(res, 200, { socialDownloads: true, maxBytes: MAX_BYTES });
    return true;
  }
  if (req.method !== 'POST' || pathname !== '/api/social-download') return false;
  const origin = req.headers.origin;
  const localOrigins = new Set([`http://127.0.0.1:${LOCAL_PORT}`, `http://localhost:${LOCAL_PORT}`]);
  if (origin && !localOrigins.has(origin)) {
    respond(res, 403, { error: 'Požadavek z jiné stránky není povolen.' });
    return true;
  }
  if (!fs.existsSync(EXE)) {
    respond(res, 503, { error: 'Lokální stahovací engine není nainstalovaný.' });
    return true;
  }

  let size = 0;
  let body = '';
  let oversized = false;
  req.setEncoding('utf8');
  req.on('data', chunk => {
    if (oversized) return;
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY) { oversized = true; body = ''; return; }
    body += chunk;
  });
  req.on('error', () => {});
  req.on('end', async () => {
    if (res.writableEnded) return;
    if (oversized) { respond(res, 413, { error: 'Požadavek je příliš dlouhý.' }); return; }
    let input;
    try { input = JSON.parse(body); }
    catch { respond(res, 400, { error: 'Neplatný požadavek.' }); return; }
    if (input.rightsConfirmed !== true) {
      respond(res, 400, { error: 'Potvrď, že máš právo obsah stáhnout.' });
      return;
    }
    let url;
    try { url = parseUrl(input.url); }
    catch (error) { respond(res, 400, { error: error.message }); return; }
    const requestedFormat = input.format;
    if (!['audio/mpeg', 'video/mp4', 'video/webm'].includes(requestedFormat)) {
      respond(res, 400, { error: 'Vyber výstup MP3, MP4 nebo WEBM.' });
      return;
    }
    if (active >= MAX_ACTIVE) {
      respond(res, 429, { error: 'Už probíhají dvě stahování. Počkej na dokončení.' });
      return;
    }

    active++;
    const dir = path.join(os.tmpdir(), `yamaconver-media-${crypto.randomUUID()}`);
    try { await fs.promises.mkdir(dir, { recursive: false }); }
    catch {
      active--;
      respond(res, 500, { error: 'Dočasný adresář se nepodařilo připravit.' });
      return;
    }

    const formatSelector = requestedFormat === 'audio/mpeg'
      ? 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio'
      : requestedFormat === 'video/webm'
        ? 'best[ext=webm]/best[ext=mp4]/best'
        : 'best[ext=mp4]/best[ext=webm]/best';
    const args = [
      '--no-config', '--no-cache-dir', '--no-playlist', '--no-progress', '--no-warnings',
      '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2',
      '--max-filesize', '100M', '--format', formatSelector,
      '--output', path.join(dir, 'source.%(ext)s'), '--print', 'after_move:filepath',
      '--remote-components', 'ejs:npm', '--js-runtimes', 'node', url.href,
    ];
    let settled = false;
    let timedOut = false;
    let streaming = false;
    let cleaned = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(EXE, args, {
      cwd: dir,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH || '',
        SYSTEMROOT: process.env.SYSTEMROOT || '',
        WINDIR: process.env.WINDIR || '',
        TEMP: dir,
        TMP: dir,
        HOME: dir,
        APPDATA: dir,
        USERPROFILE: dir,
      },
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000).unref();
    }, TIMEOUT_MS);
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timer);
      active = Math.max(0, active - 1);
      void remove(dir);
    }
    res.once('close', () => {
      if (res.writableEnded || settled) return;
      settled = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      cleanup();
    });
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-16000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-10000); });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      cleanup();
      respond(res, 500, { error: `Stahovací engine se nepodařilo spustit: ${error.message}` });
    });
    child.once('close', async code => {
      if (settled) return;
      settled = true;
      try {
        if (code !== 0) {
          const reason = timedOut
            ? 'Stahování překročilo časový limit 10 minut.'
            : /max-filesize|file is larger|filesize/i.test(stderr)
              ? 'Zdroj je větší než limit 100 MB.'
              : /requested format is not available/i.test(stderr)
                ? 'Stránka nenabízí samostatný MP3/MP4/WEBM soubor. Pro složení odděleného zvuku a videa je potřeba další místní převodní nástroj.'
              : 'Stránku se nepodařilo stáhnout. Může být nedostupná, změněná nebo chráněná přihlášením.';
          respond(res, timedOut ? 504 : 422, { error: reason });
          return;
        }
        const filepath = stdout.trim().split(/\r?\n/).pop();
        if (!filepath || path.dirname(path.resolve(filepath)) !== path.resolve(dir)) {
          respond(res, 500, { error: 'Stahovací engine nevrátil bezpečnou cestu k souboru.' });
          return;
        }
        const stat = await fs.promises.stat(filepath);
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) {
          respond(res, stat.size > MAX_BYTES ? 413 : 422, {
            error: stat.size > MAX_BYTES ? 'Stažený soubor překročil limit 100 MB.' : 'Stránka nevrátila použitelný videosoubor.',
          });
          return;
        }
        const ext = path.extname(filepath).slice(1).toLowerCase();
        if (!['mp4', 'webm', 'mkv', 'mov', 'm4v', 'mp3', 'm4a', 'opus', 'ogg', 'wav'].includes(ext)) {
          respond(res, 415, { error: 'Zdrojový formát se nepodařilo bezpečně předat převodníku.' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': ({ mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', wav: 'audio/wav' })[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="stazene-video.${ext}"`,
          'X-Yama-File-Extension': ext,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        const stream = fs.createReadStream(filepath);
        stream.once('error', () => { if (!res.destroyed) res.destroy(); });
        stream.once('close', cleanup);
        stream.pipe(res);
        streaming = true;
      } catch {
        respond(res, 500, { error: 'Při přípravě staženého souboru došlo k chybě.' });
      } finally {
        if (!streaming) cleanup();
      }
    });
  });
  return true;
}

module.exports = { handler };
