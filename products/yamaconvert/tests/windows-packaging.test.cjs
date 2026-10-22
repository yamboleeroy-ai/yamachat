'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', '..');
const windows = path.join(root, 'products', 'yamaconvert', 'windows');

test('Windows app, EXE, installer and shortcuts use the YamaConvert logo', () => {
  const main = fs.readFileSync(path.join(windows, 'main.cjs'), 'utf8');
  const installer = fs.readFileSync(path.join(windows, 'YamaConvert.iss'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'yamaconvert-windows-release.yml'), 'utf8');
  const iconPath = path.join(windows, 'icons', 'yamaconvert.ico');
  assert.match(main, /setAppUserModelId\('eu\.yamachat\.yamaconvert'\)/);
  assert.match(main, /icon: fs\.existsSync\(appIcon\) \? appIcon : undefined/);
  assert.match(installer, /SetupIconFile=.*yamaconvert\.ico/);
  assert.match(installer, /IconFilename:.*yamaconvert\.ico/);
  assert.match(workflow, /resources\\app\\icons\\yamaconvert\.ico/);
  assert.match(workflow, /electron\/rcedit\/releases\/download\/v2\.0\.0\/rcedit-x64\.exe/);
  assert.match(workflow, /--set-icon \(Join-Path \$appDir 'icons\\yamaconvert\.ico'\)/);
  assert.match(workflow, /3E7801DB1A5EDBEC91B49A24A094AAD776CB4515488EA5A4CA2289C400EADE2A/);
  assert.ok(fs.existsSync(iconPath), 'Windows icon asset must exist in the packaged app');
  const icon = fs.readFileSync(iconPath);
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4);
  const sizes = new Set();
  for (let index = 0; index < count; index++) {
    const width = icon[6 + index * 16] || 256;
    const height = icon[7 + index * 16] || 256;
    assert.equal(width, height);
    sizes.add(width);
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256]) assert.ok(sizes.has(size), `missing ${size}px icon`);
});
