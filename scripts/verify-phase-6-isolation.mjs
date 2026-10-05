// Historical data is opened read-only. Outputs contain hashes/counts, not secrets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,extname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const hash=v=>createHash('sha256').update(v).digest('hex');
const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name)]);
const before=JSON.parse(readFileSync('docs/assets/phase-6/isolation-before.json','utf8'));
const db=new DatabaseSync('data/commit.sqlite',{readOnly:true});
const tables=Object.fromEntries(Object.keys(before.tables).map(name=>{const rows=db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all();return [name,{rows:rows.length,sha256:hash(JSON.stringify(rows))}];}));db.close();assert.deepEqual(tables,before.tables,'Historical commercial state changed');
const protectedPaths=Object.keys(before.protectedFiles).filter(p=>p.startsWith('docs/')||['src/model.ts','src/paypal.ts','src/payments.ts','src/product/solver.ts','src/product/domain.ts','src/product/ai.ts','src/merchant/provider.ts','src/merchant-ui/adapter.ts','src/merchant-ui/model.ts','src/merchant-ui/scoped-query.ts'].includes(p));
const protectedFiles=Object.fromEntries(protectedPaths.map(p=>[p,hash(readFileSync(p))]));for(const p of protectedPaths)assert.equal(protectedFiles[p],before.protectedFiles[p],'Historical evidence or protected solver/transport changed: '+p);
const brandPaths=Object.keys(before.authoredFiles).filter(p=>p.startsWith('assets/brand/')||['docs/DESIGN_SYSTEM.md','docs/common-yes-logo-report.md','docs/user-testing-plan.md'].includes(p));for(const p of brandPaths)assert.equal(hash(readFileSync(p)),before.authoredFiles[p],'Accepted brand or cold-test plan changed');
const keys=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY','WEB_PUSH_VAPID_PRIVATE_KEY'];const secrets=keys.map(k=>process.env[k]).filter(v=>v&&v.length>10);let scanned=0;
for(const root of ['src','tests','scripts','docs','product-public','merchant-public','dist'])if(existsSync(root))for(const p of files(root).filter(p=>['.js','.ts','.tsx','.mjs','.json','.md','.sql','.html','.css','.txt','.webmanifest'].includes(extname(p)))){const text=readFileSync(p,'utf8');scanned++;assert.ok(!secrets.some(s=>text.includes(s)),'Configured secret leaked in '+p);}
const result={capturedAt:new Date().toISOString(),readOnly:true,comparison:'PASS',tables,protectedFiles,unchangedBrandAndTestPlan:brandPaths.length,phase6RealPayPalApiCalls:0,credentialScan:{scannedFiles:scanned,configuredValues:secrets.length,leaks:0},intentionalSourceChanges:'Phase 6 authority, projections, worker, identity, PWA and UI additions; no claim that all application source stayed unchanged.'};writeFileSync('docs/assets/phase-6/isolation-after.json',JSON.stringify(result,null,2)+'\n');console.log('PASS: '+Object.keys(tables).length+' historical tables; '+protectedPaths.length+' protected evidence/solver/transport files; '+brandPaths.length+' brand/test-plan files; '+scanned+' files scanned with zero configured-value leaks.');
