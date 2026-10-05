// Run as root on the staging VM; values must already be in this root-only file.
// The private VAPID key is generated directly into protected config, never stdout.
import {readFileSync,writeFileSync,statSync,lstatSync,realpathSync,renameSync,chmodSync} from 'node:fs';
import assert from 'node:assert/strict';
import webPush from 'web-push';
export function validateStaging(values){
 for(const key of ['PUBLIC_CONSUMER_ORIGIN','PUBLIC_MERCHANT_ORIGIN']){const u=new URL(values[key]);assert.equal(u.protocol,'https:',key+' requires HTTPS');assert.equal(u.origin,values[key],key+' must be an exact origin');assert.ok(!u.username&&!u.password&&!u.port&&!/localhost|127\.0\.0\.1|\.invalid$|\.example$|0\.0\.0\.0|\[::1\]/.test(u.hostname),key+' must be a public DNS host');}
 assert.notEqual(values.PUBLIC_CONSUMER_ORIGIN,values.PUBLIC_MERCHANT_ORIGIN,'Separate hosts required');
 assert.equal(values.PAYPAL_ENVIRONMENT,'sandbox','Sandbox only');
 assert.ok(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.WEB_PUSH_CONTACT??''),'Operational mailto contact required');
 for(const k of ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY'])assert.ok(values[k]?.trim(),k+' missing');
 assert.equal(values.AI_MODE,'openai','Real AI staging requires explicit openai mode');
 assert.ok(!values.PRODUCT_DATABASE_PATH||values.PRODUCT_DATABASE_PATH==='/var/lib/commit-staging/staging.sqlite','Only fresh staging DB allowed');
}
if(process.argv[1]?.endsWith('/configure-staging.mjs')||process.argv[1]?.endsWith('\\configure-staging.mjs')){
 assert.equal(process.platform,'linux','Host-only Linux command');assert.equal(process.getuid(),0,'Run as root');
 const path='/etc/commit-staging/runtime.env';assert.equal(realpathSync('/etc/commit-staging'),'/etc/commit-staging');assert.ok(!lstatSync(path).isSymbolicLink());const stat=statSync(path);assert.equal(stat.uid,0);assert.equal(stat.mode&0o777,0o600,'Config must be root-owned 0600');
 const content=readFileSync(path,'utf8');validateStaging(process.env);
 assert.ok(!process.env.WEB_PUSH_VAPID_PUBLIC_KEY&&!process.env.WEB_PUSH_VAPID_PRIVATE_KEY,'Existing keys require deliberate rotation; refusing overwrite');
 const keys=webPush.generateVAPIDKeys(),next=path+'.next';writeFileSync(next,content.replace(/^WEB_PUSH_VAPID_(PUBLIC|PRIVATE)_KEY=.*\r?\n?/gm,'')+`\nWEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}\n`,{flag:'wx',mode:0o600});chmodSync(next,0o600);renameSync(next,path);console.log('Staging configuration validated; protected VAPID pair generated. No key values emitted.');
}
