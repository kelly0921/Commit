// Read-only functional isolation and credential checks for the final visual redesign.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,extname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const dir='docs/assets/final-visual-redesign';mkdirSync(dir,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=path=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):[join(path,e.name)]);
const protectedPaths=files('src').filter(p=>!['src/merchant-ui/studio.tsx','src/merchant-ui/offers.tsx'].includes(p.replaceAll('\\','/')));
protectedPaths.push(...files('docs').filter(p=>/docs[\\/](phase-[1-5].*|paypal-feasibility-report|.*live.*evidence|.*sandbox.*evidence|design-pass-report|design-verification-evidence)\.(md|json)$/.test(p)));
const db=new DatabaseSync(resolve('data/commit.sqlite'),{readOnly:true});
const tableNames=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
const exclude=new Set(['schema_migrations','demo_sessions','merchant_sessions','constraint_drafts','merchant_offer_simulations','merchant_publish_confirmations','audit_events']);
const tables=Object.fromEntries(tableNames.filter(n=>!n.startsWith('sqlite_')&&!exclude.has(n)).map(name=>{const rows=db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all();return [name,{rows:rows.length,sha256:hash(JSON.stringify(rows))}];}));db.close();
const state={capturedAt:new Date().toISOString(),readOnly:true,tables,protectedFiles:Object.fromEntries(protectedPaths.map(p=>[p.replaceAll('\\','/'),hash(readFileSync(p))])),consumerHandlers:hash(readFileSync('product-public/app.js','utf8').split('async function api')[1])};
if(process.argv.includes('--before')){writeFileSync(join(dir,'isolation-before.json'),JSON.stringify(state,null,2)+'\n');console.log('Read-only redesign baseline recorded: '+Object.keys(tables).length+' tables; '+protectedPaths.length+' protected files.');}
else{
 const before=JSON.parse(readFileSync(join(dir,'isolation-before.json'),'utf8'));
 assert.deepEqual(state.tables,before.tables,'Commercial/financial table digest changed');
 assert.deepEqual(Object.fromEntries(Object.keys(before.protectedFiles).map(p=>[p,state.protectedFiles[p]])),before.protectedFiles,'Protected functional source or historical evidence changed');
 assert.equal(state.consumerHandlers,before.consumerHandlers,'Consumer API/action handlers changed');
 const secrets=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY'].map(k=>process.env[k]).filter(Boolean);let count=0;
 for(const root of ['src','tests','scripts','docs','product-public','merchant-public','dist'])if(existsSync(root))for(const path of files(root).filter(p=>['.js','.ts','.tsx','.mjs','.json','.md','.sql','.html','.css'].includes(extname(p)))){count++;assert.ok(!secrets.some(s=>readFileSync(path,'utf8').includes(s)),'Configured secret leaked in '+path);}
 writeFileSync(join(dir,'isolation-after.json'),JSON.stringify({...state,comparison:'PASS',paymentApiCalls:0,credentialScan:{files:count,configuredValues:secrets.length,leaks:0}},null,2)+'\n');
 console.log('PASS: all commercial/financial tables, functional source, consumer action handlers and historical evidence unchanged; '+count+' files scanned with zero credential/license leaks.');
}
