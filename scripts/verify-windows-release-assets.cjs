const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');

const directory = process.argv[2] || 'release-assets';
const read = (name) => fs.readFileSync(path.join(directory, name));
const version = require('../desktop/package.json').version;
assert.match(version, /^\d+\.\d+\.\d+$/, 'Desktop package version must be a release version');

const installerName = `Yamachat-Setup-${version}.exe`;
const latest = read('latest.yml').toString();
const installer = read(installerName);
assert.match(latest, new RegExp(`^version:\\s*${version.replace(/\./g, '\\.')}(?:\\s|$)`, 'm'));
const sha512 = crypto.createHash('sha512').update(installer).digest('base64');
assert(latest.includes(sha512), 'Installer must match updater sha512');
assert(fs.existsSync(path.join(directory, `${installerName}.blockmap`)), 'Blockmap is missing');
console.log('PASS Windows updater assets', version);
