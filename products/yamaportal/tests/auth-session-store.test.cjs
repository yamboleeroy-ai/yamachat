'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAuthSessionStore}=require('../desktop/auth-session-store.cjs');

test('Windows Portal keeps checked sessions encrypted and unchecked sessions in process memory only',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yamaportal-session-test-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())));
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('encrypted:'+value),decryptString:value=>String(value).replace(/^encrypted:/,'')};
  try{
    let store=createAuthSessionStore({userDataPath:directory,safeStorage});
    assert.equal(store.getRemember(),true);
    store.set('yamaportal-auth-v1','persistent-refresh-token');
    const encrypted=fs.readFileSync(path.join(directory,'yamaportal-auth-v1.encrypted'));
    assert.equal(String(encrypted),'encrypted:persistent-refresh-token');
    store.set('yamaportal-auth-v1-code-verifier','pkce');
    store.setRemember(false);
    assert.equal(store.getRemember(),false);
    assert.equal(store.get('yamaportal-auth-v1'),'persistent-refresh-token');
    assert.equal(store.get('yamaportal-auth-v1-code-verifier'),'pkce');
    assert.equal(fs.existsSync(path.join(directory,'yamaportal-auth-v1.encrypted')),false);
    store=null;
    store=createAuthSessionStore({userDataPath:directory,safeStorage});
    assert.equal(store.getRemember(),false);
    assert.equal(store.get('yamaportal-auth-v1'),null,'memory-only session does not survive app restart');
    store.set('yamaportal-auth-v1','temporary-session');
    assert.equal(fs.existsSync(path.join(directory,'yamaportal-auth-v1.encrypted')),false);
    store.setRemember(true);
    assert.equal(store.get('yamaportal-auth-v1'),'temporary-session');
    assert.equal(String(fs.readFileSync(path.join(directory,'yamaportal-auth-v1.encrypted'))),'encrypted:temporary-session');
    store.remove('yamaportal-auth-v1');
    assert.equal(store.get('yamaportal-auth-v1'),null);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Windows Portal rejects unknown auth keys and malformed session values',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yamaportal-session-invalid-'));
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>String(value)};
  try{
    const store=createAuthSessionStore({userDataPath:directory,safeStorage});
    assert.throws(()=>store.get('admin-token'),/Neplatné úložiště/);
    assert.throws(()=>store.set('yamaportal-auth-v1','x'.repeat(100001)),/Neplatná relace/);
    assert.throws(()=>store.setRemember('false'),/Neplatné nastavení/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
