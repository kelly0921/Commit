// Explicit allowlist. No data, .env, historical reports, evidence, Git or node_modules.
import {mkdirSync,cpSync,writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const dir='.staging/release-'+new Date().toISOString().replaceAll(':','-');mkdirSync(dir,{recursive:true});
for(const item of ['dist','package.json','package-lock.json','deploy/phase-6'])cpSync(item,join(dir,item),{recursive:true,filter:path=>!path.replaceAll('\\','/').endsWith('/replay.json')});
const list=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(join(p,e.name)):[join(p,e.name)]);
const entries=list(dir).map(p=>({path:p.slice(dir.length+1).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')}));writeFileSync(join(dir,'release-files.json'),JSON.stringify(entries,null,2)+'\n');console.log(dir);
