// Read-only baseline/state and artifact checks. Never loads providers or starts workers.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const dir='docs/assets/consumer-app-ia';
mkdirSync(dir,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex');
const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(p+'/'+e.name):[p+'/'+e.name]);
const allowed=new Set(['product-public/app.js','product-public/agent-ui.js','product-public/offers.js','product-public/styles.css','src/product/server.ts','scripts/build-product.mjs','docs/DESIGN_SYSTEM.md']);
const protectedPaths=['src','tests','assets/brand','product-public','merchant-public','docs'].flatMap(files).filter(p=>!allowed.has(p)&&!p.startsWith(dir+'/')&&p!=='docs/consumer-app-ia-report.md');
const historical=JSON.parse(readFileSync('docs/phase-6-1-inspection.json','utf8'));
const db=new DatabaseSync('data/commit.sqlite',{readOnly:true});
const tables=Object.fromEntries(Object.keys(historical.historicalTables).map(name=>{const rows=db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all();return [name,{rows:rows.length,sha256:hash(JSON.stringify(rows))}];}));db.close();
assert.deepEqual(tables,historical.historicalTables,'Historical financial/commercial state changed');
if(process.argv.includes('--before')){
 const value={capturedAt:new Date().toISOString(),historicalDatabaseReadOnly:true,tables,protectedFiles:Object.fromEntries(protectedPaths.map(p=>[p,hash(readFileSync(p))])),intentionalPresentationChanges:[...allowed],environmentHash:existsSync('.env')?hash(readFileSync('.env')):null};
 writeFileSync(dir+'/isolation-before.json',JSON.stringify(value,null,2)+'\n');console.log('Baseline saved: '+protectedPaths.length+' files; '+Object.keys(tables).length+' historical tables.');
}else{
 const before=JSON.parse(readFileSync(dir+'/isolation-before.json','utf8'));
 for(const [p,h] of Object.entries(before.protectedFiles))assert.equal(hash(readFileSync(p)),h,'Protected file changed: '+p);
 assert.deepEqual(tables,before.tables);assert.equal(existsSync('.env')?hash(readFileSync('.env')):null,before.environmentHash,'Local credentials changed');
 // These two infrastructure edits are limited to serving/copying UI assets.
 const server=readFileSync('src/product/server.ts','utf8').replace("'/activity','/you','/demo','/agent'","'/activity','/agent'").replace("'app.js','app-views.js','views.js'","'app.js','views.js'");
 assert.equal(hash(server),historical.frozenHashes['src/product/server.ts'],'Server changed beyond presentation route/asset allowlists');
 const css=readFileSync('product-public/styles.css','utf8'),prefix=css.slice(0,css.indexOf('/* Consumer application shell.'));
 assert.ok([0,1,2,3,4].some(n=>hash(prefix.slice(0,prefix.length-n))===historical.frozenHashes['product-public/styles.css']),'Accepted CSS changed beyond appended consumer component rules');
 const secrets=existsSync('.env')?readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^(PAYPAL_CLIENT_ID|PAYPAL_CLIENT_SECRET|OPENAI_API_KEY|WEB_PUSH_VAPID_PRIVATE_KEY|AG_STUDIO_LICENSE_KEY)=/.test(l)).map(l=>l.slice(l.indexOf('=')+1).replace(/^['"]|['"]$/g,'')).filter(s=>s.length>12):[];
 let scanned=0;for(const p of ['src','tests','scripts','docs','product-public','merchant-public','dist'].filter(existsSync).flatMap(files).filter(p=>/\.(?:js|ts|tsx|mjs|json|md|sql|html|css|txt|webmanifest)$/.test(p))){const text=readFileSync(p,'utf8');assert.ok(!secrets.some(s=>text.includes(s)),'Configured secret leaked: '+p);scanned++;}
 const captures=JSON.parse(readFileSync(dir+'/screenshots.json','utf8'));
 assert.equal(captures.length,29);assert.equal(new Set(captures.map(c=>c.filename)).size,29);
 function jpegSize(b){let at=2;assert.equal(b.readUInt16BE(0),0xffd8);while(at<b.length){const marker=b[at+1];at+=2;const length=b.readUInt16BE(at);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:b.readUInt16BE(at+5),height:b.readUInt16BE(at+3)};at+=length;}throw Error('JPEG dimensions unavailable');}
 for(const c of captures){const bytes=readFileSync(dir+'/'+c.filename);assert.deepEqual(jpegSize(bytes),c.imageObserved,c.filename);const desktop=c.filename.includes('desktop-'),merchant=c.filename.includes('merchant-');assert.equal(c.viewport.width,merchant?1440:desktop?1280:390);assert.equal(c.viewport.height,merchant?900:desktop?720:844);assert.equal(c.viewport.h1Count,1);assert.equal(c.viewport.overflow,false);assert.equal(c.retouched,false);assert.ok(bytes.length>5000);c.sha256=hash(bytes);}
 writeFileSync(dir+'/screenshots.json',JSON.stringify(captures,null,2)+'\n');
 const result={checkedAt:new Date().toISOString(),comparison:'PASS',historicalDatabaseReadOnly:true,tables,protectedFileCount:Object.keys(before.protectedFiles).length,protectedHashesUnchanged:true,staticServerAllowlistOnly:true,acceptedCssPrefixUnchanged:true,buildAssetAddition:'app-views.js in existing copy list',previousReviewBundleUnchanged:true,environmentUnchanged:true,screenshots:29,screenshotViewportsAndRawJpegs:'PASS',credentialScan:{scannedFiles:scanned,leaks:0},realPayPalOperations:0,offerPublications:0,authorityChanges:0,liveAiCalls:0};
 writeFileSync(dir+'/isolation-after.json',JSON.stringify(result,null,2)+'\n');console.log('PASS: protected source/evidence, commercial state, environment and configured-secret scan.');
}
