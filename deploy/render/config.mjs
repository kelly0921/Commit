import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {existsSync,lstatSync,realpathSync,readFileSync,chmodSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {requireStartup,startupStep} from './diagnostics.mjs';

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
  requireStartup(env.RENDER==='true','config','invalid_render_environment');
  requireStartup(env.NODE_ENV==='production','config','invalid_node_environment');requireStartup(env.COMMIT_STAGING==='true','config','invalid_staging_mode');
  requireStartup(env.PAYPAL_ENVIRONMENT==='sandbox','config','non_sandbox_payment_environment');requireStartup(env.AI_MODE==='openai','config','invalid_ai_mode');
  requireStartup(!env.ENABLE_SANDBOX_SAGA_NEGATIVE_TEST||env.ENABLE_SANDBOX_SAGA_NEGATIVE_TEST==='false','config','unsafe_negative_test_flag');
  requireStartup(env.DATABASE_PATH===DATABASE,'config','invalid_database_path');
  requireStartup(!env.PRODUCT_DATABASE_PATH||env.PRODUCT_DATABASE_PATH===DATABASE,'config','invalid_database_path');
  const platformHost=env.RENDER_EXTERNAL_HOSTNAME;
  requireStartup(typeof platformHost==='string'&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.onrender\.com$/.test(platformHost),'config','invalid_render_hostname');
  const origin=startupStep('config',()=>publicOrigin('https://'+platformHost).origin,'invalid_public_origin');
  const port=Number(env.PORT);requireStartup(Number.isInteger(port)&&port>0&&port<65536&&![3010,3011].includes(port),'config','invalid_port');
  for(const key of ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY'])requireStartup(env[key]?.trim(),'config','missing_required_env');
  for(const key of ['WEB_PUSH_ENABLED','STAGING_ACCESS_ENABLED'])requireStartup(env[key]===undefined||['true','false'].includes(env[key]),'config','invalid_capability_flag');
  const pushEnabled=env.WEB_PUSH_ENABLED==='true',accessEnabled=env.STAGING_ACCESS_ENABLED==='true';
  if(pushEnabled){
    requireStartup(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.WEB_PUSH_CONTACT??''),'config','invalid_push_contact');
    startupStep('config',()=>validateVapid(env.WEB_PUSH_VAPID_PUBLIC_KEY,env.WEB_PUSH_VAPID_PRIVATE_KEY),'invalid_vapid_config');
  }
  if(accessEnabled){
    requireStartup(/^[a-zA-Z0-9._-]{1,64}$/.test(env.STAGING_ACCESS_USERNAME??''),'config','invalid_access_user');
    requireStartup((env.STAGING_ACCESS_PASSWORD??'').length>=20,'config','invalid_access_password');
  }
  const keys=['OPENAI_API_KEY','OPENAI_MODEL','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_MERCHANT_ID','AG_STUDIO_LICENSE_KEY',...(pushEnabled?['WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_KEY','WEB_PUSH_CONTACT']:[])];
  const childEnv=Object.fromEntries(keys.filter(k=>env[k]).map(k=>[k,env[k]]));
  childEnv.WEB_PUSH_ENABLED=String(pushEnabled);
  return {root:DISK,database:DATABASE,port,bind:'0.0.0.0',consumerOrigin:origin,merchantOrigin:origin,consumerPort:3010,merchantPort:3011,platformHost,accessEnabled,accessUser:accessEnabled?env.STAGING_ACCESS_USERNAME:undefined,accessPassword:accessEnabled?env.STAGING_ACCESS_PASSWORD:undefined,pushEnabled,childEnv,aiMode:'openai',localVerification:false,shutdownMs:25000};
}

export function exactDisk(path,fs={realpathSync,lstatSync}){
  requireStartup(path===DISK,'storage','unsafe_storage_path');
  requireStartup(fs.realpathSync(path)===DISK,'storage','unsafe_storage_path');
  const stat=fs.lstatSync(path);requireStartup(stat.isDirectory()&&!stat.isSymbolicLink(),'storage','invalid_storage_resource');
}

export function guardStorage(config){
  if(config.localVerification){
    const prefix=resolve('.staging')+'/render-local-';
    assert.ok(resolve(config.root).replaceAll('\\','/').startsWith(prefix.replaceAll('\\','/')),'Local verification fixture only');
    assert.equal(realpathSync(config.root),resolve(config.root));assert.ok(!lstatSync(config.root).isSymbolicLink());
  }else{
    requireStartup(process.platform==='linux','storage','unsupported_platform');exactDisk(config.root);
    const mounts=readFileSync('/proc/self/mountinfo','utf8').split('\n').map(line=>line.split(' ')[4]?.replace(/\\040/g,' '));
    requireStartup(mounts.includes(DISK),'storage','disk_mount_not_detected');
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
