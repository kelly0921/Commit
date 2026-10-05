import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const {prepareBuildInput}=await import(pathToFileURL(resolve('deploy/render/build.mjs')).href);
function fixture(){mkdirSync('.staging',{recursive:true});const root=mkdtempSync(resolve('.staging/render-build-'));mkdirSync(join(root,'product-public'));return root;}

test('clean checkout build uses an unavailable marker and removes only its own input',()=>{
  const root=fixture(),path=join(root,'product-public/replay.json'),cleanup=prepareBuildInput(root);
  assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{available:false,localOnly:true});
  cleanup();assert.equal(existsSync(path),false);cleanup();
});

test('release preparation preserves existing local historical replay bytes',()=>{
  const root=fixture(),path=join(root,'product-public/replay.json'),original=Buffer.from('local historical receipt\n');writeFileSync(path,original);
  const cleanup=prepareBuildInput(root);assert.deepEqual(readFileSync(path),original);cleanup();assert.deepEqual(readFileSync(path),original);
});

test('release cleanup refuses to remove an input changed after preparation',()=>{
  const root=fixture(),path=join(root,'product-public/replay.json'),cleanup=prepareBuildInput(root);writeFileSync(path,'changed input');
  assert.throws(cleanup,/retained for review/);assert.equal(readFileSync(path,'utf8'),'changed input');
});
