// Invoke from a shell on the existing live Render instance, never a one-off job.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {connect} from 'node:net';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DISK,exactDisk} from './config.mjs';

export async function requestReset(){
  assert.equal(process.platform,'linux');assert.equal(process.env.RENDER,'true');exactDisk(DISK);
  const socketPath=join(DISK,'runtime','control.sock'),metadataPath=join(DISK,'runtime','launcher.json');
  for(const path of [socketPath,metadataPath]){
    const stat=lstatSync(path);assert.ok(!stat.isSymbolicLink());
    assert.equal(stat.mode&0o777,0o600,'Private operator control required');assert.equal(stat.uid,process.getuid(),'Same service account required');
  }
  assert.ok(lstatSync(socketPath).isSocket()&&lstatSync(metadataPath).isFile());
  const {runtimeId}=JSON.parse(readFileSync(metadataPath,'utf8'));
  assert.ok(typeof runtimeId==='string'&&runtimeId.length===36);
  const result=await new Promise((resolve,reject)=>{
    const socket=connect(socketPath);let reply='';socket.setTimeout(60000,()=>{socket.destroy();reject(Error('Reset timed out'));});
    socket.on('connect',()=>socket.write(JSON.stringify({command:'reset',confirm:'RESET_DISPOSABLE_STAGING',runtimeId})+'\n'));
    socket.on('data',chunk=>{reply+=chunk.toString();if(reply.length>2048)socket.destroy();});
    socket.on('error',reject);socket.on('end',()=>{try{resolve(JSON.parse(reply));}catch{reject(Error('Invalid reset reply'));}});
  });
  assert.equal(result.ok,true,'Reset refused or failed; ledger and private backups must be inspected');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{assert.deepEqual(process.argv.slice(2),['--reset-disposable-staging']);await requestReset();console.log('Fresh fictional staging restored. Private backup remains under the persistent disk. No provider operation performed.');}
  catch{console.error('RESET_REFUSED_OR_FAILED. No automatic provider cleanup; inspect the unchanged ledger/private backup.');process.exitCode=1;}
}
