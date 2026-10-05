import assert from 'node:assert/strict';
import {existsSync,lstatSync,realpathSync,mkdirSync,copyFileSync,unlinkSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ProductDatabase} from '../../dist/src/product/db.js';
import {guardStorage,prepareStorage,DATABASE_FILES} from './config.mjs';

export function initializeDatabase(config){
  prepareStorage(config);const fresh=!existsSync(config.database);
  const db=new ProductDatabase(config.database);
  try{
    assert.equal(db.get('SELECT MAX(version) AS version FROM schema_migrations').version,6);
    if(fresh){assert.equal(db.get('SELECT COUNT(*) AS n FROM commitments').n,0);assert.equal(db.get('SELECT COUNT(*) AS n FROM push_subscriptions').n,0);}
  }finally{db.close();}
  for(const name of DATABASE_FILES){const path=join(config.root,name);if(existsSync(path))chmodSync(path,0o600);}
  return {fresh,schemaVersion:6};
}

// Caller must stop both children first. No provider call and no HTTP reset route.
export function resetDatabase(config){
  guardStorage(config);assert.ok(existsSync(config.database),'Staging database missing');
  const check=new DatabaseSync(config.database,{readOnly:true});
  try{
    assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM commitments WHERE paypal_order_id IS NOT NULL OR paypal_authorization_id IS NOT NULL OR paypal_capture_id IS NOT NULL OR create_attempt_at IS NOT NULL OR authorize_attempt_at IS NOT NULL OR void_attempt_at IS NOT NULL OR pending_operation IS NOT NULL OR captured_cents>0 OR observed_capture_cents>0 OR state NOT IN ('NOT_STARTED','STALE')").get().n,0,'Provider-backed or attempted financial ledger cannot be reset');
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM payment_events').get().n,0,'Provider event ledger cannot be reset');
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM capture_sagas').get().n,0,'Capture ledger cannot be reset');
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM financial_steps').get().n,0,'Financial ledger cannot be reset');
  }finally{check.close();}
  const backupRoot=join(config.root,'backups');assert.equal(realpathSync(backupRoot),resolve(backupRoot));assert.ok(!lstatSync(backupRoot).isSymbolicLink());
  const backup=join(backupRoot,new Date().toISOString().replaceAll(':','-'));mkdirSync(backup,{mode:0o700});
  for(const name of DATABASE_FILES){const path=join(config.root,name);if(existsSync(path)){assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink());copyFileSync(path,join(backup,name));chmodSync(join(backup,name),0o600);}}
  guardStorage(config); // Recheck exact resolved paths before named-file removal.
  for(const name of DATABASE_FILES){const path=join(config.root,name);if(existsSync(path))unlinkSync(path);}
  initializeDatabase(config);
  return {backup};
}
