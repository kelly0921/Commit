// Packaging only: the frozen legacy build expects a local replay receipt.
// A clean source checkout has no receipt; the marker never ships in dist.
import assert from 'node:assert/strict';
import {existsSync,lstatSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {auditBuild} from './audit-build.mjs';

const marker=Buffer.from('{"available":false,"localOnly":true}\n');

export function prepareBuildInput(root=process.cwd()){
  const directory=resolve(root,'product-public'),path=resolve(directory,'replay.json');
  assert.ok(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink(),'Invalid build input directory');
  if(existsSync(path)){
    assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'Invalid local replay input');
    return ()=>{}; // Never overwrite or remove an existing historical receipt.
  }
  writeFileSync(path,marker,{flag:'wx',mode:0o600});
  const created=lstatSync(path);
  return ()=>{
    if(!existsSync(path))return;
    const current=lstatSync(path);
    assert.ok(current.isFile()&&!current.isSymbolicLink()&&current.ino===created.ino&&readFileSync(path).equals(marker),'Build input changed; retained for review');
    unlinkSync(path);
  };
}

export function buildRelease(){
  const cleanup=prepareBuildInput();
  try{
    const build=spawnSync(process.execPath,['--run','build'],{stdio:'inherit'});
    assert.ok(!build.error&&build.status===0,'Product build failed');
    return auditBuild();
  }finally{cleanup();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{console.log(JSON.stringify({buildAudit:'PASS',...buildRelease()}));}
  catch{console.error('RENDER_RELEASE_BUILD_FAILED');process.exitCode=1;}
}
