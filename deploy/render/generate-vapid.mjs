import assert from 'node:assert/strict';
import {writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import webPush from 'web-push';

export function generateVapidFile(path){
  const target=resolve(path),parent=realpathSync(dirname(target));
  assert.ok(parent===resolve('.staging')||parent.startsWith(resolve('.staging')+'\\')||parent.startsWith(resolve('.staging')+'/'),'Use an ignored local staging directory');
  assert.ok(!existsSync(target),'Refusing overwrite/key rotation');
  const keys=webPush.generateVAPIDKeys();
  writeFileSync(target,'WEB_PUSH_VAPID_PUBLIC_KEY='+keys.publicKey+'\nWEB_PUSH_VAPID_PRIVATE_KEY='+keys.privateKey+'\n',{flag:'wx',mode:0o600});
  return target;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{assert.equal(process.argv.length,3,'Private output path required');generateVapidFile(process.argv[2]);console.log('VAPID pair written to the ignored private file. No key values emitted; copy directly into Render secret settings.');}
  catch{console.error('VAPID_GENERATION_REFUSED');process.exitCode=1;}
}
