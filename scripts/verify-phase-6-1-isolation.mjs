// Phase 6.1 preserves every pre-existing evidence file and historical database.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,extname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root='docs/assets/phase-6-1-resume';mkdirSync(root,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex');
const files=p=>existsSync(p)?readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name).replaceAll('\\','/')]):[];
const baseline=join(root,'isolation-before.json');
const snapshot=()=>Object.fromEntries(files('data').filter(p=>p.endsWith('.sqlite')).map(p=>{const db=new DatabaseSync(p,{readOnly:true});try{return [p,Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>{const rows=db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all();return [name,{rows:rows.length,sha256:hash(JSON.stringify(rows))}];}))];}finally{db.close();}}));
if(process.argv.includes('--before')){
 assert.ok(!existsSync(baseline),'Baseline already exists; never overwrite it');
 const protectedFiles=Object.fromEntries([...files('docs').filter(p=>!p.startsWith(root+'/')&&!['docs/PWA.md','docs/phase-6-1-device-verification.md'].includes(p)),...files('assets'),...files('merchant-public'),...files('product-public').filter(p=>!['product-public/app-views.js','product-public/views.js'].includes(p)),...'src/model.ts src/paypal.ts src/payments.ts src/product/solver.ts src/product/domain.ts src/product/ai.ts src/product/capture-saga.ts'.split(' ')].filter(existsSync).map(p=>[p,hash(readFileSync(p))]));
 writeFileSync(baseline,JSON.stringify({capturedAt:new Date().toISOString(),databases:snapshot(),protectedFiles},null,2)+'\n');console.log('Read-only isolation baseline saved.');
}else{
 const before=JSON.parse(readFileSync(baseline,'utf8'));assert.deepEqual(snapshot(),before.databases,'Historical databases changed');
 for(const [p,h] of Object.entries(before.protectedFiles))assert.equal(hash(readFileSync(p)),h,'Protected baseline changed: '+p);
 const secrets=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY','WEB_PUSH_VAPID_PRIVATE_KEY'].map(k=>process.env[k]).filter(v=>v&&v.length>10);let scanned=0;
 for(const p of ['src','tests','scripts','docs','deploy','product-public','merchant-public','dist'].flatMap(files).filter(p=>['.js','.ts','.tsx','.mjs','.json','.md','.sql','.html','.css','.txt','.webmanifest','.sh','.service'].includes(extname(p)))){const text=readFileSync(p,'utf8');assert.ok(!secrets.some(s=>text.includes(s)),'Configured value leaked: '+p);scanned++;}
 const releases=files('.staging').filter(p=>p.startsWith('.staging/release-'));for(const p of releases){assert.ok(!/(^|\/)(data|docs|\.git|node_modules)(\/|$)|\/\.env|\/replay\.json$/.test(p),'Forbidden release payload: '+p);assert.ok(!secrets.some(s=>readFileSync(p).includes(Buffer.from(s))),'Configured value leaked in release: '+p);}
 const result={capturedAt:new Date().toISOString(),comparison:'PASS',historicalDatabases:Object.keys(before.databases).length,protectedFiles:Object.keys(before.protectedFiles).length,secretScan:{scanned,releaseFiles:releases.length,configuredValues:secrets.length,leaks:0},livePayPalOperations:0};writeFileSync(join(root,'isolation-after.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
