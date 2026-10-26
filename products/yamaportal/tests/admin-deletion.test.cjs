const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'preview/dist/admin-ui.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, '../../supabase/functions/yamachat-snapshot-v11/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, '../../supabase/yamaportal-user-audit-account-delete.sql'), 'utf8');

test('account deletion is owner-only, typed, reasoned, audited and blocks linked ownership', () => {
  assert.match(ui, /data-user-delete/);
  assert.match(ui, /confirm_user_id:typed/);
  assert.match(ui, /reason:reason\.trim\(\)/);
  assert.match(edge, /action === 'delete-account'/);
  assert.match(edge, /action === 'role-audit' \|\| action === 'delete-account'/);
  assert.match(edge, /userId === actor\.id/);
  assert.match(edge, /targetRole !== 'USER'/);
  assert.match(edge, /owner_id', userId/);
  assert.match(edge, /admin\/user-servers/);
  assert.match(edge, /auth\.admin\.deleteUser\(userId\)/);
  assert.match(edge, /action: 'account-delete'/);
  assert.match(migration, /'account-delete'/);
  assert.doesNotMatch(migration, /target_user_id uuid[^,]*references/i);
});

test('server deletion is available only for offline worlds and requires exact name and durable audit', () => {
  assert.match(ui, /data-host-action="delete"/);
  assert.match(ui, /operation:'delete',server_name:serverName,confirmed:true,reason/);
  assert.match(ui, /server\.state==='offline'/);
  assert.match(ui, /smaže svět, jeho verze i cloudové zálohy/);
});

