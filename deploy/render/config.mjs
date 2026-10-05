import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {existsSync,lstatSync,realpathSync,readFileSync,chmodSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

export const DISK='/var/data/commit';
export const DATABASE=DISK+'/staging.sqlite';
export const DATABASE_FILES=['staging.sqlite','staging.sqlite-wal','staging.sqlite-shm'];
export const CONSUMER_COOKIE='commit_demo_phase6';
export const MERCHANT_COOKIE='commit_merchant_phase6';

export function publicOrigin(value){
  const u=new URL(value);
  assert.equal(value,u.origin,'Exact public HTTPS origin required');
  assert.equal(u.protocol,'https:');
  assert.ok(!u.username&&!u.password&&!u.port);
  assert.ok(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(u.hostname)&&u.hostname.includes('.'));
  assert.ok(!/localhost|^127\.|^0\.|\.example$|\.invalid$|\.test$/.test(u.hostname));
  assert.ok(!/^\d+(?:\.\d+){3}$/.test(u.hostname),'Public DNS host required');
  return u;
}

export function validateVapid(publicKey,privateKey){
  assert.ok(/^[\w-]+$/.test(publicKey??'')&&/^[\w-]+$/.test(privateKey??''),'VAPID pair required');
  const pub=Buffer.from(publicKey,'base64url'),priv=Buffer.from(privateKey,'base64url');
  assert.equal(pub.length,65);assert.equal(priv.length,32);assert.equal(pub[0],4);
  const ec=createECDH('prime256v1');ec.setPrivateKey(priv);
  assert.ok(ec.getPublicKey().equals(pub),'VAPID keys must be a matched pair');
}

export function renderConfig(env){
  assert.equal(env.RENDER,'true','Render runtime required');
  assert.equal(env.NODE_ENV,'production');assert.equal(env.COMMIT_STAGING,'true');
  assert.equal(env.PAYPAL_ENVIRONMENT,'sandbox');assert.equal(env.AI_MODE,'openai');
  assert.ok(!env.ENABLE_SANDBOX_SAGA_NEGATIVE_TEST||env.ENABLE_SANDBOX_SAGA_NEGATIVE_TEST==='false');
  assert.equal(env.DATABASE_PATH,DATABASE,'Only fresh Render disk database allowed');
  assert.ok(!env.PRODUCT_DATABASE_PATH||env.PRODUCT_DATABASE_PATH===DATABASE);
  const platformHost=env.RENDER_EXTERNAL_HOSTNAME;
  assert.ok(typeof platformHost==='string'&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.onrender\.com$/.test(platformHost),'Render-provided hostname required');
  const origin=publicOrigin('https://'+platformHost).origin;
  const port=Number(env.PORT);assert.ok(Number.isInteger(port)&&port>0&&port<65536&&![3010,3011].includes(port));
  for(const key of ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY'])assert.ok(env[key]?.trim(),key+' required');
  for(const key of ['WEB_PUSH_ENABLED','STAGING_ACCESS_ENABLED'])assert.ok(env[key]===undefined||['true','false'].includes(env[key]),key+' must be true or false');
  const pushEnabled=env.WEB_PUSH_ENABLED==='true',accessEnabled=env.STAGING_ACCESS_ENABLED==='true';
  if(pushEnabled){
    assert.ok(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.WEB_PUSH_CONTACT??''));
    validateVapid(env.WEB_PUSH_VAPID_PUBLIC_KEY,env.WEB_PUSH_VAPID_PRIVATE_KEY);
  }
  if(accessEnabled){
    assert.ok(/^[a-zA-Z0-9._-]{1,64}$/.test(env.STAGING_ACCESS_USERNAME??''),'Staging access user required');
    assert.ok((env.STAGING_ACCESS_PASSWORD??'').length>=20,'Staging access secret must have at least 20 characters');
  }
  const keys=['OPENAI_API_KEY','OPENAI_MODEL','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_MERCHANT_ID','AG_STUDIO_LICENSE_KEY',...(pushEnabled?['WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_KEY','WEB_PUSH_CONTACT']:[])];
  const childEnv=Object.fromEntries(keys.filter(k=>env[k]).map(k=>[k,env[k]]));
  childEnv.WEB_PUSH_ENABLED=String(pushEnabled);
  return {root:DISK,database:DATABASE,port,bind:'0.0.0.0',consumerOrigin:origin,merchantOrigin:origin,consumerPort:3010,merchantPort:3011,platformHost,accessEnabled,accessUser:accessEnabled?env.STAGING_ACCESS_USERNAME:undefined,accessPassword:accessEnabled?env.STAGING_ACCESS_PASSWORD:undefined,pushEnabled,childEnv,aiMode:'openai',localVerification:false,shutdownMs:25000};
}

export function exactDisk(path,fs={realpathSync,lstatSync}){
  assert.equal(path,DISK,'Fixed Render disk only');
  assert.equal(fs.realpathSync(path),DISK,'Alternate/symlinked disk forbidden');
  const stat=fs.lstatSync(path);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());
}

export function guardStorage(config){
  if(config.localVerification){
    const prefix=resolve('.staging')+'/render-local-';
    assert.ok(resolve(config.root).replaceAll('\\','/').startsWith(prefix.replaceAll('\\','/')),'Local verification fixture only');
    assert.equal(realpathSync(config.root),resolve(config.root));assert.ok(!lstatSync(config.root).isSymbolicLink());
  }else{
    assert.equal(process.platform,'linux');exactDisk(config.root);
    const mounts=readFileSync('/proc/self/mountinfo','utf8').split('\n').map(line=>line.split(' ')[4]?.replace(/\\040/g,' '));
    assert.ok(mounts.includes(DISK),'Persistent disk must be mounted before runtime startup');
  }
  assert.equal(config.database,join(config.root,'staging.sqlite'));
  for(const name of DATABASE_FILES){const path=join(config.root,name);if(existsSync(path))assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'Unexpected database resource');}
}

export function prepareStorage(config){
  guardStorage(config);chmodSync(config.root,0o700);
  for(const name of ['runtime','tmp','backups']){
    const dir=join(config.root,name);if(!existsSync(dir))mkdirSync(dir,{mode:0o700});
    assert.equal(realpathSync(dir),resolve(dir));assert.ok(lstatSync(dir).isDirectory()&&!lstatSync(dir).isSymbolicLink());chmodSync(dir,0o700);
  }
}
