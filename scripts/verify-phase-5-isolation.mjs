import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,extname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const hash=x=>createHash('sha256').update(x).digest('hex').toUpperCase(),old=JSON.parse(readFileSync('data/phase-4-baseline.json','utf8'));
const required=Object.keys(old).filter(p=>p.startsWith('docs\\')&&!['docs\\PRD.md','docs\\ARCHITECTURE.md','docs\\BUILD_PLAN.md'].includes(p)||['src\\product\\solver.ts','src\\product\\capture-saga.ts','src\\paypal.ts','src\\product\\seed.ts','src\\product\\migration-2.sql','src\\product\\migration-3.sql','src\\product\\migration-4.sql'].includes(p));
const changed=required.filter(p=>hash(readFileSync(p))!==old[p]);assert.deepEqual(changed,[],'Protected historical/solver/saga files changed');
const db=new DatabaseSync(process.env.PRODUCT_DATABASE_PATH??resolve('data/commit.sqlite'),{readOnly:true});
const path='data/phase5-financial-baseline.json';
const current={sagas:db.prepare('SELECT * FROM capture_sagas ORDER BY id').all(),steps:db.prepare('SELECT * FROM financial_steps ORDER BY id').all()};
if(!existsSync(path))writeFileSync(path,JSON.stringify(current,null,2));const baseline=JSON.parse(readFileSync(path,'utf8'));
assert.equal(hash(JSON.stringify(current.sagas.filter(r=>baseline.sagas.some(b=>b.id===r.id)))),hash(JSON.stringify(baseline.sagas)),'Historical saga digest changed');assert.equal(hash(JSON.stringify(current.steps.filter(r=>baseline.steps.some(b=>b.id===r.id)))),hash(JSON.stringify(baseline.steps)),'Historical financial-step digest changed');db.close();
const secrets=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY'].map(k=>process.env[k]).filter(Boolean),leaks=[];let checked=0;
function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())scan(file);else if(['.ts','.tsx','.js','.mjs','.json','.md','.sql','.html','.css'].includes(extname(file))){checked++;const text=readFileSync(file,'utf8');if(secrets.some(s=>text.includes(s)))leaks.push(file);}}}
for(const dir of ['src','tests','scripts','docs','product-public','merchant-public','dist'])if(existsSync(dir))scan(dir);assert.deepEqual(leaks,[],'Configured credentials leaked into files');
const result={timestamp:new Date().toISOString(),protectedFiles:required.length,changedProtectedFiles:changed,historicalSagas:baseline.sagas.length,historicalSteps:baseline.steps.length,filesScanned:checked,configuredSecretsScanned:secrets.length,leakingFiles:leaks};writeFileSync('docs/phase-5-isolation-evidence.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
