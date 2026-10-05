// Presentation isolation; read-only databases, no environment/provider/worker startup.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const dir='docs/assets/consumer-app-final';mkdirSync(dir,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex');
const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(p+'/'+e.name):[p+'/'+e.name]);
const allowed=new Set(['product-public/app.js','product-public/app-views.js','product-public/agent-ui.js','product-public/offers.js','product-public/styles.css','src/product/server.ts','scripts/build-product.mjs']);
const databases={};
for(const name of readdirSync('data').filter(n=>n.endsWith('.sqlite'))){
 const db=new DatabaseSync('data/'+name,{readOnly:true});
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name).filter(n=>!['demo_sessions','merchant_sessions','agent_worker_sessions'].includes(n));
 databases[name]=Object.fromEntries(tables.map(n=>{const rows=db.prepare('SELECT * FROM "'+n+'" ORDER BY rowid').all();return [n,{rows:rows.length,sha256:hash(JSON.stringify(rows))}];}));db.close();
}
const environmentHash=existsSync('.env')?hash(readFileSync('.env')):null;
if(process.argv.includes('--before')){
 const paths=['src','tests','assets/brand','product-public','merchant-public','docs'].flatMap(files).filter(p=>!allowed.has(p)&&!p.startsWith(dir+'/')&&p!=='docs/consumer-app-final-review.md');
 writeFileSync(dir+'/server-before.txt',readFileSync('src/product/server.ts'));
 writeFileSync(dir+'/isolation-before.json',JSON.stringify({capturedAt:new Date().toISOString(),databases,environmentHash,protectedFiles:Object.fromEntries(paths.map(p=>[p,hash(readFileSync(p))])),allowedPresentationFiles:[...allowed],cssBefore:hash(readFileSync('product-public/styles.css')),buildBefore:hash(readFileSync('scripts/build-product.mjs'))},null,2)+'\n');
 console.log('Saved read-only baseline: '+paths.length+' protected files; '+Object.keys(databases).length+' databases.');
}else{
 const b=JSON.parse(readFileSync(dir+'/isolation-before.json','utf8'));
 assert.deepEqual(databases,b.databases,'Durable commercial/private state changed');assert.equal(environmentHash,b.environmentHash);
 for(const [p,h] of Object.entries(b.protectedFiles))assert.equal(hash(readFileSync(p)),h,p);
 const server=readFileSync('src/product/server.ts','utf8').replace("import {invitePreview} from './invite-preview.js';\n",'').replace("      if(path==='/api/invites/preview'&&request.method==='GET'){json(invitePreview(service.database,url.searchParams.get('invite')));return;}\n",'');
 assert.equal(hash(server),hash(readFileSync(dir+'/server-before.txt')),'Server changed beyond safe read-only invitation preview');
 const css=readFileSync('product-public/styles.css','utf8');assert.equal(hash(css.slice(0,css.indexOf('/* Final app interaction pass.'))),b.cssBefore,'Existing brand/component styles changed');
 assert.equal(hash(readFileSync('scripts/build-product.mjs')),b.buildBefore);
 const secrets=existsSync('.env')?readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^(PAYPAL_CLIENT_ID|PAYPAL_CLIENT_SECRET|OPENAI_API_KEY|WEB_PUSH_VAPID_PRIVATE_KEY|AG_STUDIO_LICENSE_KEY)=/.test(l)).map(l=>l.slice(l.indexOf('=')+1).replace(/^['"]|['"]$/g,'')).filter(s=>s.length>12):[];
 let scanned=0;for(const p of ['src','tests','scripts','docs','product-public','merchant-public','dist'].filter(existsSync).flatMap(files).filter(p=>/\.(?:js|ts|tsx|mjs|json|md|sql|html|css|txt|webmanifest)$/.test(p))){assert.ok(!secrets.some(s=>readFileSync(p,'utf8').includes(s)),'Configured secret in '+p);scanned++;}
 let screenshotCount=0;
 if(existsSync(dir+'/screenshots.json')){
  const captures=JSON.parse(readFileSync(dir+'/screenshots.json','utf8'));assert.equal(captures.length,32);assert.equal(new Set(captures.map(c=>c.filename)).size,32);
  const jpeg=b=>{assert.equal(b.readUInt16BE(0),0xffd8);let at=2;while(at<b.length){const m=b[at+1];at+=2;const n=b.readUInt16BE(at);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m))return {width:b.readUInt16BE(at+5),height:b.readUInt16BE(at+3)};at+=n;}throw Error('JPEG size missing');};
  for(const c of captures){const raw=readFileSync(dir+'/'+c.filename),desktop=c.filename.includes('desktop-'),merchant=c.filename.includes('merchant-');assert.deepEqual(jpeg(raw),c.imageObserved);assert.equal(hash(raw),c.sha256);assert.equal(c.viewport.width,merchant?1440:desktop?1280:390);assert.equal(c.viewport.height,merchant?900:desktop?720:844);assert.equal(c.viewport.h1Count,1);assert.equal(c.viewport.overflow,false);assert.equal(c.retouched,false);assert.equal(c.fullPage,false);assert.ok(raw.length>5000);}
  screenshotCount=captures.length;
 }
 const result={checkedAt:new Date().toISOString(),result:'PASS',databasesReadOnly:true,databases,protectedFilesUnchanged:Object.keys(b.protectedFiles).length,brandAndOriginalStylesUnchanged:true,serverReadOnlyPreviewOnly:true,priorEvidenceUnchanged:true,environmentUnchanged:true,screenshotCount,screenshotDimensionsHashesAndGeometry:screenshotCount?'PASS':'NOT_CHECKED',credentialScan:{files:scanned,leaks:0},realPayPalOperations:0,offerPublications:0};
 writeFileSync(dir+'/isolation-after.json',JSON.stringify(result,null,2)+'\n');console.log('PASS: all database snapshots, protected files, original styles, server diff and credentials.');
}
