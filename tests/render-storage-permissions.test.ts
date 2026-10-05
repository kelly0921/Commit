import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,lstatSync,realpathSync,chmodSync,mkdirSync,accessSync,mkdtempSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
const {prepareStorage}=await import(new URL('../deploy/render/config.mjs',import.meta.url).href);
const {startupFailureRecord}=await import(new URL('../deploy/render/diagnostics.mjs',import.meta.url).href);
function fixture(){mkdirSync('.staging',{recursive:true});const root=mkdtempSync(resolve('.staging/render-local-permissions-'));return {root,database:join(root,'staging.sqlite'),localVerification:true};}
function filesystem(config:any,owner=0){
  const changed:{path:string;mode:number}[]=[],accessed:{path:string;mode:number}[]=[];
  const fs={existsSync,realpathSync:(path:string)=>realpathSync(path),mkdirSync,geteuid:()=>1000,lstatSync:(path:string)=>Object.assign(lstatSync(path),{uid:path===config.root?owner:1000}),chmodSync:(path:string,mode:number)=>{if(path===config.root&&owner!==1000)throw Object.assign(new Error('synthetic private mount error'),{code:'EPERM'});changed.push({path,mode});chmodSync(path,mode);},accessSync:(path:string,mode:number)=>{accessed.push({path,mode});accessSync(path,mode);}};
  return {fs,changed,accessed};
}
function fails(stage:string,reason:string){return (error:unknown)=>{assert.deepEqual(startupFailureRecord(error),{event:'render_start_failed',stage,reason});return true;};}

test('writable provider-owned mount prepares private storage without chmod on its root',()=>{
  const config=fixture(),f=filesystem(config);prepareStorage(config,f.fs);
  assert.equal(f.changed.some(item=>item.path===config.root),false);
  assert.deepEqual(f.accessed,[{path:config.root,mode:constants.R_OK|constants.W_OK|constants.X_OK}]);
  assert.deepEqual(f.changed.map(item=>item.path),['runtime','tmp','backups'].map(name=>join(config.root,name)));
  assert.ok(f.changed.every(item=>item.mode===0o700));assert.equal(existsSync(config.database),false);
});

test('application-owned root and private directories retain mandatory hardening',()=>{
  const config=fixture(),f=filesystem(config,1000);prepareStorage(config,f.fs);
  assert.deepEqual(f.changed.map(item=>item.path),[config.root,...['runtime','tmp','backups'].map(name=>join(config.root,name))]);assert.ok(f.changed.every(item=>item.mode===0o700));
});

test('unwritable managed mount is refused with a safe access-stage reason',()=>{
  const config=fixture(),f=filesystem(config);f.fs.accessSync=()=>{throw Object.assign(new Error('synthetic secret /private/path'),{code:'EACCES'});};
  assert.throws(()=>prepareStorage(config,f.fs),fails('storage_access','permission_denied'));assert.deepEqual(f.changed,[]);assert.equal(existsSync(join(config.root,'runtime')),false);
});

test('owned-root permission failure is not silently ignored',()=>{
  const config=fixture(),f=filesystem(config,1000);f.fs.chmodSync=()=>{throw Object.assign(new Error('synthetic private error'),{code:'EPERM'});};
  assert.throws(()=>prepareStorage(config,f.fs),fails('storage_root_permissions','permission_denied'));
});

test('private-directory permission failure remains fatal and identifies the directory',()=>{
  const config=fixture(),f=filesystem(config);f.fs.chmodSync=()=>{throw Object.assign(new Error('synthetic private error'),{code:'EACCES'});};
  assert.throws(()=>prepareStorage(config,f.fs),fails('storage_runtime_directory','permission_denied'));assert.equal(existsSync(config.database),false);
});

test('foreign-owned application directory is refused before changing its mode',()=>{
  const config=fixture(),f=filesystem(config);const stat=f.fs.lstatSync;f.fs.lstatSync=(path:string)=>Object.assign(stat(path),{uid:0});
  assert.throws(()=>prepareStorage(config,f.fs),fails('storage_runtime_directory','invalid_storage_owner'));assert.deepEqual(f.changed,[]);
});

test('private directory symlinks and alternate resolved paths remain blocked',()=>{
  const config=fixture(),f=filesystem(config);const real=f.fs.realpathSync;f.fs.realpathSync=(path:any)=>path===join(config.root,'runtime')?resolve('.staging/other-root'):real(path);
  assert.throws(()=>prepareStorage(config,f.fs),fails('storage_runtime_directory','unsafe_storage_path'));assert.deepEqual(f.changed,[]);assert.equal(existsSync(config.database),false);
});
