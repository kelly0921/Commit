// Runs after the unchanged build; never opens a database or calls a provider.
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync,lstatSync,unlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name).replaceAll('\\','/')]);
export function auditBuild(){
  const replay='dist/product-public/replay.json';
  if(existsSync(replay)){assert.ok(lstatSync(replay).isFile()&&!lstatSync(replay).isSymbolicLink());unlinkSync(replay);}
  const secrets=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY','WEB_PUSH_VAPID_PRIVATE_KEY','STAGING_ACCESS_PASSWORD','RENDER_API_KEY'].map(k=>process.env[k]).filter(v=>v&&v.length>10);
  const paths=files('dist').filter(path=>path!=='dist/render-build-manifest.json');
  for(const path of paths){
    assert.ok(!/\.sqlite(?:-|$)|\/payments\.json$|\/replay\.json$|(^|\/)(data|docs|\.env[^/]*)(\/|$)/.test(path),'Historical/private build payload forbidden');
    assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink());
    assert.ok(!secrets.some(s=>readFileSync(path).includes(Buffer.from(s))),'Configured secret in build');
  }
  const manifest=paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
  writeFileSync('dist/render-build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return {files:paths.length,historicalLedgers:0,configuredSecretLeaks:0};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/audit-build.mjs')){
  try{console.log(JSON.stringify({buildAudit:'PASS',...auditBuild()}));}catch{console.error('RENDER_BUILD_AUDIT_FAILED');process.exitCode=1;}
}
